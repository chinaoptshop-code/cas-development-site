#!/usr/bin/env python3
"""Тести меню бота (команди, постійна клавіатура, inline-кнопки) — без мережі, Telegram і Claude.

  python3 -m unittest tools/assistant/bot/test_menu.py -v

Зовнішні скрипти (календар, пошта, Монобанк, brief-data) — фейки у тимчасовому «репозиторії»; Telegram API
підмінено записом викликів; claude — фейк, що рахує запуски (меню не має запускати його взагалі).
Дані — вигадані.
"""
import datetime, importlib, json, os, pathlib, sys, time, unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from test_local_mode import Base, write_exec  # noqa: E402

T = datetime.datetime(2026, 11, 23, 14, 0)      # понеділок


class MenuBase(Base):
    def setUp(self):
        super().setUp()
        fake = self.tmp / "repo"
        b = fake / "tools/assistant/bin"
        write_exec(b / "gcal.py", "import sys\nprint(('завтра' if sys.argv[1] == 'tomorrow' else 'сьогодні') + ': 10:00 Дзвінок з підрядником')\n")
        write_exec(b / "gmail.py", "print('• Постачальник: Рахунок за плитку')\n")
        write_exec(b / "brief-data.sh", "#!/bin/sh\necho '=== Непрочитане в Telegram ==='\n"
                                        "echo '=== Бригада (id 5, group) — непрочитано 3 ==='\necho '=== Нові вхідні ==='\necho '[]'\n")
        self.mono_log = self.tmp / "mono.log"
        write_exec(fake / "tools/monobank/mono.sh", f'#!/bin/sh\necho "$@" >> "{self.mono_log}"\n'
                                                    'if [ "$1" = summary ]; then echo "Витрати: 1000"; else echo "Баланс: 5000"; fi\n')
        os.environ["ASSISTANT_REPO"] = str(fake)
        import menu
        self.L = importlib.reload(self.L)
        self.M = importlib.reload(menu)
        (self.mem / "02 Задачі.md").write_text(
            "# Задачі\n\n## Сьогодні / Пн 23.11\n- [ ] Погодити кошторис\n- [ ] 🔔 Дзвінок з підрядником (нагадати 23.11 о 15:00)\n"
            "- [x] Старе зроблене\n\n## Цей тиждень\n- [ ] Замовити плитку\n- [ ] Підписати акт\n- [ ] Оновити портфоліо\n"
            "- [ ] Шоста задача\n", encoding="utf-8")

    def tearDown(self):
        os.environ.pop("ASSISTANT_REPO", None)
        super().tearDown()

    def ids(self, markup):
        return [b["callback_data"] for row in markup["inline_keyboard"] for b in row]


class ParseTests(MenuBase):
    def test_commands_and_buttons(self):
        P = self.M.parse
        self.assertEqual(P("/today"), ("today", ""))
        self.assertEqual(P("/today@example_bot"), ("today", ""))
        self.assertEqual(P("/remind завтра о 10 дзвінок"), ("remind", "завтра о 10 дзвінок"))
        self.assertEqual(P("📅 Сьогодні"), ("today", ""))
        self.assertEqual(P(" 📥 Вхідні "), ("inbox", ""))
        self.assertEqual(P("✅ Задачі"), ("tasks", ""))
        self.assertEqual(P("💰 Гроші"), ("money", ""))
        for s in ("сьогодні", "що в мене сьогодні?", "/status", "/new", "/local on", "/start", "", None):
            self.assertIsNone(P(s), s)                    # звичайний текст і старі команди — не меню

    def test_every_menu_command_has_handler(self):
        listed = {c for c, _ in self.M.COMMANDS}
        self.assertTrue({"today", "tomorrow", "inbox", "tasks", "remind", "money", "mail", "help"} <= listed)
        for c in listed - {"new", "status"}:              # /new і /status обробляє bot.py, як раніше
            self.assertIn(c, self.M.LOCAL)
        for c, d in self.M.COMMANDS:
            self.assertRegex(c, r"^[a-z0-9_]{1,32}$")
            self.assertTrue(3 <= len(d) <= 256)

    def test_keyboard_format(self):
        kb = self.M.KEYBOARD
        self.assertTrue(kb["is_persistent"] and kb["resize_keyboard"])
        self.assertEqual(len(kb["keyboard"]), 2)
        self.assertEqual({b["text"] for row in kb["keyboard"] for b in row}, set(self.M.BUTTONS))
        self.assertTrue(self.M.valid_markup(kb))
        self.assertTrue(self.M.valid_markup(self.M.HIDE))
        self.assertTrue(self.M.valid_markup(self.M.reminder_markup("abcdef12")))
        json.loads(json.dumps(self.M.commands_payload(), ensure_ascii=False))


