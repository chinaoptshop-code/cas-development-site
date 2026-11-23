"""DXF / DWG і 3DS. Площі за кресленням — обережно, з приміткою «за кресленням, попередньо».

DXF: ezdxf (якщо є) або власний мінімальний читач ASCII DXF (пари «код групи / значення»): $INSUNITS, $EXTMIN/$EXTMAX, шари,
замкнені LWPOLYLINE / POLYLINE, HATCH (полілінійні контури — лише через ezdxf), TEXT/MTEXT, DIMENSION.
DWG: конвертація в DXF через ODAFileConverter або dwg2dxf (LibreDWG), якщо встановлено; інакше — версія з заголовка й «менеджеру».
3DS: власний читач чанків (0x4D4D → 0x3D3D → 0x4000 обʼєкт → 0x4100 сітка → 0x4110 вершини, 0x4120 грані), габарити.
"""
import glob
import os
import re
import shutil
import struct

from .common import fail, fmt_area, passport, run, which

UNITS = {0: None, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}  # $INSUNITS → метрів в одиниці
UNIT_NAME = {1: "дюйми", 2: "фути", 4: "мм", 5: "см", 6: "м", 14: "дм"}
ROOM_MIN, ROOM_MAX = 1.0, 2000.0     # м²: що вважаємо приміщенням
MAX_ENT = 200_000


