// Nomenclatoare (liste editabile direct în grilă), articole, date firmă, salvare / restaurare,
// închidere de lună și ecranul pentru operațiile care rămân în programul de contabilitate.
import React, { useMemo, useRef, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Check, Doc, ExportI, Search } from "../icons.jsx";
import { BottomBar, Btn, Field, Grid, Group, LinkBar, TBtn, Window } from "../ui.jsx";

const DRAFT = "__draft";

/** Listele simple: coloanele fiecăreia. */
export const LIST_SCHEMAS = {
  clienti: [["cod", "Cod", 60], ["denumire", "Denumire", 240], ["cui", "Cod fiscal / CNP", 110], ["tara", "Țara", 50], ["judet", "Județ", 60],
    ["localitate", "Localitate", 120], ["adresa", "Adresa", 200], ["iban", "Cont bancar", 200]],
  agenti: [["cod", "Cod", 60], ["nume", "Nume", 220], ["telefon", "Telefon", 120], ["email", "E-mail", 200], ["comision", "Comision %", 90]],
  gestiuni: [["cod", "Cod", 60], ["denumire", "Denumire", 240], ["tip", "Tip (cantitativ-valorică / valorică)", 240], ["gestionar", "Gestionar", 180]],
  grupe: [["cod", "Cod", 60], ["denumire", "Denumire", 300]],
  filiale: [["cod", "Cod", 60], ["denumire", "Denumire", 240], ["localitate", "Localitate", 140], ["adresa", "Adresa", 240]],
  salariati: [["marca", "Marcă", 70], ["nume", "Nume și prenume", 240], ["functie", "Funcție", 180], ["data_angajarii", "Data angajării", 120]],
  masini: [["nr", "Nr. înmatriculare", 130], ["marca", "Marcă / model", 200], ["sofer", "Șofer", 180], ["itp", "ITP până la", 110]],
  actionari: [["nume", "Nume / denumire", 260], ["cnp_cui", "CNP / CUI", 130], ["procent", "Procent %", 90]],
  utilizatori: [["utilizator", "Utilizator", 160], ["nume", "Nume", 220], ["rol", "Rol (contabil / office manager / administrator)", 300]],
  serii: [["document", "Document", 200], ["serie", "Serie", 90], ["numar", "Număr curent", 110]],
};

/** O listă editabilă în grilă: Adaug / Modific / Șterg, Salvez / Renunț. */
export function ListWindow({ ctx, params, onClose }) {
  const name = params.list;
  const schema = LIST_SCHEMAS[name];
  const items = ctx.data.lists?.[name] || [];
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [q, setQ] = useState("");
  const cur = items.find((x) => x.id === sel) || null;
  const shown = items.filter((x) => !q || Object.values(x).join(" ").toLowerCase().includes(q.toLowerCase()));
  const rows = draft ? [...shown.filter((x) => x.id !== draft.id), { ...draft, id: DRAFT }] : shown;
  const nextCod = () => (schema[0][0] === "cod" ? String(items.length + 1).padStart(5, "0") : "");
  const save = async () => {
    let saved;
    if (await ctx.run("Salvare", async () => { saved = await api.saveListItem(name, draft); return "Salvat"; })) { setDraft(null); setSel(saved.id); }
  };
  const del = () => cur && confirm("Ștergi înregistrarea selectată?") && ctx.run("Ștergere", () => api.deleteListItem(name, cur.id));
  const cols = schema.map(([k, label, w], i) => ({
    key: k, label, w,
    render: (x) => (x.id === DRAFT ? <input className="cell-in" autoFocus={i === 0 || (i === 1 && schema[0][0] === "cod")} value={draft[k] ?? ""}
      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} /> : x[k]),
  }));
  return (
    <Window onClose={draft ? () => setDraft(null) : onClose}>
      <LinkBar onAdd={() => setDraft({ [schema[0][0]]: nextCod() })} onEdit={cur ? () => setDraft({ ...cur }) : null} onDelete={cur ? del : null}
        editing={draft && { save, cancel: () => setDraft(null) }}
        tools={<>
          <Group><TBtn icon={<ExportI />} title="Export date" /></Group>
          <div className="search"><input placeholder="Căutare..." value={q} onChange={(e) => setQ(e.target.value)} /><TBtn icon={<Search />} onClick={() => {}} /></div>
        </>} />
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} selected={draft ? DRAFT : sel} onSelect={(id) => !draft && setSel(id)} onOpen={(x) => !draft && setDraft({ ...x })}
          onInsert={() => setDraft({ [schema[0][0]]: nextCod() })} onDelete={del} rowClass={(x) => (x.id === DRAFT ? "editing" : "")} minRows={14}
          empty="Lista e goală. Adaug (ALT + A)." />
      </div></div>
    </Window>
  );
}

