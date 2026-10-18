#!/usr/bin/env python3
"""Markdown → HTML без залежностей (запасний варіант для md2pdf.sh, коли немає pandoc).

Підтримує те, що пишуть сценарії помічника: заголовки, абзаци, **жирний**, *курсив*,
`код`, посилання, списки (у т.ч. вкладені), таблиці, цитати, лінії, блоки коду.
    md2html.py вхід.md вихід.html --title "Назва" --css стиль.css
"""
import argparse
import html
import re

INLINE = [
    (re.compile(r"`([^`]+)`"), lambda m: "<code>" + m.group(1) + "</code>"),
    (re.compile(r"\*\*(.+?)\*\*"), lambda m: "<strong>" + m.group(1) + "</strong>"),
    (re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])"), lambda m: "<em>" + m.group(1) + "</em>"),
    (re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)"), lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>'),
]


def inline(text):
    text = html.escape(text, quote=False)
    for rx, fn in INLINE:
        text = rx.sub(fn, text)
    return text


def is_table_sep(line):
    return bool(re.fullmatch(r"\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*", line))


def cells(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


LIST_RX = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")


def render_list(lines, i):
    """Рендерить список, що починається з рядка i; повертає (html, новий i)."""
    out, stack = [], []  # stack: [(indent, tag)]
    while i < len(lines):
        m = LIST_RX.match(lines[i])
        if not m:
            # продовження пункту з відступом
            if lines[i].strip() and lines[i].startswith(" ") and stack:
                out.append(" " + inline(lines[i].strip()))
                i += 1
                continue
            break
        indent, marker, text = len(m.group(1)), m.group(2), m.group(3)
        tag = "ol" if marker[0].isdigit() else "ul"
        if not stack or indent > stack[-1][0]:
            out.append(f"<{tag}>")
            stack.append((indent, tag))
        else:
            while stack and indent < stack[-1][0]:
                out.append(f"</li></{stack.pop()[1]}>")
            out.append("</li>")
        out.append("<li>" + inline(text))
        i += 1
    while stack:
        out.append(f"</li></{stack.pop()[1]}>")
    return "".join(out), i


def convert(md):
    lines = md.replace("\r\n", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
            i += 1
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            n = len(m.group(1))
            out.append(f"<h{n}>{inline(m.group(2).rstrip('#').strip())}</h{n}>")
            i += 1
            continue
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", s):
            out.append("<hr>")
            i += 1
            continue
        if "|" in s and i + 1 < len(lines) and is_table_sep(lines[i + 1]):
            head = cells(s)
            i += 2
            rows = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append(cells(lines[i]))
                i += 1
            t = ["<table><thead><tr>"] + [f"<th>{inline(c)}</th>" for c in head] + ["</tr></thead><tbody>"]
            for r in rows:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table>")
            out.append("".join(t))
            continue
        if s.startswith(">"):
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].strip())
                i += 1
            out.append("<blockquote>" + convert("\n".join(quote)) + "</blockquote>")
            continue
        if LIST_RX.match(line):
            block, i = render_list(lines, i)
            out.append(block)
            continue
        para = []
        while i < len(lines) and lines[i].strip() and not LIST_RX.match(lines[i]) \
                and not re.match(r"^\s*(#{1,6}\s|```|>|\|)", lines[i]):
            para.append(inline(lines[i].strip()))
            i += 1
        if not para:  # рядок, що не підпав під жоден блок
            para.append(inline(s))
            i += 1
        out.append("<p>" + "<br>".join(para) + "</p>")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--title", default="")
    ap.add_argument("--css", default="")
    a = ap.parse_args()
    body = convert(open(a.src, encoding="utf-8").read())
    css = open(a.css, encoding="utf-8").read() if a.css else ""
    doc = (f'<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">'
           f"<title>{html.escape(a.title)}</title><style>{css}</style></head><body>\n{body}\n</body></html>")
    open(a.dst, "w", encoding="utf-8").write(doc)


if __name__ == "__main__":
    main()
