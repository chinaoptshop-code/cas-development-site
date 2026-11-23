"""python3 -m unittest discover -s tools/leadbot -p 'test_*.py'"""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen      # noqa: E402
import intent   # noqa: E402


class Cases(unittest.TestCase):
    def test_cases(self):
        with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as f:
            cases = json.load(f)
        self.assertGreaterEqual(len(cases), 30)
        for c in cases:
            r = intent.classify(c["t"])
            self.assertEqual(r["verdict"], c["v"], f"{c['t'][:70]!r} → {r}")

    def test_kinds(self):
        self.assertEqual(intent.classify("Шукаю роботу, електрик")["kind"], "jobseek")
        self.assertEqual(intent.classify("Вакансія: продавець, зарплата 25 000")["kind"], "vacancy")
        self.assertEqual(intent.classify("Запрошуємо до нашого магазину")["kind"], "ad")
        self.assertIsNone(intent.classify("Шукаю бригаду на ремонт")["kind"])

    def test_keycap_phone_and_reasons(self):
        r = intent.classify("Заходьте! 0️⃣9️⃣7️⃣0️⃣0️⃣0️⃣0️⃣0️⃣0️⃣0️⃣")
        self.assertIn("номер телефону в оголошенні", r["reasons"])
        self.assertEqual(r["verdict"], "offer")

    def test_empty_and_types(self):
        for v in (None, "", 0, "   "):
            self.assertEqual(intent.classify(v)["verdict"], "unclear")

    def test_site_copy_is_fresh(self):
        self.assertEqual(gen.render(), gen.current(), "запусти python3 tools/leadbot/gen.py")

    def test_cli(self):
        out = subprocess.run([sys.executable, os.path.join(HERE, "intent.py"), "--json", "Шукаю", "дизайнера"], capture_output=True, text=True)
        self.assertEqual(json.loads(out.stdout)["verdict"], "request")


if __name__ == "__main__":
    unittest.main()
