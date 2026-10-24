"""Stocare simplă într-un fișier JSON (suficient pentru MVP / demo)."""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "store.json"
EMPTY = {"contracts": [], "invoices": [], "payments": []}


class Store:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path
        self.lock = threading.Lock()
        self.data = json.loads(path.read_text("utf-8")) if path.exists() else json.loads(json.dumps(EMPTY))

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), "utf-8")

    def reset(self):
        with self.lock:
            self.data = json.loads(json.dumps(EMPTY))
            self.save()

    # contracte
    def upsert_contract(self, c: dict) -> dict:
        with self.lock:
            c.setdefault("id", uuid.uuid4().hex[:8])
            self.data["contracts"] = [x for x in self.data["contracts"] if x["id"] != c["id"]] + [c]
            self.save()
            return c

    def delete_contract(self, cid: str):
        with self.lock:
            self.data["contracts"] = [x for x in self.data["contracts"] if x["id"] != cid]
            self.save()

    # facturi: cheia unică e (CUI furnizor, număr, fișier) ca dublurile reale să rămână vizibile
    def add_invoices(self, invoices: list[dict]) -> int:
        with self.lock:
            keys = {(i["supplier_cui"], i["number"], i.get("source_file")) for i in self.data["invoices"]}
            added = 0
            for inv in invoices:
                k = (inv["supplier_cui"], inv["number"], inv.get("source_file"))
                if k in keys:
                    continue
                # aceeași factură introdusă manual înainte: varianta din e-Factura o înlocuiește
                manual = next((i for i in self.data["invoices"] if i.get("source") == "manual"
                               and i["supplier_cui"] == inv["supplier_cui"] and i["number"] == inv["number"]), None)
                if manual:
                    inv.update(id=manual["id"], validated=manual.get("validated", False), replaced_manual=True)
                    self.data["invoices"].remove(manual)
                else:
                    inv["id"] = uuid.uuid4().hex[:8]
                self.data["invoices"].append(inv)
                keys.add(k)
                added += 1
            self.save()
            return added

    def save_manual_invoice(self, inv: dict) -> dict:
        """Adaugă sau înlocuiește o factură introdusă de mână (cheia: id)."""
        with self.lock:
            inv.setdefault("id", uuid.uuid4().hex[:8])
            old = next((i for i in self.data["invoices"] if i["id"] == inv["id"]), None)
            if old:
                inv["validated"] = old.get("validated", False)
                self.data["invoices"].remove(old)
            self.data["invoices"].append(inv)
            self.save()
            return inv

    def update_invoice(self, iid: str, **fields) -> dict | None:
        with self.lock:
            inv = next((i for i in self.data["invoices"] if i["id"] == iid), None)
            if inv:
                inv.update(fields)
                self.save()
            return inv

    def delete_invoice(self, iid: str):
        with self.lock:
            self.data["invoices"] = [i for i in self.data["invoices"] if i["id"] != iid]
            self.save()

    # plăți (casă / bancă)
    def set_payments(self, payments: list[dict]):
        with self.lock:
            for p in payments:
                p.setdefault("id", uuid.uuid4().hex[:8])
                p.setdefault("method", "banca")
            self.data["payments"] = payments
            self.save()

    def upsert_payment(self, p: dict) -> dict:
        with self.lock:
            p.setdefault("id", uuid.uuid4().hex[:8])
            self.data["payments"] = [x for x in self.data["payments"] if x.get("id") != p["id"]] + [p]
            self.save()
            return p

    def delete_payment(self, pid: str):
        with self.lock:
            self.data["payments"] = [x for x in self.data["payments"] if x.get("id") != pid]
            self.save()