class CommandTests(MenuBase):
    def test_today_and_tomorrow(self):
        r, wait = self.M.command("today", "", T)
        self.assertIsNone(wait)
        for s in ("сьогодні: 10:00 Дзвінок з підрядником", "Погодити кошторис", "🔔 Дзвінок з підрядником", "Замовити плитку"):
            self.assertIn(s, r.text)
        self.assertNotIn("Старе зроблене", r.text)
        self.assertEqual(self.ids(r.markup), ["m:c:tomorrow", "m:c:today"])
        self.assertEqual([b["text"] for b in r.markup["inline_keyboard"][0]], ["📅 Завтра", "🔄 Оновити"])
        r, _ = self.M.command("tomorrow", "", T)
        self.assertIn("завтра: 10:00", r.text)
        self.assertEqual(self.ids(r.markup), ["m:c:today", "m:c:tomorrow"])
        self.assertTrue(self.M.valid_markup(r.markup))

    def test_free_text_today_also_has_buttons(self):
        r = self.L.handle_text("що в мене сьогодні?", T)
        self.assertEqual(self.ids(r.markup), ["m:c:tomorrow", "m:c:today"])
        self.assertIsNone(self.L.handle_text("що в мене на тижні?", T).markup)

    def test_tasks_list_buttons(self):
        r, _ = self.M.command("tasks", "", T)
        self.assertIn("1. Погодити кошторис", r.text)
        self.assertIn("6. Шоста задача", r.text)
        ids = self.ids(r.markup)
        self.assertEqual(len(ids), 6)                      # 5 «Виконано» + «Нова»
        self.assertEqual(ids[-1], "m:new")
        self.assertTrue(all(i.startswith("m:d:") and len(i) == 12 for i in ids[:5]))
        self.assertTrue(self.M.valid_markup(r.markup))

    def test_tasks_empty(self):
        (self.mem / "02 Задачі.md").write_text("# Задачі\n", encoding="utf-8")
        r, _ = self.M.command("tasks", "", T)
        self.assertIn("немає", r.text)
        self.assertEqual(self.ids(r.markup), ["m:new"])

    def test_inbox(self):
        r, _ = self.M.command("inbox", "", T)
        self.assertIn("📥 Вхідні", r.text)
        self.assertIn("Бригада", r.text)
        self.assertIn("Рахунок за плитку", r.text)

    def test_money_and_mail(self):
        self.assertIn("Баланс: 5000", self.M.command("money", "", T)[0].text)
        self.assertIn("Витрати: 1000", self.M.command("money", "витрати місяць", T)[0].text)
        self.assertEqual(self.mono_log.read_text().splitlines(), ["balance", "summary --days 30"])
        self.assertIn("Рахунок за плитку", self.M.command("mail", "", T)[0].text)

    def test_remind_with_and_without_text(self):
        r, wait = self.M.command("remind", "завтра о 10 дзвінок з підрядником", T)
        self.assertIsNone(wait)
        self.assertIn("нагадаю", r.text)
        self.assertIn("🔔 Дзвінок з підрядником (нагадати 24.11 о 10:00)", self.tasks())
        r, wait = self.M.command("remind", "", T)
        self.assertEqual(wait, "remind")
        r = self.M.awaited("remind", "через 30 хв перевірити пошту", T)
        self.assertIn("Перевірити пошту (нагадати 23.11 о 14:30)", self.tasks())

    def test_help_menu_hide(self):
        r, _ = self.M.command("help", "", T)
        self.assertIn("/today", r.text); self.assertEqual(r.markup, self.M.KEYBOARD)
        self.assertEqual(self.M.command("menu", "", T)[0].markup, self.M.KEYBOARD)
        self.assertEqual(self.M.command("hide", "", T)[0].markup, {"remove_keyboard": True})


