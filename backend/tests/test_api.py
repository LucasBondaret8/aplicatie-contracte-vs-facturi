"""Facturi manuale și preluarea automată din SPV (sursa simulată), prin API."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "demo"))

from app import main  # noqa: E402
from app.store import Store  # noqa: E402
from generate_demo import build  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    build()
    monkeypatch.setenv("BVS_TODAY", "2026-10-24")
    for k in ("ANAF_CLIENT_ID", "ANAF_CLIENT_SECRET", "ANAF_REDIRECT_URI"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(main, "store", Store(tmp_path / "store.json"))
    c = TestClient(main.app)
    c.post("/api/demo/load")
    return c


def by_number(client, number):
    return next((r for r in client.get("/api/analysis").json()["results"] if r["invoice"]["number"] == number), None)


def test_spv_sync_brings_new_invoices_once(client):
    assert by_number(client, "IMN-2026-10") is None
    st = client.post("/api/spv/sync").json()
    assert st["mode"] == "simulat" and st["last_new"] == 3 and st["new_invoices"] == 3
    r = by_number(client, "CLO-2026-10")
    assert r["invoice"]["new"] and r["invoice"]["source"] == "spv"
    assert {a["code"] for a in r["alerts"]} == {"OUT_OF_CONTRACT"}
    assert client.post("/api/spv/sync").json()["last_new"] == 0  # nu descarcă de două ori


def test_validate_clears_new(client):
    client.post("/api/spv/sync")
    iid = by_number(client, "IMN-2026-10")["invoice"]["id"]
    client.post(f"/api/invoices/{iid}/validated", json={"value": True})
    assert client.get("/api/spv/status").json()["new_invoices"] == 2


def test_manual_invoice_is_checked_against_contract(client):
    inv = client.post("/api/invoices/manual", json={
        "number": "TSP-2026-10", "supplier_cui": "RO27182818", "supplier_name": "TechSupport Pro SRL",
        "issue_date": "2026-10-01", "due_date": "2026-10-10",
        "lines": [{"description": "Abonament mentenanță IT 2026-10", "quantity": 1, "unit_price": 1900, "vat_pct": 21}],
    }).json()
    assert inv["source"] == "manual" and inv["total_with_vat"] == 2299.0
    codes = {a["code"] for a in by_number(client, "TSP-2026-10")["alerts"]}
    assert codes == {"PRICE", "DUE_DATE", "OVERDUE"}  # scadentă 10.10, neplătită la 24.10


def test_spv_replaces_manual_copy(client):
    client.post("/api/invoices/manual", json={
        "number": "IMN-2026-10", "supplier_cui": "31415926", "issue_date": "2026-10-01",
        "lines": [{"description": "Chirie", "quantity": 1, "unit_price": 12875, "vat_pct": 21}]})
    client.post("/api/spv/sync")
    rows = [r for r in client.get("/api/analysis").json()["results"] if r["invoice"]["number"] == "IMN-2026-10"]
    assert len(rows) == 1 and rows[0]["invoice"]["source"] == "spv" and rows[0]["invoice"]["replaced_manual"]


def test_spv_invoice_cannot_be_edited_manually(client):
    iid = by_number(client, "IMN-2026-01")["invoice"]["id"]
    r = client.post("/api/invoices/manual", json={"id": iid, "number": "X", "supplier_cui": "1", "issue_date": "2026-01-01",
                                                   "lines": [{"description": "x", "quantity": 1, "unit_price": 1, "vat_pct": 21}]})
    assert r.status_code == 400


def test_manual_invoice_requires_lines(client):
    r = client.post("/api/invoices/manual", json={"number": "1", "supplier_cui": "1", "issue_date": "2026-10-01", "lines": []})
    assert r.status_code == 400
