#!/usr/bin/env python3
"""Тести реєстру можливостей (без мережі, Telegram, справжніх Claude/Ollama/генератора).

  python3 -m unittest tools/assistant/bot/test_capabilities.py -v

PATH — тимчасова тека з фейковими програмами; Ollama — http.server з /api/tags; capabilities.d — тимчасова тека
з валідним і битим файлами; генератор музики — shell-скрипт, що пише файл у {out}.
"""
import datetime, http.server, importlib, json, os, pathlib, subprocess, sys, threading, time, unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from test_local_mode import Base, FakeOllama, write_exec  # noqa: E402

T = datetime.datetime(2026, 11, 23, 14, 0)


class FakeTags:
    """GET /api/tags як в Ollama."""

    def __init__(self, models):
        self.hits, outer = 0, self

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                outer.hits += 1
                data = json.dumps({"models": [{"name": m} for m in models]}).encode()
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_port}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown(); self.srv.server_close()


class CapsBase(Base):
    def setUp(self):
        super().setUp()
        self.bin = self.tmp / "bin"
        self.capsd = self.tmp / "caps.d"
        self.capsd.mkdir()
        self.gen_args = self.tmp / "gen-args.txt"
        self.gen = write_exec(self.bin / "fakegen", "#!/bin/sh\n"
                              f'printf "%s\\n" "$@" > "{self.gen_args}"\n'
                              'out=""; while [ $# -gt 0 ]; do [ "$1" = "--out" ] && out="$2"; shift; done\n'
                              '[ -n "$FAKEGEN_SLEEP" ] && sleep "$FAKEGEN_SLEEP"\n'
                              'printf "RIFFfake" > "$out"\n')
        write_exec(self.bin / "fakever", "#!/bin/sh\necho 'fakever 1.2.3'\n")
        self.old_env = {k: os.environ.get(k) for k in ("PATH", "ASSISTANT_CAPS_DIR", "ASSISTANT_CAPS_TTL", "FAKEGEN_HOME",
                                                       "CLAUDE_ALLOWED_TOOLS", "ASSISTANT_CAPS_AUTOALLOW", "FAKEGEN_SLEEP")}
        os.environ["PATH"] = str(self.bin) + os.pathsep + os.environ.get("PATH", "")
        os.environ["ASSISTANT_CAPS_DIR"] = str(self.capsd)
        os.environ["ASSISTANT_CAPS_TTL"] = "600"
        os.environ["FAKEGEN_HOME"] = str(self.bin)
        import capabilities
        self.C = importlib.reload(capabilities)
        self.C.LOG = lambda *a: None
        self.C.clear_cache()

    def tearDown(self):
        for k, v in self.old_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        super().tearDown()

    def caps_file(self, name, data):
        (self.capsd / name).write_text(json.dumps(data, ensure_ascii=False) if not isinstance(data, str) else data, encoding="utf-8")

    def music_cap(self, timeout=60, **kw):
        d = {"key": "music-fake", "name": "Фейковий генератор пісень", "category": "музика", "local": True, "paid": False,
             "check": [{"cmd": "${FAKEGEN_HOME}/fakegen"}],
             "run": ["${FAKEGEN_HOME}/fakegen", "--prompt", "{style}, {prompt}", "--duration", "{duration}", "--out", "{out}"],
             "defaults": {"style": "pop", "duration": "60", "prompt": ""}, "out_ext": ".wav", "timeout": timeout,
             "install": "поставити фейковий генератор", "version": ["${FAKEGEN_HOME}/fakever"]}
        d.update(kw)
        self.caps_file("music.json", d)

    def st(self, key, **kw):
        return self.C.check(self.C.get(key), **kw)


