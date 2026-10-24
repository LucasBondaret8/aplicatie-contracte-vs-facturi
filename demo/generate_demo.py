"""Generează datele demo: 5 contracte, facturi e-Factura (UBL) cu erori intenționate, plăți și confirmări de livrare.

Rulare: python demo/generate_demo.py
Erorile intenționate sunt listate în ERORI_INTENTIONATE (folosite și de teste).
"""
from __future__ import annotations

import csv
import json
from datetime import date, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent
CLIENT = {"name": "Demo Distribuție SRL", "cui": "40000001"}

CONTRACTE = [
    {
        "id": "c-chirie", "title": "Închiriere spațiu birou, Str. Exemplului nr. 10, București",
        "contract_number": "45/2024", "supplier_name": "Imobiliara Nord SRL", "supplier_cui": "31415926",
        "service_keywords": ["chirie", "spațiu"], "currency": "RON", "unit_price": 12500.0, "unit": "lună",
        "quantity_per_period": 1, "vat_rate": 21.0, "billing_period": "lunar", "payment_term_days": 15,
        "late_penalty_pct_per_day": 0.1, "indexation_type": "IPC", "indexation_max_pct": 5.0,
        "indexation_month": 1, "start_date": "2025-01-01", "end_date": "2027-12-31",
        "notes": "Chiria se indexează anual în ianuarie cu IPC, plafonat la 5%.", "expense_account": "612", "source_file": "contract_chirie.txt",
    },
    {
        "id": "c-it", "title": "Mentenanță IT și suport helpdesk", "contract_number": "IT-118/2025",
        "supplier_name": "TechSupport Pro SRL", "supplier_cui": "27182818",
        "service_keywords": ["mentenanță", "abonament", "suport"], "currency": "RON", "unit_price": 1800.0,
        "unit": "lună", "quantity_per_period": 1, "vat_rate": 21.0, "billing_period": "lunar",
        "payment_term_days": 30, "late_penalty_pct_per_day": None, "indexation_type": "none",
        "indexation_max_pct": None, "indexation_month": None, "start_date": "2025-11-01", "end_date": "2026-10-31",
        "notes": "Contractul nu prevede penalități de întârziere.", "expense_account": "628", "source_file": "contract_it.txt",
    },
    {
        "id": "c-curatenie", "title": "Servicii de curățenie birouri", "contract_number": "CL-07/2025",
        "supplier_name": "CleanOffice SRL", "supplier_cui": "16180339",
        "service_keywords": ["curățenie", "intervenție"], "currency": "RON", "unit_price": 250.0,
        "unit": "intervenție", "quantity_per_period": 8, "vat_rate": 21.0, "billing_period": "lunar",
        "payment_term_days": 30, "late_penalty_pct_per_day": 0.05, "indexation_type": "none",
        "indexation_max_pct": None, "indexation_month": None, "start_date": "2025-09-01", "end_date": "2026-08-31",
        "notes": "8 intervenții pe lună.", "expense_account": "628", "source_file": "contract_curatenie.txt",
    },
    {
        "id": "c-telecom", "title": "Telefonie mobilă și internet – 10 abonamente", "contract_number": "TEL-22/2026",
        "supplier_name": "Telecom Rapid SRL", "supplier_cui": "55667788",
        "service_keywords": ["abonament", "mobil", "internet"], "currency": "RON", "unit_price": 45.0,
        "unit": "abonament", "quantity_per_period": 10, "vat_rate": 21.0, "billing_period": "lunar",
        "payment_term_days": 20, "late_penalty_pct_per_day": 0.02, "indexation_type": "none",
        "indexation_max_pct": None, "indexation_month": None, "start_date": "2026-02-01", "end_date": "2028-01-31",
        "discount_pct": 10.0, "discount_until": "2027-01-31",
        "notes": "10% reducere în primele 12 luni.", "expense_account": "626", "source_file": "contract_telefonie.txt",
    },
    {
        "id": "c-crm", "title": "CRM cloud – 25 licențe utilizatori", "contract_number": "SaaS-2025-31",
        "supplier_name": "CloudSoft SRL", "supplier_cui": "44556677",
        "service_keywords": ["licențe", "crm"], "currency": "RON", "unit_price": 45.0,
        "unit": "licență", "quantity_per_period": 25, "vat_rate": 21.0, "billing_period": "lunar",
        "payment_term_days": 15, "late_penalty_pct_per_day": None, "indexation_type": "none",
        "indexation_max_pct": None, "indexation_month": None, "start_date": "2025-12-01", "end_date": "2026-11-30",
        "auto_renew": True, "renewal_months": 12, "notice_days": 30, "is_licenses": True,
        "notes": "Contract în engleză; se reînnoiește automat cu 12 luni, preaviz 30 de zile.", "expense_account": "628",
        "source_file": "contract_licente_crm_en.txt",
    },
]
for _c in CONTRACTE:  # câmpurile noi ale fișei, cu valorile implicite
    for _k, _v in {"auto_renew": False, "renewal_months": None, "notice_days": None, "discount_pct": None,
                   "discount_until": None, "is_licenses": False}.items():
        _c.setdefault(_k, _v)

