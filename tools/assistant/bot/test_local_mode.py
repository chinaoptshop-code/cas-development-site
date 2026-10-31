#!/usr/bin/env python3
"""Тести локального режиму (без мережі, Telegram і справжнього Claude).

  python3 -m unittest tools/assistant/bot/test_local_mode.py -v     (або pytest)

Фейковий claude — shell-скрипт із помилкою ліміту; фейкова Ollama — http.server у потоці;
памʼять, стан і «репозиторій» зі скриптами — тимчасові теки.
"""
import datetime, http.server, importlib, json, os, pathlib, stat, subprocess, sys, tempfile, threading, unittest

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))


def write_exec(path, text):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return path


class FakeOllama:
    """http.server, що відповідає як /api/chat Ollama; запам'ятовує запити."""

    def __init__(self, answer="<think>міркую…</think>Привіт! Локальна відповідь.", reject_think=False):
        self.requests, outer = [], self

        class H(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append(body)
                if reject_think and "think" in body:
                    self.send_response(400); self.end_headers(); self.wfile.write(b'{"error":"unknown field think"}'); return
                data = json.dumps({"message": {"role": "assistant", "content": answer}, "done": True}).encode()
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_port}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown(); self.srv.server_close()


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.mem, self.state = self.tmp / "memory", self.tmp / "state"
        self.mem.mkdir(); self.state.mkdir()
        self.env = {"ASSISTANT_MEMORY_DIR": str(self.mem), "ASSISTANT_STATE_DIR": str(self.state),
                    "ASSISTANT_TMP": str(self.tmp / "tmp"), "ASSISTANT_OLLAMA_URL": "http://127.0.0.1:9",
                    "ASSISTANT_BRIEF_OLLAMA": "0", "ASSISTANT_TG_OUT": str(self.fake_tg()),
                    "ASSISTANT_CLAUDE_RETRY_MIN": "30"}
        self._old = {k: os.environ.get(k) for k in self.env}
        os.environ.update(self.env)
        import local_mode
        self.L = importlib.reload(local_mode)

    def tearDown(self):
        for k, v in self._old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def fake_tg(self):
        self.tg_log = self.tmp / "tg.log"
        return write_exec(self.tmp / "fake-tg-out.sh", f'#!/bin/sh\nprintf "%s\\n---\\n" "$2" >> "{self.tg_log}"\n')

    def tg_messages(self):
        return [m.strip() for m in self.tg_log.read_text(encoding="utf-8").split("---") if m.strip()] if self.tg_log.exists() else []

    def tasks(self):
        return (self.mem / "02 Задачі.md").read_text(encoding="utf-8")


