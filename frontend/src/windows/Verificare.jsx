import React, { useMemo, useState } from "react";
import { dmy, lei } from "../api.js";
import { Dot, Excel } from "../icons.jsx";
import { BottomBar, Btn, Grid, IconBtn, LinkBar, Window } from "../ui.jsx";

/** Verificarea facturilor față de contracte: sumar + toate neconcordanțele. */
export default function Verificare({ ctx, onClose }) {
  const a = ctx.analysis;
  const [sel, setSel] = useState(null);
  const [sev, setSev] = useState("toate");
  const rows = useMemo(() => {
    if (!a) return [];
    const out = [];
    for (const r of a.results) r.alerts.forEach((al, i) => out.push({ id: `${r.invoice.id}-${i}`, inv: r.invoice, ...al }));
    a.contract_alerts.forEach((al, i) => {
      const c = ctx.cmap[al.contract_id];
      out.push({ id: `c-${i}`, inv: { number: "—", supplier_name: c?.supplier_name, issue_date: "" }, ...al });
    });
    return out.filter((x) => sev === "toate" || x.severity === sev);
  }, [a, sev, ctx.cmap]);

  if (!a) return null;
  const s = a.summary;
  const columns = [
    { key: "severity", w: 18, render: (x) => <Dot status={x.severity} />, sortValue: (x) => (x.severity === "error" ? 0 : 1) },
    { key: "nr", label: "Factura", w: 110, render: (x) => x.inv.number, sortValue: (x) => x.inv.number },
    { key: "data", label: "Data", w: 76, render: (x) => dmy(x.inv.issue_date), sortValue: (x) => x.inv.issue_date },
    { key: "furnizor", label: "Furnizor", w: 180, render: (x) => x.inv.supplier_name, sortValue: (x) => x.inv.supplier_name },
    { key: "title", label: "Neconcordanță", w: 230 },
    { key: "detail", label: "Detalii", w: 460, title: (x) => x.detail },
    { key: "amount", label: "De recuperat", w: 100, align: "r", bold: true, render: (x) => (x.amount ? lei(x.amount) : "") },
  ];

  return (
    <Window title="Verificare facturi față de contracte" onClose={onClose}>
      <div className="tiles">
        <Tile label="Facturi verificate" value={s.invoices} />
        <Tile label="Corecte" value={s.ok} cls="ok" />
        <Tile label="Cu atenționări" value={s.warning} cls="warning" />
        <Tile label="Cu erori" value={s.error} cls="error" />
        <Tile label="De recuperat / contestat" value={`${lei(s.recoverable)} lei`} cls="money" />
        <Tile label="Restanțe de plată" value={`${lei(s.overdue)} lei`} cls="error" />
      </div>
      <LinkBar tools={<>
        <IconBtn title="Export Excel" onClick={() => window.open("/api/report.csv")}><Excel /></IconBtn>
        {["toate", "error", "warning"].map((v) => (
          <label key={v} className="chk"><input type="radio" checked={sev === v} onChange={() => setSev(v)} />
            {v === "toate" ? "Toate" : v === "error" ? "Erori" : "Atenționări"}</label>
        ))}
      </>} right={<span className="muted">Dublu-click → deschide factura în Intrări</span>} />
      <div className="single-area">
        <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel}
          onOpen={(x) => x.inv.id && ctx.open("intrari", { select: x.inv.id })}
          defaultSort={{ key: "severity", dir: "asc" }} empty="Nicio neconcordanță. Toate facturile corespund contractelor."
          footer={{ furnizor: `${rows.length} neconcordanțe`, amount: lei(rows.reduce((t, x) => t + (x.amount || 0), 0)) }} />
      </div>
      <BottomBar>
        <Btn onClick={() => ctx.open("intrari", { onlyProblems: true })}>Facturi cu probleme...</Btn>
        <Btn onClick={() => window.open("/api/report.csv")}>Export raport Excel</Btn>
        <Btn onClick={() => window.print()}><u>T</u>ipărire...</Btn>
        <span className="grow" />
        <Btn className="exit" onClick={onClose}>Ieșire</Btn>
      </BottomBar>
    </Window>
  );
}

function Tile({ label, value, cls = "" }) {
  return <div className={`tile ${cls}`}><div className="tile-v">{value}</div><div className="tile-l">{label}</div></div>;
}