class ButtonTests(MenuBase):
    def test_done_is_idempotent(self):
        tid = self.M.task_id("Замовити плитку")
        b = self.M.button(f"m:d:{tid}", T)
        self.assertIn("Замовити плитку", b.toast)
        self.assertIn("- [x] Замовити плитку", self.tasks())
        self.assertNotIn("Замовити плитку", b.edit.text)    # оновлений список без закритої
        before = self.tasks()
        b2 = self.M.button(f"m:d:{tid}", T)                 # повторне натискання
        self.assertEqual(b2.toast, "Вже виконано")
        self.assertIsNone(b2.edit)
        self.assertEqual(self.tasks(), before)
        self.assertIn("не знайдено", self.M.button("m:d:00000000", T).toast)

    def test_new_task_flow(self):
        b = self.M.button("m:new", T)
        self.assertEqual(b.await_kind, "task")
        r = self.M.awaited("task", "завтра купити фарбу", T)
        self.assertIn("Записав", r.text)
        self.assertIn("## Сьогодні / Вт 24.11\n- [ ] Купити фарбу", self.tasks())

    def test_calendar_buttons(self):
        b = self.M.button("m:c:tomorrow", T)
        self.assertIn("завтра: 10:00", b.edit.text)
        self.assertEqual(self.ids(b.edit.markup)[0], "m:c:today")
        self.assertEqual(self.M.button("m:c:evil", T).toast, "Невідома кнопка")

    def test_reminder_snooze_and_done(self):
        self.L.schedule_reminder(datetime.datetime(2026, 11, 23, 15, 0), "Дзвінок з підрядником")
        due = self.M.due_reminders(datetime.datetime(2026, 11, 23, 15, 1))
        self.assertEqual([d["text"] for d in due], ["Дзвінок з підрядником"])
        self.assertEqual(self.M.due_reminders(datetime.datetime(2026, 11, 23, 15, 2)), [])   # не дублюється
        rid = due[0]["id"]
        now = datetime.datetime(2026, 11, 23, 15, 1)
        b = self.M.button(f"m:rh:{rid}", now)
        self.assertIn("о 16:01", b.note)
        self.assertIn("Вже оброблено", self.M.button(f"m:rt:{rid}", now).toast)      # повторне — без нової дії
        self.assertEqual(len(json.loads((self.state / "reminders.json").read_text())), 2)
        again = self.M.due_reminders(datetime.datetime(2026, 11, 23, 16, 1))
        self.assertEqual(len(again), 1)
        b = self.M.button(f"m:rt:{again[0]['id']}", now)
        self.assertIn("Вт 24.11 о 10:00", b.note)
        third = self.M.due_reminders(datetime.datetime(2026, 11, 24, 10, 0))
        b = self.M.button(f"m:rd:{third[0]['id']}", now)
        self.assertIn("Готово", b.note)
        self.assertIn("- [x] 🔔 Дзвінок з підрядником", self.tasks())
        self.assertIn("Вже оброблено", self.M.button(f"m:rd:{third[0]['id']}", now).toast)

    def test_night_rule_tomorrow_10(self):
        self.L.schedule_reminder(datetime.datetime(2026, 11, 24, 1, 0), "Перевірити рахунок")
        rid = self.M.due_reminders(datetime.datetime(2026, 11, 24, 1, 0))[0]["id"]
        b = self.M.button(f"m:rt:{rid}", datetime.datetime(2026, 11, 24, 1, 5))
        self.assertIn("Вт 24.11 о 10:00", b.note)          # 01:05 «завтра» = та сама дата