# ---------- роутер ----------
class RouterTests(Base):
    def test_reason_detection(self):
        r = self.L.unavailable_reason
        self.assertIsNotNone(r(1, "Claude AI usage limit reached|1761900000", ""))
        self.assertIsNotNone(r(0, "You've hit your limit · resets 3pm", ""))
        self.assertIsNotNone(r(1, "", "Invalid API key · Please run /login"))
        self.assertIsNotNone(r(1, "", "API Error: 429 rate_limit_error"))
        self.assertIsNotNone(r(0, "", "Your credit balance is too low"))
        self.assertIsNotNone(r(None, exc=FileNotFoundError("claude")))
        self.assertIsNotNone(r(None, exc=subprocess.TimeoutExpired("claude", 900)))
        self.assertIsNone(r(0, "===ВІДПОВІДЬ===\nГотово, записав.\n===КІНЕЦЬ===", ""))
        self.assertIsNone(r(1, "Error: Reached max turns (25)", ""))
        long_ok = "Текст про rate limit у статті. " * 40       # довга нормальна відповідь зі словами-ознаками
        self.assertIsNone(r(0, long_ok, ""))

    def test_cooldown_and_transitions(self):
        now = [1000.0]
        R = self.L.Router(self.state / "r.json", cooldown_min=30, clock=lambda: now[0])
        self.assertTrue(R.use_claude())
        self.assertTrue(R.failure("limit"))          # вхід — одне повідомлення
        self.assertFalse(R.failure("limit"))         # повторна невдача — без повідомлення
        self.assertEqual(R.mode(), "local")
        self.assertFalse(R.use_claude())
        now[0] += 29 * 60
        self.assertFalse(R.use_claude())
        now[0] += 2 * 60
        self.assertTrue(R.use_claude())              # раз на 30 хв пробуємо знову
        self.assertTrue(R.success())                 # повернення — одне повідомлення
        self.assertFalse(R.success())
        R.set_manual("on")
        self.assertFalse(R.use_claude()); self.assertEqual(R.mode(), "local")
        R.set_manual("off")
        self.assertTrue(R.use_claude()); self.assertEqual(R.mode(), "claude")
        self.assertFalse(R.failure("x"))             # ручний режим — без автоматичних повідомлень
        R.set_manual("auto")
        self.assertTrue(R.use_claude())

    def test_cli_with_fake_claude(self):
        calls = self.tmp / "claude-calls"
        bad = write_exec(self.tmp / "claude-bad", f'#!/bin/sh\necho x >> "{calls}"\n'
                                                  'echo "Claude AI usage limit reached|1761900000"; exit 1\n')
        good = write_exec(self.tmp / "claude-good", '#!/bin/sh\necho "Брифінг від Claude"\n')
        cli = [sys.executable, str(HERE / "local_mode.py"), "claude-run", "--notify", "--"]
        r = subprocess.run(cli + [str(bad), "-p", "x"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 10)
        self.assertEqual(self.tg_messages(), [self.L.ENTER_MSG])
        self.assertEqual(json.loads((self.state / "router.json").read_text())["mode"], "local")
        r = subprocess.run(cli + [str(bad)], capture_output=True, text=True)      # кулдаун: claude не запускається
        self.assertEqual(r.returncode, 10)
        self.assertEqual(len(calls.read_text().splitlines()), 1)
        self.assertEqual(len(self.tg_messages()), 1)                               # повідомлення не дублюється
        r = subprocess.run(cli + [str(self.tmp / "no-such-claude")], capture_output=True, text=True,
                           env={**os.environ, "ASSISTANT_CLAUDE_RETRY_MIN": "0"})
        self.assertEqual(r.returncode, 10)                                         # немає бінарника = недоступний
        r = subprocess.run(cli + [str(good)], capture_output=True, text=True,
                           env={**os.environ, "ASSISTANT_CLAUDE_RETRY_MIN": "0"})
        self.assertEqual(r.returncode, 0)
        self.assertIn("Брифінг від Claude", r.stdout)
        self.assertEqual(self.tg_messages()[-1], self.L.BACK_MSG)


# ---------- бот: перемикання через bot.handle ----------
class BotRoutingTests(Base):
    def setUp(self):
        super().setUp()
        self.ollama = FakeOllama("<think>…</think>Тримай локальну відповідь.")
        os.environ.update({"ASSISTANT_BOT_TOKEN": "test-token", "ASSISTANT_CHAT_ID": "1", "ASSISTANT_GROUPS": "",
                           "ASSISTANT_OLLAMA_URL": self.ollama.url, "ASSISTANT_REPO": str(REPO)})
        self.calls = self.tmp / "claude-calls"
        os.environ["CLAUDE_BIN"] = str(write_exec(self.tmp / "claude", f'#!/bin/sh\necho x >> "{self.calls}"\n'
                                                  'echo "Claude AI usage limit reached|1761900000"; exit 1\n'))
        import bot
        self.bot = importlib.reload(bot)
        self.sent = []
        self.bot.send_text = lambda text, chat=None, reply_to=None, markup=None: self.sent.append((text, markup)) or {"message_id": 1}
        self.bot.api = lambda method, **p: {}
        self.bot.MEMORY_SYNC = self.tmp / "no-sync"

    def tearDown(self):
        self.ollama.close()
        for k in ("ASSISTANT_BOT_TOKEN", "ASSISTANT_CHAT_ID", "ASSISTANT_GROUPS", "ASSISTANT_REPO", "CLAUDE_BIN"):
            os.environ.pop(k, None)
        super().tearDown()

    def test_limit_switches_to_local_and_answers(self):
        state = {}
        self.bot.handle({"text": "додай задачу купити плитку"}, state)
        texts = [t for t, _ in self.sent]
        self.assertEqual(texts[0], self.L.ENTER_MSG)
        self.assertIn("Записав задачу", texts[1])
        self.assertIn("- [ ] Купити плитку", self.tasks())
        self.bot.handle({"text": "як справи?"}, state)                 # кулдаун: Claude не викликається, відповідає Ollama
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)
        self.assertEqual(self.sent[-1][0], "Тримай локальну відповідь.")
        self.assertEqual(sum(t == self.L.ENTER_MSG for t, _ in self.sent), 1)
        req = self.ollama.requests[-1]
        self.assertFalse(req["think"])
        self.assertIn("Купити плитку", req["messages"][0]["content"])  # контекст: відкриті задачі
        self.bot.handle({"text": "/status"}, state)
        self.assertIn("локальний", self.sent[-1][0])

    def test_back_to_claude(self):
        state = {}
        self.bot.handle({"text": "привіт"}, state)
        os.environ["ASSISTANT_CLAUDE_RETRY_MIN"] = "0"
        self.bot.ROUTER = self.L.Router()
        self.bot.CLAUDE = str(write_exec(self.tmp / "claude-ok", '#!/bin/sh\nprintf "===ВІДПОВІДЬ===\\nВсе ок\\n===КІНЕЦЬ===\\n"\n'))
        self.bot.handle({"text": "ще раз"}, state)
        texts = [t for t, _ in self.sent]
        self.assertIn(self.L.BACK_MSG, texts)
        self.assertEqual(texts[-1], "Все ок")

    def test_manual_local_command(self):
        state = {}
        self.bot.handle({"text": "/local on"}, state)
        self.bot.handle({"text": "що ти вмієш"}, state)
        self.assertFalse(self.calls.exists())                          # Claude навіть не пробували
        self.assertIn("локальний режим", self.sent[-1][0].lower())


