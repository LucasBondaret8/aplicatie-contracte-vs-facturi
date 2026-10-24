"""API FastAPI pentru Bill vs Signed."""
from __future__ import annotations

import csv
import io
import json
import os
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .efactura import EFacturaError, normalize_cui, parse_upload
from .extract import extract_contract
from .rules import analyze, ro
from .store import Store

DEMO_DIR = Path(__file__).resolve().parents[2] / "demo"

app = FastAPI(title="Bill vs Signed")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
store = Store()


def today() -> date:
    # BVS_TODAY permite fixarea datei pentru demo / teste
    return date.fromisoformat(os.environ["BVS_TODAY"]) if os.environ.get("BVS_TODAY") else date.today()


@app.get("/api/state")
def state():
    return store.data


# ---------- contracte ----------

@app.post("/api/contracts/extract")
async def contracts_extract(file: UploadFile = File(...)):
    data = await file.read()
    result = extract_contract(data, file.filename or "contract.txt")
    result["fields"]["source_file"] = file.filename
    return result


@app.post("/api/contracts")
def contracts_save(contract: dict):
    contract["supplier_cui"] = normalize_cui(contract.get("supplier_cui"))
    return store.upsert_contract(contract)


@app.delete("/api/contracts/{cid}")
def contracts_delete(cid: str):
    store.delete_contract(cid)
    return {"ok": True}


# ---------- facturi și plăți ----------

@app.post("/api/invoices/import")
async def invoices_import(files: list[UploadFile] = File(...)):
    parsed, errors = [], []
    for f in files:
        try:
            parsed += parse_upload(await f.read(), f.filename or "")
        except (EFacturaError, Exception) as e:  # noqa: BLE001 - raportăm orice fișier stricat
            errors.append(str(e))
    added = store.add_invoices(parsed)
    return {"added": added, "parsed": len(parsed), "errors": errors}


@app.post("/api/invoices/{iid}/validated")
def invoices_validate(iid: str, body: dict):
    """Validez / Devalidez – o factură validată e blocată (nu se mai șterge)."""
    inv = store.update_invoice(iid, validated=bool(body.get("value")))
    if not inv:
        raise HTTPException(404, "Factură inexistentă")
    return inv


@app.delete("/api/invoices/{iid}")
def invoices_delete(iid: str):
    inv = next((i for i in store.data["invoices"] if i["id"] == iid), None)
    if not inv:
        raise HTTPException(404, "Factură inexistentă")
    if inv.get("validated"):
        raise HTTPException(400, "Factura este validată. Devalidează-o înainte de ștergere.")
    store.delete_invoice(iid)
    return {"ok": True}


@app.post("/api/payments")
def payments_save(p: dict):
    try:
        payment = {"invoice_number": str(p["invoice_number"]).strip(), "supplier_cui": normalize_cui(p["supplier_cui"]),
                   "date": p["date"], "amount": float(p["amount"]), "method": p.get("method") or "banca",
                   "doc": p.get("doc") or ""}
    except (KeyError, ValueError) as e:
        raise HTTPException(400, f"Plată invalidă: {e}") from e
    if p.get("id"):
        payment["id"] = p["id"]
    return store.upsert_payment(payment)


@app.delete("/api/payments/{pid}")
def payments_delete(pid: str):
    store.delete_payment(pid)
    return {"ok": True}


@app.post("/api/payments/import")
async def payments_import(file: UploadFile = File(...)):
    """CSV: numar_factura;cui_furnizor;data;suma (export registru bancă)."""
    text = (await file.read()).decode("utf-8-sig", errors="replace")
    dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=";,")
    rows = list(csv.DictReader(io.StringIO(text), dialect=dialect))
    try:
        payments = [{"invoice_number": r["numar_factura"].strip(), "supplier_cui": normalize_cui(r["cui_furnizor"]),
                     "date": r["data"].strip(), "amount": float(r["suma"].replace(",", ".")),
                     "method": (r.get("metoda") or "banca").strip().lower()} for r in rows]
    except KeyError as e:
        raise HTTPException(400, f"Coloană lipsă în CSV: {e}") from e
    store.set_payments(payments)
    return {"payments": len(payments)}


