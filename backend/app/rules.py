"""Motor de reguli determinist: ce s-a semnat (contract) vs. ce s-a facturat, plătit și livrat, lună de lună.

Fiecare alertă are: code, severity (error|warning), title, detail, amount.
`amount` = suma în lei care se poate recupera / contesta de la furnizor; la licențele nefolosite e
economia posibilă (nu e vina furnizorului), raportată separat în sumar.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from .efactura import normalize_cui

PENALTY_WORDS = ("penalit", "dobând", "dobanda", "majorăr", "majorari")
MONEY_TOL = 0.05  # toleranță de rotunjire, lei
WARN_DAYS = 60  # cu câte zile înainte avertizăm despre expirare / termenul de denunțare
SAVINGS_CODES = {"UNUSED_LICENSES"}  # economii posibile, nu sume de recuperat de la furnizor


def _d(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _r(x: float) -> float:
    return round(x + 0.0, 2)


def ro(x: float) -> str:
    """12500.5 -> '12.500,50' (format românesc)."""
    return f"{x:,.2f}".replace(",", " ").replace(".", ",").replace(" ", ".")


def dmy(d: date | None) -> str:
    return d.strftime("%d.%m.%Y") if d else "nedeterminat"


def _alert(code, severity, title, detail, amount=0.0):
    return {"code": code, "severity": severity, "title": title, "detail": detail, "amount": _r(max(amount, 0.0))}


def is_penalty_line(line: dict) -> bool:
    d = (line.get("description") or "").lower()
    return any(w in d for w in PENALTY_WORDS)


def period_key(inv: dict) -> str:
    d = inv.get("period_start") or inv.get("issue_date") or ""
    return d[:7]


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last))


def effective_end(contract: dict, on: date) -> date | None:
    """Sfârșitul contractului valabil la data `on`, ținând cont de reînnoirile automate deja operate."""
    end = _d(contract.get("end_date"))
    months = int(contract.get("renewal_months") or 12)
    if end and contract.get("auto_renew"):
        while end < on:
            end = add_months(end, months)
    return end


def allowed_unit_price(contract: dict, on: date) -> float:
    """Prețul maxim permis la o dată, aplicând indexarea anuală plafonată."""
    base = float(contract.get("unit_price") or 0)
    if contract.get("indexation_type") in (None, "", "none"):
        return base
    start = _d(contract.get("start_date"))
    pct = float(contract.get("indexation_max_pct") or 0) / 100
    month = int(contract.get("indexation_month") or 1)
    if not start or pct <= 0:
        return base
    n = sum(1 for y in range(start.year + 1, on.year + 1) if date(y, month, 1) <= on)
    return base * (1 + pct) ** n


def discount_at(contract: dict, on: date) -> float:
    """Reducerea din contract (%) valabilă la data `on` (0 dacă nu există sau a expirat)."""
    pct = float(contract.get("discount_pct") or 0)
    until = _d(contract.get("discount_until"))
    return pct if pct > 0 and (not until or on <= until) else 0.0


def contract_price(contract: dict, on: date) -> float:
    """Prețul unitar care trebuie să apară pe factură: indexat (maxim) și cu reducerea din contract."""
    return allowed_unit_price(contract, on) * (1 - discount_at(contract, on) / 100)


def match_contract(inv: dict, contracts: list[dict]) -> dict | None:
    cui = normalize_cui(inv.get("supplier_cui"))
    candidates = [c for c in contracts if normalize_cui(c.get("supplier_cui")) == cui]
    if len(candidates) <= 1:
        return candidates[0] if candidates else None
    text = " ".join(l.get("description", "") for l in inv.get("lines", [])).lower()

    def score(c):
        return sum(1 for k in c.get("service_keywords") or [] if k.lower() in text)

    return max(candidates, key=score)


def check_invoice(inv: dict, contract: dict | None, payments: list[dict], today: date, delivery: dict | None = None) -> list[dict]:
    alerts: list[dict] = []
    issue = _d(inv.get("issue_date"))
    due = _d(inv.get("due_date"))
    total = float(inv.get("total_with_vat") or inv.get("payable") or 0)

    # --- coerența internă a facturii (nu depinde de contract) ---
    lines_net = sum(l["line_total"] for l in inv.get("lines", []))
    if abs(lines_net - inv.get("total_without_vat", 0)) > MONEY_TOL:
        alerts.append(_alert("TOTAL_CALC", "error", "Total greșit calculat",
                             f"Suma liniilor este {ro(lines_net)}, dar factura are total fără TVA {ro(inv['total_without_vat'])}.",
                             inv["total_without_vat"] - lines_net))
    vat_calc = sum(l["line_total"] * l["vat_pct"] / 100 for l in inv.get("lines", []))
    if abs(vat_calc - inv.get("vat_total", 0)) > MONEY_TOL * 2:
        alerts.append(_alert("VAT_CALC", "error", "TVA calculat greșit",
                             f"TVA corect pe linii: {ro(vat_calc)}, pe factură: {ro(inv['vat_total'])}.",
                             inv["vat_total"] - vat_calc))

    # --- plăți ---
    paid = sum(p["amount"] for p in payments)
    if paid > total + MONEY_TOL:
        alerts.append(_alert("OVERPAID", "warning", "Plată în plus",
                             f"S-a plătit {ro(paid)} pentru o factură de {ro(total)}.", paid - total))
    elif due and due < today and paid < total - MONEY_TOL:
        rest = total - paid
        days = (today - due).days
        risk = ""
        if contract and contract.get("late_penalty_pct_per_day"):
            pen = rest * float(contract["late_penalty_pct_per_day"]) / 100 * days
            risk = f" Risc penalități conform contractului: ~{ro(pen)} {inv.get('currency', 'RON')}."
        kind = "parțial plătită" if paid > 0 else "neplătită"
        alerts.append(_alert("OVERDUE", "error", f"Factură restantă ({kind})",
                             f"Rest de plată {ro(rest)}, scadentă de {days} zile ({inv['due_date']}).{risk}"))

    if contract is None:
        alerts.append(_alert("NO_CONTRACT", "warning", "Fără contract asociat",
                             f"Nu există niciun contract pentru furnizorul {inv.get('supplier_name')} (CUI {inv.get('supplier_cui')})."))
        return alerts

    # --- față de contract ---
    cur = contract.get("currency") or "RON"
    if inv.get("currency") and inv["currency"] != cur:
        alerts.append(_alert("CURRENCY", "error", "Monedă diferită",
                             f"Factura e în {inv['currency']}, contractul în {cur}."))

    ref = _d(inv.get("period_start")) or issue or today
    start, end = _d(contract.get("start_date")), effective_end(contract, ref)
    if (start and ref < start) or (end and ref > end):
        alerts.append(_alert("OUT_OF_CONTRACT", "error", "Facturat în afara perioadei contractului",
                             f"Perioada facturată {dmy(ref)} nu e în contract ({dmy(start)} – {dmy(_d(contract.get('end_date')))}"
                             f"{', fără reînnoire automată' if not contract.get('auto_renew') else ''}).", total))

    if issue and due and contract.get("payment_term_days") is not None:
        term = (due - issue).days
        expected = int(contract["payment_term_days"])
        if term < expected:
            alerts.append(_alert("DUE_DATE", "warning", "Termen de plată mai scurt decât în contract",
                                 f"Factura cere plata în {term} zile, contractul prevede {expected} zile (scadență corectă: "
                                 f"{dmy(issue + timedelta(days=expected))})."))

    vat_rate = contract.get("vat_rate")
    allowed = allowed_unit_price(contract, ref)
    disc = discount_at(contract, ref)
    agreed = allowed * (1 - disc / 100)
    unit = contract.get("unit") or "buc"
    qty_expected = contract.get("quantity_per_period")
    billed_qty = 0.0
    main_price = 0.0
    main_vat = float(vat_rate or 0)
    for l in inv.get("lines", []):
        if is_penalty_line(l):
            if not contract.get("late_penalty_pct_per_day"):
                alerts.append(_alert("PENALTY", "error", "Penalități nepermise de contract",
                                     f"Linia „{l['description']}” ({ro(l['line_total'])}) – contractul nu prevede penalități.",
                                     l["line_total"] * (1 + l["vat_pct"] / 100)))
            continue
        billed_qty += l["quantity"]
        main_price, main_vat = l["unit_price"], l["vat_pct"]
        if vat_rate is not None and abs(l["vat_pct"] - float(vat_rate)) > 0.01:
            alerts.append(_alert("VAT_RATE", "error", "Cotă TVA diferită",
                                 f"„{l['description']}”: TVA {l['vat_pct']:g}% pe factură, {float(vat_rate):g}% legal/în contract."))
        if allowed and l["unit_price"] > allowed + 0.01:
            idx = " (inclusiv indexarea maximă permisă)" if allowed != float(contract.get("unit_price") or 0) else ""
            dsc = f", iar cu reducerea de {disc:g}% din contract {ro(agreed)}" if disc else ""
            alerts.append(_alert("PRICE", "error", "Preț peste contract",
                                 f"„{l['description']}”: {ro(l['unit_price'])}/{unit} facturat, maxim permis {ro(allowed)}{idx}{dsc}.",
                                 (l["unit_price"] - agreed) * l["quantity"] * (1 + l["vat_pct"] / 100)))
        elif disc and l["unit_price"] > agreed + 0.01:
            until = _d(contract.get("discount_until"))
            alerts.append(_alert("DISCOUNT_MISSING", "error", "Reducerea din contract nu e aplicată",
                                 f"Contractul prevede {disc:g}% reducere{f' până la {dmy(until)}' if until else ''}: "
                                 f"{ro(l['unit_price'])}/{unit} facturat, cu reducere trebuia {ro(agreed)}.",
                                 (l["unit_price"] - agreed) * l["quantity"] * (1 + l["vat_pct"] / 100)))
        if qty_expected and not contract.get("is_licenses") and l["quantity"] > float(qty_expected) + 1e-9:
            extra = (l["quantity"] - float(qty_expected)) * min(l["unit_price"], agreed or l["unit_price"])
            alerts.append(_alert("QUANTITY", "warning", "Cantitate peste contract",
                                 f"„{l['description']}”: {l['quantity']:g} facturate, contractul prevede {float(qty_expected):g}/perioadă.",
                                 extra * (1 + l["vat_pct"] / 100)))

    # --- ce s-a livrat efectiv (confirmarea de livrare / recepție pentru perioada facturată) ---
    if delivery:
        per = period_key(inv)
        proof = f" ({delivery['doc']})" if delivery.get("doc") else ""
        note = f" Observații: {delivery['note']}." if delivery.get("note") else ""
        got = delivery.get("quantity")
        if delivery.get("status") == "nelivrat":
            alerts.append(_alert("NOT_DELIVERED", "error", "Facturat, dar nelivrat",
                                 f"Pentru {per} s-a confirmat că serviciul NU a fost livrat{proof}, dar furnizorul l-a facturat.{note}", total))
        elif got is not None and billed_qty > float(got) + 1e-9:
            missing = billed_qty - float(got)
            price = main_price or agreed
            if contract.get("is_licenses"):
                alerts.append(_alert("UNUSED_LICENSES", "warning", "Licențe plătite, dar nefolosite",
                                     f"Facturate {billed_qty:g} licențe în {per}, folosite {float(got):g}: {missing:g} licențe plătite degeaba "
                                     f"(~{ro(missing * price * (1 + main_vat / 100))} lei/lună). Reduceți numărul la reînnoire.",
                                     missing * price * (1 + main_vat / 100)))
            else:
                alerts.append(_alert("UNDER_DELIVERED", "error", "Facturat mai mult decât s-a livrat",
                                     f"Facturat {billed_qty:g} {unit} în {per}, primit {float(got):g} conform confirmării{proof}.{note}",
                                     missing * price * (1 + main_vat / 100)))
        elif delivery.get("status") == "partial" and got is None:
            alerts.append(_alert("PARTIAL_DELIVERY", "warning", "Livrare parțială",
                                 f"Pentru {per} s-a confirmat o livrare parțială{proof}. Verificați dacă factura o reflectă.{note}"))
    return alerts


def months_between(a: date, b: date) -> list[str]:
    out, y, m = [], a.year, a.month
    while (y, m) <= (b.year, b.month):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def contract_status(c: dict, today: date) -> dict:
    """Starea contractului azi: activ / expiră curând / se reînnoiește automat (cu termenul de denunțare) / expirat."""
    end_raw = _d(c.get("end_date"))
    if not end_raw:
        return {"code": "ACTIVE", "label": "Activ (nedeterminat)", "end": None}
    if c.get("auto_renew"):
        end = effective_end(c, today)
        deadline = end - timedelta(days=int(c.get("notice_days") or 0))
        renewed = end != end_raw
        return {"code": "AUTO_RENEW", "label": f"Se reînnoiește pe {dmy(end)}", "end": end.isoformat(),
                "notice_deadline": deadline.isoformat(), "renewed": renewed}
    if end_raw < today:
        return {"code": "EXPIRED", "label": f"Expirat pe {dmy(end_raw)}", "end": end_raw.isoformat()}
    return {"code": "ACTIVE", "label": f"Activ până la {dmy(end_raw)}", "end": end_raw.isoformat()}


def contract_alerts_for(c: dict, today: date) -> list[dict]:
    """Alertele despre contract în sine: reînnoire automată (preaviz), expirare apropiată."""
    out = []
    st = contract_status(c, today)
    name = f"{c.get('title') or 'Contractul'} ({c.get('supplier_name')})"
    if st["code"] == "AUTO_RENEW":
        end, deadline = date.fromisoformat(st["end"]), date.fromisoformat(st["notice_deadline"])
        months = int(c.get("renewal_months") or 12)
        left = (deadline - today).days
        if 0 <= left <= WARN_DAYS:
            out.append(_alert("RENEWAL_NOTICE", "warning", "Reînnoire automată: termen de denunțare apropiat",
                              f"{name} se reînnoiește automat pe {dmy(end)} pentru încă {months} luni. Dacă nu-l mai vreți "
                              f"sau vreți alte condiții, trimiteți denunțarea până pe {dmy(deadline)} (mai sunt {left} zile)."))
        elif left < 0 and (end - today).days <= WARN_DAYS:
            out.append(_alert("RENEWAL_LOCKED", "warning", "Reînnoire automată: termenul de denunțare a trecut",
                              f"{name} se reînnoiește automat pe {dmy(end)} pentru încă {months} luni; termenul de denunțare "
                              f"a fost {dmy(deadline)}."))
    elif st["code"] == "ACTIVE" and st["end"]:
        left = (date.fromisoformat(st["end"]) - today).days
        if left <= WARN_DAYS:
            out.append(_alert("EXPIRING", "warning", "Contractul expiră curând",
                              f"{name} expiră pe {dmy(date.fromisoformat(st['end']))} (peste {left} zile) și nu se reînnoiește "
                              f"automat. Prelungiți-l sau cereți o ofertă nouă, altfel facturile de după vor fi fără acoperire."))
    return [{"contract_id": c["id"], **a} for a in out]


def analyze(contracts: list[dict], invoices: list[dict], payments: list[dict], today: date | None = None,
            deliveries: list[dict] | None = None) -> dict:
    today = today or date.today()
    pay_by_inv = defaultdict(list)
    for p in payments:
        pay_by_inv[(normalize_cui(p.get("supplier_cui")), p.get("invoice_number"))].append(p)
    deliv = {(d["contract_id"], d["period"]): d for d in deliveries or []}

    results = []
    by_contract_period = defaultdict(list)
    for inv in invoices:
        c = match_contract(inv, contracts)
        pays = pay_by_inv[(normalize_cui(inv.get("supplier_cui")), inv.get("number"))]
        d = deliv.get((c["id"], period_key(inv))) if c else None
        alerts = check_invoice(inv, c, pays, today, d)
        ref = _d(inv.get("period_start")) or _d(inv.get("issue_date")) or today
        res = {"invoice": inv, "contract_id": c["id"] if c else None, "paid": _r(sum(p["amount"] for p in pays)),
               "allowed_price": _r(contract_price(c, ref)) if c else None,
               "max_price": _r(allowed_unit_price(c, ref)) if c else None,
               "discount_pct": discount_at(c, ref) if c else 0, "delivery": d, "alerts": alerts}
        results.append(res)
        if c:
            by_contract_period[(c["id"], period_key(inv))].append(res)

    # dubluri: aceeași perioadă facturată de mai multe ori pe același contract
    for (_cid, per), group in by_contract_period.items():
        if len(group) > 1:
            group.sort(key=lambda r: r["invoice"].get("issue_date", ""))
            first = group[0]["invoice"]["number"]
            for r in group[1:]:
                total = r["invoice"].get("total_with_vat", 0)
                r["alerts"].append(_alert("DUPLICATE", "error", "Factură dublată",
                                          f"Perioada {per} a fost deja facturată prin {first}.", total))

    contract_alerts = []
    statuses = {}
    for c in contracts:
        statuses[c["id"]] = contract_status(c, today)
        contract_alerts += contract_alerts_for(c, today)
        # lipsă facturi lunare (până la sfârșitul contractului, cu reînnoirile automate)
        if c.get("billing_period", "lunar") != "lunar":
            continue
        start = _d(c.get("start_date"))
        if not start:
            continue
        end = min(effective_end(c, today) or today, today)
        inv_periods = {p for (cid, p) in by_contract_period if cid == c["id"]}
        if not inv_periods:
            continue
        first_seen = min(inv_periods)
        last_complete = months_between(start, end)[:-1] if end == today else months_between(start, end)
        for m in [m for m in last_complete if m >= first_seen and m not in inv_periods]:
            contract_alerts.append({"contract_id": c["id"], **_alert(
                "MISSING", "warning", "Factură lipsă",
                f"Nu există factură de la {c.get('supplier_name')} pentru {m}. Verifică în SPV sau cere-o furnizorului.")})

    for r in results:
        # o factură nedatorată (dublură / în afara contractului / nelivrată) se contestă, nu se plătește
        if any(a["code"] in ("DUPLICATE", "OUT_OF_CONTRACT", "NOT_DELIVERED") for a in r["alerts"]):
            r["alerts"] = [a for a in r["alerts"] if a["code"] != "OVERDUE"]
        sev = {a["severity"] for a in r["alerts"]}
        r["status"] = "error" if "error" in sev else "warning" if "warning" in sev else "ok"

    overdue = sum(r["invoice"].get("total_with_vat", 0) - r["paid"]
                  for r in results if any(a["code"] == "OVERDUE" for a in r["alerts"]))
    all_alerts = [a for r in results for a in r["alerts"]]
    summary = {
        "invoices": len(results),
        "ok": sum(r["status"] == "ok" for r in results),
        "warning": sum(r["status"] == "warning" for r in results),
        "error": sum(r["status"] == "error" for r in results),
        "recoverable": _r(sum(a["amount"] for a in all_alerts if a["code"] not in SAVINGS_CODES)),
        "savings": _r(sum(a["amount"] for a in all_alerts if a["code"] in SAVINGS_CODES)),
        "overdue": _r(overdue),
        "missing": sum(a["code"] == "MISSING" for a in contract_alerts),
        "contract_alerts": len(contract_alerts),
        "today": today.isoformat(),
    }
    results.sort(key=lambda r: (r["invoice"].get("issue_date", ""), r["invoice"].get("number", "")))
    return {"summary": summary, "results": results, "contract_alerts": contract_alerts, "contract_status": statuses}