# ---------- Ollama ----------
class OllamaTests(Base):
    def test_answer_and_think_stripped(self):
        o = FakeOllama("<think>довго думаю</think>  Відповідь моделі.")
        os.environ["ASSISTANT_OLLAMA_URL"] = o.url
        os.environ["ASSISTANT_LOCAL_MODEL"] = "qwen3:8b"
        try:
            (self.mem / ".dialog.jsonl").write_text("".join(json.dumps({"t": "2026-10-31T10:00", "who": w, "text": x},
                                                                       ensure_ascii=False) + "\n"
                                                            for w, x in [("Михайло", f"питання {i}") if i % 2 == 0 else
                                                                         ("Помічник", f"відповідь {i}") for i in range(14)]
                                                            + [("Михайло", "що порадиш?")]), encoding="utf-8")
            r = self.L.handle_text("що порадиш?")
            self.assertEqual(r.text, "Відповідь моделі.")
            req = o.requests[-1]
            self.assertEqual(req["model"], "qwen3:8b")
            self.assertEqual(req["messages"][-1]["content"], "що порадиш?")
            self.assertEqual(len(req["messages"]), 1 + 10 + 1)        # система + 10 реплік + питання
            self.assertNotIn("що порадиш?", [m["content"] for m in req["messages"][1:-1]])
        finally:
            o.close(); os.environ.pop("ASSISTANT_LOCAL_MODEL", None)

    def test_old_ollama_without_think(self):
        o = FakeOllama("Відповідь.", reject_think=True)
        os.environ["ASSISTANT_OLLAMA_URL"] = o.url
        try:
            self.assertEqual(self.L.ollama_chat("привіт"), "Відповідь.")
            self.assertNotIn("think", o.requests[-1])
        finally:
            o.close()

    def test_ollama_down_is_honest(self):
        r = self.L.handle_text("розкажи анекдот")
        self.assertIn("Ollama", r.text)
        self.assertIn("не відповідає", r.text)


