"""Дочірній процес розбору одного файлу: python3 parse_one.py <шлях> <kind> <ext> <lang> <тека> → один рядок JSON (паспорт)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parsers import run_parser  # noqa: E402

if __name__ == "__main__":
    path, kind, ext, lang, work = sys.argv[1:6]
    p = run_parser(path, kind, ext, lang, work)
    sys.stdout.write("\n" + json.dumps(p, ensure_ascii=False, default=str) + "\n")
