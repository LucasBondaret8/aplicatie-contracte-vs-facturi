import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Copy, Dot, ExportI, Paste, Print } from "../icons.jsx";
import { Grid, Group, LinkBar, TBtn, Window } from "../ui.jsx";
import { ContractModal } from "./shared.jsx";

/** Contracte furnizori + facturile lunare pe fiecare contract (inclusiv lunile lipsă). */
export default function Contracte({ ctx, params, onClose }) {
  const rows = ctx.data.contracts;
  const [sel, setSel] = useState(params.select || rows[0]?.id);
  const [edit, setEdit] = useState(null); // null | "new" | contract
  const cur = rows.find((c) => c.id === sel);

  const lunar = useMemo(() => {
    if (!cur) return [];
    const inv = (ctx.analysis?.results || []).filter((r) => r.contract_id === cur.id).map((r) => ({
      id: r.invoice.id, period: (r.invoice.period_start || r.invoice.issue_date).slice(0, 7), nr: r.invoice.number, date: r.invoice.issue_date,
      total: r.invoice.total_with_vat, paid: r.paid, status: r.status, probleme: r.alerts.map((a) => a.title).join("; ") || "Corect", isInv: true,
    }));
    const missing = (ctx.analysis?.contract_alerts || []).filter((a) => a.contract_id === cur.id).map((a, i) => ({
      id: "m" + i, period: a.detail.match(/\d{4}-\d{2}/)?.[0] || "", nr: "", total: null, paid: null, status: "warning", probleme: "Factură lipsă",
    }));
    return [...inv, ...missing];
  }, [cur, ctx.analysis]);

  const columns = [
    { key: "title", label: "Denumire", w: 230 },
    { key: "contract_number", label: "Nr. contract", w: 90 },
    { key: "supplier_name", label: "Furnizor", w: 170 },
    { key: "billing_period", label: "Recurență", w: 70 },
    { key: "currency", label: "Moneda", w: 54 },
    { key: "durata", label: "Durata", w: 150, render: (c) => `${dmy(c.start_date)} - ${c.end_date ? dmy(c.end_date) : "nedeterminată"}`, sortValue: (c) => c.start_date },
    { key: "unit_price", label: "Preț", w: 90, align: "r", cls: "grey", bold: true, render: (c) => lei(c.unit_price) },
    { key: "unit", label: "UM", w: 80, render: (c) => `${c.unit}${c.quantity_per_period > 1 ? ` × ${c.quantity_per_period}` : ""}` },
    { key: "vat_rate", label: "TVA %", w: 46, align: "r" },
    { key: "pen", label: "Penalizări %", w: 80, align: "r", render: (c) => (c.late_penalty_pct_per_day ? `${c.late_penalty_pct_per_day}/zi` : "") },
    { key: "payment_term_days", label: "Zile scadență", w: 84, align: "r" },
    { key: "idx", label: "Indexare", w: 90, render: (c) => (c.indexation_type === "none" ? "" : `${c.indexation_type} max ${c.indexation_max_pct}%`) },
    { key: "expense_account", label: "Cont debit", w: 70 },
  ];
  const lunarCols = [
    { key: "status", w: 22, render: (x) => <Dot status={x.status} /> },
    { key: "period", label: "Luna", w: 70 },
    { key: "nr", label: "Nr. factură", w: 110 },
    { key: "date", label: "Data", w: 80, render: (x) => dmy(x.date) },
    { key: "total", label: "Total", w: 100, align: "r", cls: "grey", bold: true, render: (x) => (x.total == null ? "" : lei(x.total)) },
    { key: "neach", label: "Neachitat", w: 100, align: "r", cls: "pink", render: (x) => (x.total == null ? "" : lei(x.total - x.paid)) },
    { key: "probleme", label: "Verificare față de contract", w: 380 },
  ];
  const del = (c = cur) => c && confirm(`Ștergi contractul ${c.contract_number} – ${c.supplier_name}?`) && ctx.run("Ștergere contract", () => api.deleteContract(c.id));

  return (
    <Window onClose={onClose}>
      <div className="tabs">
        <button className="on">Contracte furnizori</button>
        <button onClick={() => ctx.open("verificare")}>Verificare facturi</button>
        <button onClick={() => ctx.open("scadentar")}>Situație furnizori</button>
      </div>
      <LinkBar onAdd={() => setEdit("new")} onEdit={() => cur && setEdit(cur)} onDelete={() => del()}
        tools={<>
          <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
          <Group><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
          <span className="chk muted">Adaug → încarci contractul PDF, iar AI-ul completează fișa</span>
        </>} />
      <div className="split">
        <div className="pane top">
          <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel} onOpen={setEdit} onInsert={() => setEdit("new")} onDelete={del}
            empty="Nu există contracte. Adaug → încarcă un contract PDF." />
        </div>
        <div className="pane bottom">
          <div className="toolbar"><span className="chk"><b>Facturi pe contract</b>{cur ? ` ${cur.contract_number} · ${cur.supplier_name}` : ""}</span></div>
          <Grid columns={lunarCols} rows={lunar} selected={null} defaultSort={{ key: "period", dir: "asc" }}
            onOpen={(x) => x.isInv && ctx.open("intrari", { select: x.id })} empty="Nicio factură pe acest contract." />
        </div>
      </div>
      {edit && <ContractModal ctx={ctx} initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Window>
  );
}
