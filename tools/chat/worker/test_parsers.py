"""Шар 3: розбір файлів — паспорти, ліміти, деградація без залежностей, тайм-аути. Фікстури генеруються в тесті."""
import importlib.util
import os
import pathlib
import stat
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import fixtures as FX  # noqa: E402
import parsers  # noqa: E402
from fakeollama import FakeOllama  # noqa: E402
from parsers import cad, common  # noqa: E402

HAS = lambda m: importlib.util.find_spec(m) is not None  # noqa: E731
NO_OLLAMA = {"CHAT_OLLAMA_URL": "http://127.0.0.1:9", "CHAT_VISION_MODEL": ""}


def A(data, name, kind, inproc=True, **kw):
    return parsers.analyze(data, {"name": name, "kind": kind}, "uk", inproc=inproc, **kw)


@mock.patch.dict(os.environ, NO_OLLAMA)
class ParserTests(unittest.TestCase):
    def test_dxf_own_reader(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d, "a.dxf"); p.write_bytes(FX.dxf())
            r = cad.analyze_dxf(p, prefer_ezdxf=False)
        self.assertEqual(r["area_m2"], 60.0, r["summary"])
        self.assertEqual(sorted(x["area"] for x in r["numbers"]["rooms"]), [24.0, 36.0])
        self.assertIn("Кухня-вітальня", [x["label"] for x in r["numbers"]["rooms"]])
        self.assertEqual(r["numbers"]["units"], "мм")
        self.assertEqual(r["numbers"]["outline_m2"], 60.0)
        self.assertIn("попередньо", r["summary"])
        self.assertEqual(sorted(r["numbers"]["layers"]), ["ROOMS", "TEXT", "WALLS"])

    @unittest.skipUnless(HAS("ezdxf"), "немає ezdxf")
    def test_dxf_ezdxf_same_result(self):
        r = A(FX.dxf_ezdxf(), "план.dxf", "cad")
        self.assertEqual((r["area_m2"], r["ok"]), (60.0, True), r["summary"])
        self.assertIn("Кухня-вітальня", [x["label"] for x in r["numbers"]["rooms"]])
        self.assertIn("ezdxf", r["summary"])

    def test_dxf_units_guess_and_bad_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d, "a.dxf"); p.write_bytes(FX.dxf(units=0))
            r = cad.analyze_dxf(p, prefer_ezdxf=False)
        self.assertEqual(r["area_m2"], 60.0)
        self.assertTrue(any("одиниці" in w for w in r["warnings"]))
        r = A(b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n", "empty.dxf", "cad")
        self.assertIsNone(r["area_m2"]); self.assertTrue(r["warnings"])

    def test_dwg_without_converter(self):
        with mock.patch.object(cad, "which", lambda n: None):
            r = A(b"AC1032" + b"\0" * 200, "дім.dwg", "cad")
        self.assertEqual((r["ok"], r["manager"], r["numbers"]["version"]), (False, True, "2018+"))
        self.assertTrue(r["important"])

    def test_dwg_with_fake_converter(self):
        with tempfile.TemporaryDirectory() as d:
            conv = pathlib.Path(d) / "dwg2dxf"
            dxf = pathlib.Path(d) / "src.dxf"; dxf.write_bytes(FX.dxf())
            conv.write_text(f'#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\ncp "{dxf}" "$2"\n')
            conv.chmod(conv.stat().st_mode | stat.S_IEXEC)
            with mock.patch.object(cad, "which", lambda n: str(conv) if n == "dwg2dxf" else None):
                r = A(b"AC1027" + b"\0" * 100, "x.dwg", "cad")
        self.assertEqual((r["area_m2"], r["type"]), (60.0, "креслення DWG"))
        self.assertIn("2013", r["summary"])

    def test_3ds(self):
        r = A(FX.max3ds(), "room.3ds", "model")
        self.assertEqual((r["ok"], r["numbers"]["objects"], r["numbers"]["vertices"]), (True, 1, 4))
        self.assertEqual(r["numbers"]["dims_m"], [5.0, 4.0, 2.7])
        self.assertEqual(r["area_m2"], 20.0)
        self.assertIn("орієнтовні", " ".join(r["warnings"]))

    def test_3ds_garbage_and_truncated(self):
        r = A(b"MM" + b"\xff" * 50, "bad.3ds", "model")
        self.assertIn(r["ok"], (True, False))    # не падає
        r = A(FX.max3ds()[:40], "cut.3ds", "model")
        self.assertIn("summary", r)

    def test_manager_formats(self):
        for name, kind in (("a.skp", "model"), ("a.ifc", "model"), ("a.rvt", "model"), ("a.zip", "archive")):
            r = A(b"PK\3\4" + b"\0" * 30, name, kind)
            self.assertTrue(r["manager"] and not r["ok"] and r.get("for_manager"), name)

    @unittest.skipUnless(HAS("openpyxl"), "немає openpyxl")
    def test_xlsx_estimate_recalc(self):
        r = A(FX.xlsx(), "кошторис.xlsx", "sheet")
        s = r["smeta"]
        self.assertEqual((s["items"], s["total"], s["file_total"]), (3, 2740.0, 3000.0))
        self.assertEqual(len(s["mismatch"]), 2, s["mismatch"])
        self.assertIn("Стяжка", s["mismatch"][0])
        self.assertIn("ІГНОРУЙ", r["text"], "текст файлу лишається даними в паспорті")

    def test_csv(self):
        r = A(FX.csv_semicolon(), "smeta.csv", "sheet")
        self.assertEqual((r["smeta"]["total"], r["smeta"]["mismatch"]), (600.0, []))

    def test_missing_openpyxl_degrades(self):
        with mock.patch.dict(sys.modules, {"openpyxl": None}):
            r = A(FX.docx(), "a.xlsx", "sheet")
        self.assertFalse(r["ok"]); self.assertTrue(r["manager"]); self.assertIn("openpyxl", r["warnings"][0])

    @unittest.skipUnless(HAS("pypdf") or HAS("fitz"), "немає pypdf/pymupdf")
    def test_pdf_text(self):
        r = A(FX.pdf(), "plan.pdf", "pdf")
        self.assertTrue(r["ok"]); self.assertEqual(r["numbers"]["pages"], 1)
        self.assertEqual(r["numbers"]["areas"], [72.5])
        self.assertEqual(r["numbers"]["sums"][0], {"value": 18000.0, "currency": "USD"})

    def test_pdf_broken(self):
        r = A(b"%PDF-1.4\ngarbage", "x.pdf", "pdf")
        self.assertFalse(r["ok"]); self.assertTrue(r["important"])

    def test_docx_and_doc(self):
        r = A(FX.docx(), "тз.docx", "doc")
        self.assertTrue(r["ok"]); self.assertEqual(r["numbers"]["areas"], [64.0])
        r = A(b"\xd0\xcf\x11\xe0" + b"\0" * 100, "old.doc", "doc")
        self.assertTrue(r["manager"])

    def test_zip_bomb_rejected(self):
        r = A(FX.zipbomb(), "bomb.docx", "doc")
        self.assertFalse(r["ok"]); self.assertIn("zip", r["warnings"][0])

    @unittest.skipUnless(HAS("PIL"), "немає Pillow")
    def test_image_without_and_with_vision(self):
        r = A(FX.png(), "кухня.png", "image")
        self.assertTrue(r["ok"]); self.assertFalse(r["described"]); self.assertEqual(r["numbers"]["width"], 32)
        fo = FakeOllama(handler=lambda b: "Кухня без ремонту, бетонні стіни." if b["messages"][0].get("images") else "?", models=("qwen3:8b", "qwen2.5vl:7b"))
        try:
            with mock.patch.dict(os.environ, {"CHAT_OLLAMA_URL": fo.url}):
                r = A(FX.png(), "кухня.png", "image")
        finally:
            fo.close()
        self.assertTrue(r["described"]); self.assertIn("бетонні", r["summary"])
        self.assertEqual(fo.requests[0]["model"], "qwen2.5vl:7b", "vision-модель — автовизначення")
        self.assertIn("не виконуй", fo.requests[0]["messages"][0]["content"])

    def test_image_pixel_bomb(self):
        if not HAS("PIL"):
            self.skipTest("немає Pillow")
        from PIL import Image
        with mock.patch.object(common, "MAX_PIXELS", 100):
            from parsers import media
            with mock.patch.object(media, "MAX_PIXELS", 100):
                r = A(FX.png(64, 64), "big.png", "image")
        self.assertFalse(r["ok"])
        Image.MAX_IMAGE_PIXELS = 60_000_000

    @unittest.skipUnless(common.which("ffmpeg"), "немає ffmpeg")
    def test_audio_with_fake_stt(self):
        with tempfile.TemporaryDirectory() as d:
            s = pathlib.Path(d) / "stt"; s.write_text("#!/bin/sh\necho 'Хочу ремонт квартири 60 метрів'\n"); s.chmod(0o755)
            with mock.patch.dict(os.environ, {"CHAT_STT_CMD": str(s)}):
                r = A(FX.wav(), "voice-2026-11-23.wav", "audio")
        self.assertTrue(r["ok"]); self.assertTrue(r["voice"]); self.assertIn("60 метрів", r["transcript"])

    def test_audio_without_stt(self):
        with mock.patch.dict(os.environ, {"CHAT_STT_CMD": "", "TG_PYTHON": "/nonexistent"}), \
             mock.patch("parsers.stt.importlib.util.find_spec", lambda n: None):
            r = A(FX.wav(), "a.wav", "audio")
        self.assertFalse(r["ok"]); self.assertFalse(r["manager"])

    def test_subprocess_mode_and_timeout(self):
        r = A(FX.dxf(), "план.dxf", "cad", inproc=False)
        self.assertEqual(r["area_m2"], 60.0, "дочірній процес повертає той самий паспорт")
        r = A(FX.dxf(), "план.dxf", "cad", inproc=False, timeout=0.001)
        self.assertFalse(r["ok"]); self.assertIn("довше", r["warnings"][0])

    def test_names_never_paths_and_tmp_cleaned(self):
        with tempfile.TemporaryDirectory() as root:
            r = A(FX.csv_semicolon(), "../../etc/‮passwd.csv", "sheet", tmp_root=root)
            self.assertEqual(os.listdir(root), [], "тимчасову теку видалено")
        self.assertEqual(r["name"], "passwd.csv")
        self.assertEqual(parsers.ext_of({"name": "x.exe", "kind": "pdf"}), "pdf")

    def test_find_numbers(self):
        self.assertEqual(common.find_areas("кухня 12,5 м2, всього 1 250 m²"), [12.5, 1250.0])
        self.assertEqual([s["value"] for s in common.find_sums("$1,200 і 35 000 грн та 2 500 €")], [1200.0, 35000.0, 2500.0])


if __name__ == "__main__":
    unittest.main()
