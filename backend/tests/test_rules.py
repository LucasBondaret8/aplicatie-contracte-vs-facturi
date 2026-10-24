"""Fiecare eroare intenționată din datele demo produce alerta corectă; facturile corecte nu au alerte."""
import csv
import json
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "demo"))

from app.efactura import parse_upload  # noqa: E402
from app.extract import extract_heuristic  # noqa: E402
from app.rules import allowed_unit_price, analyze, contract_price, effective_end  # noqa: E402
from generate_demo import ALERTE_CONTRACTE, CONTRACTE, ERORI_INTENTIONATE, LUNI_LIPSA, build  # noqa: E402

TODAY = date(2026, 10, 24)
BY_ID = {c["id"]: c for c in CONTRACTE}


@pytest.fixture(scope="module")
def result():
    build()
    invoices = []
    for p in sorted([*(ROOT / "demo" / "facturi").glob("*.xml"), *(ROOT / "demo" / "spv").glob("*.xml")]):
        invoices += parse_upload(p.read_bytes(), p.name)
    rows = csv.DictReader((ROOT / "demo" / "plati.csv").open(encoding="utf-8-sig"), delimiter=";")
    payments = [{"invoice_number": r["numar_factura"], "supplier_cui": r["cui_furnizor"], "date": r["data"],
                 "amount": float(r["suma"])} for r in rows]
    contracts = json.loads((ROOT / "demo" / "contracte.json").read_text("utf-8"))
    deliveries = json.loads((ROOT / "demo" / "livrari.json").read_text("utf-8"))
    return analyze(contracts, invoices, payments, TODAY, deliveries)


def by_number(result, number):
    return next(r for r in result["results"] if r["invoice"]["number"] == number)


def test_intentional_errors_detected(result):
    for number, codes in ERORI_INTENTIONATE.items():
        got = {a["code"] for a in by_number(result, number)["alerts"]}
        assert got == set(codes), f"{number}: așteptat {codes}, primit {sorted(got)}"


def test_clean_invoices_have_no_alerts(result):
    for r in result["results"]:
        if r["invoice"]["number"] not in ERORI_INTENTIONATE:
            assert r["alerts"] == [], f"{r['invoice']['number']}: {r['alerts']}"


def test_missing_months(result):
    got = {(a["contract_id"], a["detail"].split("pentru ")[1][:7]) for a in result["contract_alerts"] if a["code"] == "MISSING"}
    assert got == {(cid, m) for cid, ms in LUNI_LIPSA.items() for m in ms}


def test_contract_alerts(result):
    assert {(a["contract_id"], a["code"]) for a in result["contract_alerts"]} == ALERTE_CONTRACTE
    crm = next(a for a in result["contract_alerts"] if a["code"] == "RENEWAL_NOTICE")
    assert "30.11.2026" in crm["detail"] and "31.10.2026" in crm["detail"] and "7 zile" in crm["detail"]


def test_price_overcharge_amount(result):
    # maxim permis 12500 * 1.05 = 13125; facturat 13750 -> 625 + TVA 21%
    assert by_number(result, "IMN-2026-03")["alerts"][0]["amount"] == pytest.approx(756.25)


def test_discount_missing_amount(result):
    # 10 abonamente × (45 - 40,50) = 45 lei + TVA = 54,45 lei pe lună
    assert by_number(result, "TEL-2026-07")["alerts"][0]["amount"] == pytest.approx(54.45)
    assert by_number(result, "TEL-2026-06")["allowed_price"] == pytest.approx(40.5)


def test_delivery_amounts(result):
    assert by_number(result, "CLO-2026-06")["alerts"][0]["amount"] == pytest.approx(2 * 250 * 1.21)  # 8 facturate, 6 primite
    assert by_number(result, "TSP-2026-08")["alerts"][0]["amount"] == pytest.approx(2178.0)  # nelivrat: toată factura
    unused = by_number(result, "CSF-2026-08")["alerts"][0]
    assert unused["amount"] == pytest.approx(11 * 45 * 1.21)  # 25 plătite, 14 folosite


def test_savings_are_separate_from_recoverable(result):
    s = result["summary"]
    assert s["savings"] == pytest.approx(3 * 11 * 45 * 1.21)
    recover = sum(a["amount"] for r in result["results"] for a in r["alerts"] if a["code"] != "UNUSED_LICENSES")
    assert s["recoverable"] == pytest.approx(recover)


def test_auto_renewal_extends_contract():
    c = {**BY_ID["c-curatenie"], "auto_renew": True, "renewal_months": 12}
    assert effective_end(c, date(2026, 9, 15)) == date(2027, 8, 31)  # fără alarma „în afara contractului”
    assert effective_end(BY_ID["c-curatenie"], date(2026, 9, 15)) == date(2026, 8, 31)
    renewed = analyze([c], [{"number": "X", "issue_date": "2026-09-02", "due_date": "2026-10-02", "period_start": "2026-09-01",
                             "supplier_cui": "16180339", "supplier_name": "CleanOffice SRL", "currency": "RON",
                             "lines": [{"description": "Curățenie", "quantity": 8, "unit_price": 250, "line_total": 2000, "vat_pct": 21}],
                             "total_without_vat": 2000, "vat_total": 420, "total_with_vat": 2420}], [], TODAY)
    assert not any(a["code"] == "OUT_OF_CONTRACT" for a in renewed["results"][0]["alerts"])


def test_indexation_cap_and_discount():
    c = CONTRACTE[0]
    assert allowed_unit_price(c, date(2025, 6, 1)) == pytest.approx(12500)
    assert allowed_unit_price(c, date(2026, 2, 1)) == pytest.approx(13125)
    assert allowed_unit_price(c, date(2027, 2, 1)) == pytest.approx(13781.25)
    t = BY_ID["c-telecom"]
    assert contract_price(t, date(2026, 7, 1)) == pytest.approx(40.5)
    assert contract_price(t, date(2027, 3, 1)) == pytest.approx(45)  # reducerea a expirat


@pytest.mark.parametrize("name,cid", [("contract_chirie.txt", "c-chirie"), ("contract_it.txt", "c-it"),
                                      ("contract_curatenie.txt", "c-curatenie"), ("contract_telefonie.txt", "c-telecom"),
                                      ("contract_licente_crm_en.txt", "c-crm")])
def test_heuristic_extraction(name, cid):
    contract = BY_ID[cid]
    f = extract_heuristic((ROOT / "demo" / "contracte" / name).read_text("utf-8"))
    keys = ["supplier_name", "supplier_cui", "unit_price", "currency", "vat_rate", "payment_term_days", "late_penalty_pct_per_day",
            "indexation_type", "indexation_max_pct", "start_date", "end_date", "auto_renew", "notice_days", "discount_pct",
            "discount_until", "is_licenses", "expense_account"]
    if contract["unit"] != "lună":
        keys += ["quantity_per_period", "unit"]
    if contract["auto_renew"]:
        keys.append("renewal_months")
    for key in keys:
        assert f[key] == contract[key], f"{name}.{key}: {f[key]!r} != {contract[key]!r}"