/** Articole / servicii: tot ce s-a cumpărat, din liniile facturilor (fără luna din denumire). */
export function Articole({ ctx, onClose }) {
  const [sel, setSel] = useState(null);
  const rows = useMemo(() => {
    const m = {};
    for (const r of ctx.analysis?.results || []) {
      const c = ctx.cmap[r.contract_id];
      for (const l of r.invoice.lines) {
        const den = l.description.replace(/\s*\d{4}-\d{2}\s*$/, "").replace(/\s*–\s*intervenții$/, "").trim();
        const a = (m[`${den}|${r.invoice.supplier_cui}`] ||= { id: `${den}|${r.invoice.supplier_cui}`, den, furnizor: r.invoice.supplier_name,
          um: /penalit/i.test(den) ? "buc" : c?.unit || "buc", tva: l.vat_pct, cont: /penalit/i.test(den) ? "6581" : c?.expense_account || "628", n: 0, qty: 0, val: 0, last: "", price: 0 });
        a.n++; a.qty += l.quantity; a.val += l.line_total;
        if (r.invoice.issue_date >= a.last) { a.last = r.invoice.issue_date; a.price = l.unit_price; }
      }
    }
    return Object.values(m).sort((a, b) => a.den.localeCompare(b.den, "ro"));
  }, [ctx]);
  const cols = [
    { key: "den", label: "Denumire articol / serviciu", w: 300 },
    { key: "tip", label: "Tip", w: 70, render: () => "Serviciu" },
    { key: "um", label: "UM", w: 80 },
    { key: "tva", label: "TVA %", w: 60, align: "r" },
    { key: "cont", label: "Cont", w: 60 },
    { key: "furnizor", label: "Furnizor", w: 190 },
    { key: "price", label: "Ultimul preț", w: 96, align: "r", cls: "grey", render: (a) => lei(a.price) },
    { key: "last", label: "Ultima intrare", w: 96, render: (a) => dmy(a.last) },
    { key: "qty", label: "Cantitate cumpărată", w: 120, align: "r", render: (a) => a.qty.toLocaleString("ro-RO") },
    { key: "val", label: "Valoare fără TVA", w: 120, align: "r", bold: true, render: (a) => lei(a.val) },
  ];
  return (
    <Window onClose={onClose}>
      <div className="toolbar"><span className="chk muted">Articolele și serviciile se preiau automat din liniile facturilor primite. Dublu-click → facturile furnizorului.</span></div>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} selected={sel} onSelect={setSel} minRows={14} onOpen={(a) => ctx.open("intrari", { furnizor: a.furnizor })}
          footer={{ den: `${rows.length} articole / servicii`, val: lei(rows.reduce((t, a) => t + a.val, 0)) }} />
      </div></div>
    </Window>
  );
}

/** Situație aprovizionări: ce s-a cumpărat de la fiecare furnizor, pe lună. */
export function SituatieAprovizionari({ ctx, onClose }) {
  const [sel, setSel] = useState(null);
  const res = (ctx.analysis?.results || []).filter((r) => r.invoice.issue_date >= ctx.interval.from && r.invoice.issue_date <= ctx.interval.to);
  const months = [...new Set(res.map((r) => r.invoice.issue_date.slice(0, 7)))].sort();
  const rows = Object.values(res.reduce((m, r) => {
    const k = r.invoice.supplier_cui;
    const row = (m[k] ||= { id: k, name: r.invoice.supplier_name, total: 0 });
    const mo = r.invoice.issue_date.slice(0, 7);
    row[mo] = (row[mo] || 0) + r.invoice.total_without_vat;
    row.total += r.invoice.total_without_vat;
    return m;
  }, {}));
  const cols = [{ key: "name", label: "Furnizor", w: 220 },
    ...months.map((mo) => ({ key: mo, label: mo, w: 90, align: "r", render: (r) => (r[mo] ? lei(r[mo]) : "") })),
    { key: "total", label: "Total fără TVA", w: 110, align: "r", cls: "grey", bold: true, render: (r) => lei(r.total) }];
  return (
    <Window onClose={onClose}>
      <div className="periodbar">Perioada {dmy(ctx.interval.from)} – {dmy(ctx.interval.to)} <span className="muted">(se schimbă din meniul Interval)</span></div>
      <div className="split"><div className="pane">
        <Grid columns={cols} rows={rows} selected={sel} onSelect={setSel} minRows={12} defaultSort={{ key: "total", dir: "desc" }}
          footer={Object.fromEntries([["name", `${rows.length} furnizori`], ...[...months, "total"].map((k) => [k, lei(rows.reduce((t, r) => t + (r[k] || 0), 0))])])} />
      </div></div>
    </Window>
  );
}

