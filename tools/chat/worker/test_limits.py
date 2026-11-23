"""Ліміти воркера (Михайло 23.11.2026): облік витрат (usage.py), стелі бекендів (llm.Metered), голос ≤ 2 на розмову, обрізання запиту, --usage.
  python3 -m unittest discover -s tools/chat/worker -p 'test_*.py'
"""
import datetime
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import config  # noqa: E402
import llm  # noqa: E402
import ollama  # noqa: E402
import run  # noqa: E402
from brain import Brain  # noqa: E402
from config import Config  # noqa: E402
from fakeollama import FakeOllama  # noqa: E402
from test_brain import NOW, FakeLLM, conv  # noqa: E402
from usage import KYIV, Usage  # noqa: E402


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


class FakeBackend:
    """Локальна або платна модель: кожен виклик — запис у облік (як ollama.METER / Api.meter)."""

    def __init__(self, name, usage, reply="ok", tokens=100, up=True):
        self.name, self.usage, self.reply, self.tokens, self.up, self.calls = name, usage, reply, tokens, up, 0

    def available(self):
        return self.up

    def complete(self, system, user, json_mode=False, max_tokens=700):
        self.calls += 1
        self.usage.record(self.name, tokens=self.tokens, seconds=2)
        return self.reply


def lim(**kw):
    return config.limits(Config(env={k: str(v) for k, v in kw.items()}, files=[]))


class UsageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.tmp.name) / "usage.json"
        self.clock = Clock(datetime.datetime(2026, 11, 23, 23, 50, tzinfo=KYIV))

    def tearDown(self):
        self.tmp.cleanup()

    def test_record_per_day_and_conversation_persists(self):
        u = Usage(self.path, now=self.clock)
        with u.bind("abcdef0123456789"):
            u.record("local", tokens=500, seconds=3.2)
            u.record("api", tokens=1200, seconds=1.0)
        u.record("local", tokens=10, seconds=0.1)        # без розмови (напр., самоперевірка)
        d = Usage(self.path, now=self.clock).today()     # новий процес читає той самий файл
        self.assertEqual(d["local"]["calls"], 2); self.assertEqual(d["local"]["tokens"], 510)
        self.assertEqual(d["api"]["tokens"], 1200)
        self.assertEqual(d["convs"]["abcdef01"], {"calls": 2, "tokens": 1700, "api_tokens": 1200, "seconds": 4.2})
        self.assertNotIn("abcdef0123456789", self.path.read_text(), "у файлі — лише 8 знаків sid")

    def test_reset_at_kyiv_midnight(self):
        u = Usage(self.path, now=self.clock)
        u.record("local", tokens=999, seconds=100)
        self.clock.t = datetime.datetime(2026, 11, 24, 0, 1, tzinfo=KYIV)
        d = u.today()
        self.assertEqual((d["day"], d["local"]["calls"], d["convs"]), ("2026-11-24", 0, {}))


class MeteredTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.u = Usage(pathlib.Path(self.tmp.name) / "u.json", now=lambda: NOW)
        self.log = []

    def tearDown(self):
        self.tmp.cleanup()

    def metered(self, api=True, **kw):
        L = lim(**{"CHAT_API_DAY_TOKENS": 1000, "CHAT_API_CONV_TOKENS": 1000, "CHAT_LOCAL_DAY_CALLS": 50, "CHAT_CONV_TOKENS": 100000, **kw})
        self.local = FakeBackend("local", self.u, "local")
        self.api = FakeBackend("api", self.u, "api", tokens=400) if api else None
        return llm.Metered(self.local, self.u, L, api=self.api, log=lambda *a: self.log.append(" ".join(map(str, a))))

    def test_api_then_local_then_exhausted(self):
        m = self.metered()
        with self.u.bind("s1"):
            self.assertEqual([m.complete("s", "u") for _ in range(3)], ["api", "api", "api"])   # 0 → 400 → 800 → 1200 токенів
            self.assertEqual(m.complete("s", "u"), "local", "добова стеля API → локальна модель")
            self.assertTrue(any("добова стеля API" in x for x in self.log))
            self.assertIsNone(m.exhausted())
            for _ in range(60):
                m.complete("s", "u")
            self.assertEqual(self.local.calls, 50 - 0, "не більше CHAT_LOCAL_DAY_CALLS викликів")
            self.assertIsNone(m.complete("s", "u"))
            self.assertEqual(m.exhausted(), "добовий бюджет моделі вичерпано")

    def test_conversation_budget(self):
        m = self.metered(api=False, CHAT_CONV_TOKENS=2000)
        with self.u.bind("talky"):
            while m.complete("s", "u"):
                pass
            self.assertIn("бюджет розмови", m.exhausted())
        with self.u.bind("other"):
            self.assertIsNone(m.exhausted(), "інша розмова — свій бюджет")
            self.assertEqual(m.complete("s", "u"), "local")

    def test_api_without_day_cap_falls_back_to_local(self):
        log = []
        b = llm.backend(Config(env={"CHAT_LLM": "api"}, files=[]), usage=self.u, log=lambda *a: log.append(" ".join(map(str, a))))
        self.assertIsNone(b.api); self.assertEqual(b.name, "local")
        self.assertTrue(any("CHAT_API_DAY_TOKENS" in x for x in log))
        b2 = llm.backend(Config(env={"CHAT_LLM": "api", "CHAT_API_DAY_TOKENS": "200000"}, files=[]), usage=self.u)
        self.assertIsNotNone(b2.api); self.assertEqual(b2.name, "api")
        self.assertEqual(ollama.METER, self.u.record, "Ollama (і vision) — у облік")
        ollama.METER = None

    def test_ollama_meter_counts_tokens_and_failures(self):
        seen = []
        srv = FakeOllama("Привіт")
        try:
            with mock.patch.dict(os.environ, {"CHAT_OLLAMA_URL": srv.url}):
                ollama.METER = lambda b, tokens=0, seconds=0.0, calls=1: seen.append((b, tokens))
                self.assertEqual(ollama.chat("qwen3:8b", [{"role": "user", "content": "x" * 350}]), "Привіт")
            with mock.patch.dict(os.environ, {"CHAT_OLLAMA_URL": "http://127.0.0.1:9"}):
                self.assertIsNone(ollama.chat("qwen3:8b", [{"role": "user", "content": "y" * 35}], timeout=2))
        finally:
            ollama.METER = None; srv.close()
        self.assertEqual([b for b, _ in seen], ["local", "local"], "невдалий виклик теж рахується")
        self.assertGreater(seen[0][1], 100)


