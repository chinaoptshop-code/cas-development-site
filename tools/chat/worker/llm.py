"""Моделі для відповіді: local (Ollama на Mac mini, типово) і api (Anthropic API — ПЛАТНИЙ, лише якщо явно CHAT_LLM=api).

Рішення власника 23.11.2026: «нічого платного зараз» — тому типово local; api не вмикається сам навіть за наявності ключа.
Ключ api — як у бота (tools/assistant/bot/bot.py, api_key()): ~/jarvis/projects/quiz/.env (ANTHROPIC_API_KEY=…) або змінна оточення.
Якщо api не відповів — пробуємо local. Обидві реалізації: complete(system, user, json_mode) → текст або None.
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

    def __init__(self, model="claude-sonnet-5", fallback=None, timeout=90):
        self.model, self.fallback, self.timeout = model, fallback, timeout

    def available(self):
        return bool(api_key()) or bool(self.fallback and self.fallback.available())

    def complete(self, system, user, json_mode=False, max_tokens=700):
        key = api_key()
        if key:
            try:
                body = {"model": self.model, "max_tokens": max_tokens, "system": system,
                        "messages": [{"role": "user", "content": user + ("\nВідповідь — лише JSON-обʼєкт." if json_mode else "")}]}
                req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                             headers={"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    d = json.load(r)
                text = "".join(c.get("text", "") for c in d.get("content", []) if c.get("type") == "text").strip()
                if text:
                    return text
            except Exception:
                pass
        return self.fallback.complete(system, user, json_mode, max_tokens) if self.fallback else None


def backend(cfg):
    local = Local(cfg.get("CHAT_MODEL") or "qwen3:8b", timeout=cfg.num("CHAT_LLM_TIMEOUT", 240))
    if (cfg.get("CHAT_LLM") or "local").lower() == "api":
        return Api(cfg.get("CHAT_API_MODEL") or "claude-sonnet-5", fallback=local)
    return local


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
