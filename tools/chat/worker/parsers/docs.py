"""PDF, Excel/CSV, DOCX. Кошторис у таблиці — перерахунок КОДОМ (кількість × ціна, підсумок) і розбіжності — у паспорт."""
import csv
import glob
import io
import os
import re
import zipfile

from . import vision
from .common import (MAX_PAGES, MAX_ROWS, MAX_SHEETS, TEXT_PAGES, clip, fail, find_areas, find_sums, passport, run, to_num, which,
                     zip_safe)


# ---------------- PDF ----------------
def _pdf_text(path):
    """→ (сторінок, текст перших сторінок, бібліотека) — pypdf → pymupdf → pdfplumber."""
    try:
        import pypdf
        r = pypdf.PdfReader(path)
        if r.is_encrypted:
            try:
                r.decrypt("")
            except Exception:
                raise ValueError("encrypted")
        n = len(r.pages)
        return n, "\n".join((r.pages[i].extract_text() or "") for i in range(min(n, TEXT_PAGES))), "pypdf"
    except ImportError:
        pass
    try:
        import fitz
        with fitz.open(path) as d:
            return d.page_count, "\n".join(d[i].get_text() for i in range(min(d.page_count, TEXT_PAGES))), "pymupdf"
    except ImportError:
        pass
    try:
        import pdfplumber
        with pdfplumber.open(path) as d:
            return len(d.pages), "\n".join((p.extract_text() or "") for p in d.pages[:TEXT_PAGES]), "pdfplumber"
    except ImportError:
        return None, "", None


def _pdf_images(path, work, pages=3):
    try:
        import fitz
        out = []
        with fitz.open(path) as d:
            for i in range(min(pages, d.page_count)):
                p = os.path.join(work, f"p{i}.png")
                d[i].get_pixmap(dpi=80).save(p); out.append(p)
        return out
    except Exception:
        pass
    tool = which("pdftoppm")
    if tool:
        code, _, _ = run([tool, "-r", "80", "-l", str(pages), "-jpeg", str(path), os.path.join(work, "pg")], timeout=90)
        if code == 0:
            return sorted(glob.glob(os.path.join(work, "pg*.jpg")))[:pages]
    return []


def pdf(path, work, lang):
    try:
        n, text, lib = _pdf_text(path)
    except Exception as e:
        return fail("pdf", "PDF", f"PDF не відкрився ({'зашифрований' if 'encrypt' in str(e) else type(e).__name__})")
    if lib is None:
        return fail("pdf", "PDF", "немає pypdf (pip install pypdf)")
    warns = [] if (n or 0) <= MAX_PAGES else [f"{n} сторінок — розібрано лише перші {TEXT_PAGES}"]
    scan = len(re.sub(r"\s", "", text)) < 40 * max(1, min(n or 1, TEXT_PAGES))
    desc = None
    if scan:
        imgs = _pdf_images(path, work)
        desc, model = vision.describe(imgs, what="сторінки PDF (скан: план, креслення чи кошторис)") if imgs else (None, None)
        if not desc:
            warns.append("скан без текстового шару — " + ("немає vision-моделі" if imgs and not model else "текст не розпізнано"))
    areas, sums = find_areas(text), find_sums(text)
    body = text if not scan else (desc or "")
    summ = f"PDF, сторінок: {n}" + (", скан" if scan else "") + (f"; площі: {', '.join(str(a).rstrip('0').rstrip('.') for a in areas[:8])} м²" if areas else "")
    total = _total_area(areas)
    return passport("pdf", "PDF", ok=bool(body.strip()) or bool(areas), summary=summ, text=body,
                    numbers={"pages": n, "areas": areas[:30], "sums": sums[:20]}, warnings=warns, manager=scan and not desc, area_m2=total)


def _total_area(areas):
    """Площа з тексту: явний «загальна/total» не знаходимо надійно — беремо найбільшу згадку, якщо вона ≈ сума решти, інакше None."""
    if len(areas) < 2:
        return areas[0] if areas else None
    big, rest = max(areas), sum(areas) - max(areas)
    return big if rest and abs(big - rest) / big <= 0.15 else None


# ---------------- таблиці ----------------
QTY = r"к-?сть|кіл|кол-?во|колич|qty|quant|cantidad|ilość|menge|anzahl|quantité|qtd|数量|الكمية|об.?єм|объ[её]м|volume"
PRICE = r"ціна|цена|вартість за|price|rate|precio|cena|preis|prix|preço|单价|السعر|расценк|розцінк"
SUM = r"сума|сумма|вартість|стоимость|amount|total|importe|suma|kwota|wartość|betrag|summe|montant|valor|金额|合计|المبلغ|разом"
TOTAL_ROW = r"^(разом|всього|усього|итого|всего|total|subtotal|загалом|suma|summe|gesamt|insgesamt|total général|合计|总计|المجموع)\b"


def _rows_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        for ws in wb.worksheets[:MAX_SHEETS]:
            rows = []
            for i, r in enumerate(ws.iter_rows(values_only=True)):
                if i >= MAX_ROWS:
                    break
                rows.append(["" if v is None else v for v in r[:40]])
            yield ws.title, rows
    finally:
        wb.close()


def _rows_xls(path):
    import xlrd
    wb = xlrd.open_workbook(path, on_demand=True)
    for name in wb.sheet_names()[:MAX_SHEETS]:
        sh = wb.sheet_by_name(name)
        yield name, [sh.row_values(i)[:40] for i in range(min(sh.nrows, MAX_ROWS))]


