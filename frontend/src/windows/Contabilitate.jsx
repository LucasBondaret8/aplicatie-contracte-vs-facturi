// Contabilitatea pe partea de cumpărări, calculată din notele generate din facturi și plăți.
import React, { useEffect, useMemo, useState } from "react";
import { accountName, PLAN_CONTURI } from "../accounts.js";
import { api, dmy, lei } from "../api.js";
import { ExportI, Print, Search } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, TBtn, Window } from "../ui.jsx";

/** Notele contabile (și soldurile inițiale), reîncărcate când se schimbă datele. */
function useLedger(ctx) {
  const [l, setL] = useState({ entries: [], opening: [] });
  useEffect(() => { api.ledger().then(setL).catch(() => {}); }, [ctx.analysis]);
  return l;
}

const inRange = (d, iv) => d >= iv.from && d <= iv.to;
/** Denumirea contului; la analiticele de furnizori (401.xxxxx), numele furnizorului. */
const label = (ctx, c) => (c.startsWith("401.") && (ctx.data.suppliers || []).find((s) => `401.${s.cod}` === c)?.name) || accountName(c);
const Note = () => <span className="chk muted">Calculat din facturile primite și plățile din aplicație (partea de cumpărări).</span>;

function PeriodBar({ ctx, children }) {
  const iv = ctx.interval;
  return (
    <div className="periodbar">
      Perioada <input type="date" value={iv.from} onChange={(e) => ctx.setIv({ ...iv, from: e.target.value, label: null })} />
      până la <input type="date" value={iv.to} onChange={(e) => ctx.setIv({ ...iv, to: e.target.value, label: null })} />
      {children}
    </div>
  );
}

/** Articole contabile / Registru jurnal: toate notele, în ordine cronologică. */
export function ArticoleContabile({ ctx, params, onClose }) {
  const { entries } = useLedger(ctx);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const rows = entries.filter((e) => inRange(e.date, ctx.interval)
    && (!q || `${e.doc} ${e.expl} ${e.debit} ${e.credit}`.toLowerCase().includes(q.toLowerCase())));
  const cols = [
    { key: "nr", label: "Nr.", w: 50, align: "r" },
    { key: "date", label: "Data", w: 80, render: (e) => dmy(e.date), sortValue: (e) => e.date },
    { key: "doc", label: "Document", w: 150 },
    { key: "expl", label: "Explicație", w: 380 },
    { key: "debit", label: "Cont debit", w: 90 },
    { key: "credit", label: "Cont credit", w: 90 },
    { key: "amount", label: "Suma", w: 110, align: "r", bold: true, render: (e) => lei(e.amount) },
  ];
  return (
    <Window onClose={onClose}>
      <PeriodBar ctx={ctx} />
      <div className="toolbar">
        <Group><TBtn icon={<ExportI />} title="Export date" /><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
        <div className="search"><input placeholder="Caută cont, document, explicație..." value={q} onChange={(e) => setQ(e.target.value)} /><TBtn icon={<Search />} onClick={() => {}} /></div>
        <Note />
      </div>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} getId={(e) => e.nr} selected={sel} onSelect={setSel} minRows={12}
          onOpen={(e) => e.source === "intrari" ? ctx.open("intrari", { select: e.ref }) : ctx.open(e.source)}
          footer={{ expl: `${rows.length} articole contabile`, amount: lei(rows.reduce((t, e) => t + e.amount, 0)) }} />
      </div></div>
      <BottomBar>
        <Btn icon={<Print />} label={params.registru ? "Tipărire registru jurnal" : "Tipărire"} alt="E" onClick={() => window.print()} />
      </BottomBar>
    </Window>
  );
}

/** Soldurile și rulajele fiecărui cont. */
function balances(entries, opening, iv) {
  const acc = {};
  const get = (c) => (acc[c] ||= { cont: c, di: 0, ci: 0, dr: 0, cr: 0 });
  for (const e of [...opening, ...entries]) {
    if (e.date > iv.to) continue;
    const before = e.date < iv.from;
    get(e.debit)[before ? "di" : "dr"] += e.amount;
    get(e.credit)[before ? "ci" : "cr"] += e.amount;
  }
  return Object.values(acc).map((a) => {
    const si = a.di - a.ci, sf = a.di + a.dr - a.ci - a.cr;
    return { ...a, sid: Math.max(si, 0), sic: Math.max(-si, 0), td: a.di + a.dr, tc: a.ci + a.cr, sfd: Math.max(sf, 0), sfc: Math.max(-sf, 0) };
  }).sort((a, b) => a.cont.localeCompare(b.cont));
}