# ---------- задачі й нагадування ----------
class MemoryIntentTests(Base):
    T = datetime.datetime(2026, 10, 29, 14, 0)      # четвер

    def test_task_this_week_and_dated(self):
        (self.mem / "02 Задачі.md").write_text("# Задачі\n\n## Цей тиждень\n- [ ] Стара задача\n\n## Зроблено\n- x\n", encoding="utf-8")
        self.assertIn("Записав", self.L.handle_text("Додай задачу: замовити шпон", self.T).text)
        self.assertIn("Записав", self.L.handle_text("добавь задачу завтра позвонить прорабу", self.T).text)
        s = self.tasks()
        self.assertIn("## Цей тиждень\n- [ ] Стара задача\n- [ ] Замовити шпон\n", s)
        self.assertIn("## Сьогодні / Пт 30.10\n- [ ] Позвонить прорабу\n", s)
        self.assertLess(s.index("## Сьогодні / Пт 30.10"), s.index("## Цей тиждень"))   # розділ дня — одразу після шапки

    def test_reminder_with_time_and_due(self):
        r = self.L.handle_text("нагадай завтра о 10 подзвонити Олегу", self.T)
        self.assertIn("нагадаю", r.text)
        self.assertIn("- [ ] 🔔 Подзвонити Олегу (нагадати 30.10 о 10:00)", self.tasks())
        self.L.handle_text("нагадай у п'ятницю полити квіти", self.T)      # той самий день — той самий розділ
        s = self.tasks()
        self.assertEqual(s.count("## Сьогодні / Пт 30.10"), 1)
        self.assertIn("🔔 Полити квіти (нагадати 30.10)", s)
        self.assertEqual(self.L.due_reminders(datetime.datetime(2026, 10, 30, 9, 59)), [])
        self.assertEqual(self.L.due_reminders(datetime.datetime(2026, 10, 30, 10, 0)), ["Подзвонити Олегу"])
        self.assertEqual(self.L.due_reminders(datetime.datetime(2026, 10, 30, 11, 0)), [])   # не дублюється

    def test_reminder_relative_and_russian(self):
        self.L.handle_text("напомни через 30 минут проверить почту", self.T)
        self.assertIn("🔔 Проверить почту (нагадати 29.10 о 14:30)", self.tasks())

    def test_night_rule(self):
        night = datetime.datetime(2026, 10, 30, 1, 30)
        self.L.handle_text("нагадай завтра купити хліб", night)
        self.assertIn("## Сьогодні / Пт 30.10", self.tasks())        # 01:30 «завтра» = та сама календарна дата

    def test_calendar_without_token(self):
        self.L.handle_text("додай задачу сьогодні звіт", self.T)
        os.environ["ASSISTANT_GOOGLE_DIR"] = str(self.tmp / "no-google")
        try:
            r = self.L.handle_text("що в мене сьогодні?", self.T)
        finally:
            os.environ.pop("ASSISTANT_GOOGLE_DIR")
        self.assertIn("не підключено", r.text)
        self.assertIn("Звіт", r.text)


