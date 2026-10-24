import React, { useMemo, useState } from "react";
import { daysBetween, dmy, lei } from "../api.js";
import { BottomBar, Btn, Grid, LinkBar, Window } from "../ui.jsx";
import { PaymentModal } from "./shared.jsx";

const BUCKETS = [["nescadent", "Nescadent"], ["b30", "1–30 zile"], ["b60", "31–60 zile"], ["b90", "61–90 zile"], ["peste", "> 90 zile"]];
const bucket = (d) => (d <= 0 ? "nescadent" : d <= 30 ? "b30" : d <= 60 ? "b60" : d <= 90 ? "b90" : "peste");

/** Scadențar furnizori: datoriile neachitate pe intervale de întârziere. */
export default function Scadentar({ ctx, onClose }) {
  const [sel, setSel] = useState(null);
  const [pay, setPay] = useState(null);
  const open = useMemo(() => (ctx.analysis?.results || [])
    .filter((r) => r.invoice.total_with_vat - r.paid > 0.009
      && !r.alerts.some((a) => a.code === "DUPLICATE" || a.code === "OUT_OF_CONTRACT"))
    .map((r) => ({ r, rest: r.invoice.total_with_vat - r.paid, zile: daysBetween(r.invoice.due_date, ctx.today) })), [ctx]);

  const rows = useMemo(() => {
    const m = {};
    for (const x of open) {
      const k = x.r.invoice.supplier_cui;
      const row = (m[k] ||= { id: k, name: x.r.invoice.supplier_name, total: 0, nescadent: 0, b30: 0, b60: 0, b90: 0, peste: 0 });
      row[bucket(x.zile)] += x.rest;
      row.total += x.rest;
    }
    return Object.values(m);
  }, [open]);
  const detail = open.filter((x) => x.r.invoice.supplier_cui === sel);

  const money = (k) => (r) => (r[k] ? lei(r[k]) : "");
  const columns = [
    { key: "id", label: "Cod fiscal", w: 90 },
    { key: "name", label: "Furnizor", w: 220 },
    ...BUCKETS.map(([k, l]) => ({ key: k, label: l, w: 96, align: "r", render: money(k) })),
    { key: "total", label: "Total neachitat", w: 110, align: "r", bold: true, render: money("total") },
  ];
  const footer = { name: `${rows.length} furnizori` };
  for (const k of [...BUCKETS.map((b) => b[0]), "total"]) footer[k] = lei(rows.reduce((t, r) => t + r[k], 0));
  const detCols = [
    { key: "nr", label: "Factura", w: 110, render: (x) => x.r.invoice.number },
    { key: "data", label: "Data", w: 80, render: (x) => dmy(x.r.invoice.issue_date) },
    { key: "scad", label: "Scadent", w: 80, render: (x) => dmy(x.r.invoice.due_date) },
    { key: "zile", label: "Zile întârziere", w: 100, align: "r", render: (x) => (x.zile > 0 ? <span className="err b">{x.zile}</span> : "—") },
    { key: "total", label: "Total", w: 100, align: "r", render: (x) => lei(x.r.invoice.total_with_vat) },
    { key: "rest", label: "Rest de plată", w: 100, align: "r", bold: true, render: (x) => lei(x.rest) },
    { key: "pen", label: "Risc penalități", w: 110, align: "r", render: (x) => {
      const c = ctx.cmap[x.r.contract_id];
      return x.zile > 0 && c?.late_penalty_pct_per_day ? lei(x.rest * c.late_penalty_pct_per_day / 100 * x.zile) : "";
    } },
  ];

  return (
    <Window title={`Scadențar furnizori la ${dmy(ctx.today)}`} onClose={onClose}>
      <LinkBar right={<span className="muted">Facturile dublate sau din afara contractului sunt excluse (se contestă, nu se plătesc)</span>} />
      <div className="stack">
        <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel} footer={footer}
          defaultSort={{ key: "total", dir: "desc" }} empty="Nu există datorii neachitate." />
        <LinkBar right={<span className="muted">{sel ? "Facturi neachitate" : ""}</span>} />
        <div className="lines-area">
          <Grid columns={detCols} rows={detail.map((x) => ({ ...x, id: x.r.invoice.id }))} selected={null}
            onOpen={(x) => setPay({ supplier_cui: x.r.invoice.supplier_cui, invoice_number: x.r.invoice.number, amount: x.rest.toFixed(2) })}
            empty="Selectează un furnizor." />
        </div>
      </div>
      <BottomBar>
        <span className="muted">Dublu-click pe o factură → plată</span>
        <Btn onClick={() => window.print()}><u>T</u>ipărire...</Btn>
        <span className="grow" />
        <Btn className="exit" onClick={onClose}>Ieșire</Btn>
      </BottomBar>
      {pay && <PaymentModal ctx={ctx} initial={pay} onClose={() => setPay(null)} />}
    </Window>
  );
}
