import React, { useMemo, useState } from "react";
import { daysBetween, dmy, lei } from "../api.js";
import { Check, ExportI, Print } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, TBtn, Window } from "../ui.jsx";
import { PaymentModal, analitic, partners } from "./shared.jsx";

const LUNI = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
const BUCKETS = [["nescadent", "Nescadent"], ["b30", "1 - 30 zile"], ["b60", "31 - 60 zile"], ["b90", "61 - 90 zile"], ["peste", "Peste 90 zile"]];
const bucket = (d) => (d <= 0 ? "nescadent" : d <= 30 ? "b30" : d <= 60 ? "b60" : d <= 90 ? "b90" : "peste");
const monthEnd = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/** Situație furnizori: Situație generală / Facturi (pe furnizor) / Scadențar, pe o perioadă aleasă. */
export default function SituatieFurnizori({ ctx, params, onClose }) {
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState(params.tab || "generala");
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(monthEnd(+today.slice(0, 4), +today.slice(5, 7)));
  const [sel, setSel] = useState(params.select || null);
  const [selInv, setSelInv] = useState(null);
  const [intervale, setIntervale] = useState(false);
  const [pay, setPay] = useState(null);
  const results = ctx.analysis?.results || [];
  const payments = ctx.data.payments;
  const paidOn = (inv, until) => payments.filter((p) => p.supplier_cui === inv.supplier_cui && p.invoice_number === inv.number && (!until || p.date <= until))
    .reduce((t, p) => t + p.amount, 0);

  // Situație generală
  const general = useMemo(() => partners(ctx).map((s) => {
    const invs = results.filter((r) => r.invoice.supplier_cui === s.cui).map((r) => r.invoice);
    const pays = payments.filter((p) => p.supplier_cui === s.cui);
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const initial = sum(invs.filter((i) => i.issue_date < from), (i) => i.total_with_vat) - sum(pays.filter((p) => p.date < from), (p) => p.amount);
    const intrari = sum(invs.filter((i) => i.issue_date >= from && i.issue_date <= to), (i) => i.total_with_vat);
    const plati = sum(pays.filter((p) => p.date >= from && p.date <= to), (p) => p.amount);
    const laZi = sum(invs.filter((i) => i.issue_date <= to && i.due_date < today), (i) => Math.max(0, i.total_with_vat - paidOn(i, to)));
    return { ...s, initial, intrari, plati, final: initial + intrari - plati, laZi };
  }).filter((s) => s.initial || s.intrari || s.plati), [ctx, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const selCui = sel ?? general[0]?.cui;
  const selSup = partners(ctx).find((p) => p.cui === selCui);

  // Facturi – furnizorul selectat
  const facturi = useMemo(() => results.filter((r) => r.invoice.supplier_cui === selCui && r.invoice.issue_date <= to).map((r) => {
    const i = r.invoice;
    const before = i.issue_date < from;
    const initial = before ? i.total_with_vat - paidOn(i, addDay(from, -1)) : 0;
    const plati = payments.filter((p) => p.supplier_cui === i.supplier_cui && p.invoice_number === i.number && p.date >= from && p.date <= to).reduce((t, p) => t + p.amount, 0);
    const final = (before ? initial : i.total_with_vat) - plati;
    return { id: i.id, inv: i, initial, total: before ? 0 : i.total_with_vat, plati, final, laZi: i.due_date < today ? Math.max(0, final) : 0 };
  }), [results, selCui, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const curInv = facturi.find((x) => x.id === selInv) || facturi[0];
  const platiFactura = curInv ? payments.filter((p) => p.supplier_cui === curInv.inv.supplier_cui && p.invoice_number === curInv.inv.number) : [];

  // Scadențar – facturile neachitate (fără cele dublate / din afara contractului, care se contestă)
  const scad = useMemo(() => results
    .filter((r) => r.invoice.issue_date <= to && r.invoice.total_with_vat - paidOn(r.invoice, to) > 0.009
      && !r.alerts.some((a) => a.code === "DUPLICATE" || a.code === "OUT_OF_CONTRACT"))
    .map((r) => ({ id: r.invoice.id, r, rest: r.invoice.total_with_vat - paidOn(r.invoice, to), zile: daysBetween(r.invoice.due_date, today) })), [results, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const pe = useMemo(() => {
    const m = {};
    for (const x of scad) {
      const k = x.r.invoice.supplier_cui;
      const row = (m[k] ||= { id: k, name: x.r.invoice.supplier_name, total: 0, nescadent: 0, b30: 0, b60: 0, b90: 0, peste: 0 });
      row[bucket(x.zile)] += x.rest;
      row.total += x.rest;
    }
    return Object.values(m);
  }, [scad]);

  const setMonth = (m) => { const y = +from.slice(0, 4); setFrom(`${y}-${String(m).padStart(2, "0")}-01`); setTo(monthEnd(y, m)); };
  const setYear = (y) => { setFrom(`${y}${from.slice(4)}`); setTo(`${y}${to.slice(4)}`); };
  const money = (k, cls) => ({ key: k, w: 104, align: "r", cls, render: (r) => lei(r[k]) });
  const sumOf = (rows, k) => lei(rows.reduce((t, r) => t + r[k], 0));

  const genCols = [
    { key: "cod", label: "Cod", w: 56 },
    { key: "name", label: "Denumire", w: 300 },
    { ...money("initial"), label: "Neachitat inițial" },
    { ...money("intrari"), label: "Total intrări" },
    { ...money("plati"), label: "Total plăți" },
    { ...money("final"), label: "Neachitat final", bold: true },
    { ...money("laZi", "pink"), label: "Neachitat la zi" },
  ];
  const facCols = [
    { key: "data", label: "Data", w: 80, render: (x) => dmy(x.inv.issue_date), sortValue: (x) => x.inv.issue_date },
    { key: "nr", label: "Nr. document", w: 110, render: (x) => x.inv.number },
    { key: "cont", label: "Cont", w: 80, render: (x) => analitic(ctx, x.inv.supplier_cui) },
    { ...money("initial"), label: "Neachitat inițial" },
    { ...money("total"), label: "Total" },
    { ...money("plati"), label: "Plăți" },
    { ...money("final"), label: "Neachitat final", bold: true },
    { ...money("laZi", "pink"), label: "Neachitat la zi" },
  ];
  const platiCols = [
    { key: "date", label: "Data", w: 80, render: (p) => dmy(p.date) },
    { key: "doc", label: "Nr. document", w: 100, render: (p) => p.doc || "" },
    { key: "expl", label: "Explicație", w: 300, render: (p) => `Achit. ${selSup?.name || ""} nr.: ${p.invoice_number}` },
    { key: "cf", label: "Cont furnizor", w: 90, render: (p) => analitic(ctx, p.supplier_cui) },
    { key: "cp", label: "Cont plată", w: 80, render: (p) => (p.method === "casa" ? "5311" : "5121") },
    { key: "amount", label: "Suma plătită", w: 100, align: "r", render: (p) => lei(p.amount) },
  ];
  const scadCols = [
    { key: "name", label: "Denumire", w: 220, render: (x) => x.r.invoice.supplier_name, sortValue: (x) => x.r.invoice.supplier_name },
    { key: "nr", label: "Nr. document", w: 110, render: (x) => x.r.invoice.number },
    { key: "cont", label: "Cont", w: 80, render: (x) => analitic(ctx, x.r.invoice.supplier_cui) },
    { key: "data", label: "Data doc.", w: 80, render: (x) => dmy(x.r.invoice.issue_date), sortValue: (x) => x.r.invoice.issue_date },
    { key: "scad", label: "Scadent", w: 80, render: (x) => dmy(x.r.invoice.due_date), sortValue: (x) => x.r.invoice.due_date },
    { key: "zile", label: "Zile scadență", w: 90, align: "r", render: (x) => (x.zile > 0 ? <b className="err">{x.zile}</b> : x.zile) },
    { key: "total", label: "Total", w: 100, align: "r", render: (x) => lei(x.r.invoice.total_with_vat) },
    { key: "rest", label: "Neachitat", w: 100, align: "r", cls: "pink", bold: true, render: (x) => lei(x.rest) },
    { key: "pen", label: "Risc penalități", w: 104, align: "r", render: (x) => {
      const c = ctx.cmap[x.r.contract_id];
      return x.zile > 0 && c?.late_penalty_pct_per_day ? lei(x.rest * c.late_penalty_pct_per_day / 100 * x.zile) : "";
    } },
  ];
  const peCols = [
    { key: "name", label: "Denumire", w: 260 },
    ...BUCKETS.map(([k, l]) => ({ key: k, label: l, w: 100, align: "r", cls: k === "nescadent" ? "" : "pink", render: (r) => (r[k] ? lei(r[k]) : "") })),
    { key: "total", label: "Total neachitat", w: 110, align: "r", bold: true, render: (r) => lei(r.total) },
  ];

  return (
    <Window onClose={onClose}>
      <div className="periodbar">
        De la <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        până la <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select value={+from.slice(5, 7)} onChange={(e) => setMonth(+e.target.value)}>{LUNI.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}</select>
        <select value={from.slice(0, 4)} onChange={(e) => setYear(e.target.value)}>{["2025", "2026", "2027"].map((y) => <option key={y}>{y}</option>)}</select>
        <select><option>Toate intrările - lei</option></select>
      </div>
      <div className="tabs">
        <button className={tab === "generala" ? "on" : ""} onClick={() => setTab("generala")}>Situație generală</button>
        <button className={tab === "facturi" ? "on" : ""} onClick={() => setTab("facturi")}>Facturi - {selSup?.name || ""}</button>
        <button className={tab === "scadentar" ? "on" : ""} onClick={() => setTab("scadentar")}>Scadențar</button>
        <button disabled title="Rămâne în programul de contabilitate">Avize de expediție</button>
        <button disabled title="Rămâne în programul de contabilitate">Avansuri</button>
      </div>

      {tab === "generala" && <>
        <div className="toolbar"><Group><TBtn icon={<ExportI />} title="Export date" onClick={() => window.open("/api/report.csv")} /></Group>
          <span className="chk muted">Dublu-click → facturile furnizorului</span></div>
        <div className="split"><div className="pane">
          <Grid columns={genCols} rows={general} getId={(r) => r.cui} selected={selCui} onSelect={setSel} minRows={10}
            onOpen={(r) => { setSel(r.cui); setTab("facturi"); }}
            footer={{ name: `${general.length} furnizori`, initial: sumOf(general, "initial"), intrari: sumOf(general, "intrari"), plati: sumOf(general, "plati"),
              final: sumOf(general, "final"), laZi: sumOf(general, "laZi") }} />
        </div></div>
      </>}

      {tab === "facturi" && <>
        <div className="toolbar">
          <Group><TBtn icon={<ExportI />} title="Export date" /></Group>
          <Group>
            <TBtn label="Vizualizare" onClick={curInv ? () => ctx.open("intrari", { select: curInv.id }) : null} title="Vizualizare document aferent poziției selectate" />
            <TBtn icon={<Check />} label="Verificare" alt="V" onClick={selSup ? () => ctx.open("intrari", { furnizor: selSup.name }) : null} title="Verificare facturi față de contract (ALT + V)" />
          </Group>
        </div>
        <div className="split">
          <div className="pane top">
            <Grid columns={facCols} rows={facturi} selected={curInv?.id} onSelect={setSelInv} defaultSort={{ key: "data", dir: "asc" }}
              onOpen={(x) => setPay({ supplier_cui: x.inv.supplier_cui, invoice_number: x.inv.number, amount: Math.max(0, x.final).toFixed(2) })}
              footer={{ nr: `${facturi.length} facturi`, initial: sumOf(facturi, "initial"), total: sumOf(facturi, "total"), plati: sumOf(facturi, "plati"),
                final: sumOf(facturi, "final"), laZi: sumOf(facturi, "laZi") }} />
          </div>
          <div className="pane bottom">
            <div className="toolbar"><span className="chk"><b>Plăți</b>{curInv ? ` factura ${curInv.inv.number}` : ""}</span></div>
            <Grid columns={platiCols} rows={platiFactura} selected={null} />
          </div>
        </div>
      </>}

      {tab === "scadentar" && <>
        <div className="toolbar">
          <Group><TBtn icon={<ExportI />} title="Export date" /></Group>
          <Group>
            <TBtn label="Vizualizare" onClick={() => {}} title="Dublu-click pe o factură → plată" />
            <TBtn label="Scadențar pe intervale" alt="S" onClick={() => setIntervale((v) => !v)} active={intervale} />
          </Group>
          <span className="chk muted">Facturile dublate sau din afara contractului nu apar aici: se contestă, nu se plătesc.</span>
        </div>
        <div className="split"><div className="pane">
          {intervale ? (
            <Grid columns={peCols} rows={pe} selected={null} defaultSort={{ key: "total", dir: "desc" }} minRows={10}
              footer={Object.fromEntries([["name", `${pe.length} furnizori`], ...[...BUCKETS.map((b) => b[0]), "total"].map((k) => [k, sumOf(pe, k)])])} />
          ) : (
            <Grid columns={scadCols} rows={scad} selected={null} defaultSort={{ key: "scad", dir: "asc" }} minRows={10}
              onOpen={(x) => setPay({ supplier_cui: x.r.invoice.supplier_cui, invoice_number: x.r.invoice.number, amount: x.rest.toFixed(2) })}
              footer={{ name: `${scad.length} facturi`, rest: lei(scad.reduce((t, x) => t + x.rest, 0)) }} />
          )}
        </div></div>
      </>}

      <BottomBar>
        <Btn icon={<Print />} label="Tipărire" onClick={() => window.print()} />
        <Btn icon={<Print />} label="Tipărire facturi neachitate" onClick={() => { setTab("scadentar"); setTimeout(() => window.print(), 100); }} />
        <Btn icon={<Print />} label="Tipărire facturi + plăți" onClick={() => { setTab("facturi"); setTimeout(() => window.print(), 100); }} />
        <Btn icon={<Print />} label="Tipărire plăți + facturi" onClick={() => window.print()} />
      </BottomBar>
      {pay && <PaymentModal ctx={ctx} initial={pay} onClose={() => setPay(null)} />}
    </Window>
  );
}

function addDay(iso, n) {
  return new Date(new Date(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
}
