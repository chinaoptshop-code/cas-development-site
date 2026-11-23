"""Шар 2: попередній кошторис кодом — ті самі цифри, що калькулятор сайту (tools/tests/calc.mjs), і звірка з casCalcRows у node."""
import json
import pathlib
import shutil
import subprocess
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import estimate as E  # noqa: E402
import params as P  # noqa: E402
from config import REPO  # noqa: E402


def est(items, area=None, sotky=None, region="ua", lang="uk", **kw):
    return E.build({"items": items, "area": area, "sotky": sotky, "region": region, **kw}, lang)


def froms(e):
    return [l["from"] for l in e["lines"]]


class EstimateTests(unittest.TestCase):
    def test_main_scenario_like_calc(self):
        e, i = est({"design": "dz", "reno": "reno", "furn": "furn"}, 60)
        self.assertEqual(froms(e), [2500, 33000, 15000]); self.assertEqual(e["total_from"], 50500)
        self.assertIn("note", e["lines"][0], "мінімум — лише на рядку дизайну")
        self.assertNotIn("note", e["lines"][1])
        e, _ = est({"design": "dz", "reno": "reno", "furn": "furn"}, 100)
        self.assertEqual((froms(e), e["total_from"]), ([3000, 55000, 25000], 83000))
        e, _ = est({"design": "dz", "reno": "reno", "furn": "furn"}, 4)
        self.assertEqual(e["total_from"], 5700)

    def test_design_85(self):
        e, _ = est({"design": "dz"}, 85)
        self.assertEqual((e["lines"][0]["rate"], e["total_from"]), (30, 2550))
        self.assertNotIn("note", e["lines"][0])

    def test_europe(self):
        e, _ = est({"design": "dz", "reno": "reno", "furn": "furn"}, 10, region="eu")
        self.assertEqual((froms(e), e["total_from"], e["region"]), ([4000, 8500, 4000], 16500, "eu"))
        e, i = est({"reno": "office"}, 100, region="eu")
        self.assertEqual((froms(e), e["total_from"], i["est"]), ([None], None, True))
        e, _ = est({"build": "key", "arch": "arch", "land": "land"}, 150, 10, region="eu")
        self.assertEqual((froms(e), e["total_from"]), ([255000, 2700, None], 257700))

    def test_house_types(self):
        e, _ = est({"build": "box"}, 150, house_type="brick")
        self.assertEqual(e["total_from"], 67500); self.assertIn("Цегла", e["lines"][0]["label"])
        e, _ = est({"build": "key"}, 150, house_type="sandwich")
        self.assertEqual(e["total_from"], 67500)
        e, _ = est({"build": "key"}, 100, house_type="timber", region="eu")
        self.assertEqual(e["total_from"], 85000)
        e, _ = est({"build": "box"}, 150, house_type="nope")
        self.assertEqual(e["total_from"], 90000, "невідомий тип — базова ставка")

    def test_box_plus_reno_two_lines_key_plus_reno_one(self):
        e, i = est({"build": "box", "reno": "reno"}, 100)
        self.assertEqual((froms(e), e["total_from"]), ([55000, 60000], 115000))
        self.assertIn("двома рядками", e["note"])
        e, i = est({"build": "key", "reno": "reno"}, 100)
        self.assertEqual(froms(e), [110000]); self.assertIn("уже входить", e["note"])
        self.assertTrue(i["big"], "будинок — великий обʼєкт")

    def test_commercial_and_world(self):
        e, i = est({"design": "dz", "reno": "reno"}, 200, object="restaurant")
        self.assertEqual(froms(e), [6000, None]); self.assertTrue(i["big"]); self.assertIn("Комерційний", e["note"])
        e, i = est({"reno": "reno"}, 120, object="office")
        self.assertEqual(froms(e), [42000], "офіс — своя ставка $350")
        e, i = est({"design": "dz", "reno": "reno"}, 100, region="world")
        self.assertEqual((froms(e), e["total_from"]), ([3000, None], 3000))
        self.assertIn("місцевими підрядниками", e["note"])

    def test_missing(self):
        self.assertEqual(est({}, 50)[1]["missing"], ["items"])
        self.assertEqual(est({"reno": "reno"})[1]["missing"], ["area"])
        self.assertEqual(est({"land": "land"}, 60)[1]["missing"], ["sotky"])
        e, _ = est({"land": "land"}, None, 12.5)
        self.assertEqual(e["total_from"], 625)

    def test_area_rounding_and_cap(self):
        e, _ = est({"reno": "reno"}, 75.6)
        self.assertEqual(e["lines"][0]["qty"], 76)
        e, _ = est({"reno": "reno"}, 5e9)
        self.assertEqual(e["lines"][0]["qty"], 100000)

    def test_schema_limits_and_languages(self):
        for lang in E.LANGS:
            e, _ = est({"design": "full", "reno": "reno", "furn": "furn", "build": "box", "arch": "arch", "land": "land"}, 120, 10, region="eu", lang=lang)
            self.assertLessEqual(len(e["note"]), 500, lang)
            for l in e["lines"]:
                self.assertLessEqual(len(l["label"]), 160); self.assertLessEqual(len(l["unit"]), 12)
            self.assertTrue(e["note"].strip())
        e, _ = est({"reno": "reno"}, 60, lang="en")
        self.assertIn("renovation", e["lines"][0]["label"].lower())
        self.assertEqual(E.usd(33000, "en"), "$33,000"); self.assertEqual(E.usd(33000, "uk"), "$33 000")
        self.assertEqual(E.summary(e, "ar")[-1] != "", True)
        self.assertIn("⁦$33 000⁩", E.summary(est({"reno": "reno"}, 60, lang="ar")[0], "ar"))

    @unittest.skipUnless(shutil.which("node"), "немає node")
    def test_cross_check_with_site_calculator_js(self):
        cases = [({"design": "dz", "reno": "reno", "furn": "furn"}, 60, 0, 0), ({"design": "plan"}, 100, 0, 0), ({"design": "full", "furn": "furn"}, 100, 0, 0),
                 ({"reno": "office"}, 100, 0, 0), ({"build": "box"}, 150, 0, 0), ({"build": "key", "arch": "arch", "land": "land"}, 150, 10, 1),
                 ({"design": "dz", "reno": "reno", "furn": "furn"}, 10, 0, 1), ({"land": "land"}, 60, 12.5, 0), ({"design": "dz"}, 85, 0, 0)]
        sel = {"plan": "design", "dz": "design", "full": "design", "reno": "reno", "office": "reno", "furn": "furn", "box": "build", "key": "build", "arch": "arch", "land": "land"}
        js = ("const vm=require('vm'),fs=require('fs');const c=vm.createContext({});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);"
              "const h=fs.readFileSync(process.argv[2],'utf8');const C=JSON.parse(h.match(/id=\"cCfg\">([\\s\\S]*?)<\\/script>/)[1]);"
              "const cases=JSON.parse(process.argv[3]);console.log(JSON.stringify(cases.map(o=>{const r=c.casCalcRows(C,o);return [r.rows.map(x=>x.v),r.s]})))")
        payload = [{"R": R, "sel": {sel[k]: k for k in items.values()}, "a": a, "s": s} for items, a, s, R in cases]
        out = json.loads(subprocess.run(["node", "-e", js, str(REPO / "assets/calc.v1.js"), str(REPO / "kalkuliator-remontu.html"), json.dumps(payload)],
                                        capture_output=True, text=True, timeout=60, check=True).stdout)
        for (items, a, s, R), (vs, total) in zip(cases, out):
            e, _ = est(items, a, s or None, region="eu" if R else "ua")
            self.assertEqual(froms(e), vs, items); self.assertEqual(e["total_from"] or 0, total, items)

    def test_allowed_numbers(self):
        e, _ = est({"reno": "reno"}, 60)
        nums = E.allowed_numbers(e)
        self.assertIn(33000.0, nums); self.assertIn(2500.0, nums); self.assertNotIn(16500.0, nums)


