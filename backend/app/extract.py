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
    },
    "required": ["title", "contract_number", "supplier_name", "supplier_cui", "service_keywords", "currency",
                 "unit_price", "unit", "quantity_per_period", "vat_rate", "billing_period", "payment_term_days",
                 "late_penalty_pct_per_day", "indexation_type", "indexation_max_pct", "indexation_month",
                 "start_date", "end_date", "notes", "expense_account"],
    "additionalProperties": False,
}

PROMPT = (
    "Ești un contabil român. Din contractul atașat, completează fișa de facturare folosită pentru a verifica "
    "automat facturile recurente primite de la furnizor. Prețurile sunt fără TVA. Dacă TVA nu e precizat, "
    "folosește cota standard din România (21%). Datele în format YYYY-MM-DD. Dacă o clauză lipsește, pune null "
    "(sau 'none' la indexare). Nu inventa valori."
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
    import anthropic

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


def extract_heuristic(text: str) -> dict:
    price_m = re.search(r"(\d[\d.\s]*,?\d*)\s*(lei|RON|EUR)\s*(?:/|pe)\s*(lun[aă]|interven[tț]ie|or[aă])", text, re.I)
    supplier_block = _find(r"(?:prestator|furnizor|locator)\w*\s*[:,]?\s*(.{0,200})", text) or ""
    m_name = re.search(r"([A-ZĂÂÎȘȚ][\w&.-]*(?:\s[A-ZĂÂÎȘȚ][\w&.-]*)*\s(?:SRL|S\.R\.L\.|SA|S\.A\.))", supplier_block)
    cui = _find(r"(?:CUI|CIF|cod fiscal)\s*[:]?\s*(?:RO)?\s*(\d{4,10})", supplier_block) or \
        _find(r"(?:CUI|CIF)\s*[:]?\s*(?:RO)?\s*(\d{4,10})", text)
    term = _find(r"(\d{1,3})\s*(?:de\s*)?zile\s*(?:calendaristice\s*)?(?:de la|de la data)\s*(?:emiter|primir)", text)
    pen = _find(r"penalit[aă][tț]i\s*de\s*(\d+[.,]?\d*)\s*%\s*(?:pe|/)\s*zi", text)
    idx = _find(r"index\w*.*?(?:maxim\w*|plafon\w*)\s*(?:de\s*)?(\d+[.,]?\d*)\s*%", text)
    qty = _find(r"(\d+)\s*interven[tț]ii\s*(?:pe|/)\s*lun[aă]", text)
    start = _date_ro(_find(r"(?:începând cu|incepand cu|de la data de|intră în vigoare la)\s*([\d./-]{8,10})", text))
    end = _date_ro(_find(r"(?:până la|pana la|până la data de)\s*([\d./-]{8,10})", text))
    vat = _find(r"TVA\s*(?:de\s*)?(\d{1,2})\s*%", text)
    unit = price_m.group(3).lower() if price_m else "lună"
    title = _find(r"(?:obiectul contractului|obiect)\s*[:]?\s*(.{5,160}?)\.?\s*\n", text) or "Contract"
    words = [w for w in re.findall(r"[a-zăâîșț]{5,}", title.lower())][:3]
    return {
        "title": title,
        "contract_number": _find(r"nr\.?\s*([\w/-]+)", text) or "",
        "supplier_name": m_name.group(1).strip() if m_name else "",
        "supplier_cui": cui or "",
        "service_keywords": words,
        "currency": "EUR" if price_m and price_m.group(2).upper() == "EUR" else "RON",
        "unit_price": _num_ro(price_m.group(1)) if price_m else 0.0,
        "unit": "lună" if unit.startswith("lun") else unit,
        "quantity_per_period": int(qty) if qty else None,
        "vat_rate": float(vat) if vat else 21.0,
        "billing_period": "lunar",
        "payment_term_days": int(term) if term else 30,
        "late_penalty_pct_per_day": _num_ro(pen) if pen else None,
        "indexation_type": "IPC" if re.search(r"\bIPC\b|indice\w* pre[tț]urilor", text, re.I) else "none",
        "indexation_max_pct": _num_ro(idx) if idx else None,
        "indexation_month": 1 if idx else None,
        "start_date": start or "",
        "end_date": end,
        "notes": "Extras automat fără AI – verifică toate câmpurile.",
        "expense_account": "612" if re.search(r"închiri|inchiri|chiri", text, re.I) else
        "605" if re.search(r"energie|gaze|apă|apa potabil", text, re.I) else "628",
    }