# ---------- через bot.py: Claude не викликається, чужі ігноруються, формат API ----------
class BotMenuTests(MenuBase):
    def setUp(self):
        super().setUp()
        os.environ.update({"ASSISTANT_BOT_TOKEN": "test-token", "ASSISTANT_CHAT_ID": "1", "ASSISTANT_GROUPS": ""})
        self.calls = self.tmp / "claude-calls"
        os.environ["CLAUDE_BIN"] = str(write_exec(self.tmp / "claude", f'#!/bin/sh\necho x >> "{self.calls}"\n'
                                                  'printf "===ВІДПОВІДЬ===\\nВід Claude\\n===КІНЕЦЬ===\\n"\n'))
        import bot
        self.bot = importlib.reload(bot)
        self.sent, self.api_calls = [], []
        self.bot.send_text = lambda text, chat=None, reply_to=None, markup=None: self.sent.append((text, markup, chat)) or {"message_id": 7}
        self.bot.api = lambda method, **p: self.api_calls.append((method, p)) or ([] if method == "getMyCommands" else {})
        self.bot.MEMORY_SYNC = self.tmp / "no-sync"
        self.bot.LOG = lambda *a: None

    def tearDown(self):
        for k in ("ASSISTANT_BOT_TOKEN", "ASSISTANT_CHAT_ID", "ASSISTANT_GROUPS", "CLAUDE_BIN"):
            os.environ.pop(k, None)
        super().tearDown()

    def cq(self, data, uid=1, chat=1, text="старе повідомлення"):
        return {"id": "q1", "from": {"id": uid}, "data": data, "message": {"message_id": 42, "chat": {"id": chat}, "text": text}}

    def test_commands_without_claude(self):
        state = {}
        for txt in ("/today", "📅 Сьогодні", "/tomorrow", "✅ Задачі", "💰 Гроші", "/mail", "📥 Вхідні", "/help", "/menu", "/hide"):
            self.bot.handle({"text": txt, "chat": {"id": 1}}, state)
        self.assertFalse(self.calls.exists())               # жодного запуску Claude
        self.assertEqual(len(self.sent), 10)
        self.assertIn("Погодити кошторис", self.sent[0][0])
        self.assertEqual(self.sent[-2][1], self.M.KEYBOARD)
        self.assertEqual(self.sent[-1][1], {"remove_keyboard": True})
        for _, markup, _ in self.sent:
            if markup:
                self.assertTrue(self.M.valid_markup(markup))
        self.bot.handle({"text": "розкажи про плитку"}, state)   # звичайний текст — як раніше, у Claude
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)
        self.assertEqual(self.sent[-1][0], "Від Claude")

    def test_commands_in_local_mode(self):
        state = {}
        self.bot.handle({"text": "/local on"}, state)
        self.bot.handle({"text": "📅 Сьогодні"}, state)
        self.assertIn("Дзвінок з підрядником", self.sent[-1][0])
        self.assertFalse(self.calls.exists())

    def test_new_task_button_then_text(self):
        state = {}
        self.bot.on_button(self.cq("m:new"), state)
        self.assertEqual(state["menu_await"]["kind"], "task")
        self.bot.handle({"text": "купити фарбу"}, state)
        self.assertIn("Записав", self.sent[-1][0])
        self.assertIn("- [ ] Купити фарбу", self.tasks())
        self.assertNotIn("menu_await", state)
        self.assertFalse(self.calls.exists())
        self.bot.handle({"text": "/remind"}, state)          # очікування нагадування; команда скасовує попереднє
        self.assertEqual(state["menu_await"]["kind"], "remind")
        state["menu_await"]["at"] = time.time() - 11 * 60   # прострочене очікування — текст іде в Claude
        self.bot.handle({"text": "що думаєш про фарбу?"}, state)
        self.assertEqual(self.sent[-1][0], "Від Claude")

    def test_done_button_edits_message_and_is_idempotent(self):
        state = {}
        tid = self.M.task_id("Підписати акт")
        self.bot.on_button(self.cq(f"m:d:{tid}"), state)
        edits = [p for m, p in self.api_calls if m == "editMessageText"]
        self.assertEqual(edits[-1]["message_id"], 42)
        self.assertNotIn("Підписати акт", edits[-1]["text"])
        self.assertTrue(self.M.valid_markup(json.loads(edits[-1]["reply_markup"])))
        n = len(edits)
        self.bot.on_button(self.cq(f"m:d:{tid}"), state)
        self.assertEqual(len([1 for m, _ in self.api_calls if m == "editMessageText"]), n)   # друге — без змін
        toasts = [p["text"] for m, p in self.api_calls if m == "answerCallbackQuery"]
        self.assertEqual(toasts[-1], "Вже виконано")
        self.assertEqual(self.tasks().count("- [x] Підписати акт"), 1)

    def test_foreign_user_and_chat_ignored(self):
        state = {}
        before = self.tasks()
        tid = self.M.task_id("Підписати акт")
        self.bot.on_button(self.cq(f"m:d:{tid}", uid=999), state)
        self.bot.on_button(self.cq(f"m:d:{tid}", uid=1, chat=-100500), state)
        self.assertEqual(self.tasks(), before)
        self.assertFalse([1 for m, _ in self.api_calls if m == "editMessageText"])
        # чужий особистий чат з командою — не меню власника, а стандартна відповідь для клієнта
        self.bot.ME = {"id": 77, "username": "example_bot"}
        self.bot.role_of = lambda uid, st: "client"
        self.bot.handle_external({"text": "/tasks", "chat": {"id": 555, "type": "private"}, "from": {"id": 555},
                                  "message_id": 3}, state)
        self.assertTrue(all("Погодити кошторис" not in t for t, _, _ in self.sent))
        self.assertFalse(self.calls.exists())

    def test_reminder_fired_has_buttons_and_snooze(self):
        state = {}
        self.L.schedule_reminder(datetime.datetime.now() - datetime.timedelta(minutes=1), "Дзвінок з підрядником")
        due = self.M.due_reminders()
        mk = self.M.reminder_markup(due[0]["id"])
        self.assertEqual([b["text"] for b in mk["inline_keyboard"][0]], ["⏰ +1 год", "🌙 Завтра 10:00", "✅ Готово"])
        self.bot.on_button(self.cq(mk["inline_keyboard"][0][0]["callback_data"], text="🔔 Нагадування: Дзвінок з підрядником"), state)
        edit = [p for m, p in self.api_calls if m == "editMessageText"][-1]
        self.assertIn("⏰ Нагадаю", edit["text"])
        self.assertEqual(json.loads(edit["reply_markup"]), {"inline_keyboard": []})

    def test_sync_commands_idempotent(self):
        self.bot.sync_commands()
        sets = [p for m, p in self.api_calls if m == "setMyCommands"]
        self.assertEqual(len(sets), 1)
        self.assertEqual(json.loads(sets[0]["scope"]), {"type": "chat", "chat_id": 1})
        self.assertEqual(json.loads(sets[0]["commands"]), self.M.commands_payload())
        want = self.M.commands_payload()
        self.bot.api = lambda method, **p: self.api_calls.append((method, p)) or (want if method == "getMyCommands" else {})
        self.bot.sync_commands()                            # уже такі самі — setMyCommands не викликається
        self.assertEqual(len([1 for m, _ in self.api_calls if m == "setMyCommands"]), 1)

    def test_start_shows_keyboard(self):
        self.bot.handle({"text": "/start"}, {})
        self.assertEqual(self.sent[-1][1], self.M.KEYBOARD)


if __name__ == "__main__":
    unittest.main()
