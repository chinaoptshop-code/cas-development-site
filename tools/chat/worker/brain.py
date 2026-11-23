"""Обробка однієї розмови з черги: файли → паспорти, параметри → кошторис кодом, модель → текст (з перевірками),
handoff, дзвінок, голос. Результат — Outcome для POST /api/bot/chat.

Модель не рахує й не пише сум: числа в тексті — лише з estimate (шаблон texts.py), речення моделі з чужими сумами викидаються.
"""
import datetime
import re

import checks
import estimate as E
import params as P
import prompts
import slots as SL
from api import ApiError, TooBig
from llm import parse_json
from outcome import Outcome
from texts import T

LANGS = E.LANGS
COST_WORDS = (r"скільки|вартість|ціна|ціни|кошторис|порахуй|розрахун|сколько|стоимост|цена|смет|посчита|how much|cost|price|quote|estimate|"
              r"cuánto|precio|presupuesto|ile kosztuje|koszt|cena|wycen|was kostet|kosten|preis|combien|coût|prix|devis|quanto|custo|preço|orçamento|"
              r"多少钱|价格|费用|报价|كم|تكلفة|سعر")


class Brain:
    def __init__(self, cfg, llm=None, voice=None, calendar=True, analyze=None, now=None, log=None):
        self.cfg, self.llm, self.voice, self.calendar = cfg, llm, voice, calendar
        if analyze is None:
            import parsers
            analyze = parsers.analyze
        self.analyze = analyze
        self.now = now or (lambda: datetime.datetime.now(SL.TZ))
        self.log = log or (lambda *a: None)
        self._llm_ok = None

    # ---------- модель ----------
    def llm_ok(self):
        if self.llm is None:
            return False
        if self._llm_ok is None or self._llm_ok[1] < self.now().timestamp() - 60:
            try:
                self._llm_ok = (bool(self.llm.available()), self.now().timestamp())
            except Exception:
                self._llm_ok = (False, self.now().timestamp())
        return self._llm_ok[0]

    # ---------- файли ----------
    def files(self, pending, fetch, lang):
        out = []
        limit = int(self.cfg.num("CHAT_MAX_FILE_MB", 60) * 1024 * 1024)
        for m in pending:
            for f in (m.get("files") or [])[:12]:
                meta = {"name": f.get("name"), "kind": f.get("kind"), "mime": f.get("mime")}
                if (f.get("size") or 0) > limit:
                    out.append({"name": f.get("name"), "kind": f.get("kind"), "type": "файл", "ok": False, "manager": True, "important": True,
                                "summary": "", "text": "", "warnings": ["файл завеликий для автоматичного розбору"], "area_m2": None, "numbers": {}})
                    continue
                try:
                    data = fetch(f)
                except TooBig:
                    out.append({"name": f.get("name"), "kind": f.get("kind"), "type": "файл", "ok": False, "manager": True, "important": True,
                                "summary": "", "text": "", "warnings": ["файл завеликий"], "area_m2": None, "numbers": {}})
                    continue
                except ApiError as e:
                    if e.status == 404:
                        continue           # файл уже видалено за терміном
                    raise
                p = self.analyze(data, meta, lang, timeout=self.cfg.num("CHAT_FILE_TIMEOUT", 240))
                del data
                out.append(p)
        return out

    # ---------- головне ----------
    def respond(self, conv, fetch):
        lang = conv.get("lang") if conv.get("lang") in LANGS else "uk"
        pending, history = conv.get("pending") or [], conv.get("history") or []
        passports = self.files(pending, fetch, lang)
        transcripts = [p.get("transcript") for p in passports if p.get("kind") in ("audio", "video") and p.get("transcript")]
        voice_in = any(p.get("kind") == "audio" for p in passports)
        new_texts = [m.get("text") or "" for m in pending] + transcripts
        # мова клієнта: якщо пише явно іншою мовою сайту — відповідаємо нею
        said = checks.detect_lang(" ".join(new_texts))
        if said in LANGS and said != lang:
            lang = said
        old_user = [m.get("text") or "" for m in history if m.get("role") == "user"]
        p = {"items": {}}
        for t in old_user + new_texts:
            P.from_text(t, p)
        area_src = None
        if not p.get("area"):
            for ps in passports:
                if ps.get("area_m2") and ps.get("kind") in ("cad", "pdf", "doc", "model"):
                    p["area"], area_src = ps["area_m2"], ps
                    break
        # модель лише пропонує параметри — код перевіряє
        lines = self.conv_lines(history, pending, transcripts)
        model_on = self.llm_ok()
        if model_on:
            m = parse_json(self.llm.complete(prompts.EXTRACT_SYSTEM, prompts.extract_user(lines, passports), json_mode=True, max_tokens=400))
            ev_nums = [ps.get("area_m2") for ps in passports] + [a for ps in passports for a in (ps.get("numbers") or {}).get("areas", []) or []]
            P.merge_model(p, m, old_user + new_texts + [ps.get("text", "") for ps in passports], ev_nums)
        p = P.finalize(p, lang)

        # ---------- дзвінок ----------
        last_bot = next((m.get("text") or "" for m in reversed(history) if m.get("role") == "bot"), "")
        offers = SL.offered(last_bot, self.now())
        chosen = None
        if offers:
            for t in new_texts:
                chosen = SL.choose(t, offers) or chosen
        wants_call = bool(p.get("wants_call")) and not chosen
        slot_list = None
        if wants_call and not offers and self.calendar and self.cfg.get("CHAT_CALENDAR", "on") != "off":
            ev = SL.busy()
            slot_list = SL.free(ev, self.now()) if ev is not None else []

        # ---------- кошторис ----------
        est, info = (E.build(p, lang) if p["items"] else (None, {"missing": ["items"], "big": p.get("object") in ("house",) + E.COMMERCIAL}))
        prev_est = next((m.get("estimate") for m in reversed(history) if m.get("role") == "bot" and m.get("estimate")), None)
        asks_cost = any(re.search(COST_WORDS, t, re.I) for t in new_texts)
        if est and prev_est and self.same_est(est, prev_est) and not asks_cost:
            est = None                      # той самий розрахунок уже показано — не повторюємо
        question = None
        if not est and not chosen:
            miss = info.get("missing") or []
            if "items" in miss and (asks_cost or not model_on) and not wants_call and not prev_est:
                question = T("ask_what", lang)
            elif "area" in miss:
                question = T("ask_area", lang)
            elif "sotky" in miss:
                question = T("ask_sotky", lang)

        # ---------- handoff ----------
        manager_files = [ps for ps in passports if ps.get("manager")]
        failed = [ps for ps in passports if ps.get("important") and not ps.get("ok")]
        reason_code, reason = None, None
        if p.get("complaint"):
            reason_code, reason = "complaint", "Скарга клієнта в чаті"
        elif chosen:
            reason_code, reason = "asks_human", f"Клієнт просить дзвінок {SL.label(chosen, 'uk')} (Київ)"
        elif p.get("asks_human") or p.get("wants_call"):
            reason_code, reason = "asks_human", "Просить дзвінок" + (", запропоновано вільні проміжки" if slot_list else "") if p.get("wants_call") else "Просить людину"
        elif info.get("big") or p.get("object") in ("house",) + E.COMMERCIAL or "build" in p["items"]:
            reason_code, reason = "big_project", self.big_reason(p, est)
        elif manager_files or failed:
            names = ", ".join(ps.get("name", "файл") for ps in (manager_files or failed))[:120]
            reason_code, reason = "complex", f"Файли для менеджера: {names}"

        # ---------- текст моделі ----------
        allowed = E.allowed_numbers(est)
        plan = {"estimate": E.summary(est, lang) or None, "question": question, "handoff": bool(reason_code),
                "call_slots": bool(slot_list), "file_notes": bool(manager_files or failed)}
        model_text, unsure, why = "", False, None
        if model_on:
            model_text, unsure, why = self.generate(lang, lines, passports, plan, allowed)
            if why == "checks":
                model_text = ""
                if not reason_code:
                    reason_code, reason = "complex", "Відповідь не пройшла перевірку — потрібна людина"
        if unsure and not reason_code:
            reason_code, reason = "complex", "Складне питання — бот не впевнений"
        nothing = not (est or question or chosen or slot_list is not None or passports or model_text)
        open_q = any("?" in t or "؟" in t or "？" in t for t in new_texts) and not est and not chosen and not p["items"] and not asks_cost
        if not model_on and (nothing or open_q):
            nothing, question = True, None     # питання без моделі не вгадуємо — людині
            if not reason_code:
                reason_code, reason = "complex", "Локальна модель недоступна — питання без відповіді"

        # ---------- збираємо відповідь ----------
        parts = [model_text] if model_text else []
        for ps in passports:
            if ps.get("for_manager") or (ps.get("manager") and not ps.get("ok") and not ps.get("important")):
                parts.append(T("file_mgr", lang, name=ps.get("name", "файл")))
            elif ps.get("important") and not ps.get("ok"):
                parts.append(T("file_fail", lang, name=ps.get("name", "файл")))
            elif ps.get("kind") == "audio" and not ps.get("ok") and not any(t.strip() for t in new_texts):
                parts.append(T("voice_fail", lang))
        if area_src:
            parts.append(T("area_file", lang, name=area_src.get("name", "файл"), area=self.fmt_area(area_src["area_m2"], lang)))
        if est:
            parts.append(E.summary(est, lang))
        if question:
            parts.append(question)
        if reason_code == "complaint":
            parts.insert(0, T("complaint", lang))
        if chosen:
            parts.append(T("slot_ok", lang, slot=SL.label(chosen, lang)))
        elif slot_list:
            parts.append(T("slots", lang) + "\n" + SL.block(slot_list, lang) + "\n" + T("slot_pick", lang))
        elif wants_call:
            parts.append(T("slot_free", lang))
        if reason_code == "big_project":
            parts.append(T("big", lang))
        if reason_code and not (reason_code == "complex" and nothing and not model_on) and conv.get("state") != "waiting":
            parts.append(T("handoff", lang))
        if reason_code == "complex" and nothing and not model_on:
            parts.append(T("fallback", lang))
        if (chosen or (reason_code == "asks_human" and not slot_list)) and not conv.get("lead") and not p.get("phone_given"):
            parts.append(T("leave_number", lang))
        text = "\n\n".join(x.strip() for x in parts if x and x.strip()) or T("thanks", lang)

        # ---------- handoff: у waiting — повторно лише з обраним часом ----------
        out = Outcome(text=text[:8000], estimate=est)
        if reason_code:
            if conv.get("state") == "waiting":
                if chosen:
                    out.handoff, out.reason, out.renotify = reason_code, reason, True
            else:
                out.handoff, out.reason = reason_code, reason
        if voice_in and self.voice and self.cfg.get("CHAT_TTS", "on") != "off":
            out.audio = self.voice(text, lang)
        out.notes = [f"lang={lang}", f"files={len(passports)}", f"model={'on' if model_on else 'off'}", f"est={'yes' if est else 'no'}"]
        return out

    # ---------- допоміжне ----------
    def generate(self, lang, lines, passports, plan, allowed):
        """→ (текст, unsure, причина невдачі). Дві спроби; не пройшло — (\"\", True, \"checks\")."""
        feedback = ""
        for attempt in range(2):
            raw = self.llm.complete(prompts.reply_system(lang, "https://cas-develop.com/" + E.CALC_PAGES.get(lang, E.CALC_PAGES["uk"])) + feedback,
                                    prompts.reply_user(lines, passports, plan), json_mode=True)
            if raw is None:
                return "", False, "no_model"
            d = parse_json(raw) or {"reply": raw}
            txt = checks.clean_markup(str(d.get("reply") or ""))
            probs = checks.problems(txt)                       # до вирізання сум: «знижка 50%, ціна $10» — порушення, а не лише чужа сума
            txt, dropped = checks.strip_money(txt, allowed)
            txt = checks.shorten(txt)
            lg = checks.lang_mismatch(txt, lang)
            if lg:
                probs.append(f"мова {lg} замість {lang}")
            if not txt.strip():
                probs.append("порожня відповідь")
            if not probs:
                return txt, d.get("unsure") is True, None
            self.log("модель: перевірка не пройшла", attempt + 1, ",".join(probs))
            feedback = ("\n\nПОПЕРЕДНЯ ВІДПОВІДЬ ВІДХИЛЕНА: " + "; ".join(probs) +
                        f". Напиши заново, лише {prompts.LANG_NAME.get(lang)}, без сум і без заборонених тем.")
        return "", True, "checks"

    @staticmethod
    def conv_lines(history, pending, transcripts):
        who = {"user": "Клієнт", "bot": "Помічник", "staff": "Менеджер", "system": "Система"}
        out = []
        for m in history[-12:]:
            t = (m.get("text") or "").strip()
            if t:
                out.append(f"{who.get(m.get('role'), 'Клієнт')}: {t[:800]}")
        for m in pending:
            t = (m.get("text") or "").strip()
            fs = ", ".join(f.get("name", "") for f in m.get("files") or [])
            out.append("Клієнт (нове): " + (t[:2000] or "(без тексту)") + (f" [файли: {fs}]" if fs else ""))
        for t in transcripts:
            out.append("Клієнт (голос/звук, розпізнано): " + t[:2000])
        return out

    @staticmethod
    def same_est(a, b):
        key = lambda e: (e.get("total_from"), [(l.get("label"), l.get("qty"), l.get("from")) for l in e.get("lines", [])], e.get("region"))  # noqa: E731
        return key(a) == key(b)

    @staticmethod
    def fmt_area(v, lang):
        s = f"{v:,.1f}".rstrip("0").rstrip(".")
        return s if lang in ("en", "zh") else s.replace(",", " ").replace(".", ",")

    @staticmethod
    def big_reason(p, est):
        obj = {"house": "Будинок", "office": "Офіс", "restaurant": "Ресторан", "hotel": "Готель", "shop": "Магазин", "resort": "База відпочинку",
               "commercial": "Комерційний обʼєкт", "apartment": "Квартира"}.get(p.get("object"), "Обʼєкт")
        if "build" in p.get("items", {}):
            obj = "Будівництво будинку"
        s = obj + (f" {int(p['area'])} м²" if p.get("area") else "")
        if est and est.get("total_from"):
            s += ", попередньо від $" + f"{est['total_from']:,}".replace(",", " ")
        return s[:200]