/** Balanța de verificare (sintetică sau analitică). */
export function Balanta({ ctx, onClose }) {
  const { entries, opening } = useLedger(ctx);
  const [analitic, setAnalitic] = useState(true);
  const [sel, setSel] = useState(null);
  const rows = useMemo(() => {
    const b = balances(entries, opening, ctx.interval);
    if (analitic) return b;
    const syn = {};
    for (const r of b) {
      const k = r.cont.split(".")[0];
      const s = (syn[k] ||= { cont: k, di: 0, ci: 0, dr: 0, cr: 0 });
      for (const f of ["di", "ci", "dr", "cr"]) s[f] += r[f];
    }
    return balances([], [], ctx.interval).concat(Object.values(syn).map((a) => {
      const si = a.di - a.ci, sf = a.di + a.dr - a.ci - a.cr;
      return { ...a, sid: Math.max(si, 0), sic: Math.max(-si, 0), td: a.di + a.dr, tc: a.ci + a.cr, sfd: Math.max(sf, 0), sfc: Math.max(-sf, 0) };
    })).sort((a, b) => a.cont.localeCompare(b.cont));
  }, [entries, opening, ctx.interval, analitic]);
  const m = (k, cls) => ({ key: k, w: 104, align: "r", cls, render: (r) => (r[k] ? lei(r[k]) : "") });
  const cols = [
    { key: "cont", label: "Cont", w: 90 },
    { key: "den", label: "Denumire", w: 280, render: (r) => label(ctx, r.cont) },
    { ...m("sid"), label: "Sold inițial D" }, { ...m("sic"), label: "Sold inițial C" },
    { ...m("dr", "grey"), label: "Rulaj D" }, { ...m("cr", "grey"), label: "Rulaj C" },
    { ...m("td"), label: "Total sume D" }, { ...m("tc"), label: "Total sume C" },
    { ...m("sfd", "pink"), label: "Sold final D", bold: true }, { ...m("sfc", "pink"), label: "Sold final C", bold: true },
  ];
  const tot = (k) => lei(rows.filter((r) => analitic ? true : !r.cont.includes(".")).reduce((t, r) => t + r[k], 0));
  return (
    <Window onClose={onClose}>
      <PeriodBar ctx={ctx}>
        <label className="chk"><input type="checkbox" checked={analitic} onChange={(e) => setAnalitic(e.target.checked)} /> analitică (401.xxxxx pe furnizori)</label>
      </PeriodBar>
      <div className="toolbar"><Group><TBtn icon={<ExportI />} title="Export date" /><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group><Note /></div>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} getId={(r) => r.cont} selected={sel} onSelect={setSel} minRows={12}
          onOpen={(r) => ctx.open("fisacont", { cont: r.cont })}
          footer={{ den: "Total (debit = credit)", sid: tot("sid"), sic: tot("sic"), dr: tot("dr"), cr: tot("cr"), td: tot("td"), tc: tot("tc"), sfd: tot("sfd"), sfc: tot("sfc") }} />
      </div></div>
      <BottomBar><Btn icon={<Print />} label="Tipărire balanță" alt="E" onClick={() => window.print()} /><span className="muted">Dublu-click pe un cont → fișa contului</span></BottomBar>
    </Window>
  );
}

