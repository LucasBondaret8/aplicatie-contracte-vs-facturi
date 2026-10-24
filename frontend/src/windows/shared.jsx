import React, { useState } from "react";
import { api, daysBetween, dmy, lei } from "../api.js";
import { Btn, Field, Modal } from "../ui.jsx";

export const STATUS_LABEL = { ok: "Corect", warning: "Atenție", error: "Eroare" };

/** Furnizorii = toți CUI-urile din contracte și facturi, cu rulaje. */
export function partners(ctx) {
  const map = {};
  const get = (cui, name) => (map[cui] ||= { cui, name, contracts: 0, invoices: 0, rulaj: 0, paid: 0, errors: 0, warnings: 0 });
  for (const c of ctx.data.contracts) get(c.supplier_cui, c.supplier_name).contracts++;
  for (const r of ctx.analysis?.results || []) {
    const p = get(r.invoice.supplier_cui, r.invoice.supplier_name);
    p.name ||= r.invoice.supplier_name;
    p.invoices++;
    p.rulaj += r.invoice.total_with_vat;
    p.paid += r.paid;
    if (r.status === "error") p.errors++;
    if (r.status === "warning") p.warnings++;
  }
  return Object.values(map).map((p) => ({ ...p, sold: Math.round((p.rulaj - p.paid) * 100) / 100 }));
}

export function supplierName(ctx, cui) {
  return ctx.data.contracts.find((c) => c.supplier_cui === cui)?.supplier_name
    || ctx.data.invoices.find((i) => i.supplier_cui === cui)?.supplier_name || cui;
}

