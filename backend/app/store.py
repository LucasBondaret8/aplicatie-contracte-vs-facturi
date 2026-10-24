"""Stocare simplă într-un fișier JSON (suficient pentru MVP / demo)."""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "store.json"
EMPTY = {"contracts": [], "invoices": [], "payments": [], "suppliers": [], "deliveries": [], "opening": {"banca": 0, "casa": 0},
         "lists": {}, "company": {"name": "Demo Distribuție SRL", "cui": "40000001", "regcom": "J40/1234/2020",
                                  "adresa": "Str. Exemplului nr. 10, București", "iban": "", "banca": "", "tva": True}}


class Store:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path
        self.lock = threading.Lock()
        self.data = json.loads(path.read_text("utf-8")) if path.exists() else json.loads(json.dumps(EMPTY))
        for k, v in EMPTY.items():
            self.data.setdefault(k, json.loads(json.dumps(v)))

    # furnizori: fișa cu cod, adresă, cont bancar; cei din contracte / facturi se adaugă automat
    def sync_suppliers(self):
        with self.lock:
            sup = self.data["suppliers"]
            known = {s["cui"] for s in sup}
            names = {}
            for c in self.data["contracts"]:
                names.setdefault(c["supplier_cui"], c.get("supplier_name"))
            for i in self.data["invoices"]:
                names.setdefault(i["supplier_cui"], i.get("supplier_name"))
            missing = [(cui, n) for cui, n in names.items() if cui and cui not in known]
            for cui, name in missing:
                sup.append({"id": uuid.uuid4().hex[:8], "cod": self._next_cod(), "name": name or cui, "cui": cui,
                            "tara": "RO", "judet": "", "localitate": "", "adresa": "", "iban": "", "banca": ""})
            if missing:
                self.save()

    def _next_cod(self) -> str:
        return f"{max([int(s['cod']) for s in self.data['suppliers'] if str(s.get('cod', '')).isdigit()] or [0]) + 1:05d}"

    def upsert_supplier(self, s: dict) -> dict:
        with self.lock:
            s.setdefault("id", uuid.uuid4().hex[:8])
            if not s.get("cod"):
                s["cod"] = self._next_cod()
            self.data["suppliers"] = [x for x in self.data["suppliers"] if x["id"] != s["id"]] + [s]
            self.save()
            return s

    def replace_all(self, data: dict):
        with self.lock:
            self.data = data
            for k, v in EMPTY.items():
                self.data.setdefault(k, json.loads(json.dumps(v)))
            self.save()

    # nomenclatoare simple (clienți, agenți, gestiuni...)
    def upsert_list_item(self, name: str, item: dict) -> dict:
        with self.lock:
            items = self.data["lists"].setdefault(name, [])
            item.setdefault("id", uuid.uuid4().hex[:8])
            self.data["lists"][name] = [x for x in items if x["id"] != item["id"]] + [item]
            self.save()
            return item

    def delete_list_item(self, name: str, iid: str):
        with self.lock:
            self.data["lists"][name] = [x for x in self.data["lists"].get(name, []) if x["id"] != iid]
            self.save()

    # confirmări de livrare: una pe (contract, lună)
    def upsert_delivery(self, d: dict) -> dict:
        with self.lock:
            old = next((x for x in self.data["deliveries"] if x["contract_id"] == d["contract_id"] and x["period"] == d["period"]), None)
            d["id"] = old["id"] if old else uuid.uuid4().hex[:8]
            self.data["deliveries"] = [x for x in self.data["deliveries"] if x["id"] != d["id"]] + [d]
            self.save()
            return d

    def delete_delivery(self, did: str):
        with self.lock:
            self.data["deliveries"] = [x for x in self.data["deliveries"] if x["id"] != did]
            self.save()

    def delete_supplier(self, sid: str):
        with self.lock:
            self.data["suppliers"] = [x for x in self.data["suppliers"] if x["id"] != sid]
            self.save()

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