/** Fișa unui cont: fiecare mișcare, cu soldul după fiecare operație. */
export function FisaCont({ ctx, params, onClose }) {
  const { entries, opening } = useLedger(ctx);
  const all = [...opening, ...entries];
  const conturi = [...new Set(all.flatMap((e) => [e.debit, e.credit]))].sort();
  const [cont, setCont] = useState(params.cont || "401");
  const match = (c) => c === cont || c.startsWith(`${cont}.`);
  const before = all.filter((e) => e.date < ctx.interval.from);
  const si = before.reduce((t, e) => t + (match(e.debit) ? e.amount : 0) - (match(e.credit) ? e.amount : 0), 0);
  let sold = si;
  const rows = all.filter((e) => inRange(e.date, ctx.interval) && (match(e.debit) || match(e.credit)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.nr || 0) - (b.nr || 0))
    .map((e, i) => {
      const d = match(e.debit) ? e.amount : 0, c = match(e.credit) ? e.amount : 0;
      sold += d - c;
      return { id: i, ...e, d, c, cp: match(e.debit) ? e.credit : e.debit, sold };
    });
  const cols = [
    { key: "date", label: "Data", w: 80, render: (e) => dmy(e.date) },
    { key: "doc", label: "Document", w: 140 },
    { key: "expl", label: "Explicație", w: 340 },
    { key: "cp", label: "Cont corespondent", w: 110 },
    { key: "d", label: "Debit", w: 104, align: "r", cls: "grey", render: (e) => (e.d ? lei(e.d) : "") },
    { key: "c", label: "Credit", w: 104, align: "r", cls: "grey", render: (e) => (e.c ? lei(e.c) : "") },
    { key: "sold", label: "Sold", w: 110, align: "r", cls: "pink", bold: true, render: (e) => `${lei(Math.abs(e.sold))} ${e.sold >= 0 ? "D" : "C"}` },
  ];
  return (
    <Window onClose={onClose}>
      <PeriodBar ctx={ctx}>
        Cont <select value={cont} onChange={(e) => setCont(e.target.value)}>
          {[...new Set([...conturi.map((c) => c.split(".")[0]), ...conturi])].sort().map((c) => <option key={c} value={c}>{c} {label(ctx, c)}</option>)}
        </select>
      </PeriodBar>
      <div className="toolbar"><span className="chk">Sold inițial: <b>{lei(Math.abs(si))} {si >= 0 ? "D" : "C"}</b> · Rulaj debit {lei(rows.reduce((t, r) => t + r.d, 0))} · Rulaj credit {lei(rows.reduce((t, r) => t + r.c, 0))} · Sold final <b>{lei(Math.abs(sold))} {sold >= 0 ? "D" : "C"}</b></span></div>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} selected={null} minRows={12} empty="Nicio mișcare pe acest cont în perioadă." />
      </div></div>
      <BottomBar><Btn icon={<Print />} label="Tipărire fișă" alt="E" onClick={() => window.print()} /></BottomBar>
    </Window>
  );
}

/** Cartea mare: pe fiecare lună, rulajele și soldul contului ales. */
export function CarteMare({ ctx, onClose }) {
  const { entries, opening } = useLedger(ctx);
  const all = [...opening, ...entries];
  const conturi = [...new Set(all.flatMap((e) => [e.debit.split(".")[0], e.credit.split(".")[0]]))].sort();
  const [cont, setCont] = useState("401");
  const match = (c) => c === cont || c.startsWith(`${cont}.`);
  const months = {};
  let sold = 0;
  for (const e of [...all].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!(match(e.debit) || match(e.credit)) || e.date > ctx.interval.to) continue;
    const m = (months[e.date.slice(0, 7)] ||= { id: e.date.slice(0, 7), d: 0, c: 0 });
    if (match(e.debit)) m.d += e.amount;
    if (match(e.credit)) m.c += e.amount;
  }
  const rows = Object.values(months).sort((a, b) => a.id.localeCompare(b.id)).map((m) => ({ ...m, sold: (sold += m.d - m.c) }));
  const cols = [
    { key: "id", label: "Luna", w: 80 },
    { key: "d", label: "Rulaj debit", w: 120, align: "r", cls: "grey", render: (m) => lei(m.d) },
    { key: "c", label: "Rulaj credit", w: 120, align: "r", cls: "grey", render: (m) => lei(m.c) },
    { key: "sold", label: "Sold final", w: 130, align: "r", cls: "pink", bold: true, render: (m) => `${lei(Math.abs(m.sold))} ${m.sold >= 0 ? "D" : "C"}` },
  ];
  return (
    <Window onClose={onClose}>
      <PeriodBar ctx={ctx}>
        Cont <select value={cont} onChange={(e) => setCont(e.target.value)}>{conturi.map((c) => <option key={c} value={c}>{c} {accountName(c)}</option>)}</select>
      </PeriodBar>
      <div className="toolbar"><Note /></div>
      <div className="split"><div className="pane"><Grid columns={cols} rows={rows} selected={null} minRows={12} onOpen={() => ctx.open("fisacont", { cont })} /></div></div>
      <BottomBar><Btn icon={<Print />} label="Tipărire" alt="E" onClick={() => window.print()} /></BottomBar>
    </Window>
  );
}