# ---------- verificare ----------

@app.get("/api/analysis")
def analysis():
    d = store.data
    return analyze(d["contracts"], d["invoices"], d["payments"], today())


@app.get("/api/report.csv")
def report_csv():
    res = analysis()
    contracts = {c["id"]: c for c in store.data["contracts"]}
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(["Factura", "Data", "Scadenta", "Furnizor", "CUI", "Contract", "Total", "Platit", "Status",
                "Cod alerta", "Problema", "Detalii", "Suma de recuperat"])
    for r in res["results"]:
        inv = r["invoice"]
        c = contracts.get(r["contract_id"], {})
        base = [inv["number"], inv["issue_date"], inv["due_date"], inv["supplier_name"], inv["supplier_cui"],
                c.get("title", ""), f"{inv['total_with_vat']:.2f}".replace(".", ","), f"{r['paid']:.2f}".replace(".", ","),
                r["status"]]
        for a in r["alerts"] or [None]:
            w.writerow(base + ([a["code"], a["title"], a["detail"], f"{a['amount']:.2f}".replace(".", ",")] if a else ["", "", "", ""]))
    for a in res["contract_alerts"]:
        c = contracts.get(a["contract_id"], {})
        w.writerow(["", "", "", c.get("supplier_name", ""), c.get("supplier_cui", ""), c.get("title", ""), "", "",
                    "warning", a["code"], a["title"], a["detail"], ""])
    return Response("\ufeff" + out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=raport-bill-vs-signed.csv"})


@app.get("/api/invoices/{iid}/dispute")
def dispute_email(iid: str):
    res = analysis()
    r = next((x for x in res["results"] if x["invoice"]["id"] == iid), None)
    if not r:
        raise HTTPException(404, "Factură inexistentă")
    inv = r["invoice"]
    c = next((x for x in store.data["contracts"] if x["id"] == r["contract_id"]), None)
    issues = [a for a in r["alerts"] if a["code"] not in ("OVERDUE", "OVERPAID", "MISSING")]
    if not issues:
        return {"subject": "", "body": "Factura nu are neconcordanțe de contestat."}
    total = sum(a["amount"] for a in issues)
    ref = f"contractul nr. {c.get('contract_number')}" if c and c.get("contract_number") else "contractul în vigoare"
    lines = "\n".join(f"  - {a['title']}: {a['detail']}" for a in issues)
    body = (
        f"Bună ziua,\n\n"
        f"Am verificat factura nr. {inv['number']} din {inv['issue_date']}, în valoare de "
        f"{ro(inv['total_with_vat'])} {inv['currency']}, față de {ref}, și am constatat următoarele neconcordanțe:\n\n"
        f"{lines}\n\n"
        f"Valoarea estimată a diferențelor este de {ro(total)} {inv['currency']} (cu TVA).\n"
        f"Vă rugăm să emiteți o factură de stornare și o factură corectată prin RO e-Factura.\n\n"
        f"Cu stimă,\n"
        f"{inv.get('customer_name') or 'Departamentul financiar'}"
    )
    return {"subject": f"Contestație factura {inv['number']} – {inv['supplier_name']}", "body": body}


# ---------- demo ----------

@app.post("/api/demo/load")
def demo_load():
    store.reset()
    for c in json.loads((DEMO_DIR / "contracte.json").read_text("utf-8")):
        store.upsert_contract(c)
    invoices = []
    for p in sorted((DEMO_DIR / "facturi").glob("*.xml")):
        invoices += parse_upload(p.read_bytes(), p.name)
    store.add_invoices(invoices)
    rows = list(csv.DictReader(io.StringIO((DEMO_DIR / "plati.csv").read_text("utf-8-sig")), delimiter=";"))
    store.set_payments([{"invoice_number": r["numar_factura"], "supplier_cui": normalize_cui(r["cui_furnizor"]),
                         "date": r["data"], "amount": float(r["suma"]), "method": r.get("metoda") or "banca"} for r in rows])
    return {"ok": True}


@app.post("/api/reset")
def reset():
    store.reset()
    return {"ok": True}