/** Panoul „Detalii”: factura comparată cu contractul + alertele. */
export function CompareDetail({ r, contract }) {
  if (!r) return <div className="detail muted center">Selectează o factură.</div>;
  const inv = r.invoice;
  const main = inv.lines.find((l) => !/penalit/i.test(l.description)) || inv.lines[0] || {};
  const codes = new Set(r.alerts.map((a) => a.code));
  const term = inv.issue_date && inv.due_date ? daysBetween(inv.issue_date, inv.due_date) : null;
  const rows = contract ? [
    ["Preț unitar", lei(main.unit_price), `${lei(r.allowed_price)}${contract.indexation_type !== "none" ? " (indexat)" : ""}`, codes.has("PRICE")],
    ["Cantitate", main.quantity, contract.quantity_per_period ?? "—", codes.has("QUANTITY")],
    ["Cotă TVA", `${main.vat_pct}%`, `${contract.vat_rate}%`, codes.has("VAT_RATE")],
    ["Termen plată", `${term} zile`, `${contract.payment_term_days} zile`, codes.has("DUE_DATE")],
    ["Perioadă", `${dmy(inv.period_start)}–${dmy(inv.period_end)}`, `${dmy(contract.start_date)}–${contract.end_date ? dmy(contract.end_date) : "nedet."}`, codes.has("OUT_OF_CONTRACT")],
    ["Penalități", inv.lines.some((l) => /penalit/i.test(l.description)) ? "facturate" : "—",
      contract.late_penalty_pct_per_day ? `${contract.late_penalty_pct_per_day}%/zi` : "nu se aplică", codes.has("PENALTY")],
  ] : [];
  return (
    <div className="detail">
      <div className="detail-h">Verificare factură {inv.number} <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span></div>
      {contract ? (
        <table className="cmp">
          <thead><tr><th></th><th>Pe factură</th><th>Contract {contract.contract_number}</th></tr></thead>
          <tbody>{rows.map(([k, a, b, bad]) => <tr key={k} className={bad ? "bad" : ""}><td>{k}</td><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
      ) : <div className="muted">Furnizorul nu are contract înregistrat.</div>}
      <div className="alerts">
        {r.alerts.length === 0 && <div className="alert ok">✓ Factura corespunde contractului.</div>}
        {r.alerts.map((a, i) => (
          <div key={i} className={`alert ${a.severity}`}>
            <b>{a.title}</b>{a.amount > 0 && <span className="amt">{lei(a.amount)} lei</span>}
            <div>{a.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaymentModal({ ctx, initial, onClose }) {
  const [p, setP] = useState({ method: "banca", date: ctx.today, doc: "", ...initial });
  const supplierInvoices = (ctx.analysis?.results || []).filter((r) => r.invoice.supplier_cui === p.supplier_cui);
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));
  const pickInvoice = (e) => {
    const r = supplierInvoices.find((x) => x.invoice.number === e.target.value);
    setP((x) => ({ ...x, invoice_number: e.target.value, amount: r ? Math.max(0, r.invoice.total_with_vat - r.paid).toFixed(2) : x.amount }));
  };
  const save = async () => {
    if (await ctx.run("Salvare plată", () => api.savePayment(p))) onClose();
  };
  return (
    <Modal title={p.id ? "Modific plată" : "Adaug plată"} onClose={onClose}
      footer={<><Btn className="primary" onClick={save} disabled={!p.supplier_cui || !p.invoice_number || !p.amount}>Salvez</Btn><Btn onClick={onClose}>Renunț</Btn></>}>
      <div className="form">
        <Field label="Tip"><select value={p.method} onChange={set("method")}><option value="banca">B – Bancă</option><option value="casa">C – Casă</option></select></Field>
        <Field label="Nr. document"><input value={p.doc} onChange={set("doc")} placeholder="OP / chitanță" /></Field>
        <Field label="Data"><input type="date" value={p.date} onChange={set("date")} /></Field>
        <Field label="Furnizor">
          <select value={p.supplier_cui || ""} onChange={(e) => setP((x) => ({ ...x, supplier_cui: e.target.value, invoice_number: "" }))}>
            <option value="">—</option>
            {partners(ctx).map((s) => <option key={s.cui} value={s.cui}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Factura">
          <select value={p.invoice_number || ""} onChange={pickInvoice}>
            <option value="">—</option>
            {supplierInvoices.map((r) => (
              <option key={r.invoice.id} value={r.invoice.number}>
                {r.invoice.number} din {dmy(r.invoice.issue_date)} – neachitat {lei(r.invoice.total_with_vat - r.paid)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Suma"><input type="number" step="0.01" value={p.amount ?? ""} onChange={set("amount")} /></Field>
      </div>
    </Modal>
  );
}

const CONTRACT_FIELDS = [
  ["contract_number", "Nr. contract", "text"],
  ["title", "Obiect contract", "text", true],
  ["supplier_name", "Furnizor", "text"],
  ["supplier_cui", "Cod fiscal", "text"],
  ["unit_price", "Preț unitar fără TVA", "number"],
  ["currency", "Monedă", "text"],
  ["unit", "UM", "text"],
  ["quantity_per_period", "Cantitate / lună", "number"],
  ["vat_rate", "Cotă TVA %", "number"],
  ["billing_period", "Periodicitate", ["lunar", "trimestrial", "anual", "ocazional"]],
  ["payment_term_days", "Termen plată (zile)", "number"],
  ["late_penalty_pct_per_day", "Penalități % / zi", "number"],
  ["indexation_type", "Indexare", ["none", "IPC", "fix"]],
  ["indexation_max_pct", "Plafon indexare %", "number"],
  ["indexation_month", "Luna indexării", "number"],
  ["expense_account", "Cont cheltuială", "text"],
  ["start_date", "Valabil de la", "date"],
  ["end_date", "Valabil până la", "date"],
  ["service_keywords", "Cuvinte pe factură", "list", true],
  ["notes", "Observații", "text", true],
];

export function ContractModal({ ctx, initial, onClose }) {
  const [fields, setFields] = useState(initial || {});
  const [source, setSource] = useState(initial ? "salvat" : null);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState("");
  const has = Object.keys(fields).length > 0;

  const upload = async (file) => {
    setBusy(true);
    setWarn("");
    try {
      const r = await api.extractContract(file);
      setFields(r.fields);
      setSource(r.source);
      if (r.source === "heuristic") setWarn("AI indisponibil (lipsește cheia Anthropic) – fișa a fost completată fără AI. Verifică toate câmpurile.");
    } catch (e) {
      setWarn(e.message);
    }
    setBusy(false);
  };
  const set = (k, type, v) => setFields((f) => ({
    ...f,
    [k]: type === "number" ? (v === "" ? null : Number(v)) : type === "list" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v || (type === "date" ? null : ""),
  }));
  const save = async () => {
    if (await ctx.run("Salvare contract", () => api.saveContract(fields))) onClose();
  };

  return (
    <Modal title={`Contract furnizor${source ? ` · ${source === "claude" ? "completat cu Claude" : source === "heuristic" ? "completat automat" : "salvat"}` : ""}`}
      onClose={onClose} width={780}
      footer={<><Btn className="primary" onClick={save} disabled={!has}>Salvez</Btn><Btn onClick={onClose}>Renunț</Btn></>}>
      {!initial && (
        <div className="upload">
          <label className="bbtn primary">
            {busy ? "Se citește contractul..." : "Încarcă contractul (PDF / TXT)..."}
            <input type="file" accept=".pdf,.txt" hidden disabled={busy} onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
          </label>
          <span className="muted">AI-ul completează fișa; tu o verifici înainte de salvare.</span>
        </div>
      )}
      {warn && <div className="alert warning">{warn}</div>}
      {has && (
        <div className="form">
          {CONTRACT_FIELDS.map(([k, label, type, wide]) => (
            <Field key={k} label={label} wide={wide}>
              {Array.isArray(type) ? (
                <select value={fields[k] ?? type[0]} onChange={(e) => set(k, "text", e.target.value)}>
                  {type.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input type={type === "list" ? "text" : type} step="any"
                  value={type === "list" ? (fields[k] || []).join(", ") : fields[k] ?? ""}
                  onChange={(e) => set(k, type, e.target.value)} />
              )}
            </Field>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function EmailModal({ email, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Subiect: ${email.subject}\n\n${email.body}`;
  return (
    <Modal title="Contestație către furnizor" onClose={onClose} width={680}
      footer={<><Btn onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}>{copied ? "Copiat ✓" : "Copiez textul"}</Btn>
        <Btn onClick={() => window.open(`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`)}>Deschid în email</Btn>
        <Btn onClick={onClose}>Închid</Btn></>}>
      <textarea readOnly value={text} rows={18} />
    </Modal>
  );
}