/** Jurnalul de cumpărări: facturile primite în perioadă, cu bazele și TVA-ul pe cote. */
export function JurnalCumparari({ ctx, onClose }) {
  const [sel, setSel] = useState(null);
  const rows = (ctx.analysis?.results || []).map((r) => r.invoice).filter((i) => inRange(i.issue_date, ctx.interval))
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date)).map((i, n) => {
      const by = (pct) => i.lines.filter((l) => Math.round(l.vat_pct) === pct).reduce((t, l) => t + l.line_total, 0);
      return { id: i.id, nr: n + 1, i, b21: by(21), t21: by(21) * 0.21, b19: by(19), t19: by(19) * 0.19, b9: by(9) + by(5), t9: by(9) * 0.09 + by(5) * 0.05, b0: by(0) };
    });
  const m = (k, label, cls) => ({ key: k, label, w: 96, align: "r", cls, render: (r) => (r[k] ? lei(r[k]) : "") });
  const cols = [
    { key: "nr", label: "Nr.", w: 44, align: "r" },
    { key: "data", label: "Data", w: 80, render: (r) => dmy(r.i.issue_date), sortValue: (r) => r.i.issue_date },
    { key: "doc", label: "Nr. document", w: 110, render: (r) => r.i.number },
    { key: "furnizor", label: "Furnizor", w: 200, render: (r) => r.i.supplier_name },
    { key: "cui", label: "Cod fiscal", w: 90, render: (r) => r.i.supplier_cui },
    { key: "total", label: "Total document", w: 110, align: "r", bold: true, render: (r) => lei(r.i.total_with_vat) },
    m("b21", "Baza 21%", "grey"), m("t21", "TVA 21%"), m("b19", "Baza 19%", "grey"), m("t19", "TVA 19%"),
    m("b9", "Baza 9% / 5%", "grey"), m("t9", "TVA 9% / 5%"), m("b0", "Scutit / neimpozabil"),
  ];
  const sum = (k) => lei(rows.reduce((t, r) => t + (k === "total" ? r.i.total_with_vat : r[k]), 0));
  return (
    <Window onClose={onClose}>
      <PeriodBar ctx={ctx}><span className="muted">Jurnal de cumpărări · vânzările se țin în programul de contabilitate</span></PeriodBar>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} selected={sel} onSelect={setSel} minRows={12} onOpen={(r) => ctx.open("intrari", { select: r.id })}
          footer={{ furnizor: `${rows.length} facturi`, total: sum("total"), b21: sum("b21"), t21: sum("t21"), b19: sum("b19"), t19: sum("t19"), b9: sum("b9"), t9: sum("t9"), b0: sum("b0") }} />
      </div></div>
      <BottomBar><Btn icon={<Print />} label="Tipărire jurnal" alt="E" onClick={() => window.print()} /></BottomBar>
    </Window>
  );
}

/** Planul de conturi, cu analiticele 401.xxxxx ale furnizorilor. */
export function PlanConturi({ ctx, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const analitice = (ctx.data.suppliers || []).map((s) => ({ cont: `401.${s.cod}`, denumire: s.name, tip: "P" }));
  const rows = [...PLAN_CONTURI, ...analitice].sort((a, b) => a.cont.localeCompare(b.cont))
    .filter((a) => !q || `${a.cont} ${a.denumire}`.toLowerCase().includes(q.toLowerCase()));
  const cols = [
    { key: "cont", label: "Cont", w: 100 },
    { key: "denumire", label: "Denumire", w: 460 },
    { key: "tip", label: "Tip", w: 60, render: (a) => ({ A: "Activ", P: "Pasiv", B: "Bifuncțional" })[a.tip] },
    { key: "an", label: "Analitic", w: 70, render: (a) => (a.cont.includes(".") ? "Da" : "") },
  ];
  return (
    <Window onClose={onClose}>
      <div className="toolbar">
        <div className="search"><input placeholder="Caută cont sau denumire..." value={q} onChange={(e) => setQ(e.target.value)} /><TBtn icon={<Search />} onClick={() => {}} /></div>
        <span className="chk muted">Plan de conturi general; analiticele de furnizori se creează automat din fișele furnizorilor.</span>
      </div>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} getId={(a) => a.cont} selected={sel} onSelect={setSel} onOpen={(a) => ctx.open("fisacont", { cont: a.cont })} minRows={12} />
      </div></div>
    </Window>
  );
}
