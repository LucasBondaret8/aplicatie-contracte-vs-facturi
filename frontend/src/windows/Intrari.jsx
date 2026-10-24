import React, { useMemo, useState } from "react";
import { api, daysBetween, dmy, lei } from "../api.js";
import { Arrows, Copy, Doc, Dot, ExportI, FilterI, Folder, Gavel, Lock, Paste, Print, Search, Sync, Tag, Unlock } from "../icons.jsx";
import { BottomBar, Btn, Combo, Grid, Group, LinkBar, TBtn, TextBtns, Window } from "../ui.jsx";
import { CompareDetail, DISPUTABLE, EmailModal, PaymentModal, supplierOptions } from "./shared.jsx";

const isPenalty = (l) => /penalit/i.test(l.description);
const DRAFT = "__draft";
const SOURCE = { spv: "SPV", manual: "Manual", import: "Import" };
const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
const num = (v) => (v === "" || v == null ? 0 : Number(v));

/** Intrări – facturile primite de la furnizori: din SPV (automat), importate sau introduse de mână. */
export default function Intrari({ ctx, params, onClose }) {
  const results = ctx.analysis?.results || [];
  const [selState, setSel] = useState(params.select);
  const [selLine, setSelLine] = useState(0);
  const [showDet, setShowDet] = useState(true);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ nrInt: "", nr: "", cod: "", furnizor: params.furnizor || "", probleme: params.onlyProblems || false,
    noi: params.onlyNew || false });
  const [payment, setPayment] = useState(null);
  const [email, setEmail] = useState(null);
  const [draft, setDraft] = useState(null); // factura în curs de adăugare / modificare (manuală)

  const nrInt = useMemo(() => Object.fromEntries([...results]
    .sort((a, b) => a.invoice.issue_date.localeCompare(b.invoice.issue_date) || a.invoice.number.localeCompare(b.invoice.number))
    .map((r, i) => [r.invoice.id, i + 1])), [results]);
  const rows = useMemo(() => results.filter((r) => {
    const i = r.invoice;
    const has = (v, s) => String(v).toLowerCase().includes(s.toLowerCase());
    return has(nrInt[i.id], f.nrInt) && has(i.number, f.nr) && has(i.supplier_cui, f.cod) && has(i.supplier_name, f.furnizor)
      && (!q || has(`${i.number} ${i.supplier_name} ${i.supplier_cui}`, q)) && (!f.probleme || r.status !== "ok") && (!f.noi || i.new)
      && i.issue_date >= ctx.interval.from && i.issue_date <= ctx.interval.to; // intervalul de lucru din meniu
  }), [results, f, q, nrInt, ctx.interval]);
  const sel = draft ? DRAFT : selState ?? [...rows].sort((a, b) => a.invoice.issue_date.localeCompare(b.invoice.issue_date))[0]?.invoice.id;
  const cur = results.find((r) => r.invoice.id === sel);
  const contract = cur && ctx.cmap[cur.contract_id];

  // ---- factura manuală (rândul editabil, ca în programul de contabilitate) ----
  const options = useMemo(() => supplierOptions(ctx), [ctx]);
  const draftContract = draft && ctx.data.contracts.find((c) => c.supplier_cui === draft.supplier_cui);
  const dTot = draft ? draft.lines.reduce((t, l) => {
    const v = num(l.quantity) * num(l.unit_price);
    return { v: t.v + v, tva: t.tva + v * num(l.vat_pct) / 100 };
  }, { v: 0, tva: 0 }) : null;
  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setLine = (i, patch) => setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const contractLine = (c, issue) => ({
    description: `${c.title} ${issue.slice(0, 7)}`, unit: c.unit, quantity: c.quantity_per_period || 1, unit_price: c.unit_price, vat_pct: c.vat_rate,
  });
  const pickSupplier = (s) => {
    const c = ctx.data.contracts.find((x) => x.supplier_cui === s.cui);
    setDraft((d) => ({
      ...d, supplier_cui: s.cui, supplier_name: s.name,
      due_date: c ? addDays(d.issue_date, c.payment_term_days) : d.due_date,
      lines: d.lines.length || !c ? d.lines : [contractLine(c, d.issue_date)],
    }));
  };
  const startAdd = () => {
    setDraft({ number: "", supplier_cui: "", supplier_name: "", issue_date: ctx.today, due_date: ctx.today, lines: [] });
    setSelLine(0);
    setShowDet(true);
  };
  const startEdit = () => {
    if (!cur) return;
    if (cur.invoice.source !== "manual") {
      return alert("Facturile primite prin e-Factura nu se modifică. Pentru neconcordanțe folosește „Contestație”.");
    }
    if (cur.invoice.validated) return alert("Factura este validată. Devalidează-o înainte de modificare.");
    const i = cur.invoice;
    setDraft({ id: i.id, number: i.number, supplier_cui: i.supplier_cui, supplier_name: i.supplier_name, issue_date: i.issue_date,
      due_date: i.due_date, lines: i.lines.map((l) => ({ ...l, unit: ctx.cmap[cur.contract_id]?.unit || "buc" })) });
  };
  const saveDraft = async () => {
    let saved;
    const ok = await ctx.run("Salvare factură", async () => {
      saved = await api.saveManualInvoice(draft);
      return `Factura ${saved.number} a fost salvată și verificată față de contract`;
    });
    if (ok) { setDraft(null); setSel(saved.id); }
  };
  const draftRow = draft && { __draft: true, invoice: { id: DRAFT }, alerts: [], status: "ok", paid: 0 };
  const shownRows = draft ? [...rows.filter((r) => r.invoice.id !== draft.id), draftRow] : rows;

  const inp = (value, onChange, props = {}) => <input className="cell-in" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...props} />;
  const D = (r) => r.__draft;

  const columns = [
    { key: "lock", w: 20, render: (r) => (r.invoice.validated ? <span className="lockcell"><Lock /></span> : null), sortValue: (r) => (r.invoice.validated ? 1 : 0) },
    { key: "tip", label: "Tip", w: 34, render: () => "F" },
    { key: "nrint", label: "Nr. int.", w: 56, render: (r) => (D(r) ? results.length + 1 : nrInt[r.invoice.id]), sortValue: (r) => (D(r) ? 1e9 : nrInt[r.invoice.id]) },
    { key: "nr", label: "Nr. doc.", w: 100, sortValue: (r) => (D(r) ? "￿" : r.invoice.number),
      render: (r) => (D(r) ? inp(draft.number, (v) => setD({ number: v }), { autoFocus: true, placeholder: "Nr. factură" }) : r.invoice.number) },
    { key: "cod", label: "Cod", w: 72, sortValue: (r) => r.invoice.supplier_cui,
      render: (r) => (D(r) ? <Combo value={draft.supplier_cui} onType={(v) => setD({ supplier_cui: v.replace(/^RO/i, "") })} onPick={(o) => pickSupplier(o.p)}
        options={options} cols={["Denumire", "Cod", "Cod fiscal"]} placeholder="CUI" /> : r.invoice.supplier_cui) },
    { key: "furnizor", label: "Furnizor", w: 200, sortValue: (r) => (D(r) ? "￿" : r.invoice.supplier_name),
      render: (r) => (D(r) ? <Combo value={draft.supplier_name} onType={(v) => setD({ supplier_name: v })} onPick={(o) => pickSupplier(o.p)}
        options={options} cols={["Denumire", "Cod", "Cod fiscal"]} placeholder="Alege sau scrie furnizorul" /> : r.invoice.supplier_name) },
    { key: "tvai", label: "TVA I", w: 40, render: () => "" },
    { key: "data", label: "Data", w: 96, sortValue: (r) => (D(r) ? "￿" : r.invoice.issue_date),
      render: (r) => (D(r) ? inp(draft.issue_date, (v) => setDraft((d) => ({ ...d, issue_date: v,
        due_date: draftContract ? addDays(v, draftContract.payment_term_days) : d.due_date })), { type: "date" }) : dmy(r.invoice.issue_date)) },
    { key: "scadent", label: "Scadent", w: 96, sortValue: (r) => (D(r) ? "￿" : r.invoice.due_date),
      render: (r) => (D(r) ? inp(draft.due_date, (v) => setD({ due_date: v }), { type: "date" }) : dmy(r.invoice.due_date)) },
    { key: "valoare", label: "Valoare", w: 84, align: "r", cls: "grey", render: (r) => lei(D(r) ? dTot.v : r.invoice.total_without_vat), sortValue: (r) => r.invoice.total_without_vat },
    { key: "tva", label: "TVA", w: 74, align: "r", cls: "grey", render: (r) => lei(D(r) ? dTot.tva : r.invoice.vat_total), sortValue: (r) => r.invoice.vat_total },
    { key: "total", label: "Total", w: 88, align: "r", cls: "grey", bold: true, render: (r) => lei(D(r) ? dTot.v + dTot.tva : r.invoice.total_with_vat), sortValue: (r) => r.invoice.total_with_vat },
    { key: "neach", label: "Neachitat", w: 84, align: "r", cls: "pink", render: (r) => lei(D(r) ? dTot.v + dTot.tva : r.invoice.total_with_vat - r.paid), sortValue: (r) => r.invoice.total_with_vat - r.paid },
    { key: "contract", label: "Contract", w: 80, render: (r) => (D(r) ? draftContract?.contract_number || "" : ctx.cmap[r.contract_id]?.contract_number || "") },
    { key: "verif", label: "Verificare contract", w: 230, sortValue: (r) => ({ error: 0, warning: 1, ok: 2 })[r.status],
      render: (r) => (D(r) ? <span className="muted">se verifică la salvare</span> : (
        <span className="verif-cell">{r.invoice.new && <span className="tag-new">NOU</span>}<Dot status={r.status} />{r.alerts.map((a) => a.title).join("; ") || "Corect"}</span>)),
      title: (r) => r.alerts.map((a) => a.title).join("\n") },
    { key: "sursa", label: "Sursa", w: 60, render: (r) => (D(r) ? "Manual" : SOURCE[r.invoice.source] || "SPV") },
    { key: "spv", label: "ID încărcare SPV", w: 110, render: (r) => (D(r) ? "" : r.invoice.spv_id || r.invoice.source_file?.replace(/\.xml$/i, "")) },
  ];

  const lineCols = [
    { key: "tip", label: "Tip", w: 62, render: () => "Serviciu" },
    { key: "gest", label: "Gestiune", w: 70, render: () => "" },
    { key: "den", label: "Denumire articol / serviciu", w: 250,
      render: (l) => (draft ? inp(l.description, (v) => setLine(l.id, { description: v }), { placeholder: "Denumire" }) : l.description) },
    { key: "cod", label: "Cod", w: 40, render: () => "" },
    { key: "um", label: "UM", w: 70, render: (l) => (draft ? inp(l.unit, (v) => setLine(l.id, { unit: v })) : (isPenalty(l) ? "buc" : contract?.unit || "buc")) },
    { key: "tvap", label: "TVA %", w: 50, align: "r",
      render: (l) => (draft ? inp(l.vat_pct, (v) => setLine(l.id, { vat_pct: v }), { type: "number", className: "cell-in r" }) : l.vat_pct) },
    { key: "cant", label: "Cantitate", w: 72, align: "r",
      render: (l) => (draft ? inp(l.quantity, (v) => setLine(l.id, { quantity: v }), { type: "number", step: "any", className: "cell-in r" }) : l.quantity.toFixed(3)) },
    { key: "pu", label: "Preț unitar", w: 90, align: "r",
      render: (l) => (draft ? inp(l.unit_price, (v) => setLine(l.id, { unit_price: v }), { type: "number", step: "any", className: "cell-in r" }) : lei(l.unit_price)) },
    { key: "pc", label: "Preț contract", w: 88, align: "r", cls: "grey", render: (l) => {
      const p = draft ? draftContract?.unit_price : cur?.allowed_price;
      return isPenalty(l) || !p ? "" : lei(p);
    } },
    { key: "dif", label: "Diferență", w: 74, align: "r", cls: "pink", render: (l) => {
      const p = draft ? draftContract?.unit_price : cur?.allowed_price;
      if (isPenalty(l) || !p) return "";
      const d = num(l.unit_price) - p;
      return d > 0.009 ? <b className="err">+{lei(d)}</b> : "0,00";
    } },
    { key: "val", label: "Valoare", w: 84, align: "r", render: (l) => lei(num(l.quantity) * num(l.unit_price)) },
    { key: "tot", label: "Total", w: 86, align: "r", bold: true, render: (l) => lei(num(l.quantity) * num(l.unit_price) * (1 + num(l.vat_pct) / 100)) },
    { key: "tvav", label: "TVA", w: 70, align: "r", render: (l) => lei(num(l.quantity) * num(l.unit_price) * num(l.vat_pct) / 100) },
    { key: "nded", label: "Nedeductibil", w: 76, align: "r", render: () => "" },
    { key: "cont", label: "Cont", w: 50, render: (l) => (isPenalty(l) ? "6581" : (draft ? draftContract : contract)?.expense_account || "628") },
  ];
  const lineRows = (draft ? draft.lines : cur?.invoice.lines || []).map((l, i) => ({ ...l, id: i }));
  const addLine = () => {
    setDraft((d) => ({ ...d, lines: [...d.lines, draftContract && !d.lines.length ? contractLine(draftContract, d.issue_date)
      : { description: "", unit: "buc", quantity: 1, unit_price: "", vat_pct: 21 }] }));
    setSelLine(draft.lines.length);
  };
  const delLine = () => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== selLine) }));

  // ---- acțiuni pe factura selectată ----
  const validate = (value) => {
    if (!cur) return;
    if (value && cur.status === "error"
      && !confirm(`Factura ${cur.invoice.number} are erori față de contract:\n\n• ${cur.alerts.filter((a) => a.severity === "error").map((a) => a.title).join("\n• ")}\n\nO validezi totuși?`)) return;
    ctx.run(value ? "Validare" : "Devalidare", async () => {
      await api.setValidated(cur.invoice.id, value);
      return `Factura ${cur.invoice.number} a fost ${value ? "validată" : "devalidată"}`;
    });
  };
  const del = () => {
    if (!cur) return;
    if (cur.invoice.validated) return alert("Factura este validată. Devalidează-o înainte de ștergere.");
    if (confirm(`Ștergi factura ${cur.invoice.number}?`)) ctx.run("Ștergere", () => api.deleteInvoice(cur.invoice.id));
  };
  const pay = () => cur && setPayment({ supplier_cui: cur.invoice.supplier_cui, invoice_number: cur.invoice.number,
    amount: Math.max(0, cur.invoice.total_with_vat - cur.paid).toFixed(2) });
  const disputable = !draft && cur?.alerts.some(DISPUTABLE);
  const contest = async () => disputable && setEmail(await api.dispute(cur.invoice.id));

  const totals = rows.reduce((t, r) => ({ v: t.v + r.invoice.total_without_vat, tva: t.tva + r.invoice.vat_total,
    tot: t.tot + r.invoice.total_with_vat, n: t.n + r.invoice.total_with_vat - r.paid }), { v: 0, tva: 0, tot: 0, n: 0 });
  const newCount = results.filter((r) => r.invoice.new).length;

  return (
    <Window onClose={draft ? () => setDraft(null) : onClose}>
      <LinkBar onAdd={startAdd} onEdit={startEdit} onDelete={cur && !cur.invoice.validated ? del : null}
        editing={draft && { save: saveDraft, cancel: () => setDraft(null) }}
        tools={<>
          <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" onClick={() => window.open("/api/report.csv")} /></Group>
          <div className="search">
            <input placeholder="Căutare..." value={q} onChange={(e) => setQ(e.target.value)} />
            <TBtn icon={<Search />} title="Căutare" onClick={() => {}} />
          </div>
          <Group>
            <TBtn icon={<FilterI />} title="Filtrare: doar facturile cu probleme" active={f.probleme} onClick={() => setF({ ...f, probleme: !f.probleme })} />
            <TBtn icon={<Folder />} title="Import din fișiere (XML / ZIP descărcat din SPV)" onClick={ctx.importInvoices} />
          </Group>
          <Group><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
          <Group><TBtn icon={<Sync />} label={newCount ? `Noi din SPV (${newCount})` : undefined} title="Fișiere e-Factura: sincronizare cu SPV acum"
            onClick={() => (newCount ? setF({ ...f, noi: !f.noi }) : ctx.syncSpv())} active={f.noi} /></Group>
          {(f.probleme || f.noi) && <span className="chk">Filtru: {[f.probleme && "cu probleme", f.noi && "noi din SPV"].filter(Boolean).join(", ")}</span>}
        </>}
        detalii={{ on: showDet, toggle: () => setShowDet(!showDet) }} />

      <div className="split">
          <div className={`pane top${showDet ? " with-det" : ""}`}>
           <div className="col">
            <Grid columns={columns} rows={shownRows} getId={(r) => r.invoice.id} selected={sel}
              onSelect={(id) => { if (!draft) { setSel(id); setSelLine(0); } }} onOpen={() => (draft ? null : setShowDet(true))}
              onInsert={startAdd} onDelete={del}
              rowClass={(r) => (D(r) ? "editing" : `st-${r.status}${r.invoice.validated ? " validated" : ""}${r.invoice.new ? " is-new" : ""}`)}
              defaultSort={{ key: "data", dir: "asc" }}
              empty="Nu există facturi. Sincronizează cu SPV sau Adaug pentru o factură introdusă de mână."
              footer={{ furnizor: `${rows.length} documente`, valoare: lei(totals.v), tva: lei(totals.tva), total: lei(totals.tot), neach: lei(totals.n) }} />
            <div className="filterrow">
              <input placeholder="Nr. int." style={{ width: 56 }} value={f.nrInt} onChange={(e) => setF({ ...f, nrInt: e.target.value })} />
              <input placeholder="Nr. doc." style={{ width: 100 }} value={f.nr} onChange={(e) => setF({ ...f, nr: e.target.value })} />
              <input placeholder="Cod" style={{ width: 72 }} value={f.cod} onChange={(e) => setF({ ...f, cod: e.target.value })} />
              <input placeholder="Furnizor" style={{ width: 200 }} value={f.furnizor} onChange={(e) => setF({ ...f, furnizor: e.target.value })} />
            </div>
           </div>
            {showDet && (
              <div className="detail">
                {draft ? <DraftDetail draft={draft} contract={draftContract} total={dTot} /> : <>
                  <PaymentsOfInvoice ctx={ctx} r={cur} />
                  <CompareDetail r={cur} contract={contract} />
                </>}
              </div>
            )}
          </div>
          <div className="pane bottom">
            <LinkBar keys="DOT" onAdd={draft ? addLine : null} onDelete={draft && draft.lines.length ? delLine : null}
              onEdit={draft ? null : startEdit}
              tools={<>
                <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
                <Group><TBtn icon={<Doc />} title="Fișa contractului" onClick={() => contract && ctx.open("contracte", { select: contract.id })} /></Group>
                <TextBtns items={[
                  ["Contract", !draft && contract ? () => ctx.open("contracte", { select: contract.id }) : null, "Deschide contractul furnizorului"],
                  ["Contestație", disputable ? contest : null, "Email de contestație către furnizor"],
                  ["Plată", !draft && cur ? pay : null],
                  ["Fișă furnizor", !draft && cur ? () => ctx.open("scadentar", { tab: "facturi", select: cur.invoice.supplier_cui }) : null],
                ]} />
              </>} />
            <Grid columns={lineCols} rows={lineRows} selected={selLine} onSelect={setSelLine}
              rowClass={() => (draft ? "editing" : "")} onInsert={draft ? addLine : null}
              empty={draft ? "Adaug (ALT + D) pentru o linie nouă." : ""} />
          </div>
      </div>

      <BottomBar>
        <Btn icon={<Lock />} label="Validez" alt="V" onClick={() => validate(true)} disabled={draft || !cur || cur.invoice.validated} />
        <Btn icon={<Tag />} label="Plată" alt="P" onClick={pay} disabled={draft || !cur} />
        <Btn icon={<Arrows />} label="Stornez" disabled title="Stornarea se face în programul de contabilitate" />
        <Btn icon={<Doc />} label="N.C." disabled title="Nota contabilă se generează în programul de contabilitate" />
        <Btn icon={<Print />} label="Tipărire" alt="E" onClick={() => window.print()} disabled={!!draft} />
        <Btn icon={<Unlock />} label="Devalidez" alt="D" onClick={() => validate(false)} disabled={draft || !cur?.invoice.validated} />
        <Btn icon={<Gavel />} label="Contestație" alt="C" onClick={contest} disabled={!disputable} className={disputable ? "primary" : ""} />
      </BottomBar>

      {payment && <PaymentModal ctx={ctx} initial={payment} onClose={() => setPayment(null)} />}
      {email && <EmailModal email={email} onClose={() => setEmail(null)} />}
    </Window>
  );
}