class BrainLimitTests(unittest.TestCase):
    def brain(self, llm_=None, voice=None, **cfg):
        audio = {"kind": "audio", "type": "голосове", "ok": True, "summary": "", "text": "", "transcript": "ремонт квартири 60 м² у Києві",
                 "warnings": [], "area_m2": None, "numbers": {}, "manager": False, "important": False}
        self.fetched = []
        return Brain(Config(env={"CHAT_CALENDAR": "off", **cfg}, files=[]), llm=llm_, voice=voice, calendar=False,
                     analyze=lambda d, m, l, timeout=60: {**audio, "name": m["name"]}, now=lambda: NOW)

    def voice_conv(self, n_audio=0, budget=None):
        f = {"id": "v1", "name": "voice-1.webm", "kind": "audio", "size": 10}
        hist = [{"id": i, "role": "bot", "text": "Відповідь", "audio": {"id": "a" * 24, "mime": "audio/ogg"}} for i in range(n_audio)]
        c = conv("", files=[f], history=hist)
        if budget is not None:
            c["budget"] = budget
        return c

    def test_voice_only_twice_per_conversation(self):
        said = []
        v = lambda text, lang: said.append(text) or {"mime": "audio/ogg", "data": "T2dnUw==", "dur": 3}  # noqa: E731
        b = self.brain(FakeLLM(), voice=v)
        fetch = lambda f: b"OggS"  # noqa: E731
        self.assertIsNotNone(b.respond(self.voice_conv(0), fetch).audio)
        self.assertIsNotNone(b.respond(self.voice_conv(1), fetch).audio)
        o = b.respond(self.voice_conv(2), fetch)
        self.assertIsNone(o.audio, "третє голосове — лише текстом"); self.assertTrue(o.text)
        self.assertIsNone(b.respond(self.voice_conv(0, budget={"voice_left": 0}), fetch).audio, "залишок сайту (budget) — теж межа")
        self.assertIsNone(self.brain(FakeLLM(), voice=v, CHAT_VOICE_PER_CONV="0").respond(self.voice_conv(0), fetch).audio)
        self.assertEqual(len(said), 2)

    def test_exhausted_budget_handoff_limit_without_spending(self):
        class Spent(FakeLLM):
            def exhausted(self):
                return "добовий бюджет моделі вичерпано"
        m = Spent()
        b = self.brain(m)
        o = b.respond(self.voice_conv(0), fetch=lambda f: self.fail("файли не розбираємо, коли бюджет вичерпано"))
        self.assertEqual((o.handoff, o.text, o.audio), ("limit", "", None))
        self.assertIn("бюджет", o.reason); self.assertEqual(m.calls, [], "модель не викликали")

    def test_failed_attempts_are_counted_and_one_regeneration(self):
        tmp = tempfile.TemporaryDirectory()
        u = Usage(pathlib.Path(tmp.name) / "u.json", now=lambda: NOW)
        bad = "This is an English answer about interior design services and nothing else."
        inner = FakeLLM(reply=[bad, bad, "третя"])   # обидві спроби не тією мовою — не проходять перевірку

        class Counted:
            usage = u

            def available(self):
                return True

            def complete(self, s, us, json_mode=False, max_tokens=700):
                u.record("local", tokens=10, seconds=1)
                return inner.complete(s, us, json_mode, max_tokens)
        b = self.brain(Counted())
        with u.bind("cnt"):
            o = b.respond(conv("Розкажіть про дизайн"), fetch=lambda f: b"")
        replies = [c for c in inner.calls if "Твоє завдання" not in c[0]]
        self.assertEqual(len(replies), 2, "не більше однієї перегенерації")
        self.assertEqual(u.conv("cnt")["calls"], len(inner.calls), "кожна спроба, і невдала, — у бюджеті")
        self.assertEqual(o.handoff, "complex")
        tmp.cleanup()

    def test_prompt_trimmed(self):
        b = self.brain(FakeLLM(), CHAT_HISTORY_CHARS="1000", CHAT_PASSPORT_CHARS="200", CHAT_PASSPORTS="1")
        hist = [{"role": "user" if i % 2 else "bot", "text": "Довга репліка " * 30} for i in range(20)]
        lines = b.conv_lines(hist, [{"text": "Нове питання", "files": []}], [], b.lim["CHAT_HISTORY_LINES"], b.lim["CHAT_HISTORY_CHARS"])
        self.assertLessEqual(sum(len(x) for x in lines), 1000)
        self.assertTrue(lines[-1].startswith("Клієнт (нове): Нове питання"), "нове повідомлення лишається")
        pp = b.prompt_passports([{"name": "a", "text": "x" * 5000}, {"name": "b", "text": "y"}])
        self.assertEqual((len(pp), len(pp[0]["text"])), (1, 200))

    def test_limits_bounds(self):
        L = lim(CHAT_MAX_TOKENS="999999", CHAT_VOICE_PER_CONV="-3", CHAT_HISTORY_LINES="abc")
        self.assertEqual((L["CHAT_MAX_TOKENS"], L["CHAT_VOICE_PER_CONV"], L["CHAT_HISTORY_LINES"]), (2000, 0, 12))
        self.assertIsNone(L["CHAT_API_DAY_TOKENS"])


class RunUsageTests(unittest.TestCase):
    def test_usage_report_and_selftest_limits(self):
        with tempfile.TemporaryDirectory() as d:
            u = Usage(pathlib.Path(d) / "u.json", now=lambda: datetime.datetime.now(KYIV))
            with u.bind("deadbeefcafe"):
                u.record("local", tokens=321, seconds=12)
            txt = run.usage_report(Config(env={}, files=[]), usage=u)
        self.assertIn("викликів 1 з 3000", txt); self.assertIn("deadbeef… 321", txt)
        self.assertIn("CHAT_VOICE_PER_CONV", txt); self.assertIn("не задано", txt)
        with mock.patch.dict(os.environ, {"CHAT_USAGE_FILE": os.devnull + ".x"}):
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(run.main(["--usage"]), 0)
        self.assertIn("Ліміти:", out.getvalue())


if __name__ == "__main__":
    unittest.main()
