"""Фото, аудіо, відео."""
import json
import os

from . import stt, vision
from .common import MAX_PIXELS, MAX_VIDEO_S, fail, passport, run, which


def image(path, work, lang):
    info, small = {}, None
    try:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS          # захист від «бомби пікселів»
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except ImportError:
            pass
        with Image.open(path) as im:
            info = {"width": im.width, "height": im.height, "format": im.format}
            im.draft("RGB", (1600, 1600))
            im = im.convert("RGB")
            im.thumbnail((1024, 1024))
            small = os.path.join(work, "small.jpg")
            im.save(small, "JPEG", quality=82)
    except ImportError:
        with open(path, "rb") as f:
            head = f.read(12)
        if head[:3] == b"\xff\xd8\xff" or head[:8] == b"\x89PNG\r\n\x1a\n" or head[8:12] == b"WEBP":
            small = path if os.path.getsize(path) <= 8 * 1024 * 1024 else None
    except Exception as e:  # пошкоджене / завелике
        return fail("image", "фото", f"не вдалося відкрити фото ({type(e).__name__})", manager=False)
    desc, model = vision.describe([small]) if small else (None, None)
    size = f"{info['width']}×{info['height']}" if info else ""
    warn = [] if desc else ["опис фото недоступний (немає vision-моделі Ollama)" if not model else "vision-модель не відповіла"]
    return passport("image", "фото", ok=True, summary=("Фото " + size).strip() + (": " + desc if desc else ""), text=desc or "",
                    numbers=info, warnings=warn, described=bool(desc))


def probe(path):
    fp = which("ffprobe")
    if not fp:
        return {}
    code, out, _ = run([fp, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)], timeout=30)
    if code:
        return {}
    try:
        d = json.loads(out or b"{}")
    except ValueError:
        return {}
    dur = float((d.get("format") or {}).get("duration") or 0) or None
    kinds = [s.get("codec_type") for s in d.get("streams", [])]
    return {"duration": dur, "video": "video" in kinds, "audio": "audio" in kinds}


def audio(path, work, lang):
    meta = probe(path)
    text, why = stt.transcribe(path, lang, workdir=work)
    if not text:
        return passport("audio", "аудіо", ok=False, warnings=[why], numbers=meta, manager=False, transcript="")
    dur = " %.0f с" % meta["duration"] if meta.get("duration") else ""
    return passport("audio", "аудіо", ok=True, summary="Аудіо" + dur + ", розпізнано",
                    text=text, numbers=meta, transcript=text)


def video(path, work, lang):
    ff = which("ffmpeg")
    if not ff:
        return fail("video", "відео", "немає ffmpeg — відео перегляне менеджер", manager=False)
    meta = probe(path)
    dur = min(meta.get("duration") or 30.0, MAX_VIDEO_S)
    warns = []
    if (meta.get("duration") or 0) > MAX_VIDEO_S:
        warns.append(f"відео довше за {MAX_VIDEO_S // 60} хв — переглянуто лише початок")
    n = 6 if dur >= 20 else 4
    frames = []
    for i in range(n):
        out = os.path.join(work, f"f{i}.jpg")
        t = dur * (i + 0.5) / n
        code, _, _ = run([ff, "-nostdin", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=768:-2", out], timeout=40)
        if code == 0 and os.path.exists(out):
            frames.append(out)
    desc, model = vision.describe(frames, what="кадри відео (огляд обʼєкта)") if frames else (None, None)
    if frames and not desc:
        warns.append("опис кадрів недоступний (немає vision-моделі Ollama)" if not model else "vision-модель не відповіла")
    transcript = ""
    if meta.get("audio", True):
        transcript, why = stt.transcribe(path, lang, workdir=work)
        if not transcript and why:
            warns.append("звук: " + why)
    parts = ["Відео %.0f с" % meta["duration"] if meta.get("duration") else "Відео", "кадрів %d" % len(frames)]
    text = ("Кадри: " + desc if desc else "") + ("\nЗвук: " + transcript if transcript else "")
    return passport("video", "відео", ok=bool(frames or transcript), summary=", ".join(parts) + (": " + desc if desc else ""), text=text,
                    numbers={**meta, "frames": len(frames)}, warnings=warns, manager=False, transcript=transcript or "")
