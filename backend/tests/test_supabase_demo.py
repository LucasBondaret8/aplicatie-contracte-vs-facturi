"""Datele demo pentru Supabase (demo_supabase/): fișele extrase fără AI din PDF-uri + regulile
găsesc exact nepotrivirile din rezultate_asteptate.json, iar facturile corecte nu au alerte."""
import csv
import json
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo_supabase"
sys.path.insert(0, str(ROOT / "backend"))

from app.efactura import parse_upload  # noqa: E402
from app.extract import extract_heuristic, pdf_text  # noqa: E402
from app.rules import analyze  # noqa: E402

EXPECTED_CONTRACTS = {
    "telconet.pdf": {"supplier_cui": "40000002", "supplier_name": "TelcoNet Mobile SRL", "unit_price": 20.0,
                     "quantity_per_period": 5, "payment_term_days": 15, "indexation_type": "IPC",
                     "indexation_max_pct": 5.6, "discount_pct": None, "start_date": "2025-01-01", "end_date": "2026-12-31"},
    "cleanpro.pdf": {"supplier_cui": "40000003", "supplier_name": "CleanPro Services SRL", "unit_price": 1450.0,
                     "quantity_per_period": 8, "payment_term_days": 30, "indexation_type": "none",
                     "discount_pct": None, "start_date": "2025-09-01", "end_date": "2027-08-31"},
    "softnet.pdf": {"supplier_cui": "40000004", "supplier_name": "SoftNet Solutions SRL", "unit_price": 115.0,
                    "quantity_per_period": 20, "payment_term_days": 30, "indexation_type": "none",
                    "discount_pct": 10.0, "discount_until": "2026-03-31", "start_date": "2025-01-01", "end_date": "2026-12-31"},
}


def contracts():
    out = []
    for name in EXPECTED_CONTRACTS:
        c = extract_heuristic(pdf_text((DEMO / "contracte" / name).read_bytes()))
        out.append({**c, "id": name})
    return out


@pytest.mark.parametrize("name", EXPECTED_CONTRACTS)
def test_heuristic_extraction(name):
    c = next(x for x in contracts() if x["id"] == name)
    for key, value in EXPECTED_CONTRACTS[name].items():
        assert c[key] == value, f"{name}.{key}: {c[key]!r} != {value!r}"


def test_expected_alerts():
    invoices = []
    for p in sorted((DEMO / "facturi").rglob("*.xml")):
        invoices += parse_upload(p.read_bytes(), p.name)
    rows = csv.DictReader((DEMO / "plati.csv").open(encoding="utf-8-sig"), delimiter=";")
    payments = [{"invoice_number": r["numar_factura"], "supplier_cui": r["cui_furnizor"], "date": r["data"],
                 "amount": float(r["suma"])} for r in rows]
    res = analyze(contracts(), invoices, payments, date(2026, 10, 24))
    got = {r["invoice"]["number"]: sorted(a["code"] for a in r["alerts"]) for r in res["results"]}
    expected = {e["nr_factura"]: e["alerte_asteptate"] for e in json.loads((DEMO / "rezultate_asteptate.json").read_text("utf-8"))}
    assert got == expected
    assert res["contract_alerts"] == []


def test_demo_load_from_supabase(tmp_path, monkeypatch):
    """„Date demo” cu Supabase configurat: contractele și facturile vin din bucket-uri (aici simulate local)."""
    from fastapi.testclient import TestClient

    from app import main, supabase
    from app.store import Store

    folders = {"contracte": DEMO / "contracte", "facturi": DEMO / "facturi"}
    monkeypatch.setattr(supabase, "list_files", lambda bucket, prefix="": sorted(
        p.relative_to(folders[bucket]).as_posix() for p in folders[bucket].rglob("*") if p.is_file()))
    monkeypatch.setattr(supabase, "download", lambda bucket, name: (folders[bucket] / name).read_bytes())
    for k in ("ANAF_CLIENT_ID", "ANAF_CLIENT_SECRET", "ANAF_REDIRECT_URI", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://exemplu.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "sb_publishable_test")
    monkeypatch.setenv("BVS_TODAY", "2026-10-24")
    monkeypatch.setattr(main, "store", Store(tmp_path / "store.json"))

    client = TestClient(main.app)
    assert client.post("/api/demo/load").json() == {"ok": True, "warning": None}
    st = client.get("/api/spv/status").json()
    assert st["mode"] == "supabase" and st["new_invoices"] == 36 and st["last_error"] is None
    assert len(client.get("/api/state").json()["contracts"]) == 3
    alerts = sum(1 for r in client.get("/api/analysis").json()["results"] if r["alerts"])
    assert alerts == 13
    assert client.post("/api/spv/sync").json()["last_new"] == 0  # nu descarcă de două ori
