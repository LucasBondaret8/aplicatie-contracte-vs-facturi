import React, { useMemo, useState } from "react";
import { api, lei } from "../api.js";
import { Check, Dot } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, TBtn, Window } from "../ui.jsx";
import { DELIVERY_LABEL, DeliveryModal } from "./shared.jsx";

const LUNI = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
const shift = (period, n) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Confirmare livrări (recepție servicii): pentru luna aleasă, ce s-a primit efectiv pe fiecare contract.
 * Comparația cu factura se face automat: facturat dar nelivrat, facturat mai mult decât s-a primit, licențe nefolosite.
 */
export default function Livrari({ ctx, onClose }) {
  const [period, setPeriod] = useState(shift(ctx.today?.slice(0, 7) || "2026-10", -1));
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null); // contract
  const deliveries = ctx.data.deliveries || [];
  const results = ctx.analysis?.results || [];

  const rows = useMemo(() => ctx.data.contracts
    .filter((c) => {
      const end = ctx.analysis?.contract_status?.[c.id]?.end || c.end_date; // cu reînnoirile automate
      return (c.start_date || "").slice(0, 7) <= period && (!end || end.slice(0, 7) >= period);
    })
    .map((c) => {
      const d = deliveries.find((x) => x.contract_id === c.id && x.period === period);
      const inv = results.find((r) => r.contract_id === c.id && (r.invoice.period_start || r.invoice.issue_date).slice(0, 7) === period);
      const main = inv?.invoice.lines.find((l) => !/penalit/i.test(l.description));
      const alerts = inv?.alerts.filter((a) => ["NOT_DELIVERED", "UNDER_DELIVERED", "UNUSED_LICENSES", "PARTIAL_DELIVERY"].includes(a.code)) || [];
      return { id: c.id, c, d, inv, billedQty: main?.quantity, alerts };
    }), [ctx, period, deliveries, results]);
  const cur = rows.find((r) => r.id === sel) || rows[0];
  const pending = rows.filter((r) => !r.d).length;

  const quick = async (r, status) => {
    if (!r) return;
    await ctx.run("Confirmare livrare", async () => {
      await api.saveDelivery({ contract_id: r.c.id, period, status, quantity: status === "livrat" ? (r.c.quantity_per_period ?? null) : (status === "nelivrat" ? 0 : null),
        doc: r.d?.doc || "", note: r.d?.note || "" });
      return `${r.c.supplier_name}, ${period}: ${DELIVERY_LABEL[status].toLowerCase()}`;
    });
  };

  const columns = [
    { key: "st", w: 22, render: (r) => <Dot status={r.d ? { livrat: "ok", partial: "warning", nelivrat: "error" }[r.d.status] : ""} /> },
    { key: "title", label: "Contract", w: 230, render: (r) => r.c.title },
    { key: "furnizor", label: "Furnizor", w: 160, render: (r) => r.c.supplier_name },
    { key: "unit", label: "UM", w: 80, render: (r) => r.c.unit },
    { key: "inContract", label: "În contract", w: 76, align: "r", render: (r) => r.c.quantity_per_period ?? "" },
    { key: "billed", label: "Facturat", w: 70, align: "r", cls: "grey", render: (r) => r.billedQty ?? (r.inv ? "" : <span className="muted">fără factură</span>) },
    { key: "stare", label: "Livrare", w: 100, render: (r) => (r.d ? DELIVERY_LABEL[r.d.status] : <span className="muted">neconfirmat</span>) },
    { key: "qty", label: "Primit / folosit", w: 96, align: "r", render: (r) => r.d?.quantity ?? "" },
    { key: "doc", label: "Document", w: 180, render: (r) => r.d?.doc || "" },
    { key: "rez", label: "Rezultat verificare", w: 320, cls: "pink", render: (r) => r.alerts.map((a) => `${a.title}${a.amount ? ` (${lei(a.amount)} lei)` : ""}`).join("; "),
      title: (r) => r.alerts.map((a) => a.detail).join("\n") },
  ];

  return (
    <Window onClose={onClose}>
      <div className="periodbar">
        Luna
        <button className="tbtn icon-only" onClick={() => setPeriod(shift(period, -1))} title="Luna anterioară">‹</button>
        <select value={+period.slice(5)} onChange={(e) => setPeriod(`${period.slice(0, 4)}-${String(e.target.value).padStart(2, "0")}`)}>
          {LUNI.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
        </select>
        <select value={period.slice(0, 4)} onChange={(e) => setPeriod(`${e.target.value}-${period.slice(5)}`)}>
          {["2025", "2026", "2027"].map((y) => <option key={y}>{y}</option>)}
        </select>
        <button className="tbtn icon-only" onClick={() => setPeriod(shift(period, 1))} title="Luna următoare">›</button>
        <span className="muted">{pending ? `${pending} contracte de confirmat pentru ${period}` : `Toate livrările pentru ${period} sunt confirmate`}</span>
      </div>
      <div className="toolbar">
        <Group>
          <TBtn icon={<Check />} label="Livrat integral" alt="L" onClick={cur ? () => quick(cur, "livrat") : null} />
          <TBtn label="Parțial / cantitate..." alt="P" onClick={cur ? () => setEdit(cur.c) : null} />
          <TBtn label="Nelivrat" alt="N" onClick={cur ? () => quick(cur, "nelivrat") : null} />
        </Group>
        <span className="chk muted">Ce ați primit efectiv luna aceasta. Factura se compară automat cu ce confirmați aici.</span>
      </div>
      <div className="split">
        <div className="pane">
          <Grid columns={columns} rows={rows} selected={cur?.id} onSelect={setSel} onOpen={(r) => setEdit(r.c)} minRows={10}
            empty="Nu există contracte active în luna aleasă." />
        </div>
      </div>
      <BottomBar>
        <Btn label="Contracte" onClick={() => ctx.open("contracte", { select: cur?.c.id, view: "livrari" })} disabled={!cur} />
        <Btn label="Verificare" onClick={() => ctx.open("verificare")} />
      </BottomBar>
      {edit && <DeliveryModal ctx={ctx} contract={edit} period={period} onClose={() => setEdit(null)} />}
    </Window>
  );
}
