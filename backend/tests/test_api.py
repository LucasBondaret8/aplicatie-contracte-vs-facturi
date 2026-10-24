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
    assert st["mode"] == "simulat" and st["last_new"] == 5 and st["new_invoices"] == 5
    r = by_number(client, "CLO-2026-10")
    assert r["invoice"]["new"] and r["invoice"]["source"] == "spv"
    assert {a["code"] for a in r["alerts"]} == {"OUT_OF_CONTRACT"}
    assert client.post("/api/spv/sync").json()["last_new"] == 0  # nu descarcă de două ori


def test_validate_clears_new(client):
    client.post("/api/spv/sync")
    iid = by_number(client, "IMN-2026-10")["invoice"]["id"]
    client.post(f"/api/invoices/{iid}/validated", json={"value": True})
    assert client.get("/api/spv/status").json()["new_invoices"] == 4


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


def test_suppliers(client):
    sup = client.get("/api/state").json()["suppliers"]
    assert {s["cod"] for s in sup} == {"00001", "00002", "00003", "00004", "00005", "00006"}
    new = client.post("/api/suppliers", json={"name": "Google Ireland Ltd", "cui": "IE6388047V", "tara": "IE"}).json()
    assert new["cod"] == "00007"
    assert client.post("/api/suppliers", json={"name": "Alt nume", "cui": "IE6388047V"}).status_code == 400
    used = next(s for s in sup if s["cui"] == "31415926")
    assert client.delete(f"/api/suppliers/{used['id']}").status_code == 400
    assert client.delete(f"/api/suppliers/{new['id']}").status_code == 200
    # un furnizor nou, apărut doar pe o factură manuală, primește automat fișă și cod
    client.post("/api/invoices/manual", json={"number": "77", "supplier_cui": "11223344", "supplier_name": "Nou SRL",
                                               "issue_date": "2026-10-20", "lines": [{"description": "x", "quantity": 1, "unit_price": 10, "vat_pct": 21}]})
    assert any(s["cui"] == "11223344" and s["cod"] == "00007" for s in client.get("/api/state").json()["suppliers"])


def test_payment_validation_and_import_adds(client, tmp_path):
    bad = {"invoice_number": "X", "supplier_cui": "1", "date": "2026-01-01"}
    assert client.post("/api/payments", json={**bad, "amount": -5}).status_code == 400
    assert client.post("/api/payments", json={**bad, "amount": 5, "date": "31.01.2026"}).status_code == 400
    before = len(client.get("/api/state").json()["payments"])
    csv_ok = "numar_factura;cui_furnizor;data;suma\nIMN-2026-09;RO31415926;2026-10-20;15578.75\nIMN-2026-01;RO31415926;2026-01-11;15578.75\n"
    r = client.post("/api/payments/import", files={"file": ("extras.csv", csv_ok)}).json()
    assert r == {"payments": 1, "skipped": 1}  # a doua plată exista deja
    assert len(client.get("/api/state").json()["payments"]) == before + 1  # nu se pierd plățile existente
    r = client.post("/api/payments/import", files={"file": ("rau.csv", "numar_factura;cui_furnizor;data;suma\nX;1;2026-01-01;abc\n")})
    assert r.status_code == 400 and "Rândul 2" in r.json()["detail"]
    assert client.post("/api/payments/import", files={"file": ("gol.csv", "")}).status_code == 400


def test_contract_needs_supplier_and_price(client):
    assert client.post("/api/contracts", json={"title": "x", "supplier_cui": "", "unit_price": 0}).status_code == 400
    ok = {"title": "Telefonie", "supplier_name": "Telecom SRL", "supplier_cui": "RO55667788", "unit_price": 450, "start_date": "2026-02-01"}
    assert client.post("/api/contracts", json={**ok, "end_date": "2025-01-01"}).status_code == 400
    assert client.post("/api/contracts", json=ok).json()["supplier_cui"] == "55667788"