# fișele furnizorilor (date inventate)
FURNIZORI = [
    {"id": "f-cleanoffice", "cod": "00001", "name": "CleanOffice SRL", "cui": "16180339", "tara": "RO", "judet": "IF",
     "localitate": "VOLUNTARI", "adresa": "Str. Florilor nr. 12", "iban": "RO49AAAA1B31007593840000", "banca": "BANCA DEMO"},
    {"id": "f-imobiliara", "cod": "00002", "name": "Imobiliara Nord SRL", "cui": "31415926", "tara": "RO", "judet": "B",
     "localitate": "BUCURESTI", "adresa": "Str. Nordului nr. 3", "iban": "RO66BBBB0000000123456789", "banca": "BANCA DEMO"},
    {"id": "f-ose", "cod": "00003", "name": "Office Supplies Express SRL", "cui": "99887766", "tara": "RO", "judet": "CJ",
     "localitate": "CLUJ-NAPOCA", "adresa": "Bd. Muncii nr. 40", "iban": "", "banca": ""},
    {"id": "f-techsupport", "cod": "00004", "name": "TechSupport Pro SRL", "cui": "27182818", "tara": "RO", "judet": "B",
     "localitate": "BUCURESTI", "adresa": "Bd. Tehnologiei nr. 7", "iban": "RO09CCCC0000000987654321", "banca": "BANCA DEMO"},
    {"id": "f-telecom", "cod": "00005", "name": "Telecom Rapid SRL", "cui": "55667788", "tara": "RO", "judet": "CJ",
     "localitate": "CLUJ-NAPOCA", "adresa": "Str. Antenei nr. 4", "iban": "RO21DDDD0000000555666777", "banca": "BANCA DEMO"},
    {"id": "f-cloudsoft", "cod": "00006", "name": "CloudSoft SRL", "cui": "44556677", "tara": "RO", "judet": "IS",
     "localitate": "IASI", "adresa": "Bd. Tehnopolis nr. 2", "iban": "RO77EEEE0000000444555666", "banca": "BANCA DEMO"},
]

SUPPLIERS = {
    "c-chirie": ("Imobiliara Nord SRL", "31415926", "IMN"),
    "c-it": ("TechSupport Pro SRL", "27182818", "TSP"),
    "c-curatenie": ("CleanOffice SRL", "16180339", "CLO"),
    "c-telecom": ("Telecom Rapid SRL", "55667788", "TEL"),
    "c-crm": ("CloudSoft SRL", "44556677", "CSF"),
}

# (fișier/număr factură) -> codul de alertă așteptat
ERORI_INTENTIONATE = {
    "IMN-2026-03": ["PRICE"],
    "IMN-2026-06B": ["DUPLICATE"],
    "IMN-2026-08": ["DUE_DATE"],
    "IMN-2026-09": ["OVERDUE"],
    "TSP-2026-04": ["VAT_RATE"],
    "TSP-2026-05": ["OVERDUE"],
    "TSP-2026-09": ["PENALTY"],
    "CLO-2026-02": ["TOTAL_CALC", "VAT_CALC"],
    "CLO-2026-03": ["OVERPAID"],
    "CLO-2026-05": ["QUANTITY"],
    "CLO-2026-09": ["OUT_OF_CONTRACT"],
    "CLO-2026-10": ["OUT_OF_CONTRACT"],
    "OSE-1187": ["NO_CONTRACT"],
    # ce s-a livrat efectiv (confirmări de livrare)
    "TSP-2026-08": ["NOT_DELIVERED"],
    "CLO-2026-06": ["UNDER_DELIVERED"],
    # reducerea de 10% dispare de pe factură din iulie
    "TEL-2026-07": ["DISCOUNT_MISSING"],
    "TEL-2026-08": ["DISCOUNT_MISSING"],
    "TEL-2026-09": ["DISCOUNT_MISSING"],
    "TEL-2026-10": ["DISCOUNT_MISSING"],
    # 25 de licențe plătite, 14 folosite
    "CSF-2026-08": ["UNUSED_LICENSES"],
    "CSF-2026-09": ["UNUSED_LICENSES"],
    "CSF-2026-10": ["UNUSED_LICENSES"],
}
LUNI_LIPSA = {"c-it": ["2026-07"]}
# alertele despre contracte, la 24.10.2026
ALERTE_CONTRACTE = {("c-it", "EXPIRING"), ("c-crm", "RENEWAL_NOTICE"), ("c-it", "MISSING")}