# ---------- реєстр і перевірки ----------
class RegistryTests(CapsBase):
    def test_builtin_entries_come_from_real_code(self):
        keys = {c.key for c in self.C.BUILTIN}
        self.assertTrue({"claude", "ollama", "transcribe", "tts", "pdf", "calendar", "mail", "money", "tasks"} <= keys)
        real = {p.name for p in (HERE.parent / "bin").iterdir()}
        for c in self.C.BUILTIN:                                 # кожен скрипт, на який посилається запис, існує в bin/
            for chk in c.check:
                for x in chk.get("any", [chk]):
                    if "script" in x:
                        self.assertIn(x["script"], real, c.key)
        self.assertTrue(all(c.paid and not c.local for c in self.C.PAID))
        self.assertIn("higgsfield", {c.key for c in self.C.PAID})

    def test_machine_file_valid_broken_and_invalid(self):
        self.music_cap()
        self.caps_file("broken.json", "{не json")
        self.caps_file("bad.json", [{"key": "Погано!", "name": "x", "category": "музика"},
                                    {"key": "img-ok", "name": "FLUX локально", "category": "зображення",
                                     "check": [{"cmd": "no-such-flux-binary"}], "install": "brew install flux"},
                                    {"key": "bad-run", "name": "x", "category": "відео", "run": "рядок замість списку"}])
        keys = {c.key for c in self.C.registry()}
        self.assertIn("music-fake", keys)
        self.assertIn("img-ok", keys)
        self.assertNotIn("bad-run", keys)
        w = "\n".join(self.C.warnings())
        self.assertIn("broken.json", w)
        self.assertIn("bad.json", w)
        self.assertTrue(self.st("music-fake").ok)
        s = self.st("img-ok")
        self.assertFalse(s.ok)
        self.assertIn("no-such-flux-binary", s.reasons[0])

    def test_env_file_and_missing_var(self):
        self.caps_file("x.json", {"key": "needs-var", "name": "Скрипт за змінною", "category": "інше",
                                  "check": [{"file": "${NO_SUCH_VAR_FOR_TEST}"}]})
        s = self.st("needs-var")
        self.assertFalse(s.ok)
        self.assertIn("NO_SUCH_VAR_FOR_TEST", s.reasons[0])

    def test_ollama_models(self):
        srv = FakeTags(["qwen3:8b", "bge-m3:latest"])
        os.environ["ASSISTANT_OLLAMA_URL"] = srv.url
        try:
            self.caps_file("o.json", [{"key": "llm-a", "name": "a", "category": "текст", "check": [{"ollama": "bge-m3"}]},
                                      {"key": "llm-b", "name": "b", "category": "текст", "check": [{"ollama": "llama9:70b"}]}])
            self.assertTrue(self.st("llm-a").ok)
            self.assertTrue(self.st("ollama").ok)                 # вбудований: qwen3:8b
            b = self.st("llm-b")
            self.assertFalse(b.ok)
            self.assertIn("ollama pull llama9:70b", b.reasons[0])
            self.assertIn("qwen3:8b", self.C.check(self.C.get("ollama"), with_version=True).version)
        finally:
            srv.close()
        os.environ["ASSISTANT_OLLAMA_URL"] = "http://127.0.0.1:9"
        self.C.clear_cache()
        self.assertIn("Ollama не відповідає", self.st("ollama").reasons[0])

    def test_cache_and_refresh(self):
        self.music_cap()
        self.assertTrue(self.st("music-fake").ok)
        self.gen.unlink()
        self.assertTrue(self.st("music-fake").ok)                 # кеш ~10 хв: файлову систему не чіпаємо
        self.assertFalse(self.st("music-fake", refresh=True).ok)  # /caps refresh — перевірка заново
        self.gen = write_exec(self.bin / "fakegen", "#!/bin/sh\nexit 0\n")
        os.environ["ASSISTANT_CAPS_TTL"] = "0"
        self.assertTrue(self.st("music-fake").ok)                 # TTL вичерпано — перевіряє сам

    def test_version_and_paid_not_checked(self):
        self.music_cap()
        s = self.C.check(self.C.get("music-fake"), with_version=True)
        self.assertEqual(s.version, "fakever 1.2.3")
        p = self.st("higgsfield")
        self.assertFalse(p.ok)
        self.assertIn("дозволу", p.reasons[0])

    def test_cli_check_and_json(self):
        self.music_cap()
        env = dict(os.environ)
        r = subprocess.run([sys.executable, str(HERE / "capabilities.py"), "--check", "music-fake"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("fakever 1.2.3", r.stdout)
        r = subprocess.run([sys.executable, str(HERE / "capabilities.py"), "--check", "higgsfield"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 1)
        r = subprocess.run([sys.executable, str(HERE / "capabilities.py"), "--json"], capture_output=True, text=True, env=env)
        rows = {x["key"]: x for x in json.loads(r.stdout)}
        self.assertTrue(rows["music-fake"]["ok"])
        self.assertIn("--run music-fake --bg", rows["music-fake"]["call"])

    def test_example_file_is_valid(self):
        ex = HERE / "capabilities.example/music-ace-step.json"
        c = self.C._validate(json.loads(ex.read_text(encoding="utf-8")), ex.name)
        self.assertNotIsInstance(c, str, c)
        self.assertEqual(c.category, "музика")
        self.assertTrue(c.local and not c.paid and c.run)
        self.assertNotRegex(ex.read_text(encoding="utf-8"), r"/Users/|/home/")   # без реальних шляхів користувача
        s = self.C.check(c)
        self.assertFalse(s.ok)                                    # тут ACE_STEP_SCRIPT не задано — і причина про це
        self.assertIn("ACE_STEP_SCRIPT", " ".join(s.reasons))


# ---------- allowlist і блок для моделі ----------
class PromptTests(CapsBase):
    def test_allowlist_local_in_paid_out(self):
        self.music_cap()
        base = "Read,Bash(ls*),mcp__higsfield__generate_audio,mcp__claude_ai_Canva__generate-design,mcp__Higgsfield__generate_video"
        al = self.C.recommended_allowlist(base).split(",")
        self.assertIn("Read", al)
        self.assertIn(f"Bash({self.bin}/fakegen*)", al)
        self.assertIn("Bash(python3 tools/assistant/bot/capabilities.py*)", al)
        self.assertFalse([t for t in al if "igs" in t.lower() or "canva" in t.lower()], al)

    def test_block_facts_and_rules(self):
        self.music_cap()
        self.caps_file("img.json", {"key": "flux-local", "name": "FLUX", "category": "зображення",
                                    "check": [{"cmd": "no-flux-here"}]})
        b = self.C.prompt_block("claude")
        self.assertIn("ТВОЇ МОЖЛИВОСТІ НА ЦІЙ МАШИНІ ЗАРАЗ", b)
        self.assertIn("music-fake", b)
        self.assertIn("--run music-fake --bg", b)
        self.assertRegex(b, r"НЕМАЄ:[\s\S]*flux-local[\s\S]*no-flux-here")
        self.assertIn("Higgsfield", b.split("ПЛАТНІ")[1])
        self.assertIn("Спершу локальні", b)
        self.assertIn("Заборонено казати, що інструмента немає", b)
        self.assertLess(len(b), 4500)
        loc = self.C.prompt_block("local")
        self.assertNotIn("--run", loc)
        os.environ["ASSISTANT_CAPS_PROMPT"] = "0"
        try:
            self.assertEqual(self.C.prompt_block(), "")
        finally:
            os.environ.pop("ASSISTANT_CAPS_PROMPT")

    def test_ollama_gets_block(self):
        self.music_cap()
        o = FakeOllama("Відповідь.")
        os.environ["ASSISTANT_OLLAMA_URL"] = o.url
        try:
            self.L.handle_text("розкажи щось", T)
            system = o.requests[-1]["messages"][0]["content"]
            self.assertIn("ТВОЇ МОЖЛИВОСТІ", system)
            self.assertIn("music-fake", system)
        finally:
            o.close()


# ---------- бот: /caps, запит до Claude, allowlist ----------
class BotCapsTests(CapsBase):
    def setUp(self):
        super().setUp()
        os.environ.update({"ASSISTANT_BOT_TOKEN": "test-token", "ASSISTANT_CHAT_ID": "1", "ASSISTANT_GROUPS": "",
                           "CLAUDE_ALLOWED_TOOLS": "Read,Bash(ls*),mcp__higsfield__generate_audio", "ASSISTANT_CAPS_AUTOALLOW": "1"})
        self.music_cap()
        self.calls = self.tmp / "claude-calls"
        os.environ["CLAUDE_BIN"] = str(write_exec(self.tmp / "claude", f'#!/bin/sh\nfor a in "$@"; do printf "%s\\n<<ARG>>\\n" "$a"; done >> "{self.calls}"\n'
                                                  'printf "===ВІДПОВІДЬ===\\nВід Claude\\n===КІНЕЦЬ===\\n"\n'))
        import local_mode, menu, bot
        self.L = importlib.reload(local_mode)
        importlib.reload(menu)
        self.bot = importlib.reload(bot)
        self.C.LOG = lambda *a: None
        self.sent, self.files, self.api_calls = [], [], []
        self.bot.send_text = lambda text, chat=None, reply_to=None, markup=None: self.sent.append((text, markup, chat)) or {"message_id": 7}
        self.bot.send_file = lambda path, caption="", chat=None: self.files.append(path) or True
        self.bot.api = lambda method, **p: self.api_calls.append((method, p)) or ([] if method == "getMyCommands" else {})
        self.bot.run_background = lambda fn: fn()
        self.bot.MEMORY_SYNC = self.tmp / "no-sync"
        self.bot.LOG = lambda *a: None

    def tearDown(self):
        for k in ("ASSISTANT_BOT_TOKEN", "ASSISTANT_CHAT_ID", "ASSISTANT_GROUPS", "CLAUDE_BIN"):
            os.environ.pop(k, None)
        super().tearDown()

    def claude_args(self):
        return self.calls.read_text(encoding="utf-8").split("\n<<ARG>>\n") if self.calls.exists() else []

    def test_caps_without_model_in_both_modes(self):
        state = {}
        for txt in ("/caps", "які програми встановлені?", "что ты умеешь", "what can you do"):
            n = len(self.sent)
            self.bot.handle({"text": txt, "chat": {"id": 1}}, state)
            out = "\n".join(t for t, _, _ in self.sent[n:])
            self.assertIn("✅", out, txt)
            self.assertIn("Фейковий генератор пісень", out)
            self.assertIn("💳 Higgsfield", out)
            self.assertIn("/caps refresh", out)
        self.assertFalse(self.calls.exists())                     # модель не викликалась
        self.bot.handle({"text": "/local on"}, state)
        self.bot.handle({"text": "/caps"}, state)
        self.assertIn("локальний режим", self.sent[-1][0])
        self.assertFalse(self.calls.exists())
        self.assertIn("caps", [c for c, _ in self.bot.menu.COMMANDS])
        self.assertIn("/caps", self.bot.menu.HELP)

    def test_caps_long_list_split(self):
        self.caps_file("many.json", [{"key": f"tool-{i:03d}", "name": f"Інструмент номер {i} " + "х" * 40, "category": "інше",
                                      "check": [{"cmd": f"no-tool-{i}"}], "install": "поставити " + "у" * 40} for i in range(120)])
        self.bot.handle({"text": "/caps refresh"}, {})
        self.assertGreater(len(self.sent), 1)
        self.assertTrue(all(len(t) <= 3900 for t, _, _ in self.sent))
        self.assertIn("tool", "".join(t for t, _, _ in self.sent).replace("Інструмент номер", "tool"))

    def test_refresh_sees_new_file(self):
        self.bot.handle({"text": "/caps"}, {})
        self.assertNotIn("Свіжий інструмент", "\n".join(t for t, _, _ in self.sent))
        self.caps_file("new.json", {"key": "fresh-one", "name": "Свіжий інструмент", "category": "відео", "check": [{"cmd": "fakegen"}]})
        self.bot.handle({"text": "/caps refresh"}, {})
        self.assertIn("✅ Свіжий інструмент", "\n".join(t for t, _, _ in self.sent))

    def test_foreign_user_gets_no_caps(self):
        self.bot.ME = {"id": 77, "username": "example_bot"}
        self.bot.role_of = lambda uid, st: "client"
        self.bot.handle_external({"text": "/caps", "chat": {"id": 555, "type": "private"}, "from": {"id": 555}, "message_id": 3}, {})
        self.bot.handle_external({"text": "які програми встановлені?", "chat": {"id": 555, "type": "private"}, "from": {"id": 555},
                                  "message_id": 4}, {})
        out = "\n".join(t for t, _, _ in self.sent)
        self.assertNotIn("🧰", out)
        self.assertNotIn("Фейковий генератор", out)
        self.assertFalse(self.calls.exists())

    def test_claude_prompt_has_block_and_paid_not_allowed(self):
        self.assertNotIn("higsfield", self.bot.ALLOWED)
        self.assertIn(f"Bash({self.bin}/fakegen*)", self.bot.ALLOWED)
        self.bot.handle({"text": "згенеруй пісню про море"}, {})
        args = self.claude_args()
        prompt = args[-2] if len(args) > 1 else ""
        self.assertIn("ТВОЇ МОЖЛИВОСТІ НА ЦІЙ МАШИНІ ЗАРАЗ", prompt)
        self.assertIn("music-fake", prompt)
        self.assertIn("Спершу локальні", prompt)
        allowed = args[args.index("--allowedTools") + 1]
        self.assertNotIn("higsfield", allowed.lower())
        self.assertIn("capabilities.py", allowed)
        self.assertEqual(self.sent[-1][0], "Від Claude")

    def test_resumed_conversation_short_hint(self):
        p = self.bot.build_prompt("текст", "як справи з плиткою", "", fresh=False)
        self.assertNotIn("ТВОЇ МОЖЛИВОСТІ", p)
        self.assertIn("capabilities.py", p)                       # один рядок-нагадування
        p = self.bot.build_prompt("текст", "які програми встановлені для відео?", "", fresh=False)
        self.assertIn("ТВОЇ МОЖЛИВОСТІ", p)                       # питання про інструменти — повний блок

    def test_music_in_local_mode_sends_file(self):
        state = {}
        self.bot.handle({"text": "/local on"}, state)
        self.bot.handle({"text": "згенеруй пісню про море стиль: джаз 30 с"}, state)
        texts = [t for t, _, _ in self.sent]
        self.assertTrue(any("Генерую локально" in t for t in texts), texts)
        self.assertTrue(any("Готово" in t for t in texts), texts)
        self.assertEqual(len(self.files), 1)
        self.assertTrue(pathlib.Path(self.files[0]).read_bytes().startswith(b"RIFF"))
        argv = self.gen_args.read_text(encoding="utf-8").splitlines()
        self.assertIn("джаз, море", argv)
        self.assertIn("30", argv)
        self.assertFalse(self.calls.exists())


# ---------- намір музики напряму ----------
class MusicIntentTests(CapsBase):
    def test_success_runs_fake_command_in_background(self):
        self.music_cap()
        r = self.L.handle_text("Згенеруй мені пісню про осінь у Києві, 2 хв", T)
        self.assertIn("Генерую локально", r.text)
        self.assertFalse(self.gen_args.exists())                  # сам запуск — лише у фоні
        res = r.background()
        self.assertEqual(len(res.files), 1)
        self.assertTrue(os.path.isfile(res.files[0]))
        argv = self.gen_args.read_text(encoding="utf-8").splitlines()
        self.assertIn("pop, осінь у Києві", argv)                 # стиль за замовчуванням із запису
        self.assertIn("120", argv)

    def test_timeout(self):
        self.music_cap(timeout=1)
        os.environ["FAKEGEN_SLEEP"] = "5"
        r = self.L.handle_text("зроби трек для відео про ремонт", T)
        t0 = time.time()
        res = r.background()
        self.assertLess(time.time() - t0, 4)
        self.assertIn("не встиг", res.text)
        self.assertFalse(res.files)

    def test_no_tool_honest_reason(self):
        self.music_cap(check=[{"file": "${ACE_STEP_SCRIPT_TEST_MISSING}"}])
        r = self.L.handle_text("згенеруй пісню", T)
        self.assertIsNone(r.background)
        self.assertIn("не можу", r.text)
        self.assertIn("ACE_STEP_SCRIPT_TEST_MISSING", r.text)
        self.assertIn("поставити фейковий генератор", r.text)
        self.assertIn("лише з твого явного дозволу", r.text)
        self.assertNotIn("suno", r.text.lower())
        (self.capsd / "music.json").unlink()
        self.C.clear_cache()
        r = self.L.handle_text("сгенерируй песню", T)
        self.assertIn(str(self.capsd), r.text)

    def test_user_text_not_expanded_and_no_shell(self):
        self.music_cap()
        r = self.L.handle_text('згенеруй пісню про ${HOME} ; rm -rf "$(whoami)"', T)
        r.background()
        argv = self.gen_args.read_text(encoding="utf-8")
        self.assertIn("${HOME} ; rm -rf", argv)
        self.assertNotIn(os.path.expanduser("~") + " ;", argv)

    def test_other_intents_unchanged(self):
        self.music_cap()
        r = self.L.handle_text("додай задачу згенерувати пісню для клієнта", T)
        self.assertIn("Записав задачу", r.text)
        self.assertIsNone(r.background)


if __name__ == "__main__":
    unittest.main()
