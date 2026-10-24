import React, { useMemo, useState } from "react";
import { dmy, lei } from "../api.js";
import { Check, Copy, Dot, ExportI, Paste, Print, Search } from "../icons.jsx";
import { Grid, Group, LinkBar, TBtn, Window } from "../ui.jsx";
import { partners } from "./shared.jsx";

/** Furnizori + fișa furnizorului (facturi și plăți, cu sold cumulat). */
export default function Furnizori({ ctx, params, onClose }) {
  const rows = useMemo(() => partners(ctx).sort((a, b) => a.name.localeCompare(b.name, "ro")).map((p, i) => ({ ...p, cod: String(i + 1).padStart(4, "0") })), [ctx]);
  const [sel, setSel] = useState(params.select || rows[0]?.cui);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ cod: "", name: "", cui: "" });
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
    { key: "cod", label: "Cod", w: 50 },
    { key: "name", label: "Denumire", w: 220 },
    { key: "cui", label: "Cod fiscal / CNP", w: 100 },
    { key: "analitic", label: "Cont analitic", w: 90, render: (p) => `401.${p.cod}` },
    { key: "tara", label: "Țara", w: 40, render: () => "RO" },
    { key: "contracts", label: "Contracte", w: 64, align: "r" },
    { key: "invoices", label: "Facturi", w: 56, align: "r" },
    { key: "rulaj", label: "Rulaj", w: 96, align: "r", cls: "grey", render: (p) => lei(p.rulaj) },
    { key: "paid", label: "Plătit", w: 96, align: "r", cls: "grey", render: (p) => lei(p.paid) },
    { key: "sold", label: "Sold", w: 96, align: "r", cls: "pink", bold: true, render: (p) => lei(p.sold) },
    { key: "verif", label: "Verificare contract", w: 170, sortValue: (p) => -p.errors,
      render: (p) => <span className="verif-cell"><Dot status={p.errors ? "error" : p.warnings ? "warning" : "ok"} />
        {[p.errors && `${p.errors} erori`, p.warnings && `${p.warnings} atenționări`].filter(Boolean).join(", ") || "Corect"}</span> },
  ];
  const fisaCols = [
    { key: "date", label: "Data", w: 80, render: (e) => dmy(e.date) },
    { key: "doc", label: "Document", w: 110 },
    { key: "expl", label: "Explicație", w: 260, render: (e) => <span className="verif-cell">{e.status && <Dot status={e.status} />}{e.expl}</span> },
    { key: "debit", label: "Debit", w: 100, align: "r", cls: "grey", render: (e) => (e.debit ? lei(e.debit) : "") },
    { key: "credit", label: "Credit", w: 100, align: "r", cls: "grey", render: (e) => (e.credit ? lei(e.credit) : "") },
    { key: "sold", label: "Sold", w: 100, align: "r", cls: "pink", bold: true, render: (e) => lei(e.sold) },
  ];
  const has = (v, s) => String(v).toLowerCase().includes(s.toLowerCase());
  const shown = rows.filter((p) => has(p.cod, f.cod) && has(p.name, f.name) && has(p.cui, f.cui) && (!q || has(`${p.name} ${p.cui}`, q)));
  const info = () => alert("Furnizorii se preiau automat din contracte și din facturile e-Factura.");

  return (
    <Window onClose={onClose}>
      <LinkBar onAdd={info} onEdit={info}
        tools={<>
          <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
          <div className="search"><input placeholder="Căutare..." value={q} onChange={(e) => setQ(e.target.value)} /><TBtn icon={<Search />} onClick={() => {}} title="Căutare" /></div>
          <Group>
            <TBtn icon={<Check />} label="Verificare" onClick={() => cur && ctx.open("intrari", { furnizor: cur.name })} title="Facturile furnizorului verificate față de contract" />
            <TBtn icon={<Check />} label="Verificare toți furnizorii" onClick={() => ctx.open("verificare")} />
          </Group>
          <Group><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
        </>} />
      <div className="split">
        <div className="pane top">
          <Grid columns={columns} rows={shown} getId={(p) => p.cui} selected={sel} onSelect={setSel}
            onOpen={(p) => ctx.open("intrari", { furnizor: p.name })} />
          <div className="filterrow">
            <input placeholder="Cod" style={{ width: 50 }} value={f.cod} onChange={(e) => setF({ ...f, cod: e.target.value })} />
            <input placeholder="Denumire" style={{ width: 220 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input placeholder="Cod fiscal / CNP" style={{ width: 100 }} value={f.cui} onChange={(e) => setF({ ...f, cui: e.target.value })} />
          </div>
        </div>
        <div className="pane bottom">
          <div className="toolbar"><span className="chk"><b>Fișa furnizorului</b>{cur ? ` ${cur.name} · cont 401.${cur.cod}` : ""}</span></div>
          <Grid columns={fisaCols} rows={fisa} selected={null} empty="Fără mișcări." />
        </div>
      </div>
    </Window>
  );
}