def shoelace(pts):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def inside(pt, poly):
    x, y, c = pt[0], pt[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            c = not c
    return c


# ---------------- власний читач ASCII DXF ----------------
def read_dxf_ascii(path):
    with open(path, "rb") as f:
        raw = f.read(80 * 1024 * 1024)
    if raw.startswith(b"AutoCAD Binary DXF"):
        raise ValueError("binary DXF")
    lines = raw.decode("utf-8", "replace").splitlines()
    pairs = [(lines[i].strip(), lines[i + 1].rstrip("\r")) for i in range(0, len(lines) - 1, 2)]
    head, ents, layers, cur, var, section, tbl = {}, [], set(), None, None, None, None
    for code, val in pairs:
        if code == "0":
            if cur:
                ents.append(cur); cur = None
                if len(ents) > MAX_ENT:
                    break
            if val == "SECTION":
                section = "?"; continue
            if val == "ENDSEC":
                section = None; continue
            if section == "TABLES":
                tbl = val; continue
            if section == "ENTITIES" or section == "BLOCKS":
                cur = {"type": val, "pts": [], "flags": 0, "layer": "", "text": "", "xy": None, "vals": []}
            continue
        if code == "2" and section == "?":
            section = val; continue
        if section == "HEADER":
            if code == "9":
                var = val
            elif var in ("$INSUNITS",) and code == "70":
                head["insunits"] = int(val or 0)
            elif var in ("$EXTMIN", "$EXTMAX") and code in ("10", "20"):
                head.setdefault(var, [0, 0])[0 if code == "10" else 1] = float(val)
            continue
        if section == "TABLES":
            if code == "2" and tbl == "LAYER":
                layers.add(val)
            continue
        if cur is None:
            continue
        if code == "8":
            cur["layer"] = val; layers.add(val)
        elif code == "70":
            try:
                cur["flags"] = int(val)
            except ValueError:
                pass
        elif code == "10":
            cur["_x"] = float(val)
        elif code == "20" and "_x" in cur:
            p = (cur.pop("_x"), float(val))
            cur["pts"].append(p)
            if cur["xy"] is None:
                cur["xy"] = p
        elif code in ("1", "3") and cur["type"] in ("TEXT", "MTEXT", "DIMENSION"):
            cur["text"] += val
        elif code == "42" and cur["type"] == "DIMENSION":
            cur["vals"].append(float(val))
    if cur:
        ents.append(cur)
    # POLYLINE + VERTEX → одна полілінія
    out, poly = [], None
    for e in ents:
        if e["type"] == "POLYLINE":
            poly = {"type": "LWPOLYLINE", "pts": [], "flags": e["flags"], "layer": e["layer"]}
        elif e["type"] == "VERTEX" and poly is not None:
            poly["pts"] += e["pts"][:1]
        elif e["type"] == "SEQEND" and poly is not None:
            out.append(poly); poly = None
        else:
            out.append(e)
    return head, out, layers


def _collect_ezdxf(path):
    import ezdxf
    from ezdxf import recover
    try:
        doc = ezdxf.readfile(path)
    except Exception:
        doc, _ = recover.readfile(path)
    msp = doc.modelspace()
    head = {"insunits": int(doc.header.get("$INSUNITS", 0) or 0)}
    for v in ("$EXTMIN", "$EXTMAX"):
        try:
            p = doc.header.get(v)
            head[v] = [float(p[0]), float(p[1])] if p is not None else None
        except Exception:
            pass
    ents, n = [], 0
    for e in msp:
        n += 1
        if n > MAX_ENT:
            break
        t = e.dxftype()
        lay = e.dxf.get("layer", "")
        if t == "LWPOLYLINE":
            ents.append({"type": t, "pts": [(p[0], p[1]) for p in e.get_points("xy")], "flags": 1 if e.closed else 0, "layer": lay})
        elif t == "POLYLINE":
            try:
                ents.append({"type": "LWPOLYLINE", "pts": [(v.dxf.location[0], v.dxf.location[1]) for v in e.vertices], "flags": 1 if e.is_closed else 0, "layer": lay})
            except Exception:
                pass
        elif t == "HATCH":
            for bp in e.paths:
                pts = [(v[0], v[1]) for v in getattr(bp, "vertices", [])]
                if len(pts) >= 3:
                    ents.append({"type": "LWPOLYLINE", "pts": pts, "flags": 1, "layer": lay, "hatch": True})
        elif t in ("TEXT", "MTEXT"):
            txt = e.plain_text() if t == "MTEXT" else e.dxf.get("text", "")
            ins = e.dxf.get("insert")
            ents.append({"type": "TEXT", "text": txt, "xy": (ins[0], ins[1]) if ins is not None else None, "layer": lay})
        elif t == "DIMENSION":
            try:
                ents.append({"type": "DIMENSION", "vals": [float(e.get_measurement())], "text": e.dxf.get("text", ""), "layer": lay})
            except Exception:
                pass
    return head, ents, {l.dxf.name for l in doc.layers}


def analyze_dxf(path, prefer_ezdxf=True):
    head = ents = layers = None
    lib = "власний читач"
    if prefer_ezdxf:
        try:
            head, ents, layers = _collect_ezdxf(path); lib = "ezdxf"
        except ImportError:
            pass
        except Exception:
            head = None
    if head is None:
        head, ents, layers = read_dxf_ascii(path)
    iu = head.get("insunits", 0)
    polys = [e for e in ents if e["type"] == "LWPOLYLINE" and len(e["pts"]) >= 3 and (e.get("flags", 0) & 1 or e["pts"][0] == e["pts"][-1])]
    texts = [e for e in ents if e["type"] in ("TEXT", "MTEXT") and (e.get("text") or "").strip()]
    dims = [v for e in ents if e["type"] == "DIMENSION" for v in e.get("vals", [])]
    k = UNITS.get(iu)
    warns = []
    raw_areas = [shoelace(p["pts"]) for p in polys]
    if k is None:   # одиниці не вказано — вгадуємо за розміром
        ext = [abs(c) for e in polys for pt in e["pts"] for c in pt] or [0]
        k = 0.001 if max(ext) > 2000 else 1.0
        warns.append("одиниці креслення не вказано — прийнято " + ("мм" if k == 0.001 else "м"))
    rooms = []
    for p, a in zip(polys, raw_areas):
        m2 = a * k * k
        if ROOM_MIN <= m2 <= ROOM_MAX:
            label = next((t["text"].strip()[:40] for t in texts if t.get("xy") and inside(t["xy"], p["pts"])
                          and not re.fullmatch(r"[\d.,\s]+(м²|м2|m2|m²)?", t["text"].strip())), "")
            rooms.append({"area": round(m2, 1), "label": label, "layer": p.get("layer", "")[:30], "pts": p["pts"]})
    # контур квартири/поверху: найбільший полігон, що містить інші й ≈ їх сумі (±20%) — тоді сумарна = контур, кімнати — без нього
    rooms.sort(key=lambda r: -r["area"])
    total, outline = None, None
    if len(rooms) >= 2:
        big, rest = rooms[0], rooms[1:]
        inner = [r for r in rest if inside(r["pts"][0], big["pts"])]
        s = sum(r["area"] for r in inner)
        if inner and 0.7 <= s / big["area"] <= 1.2:
            outline, rooms, total = big, rest, big["area"]
    # підписи площ у тексті креслення (напр. «18,4 м²»)
    lab_areas = []
    for t in texts:
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*(м²|м2|m2|m²|кв\.?\s?м)", t["text"], re.I)
        if m:
            lab_areas.append(float(m.group(1).replace(",", ".")))
    if total is None:
        total = round(sum(r["area"] for r in rooms), 1) if rooms else (round(sum(lab_areas), 1) if lab_areas else None)
    if lab_areas and rooms and total and abs(sum(lab_areas) - total) / total > 0.15:
        warns.append(f"сума підписів площ {fmt_area(sum(lab_areas))} м² не збігається з геометрією {fmt_area(total)} м²")
    ext = None
    if head.get("$EXTMIN") and head.get("$EXTMAX"):
        w, h = (head["$EXTMAX"][0] - head["$EXTMIN"][0]) * k, (head["$EXTMAX"][1] - head["$EXTMIN"][1]) * k
        if 0 < w < 1e5 and 0 < h < 1e5:
            ext = [round(w, 2), round(h, 2)]
    room_list = [{"area": r["area"], "label": r["label"]} for r in rooms[:30]]
    summ = (f"Креслення DXF ({lib}): шарів {len(layers)}, замкнених контурів {len(polys)}, приміщень {len(rooms)}"
            + (f", сумарно ≈ {fmt_area(total)} м² (за кресленням, попередньо)" if total else "")
            + (f", габарити {ext[0]:g} × {ext[1]:g} м" if ext else ""))
    text = "\n".join([f"{(r['label'] or 'приміщення')}: {fmt_area(r['area'])} м²" for r in room_list]
                     + ["Тексти: " + "; ".join(t["text"].strip()[:60] for t in texts[:40])] if texts else
                     [f"{(r['label'] or 'приміщення')}: {fmt_area(r['area'])} м²" for r in room_list])
    if not rooms:
        warns.append("замкнених контурів приміщень не знайдено — площу за кресленням не визначено")
    return passport("cad", "креслення DXF", ok=True, summary=summ, text=text, warnings=warns, area_m2=total,
                    numbers={"units": UNIT_NAME.get(iu, "не вказано"), "layers": sorted(layers)[:40], "rooms": room_list,
                             "outline_m2": outline["area"] if outline else None, "label_areas": lab_areas[:40], "dims": dims[:40],
                             "extents_m": ext}, area_note="за кресленням, попередньо")


DWG_VER = {"AC1009": "R12", "AC1012": "R13", "AC1014": "R14", "AC1015": "2000", "AC1018": "2004", "AC1021": "2007",
           "AC1024": "2010", "AC1027": "2013", "AC1032": "2018+"}


def dwg(path, work, lang):
    with open(path, "rb") as f:
        sig = f.read(6).decode("ascii", "replace")
    ver = DWG_VER.get(sig, sig if sig.startswith("AC") else "невідома")
    oda, lib = which("ODAFileConverter"), which("dwg2dxf")
    out = None
    if oda:
        src, dst = os.path.join(work, "dwg_in"), os.path.join(work, "dwg_out")
        os.makedirs(src, exist_ok=True); os.makedirs(dst, exist_ok=True)
        shutil.copyfile(path, os.path.join(src, "in.dwg"))
        code, _, _ = run([oda, src, dst, "ACAD2018", "DXF", "0", "1", "*.DWG"], timeout=180)
        got = glob.glob(os.path.join(dst, "*.dxf")) + glob.glob(os.path.join(dst, "*.DXF"))
        out = got[0] if code == 0 and got else None
    if not out and lib:
        dst = os.path.join(work, "out.dxf")
        code, _, _ = run([lib, "-y", "-o", dst, str(path)], timeout=180)
        out = dst if os.path.exists(dst) and os.path.getsize(dst) > 0 else None
    if not out:
        why = "немає конвертера DWG (ODAFileConverter або LibreDWG dwg2dxf)" if not (oda or lib) else "конвертація DWG не вдалася"
        return passport("cad", "креслення DWG", ok=False, summary=f"DWG, версія {ver}", warnings=[why], manager=True, numbers={"version": ver})
    p = analyze_dxf(out)
    p.update(type="креслення DWG", summary=p["summary"].replace("Креслення DXF", f"Креслення DWG {ver}"))
    p["numbers"]["version"] = ver
    return p


def dxf(path, work, lang):
    try:
        return analyze_dxf(path)
    except Exception as e:
        return fail("cad", "креслення DXF", f"DXF не розібрано ({type(e).__name__})")


# ---------------- 3DS ----------------
def read_3ds(path, max_bytes=200 * 1024 * 1024):
    with open(path, "rb") as f:
        data = f.read(max_bytes)
    if len(data) < 6 or struct.unpack_from("<H", data, 0)[0] != 0x4D4D:
        raise ValueError("not 3ds")
    objs, mn, mx = [], [float("inf")] * 3, [float("-inf")] * 3
    verts = faces = 0
    stack = [(0, len(data), 0)]
    budget = 1_000_000
    while stack:
        off, end, depth = stack.pop()
        while off + 6 <= end and budget > 0:
            budget -= 1
            cid, ln = struct.unpack_from("<HI", data, off)
            if ln < 6 or off + ln > end:
                break
            body = off + 6
            if cid in (0x4D4D, 0x3D3D) and depth < 4:
                stack.append((body, off + ln, depth + 1))
            elif cid == 0x4000 and depth < 4:
                z = data.find(b"\0", body, off + ln)
                name = data[body:z].decode("latin-1", "replace")[:40] if z > 0 else ""
                objs.append(name)
                stack.append((z + 1 if z > 0 else body, off + ln, depth + 1))
            elif cid == 0x4100 and depth < 6:
                stack.append((body, off + ln, depth + 1))
            elif cid == 0x4110:
                n = struct.unpack_from("<H", data, body)[0]
                n = min(n, (ln - 8) // 12)
                for i in range(n):
                    x, y, zz = struct.unpack_from("<fff", data, body + 2 + 12 * i)
                    for j, v in enumerate((x, y, zz)):
                        if v == v and abs(v) < 1e9:
                            mn[j], mx[j] = min(mn[j], v), max(mx[j], v)
                verts += n
            elif cid == 0x4120:
                faces += struct.unpack_from("<H", data, body)[0]
            off += ln
    return objs, verts, faces, (mn, mx) if verts else None


def model3ds(path, work, lang):
    try:
        objs, verts, faces, box = read_3ds(path)
    except Exception:
        try:   # trimesh як запасний варіант
            import trimesh
            m = trimesh.load(path, force="scene")
            b = m.bounds
            objs, verts, faces, box = list(m.geometry.keys()), sum(len(g.vertices) for g in m.geometry.values()), 0, (list(b[0]), list(b[1]))
        except Exception:
            return fail("model", "3D-модель 3DS", "3DS не розібрано")
    warns, area, dims = ["одиниці 3DS не зберігаються у файлі — розміри орієнтовні"], None, None
    if box:
        size = [box[1][i] - box[0][i] for i in range(3)]
        k = 0.001 if max(size) > 500 else 0.01 if max(size) > 60 else 1.0
        dims = [round(s * k, 2) for s in size]
        area = round(dims[0] * dims[1], 1) if dims[0] * dims[1] > 1 else None
        if k != 1.0:
            warns.append("розміри прийнято в " + ("мм" if k == 0.001 else "см"))
    summ = f"3D-модель 3DS: обʼєктів {len(objs)}, вершин {verts}" + (f", габарити {dims[0]:g} × {dims[1]:g} × {dims[2]:g} м" if dims else "") + \
           (f", площа підлоги за габаритами ≈ {fmt_area(area)} м² (попередньо)" if area else "")
    return passport("model", "3D-модель 3DS", ok=True, summary=summ, text="Обʼєкти: " + ", ".join(o for o in objs[:40] if o),
                    numbers={"objects": len(objs), "vertices": verts, "faces": faces, "dims_m": dims}, warnings=warns, area_m2=area,
                    area_note="за габаритами моделі, попередньо")
