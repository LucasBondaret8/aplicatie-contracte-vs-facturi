import React, { useMemo, useState } from "react";
import { dmy, lei } from "../api.js";
import { Dot, ExportI, Print } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, TBtn, TextBtns, Window } from "../ui.jsx";

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
      out.push({ id: `c-${i}`, inv: { number: "", supplier_name: c?.supplier_name, issue_date: "" }, ...al });
    });
    return out.filter((x) => sev === "toate" || x.severity === sev);
  }, [a, sev, ctx.cmap]);

  if (!a) return null;
  const s = a.summary;
  const columns = [
    { key: "severity", w: 22, render: (x) => <Dot status={x.severity} />, sortValue: (x) => (x.severity === "error" ? 0 : 1) },
    { key: "nr", label: "Nr. doc.", w: 110, render: (x) => x.inv.number, sortValue: (x) => x.inv.number },
    { key: "data", label: "Data", w: 76, render: (x) => dmy(x.inv.issue_date), sortValue: (x) => x.inv.issue_date },
    { key: "furnizor", label: "Furnizor", w: 180, render: (x) => x.inv.supplier_name, sortValue: (x) => x.inv.supplier_name },
    { key: "title", label: "Neconcordanță", w: 230 },
    { key: "detail", label: "Detalii", w: 480, title: (x) => x.detail },
    { key: "amount", label: "De recuperat", w: 100, align: "r", cls: "pink", bold: true, render: (x) => (x.amount ? lei(x.amount) : "") },
  ];

  return (
    <Window onClose={onClose}>
      <div className="tiles">
        <Tile label="Facturi verificate" value={s.invoices} />
        <Tile label="Corecte" value={s.ok} cls="ok" />
        <Tile label="Cu atenționări" value={s.warning} cls="warning" />
        <Tile label="Cu erori" value={s.error} cls="error" />
        <Tile label="De recuperat / contestat" value={`${lei(s.recoverable)} lei`} cls="money" />
        <Tile label="Restanțe de plată" value={`${lei(s.overdue)} lei`} cls="error" />
      </div>
      <div className="toolbar">
        <Group><TBtn icon={<ExportI />} label="Export XLS" onClick={() => window.open("/api/report.csv")} /><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
        <TextBtns items={[["Toate", () => setSev("toate")], ["Erori", () => setSev("error")], ["Atenționări", () => setSev("warning")]]} />
        <span className="chk muted">Afișez: {sev === "toate" ? "toate" : sev === "error" ? "erori" : "atenționări"} · dublu-click deschide factura</span>
      </div>
      <div className="split">
        <div className="pane">
          <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel} minRows={8}
            onOpen={(x) => x.inv.id && ctx.open("intrari", { select: x.inv.id })}
            defaultSort={{ key: "severity", dir: "asc" }} empty="Nicio neconcordanță. Toate facturile corespund contractelor."
            footer={{ furnizor: `${rows.length} neconcordanțe`, amount: lei(rows.reduce((t, x) => t + (x.amount || 0), 0)) }} />
        </div>
      </div>
      <BottomBar>
        <Btn label="Facturi cu probleme" alt="F" onClick={() => ctx.open("intrari", { onlyProblems: true })} />
        <Btn icon={<ExportI />} label="Export raport" alt="X" onClick={() => window.open("/api/report.csv")} />
        <Btn icon={<Print />} label="Tipărire" alt="E" onClick={() => window.print()} />
      </BottomBar>
    </Window>
  );
}

function Tile({ label, value, cls = "" }) {
  return <div className={`tile ${cls}`}><div className="tile-v">{value}</div><div className="tile-l">{label}</div></div>;
}
