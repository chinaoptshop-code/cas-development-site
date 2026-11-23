"""Моделі для відповіді: local (Ollama на Mac mini, типово) і api (Anthropic API — ПЛАТНИЙ, лише якщо явно CHAT_LLM=api).

Рішення власника 23.11.2026: «нічого платного зараз» — тому типово local; api не вмикається сам навіть за наявності ключа.
Ключ api — як у бота (tools/assistant/bot/bot.py, api_key()): ~/jarvis/projects/quiz/.env (ANTHROPIC_API_KEY=…) або змінна оточення.
Якщо api не відповів — пробуємо local. Обидві реалізації: complete(system, user, json_mode) → текст або None.

Ліміти (Михайло 23.11.2026, config.LIMITS, облік — usage.py): backend() повертає Metered — він перед кожним викликом перевіряє
добовий і по-розмовний бюджет: api → (стеля api вичерпана) local → (і local вичерпано) None + exhausted() → воркер шле handoff limit
(сайт показує «Далі відповість менеджер…»). CHAT_LLM=api без CHAT_API_DAY_TOKENS — api не вмикається (попередження в журналі), лише local.
"""
import json
import os
import pathlib
import urllib.request

import ollama

API_ENV = pathlib.Path.home() / "jarvis/projects/quiz/.env"


class Local:
    name = "local"

    def __init__(self, model="qwen3:8b", timeout=240):
        self.model, self.timeout = model, timeout

    def available(self):
        t = ollama.tags()
        return t is not None and any(n == self.model or n.split(":")[0] == self.model.split(":")[0] for n in t)

    def complete(self, system, user, json_mode=False, max_tokens=700):
        msgs = [{"role": "system", "content": system}, {"role": "user", "content": user + "\n/no_think"}]
        return ollama.chat(self.model, msgs, fmt="json" if json_mode else None, timeout=self.timeout, max_tokens=max_tokens)


def api_key():
    try:
        for line in API_ENV.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return os.environ.get("ANTHROPIC_API_KEY", "")


class Api:
    name = "api"

    def __init__(self, model="claude-sonnet-5", fallback=None, timeout=90, meter=None):
        self.model, self.fallback, self.timeout, self.meter = model, fallback, timeout, meter

    def available(self):
        return bool(api_key()) or bool(self.fallback and self.fallback.available())

    def complete(self, system, user, json_mode=False, max_tokens=700):
        key = api_key()
        if key:
            import time
            t0 = time.monotonic()
            try:
                body = {"model": self.model, "max_tokens": max_tokens, "system": system,
                        "messages": [{"role": "user", "content": user + ("\nВідповідь — лише JSON-обʼєкт." if json_mode else "")}]}
                req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                             headers={"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    d = json.load(r)
                text = "".join(c.get("text", "") for c in d.get("content", []) if c.get("type") == "text").strip()
                u = d.get("usage") or {}
                tok = int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0) + int(u.get("cache_creation_input_tokens") or 0)
                if self.meter:
                    self.meter("api", tokens=tok or int((len(system) + len(user) + len(text)) / 3.5) + 1, seconds=time.monotonic() - t0)
                if text:
                    return text
            except Exception:
                if self.meter:   # невдала спроба теж могла коштувати — рахуємо вхід за символами
                    self.meter("api", tokens=int((len(system) + len(user)) / 3.5) + 1, seconds=time.monotonic() - t0)
        return self.fallback.complete(system, user, json_mode, max_tokens) if self.fallback else None


class Metered:
    """Бекенд із бюджетом: complete() як у Local/Api; exhausted() — чому моделі вже не можна (None — можна)."""

    def __init__(self, local, usage, lim, api=None, log=None):
        self.local, self.usage, self.lim, self.api, self.log = local, usage, lim, api, log or (lambda *a: None)
        self.name = "api" if api else "local"
        self.model = getattr(api or local, "model", "")
        self._warned = set()

    def _warn(self, key, *a):
        if key not in self._warned:
            self._warned.add(key); self.log(*a)

    def api_ok(self):
        if not self.api:
            return False
        day, conv = self.usage.today()["api"]["tokens"], self.usage.conv()
        if day >= self.lim["CHAT_API_DAY_TOKENS"]:
            self._warn("api_day", "ліміт: добова стеля API", day, "токенів — далі локальна модель"); return False
        if conv.get("api_tokens", 0) >= self.lim["CHAT_API_CONV_TOKENS"]:
            return False
        return True

    def local_ok(self):
        d = self.usage.today()["local"]
        if d["calls"] >= self.lim["CHAT_LOCAL_DAY_CALLS"] or d["seconds"] >= self.lim["CHAT_LOCAL_DAY_SECONDS"]:
            self._warn("local_day", "ліміт: добова стеля локальної моделі", d["calls"], "викликів,", int(d["seconds"]), "с"); return False
        return True

    def exhausted(self):
        """None — модель ще можна; інакше коротко чому (для reason у handoff limit)."""
        if self.usage.conv().get("tokens", 0) >= self.lim["CHAT_CONV_TOKENS"]:
            return f"бюджет розмови вичерпано (~{self.lim['CHAT_CONV_TOKENS']} токенів)"
        if self.api_ok() or self.local_ok():
            return None
        return "добовий бюджет моделі вичерпано"

    def available(self):
        return (bool(self.api) and self.api_ok() and self.api.available()) or self.local.available()

    def complete(self, system, user, json_mode=False, max_tokens=700):
        if self.exhausted():
            return None
        if self.api_ok():
            out = self.api.complete(system, user, json_mode, max_tokens)
            if out:
                return out
        return self.local.complete(system, user, json_mode, max_tokens) if self.local_ok() else None


def backend(cfg, usage=None, log=None):
    import config
    import ollama
    from usage import Usage
    log = log or (lambda *a: None)
    usage = usage or Usage()
    ollama.METER = usage.record          # кожен виклик Ollama (текст і vision) — у облік
    lim = config.limits(cfg)
    local = Local(cfg.get("CHAT_MODEL") or "qwen3:8b", timeout=cfg.num("CHAT_LLM_TIMEOUT", 240))
    api = None
    if (cfg.get("CHAT_LLM") or "local").lower() == "api":
        if lim["CHAT_API_DAY_TOKENS"] is None:
            log("УВАГА: CHAT_LLM=api без CHAT_API_DAY_TOKENS — платний API не вмикаємо, працює локальна модель (README.md, «Ліміти»)")
        else:
            api = Api(cfg.get("CHAT_API_MODEL") or "claude-sonnet-5", fallback=None, meter=usage.record)
    return Metered(local, usage, lim, api=api, log=log)


def parse_json(text):
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        s = s.strip("`").split("\n", 1)[-1]
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b <= a:
        return None
    try:
        d = json.loads(s[a:b + 1])
        return d if isinstance(d, dict) else None
    except ValueError:
        return None
