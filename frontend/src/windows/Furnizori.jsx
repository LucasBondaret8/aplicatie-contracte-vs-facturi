import React, { useMemo, useState } from "react";
import { dmy, lei } from "../api.js";
import { Dot } from "../icons.jsx";
import { BottomBar, Btn, Grid, LinkBar, Window } from "../ui.jsx";
import { partners } from "./shared.jsx";

/** Furnizori + fișa furnizorului (facturi și plăți, cu sold cumulat). */
export default function Furnizori({ ctx, onClose }) {
  const rows = useMemo(() => partners(ctx), [ctx]);
  const [sel, setSel] = useState(rows[0]?.cui);
  const [find, setFind] = useState("");
  const cur = rows.find((p) => p.cui === sel);

  const fisa = useMemo(() => {
    if (!cur) return [];
    const ev = [];
    for (const r of ctx.analysis?.results || []) {
      if (r.invoice.supplier_cui !== cur.cui) continue;
      ev.push({ id: "f" + r.invoice.id, date: r.invoice.issue_date, doc: r.invoice.number, expl: `Factura ${r.invoice.number}`,
        debit: 0, credit: r.invoice.total_with_vat, status: r.status });
    }
    for (const p of ctx.data.payments) {
      if (p.supplier_cui !== cur.cui) continue;
      ev.push({ id: "p" + p.id, date: p.date, doc: p.doc || (p.method === "casa" ? "Chitanță" : "OP"), expl: `Plată factura ${p.invoice_number}`,
        debit: p.amount, credit: 0 });
    }
    ev.sort((a, b) => a.date.localeCompare(b.date) || (a.credit ? -1 : 1));
    let sold = 0;
    return ev.map((e) => ({ ...e, sold: (sold += e.credit - e.debit) }));
  }, [cur, ctx]);

  const columns = [
    { key: "status", w: 18, render: (p) => <Dot status={p.errors ? "error" : p.warnings ? "warning" : "ok"} />, sortValue: (p) => -p.errors },
    { key: "cui", label: "Cod fiscal", w: 90 },
    { key: "name", label: "Denumire", w: 230 },
    { key: "contracts", label: "Contracte", w: 70, align: "r" },
    { key: "invoices", label: "Facturi", w: 60, align: "r" },
    { key: "rulaj", label: "Rulaj", w: 100, align: "r", render: (p) => lei(p.rulaj) },
    { key: "paid", label: "Plătit", w: 100, align: "r", render: (p) => lei(p.paid) },
    { key: "sold", label: "Sold", w: 100, align: "r", bold: true, render: (p) => lei(p.sold) },
    { key: "probleme", label: "Probleme", w: 160, render: (p) => [p.errors && `${p.errors} erori`, p.warnings && `${p.warnings} atenționări`].filter(Boolean).join(", ") || "—" },
  ];
  const fisaCols = [
    { key: "date", label: "Data", w: 80, render: (e) => dmy(e.date) },
    { key: "doc", label: "Document", w: 110 },
    { key: "expl", label: "Explicație", w: 260, render: (e) => <>{e.status && <Dot status={e.status} />} {e.expl}</> },
    { key: "debit", label: "Debit (plăți)", w: 100, align: "r", render: (e) => (e.debit ? lei(e.debit) : "") },
    { key: "credit", label: "Credit (facturi)", w: 110, align: "r", render: (e) => (e.credit ? lei(e.credit) : "") },
    { key: "sold", label: "Sold", w: 100, align: "r", bold: true, render: (e) => lei(e.sold) },
  ];
  const shown = rows.filter((p) => p.name.toLowerCase().includes(find.toLowerCase()) || p.cui.includes(find));

  return (
    <Window title="Furnizori – fișă furnizor" onClose={onClose}>
      <LinkBar onAdd={() => alert("Furnizorii se preiau automat din contracte și din facturile e-Factura.")}
        tools={<input className="find" placeholder="Caută furnizor / CUI" value={find} onChange={(e) => setFind(e.target.value)} />} />
      <div className="stack">
        <Grid columns={columns} rows={shown} getId={(p) => p.cui} selected={sel} onSelect={setSel}
          onOpen={(p) => ctx.open("intrari", { furnizor: p.name })} defaultSort={{ key: "name", dir: "asc" }} />
        <LinkBar right={<span className="muted">{cur ? `Fișa furnizorului ${cur.name}` : ""}</span>} />
        <div className="lines-area">
          <Grid columns={fisaCols} rows={fisa} selected={null} empty="Fără mișcări." />
        </div>
      </div>
      <BottomBar>
        <Btn onClick={() => ctx.open("scadentar")}>Scadențar...</Btn>
        <Btn onClick={() => window.print()}><u>T</u>ipărire...</Btn>
        <span className="grow" />
        <Btn className="exit" onClick={onClose}>Ieșire</Btn>
      </BottomBar>
    </Window>
  );
}
