"""Notele contabile generate din facturile primite și din plăți (partea de cumpărări a contabilității).

Factură furnizor:  % = 401.xxxxx   (6xx cheltuiala pe fiecare linie, 4426 TVA deductibilă)
Plată furnizor:    401.xxxxx = 5121 (bancă) / 5311 (casă)
Din ele se calculează fișele de cont, balanța, cartea mare și registrul jurnal.
"""
from __future__ import annotations

from .rules import is_penalty_line, match_contract


def supplier_account(suppliers: list[dict], cui: str) -> str:
    s = next((x for x in suppliers if x.get("cui") == cui), None)
    return f"401.{s['cod']}" if s and s.get("cod") else "401"


def journal_entries(data: dict) -> list[dict]:
    """Articolele contabile, în ordine cronologică, numerotate (registrul jurnal)."""
    contracts, suppliers = data.get("contracts", []), data.get("suppliers", [])
    out = []
    for inv in data.get("invoices", []):
        c = match_contract(inv, contracts)
        acc401 = supplier_account(suppliers, inv["supplier_cui"])
        doc = f"Factura {inv['number']}"
        expl = f"{inv['supplier_name']} – factura {inv['number']}"
        by_acc: dict[str, float] = {}
        for l in inv.get("lines", []):
            acc = "6581" if is_penalty_line(l) else (c or {}).get("expense_account") or "628"
            by_acc[acc] = by_acc.get(acc, 0) + l["line_total"]
        for acc, amount in by_acc.items():
            out.append({"date": inv["issue_date"], "doc": doc, "expl": expl, "debit": acc, "credit": acc401,
                        "amount": round(amount, 2), "source": "intrari", "ref": inv.get("id")})
        # totalul de pe factură e cel datorat furnizorului; diferența față de linii se vede separat (de contestat)
        diff = round(inv.get("total_without_vat", 0) - sum(by_acc.values()), 2)
        if abs(diff) >= 0.01:
            main = next(iter(by_acc), "628")
            out.append({"date": inv["issue_date"], "doc": doc, "expl": f"Diferență total factură – de contestat ({expl})",
                        "debit": main, "credit": acc401, "amount": diff, "source": "intrari", "ref": inv.get("id")})
        if inv.get("vat_total"):
            out.append({"date": inv["issue_date"], "doc": doc, "expl": f"TVA {expl}", "debit": "4426", "credit": acc401,
                        "amount": round(inv["vat_total"], 2), "source": "intrari", "ref": inv.get("id")})
    for p in data.get("payments", []):
        cash = p.get("method") == "casa"
        out.append({"date": p["date"], "doc": p.get("doc") or ("Chitanță" if cash else "OP"),
                    "expl": f"Achit. {next((s['name'] for s in suppliers if s.get('cui') == p['supplier_cui']), p['supplier_cui'])} nr.: {p['invoice_number']}",
                    "debit": supplier_account(suppliers, p["supplier_cui"]), "credit": "5311" if cash else "5121",
                    "amount": round(p["amount"], 2), "source": "casa" if cash else "banca", "ref": p.get("id")})
    out.sort(key=lambda e: (e["date"], e["source"] != "intrari", e["doc"]))
    for i, e in enumerate(out, 1):
        e["nr"] = i
    return out


def opening_entries(data: dict, year_start: str) -> list[dict]:
    """Soldurile inițiale de trezorerie (casă / bancă), ca note de deschidere."""
    o = data.get("opening") or {}
    out = []
    for acc, key in (("5121", "banca"), ("5311", "casa")):
        if o.get(key):
            out.append({"date": year_start, "doc": "Sold inițial", "expl": "Sold inițial", "debit": acc, "credit": "1171",
                        "amount": float(o[key]), "source": "deschidere", "ref": None})
    return out
