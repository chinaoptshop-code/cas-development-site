"""Розбір файлів відвідувача → «паспорт файлу» (що це, ключові числа, витяг тексту, попередження). НІКОЛИ не падає.

analyze(bytes, meta, lang) — у тимчасовій теці під службовим імʼям, в окремому процесі (parse_one.py) з тайм-аутом і лімітами
CPU/памʼяті; тимчасова тека видаляється одразу після розбору. Імʼя файлу від відвідувача — лише підпис (обрізаний, без шляхів).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from .common import fail, passport

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = {"image": ("jpg", "jpeg", "png", "webp", "heic", "heif"), "video": ("mp4", "mov", "webm", "m4v"),
       "audio": ("webm", "ogg", "oga", "opus", "mp3", "m4a", "aac", "wav"), "pdf": ("pdf",), "sheet": ("xlsx", "xlsm", "xls", "csv"),
       "doc": ("docx", "doc"), "cad": ("dwg", "dxf"), "model": ("3ds", "skp", "ifc", "rvt"), "archive": ("zip",)}
DEFAULT_EXT = {"image": "jpg", "video": "mp4", "audio": "ogg", "pdf": "pdf", "sheet": "xlsx", "doc": "docx", "cad": "dxf", "model": "3ds", "archive": "zip"}
MANAGER = {"skp": "модель SketchUp", "ifc": "модель IFC", "rvt": "модель Revit", "zip": "архів ZIP", "doc": "документ Word (.doc)"}
IMPORTANT = ("pdf", "sheet", "doc", "cad", "model", "archive")   # невдалий розбір → handoff complex


def display_name(name):
    n = os.path.basename(str(name or "файл").replace("\\", "/"))
    n = re.sub(r"[\x00-\x1f‪-‮⁦-⁩<>]", "", n).strip() or "файл"
    return n if len(n) <= 60 else n[:40] + "…" + n[-15:]


def ext_of(meta):
    kind = meta.get("kind") or ""
    m = re.search(r"\.([A-Za-z0-9]{1,5})$", str(meta.get("name") or ""))
    e = m.group(1).lower() if m else ""
    return e if e in EXT.get(kind, ()) else DEFAULT_EXT.get(kind, "bin")


def sniff(kind, ext, head):
    """Уточнити тип за сигнатурою (сайт уже перевірив, але назва може брехати)."""
    if kind == "cad":
        return "dwg" if head[:4] == b"AC10" else "dxf"
    if kind == "model" and head[:2] == b"MM":
        return "3ds"
    if kind == "sheet" and ext in ("xlsx", "xlsm") and head[:2] != b"PK":
        return "xls" if head[:4] == b"\xd0\xcf\x11\xe0" else "csv"
    if kind == "doc" and head[:4] == b"\xd0\xcf\x11\xe0":
        return "doc"
    return ext


def run_parser(path, kind, ext, lang, work):
    """У поточному процесі (дочірній процес викликає саме це)."""
    from . import cad, docs, media
    if ext in MANAGER:
        return passport(kind, MANAGER[ext], ok=False, manager=True, summary=MANAGER[ext].capitalize() + " — для менеджера", for_manager=True)
    fn = {"image": lambda: media.image(path, work, lang), "audio": lambda: media.audio(path, work, lang),
          "video": lambda: media.video(path, work, lang), "pdf": lambda: docs.pdf(path, work, lang),
          "sheet": lambda: docs.sheet(path, work, lang, ext), "doc": lambda: docs.docx(path, work, lang),
          "cad": lambda: cad.dwg(path, work, lang) if ext == "dwg" else cad.dxf(path, work, lang),
          "model": lambda: cad.model3ds(path, work, lang)}.get(kind)
    if not fn:
        return fail(kind or "file", "файл", "невідомий тип файлу")
    try:
        return fn()
    except MemoryError:
        return fail(kind, "файл", "файл завеликий для розбору")
    except Exception as e:
        return fail(kind, "файл", f"розбір не вдався ({type(e).__name__})", manager=kind in IMPORTANT)


def _limits(cpu):
    def f():
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 5))
            if sys.platform.startswith("linux"):
                resource.setrlimit(resource.RLIMIT_AS, (3 << 30, 3 << 30))
        except Exception:
            pass
    return f


def analyze(data, meta, lang="uk", timeout=240, tmp_root=None, inproc=False):
    name = display_name(meta.get("name"))
    kind = meta.get("kind") or ""
    ext = sniff(kind, ext_of(meta), data[:8])
    work = tempfile.mkdtemp(prefix="caschat-", dir=tmp_root or None)
    try:
        path = os.path.join(work, "in." + ext)
        with open(path, "wb") as f:
            f.write(data)
        if inproc:
            p = run_parser(path, kind, ext, lang, work)
        else:
            try:
                r = subprocess.run([sys.executable, os.path.join(os.path.dirname(HERE), "parse_one.py"), path, kind, ext, lang, work],
                                   capture_output=True, timeout=timeout, cwd=work, stdin=subprocess.DEVNULL, preexec_fn=_limits(max(10, int(timeout) + 5)) if os.name == "posix" else None)
                p = json.loads(r.stdout.decode("utf-8", "replace").strip().splitlines()[-1]) if r.returncode == 0 and r.stdout.strip() else \
                    fail(kind, "файл", "розбір завершився з помилкою", manager=kind in IMPORTANT)
            except subprocess.TimeoutExpired:
                p = fail(kind, "файл", f"розбір довше {int(timeout)} с — перегляне менеджер", manager=kind in IMPORTANT)
            except (ValueError, IndexError):
                p = fail(kind, "файл", "розбір повернув некоректні дані", manager=kind in IMPORTANT)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    u = p.pop("usage", None)   # витрати vision дочірнього процесу → облік воркера (usage.py)
    if u and not inproc:
        import ollama
        if ollama.METER:
            ollama.METER("local", tokens=u.get("tokens", 0), seconds=u.get("seconds", 0), calls=u.get("calls", 1))
    p["name"], p["ext"], p["size"] = name, ext, len(data)
    p["important"] = kind in IMPORTANT
    p["voice"] = kind == "audio" and str(meta.get("name") or "").startswith("voice-")
    return p