# ---------- пошта: лише кнопкою ----------
class MailTests(Base):
    def setUp(self):
        super().setUp()
        self.sent = []
        self.L.MAIL_SENDER = lambda d: (self.sent.append(d) or True, "надіслано")

    def test_draft_needs_button(self):
        r = self.L.handle_text("надішли лист на client@example.com, тема: Кошторис, текст: Добрий день! Надсилаю кошторис.")
        self.assertEqual(self.sent, [])                                  # без натискання — нічого
        buttons = [b["callback_data"] for b in r.markup["inline_keyboard"][0]]
        self.assertEqual([b.split(":")[1] for b in buttons], ["send", "edit", "drop"])
        did = buttons[0].split(":")[2]
        self.L.handle_text("як справи?")                                 # інші повідомлення лист не надсилають
        self.assertEqual(self.sent, [])
        self.assertIn("Надіслано", self.L.mail_button(f"send:{did}").text)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]["subject"], "Кошторис")
        self.assertIn("вже оброблено", self.L.mail_button(f"send:{did}").text)   # повторне натискання
        self.assertEqual(len(self.sent), 1)

    def test_edit_and_cancel(self):
        r = self.L.handle_text("напиши лист на a@example.com текст: перша версія")
        did = r.markup["inline_keyboard"][0][0]["callback_data"].split(":")[2]
        self.L.mail_button(f"edit:{did}")
        r2 = self.L.handle_text("друга версія листа")
        self.assertIn("друга версія", r2.text)
        self.assertIsNotNone(r2.markup)
        self.L.mail_button(f"drop:{did}")
        self.assertEqual(self.sent, [])
        self.assertIn("вже оброблено", self.L.mail_button(f"send:{did}").text)
        self.assertEqual(self.sent, [])

    def test_do_not_contact_and_limit(self):
        (self.state / "do-not-contact.txt").write_text("@blocked.com\n", encoding="utf-8")
        r = self.L.handle_text("надішли лист на x@blocked.com, текст: привіт")
        self.assertIn("do-not-contact", r.text); self.assertIsNone(r.markup)
        today = datetime.date.today().isoformat()
        (self.state / "mail-log.jsonl").write_text("".join(json.dumps({"t": today + "T09:00:00", "status": "sent"}) + "\n"
                                                           for _ in range(30)), encoding="utf-8")
        r = self.L.handle_text("надішли лист на ok@example.com, текст: привіт")
        self.assertIn("ліміт", r.text); self.assertIsNone(r.markup)

    def test_gmail_policy_and_journal(self):
        g = self.L._gmail()
        raw_calls = []
        g._send_raw = lambda raw: raw_calls.append(raw) or {"id": "m1"}
        (self.state / "do-not-contact.txt").write_text("no@example.com\n", encoding="utf-8")
        with self.assertRaises(g.Refused):
            g.send("no@example.com", "s", "b", "test")
        self.assertEqual(g.send("yes@example.com", "Тема", "Текст", "test"), "m1")
        log = [json.loads(l) for l in (self.state / "mail-log.jsonl").read_text().splitlines()]
        self.assertEqual([l["status"] for l in log], ["refused", "sent"])
        self.assertEqual(len(raw_calls), 1)
        with self.assertRaises(g.Refused):                               # непогоджена черга
            g.send_queue("newsletter")
        r = subprocess.run([sys.executable, str(REPO / "tools/assistant/bin/gmail.py"), "send", "--to", "a@b.c",
                            "--subject", "s", "--body-file", "/dev/null"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)                                # без --confirmed не надсилає


# ---------- брифінг без Claude ----------
class BriefingTests(Base):
    def make_repo(self):
        fake = self.tmp / "repo"
        b = fake / "tools/assistant/bin"
        write_exec(b / "brief-data.sh", "#!/bin/sh\necho '=== Непрочитане в Telegram ==='\n"
                                        "echo '=== Андрій (id 1, user) — непрочитано 2 ==='\necho '=== Нові вхідні ==='\necho '[]'\n")
        write_exec(b / "gcal.py", "import sys\nprint('10:00 Зустріч на обʼєкті')\n")
        write_exec(b / "gmail.py", "print('• Постачальник: Рахунок')\n")
        write_exec(fake / "tools/monobank/mono.sh", "#!/bin/sh\necho 'Витрати: 1000'\n")
        return fake

    def test_template_morning(self):
        os.environ["ASSISTANT_REPO"] = str(self.make_repo())
        try:
            today = datetime.date.today()
            self.L.add_to_day(today, "- [ ] Підписати акт")
            self.L.add_to_day(today, "- [ ] 🔔 Полити квіти (нагадати)")
            import local_briefing
            text = importlib.reload(local_briefing).build("morning")
        finally:
            os.environ.pop("ASSISTANT_REPO")
        for s in ("☀️ Ранок", "10:00 Зустріч", "Підписати акт", "🔔 Нагадування: Полити квіти", "Рахунок", "1 чатів", "Андрій"):
            self.assertIn(s, text)

    def test_run_playbook_falls_back(self):
        fake = self.make_repo()
        bad = write_exec(self.tmp / "claude", "#!/bin/sh\necho 'Please run /login' >&2; exit 1\n")
        env = {**os.environ, "CLAUDE_BIN": str(bad), "ASSISTANT_REPO": str(fake), "HOME": str(self.tmp)}
        r = subprocess.run([str(REPO / "tools/assistant/bin/run-playbook.sh"), "evening"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        msgs = self.tg_messages()
        self.assertEqual(msgs[0], self.L.ENTER_MSG)
        self.assertIn("🌙 Вечір", msgs[1])
        self.assertIn("локальний режим", msgs[1])


if __name__ == "__main__":
    unittest.main()
