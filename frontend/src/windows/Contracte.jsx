import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Check, Copy, Dot, ExportI, Paste, Print } from "../icons.jsx";
import { Grid, Group, LinkBar, TBtn, TextBtns, Window } from "../ui.jsx";
import { ContractModal, DELIVERY_LABEL, DeliveryModal } from "./shared.jsx";

const STARE = { ACTIVE: "ok", AUTO_RENEW: "ok", EXPIRED: "error" };

/** Contracte furnizori: fișele contractelor și, pe fiecare contract, facturile lunare, livrările și istoricul prețului. */
export default function Contracte({ ctx, params, onClose }) {
  const rows = ctx.data.contracts;
  const [sel, setSel] = useState(params.select || rows[0]?.id);
  const [edit, setEdit] = useState(null); // null | "new" | contract
  const [view, setView] = useState(params.view || "facturi"); // facturi | pret | livrari
  const [selMonth, setSelMonth] = useState(null);
  const [deliver, setDeliver] = useState(null); // perioada pentru confirmarea de livrare
  const cur = rows.find((c) => c.id === sel);
  const status = ctx.analysis?.contract_status || {};
  const cAlerts = (ctx.analysis?.contract_alerts || []).filter((a) => a.contract_id === cur?.id && a.code !== "MISSING");
  const deliveries = (ctx.data.deliveries || []).filter((d) => d.contract_id === cur?.id);
  const delivOf = (period) => deliveries.find((d) => d.period === period);

  const lunar = useMemo(() => {
    if (!cur) return [];
    const inv = (ctx.analysis?.results || []).filter((r) => r.contract_id === cur.id).map((r) => {
      const period = (r.invoice.period_start || r.invoice.issue_date).slice(0, 7);
      const main = r.invoice.lines.find((l) => !/penalit/i.test(l.description)) || r.invoice.lines[0];
      return { id: r.invoice.id, period, nr: r.invoice.number, date: r.invoice.issue_date, total: r.invoice.total_with_vat, paid: r.paid,
        qty: main?.quantity, price: main?.unit_price, agreed: r.allowed_price, max: r.max_price, status: r.status, alerts: r.alerts,
        probleme: r.alerts.map((a) => a.title).join("; ") || "Corect", isInv: true };
    });
    const missing = (ctx.analysis?.contract_alerts || []).filter((a) => a.contract_id === cur.id && a.code === "MISSING").map((a, i) => ({
      id: "m" + i, period: a.detail.match(/\d{4}-\d{2}/)?.[0] || "", nr: "", total: null, paid: null, status: "warning", probleme: "Factură lipsă",
    }));
    return [...inv, ...missing];
  }, [cur, ctx.analysis]);

  const columns = [
    { key: "stare", w: 22, render: (c) => <Dot status={(ctx.analysis?.contract_alerts || []).some((a) => a.contract_id === c.id && a.code !== "MISSING")
      ? "warning" : STARE[status[c.id]?.code] || "ok"} /> },
    { key: "title", label: "Denumire", w: 230 },
    { key: "contract_number", label: "Nr. contract", w: 90 },
    { key: "supplier_name", label: "Furnizor", w: 160 },
    { key: "billing_period", label: "Recurență", w: 64 },
    { key: "durata", label: "Durata", w: 150, render: (c) => `${dmy(c.start_date)} - ${c.end_date ? dmy(c.end_date) : "nedeterminată"}`, sortValue: (c) => c.start_date },
    { key: "renew", label: "Reînnoire", w: 120, render: (c) => (c.auto_renew ? `automată ${c.renewal_months || 12} luni${c.notice_days ? `, preaviz ${c.notice_days} z` : ""}` : "") },
    { key: "situatie", label: "Situație", w: 150, render: (c) => status[c.id]?.label || "" },
    { key: "unit_price", label: "Preț", w: 84, align: "r", cls: "grey", bold: true, render: (c) => lei(c.unit_price) },
    { key: "unit", label: "UM", w: 90, render: (c) => `${c.unit}${c.quantity_per_period > 1 ? ` × ${c.quantity_per_period}` : ""}` },
    { key: "disc", label: "Reducere", w: 110, render: (c) => (c.discount_pct ? `${c.discount_pct}%${c.discount_until ? ` până la ${dmy(c.discount_until)}` : ""}` : "") },
    { key: "idx", label: "Indexare", w: 90, render: (c) => (c.indexation_type === "none" ? "" : `${c.indexation_type} max ${c.indexation_max_pct}%`) },
    { key: "pen", label: "Penalizări %", w: 76, align: "r", render: (c) => (c.late_penalty_pct_per_day ? `${c.late_penalty_pct_per_day}/zi` : "") },
    { key: "payment_term_days", label: "Zile scadență", w: 80, align: "r" },
    { key: "expense_account", label: "Cont debit", w: 66 },
  ];
  const lunarCols = [
    { key: "status", w: 22, render: (x) => <Dot status={x.status} /> },
    { key: "period", label: "Luna", w: 66 },
    { key: "nr", label: "Nr. factură", w: 100 },
    { key: "qty", label: "Cant. facturată", w: 90, align: "r", render: (x) => x.qty ?? "" },
    { key: "deliv", label: cur?.is_licenses ? "Licențe folosite" : "Livrare", w: 110, render: (x) => {
      const d = delivOf(x.period);
      return d ? `${DELIVERY_LABEL[d.status]}${d.quantity != null ? ` · ${d.quantity}` : ""}` : <span className="muted">neconfirmat</span>;
    } },
    { key: "price", label: "Preț facturat", w: 90, align: "r", render: (x) => (x.price == null ? "" : lei(x.price)) },
    { key: "agreed", label: "Preț contract", w: 90, align: "r", cls: "grey", render: (x) => (x.agreed == null ? "" : lei(x.agreed)) },
    { key: "total", label: "Total", w: 96, align: "r", bold: true, render: (x) => (x.total == null ? "" : lei(x.total)) },
    { key: "neach", label: "Neachitat", w: 90, align: "r", cls: "pink", render: (x) => (x.total == null ? "" : lei(x.total - x.paid)) },
    { key: "probleme", label: "Verificare față de contract", w: 360, title: (x) => x.probleme },
  ];
  const delivCols = [
    { key: "period", label: "Luna", w: 70 },
    { key: "status", label: "Stare", w: 90, render: (d) => <span className="verif-cell"><Dot status={{ livrat: "ok", partial: "warning", nelivrat: "error" }[d.status]} />{DELIVERY_LABEL[d.status]}</span> },
    { key: "quantity", label: cur?.is_licenses ? "Licențe folosite" : "Cantitate primită", w: 110, align: "r", render: (d) => d.quantity ?? "" },
    { key: "contract", label: "În contract", w: 80, align: "r", render: () => cur?.quantity_per_period ?? "" },
    { key: "doc", label: "Document", w: 220 },
    { key: "note", label: "Observații", w: 360 },
  ];
  const del = (c = cur) => c && confirm(`Ștergi contractul ${c.contract_number} – ${c.supplier_name}?`) && ctx.run("Ștergere contract", () => api.deleteContract(c.id));
  const monthToConfirm = () => {
    const x = lunar.find((r) => r.id === selMonth);
    return x?.period || ctx.today?.slice(0, 7);
  };

  return (
    <Window onClose={onClose}>
      <div className="tabs">
        <button className="on">Contracte furnizori</button>
        <button onClick={() => ctx.open("livrari")}>Confirmare livrări</button>
        <button onClick={() => ctx.open("verificare")}>Verificare facturi</button>
        <button onClick={() => ctx.open("scadentar")}>Situație furnizori</button>
      </div>
      <LinkBar onAdd={() => setEdit("new")} onEdit={() => cur && setEdit(cur)} onDelete={() => del()}
        tools={<>
          <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
          <Group><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
          <span className="chk muted">Adaug → încarci contractul PDF (română sau engleză), iar fișa se completează singură</span>
        </>} />
      <div className="split">
        <div className="pane top" style={{ flex: 0.9 }}>
          <Grid columns={columns} rows={rows} selected={sel} onSelect={(id) => { setSel(id); setSelMonth(null); }} onOpen={setEdit}
            onInsert={() => setEdit("new")} onDelete={del} empty="Nu există contracte. Adaug → încarcă un contract PDF." />
        </div>
        <div className="pane bottom">
          <div className="toolbar">
            <TextBtns items={[["Facturi pe contract", () => setView("facturi")], ["Istoric preț", () => setView("pret")], ["Livrări", () => setView("livrari")]]} />
            <Group>
              <TBtn icon={<Check />} label="Confirmare livrare" alt="L" onClick={cur ? () => setDeliver(monthToConfirm()) : null}
                title="Ce s-a primit efectiv în luna selectată (ALT + L)" />
            </Group>
            <span className="chk"><b>{{ facturi: "Facturi pe contract", pret: "Istoric preț", livrari: "Livrări confirmate" }[view]}</b>{cur ? ` · ${cur.contract_number} · ${cur.supplier_name}` : ""}</span>
          </div>
          {cAlerts.map((a, i) => <div key={i} className="alert warning contract-alert"><b>{a.title}.</b> {a.detail}</div>)}
          {view === "facturi" && (
            <Grid columns={lunarCols} rows={lunar} selected={selMonth} onSelect={setSelMonth} defaultSort={{ key: "period", dir: "asc" }}
              onOpen={(x) => x.isInv && ctx.open("intrari", { select: x.id })} empty="Nicio factură pe acest contract." />
          )}
          {view === "pret" && <PriceChart rows={lunar.filter((x) => x.isInv && x.price != null).sort((a, b) => a.period.localeCompare(b.period))} contract={cur} />}
          {view === "livrari" && (
            <Grid columns={delivCols} rows={[...deliveries].sort((a, b) => a.period.localeCompare(b.period))} selected={null}
              onOpen={(d) => setDeliver(d.period)} empty="Nicio livrare confirmată. Confirmare livrare (ALT + L)." />
          )}
        </div>
      </div>
      {edit && <ContractModal ctx={ctx} initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {deliver && cur && <DeliveryModal ctx={ctx} contract={cur} period={deliver} onClose={() => setDeliver(null)} />}
    </Window>
  );
}

/** Prețul unitar facturat lună de lună față de prețul din contract (cu indexare și reducere). */
function PriceChart({ rows, contract }) {
  const [hover, setHover] = useState(null);
  if (!contract || rows.length < 1) return <div className="chart-empty muted">Nu există facturi pe acest contract.</div>;
  const W = 900, H = 230, L = 64, R = 150, T = 18, B = 34;
  const vals = rows.flatMap((r) => [r.price, r.agreed]).filter((v) => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.25, hi * 0.04, 1);
  lo = Math.max(0, lo - pad); hi += pad;
  const x = (i) => L + (rows.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (rows.length - 1));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (k) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
  const bad = (r) => r.alerts?.some((a) => ["PRICE", "DISCOUNT_MISSING"].includes(a.code));
  const last = rows.length - 1;
  const h = hover != null ? rows[hover] : null;
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    rows.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  };
  const extra = rows.filter(bad).reduce((t, r) => t + (r.price - r.agreed) * (r.qty || 1), 0);

  return (
    <div className="chart">
      <div className="chart-legend">
        <span><i className="lg-billed" /> Preț facturat / {contract.unit}</span>
        <span><i className="lg-agreed" /> Preț din contract{contract.indexation_type !== "none" ? " (indexare maximă)" : ""}{contract.discount_pct ? " (cu reducere)" : ""}</span>
        <span><i className="lg-bad" /> Lună cu preț peste contract</span>
        {extra > 0 && <span className="chart-sum">Plătit în plus pe preț: <b>{lei(extra)} lei</b> fără TVA</span>}
      </div>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
          aria-label={`Prețul facturat față de prețul din contract, ${rows[0].period} – ${rows[last].period}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="ch-grid" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" className="ch-axis">{lei(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => (
            <text key={r.period} x={x(i)} y={H - 12} textAnchor="middle" className="ch-axis">{r.period.slice(5)}.{r.period.slice(2, 4)}</text>
          ))}
          <path d={path("agreed")} className="ch-agreed" />
          <path d={path("price")} className="ch-billed" />
          {rows.map((r, i) => (
            <circle key={r.period} cx={x(i)} cy={y(r.price)} r={bad(r) ? 5 : 3.5} className={bad(r) ? "ch-dot bad" : "ch-dot"} />
          ))}
          <text x={x(last) + 10} y={y(rows[last].price) + 4} className="ch-label">facturat {lei(rows[last].price)}</text>
          <text x={x(last) + 10} y={y(rows[last].agreed) + (Math.abs(y(rows[last].agreed) - y(rows[last].price)) < 14 ? 18 : 4)} className="ch-label muted">contract {lei(rows[last].agreed)}</text>
          {h && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="ch-cross" />}
        </svg>
        {h && (
          <div className="ch-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <b>{h.period} · {h.nr}</b>
            <div>Facturat: {lei(h.price)} × {h.qty}</div>
            <div>Contract: {lei(h.agreed)}</div>
            {bad(h) && <div className="err">+{lei(h.price - h.agreed)} / {contract.unit} peste contract</div>}
          </div>
        )}
      </div>
    </div>
  );
}
