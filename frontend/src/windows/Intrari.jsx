import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Dot, Excel, Filter, Find, Lock, Printer, Refresh } from "../icons.jsx";
import { BottomBar, Btn, Grid, IconBtn, LinkBar, Window } from "../ui.jsx";
import { CompareDetail, EmailModal, PaymentModal } from "./shared.jsx";

/** Intrări – facturile primite de la furnizori (din RO e-Factura), verificate față de contract. */
export default function Intrari({ ctx, params, onClose }) {
  const results = ctx.analysis?.results || [];
  const [sel, setSel] = useState(params.select || results[0]?.invoice.id);
  const [selLine, setSelLine] = useState(0);
  const [showDet, setShowDet] = useState(true);
  const [f, setF] = useState({ nr: "", furnizor: params.furnizor || "", probleme: params.onlyProblems || false });
  const [payment, setPayment] = useState(null);
  const [email, setEmail] = useState(null);

  const rows = useMemo(() => results.filter((r) =>
    r.invoice.number.toLowerCase().includes(f.nr.toLowerCase())
    && r.invoice.supplier_name.toLowerCase().includes(f.furnizor.toLowerCase())
    && (!f.probleme || r.status !== "ok")), [results, f]);
  const cur = results.find((r) => r.invoice.id === sel);
  const contract = cur && ctx.cmap[cur.contract_id];

  const columns = [
    { key: "lock", w: 16, render: (r) => r.invoice.validated ? <Lock /> : null, sortValue: (r) => (r.invoice.validated ? 1 : 0) },
    { key: "tip", label: "Tip", w: 28, render: () => "F" },
    { key: "nr", label: "Nr. doc.", w: 100, render: (r) => r.invoice.number, sortValue: (r) => r.invoice.number },
    { key: "cod", label: "Cod", w: 72, render: (r) => r.invoice.supplier_cui, sortValue: (r) => r.invoice.supplier_cui },
    { key: "furnizor", label: "Furnizor", w: 190, render: (r) => r.invoice.supplier_name, sortValue: (r) => r.invoice.supplier_name },
    { key: "data", label: "Data", w: 76, render: (r) => dmy(r.invoice.issue_date), sortValue: (r) => r.invoice.issue_date },
    { key: "scadent", label: "Scadent", w: 76, render: (r) => dmy(r.invoice.due_date), sortValue: (r) => r.invoice.due_date },
    { key: "valoare", label: "Valoare", w: 86, align: "r", render: (r) => lei(r.invoice.total_without_vat), sortValue: (r) => r.invoice.total_without_vat },
    { key: "tva", label: "TVA", w: 76, align: "r", render: (r) => lei(r.invoice.vat_total), sortValue: (r) => r.invoice.vat_total },
    { key: "total", label: "Total", w: 90, align: "r", bold: true, render: (r) => lei(r.invoice.total_with_vat), sortValue: (r) => r.invoice.total_with_vat },
    { key: "neach", label: "Neachitat", w: 86, align: "r", render: (r) => lei(r.invoice.total_with_vat - r.paid), sortValue: (r) => r.invoice.total_with_vat - r.paid },
    { key: "contract", label: "Contract", w: 82, render: (r) => ctx.cmap[r.contract_id]?.contract_number || "—" },
    { key: "verif", label: "Verificare", w: 230, render: (r) => <span className="verif-cell"><Dot status={r.status} />{r.alerts.map((a) => a.title).join("; ") || "corect"}</span>,
      sortValue: (r) => ({ error: 0, warning: 1, ok: 2 })[r.status], title: (r) => r.alerts.map((a) => a.title).join("\n") },
  ];

  const lineCols = [
    { key: "tip", label: "Tip", w: 60, render: () => "Serviciu" },
    { key: "gest", label: "Gestiune", w: 70, render: () => "Nedefinit" },
    { key: "den", label: "Denumire articol / serviciu", w: 240, render: (l) => l.description },
    { key: "um", label: "UM", w: 60, render: () => contract?.unit || "buc" },
    { key: "tvap", label: "TVA", w: 40, align: "r", render: (l) => l.vat_pct },
    { key: "cant", label: "Cantitate", w: 70, align: "r", render: (l) => l.quantity.toFixed(3) },
    { key: "pu", label: "Preț unitar", w: 86, align: "r", render: (l) => lei(l.unit_price) },
    { key: "pc", label: "Preț contract", w: 90, align: "r", render: (l) => (/penalit/i.test(l.description) || !cur?.allowed_price ? "—" : lei(cur.allowed_price)) },
    { key: "dif", label: "Dif.", w: 70, align: "r", render: (l) => {
      if (/penalit/i.test(l.description) || !cur?.allowed_price) return "";
      const d = l.unit_price - cur.allowed_price;
      return d > 0.009 ? <span className="err b">+{lei(d)}</span> : "0,00";
    } },
    { key: "val", label: "Valoare", w: 86, align: "r", render: (l) => lei(l.line_total) },
    { key: "tvav", label: "TVA", w: 70, align: "r", render: (l) => lei(l.line_total * l.vat_pct / 100) },
    { key: "tot", label: "Total", w: 86, align: "r", bold: true, render: (l) => lei(l.line_total * (1 + l.vat_pct / 100)) },
    { key: "cont", label: "Cont", w: 50, render: (l) => (/penalit/i.test(l.description) ? "6581" : contract?.expense_account || "628") },
  ];

  const validate = (value) => {
    if (!cur) return;
    if (value && cur.status === "error"
      && !confirm(`Factura ${cur.invoice.number} are erori față de contract:\n\n• ${cur.alerts.filter((a) => a.severity === "error").map((a) => a.title).join("\n• ")}\n\nO validezi totuși?`)) return;
    ctx.run(value ? "Validare" : "Devalidare", async () => {
      await api.setValidated(cur.invoice.id, value);
      return `Factura ${cur.invoice.number} ${value ? "validată" : "devalidată"}`;
    });
  };
  const del = () => cur && confirm(`Ștergi factura ${cur.invoice.number}?`)
    && ctx.run("Ștergere", () => api.deleteInvoice(cur.invoice.id));
  const pay = () => cur && setPayment({ supplier_cui: cur.invoice.supplier_cui, invoice_number: cur.invoice.number,
    amount: Math.max(0, cur.invoice.total_with_vat - cur.paid).toFixed(2) });
  const contest = async () => cur && setEmail(await api.dispute(cur.invoice.id));
  const disputable = cur?.alerts.some((a) => !["OVERDUE", "OVERPAID", "NO_CONTRACT"].includes(a.code));

  const totals = rows.reduce((t, r) => ({ v: t.v + r.invoice.total_without_vat, tva: t.tva + r.invoice.vat_total,
    tot: t.tot + r.invoice.total_with_vat, n: t.n + r.invoice.total_with_vat - r.paid }), { v: 0, tva: 0, tot: 0, n: 0 });

  return (
    <Window title="Intrări (facturi furnizori – RO e-Factura)" onClose={onClose}>
      <LinkBar onAdd={ctx.importInvoices} addLabel="Adaug"
        onEdit={() => alert("Facturile primite prin e-Factura nu se modifică. Pentru neconcordanțe folosește „Contestație...”.")}
        onDelete={del}
        tools={<>
          <IconBtn title="Caută după număr" onClick={() => document.getElementById("f-nr")?.focus()}><Find /></IconBtn>
          <IconBtn title="Export Excel (raport neconcordanțe)" onClick={() => window.open("/api/report.csv")}><Excel /></IconBtn>
          <IconBtn title="Tipărire" onClick={() => window.print()}><Printer /></IconBtn>
          <IconBtn title="Reîmprospătare" onClick={ctx.refresh}><Refresh /></IconBtn>
          <label className="chk" title="Doar facturile cu probleme"><Filter />
            <input type="checkbox" checked={f.probleme} onChange={(e) => setF({ ...f, probleme: e.target.checked })} /> doar cu probleme</label>
        </>}
        right={<button className={`detbtn${showDet ? " on" : ""}`} onClick={() => setShowDet(!showDet)}>Detalii</button>} />

      <div className={`master-area${showDet ? " with-det" : ""}`}>
        <div className="stack">
          <Grid columns={columns} rows={rows} getId={(r) => r.invoice.id} selected={sel} onSelect={(id) => { setSel(id); setSelLine(0); }}
            onOpen={() => setShowDet(true)} onInsert={ctx.importInvoices} onDelete={del}
            rowClass={(r) => `st-${r.status}`} defaultSort={{ key: "data", dir: "asc" }}
            empty="Nu există facturi. Adaug → import XML / ZIP din SPV."
            footer={{ furnizor: `${rows.length} documente`, valoare: lei(totals.v), tva: lei(totals.tva), total: lei(totals.tot), neach: lei(totals.n) }} />
          <div className="filterrow">
            <input id="f-nr" placeholder="Nr. doc." value={f.nr} onChange={(e) => setF({ ...f, nr: e.target.value })} style={{ width: 110 }} />
            <input placeholder="Furnizor" value={f.furnizor} onChange={(e) => setF({ ...f, furnizor: e.target.value })} style={{ width: 200 }} />
            {cur && <span className="muted">{cur.invoice.number} · {cur.invoice.supplier_cui} · {cur.invoice.supplier_name} · fișier {cur.invoice.source_file}</span>}
          </div>
          <LinkBar right={<span className="muted">{cur ? `${cur.invoice.lines.length} linii` : ""}</span>} />
          <div className="lines-area">
            <Grid columns={lineCols} rows={cur?.invoice.lines.map((l, i) => ({ ...l, id: i })) || []} selected={selLine} onSelect={setSelLine}
              empty="Selectează o factură." />
          </div>
        </div>
        {showDet && <CompareDetail r={cur} contract={contract} />}
      </div>

      <BottomBar>
        <Btn onClick={() => validate(true)} disabled={!cur || cur.invoice.validated}><u>V</u>alidez</Btn>
        <Btn onClick={pay} disabled={!cur}><u>P</u>lată...</Btn>
        <Btn onClick={contest} disabled={!disputable}><u>C</u>ontestație...</Btn>
        <Btn disabled title="Stornarea se face în programul de contabilitate">Stornez</Btn>
        <Btn onClick={() => window.print()}><u>T</u>ipărire...</Btn>
        <Btn onClick={() => validate(false)} disabled={!cur?.invoice.validated}><u>D</u>evalidez</Btn>
        <span className="grow" />
        <Btn className="exit" onClick={onClose}>Ieșire</Btn>
      </BottomBar>

      {payment && <PaymentModal ctx={ctx} initial={payment} onClose={() => setPayment(null)} />}
      {email && <EmailModal email={email} onClose={() => setEmail(null)} />}
    </Window>
  );
}