/** Detalii: plățile făcute pe factura selectată (Tip, Cont, Număr, Data, Suma). */
function PaymentsOfInvoice({ ctx, r }) {
  if (!r) return null;
  const pays = ctx.data.payments.filter((p) => p.supplier_cui === r.invoice.supplier_cui && p.invoice_number === r.invoice.number);
  const cols = [
    { key: "tip", label: "Tip", w: 46, render: (p) => (p.method === "casa" ? "Casa" : "Banca") },
    { key: "cont", label: "Cont", w: 44, render: (p) => (p.method === "casa" ? "5311" : "5121") },
    { key: "doc", label: "Număr", w: 60, render: (p) => p.doc || "" },
    { key: "date", label: "Data", w: 72, render: (p) => dmy(p.date) },
    { key: "amount", label: "Suma", w: 78, align: "r", render: (p) => lei(p.amount) },
  ];
  return (
    <div className="pays-block">
      <div className="pays-h">Plăți {r.invoice.number}/{dmy(r.invoice.issue_date)}</div>
      <Grid columns={cols} rows={pays} selected={null} minRows={2} footer={{ amount: lei(pays.reduce((t, p) => t + p.amount, 0)) }} />
    </div>
  );
}

/** Panoul din dreapta cât timp se introduce o factură de mână: ce prevede contractul furnizorului. */
function DraftDetail({ draft, contract, total }) {
  const term = draft.issue_date && draft.due_date ? daysBetween(draft.issue_date, draft.due_date) : null;
  return (
    <div className="verif-block">
      <div className="detail-h">{draft.id ? "Modific factură" : "Factură nouă"} <span className="badge warning">Manual</span></div>
      {!contract ? (
        <div className="muted">Alege furnizorul. Dacă are contract, completez liniile, scadența și TVA-ul din contract.</div>
      ) : (
        <table className="cmp">
          <thead><tr><th></th><th>Pe factură</th><th>Contract {contract.contract_number}</th></tr></thead>
          <tbody>
            <tr><td>Preț unitar</td><td>{draft.lines[0] ? lei(num(draft.lines[0].unit_price)) : "—"}</td><td>{lei(contract.unit_price)}{contract.indexation_type !== "none" ? ` (+ max ${contract.indexation_max_pct}%/an)` : ""}</td></tr>
            <tr className={term != null && term < contract.payment_term_days ? "bad" : ""}><td>Termen plată</td><td>{term} zile</td><td>{contract.payment_term_days} zile</td></tr>
            <tr><td>Cotă TVA</td><td>{draft.lines[0]?.vat_pct ?? "—"}%</td><td>{contract.vat_rate}%</td></tr>
            <tr><td>Total</td><td colSpan={2}><b>{lei(total.v + total.tva)} RON</b></td></tr>
          </tbody>
        </table>
      )}
      <div className="alert warning">Verificarea completă față de contract se face la <b>Salvez</b> (ALT + S). <b>Renunț</b> (ALT + R) anulează.</div>
      <div className="muted">Când aceeași factură sosește din SPV, înlocuiește automat varianta introdusă de mână.</div>
    </div>
  );
}