def _rows_csv(path):
    with open(path, "rb") as f:
        raw = f.read(5 * 1024 * 1024)
    for enc in ("utf-8-sig", "cp1251", "latin-1"):
        try:
            txt = raw.decode(enc); break
        except UnicodeDecodeError:
            continue
    try:
        dialect = csv.Sniffer().sniff(txt[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    yield "CSV", [r[:40] for _, r in zip(range(MAX_ROWS), csv.reader(io.StringIO(txt), dialect))]


def _num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^\d.,\s  -]", "", str(v or "")).strip()
    return to_num(s) if s and re.search(r"\d", s) else None


def analyze_table(rows):
    """Знайти кошторис: рядок заголовків з кількістю, ціною й сумою → позиції, перерахунок, підсумок файлу й розбіжності."""
    head, cols = None, {}
    for i, r in enumerate(rows[:40]):
        cells = [str(c).strip().lower() for c in r]
        q = next((j for j, c in enumerate(cells) if re.search(QTY, c)), None)
        p = next((j for j, c in enumerate(cells) if re.search(PRICE, c)), None)
        s = next((j for j, c in enumerate(cells) if re.search(SUM, c) and j not in (q, p)), None)
        if q is not None and p is not None:
            head, cols = i, {"q": q, "p": p, "s": s}
            cols["name"] = next((j for j, c in enumerate(cells) if c and j not in (q, p, s)), 0)
            break
    if head is None:
        return None
    items, file_total, mism = [], None, []
    for r in rows[head + 1:]:
        get = lambda k: r[cols[k]] if cols.get(k) is not None and cols[k] < len(r) else ""
        name = str(get("name") or "").strip()
        if re.search(TOTAL_ROW, name.lower()) or any(re.search(TOTAL_ROW, str(c).strip().lower()) for c in r[:3] if c):
            vals = [_num(c) for c in r if _num(c) is not None]
            st = _num(get("s")) if cols.get("s") is not None else None
            file_total = st if st is not None else (vals[-1] if vals else None)
            continue
        q, p = _num(get("q")), _num(get("p"))
        if q is None or p is None:
            continue
        calc = round(q * p, 2)
        s = _num(get("s")) if cols.get("s") is not None else None
        items.append({"name": name[:80], "qty": q, "price": p, "sum": calc})
        if s is not None and abs(s - calc) > max(1.0, 0.005 * abs(calc)):
            mism.append(f"рядок «{name[:40]}»: у файлі {s:g}, кількість × ціна = {calc:g}")
    if not items:
        return None
    total = round(sum(i["sum"] for i in items), 2)
    if file_total is not None and abs(file_total - total) > max(1.0, 0.005 * total):
        mism.append(f"підсумок у файлі {file_total:g}, перерахунок позицій = {total:g}")
    return {"items": len(items), "total": total, "file_total": file_total, "mismatch": mism[:10], "top": items[:15]}


def sheet(path, work, lang, ext):
    if ext in ("xlsx", "xlsm"):
        bad = zip_safe(path)
        if bad:
            return fail("sheet", "Excel", bad)
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            return fail("sheet", "Excel", "немає openpyxl (pip install openpyxl)")
        gen = _rows_xlsx
    elif ext == "xls":
        try:
            import xlrd  # noqa: F401
        except ImportError:
            return fail("sheet", "Excel (.xls)", "немає xlrd для старого .xls (pip install xlrd)")
        gen = _rows_xls
    else:
        gen = _rows_csv
    try:
        sheets = list(gen(path))
    except Exception as e:
        return fail("sheet", "таблиця", f"таблиця не відкрилась ({type(e).__name__})")
    lines, smeta, areas = [], None, []
    for name, rows in sheets:
        nonempty = [r for r in rows if any(str(c).strip() for c in r)]
        lines.append(f"[{name}] рядків: {len(nonempty)}")
        for r in nonempty[:25]:
            lines.append(" | ".join(str(c).strip()[:40] for c in r if str(c).strip())[:300])
        areas += find_areas("\n".join(" ".join(str(c) for c in r) for r in nonempty[:500]))
        smeta = smeta or analyze_table(nonempty)
    warns = list((smeta or {}).get("mismatch", []))
    summ = f"Таблиця: аркушів {len(sheets)}" + (f"; схоже на кошторис — позицій {smeta['items']}, перерахунок {smeta['total']:g}"
                                                 + (f", у файлі {smeta['file_total']:g}" if smeta.get("file_total") is not None else "") if smeta else "")
    return passport("sheet", "таблиця", ok=True, summary=summ, text="\n".join(lines), numbers={"sheets": len(sheets), "areas": areas[:30]},
                    warnings=warns, smeta=smeta)


# ---------------- DOCX ----------------
def docx(path, work, lang):
    bad = zip_safe(path)
    if bad:
        return fail("doc", "Word", bad)
    try:
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8", "replace")[:5_000_000]
    except (KeyError, zipfile.BadZipFile, OSError):
        return fail("doc", "Word", "це не DOCX (старий .doc або пошкоджений файл)")
    xml = re.sub(r"</w:p>|<w:br/>|</w:tr>", "\n", xml)
    xml = re.sub(r"</w:tc>", " | ", xml)
    text = re.sub(r"<[^>]+>", "", xml)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'")
    areas, sums = find_areas(text), find_sums(text)
    return passport("doc", "Word", ok=bool(text.strip()), summary=f"Документ Word, {len(text.split())} слів", text=clip(text),
                    numbers={"areas": areas[:30], "sums": sums[:20]}, area_m2=_total_area(areas))
