"""Extragere „fișă contract” din PDF/TXT.

Folosește Claude (structured outputs) când există credențiale Anthropic;
altfel cade pe un extractor euristic cu regex, ca demo-ul să meargă offline.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re

log = logging.getLogger(__name__)

try:  # se încarcă o dată, la pornirea serverului (durează câteva secunde), nu la primul contract
    import anthropic
except ImportError:  # fără pachet: rămâne extragerea fără AI
    anthropic = None

MODEL = "claude-opus-5-5"

CONTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Obiectul contractului, scurt"},
        "contract_number": {"type": "string"},
        "supplier_name": {"type": "string", "description": "Prestatorul / furnizorul / locatorul"},
        "supplier_cui": {"type": "string", "description": "CUI/CIF furnizor, doar cifrele, fără RO"},
        "service_keywords": {"type": "array", "items": {"type": "string"},
                             "description": "2-4 cuvinte care apar pe facturi pentru acest serviciu"},
        "currency": {"type": "string", "description": "RON, EUR etc."},
        "unit_price": {"type": "number", "description": "Preț unitar fără TVA"},
        "unit": {"type": "string", "description": "lună, intervenție, oră, mp etc."},
        "quantity_per_period": {"type": ["number", "null"], "description": "Cantitate fixă pe perioadă, dacă e cazul"},
        "vat_rate": {"type": "number", "description": "Cota TVA în procente, ex. 21"},
        "billing_period": {"type": "string", "enum": ["lunar", "trimestrial", "anual", "ocazional"]},
        "payment_term_days": {"type": "integer", "description": "Zile de la emiterea facturii până la scadență"},
        "late_penalty_pct_per_day": {"type": ["number", "null"], "description": "Penalități % pe zi de întârziere; null dacă lipsesc"},
        "indexation_type": {"type": "string", "enum": ["none", "IPC", "fix"]},
        "indexation_max_pct": {"type": ["number", "null"], "description": "Plafonul anual al indexării, %"},
        "indexation_month": {"type": ["integer", "null"], "description": "Luna în care se aplică indexarea (1-12)"},
        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
        "end_date": {"type": ["string", "null"], "description": "YYYY-MM-DD sau null dacă e pe perioadă nedeterminată"},
        "notes": {"type": "string", "description": "Alte clauze relevante pentru facturare, 1-2 propoziții"},
        "expense_account": {"type": "string",
                            "description": "Contul de cheltuială din planul de conturi RO: 612 chirii, 605 utilități, "
                                           "628 alte servicii terți, 611 întreținere și reparații, 626 telecomunicații"},
        "auto_renew": {"type": "boolean", "description": "Contractul se prelungește / reînnoiește automat la expirare"},
        "renewal_months": {"type": ["integer", "null"], "description": "Durata fiecărei reînnoiri automate, în luni"},
        "notice_days": {"type": ["integer", "null"], "description": "Preavizul de denunțare a reînnoirii, în zile înainte de expirare"},
        "discount_pct": {"type": ["number", "null"], "description": "Reducere acordată în contract, % din preț; null dacă nu există"},
        "discount_until": {"type": ["string", "null"], "description": "Până când e valabilă reducerea (YYYY-MM-DD); null = permanentă"},
        "is_licenses": {"type": "boolean", "description": "Se facturează pe licențe / utilizatori / locuri (software, SaaS)"},
    },
    "required": ["title", "contract_number", "supplier_name", "supplier_cui", "service_keywords", "currency",
                 "unit_price", "unit", "quantity_per_period", "vat_rate", "billing_period", "payment_term_days",
                 "late_penalty_pct_per_day", "indexation_type", "indexation_max_pct", "indexation_month",
                 "start_date", "end_date", "notes", "expense_account", "auto_renew", "renewal_months", "notice_days",
                 "discount_pct", "discount_until", "is_licenses"],
    "additionalProperties": False,
}

PROMPT = (
    "Ești un contabil român. Din contractul atașat (poate fi în română sau engleză), completează fișa de facturare "
    "folosită pentru a verifica automat facturile recurente primite de la furnizor: preț, indexare, reduceri, "
    "reînnoire automată și preaviz, cantități / licențe. Prețurile sunt fără TVA. Dacă TVA nu e precizat, "
    "folosește cota standard din România (21%). Datele în format YYYY-MM-DD. Dacă o clauză lipsește, pune null "
    "(sau 'none' la indexare, false la reînnoire / licențe). Nu inventa valori."
)


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)


def extract_contract(data: bytes, filename: str) -> dict:
    is_pdf = filename.lower().endswith(".pdf")
    try:
        fields = _extract_with_claude(data, is_pdf)
        return {"source": "claude", "fields": fields}
    except Exception as e:  # fără cheie API, fără rețea, refuz etc.
        log.warning("Extragere Claude indisponibilă (%s), folosesc euristica", e)
        text = pdf_text(data) if is_pdf else data.decode("utf-8", errors="replace")
        return {"source": "heuristic", "fields": extract_heuristic(text), "warning": str(e)}


def _extract_with_claude(data: bytes, is_pdf: bool) -> dict:
    if anthropic is None:
        raise RuntimeError("pachetul anthropic nu e instalat")
    client = anthropic.Anthropic()
    if is_pdf:
        doc = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf",
                                              "data": base64.standard_b64encode(data).decode()}}
    else:
        doc = {"type": "document", "source": {"type": "text", "media_type": "text/plain",
                                              "data": data.decode("utf-8", errors="replace")}}
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": CONTRACT_SCHEMA}},
        messages=[{"role": "user", "content": [doc, {"type": "text", "text": PROMPT}]}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude a refuzat cererea")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


# ---------------- extractor euristic (fallback offline) ----------------

def _num_ro(s: str) -> float:
    """'12.500,00' -> 12500.0 ; '1800' -> 1800.0"""
    s = s.strip().replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    return float(s)


def _find(pattern: str, text: str, flags=re.I | re.S):
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else None


def _date_ro(s: str | None) -> str | None:
    if not s:
        return None
    m = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else None


UNITS = {"lun": "lună", "interven": "intervenție", "or": "oră", "abonament": "abonament", "licen": "licență",
         "utilizator": "utilizator", "license": "licență", "user": "utilizator", "seat": "licență", "month": "lună",
         "subscription": "abonament"}
STOP = {"pentru", "servicii", "provider", "grants", "customer", "access", "agreement", "contract", "contractului",
        "numar", "maximum", "stații", "lucru", "platform"}


def _unit(word: str) -> str:
    w = word.lower()
    return next((v for k, v in UNITS.items() if w.startswith(k)), w)


def extract_heuristic(text: str) -> dict:
    """Fișa contractului fără AI, din contracte scrise clar în română sau engleză (stil CUAD)."""
    price_ro = re.search(r"(\d[\d.\s]*,?\d*)\s*(lei|RON|EUR)\s*(?:/|pe)\s*(lun[aă]|interven[tț]ie|or[aă]|abonament|licen[tț][aă]|utilizator)", text, re.I)
    price_en = re.search(r"\b(RON|EUR|USD|lei)\s*(\d[\d,]*\.?\d*)\s*per\s*(license|user|seat|month|subscription)", text, re.I)
    if price_ro:
        unit_price, currency, unit = _num_ro(price_ro.group(1)), price_ro.group(2).upper(), _unit(price_ro.group(3))
    elif price_en:
        unit_price, currency, unit = float(price_en.group(2).replace(",", "")), price_en.group(1).upper(), _unit(price_en.group(3))
    else:
        unit_price, currency, unit = 0.0, "RON", "lună"
    currency = "RON" if currency == "LEI" else currency

    supplier_block = _find(r"(?:prestator|furnizor|locator)\w*\s*[:,]?\s*(.{0,200})", text) or _find(r"between\s+(.{0,200})", text) or ""
    m_name = re.search(r"([A-ZĂÂÎȘȚ][\w&.-]*(?:\s[A-ZĂÂÎȘȚ][\w&.-]*)*\s(?:SRL|S\.R\.L\.|SA|S\.A\.|LLC|Ltd|Inc))", supplier_block)
    cui_re = r"(?:CUI|CIF|cod fiscal|VAT code|VAT number|tax id)\s*[:]?\s*(?:RO)?\s*(\d{4,10})"
    cui = _find(cui_re, supplier_block) or _find(cui_re, text)

    term = _find(r"(\d{1,3})\s*(?:de\s*)?zile\s*(?:calendaristice\s*)?(?:de la|de la data)\s*(?:emiter|primir)", text) or \
        _find(r"within\s*(\d{1,3})\s*days", text)
    pen = _find(r"penalit[aă][tț]i\s*de\s*(\d+[.,]?\d*)\s*%\s*(?:pe|/)\s*zi", text) or \
        _find(r"(\d+[.,]?\d*)\s*%\s*per\s*day", text)
    idx = _find(r"index\w*.*?(?:maxim\w*|plafon\w*|cap\w*|not exceed\w*)\s*(?:de|of|at)?\s*(\d+[.,]?\d*)\s*%", text)
    qty = _find(r"(\d+)\s*(?:interven[tț]ii\s*(?:pe|/)\s*lun[aă]|abonamente|licen[tț]e|utilizatori|(?:user\s*)?licen[cs]es|seats|users)", text)
    start = _date_ro(_find(r"(?:începând cu|incepand cu|de la data de|intră în vigoare la|effective as of|commenc\w* on)\s*([\d./-]{8,10})", text))
    end = _date_ro(_find(r"(?:până la|pana la|până la data de|until|ending on)\s*([\d./-]{8,10})", text))
    vat = _find(r"(?:TVA|VAT)\s*(?:de|of)?\s*(\d{1,2})\s*%", text)

    auto = bool(re.search(r"automatically renew|auto-?renew|(?:se\s+)?(?:prelunge[sș]te|re[iî]nnoie[sș]te)\s+automat|re[iî]nnoire\s+automat", text, re.I))
    renew = _find(r"(?:successive (?:periods|terms) of|renew\w* for(?: an additional)?)\s*(\d{1,2})\s*months", text) or \
        _find(r"automat\w*\s*(?:cu|pe|pentru)\s*(?:încă\s*|inca\s*)?(?:o perioad[aă] de\s*)?(\d{1,2})\s*luni", text)
    notice = _find(r"at least\s*(\d{1,3})\s*days", text) or _find(r"preaviz\w*\s*(?:de\s*)?(\d{1,3})\s*(?:de\s*)?zile", text) or \
        _find(r"cu\s*(\d{1,3})\s*(?:de\s*)?zile\s*[îi]nainte", text)
    disc = _find(r"reducer\w*\s*(?:de\s*)?(\d+[.,]?\d*)\s*%", text) or _find(r"discount of\s*(\d+[.,]?\d*)\s*%", text)
    disc_until = _date_ro(_find(r"(?:reducer|discount).{0,120}?(?:valabil\w*\s*)?(?:până la|pana la|until)\s*([\d./-]{8,10})", text))
    licenses = unit in ("licență", "utilizator") or bool(re.search(r"\blicen[cs]es?\b|licen[tț]e", text, re.I) and qty)

    title = _find(r"(?:obiectul contractului|obiect|services)\s*\.?\s*[:]?\s*(.{5,160}?)\.?\s*\n", text) or "Contract"
    words = [w for w in re.findall(r"[a-zăâîșț]{5,}", title.lower()) if w not in STOP][:3]
    return {
        "title": title,
        "contract_number": _find(r"\bnr\.?\s*([\w/-]+)", text) or _find(r"\bNo\.?\s*([\w/-]+)", text) or "",
        "supplier_name": m_name.group(1).strip() if m_name else "",
        "supplier_cui": cui or "",
        "service_keywords": words,
        "currency": currency,
        "unit_price": unit_price,
        "unit": unit,
        "quantity_per_period": int(qty) if qty else None,
        "vat_rate": float(vat) if vat else 21.0,
        "billing_period": "lunar",
        "payment_term_days": int(term) if term else 30,
        "late_penalty_pct_per_day": _num_ro(pen) if pen else None,
        "indexation_type": "IPC" if re.search(r"\bIPC\b|indice\w* pre[tț]urilor|consumer price index|\bCPI\b", text, re.I) else "none",
        "indexation_max_pct": _num_ro(idx) if idx else None,
        "indexation_month": 1 if idx else None,
        "start_date": start or "",
        "end_date": end,
        "notes": "Extras automat fără AI – verifică toate câmpurile.",
        "expense_account": "612" if re.search(r"închiri|inchiri|chiri|\blease\b|\brent\b", text, re.I) else
        "626" if re.search(r"telefon|internet|telecom", text, re.I) else
        "605" if re.search(r"energie|gaze|apă|apa potabil|electricity", text, re.I) else "628",
        "auto_renew": auto,
        "renewal_months": int(renew) if renew else (12 if auto else None),
        "notice_days": int(notice) if notice else None,
        "discount_pct": _num_ro(disc) if disc else None,
        "discount_until": disc_until if disc else None,
        "is_licenses": licenses,
    }
