"""Шар 1: клієнт API і цикл воркера проти фейкового сервера (без мережі назовні).
  python3 -m unittest discover -s tools/chat/worker -p 'test_*.py'
"""
import pathlib
import sys
import threading
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from api import Api, ApiError  # noqa: E402
from config import Config  # noqa: E402
from fakeapi import KEY, FakeApi  # noqa: E402
from outcome import Outcome  # noqa: E402
from worker import Log, Worker  # noqa: E402


class Echo:
    def __init__(self, hook=None):
        self.hook, self.seen = hook, []

    def respond(self, conv, fetch):
        self.seen.append(conv)
        if self.hook:
            r = self.hook(conv, fetch)
            if r is not None:
                return r
        return Outcome(text="Отримали: %d повідомл." % len(conv["pending"]))


def cfg(**kw):
    return Config(env={"LEADBOT_KEY": KEY, **kw}, files=[])


class LoopTests(unittest.TestCase):
    def setUp(self):
        self.srv = FakeApi()
        self.log = []
        self.api = Api(self.srv.url, KEY, timeout=5, retries=2, sleep=lambda s: None)

    def tearDown(self):
        self.srv.close()

    def worker(self, brain, **kw):
        return Worker(cfg(**kw), self.api, brain, log=Log(out=self.log))

    def test_once_pings_and_replies_to_last_user(self):
        c = self.srv.conv()
        self.srv.add_user(c.sid, "Привіт"); last = self.srv.add_user(c.sid, "Скільки ремонт?")
        res = self.worker(Echo()).once()
        self.assertEqual(res, ["replied"])
        self.assertEqual(self.srv.pings, 1)
        self.assertEqual(self.srv.replies[0]["reply_to"], last)
        self.assertIn("2 повідомл", self.srv.replies[0]["text"])
        self.assertGreaterEqual(self.srv.typing, 1, "друкує… на початку обробки")
        self.assertEqual(self.worker(Echo()).once(), [], "відповідена розмова не повертається")

    def test_conflict_when_visitor_writes_during_processing(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        brain = Echo(lambda conv, f: self.srv.add_user(c.sid, "і ще") and None)
        self.assertEqual(self.worker(brain).once(), ["conflict"])
        self.assertEqual(self.srv.replies, [])
        # розмова одразу знову в черзі — з обома повідомленнями
        w = self.worker(Echo())
        self.assertEqual(w.once(), ["replied"])
        self.assertEqual(len(w.brain.seen[0]["pending"]), 2)

    def test_staff_state_is_silent(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        brain = Echo(lambda conv, f: setattr(c, "state", "staff"))
        self.assertEqual(self.worker(brain).once(), ["taken"])
        self.assertEqual(self.srv.replies, [])

    def test_exception_releases(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        def boom(conv, f):
            raise RuntimeError("секретний текст клієнта")
        self.assertEqual(self.worker(Echo(boom)).once(), ["failed"])
        self.assertEqual(self.srv.released, 1)
        self.assertFalse(any("секретний" in l for l in self.log), "у журналі немає тексту")
        self.assertEqual(self.worker(Echo()).once(), ["replied"], "після release — знову в черзі")

    def test_retry_on_5xx_and_network(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        self.srv.fail_next = [503, 500]
        self.assertEqual(self.worker(Echo()).once(), ["replied"])
        bad = Api("http://127.0.0.1:9", KEY, timeout=1, retries=1, sleep=lambda s: None)
        with self.assertRaises(ApiError) as e:
            bad.ping()
        self.assertEqual(e.exception.status, 0)

    def test_wrong_key_401_no_retry(self):
        a = Api(self.srv.url, "wrong", retries=3, sleep=lambda s: self.fail("не повторюємо 4xx"))
        with self.assertRaises(ApiError) as e:
            a.queue()
        self.assertEqual(e.exception.status, 401)

    def test_key_never_logged_and_sent_in_header(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        self.worker(Echo()).once()
        self.assertTrue(all(h.get("X-Bot-Key") == KEY for _, _, h in self.srv.requests))
        self.assertFalse(any(KEY in l for l in self.log))
        self.assertNotIn(KEY, repr(cfg()))

    def test_dry_does_not_send(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        w = Worker(cfg(), self.api, Echo(), dry=True, log=Log(out=self.log))
        self.assertEqual(w.once(), ["dry"])
        self.assertEqual(self.srv.replies, [])
        self.assertEqual(len(w.printed), 1)
        self.assertEqual(self.srv.released, 1)

    def test_parallel_limit(self):
        for _ in range(5):
            c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        w = self.worker(Echo(), CHAT_PARALLEL="7")
        self.assertEqual(w.parallel, 2, "не більше 2 розмов одночасно")
        self.assertEqual(len(w.poll()), 2)
        self.assertEqual(len(w.poll()), 0, "зайняті слоти — нових не беремо")

    def test_file_fetch_limits(self):
        f = self.srv.add_file("plan.pdf", b"%PDF-" + b"0" * 2000, "pdf")
        self.assertEqual(len(self.api.file(f["id"], 10_000)), 2005)
        from api import TooBig
        with self.assertRaises(TooBig):
            self.api.file(f["id"], 100)
        with self.assertRaises(ApiError):
            self.api.file("../../etc/passwd", 100)

    def test_run_loop_stops(self):
        c = self.srv.conv(); self.srv.add_user(c.sid, "1")
        w = self.worker(Echo(), CHAT_POLL="3")
        stop = threading.Event()
        t = threading.Thread(target=w.run, args=(stop,)); t.start()
        for _ in range(100):
            if self.srv.replies:
                break
            threading.Event().wait(0.05)
        stop.set(); t.join(10)
        self.assertEqual(len(self.srv.replies), 1)

    def test_config_file_and_env(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "env"
            p.write_text("# коментар\nexport CHAT_MODEL='m1'\nLEADBOT_KEY=fromfile\nCHAT_POLL=5\n")
            c = Config(env={"CHAT_MODEL": "m2"}, files=[p])
            self.assertEqual((c.get("CHAT_MODEL"), c.key, c.num("CHAT_POLL")), ("m2", "fromfile", 5.0))
            self.assertEqual(c.get("CHAT_LLM"), "local", "платний API — лише явно")


if __name__ == "__main__":
    unittest.main()


class RunTests(unittest.TestCase):
    def test_selftest_and_no_key(self):
        import os
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory() as home:
            env = {k: v for k, v in os.environ.items() if k != "LEADBOT_KEY"}
            env.update(HOME=home, CHAT_OLLAMA_URL="http://127.0.0.1:9", CHAT_CALENDAR="off")
            run = str(pathlib.Path(__file__).resolve().parent / "run.py")
            r = subprocess.run([sys.executable, run, "--selftest"], capture_output=True, text=True, env=env, timeout=120)
            self.assertIn("DWG", r.stdout); self.assertIn("LEADBOT_KEY", r.stdout); self.assertEqual(r.returncode, 1)
            self.assertIn("local (безкоштовно)", r.stdout)
            r = subprocess.run([sys.executable, run, "--once"], capture_output=True, text=True, env=env, timeout=60)
            self.assertEqual(r.returncode, 2); self.assertIn("LEADBOT_KEY", r.stderr)

    def test_once_dry_against_fake(self):
        import os
        import subprocess
        import tempfile
        srv = FakeApi()
        try:
            c = srv.conv(); srv.add_user(c.sid, "Ремонт квартири 60 м², скільки?")
            with tempfile.TemporaryDirectory() as home:
                env = dict(os.environ, HOME=home, LEADBOT_KEY=KEY, CHAT_BASE=srv.url, CHAT_OLLAMA_URL="http://127.0.0.1:9", CHAT_CALENDAR="off", CHAT_TTS="off")
                r = subprocess.run([sys.executable, str(pathlib.Path(__file__).resolve().parent / "run.py"), "--once", "--dry"],
                                   capture_output=True, text=True, env=env, timeout=120)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("33", r.stdout); self.assertEqual(srv.replies, [], "--dry нічого не надсилає")
        finally:
            srv.close()