/** Tipurile de articole / servicii, cu conturile implicite. */
export function TipuriArticole({ onClose }) {
  const rows = [["Marfă", "371", "607"], ["Materii prime", "301", "601"], ["Materiale consumabile", "302", "602"],
    ["Obiecte de inventar", "303", "603"], ["Materiale nestocate", "", "604"], ["Utilități", "", "605"],
    ["Servicii (terți)", "", "628"], ["Chirii", "", "612"], ["Telecomunicații", "", "626"], ["Întreținere și reparații", "", "611"],
    ["Produse finite", "345", "711"], ["Ambalaje", "381", "608"]].map(([den, stoc, ch], i) => ({ id: i, den, stoc, ch }));
  const cols = [{ key: "den", label: "Denumire", w: 260 }, { key: "stoc", label: "Cont de stoc", w: 110 }, { key: "ch", label: "Cont de cheltuială", w: 130 }];
  return (
    <Window onClose={onClose}>
      <div className="split"><div className="pane"><Grid columns={cols} rows={rows} selected={null} minRows={14} /></div></div>
    </Window>
  );
}

/** Datele firmei (apar pe rapoarte și în emailurile de contestație). */
export function DateFirma({ ctx, onClose }) {
  const [c, setC] = useState({ ...ctx.data.company });
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));
  const save = () => ctx.run("Date firmă", async () => { await api.saveCompany(c); return "Datele firmei au fost salvate"; });
  return (
    <Window onClose={onClose}>
      <div className="toolbar"><span className="chk"><b>Date firmă</b></span></div>
      <div className="panel-form">
        <div className="form">
          <Field label="Denumire" wide><input value={c.name || ""} onChange={set("name")} /></Field>
          <Field label="Cod fiscal"><input value={c.cui || ""} onChange={set("cui")} /></Field>
          <Field label="Nr. Reg. Com."><input value={c.regcom || ""} onChange={set("regcom")} /></Field>
          <Field label="Adresa" wide><input value={c.adresa || ""} onChange={set("adresa")} /></Field>
          <Field label="Cont bancar (IBAN)"><input value={c.iban || ""} onChange={set("iban")} /></Field>
          <Field label="Banca"><input value={c.banca || ""} onChange={set("banca")} /></Field>
          <Field label="Plătitor de TVA">
            <select value={c.tva ? "da" : "nu"} onChange={(e) => setC((x) => ({ ...x, tva: e.target.value === "da" }))}><option value="da">Da</option><option value="nu">Nu</option></select>
          </Field>
        </div>
      </div>
      <BottomBar><Btn icon={<Check />} label="Salvez" alt="S" onClick={save} className="primary" /></BottomBar>
    </Window>
  );
}

/** Salvare / restaurare: toate datele într-un fișier, și înapoi. */
export function SalvareRestaurare({ ctx, onClose }) {
  const input = useRef();
  const d = ctx.data;
  return (
    <Window onClose={onClose}>
      <div className="toolbar"><span className="chk"><b>Salvare / restaurare date</b></span></div>
      <div className="panel-form">
        <p>Datele firmei: <b>{d.contracts.length}</b> contracte, <b>{d.invoices.length}</b> facturi, <b>{d.payments.length}</b> plăți,{" "}
          <b>{(d.deliveries || []).length}</b> confirmări de livrare, <b>{(d.suppliers || []).length}</b> furnizori.</p>
        <p className="muted">Salvarea descarcă un fișier .json cu tot. Restaurarea înlocuiește toate datele actuale cu cele din fișier.</p>
      </div>
      <BottomBar>
        <Btn icon={<ExportI />} label="Salvare" alt="S" className="primary" onClick={() => window.open("/api/backup")} />
        <Btn label="Restaurare..." alt="R" onClick={() => input.current.click()} />
        <input ref={input} type="file" accept=".json" hidden onChange={(e) => {
          const f = e.target.files[0]; e.target.value = "";
          if (f && confirm("Restaurarea înlocuiește TOATE datele actuale. Continui?")) {
            ctx.run("Restaurare", async () => { const r = await api.restore(f); return `Restaurat: ${r.contracts} contracte, ${r.invoices} facturi, ${r.payments} plăți`; });
          }
        }} />
      </BottomBar>
    </Window>
  );
}

