"""Parser pentru facturi RO e-Factura (UBL 2.1, CIUS-RO).

Acceptă XML simplu sau arhiva ZIP descărcată din SPV (XML factură + semnătură).
"""
from __future__ import annotations

import io
import xml.etree.ElementTree as ET
import zipfile

NS = {
    "inv": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}


class EFacturaError(ValueError):
    pass


def normalize_cui(value: str | None) -> str:
    """'RO 12345678' -> '12345678'."""
    if not value:
        return ""
    v = value.strip().upper().replace(" ", "")
    if v.startswith("RO"):
        v = v[2:]
    return v


def _text(node, path: str, default: str = "") -> str:
    if node is None:
        return default
    el = node.find(path, NS)
    return el.text.strip() if el is not None and el.text else default


def _num(node, path: str, default: float = 0.0) -> float:
    t = _text(node, path)
    try:
        return float(t) if t else default
    except ValueError:
        return default


def _party(root, tag: str) -> dict:
    party = root.find(f"cac:{tag}/cac:Party", NS)
    name = _text(party, "cac:PartyLegalEntity/cbc:RegistrationName") or _text(party, "cac:PartyName/cbc:Name")
    cui = _text(party, "cac:PartyTaxScheme/cbc:CompanyID") or _text(party, "cac:PartyLegalEntity/cbc:CompanyID")
    return {"name": name, "cui": normalize_cui(cui)}


def parse_invoice_xml(data: bytes, filename: str = "") -> dict:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        raise EFacturaError(f"{filename}: XML invalid ({e})") from e
    if not root.tag.endswith("Invoice") and not root.tag.endswith("CreditNote"):
        raise EFacturaError(f"{filename}: nu este o factură UBL")

    lines = []
    for ln in root.findall("cac:InvoiceLine", NS) + root.findall("cac:CreditNoteLine", NS):
        qty = _num(ln, "cbc:InvoicedQuantity") or _num(ln, "cbc:CreditedQuantity")
        lines.append({
            "description": _text(ln, "cac:Item/cbc:Name"),
            "quantity": qty,
            "unit_price": _num(ln, "cac:Price/cbc:PriceAmount"),
            "line_total": _num(ln, "cbc:LineExtensionAmount"),
            "vat_pct": _num(ln, "cac:Item/cac:ClassifiedTaxCategory/cbc:Percent"),
        })

    supplier = _party(root, "AccountingSupplierParty")
    customer = _party(root, "AccountingCustomerParty")
    issue_date = _text(root, "cbc:IssueDate")
    return {
        "number": _text(root, "cbc:ID"),
        "issue_date": issue_date,
        "due_date": _text(root, "cbc:DueDate") or _text(root, "cac:PaymentMeans/cbc:PaymentDueDate"),
        "currency": _text(root, "cbc:DocumentCurrencyCode", "RON"),
        "period_start": _text(root, "cac:InvoicePeriod/cbc:StartDate"),
        "period_end": _text(root, "cac:InvoicePeriod/cbc:EndDate"),
        "supplier_name": supplier["name"],
        "supplier_cui": supplier["cui"],
        "customer_name": customer["name"],
        "customer_cui": customer["cui"],
        "lines": lines,
        "total_without_vat": _num(root, "cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount"),
        "vat_total": _num(root, "cac:TaxTotal/cbc:TaxAmount"),
        "total_with_vat": _num(root, "cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount"),
        "payable": _num(root, "cac:LegalMonetaryTotal/cbc:PayableAmount"),
        "source_file": filename,
    }


def parse_upload(data: bytes, filename: str) -> list[dict]:
    """Un fișier încărcat poate fi XML sau ZIP din SPV (ignorăm semnătura)."""
    if filename.lower().endswith(".zip"):
        out = []
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():
                if name.lower().endswith(".xml") and not name.lower().startswith("semnatura"):
                    out.append(parse_invoice_xml(z.read(name), name))
        return out
    return [parse_invoice_xml(data, filename)]
