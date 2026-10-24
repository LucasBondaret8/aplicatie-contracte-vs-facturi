import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Dot } from "../icons.jsx";
import { BottomBar, Btn, Grid, LinkBar, Window } from "../ui.jsx";
import { ContractModal } from "./shared.jsx";

/** Contracte furnizori + facturile lunare pe fiecare contract (inclusiv lunile lipsă). */
export default function Contracte({ ctx, onClose }) {
  const rows = ctx.data.contracts;
  const [sel, setSel] = useState(rows[0]?.id);
  const [edit, setEdit] = useState(null); // null | "new" | contract
  const cur = rows.find((c) => c.id === sel);

  const lunar = useMemo(() => {
    if (!cur) return [];
    const inv = (ctx.analysis?.results || []).filter((r) => r.contract_id === cur.id).map((r) => ({
      id: r.invoice.id, period: (r.invoice.period_start || r.invoice.issue_date).slice(0, 7), nr: r.invoice.number,
      total: r.invoice.total_with_vat, paid: r.paid, status: r.status, probleme: r.alerts.map((a) => a.title).join("; ") || "corect", r,
    }));
    const missing = (ctx.analysis?.contract_alerts || []).filter((a) => a.contract_id === cur.id).map((a, i) => ({
      id: "m" + i, period: a.detail.match(/\d{4}-\d{2}/)?.[0] || "", nr: "—", total: null, paid: null, status: "warning", probleme: "Factură lipsă",
    }));
    return [...inv, ...missing];
  }, [cur, ctx.analysis]);

  const columns = [
    { key: "contract_number", label: "Nr.", w: 80 },
    { key: "title", label: "Obiect", w: 220 },
    { key: "supplier_name", label: "Furnizor", w: 160 },
    { key: "supplier_cui", label: "Cod fiscal", w: 80 },
    { key: "unit_price", label: "Preț", w: 90, align: "r", bold: true, render: (c) => `${lei(c.unit_price)}` },
    { key: "unit", label: "UM", w: 80, render: (c) => `${c.unit}${c.quantity_per_period > 1 ? ` ×${c.quantity_per_period}` : ""}` },
    { key: "vat_rate", label: "TVA", w: 40, align: "r" },
    { key: "payment_term_days", label: "Termen", w: 56, align: "r", render: (c) => `${c.payment_term_days} z` },
    { key: "pen", label: "Penalități", w: 70, render: (c) => (c.late_penalty_pct_per_day ? `${c.late_penalty_pct_per_day}%/zi` : "—") },
    { key: "idx", label: "Indexare", w: 90, render: (c) => (c.indexation_type === "none" ? "—" : `${c.indexation_type} max ${c.indexation_max_pct}%`) },
    { key: "start_date", label: "De la", w: 76, render: (c) => dmy(c.start_date) },
    { key: "end_date", label: "Până la", w: 76, render: (c) => (c.end_date ? dmy(c.end_date) : "nedet.") },
    { key: "expense_account", label: "Cont", w: 44 },
  ];
  const lunarCols = [
    { key: "status", w: 18, render: (x) => <Dot status={x.status} /> },
    { key: "period", label: "Luna", w: 70 },
    { key: "nr", label: "Factura", w: 110 },
    { key: "total", label: "Total", w: 100, align: "r", bold: true, render: (x) => (x.total == null ? "" : lei(x.total)) },
    { key: "paid", label: "Plătit", w: 100, align: "r", render: (x) => (x.paid == null ? "" : lei(x.paid)) },
    { key: "probleme", label: "Verificare", w: 380 },
  ];
  const del = (c = cur) => c && confirm(`Ștergi contractul ${c.contract_number} – ${c.supplier_name}?`)
    && ctx.run("Ștergere contract", () => api.deleteContract(c.id));

  return (
    <Window title="Contracte furnizori" onClose={onClose}>
      <LinkBar onAdd={() => setEdit("new")} onEdit={() => cur && setEdit(cur)} onDelete={() => del()}
        right={<span className="muted">Adaug → încarci contractul PDF și AI-ul completează fișa</span>} />
      <div className="stack">
        <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel} onOpen={setEdit} onInsert={() => setEdit("new")} onDelete={del}
          empty="Nu există contracte. Adaug → încarcă un contract PDF." />
        <LinkBar right={<span className="muted">{cur ? `Facturi pe contractul ${cur.contract_number}` : ""}</span>} />
        <div className="lines-area">
          <Grid columns={lunarCols} rows={lunar} selected={null} defaultSort={{ key: "period", dir: "asc" }}
            onOpen={(x) => x.r && ctx.open("intrari", { select: x.id })} empty="Nicio factură pe acest contract." />
        </div>
      </div>
      <BottomBar>
        <Btn onClick={() => setEdit("new")}><u>C</u>ontract nou...</Btn>
        <Btn onClick={() => window.print()}><u>T</u>ipărire...</Btn>
        <span className="grow" />
        <Btn className="exit" onClick={onClose}>Ieșire</Btn>
      </BottomBar>
      {edit && <ContractModal ctx={ctx} initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Window>
  );
}