/** Închidere lună: ce mai e de rezolvat, apoi validarea facturilor corecte din luna respectivă. */
export function InchidereLuna({ ctx, onClose }) {
  const [period, setPeriod] = useState(() => {
    const [y, m] = (ctx.today || "2026-10-24").split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  });
  const res = (ctx.analysis?.results || []).filter((r) => r.invoice.issue_date.slice(0, 7) === period);
  const ok = res.filter((r) => r.status === "ok" && !r.invoice.validated);
  const bad = res.filter((r) => r.status !== "ok");
  const contracts = ctx.data.contracts.filter((c) => c.start_date.slice(0, 7) <= period && (!c.end_date || (ctx.analysis?.contract_status?.[c.id]?.end || c.end_date).slice(0, 7) >= period));
  const unconfirmed = contracts.filter((c) => !(ctx.data.deliveries || []).some((d) => d.contract_id === c.id && d.period === period));
  const missing = (ctx.analysis?.contract_alerts || []).filter((a) => a.code === "MISSING" && a.detail.includes(period));
  const check = [
    [bad.length === 0, `${bad.length} facturi cu probleme față de contract`, () => ctx.open("intrari", { onlyProblems: true })],
    [unconfirmed.length === 0, `${unconfirmed.length} contracte fără confirmare de livrare`, () => ctx.open("livrari")],
    [missing.length === 0, `${missing.length} facturi lipsă`, () => ctx.open("verificare")],
    [true, `${ok.length} facturi corecte, încă nevalidate`, () => ctx.open("intrari")],
  ];
  const close = () => ok.length && confirm(`Validez ${ok.length} facturi corecte din ${period}?`) && ctx.run("Închidere lună", async () => {
    for (const r of ok) await api.setValidated(r.invoice.id, true);
    return `Luna ${period}: ${ok.length} facturi validate`;
  });
  return (
    <Window onClose={onClose}>
      <div className="periodbar">Luna <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /> <span className="muted">{res.length} facturi primite în lună</span></div>
      <div className="panel-form">
        {check.map(([good, text, go], i) => (
          <div key={i} className={`alert ${good ? "ok" : "warning"}`} style={{ cursor: "pointer" }} onClick={go}>{good ? "✓ " : "⚠ "}{text}</div>
        ))}
        <p className="muted">Închiderea validează facturile corecte din lună (le blochează). Cele cu probleme rămân deschise până le rezolvi. Notele contabile se generează automat.</p>
      </div>
      <BottomBar><Btn icon={<Check />} label="Închid luna" alt="I" className="primary" onClick={close} disabled={!ok.length} /></BottomBar>
    </Window>
  );
}

/** Operațiile din contabilitatea completă care nu țin de verificarea facturilor primite. */
export function SeFaceInSaga({ ctx, params, onClose }) {
  return (
    <Window onClose={onClose}>
      <div className="info-screen">
        <div className="info-icon"><Doc /></div>
        <h2>{params.title}</h2>
        <p>{params.text || "Această operație ține de contabilitatea completă a firmei și se face în programul de contabilitate (SAGA)."}</p>
        <p className="muted">Bill vs Signed lucrează lângă programul de contabilitate: verifică facturile primite față de contracte, livrări și plăți.
          Datele pentru această operație rămân acolo unde le ține contabilul.</p>
        <div className="info-actions">
          <Btn label="Intrări (facturi primite)" onClick={() => ctx.open("intrari")} />
          <Btn label="Verificare față de contracte" onClick={() => ctx.open("verificare")} />
        </div>
      </div>
    </Window>
  );
}
