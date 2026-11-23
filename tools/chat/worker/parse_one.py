"""Дочірній процес розбору одного файлу: python3 parse_one.py <шлях> <kind> <ext> <lang> <тека> → один рядок JSON (паспорт)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ollama  # noqa: E402
from parsers import run_parser  # noqa: E402

if __name__ == "__main__":
    path, kind, ext, lang, work = sys.argv[1:6]
    acc = {"calls": 0, "tokens": 0, "seconds": 0.0}

    def meter(backend, tokens=0, seconds=0.0, calls=1):   # vision у дочірньому процесі — витрати повертаємо батькові в паспорті
        acc["calls"] += calls; acc["tokens"] += int(tokens); acc["seconds"] += float(seconds)
    ollama.METER = meter
    p = run_parser(path, kind, ext, lang, work)
    if acc["calls"]:
        p["usage"] = {**acc, "seconds": round(acc["seconds"], 1)}
    sys.stdout.write("\n" + json.dumps(p, ensure_ascii=False, default=str) + "\n")
