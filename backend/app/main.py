"""API FastAPI pentru Bill vs Signed."""
from __future__ import annotations

import asyncio
import contextlib
import csv
import io
import json
import logging
import os
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from .anaf import AnafError, AnafSource, current_source
from .efactura import EFacturaError, normalize_cui, parse_upload
from .extract import extract_contract
from .rules import analyze, ro
from .store import Store

DEMO_DIR = Path(__file__).resolve().parents[2] / "demo"
SYNC_MINUTES = float(os.environ.get("BVS_SYNC_MINUTES", "60"))
FRONTEND_URL = os.environ.get("BVS_FRONTEND_URL", "http://localhost:5173")
log = logging.getLogger("bvs")
store = Store()


@contextlib.asynccontextmanager
async def lifespan(_app):
    async def loop():
        while True:
            await asyncio.sleep(SYNC_MINUTES * 60)
            with contextlib.suppress(Exception):
                await asyncio.to_thread(sync_spv)
    task = asyncio.create_task(loop())
    yield
    task.cancel()


app = FastAPI(title="Bill vs Signed", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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
    for inv in parsed:
        inv["source"] = "import"
    added = store.add_invoices(parsed)
    return {"added": added, "parsed": len(parsed), "errors": errors}


@app.post("/api/invoices/manual")
def invoices_manual(body: dict):
    """Factură introdusă de mână (furnizori externi, chitanțe, facturi urgente). Cu `id` = modificare."""
    old = next((i for i in store.data["invoices"] if i["id"] == body.get("id")), None) if body.get("id") else None
    if old and old.get("source") != "manual":
        raise HTTPException(400, "Facturile primite prin e-Factura nu se modifică.")
    if old and old.get("validated"):
        raise HTTPException(400, "Factura este validată. Devalidează-o înainte de modificare.")
    try:
        lines = [{"description": str(l["description"]).strip(), "quantity": float(l["quantity"]),
                  "unit_price": float(l["unit_price"]), "vat_pct": float(l["vat_pct"])} for l in body.get("lines", [])]
        number, cui, issue = str(body["number"]).strip(), normalize_cui(body["supplier_cui"]), body["issue_date"]
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(400, f"Factură incompletă: {e}") from e
    lines = [l for l in lines if l["description"] and l["quantity"]]
    if not number or not cui or not issue or not lines:
        raise HTTPException(400, "Completează numărul, furnizorul, data și cel puțin o linie.")
    for l in lines:
        l["line_total"] = round(l["quantity"] * l["unit_price"], 2)
    net = round(sum(l["line_total"] for l in lines), 2)
    vat = round(sum(l["line_total"] * l["vat_pct"] / 100 for l in lines), 2)
    customer = store.data["invoices"][0]["customer_name"] if store.data["invoices"] else ""
    inv = {
        "number": number, "issue_date": issue, "due_date": body.get("due_date") or issue,
        "currency": body.get("currency") or "RON",
        "period_start": body.get("period_start") or issue[:8] + "01", "period_end": body.get("period_end") or "",
        "supplier_name": str(body.get("supplier_name") or "").strip() or cui, "supplier_cui": cui,
        "customer_name": customer, "customer_cui": "", "lines": lines,
        "total_without_vat": net, "vat_total": vat, "total_with_vat": round(net + vat, 2), "payable": round(net + vat, 2),
        "source_file": "", "source": "manual",
    }
    if old:
        inv["id"] = old["id"]
    return store.save_manual_invoice(inv)


@app.post("/api/invoices/{iid}/validated")
def invoices_validate(iid: str, body: dict):
    """Validez / Devalidez – o factură validată e blocată (nu se mai șterge). Validarea o scoate din „noi”."""
    fields = {"validated": bool(body.get("value"))}
    if body.get("value"):
        fields["new"] = False
    inv = store.update_invoice(iid, **fields)
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


# ---------- preluare automată din SPV ----------

def sync_spv() -> dict:
    """Descarcă facturile noi primite în SPV și le verifică. Rulează periodic și la cerere."""
    src = current_source()
    spv = store.data.setdefault("spv", {"seen": [], "last_sync": None, "last_new": 0, "last_error": None})
    try:
        msgs = src.pending_messages(set(spv["seen"]))
        parsed = []
        for m in msgs:
            data, name = src.download(m)
            for inv in parse_upload(data, name):
                inv.update(source="spv", new=True, spv_id=m["id"], received_at=datetime.now().isoformat(timespec="minutes"))
                parsed.append(inv)
        added = store.add_invoices(parsed)
        spv["seen"] += [m["id"] for m in msgs]
        spv.update(last_sync=datetime.now().isoformat(timespec="minutes"), last_new=added, last_error=None)
    except (AnafError, EFacturaError, OSError) as e:
        spv.update(last_sync=datetime.now().isoformat(timespec="minutes"), last_new=0, last_error=str(e))
        log.warning("Sincronizare SPV eșuată: %s", e)
    store.save()
    return spv_status()


@app.get("/api/spv/status")
def spv_status():
    src = current_source()
    spv = store.data.get("spv") or {}
    return {
        "mode": src.name,
        "connected": src.name == "simulat" or AnafSource.connected(),
        "connect_url": "/api/anaf/connect" if src.name == "anaf" else None,
        "every_minutes": SYNC_MINUTES,
        "last_sync": spv.get("last_sync"), "last_new": spv.get("last_new", 0), "last_error": spv.get("last_error"),
        "new_invoices": sum(1 for i in store.data["invoices"] if i.get("new")),
    }


@app.post("/api/spv/sync")
async def spv_sync():
    return await asyncio.to_thread(sync_spv)


@app.get("/api/anaf/connect")
def anaf_connect():
    src = current_source()
    if src.name != "anaf":
        raise HTTPException(400, "Conectorul ANAF nu e configurat (ANAF_CLIENT_ID / ANAF_CLIENT_SECRET / ANAF_REDIRECT_URI).")
    return RedirectResponse(src.authorize_url())


@app.get("/api/anaf/callback")
def anaf_callback(code: str = "", error: str = ""):
    """Adresa de întoarcere după autentificarea cu certificatul pe logincert.anaf.ro."""
    if error or not code:
        raise HTTPException(400, f"Autorizare ANAF refuzată: {error or 'lipsește codul'}")
    src = current_source()
    try:
        src.exchange_code(code)
    except AnafError as e:
        raise HTTPException(502, str(e)) from e
    sync_spv()
    return RedirectResponse(FRONTEND_URL)


# ---------- demo ----------

@app.post("/api/demo/load")
def demo_load():
    """Date demo: facturile din demo/facturi sunt deja în aplicație; cele din demo/spv sosesc la prima sincronizare."""
    store.reset()
    for c in json.loads((DEMO_DIR / "contracte.json").read_text("utf-8")):
        store.upsert_contract(c)
    invoices = []
    for p in sorted((DEMO_DIR / "facturi").glob("*.xml")):
        invoices += parse_upload(p.read_bytes(), p.name)
    for inv in invoices:
        inv["source"] = "spv"
    store.add_invoices(invoices)
    rows = list(csv.DictReader(io.StringIO((DEMO_DIR / "plati.csv").read_text("utf-8-sig")), delimiter=";"))
    store.set_payments([{"invoice_number": r["numar_factura"], "supplier_cui": normalize_cui(r["cui_furnizor"]),
                         "date": r["data"], "amount": float(r["suma"]), "method": r.get("metoda") or "banca"} for r in rows])
    return {"ok": True}


@app.post("/api/reset")
def reset():
    store.reset()
    return {"ok": True}
