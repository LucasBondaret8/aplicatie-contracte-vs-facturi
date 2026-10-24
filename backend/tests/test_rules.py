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
from app.rules import allowed_unit_price, analyze  # noqa: E402
from generate_demo import CONTRACTE, ERORI_INTENTIONATE, LUNI_LIPSA, build  # noqa: E402

TODAY = date(2026, 10, 24)


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
    return analyze(contracts, invoices, payments, TODAY)


def test_intentional_errors_detected(result):
    by_number = {r["invoice"]["number"]: r for r in result["results"]}
    for number, codes in ERORI_INTENTIONATE.items():
        got = {a["code"] for a in by_number[number]["alerts"]}
        assert got == set(codes), f"{number}: așteptat {codes}, primit {sorted(got)}"


def test_clean_invoices_have_no_alerts(result):
    for r in result["results"]:
        if r["invoice"]["number"] not in ERORI_INTENTIONATE:
            assert r["alerts"] == [], f"{r['invoice']['number']}: {r['alerts']}"


def test_missing_months(result):
    got = {(a["contract_id"], a["detail"].split("pentru ")[1][:7]) for a in result["contract_alerts"]}
    assert got == {(cid, m) for cid, ms in LUNI_LIPSA.items() for m in ms}


def test_price_overcharge_amount(result):
    r = next(r for r in result["results"] if r["invoice"]["number"] == "IMN-2026-03")
    # maxim permis 12500 * 1.05 = 13125; facturat 13750 -> 625 + TVA 21%
    assert r["alerts"][0]["amount"] == pytest.approx(756.25)


def test_indexation_cap():
    c = CONTRACTE[0]
    assert allowed_unit_price(c, date(2025, 6, 1)) == pytest.approx(12500)
    assert allowed_unit_price(c, date(2026, 2, 1)) == pytest.approx(13125)
    assert allowed_unit_price(c, date(2027, 2, 1)) == pytest.approx(13781.25)


@pytest.mark.parametrize("name,contract", [("contract_chirie.txt", CONTRACTE[0]),
                                            ("contract_it.txt", CONTRACTE[1]),
                                            ("contract_curatenie.txt", CONTRACTE[2])])
def test_heuristic_extraction(name, contract):
    f = extract_heuristic((ROOT / "demo" / "contracte" / name).read_text("utf-8"))
    for key in ("supplier_cui", "unit_price", "vat_rate", "payment_term_days", "late_penalty_pct_per_day",
                "indexation_type", "indexation_max_pct", "quantity_per_period" if contract["unit"] != "lună" else "currency",
                "start_date", "end_date"):
        assert f[key] == contract[key], f"{name}.{key}: {f[key]!r} != {contract[key]!r}"
    assert f["supplier_name"] == contract["supplier_name"]