def _livrari():
    """Confirmările de livrare / recepție (completate de office manager)."""
    out = []
    add = lambda cid, m, status, qty=None, doc="", note="": out.append(
        {"contract_id": cid, "period": f"2026-{m:02d}", "status": status, "quantity": qty, "doc": doc, "note": note})
    for m in range(1, 10):
        add("c-chirie", m, "livrat")
    for m in range(1, 10):
        if m == 8:
            add("c-it", m, "nelivrat", doc="Raport tichete helpdesk august", note="Helpdesk indisponibil toată luna; 14 tichete fără răspuns")
        elif m != 7:
            add("c-it", m, "livrat")
    for m in range(1, 9):
        if m == 6:
            add("c-curatenie", m, "partial", 6, "PV recepție nr. 6/30.06.2026", "Două intervenții anulate de prestator (lipsă personal)")
        else:
            add("c-curatenie", m, "livrat", 10 if m == 5 else 8)
    for m in range(2, 10):
        add("c-telecom", m, "livrat", 10)
    for m in range(1, 11):
        add("c-crm", m, "livrat", 25 if m < 8 else 14, "Raport utilizare CRM" if m >= 8 else "")
    return out


def month_end(y: int, m: int) -> date:
    return (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))


def ubl(number, issue, due, supplier, lines, period, total_override=None):
    """lines: [(descriere, cantitate, pret_unitar, tva%)]"""
    net = round(sum(q * p for _, q, p, _ in lines), 2)
    vat = round(sum(q * p * v / 100 for _, q, p, v in lines), 2)
    tax_excl = total_override if total_override is not None else net
    if total_override is not None:
        vat = round(total_override * lines[0][3] / 100, 2)
    total = round(tax_excl + vat, 2)
    party = lambda name, cui: f"""<cac:Party>
      <cac:PostalAddress><cbc:CityName>București</cbc:CityName><cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>RO{cui}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>{escape(name)}</cbc:RegistrationName><cbc:CompanyID>J40/{cui[:4]}/2015</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>"""
    inv_lines = "\n".join(f"""  <cac:InvoiceLine>
    <cbc:ID>{i}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="{'H87' if q != 1 else 'C62'}">{q:g}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">{q * p:.2f}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>{escape(d)}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>{v:g}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RON">{p:.2f}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>""" for i, (d, q, p, v) in enumerate(lines, 1))
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>{number}</cbc:ID>
  <cbc:IssueDate>{issue}</cbc:IssueDate>
  <cbc:DueDate>{due}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:InvoicePeriod><cbc:StartDate>{period[0]}</cbc:StartDate><cbc:EndDate>{period[1]}</cbc:EndDate></cac:InvoicePeriod>
  <cac:AccountingSupplierParty>{party(*supplier)}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>{party(CLIENT['name'], CLIENT['cui'])}</cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="RON">{vat:.2f}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RON">{net:.2f}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RON">{tax_excl:.2f}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">{total:.2f}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RON">{total:.2f}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
{inv_lines}
</Invoice>
"""
    return xml, total


def build():
    # facturi/ = deja preluate în aplicație; spv/ = facturile din octombrie, care „sosesc” la prima sincronizare SPV
    facturi_dir, spv_dir = OUT / "facturi", OUT / "spv"
    for d in (facturi_dir, spv_dir):
        d.mkdir(exist_ok=True)
        for old in d.glob("*.xml"):
            old.unlink()
    plati = []

    def emit(number, cid_or_supplier, issue, term, lines, period, pay="full", total_override=None):
        sup = SUPPLIERS[cid_or_supplier][:2] if isinstance(cid_or_supplier, str) else cid_or_supplier
        xml, total = ubl(number, issue, issue + timedelta(days=term), sup, lines, period, total_override)
        folder = spv_dir if issue >= date(2026, 10, 1) else facturi_dir
        (folder / f"{number}.xml").write_text(xml, "utf-8")
        amount = {"full": total, "none": 0, "double": total * 2}.get(pay, pay)
        if amount:
            plati.append({"numar_factura": number, "cui_furnizor": "RO" + sup[1],
                          "data": (issue + timedelta(days=min(term, 10))).isoformat(), "suma": f"{amount:.2f}",
                          # curățenia se plătește cash, restul prin bancă
                          "metoda": "casa" if sup[1] == "16180339" else "banca"})

    for m in range(1, 11):
        per = (date(2026, m, 1), month_end(2026, m))
        issue = date(2026, m, 1)
        tag = f"2026-{m:02d}"

        # chirie: 12.500 indexat 3% (IPC) în 2026 = 12.875 – în plafonul de 5%
        price = 13750.0 if m == 3 else 12875.0
        term = 7 if m == 8 else 15
        emit(f"IMN-{tag}", "c-chirie", issue, term, [(f"Chirie spațiu birou {tag}", 1, price, 21)], per,
             pay="none" if m == 9 else "full")
        if m == 6:
            emit("IMN-2026-06B", "c-chirie", date(2026, 6, 15), 15,
                 [("Chirie spațiu birou 2026-06", 1, 12875.0, 21)], per)

        # IT
        if m != 7:
            lines = [(f"Abonament mentenanță IT {tag}", 1, 1800.0, 19 if m == 4 else 21)]
            if m == 9:
                lines.append(("Penalități întârziere plată", 1, 500.0, 21))
            pay = 1000.0 if m == 5 else ("none" if m == 10 else "full")
            emit(f"TSP-{tag}", "c-it", issue, 30, lines, per, pay=pay)

        # curățenie (contract până la 31.08.2026, dar furnizorul facturează în continuare)
        if m <= 10:
            qty = 10 if m == 5 else 8
            emit(f"CLO-{tag}", "c-curatenie", date(2026, m, 2), 30,
                 [(f"Servicii curățenie – intervenții {tag}", qty, 250.0, 21)], per,
                 pay="double" if m == 3 else ("none" if m >= 9 else "full"),
                 total_override=2200.0 if m == 2 else None)

    for m in range(1, 11):
        per = (date(2026, m, 1), month_end(2026, m))
        tag = f"2026-{m:02d}"
        # telefonie: 10 abonamente × 45 lei, cu 10% reducere (40,50) – reducerea dispare din iulie
        if m >= 2:
            emit(f"TEL-{tag}", "c-telecom", date(2026, m, 3), 20,
                 [(f"Abonamente mobil + internet {tag}", 10, 40.5 if m <= 6 else 45.0, 21)], per)
        # CRM: 25 licențe × 45 lei
        emit(f"CSF-{tag}", "c-crm", date(2026, m, 1), 15, [(f"Licențe CRM utilizatori {tag}", 25, 45.0, 21)], per)

    emit("OSE-1187", ("Office Supplies Express SRL", "99887766"), date(2026, 9, 12), 10,
         [("Hârtie copiator A4", 20, 24.5, 21), ("Toner imprimantă", 2, 310.0, 21)],
         (date(2026, 9, 12), date(2026, 9, 12)))

    with (OUT / "plati.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["numar_factura", "cui_furnizor", "data", "suma", "metoda"], delimiter=";")
        w.writeheader()
        w.writerows(plati)
    (OUT / "contracte.json").write_text(json.dumps(CONTRACTE, ensure_ascii=False, indent=1), "utf-8")
    (OUT / "furnizori.json").write_text(json.dumps(FURNIZORI, ensure_ascii=False, indent=1), "utf-8")
    (OUT / "livrari.json").write_text(json.dumps(_livrari(), ensure_ascii=False, indent=1), "utf-8")
    print(f"{len(list(facturi_dir.glob('*.xml')))} facturi + {len(list(spv_dir.glob('*.xml')))} în SPV, "
          f"{len(plati)} plăți, {len(CONTRACTE)} contracte")


if __name__ == "__main__":
    build()