def test_delivery_confirmation_changes_verification(client):
    assert {a["code"] for a in by_number(client, "TEL-2026-05")["alerts"]} == set()
    r = client.post("/api/deliveries", json={"contract_id": "c-telecom", "period": "2026-05", "status": "partial", "quantity": 7,
                                             "doc": "Raport operator", "note": "3 SIM-uri inactive"})
    assert r.status_code == 200
    a = by_number(client, "TEL-2026-05")["alerts"]
    assert [x["code"] for x in a] == ["UNDER_DELIVERED"] and a[0]["amount"] == pytest.approx(3 * 40.5 * 1.21, abs=0.01)
    # aceeași lună: confirmarea se înlocuiește, nu se dublează
    client.post("/api/deliveries", json={"contract_id": "c-telecom", "period": "2026-05", "status": "livrat", "quantity": 10})
    assert by_number(client, "TEL-2026-05")["alerts"] == []
    assert sum(d["period"] == "2026-05" and d["contract_id"] == "c-telecom" for d in client.get("/api/state").json()["deliveries"]) == 1
    for bad in ({"contract_id": "nu-exista", "period": "2026-05", "status": "livrat"},
                {"contract_id": "c-telecom", "period": "05.2026", "status": "livrat"},
                {"contract_id": "c-telecom", "period": "2026-05", "status": "poate"},
                {"contract_id": "c-telecom", "period": "2026-05", "status": "livrat", "quantity": -1}):
        assert client.post("/api/deliveries", json=bad).status_code == 400


def test_ledger_balances(client):
    state = client.get("/api/state").json()
    entries = client.get("/api/ledger").json()["entries"]
    assert [e["nr"] for e in entries] == list(range(1, len(entries) + 1))
    debit = lambda acc: sum(e["amount"] for e in entries if e["debit"].startswith(acc))
    credit = lambda acc: sum(e["amount"] for e in entries if e["credit"].startswith(acc))
    invoices = sum(i["total_with_vat"] for i in state["invoices"])
    paid = sum(p["amount"] for p in state["payments"])
    assert credit("401") == pytest.approx(invoices, abs=0.05)  # facturile, cu TVA
    assert debit("401") == pytest.approx(paid, abs=0.05)  # plățile
    assert debit("4426") == pytest.approx(sum(i["vat_total"] for i in state["invoices"]), abs=0.05)
    assert debit("612") > 0 and debit("6581") == pytest.approx(500)  # chirie; penalitățile TSP-2026-09
    imn = next(s for s in state["suppliers"] if s["cui"] == "31415926")
    assert all(e["credit"] == f"401.{imn['cod']}" for e in entries if e["doc"] == "Factura IMN-2026-01")


def test_lists_company_backup_restore(client):
    c = client.post("/api/lists/clienti", json={"denumire": "Client Test SRL", "cui": "123"}).json()
    assert client.get("/api/state").json()["lists"]["clienti"][0]["denumire"] == "Client Test SRL"
    assert client.post("/api/lists/nu-exista", json={"x": 1}).status_code == 404
    assert client.post("/api/lists/clienti", json={"denumire": " "}).status_code == 400
    client.delete(f"/api/lists/clienti/{c['id']}")
    assert client.get("/api/state").json()["lists"]["clienti"] == []
    assert client.post("/api/company", json={"name": "Firma Mea SRL", "cui": "RO99"}).json()["cui"] == "99"
    backup = client.get("/api/backup").content
    client.post("/api/reset")
    assert client.get("/api/state").json()["invoices"] == []
    r = client.post("/api/restore", files={"file": ("salvare.json", backup)}).json()
    assert r["invoices"] == 45 and client.get("/api/state").json()["company"]["name"] == "Firma Mea SRL"
    assert client.post("/api/restore", files={"file": ("rau.json", b"{}")}).status_code == 400


def test_manual_invoice_requires_lines(client):
    r = client.post("/api/invoices/manual", json={"number": "1", "supplier_cui": "1", "issue_date": "2026-10-01", "lines": []})
    assert r.status_code == 400