class ParamsTests(unittest.TestCase):
    def p(self, *texts, lang="uk"):
        d = {"items": {}}
        for t in texts:
            P.from_text(t, d)
        return P.finalize(d, lang)

    def test_uk_basic(self):
        d = self.p("Добрий день, хочу дизайн і ремонт квартири 85 м² у Києві")
        self.assertEqual((d["items"], d["area"], d["region"], d["object"]), ({"design": "dz", "reno": "reno"}, 85, "ua", "apartment"))

    def test_multilang(self):
        d = self.p("We need a turnkey house construction, about 1,600 sq ft in Dubai", lang="en")
        self.assertEqual((d["items"].get("build"), d["region"], d["area"]), ("key", "world", 149))
        d = self.p("Renovierung einer Wohnung, 70 qm, Berlin", lang="de")
        self.assertEqual((d["items"], d["area"], d["region"]), ({"reno": "reno"}, 70, "eu"))
        d = self.p("装修公寓 90平方米", lang="zh")
        self.assertEqual((d["items"], d["area"]), ({"reno": "reno"}, 90))
        d = self.p("Projekt wnętrz mieszkania 60 m2", lang="pl")
        self.assertEqual((d["items"], d["region"]), ({"design": "dz"}, "eu"))

    def test_landscape_not_design(self):
        d = self.p("ландшафтний дизайн ділянки 12 соток")
        self.assertEqual((d["items"], d["sotky"]), ({"land": "land"}, 12))

    def test_box_house_type_and_combo(self):
        d = self.p("Будуємо будинок з газоблоку, коробка 150 м2, потім ремонт")
        self.assertEqual((d["items"], d["house_type"], d["area"]), ({"reno": "reno", "build": "box"}, "brick", 150))
        d = self.p("каркасний будинок 120 м², скільки?")
        self.assertEqual((d["items"], d["house_type"]), ({"build": "box"}, "frame"))
        d = self.p("ремонт квартири в цегляному будинку 50 м²")
        self.assertEqual(d["items"], {"reno": "reno"}, "квартира в цегляному будинку — не будівництво")

    def test_later_message_overrides(self):
        d = self.p("ремонт 60 м²", "ой, 72 м²")
        self.assertEqual(d["area"], 72)

    def test_flags(self):
        d = self.p("Можна з менеджером? Подзвоніть мені +380 67 000 00 00")
        self.assertTrue(d.get("asks_human") and d.get("wants_call") and d.get("phone_given"))
        self.assertTrue(self.p("Це обман, поверніть гроші").get("complaint"))

    def test_model_proposal_guard(self):
        d = {"items": {}}
        P.from_text("Скільки коштує ремонт?", d)
        P.merge_model(d, {"services": ["reno", "hack"], "area": 1, "region": "mars", "house_type": "x"}, ["Скільки коштує ремонт?"])
        self.assertNotIn("area", d, "площу, якої немає в тексті, не беремо")
        self.assertNotIn("region", d)
        P.merge_model(d, {"area": 64}, ["У нас 64 квадрати"])
        self.assertEqual(d["area"], 64.0)


if __name__ == "__main__":
    unittest.main()
