import React, { useMemo, useState } from "react";
import { daysBetween, dmy, lei } from "../api.js";
import { Print, Tag } from "../icons.jsx";
import { BottomBar, Btn, Grid, Window } from "../ui.jsx";
import { PaymentModal } from "./shared.jsx";

const BUCKETS = [["nescadent", "Nescadent"], ["b30", "1 - 30 zile"], ["b60", "31 - 60 zile"], ["b90", "61 - 90 zile"], ["peste", "Peste 90 zile"]];
const bucket = (d) => (d <= 0 ? "nescadent" : d <= 30 ? "b30" : d <= 60 ? "b60" : d <= 90 ? "b90" : "peste");

/** Situație furnizori: datoriile neachitate pe intervale de întârziere. */
export default function Scadentar({ ctx, onClose }) {
  const [sel, setSel] = useState(null);
  const [selInv, setSelInv] = useState(null);
  const [pay, setPay] = useState(null);
  const open = useMemo(() => (ctx.analysis?.results || [])
    .filter((r) => r.invoice.total_with_vat - r.paid > 0.009 && !r.alerts.some((a) => a.code === "DUPLICATE" || a.code === "OUT_OF_CONTRACT"))
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
  const detail = open.filter((x) => x.r.invoice.supplier_cui === sel).map((x) => ({ ...x, id: x.r.invoice.id }));
  const curInv = detail.find((x) => x.id === selInv);

  const money = (k) => (r) => (r[k] ? lei(r[k]) : "");
  const columns = [
    { key: "id", label: "Cod fiscal", w: 90 },
    { key: "name", label: "Furnizor", w: 220 },
    ...BUCKETS.map(([k, l]) => ({ key: k, label: l, w: 96, align: "r", cls: k === "nescadent" ? "grey" : "pink", render: money(k) })),
    { key: "total", label: "Total neachitat", w: 110, align: "r", bold: true, render: money("total") },
  ];
  const footer = { name: `${rows.length} furnizori` };
  for (const k of [...BUCKETS.map((b) => b[0]), "total"]) footer[k] = lei(rows.reduce((t, r) => t + r[k], 0));
  const detCols = [
    { key: "nr", label: "Nr. doc.", w: 110, render: (x) => x.r.invoice.number },
    { key: "data", label: "Data", w: 80, render: (x) => dmy(x.r.invoice.issue_date) },
    { key: "scad", label: "Scadent", w: 80, render: (x) => dmy(x.r.invoice.due_date) },
    { key: "zile", label: "Zile întârziere", w: 100, align: "r", render: (x) => (x.zile > 0 ? <b className="err">{x.zile}</b> : "") },
    { key: "total", label: "Total", w: 100, align: "r", cls: "grey", render: (x) => lei(x.r.invoice.total_with_vat) },
    { key: "rest", label: "Neachitat", w: 100, align: "r", cls: "pink", bold: true, render: (x) => lei(x.rest) },
    { key: "pen", label: "Risc penalități", w: 110, align: "r", render: (x) => {
      const c = ctx.cmap[x.r.contract_id];
      return x.zile > 0 && c?.late_penalty_pct_per_day ? lei(x.rest * c.late_penalty_pct_per_day / 100 * x.zile) : "";
    } },
  ];
  const payInv = (x = curInv) => x && setPay({ supplier_cui: x.r.invoice.supplier_cui, invoice_number: x.r.invoice.number, amount: x.rest.toFixed(2) });

  return (
    <Window onClose={onClose}>
      <div className="toolbar"><span className="chk"><b>Situație furnizori</b> · datorii neachitate la {dmy(ctx.today)} · facturile dublate sau din afara contractului sunt excluse (se contestă, nu se plătesc)</span></div>
      <div className="split">
        <div className="pane top">
          <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel} footer={footer}
            defaultSort={{ key: "total", dir: "desc" }} empty="Nu există datorii neachitate." />
        </div>
        <div className="pane bottom">
          <div className="toolbar"><span className="chk"><b>Facturi neachitate</b>{sel ? "" : " · selectează un furnizor"}</span></div>
          <Grid columns={detCols} rows={detail} selected={selInv} onSelect={setSelInv} onOpen={payInv} />
        </div>
      </div>
      <BottomBar>
        <Btn icon={<Tag />} label="Plată" alt="P" onClick={() => payInv()} disabled={!curInv} />
        <Btn icon={<Print />} label="Tipărire" alt="E" onClick={() => window.print()} />
      </BottomBar>
      {pay && <PaymentModal ctx={ctx} initial={pay} onClose={() => setPay(null)} />}
    </Window>
  );
}
