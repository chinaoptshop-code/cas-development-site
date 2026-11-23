"""Наскрізно: стенд сайту (справжні functions/ через harness.mjs, node) ↔ Python-воркер з фейковою моделлю.
Відвідувач пише + прикладає DXF і xlsx → воркер відповідає з estimate → видно в poll; дзвінок → слоти → вибір → повторне сповіщення.
Пропускається, якщо немає node ≥ 22 (node:sqlite) або openpyxl.
"""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.parse
import urllib.request
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import fixtures as FX  # noqa: E402
from api import Api  # noqa: E402
from brain import Brain  # noqa: E402
from config import Config  # noqa: E402
from test_brain import NOW, FakeLLM  # noqa: E402
from worker import Log, Worker  # noqa: E402

KEY = "stand-key-not-real-000000000"
ORIGIN = "https://cas-develop.com"


def node_ok():
    if not shutil.which("node"):
        return False
    try:
        return subprocess.run(["node", "-e", "require('node:sqlite')"], capture_output=True, timeout=20).returncode == 0
    except Exception:
        return False


@unittest.skipUnless(node_ok() and importlib.util.find_spec("openpyxl"), "немає node:sqlite або openpyxl")
class E2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = subprocess.Popen(["node", str(HERE / "stand.mjs")], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 env={**os.environ, "STAND_KEY": KEY})
        line = cls.p.stdout.readline()
        if not line.startswith("PORT "):
            cls.p.kill(); raise RuntimeError("стенд не стартував: " + line + cls.p.stderr.read()[:2000])
        cls.base = f"http://127.0.0.1:{line.split()[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.p.kill(); cls.p.wait(10)

    def req(self, method, path, body=None, raw=None, headers=None):
        h = {"Origin": ORIGIN, **(headers or {})}
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if body is not None:
            h["Content-Type"] = "application/json"
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(r, timeout=30) as x:
                return x.status, json.loads(x.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def visitor(self, sid, tok):
        return {"x-chat-sid": sid, "x-chat-token": tok}

    def worker(self, cal_cmd="false"):
        cfg = Config(env={"LEADBOT_KEY": KEY, "CHAT_BASE": self.base}, files=[])
        brain = Brain(cfg, llm=FakeLLM("Дякую! Подивився план і кошторис."), now=lambda: NOW)
        return Worker(cfg, Api(self.base, KEY, retries=1, sleep=lambda s: None), brain, log=Log(out=[]))

    def test_dialog(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"CHAT_OLLAMA_URL": "http://127.0.0.1:9", "CHAT_CAL_CMD": "false"}):
            st, s = self.req("POST", "/api/chat/start", {"lang": "uk", "page": "/remont-kvartyr-kyiv"})
            self.assertEqual(st, 200, s)
            V = self.visitor(s["sid"], s["token"])
            ids = []
            for name, data, ct in (("план.dxf", FX.dxf(), "image/vnd.dxf"),
                                   ("кошторис.xlsx", FX.xlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")):
                st, f = self.req("POST", "/api/chat/upload", raw=data, headers={**V, "x-file-name": urllib.parse.quote(name), "Content-Type": ct})
                self.assertEqual(st, 200, f); ids.append(f["file_id"])
            st, m = self.req("POST", "/api/chat/send", {"text": "Добрий день! Ремонт квартири — скільки буде? План і кошторис додаю.", "files": ids}, headers=V)
            self.assertEqual(st, 200, m)
            w = self.worker()
            self.assertEqual(w.once(), ["replied"])
            st, p = self.req("GET", "/api/chat/poll?after=0", headers=V)
            bot = [x for x in p["messages"] if x["role"] == "bot"][-1]
            self.assertEqual(bot["estimate"]["total_from"], 33000, bot)
            self.assertIn("$33 000", bot["text"]); self.assertIn("план.dxf", bot["text"])
            self.assertTrue(p["online"], "воркер пінгував")
            # дзвінок: календар — фейкова команда
            cal = pathlib.Path(d) / "cal"; cal.write_text("#!/bin/sh\necho '[]'\n"); cal.chmod(0o755)
            with mock.patch.dict(os.environ, {"CHAT_CAL_CMD": str(cal)}):
                self.req("POST", "/api/chat/send", {"text": "Можете мені подзвонити?"}, headers=V)
                self.assertEqual(self.worker().once(), ["replied"])
                st, p = self.req("GET", "/api/chat/poll?after=0", headers=V)
                last = [x for x in p["messages"] if x["role"] == "bot"][-1]
                self.assertIn("1) Пн 23.11, 12:00", last["text"]); self.assertEqual(p["state"], "waiting")
                tg = json.loads(urllib.request.urlopen(self.base + "/__tg").read())
                n1 = sum(1 for c in tg if c.get("method") == "sendMessage" and "потрібна людина" in c.get("text", ""))
                self.assertGreaterEqual(n1, 1)
                self.req("POST", "/api/chat/send", {"text": "2"}, headers=V)
                self.assertEqual(self.worker().once(), ["replied"])
                tg = json.loads(urllib.request.urlopen(self.base + "/__tg").read())
                calls = [c["text"] for c in tg if c.get("method") == "sendMessage" and "потрібна людина" in c.get("text", "")]
                self.assertGreater(len(calls), n1, "обраний час — повторне сповіщення")
                self.assertIn("Вт 24.11, 10:00", calls[-1])
            # розмову взяла людина → бот мовчить (409 state) — перевірено в chat.mjs; тут — черга порожня
            self.assertEqual(self.worker().once(), [])


if __name__ == "__main__":
    unittest.main()
