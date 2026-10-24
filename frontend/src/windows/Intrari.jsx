import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Arrows, Copy, Doc, Dot, ExportI, FilterI, Folder, Gavel, Lock, Paste, Print, Search, Sync, Tag, Unlock } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, LinkBar, TBtn, TextBtns, Window } from "../ui.jsx";
import { CompareDetail, EmailModal, PaymentModal } from "./shared.jsx";

const isPenalty = (l) => /penalit/i.test(l.description);

/** Intrări – facturile primite de la furnizori (din RO e-Factura), verificate față de contract. */
export default function Intrari({ ctx, params, onClose }) {
  const results = ctx.analysis?.results || [];
  const [selState, setSel] = useState(params.select);
  const [selLine, setSelLine] = useState(0);
  const [showDet, setShowDet] = useState(true);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ nrInt: "", nr: "", cod: "", furnizor: params.furnizor || "", probleme: params.onlyProblems || false });
  const [payment, setPayment] = useState(null);
  const [email, setEmail] = useState(null);

  const nrInt = useMemo(() => Object.fromEntries([...results]
    .sort((a, b) => a.invoice.issue_date.localeCompare(b.invoice.issue_date) || a.invoice.number.localeCompare(b.invoice.number))
    .map((r, i) => [r.invoice.id, i + 1])), [results]);
  const rows = useMemo(() => results.filter((r) => {
    const i = r.invoice;
    const has = (v, s) => String(v).toLowerCase().includes(s.toLowerCase());
    return has(nrInt[i.id], f.nrInt) && has(i.number, f.nr) && has(i.supplier_cui, f.cod) && has(i.supplier_name, f.furnizor)
      && (!q || has(`${i.number} ${i.supplier_name} ${i.supplier_cui}`, q)) && (!f.probleme || r.status !== "ok");
  }), [results, f, q, nrInt]);
  // până la primul click, selecția e prima factură (în ordinea datei)
  const sel = selState ?? [...rows].sort((a, b) => a.invoice.issue_date.localeCompare(b.invoice.issue_date))[0]?.invoice.id;
  const cur = results.find((r) => r.invoice.id === sel);
  const contract = cur && ctx.cmap[cur.contract_id];

  const columns = [
    { key: "lock", w: 20, render: (r) => (r.invoice.validated ? <span className="lockcell"><Lock /></span> : null), sortValue: (r) => (r.invoice.validated ? 1 : 0) },
    { key: "tip", label: "Tip", w: 34, render: () => "F" },
    { key: "nrint", label: "Nr. int.", w: 56, render: (r) => nrInt[r.invoice.id], sortValue: (r) => nrInt[r.invoice.id] },
    { key: "nr", label: "Nr. doc.", w: 100, render: (r) => r.invoice.number, sortValue: (r) => r.invoice.number },
    { key: "cod", label: "Cod", w: 72, render: (r) => r.invoice.supplier_cui, sortValue: (r) => r.invoice.supplier_cui },
    { key: "furnizor", label: "Furnizor", w: 200, render: (r) => r.invoice.supplier_name, sortValue: (r) => r.invoice.supplier_name },
    { key: "tvai", label: "TVA I", w: 40, render: () => "" },
    { key: "data", label: "Data", w: 76, render: (r) => dmy(r.invoice.issue_date), sortValue: (r) => r.invoice.issue_date },
    { key: "scadent", label: "Scadent", w: 76, render: (r) => dmy(r.invoice.due_date), sortValue: (r) => r.invoice.due_date },
    { key: "valoare", label: "Valoare", w: 84, align: "r", cls: "grey", render: (r) => lei(r.invoice.total_without_vat), sortValue: (r) => r.invoice.total_without_vat },
    { key: "tva", label: "TVA", w: 74, align: "r", cls: "grey", render: (r) => lei(r.invoice.vat_total), sortValue: (r) => r.invoice.vat_total },
    { key: "total", label: "Total", w: 88, align: "r", cls: "grey", bold: true, render: (r) => lei(r.invoice.total_with_vat), sortValue: (r) => r.invoice.total_with_vat },
    { key: "neach", label: "Neachitat", w: 84, align: "r", cls: "pink", render: (r) => lei(r.invoice.total_with_vat - r.paid), sortValue: (r) => r.invoice.total_with_vat - r.paid },
    { key: "contract", label: "Contract", w: 80, render: (r) => ctx.cmap[r.contract_id]?.contract_number || "" },
    { key: "verif", label: "Verificare contract", w: 220, sortValue: (r) => ({ error: 0, warning: 1, ok: 2 })[r.status],
      render: (r) => <span className="verif-cell"><Dot status={r.status} />{r.alerts.map((a) => a.title).join("; ") || "Corect"}</span>,
      title: (r) => r.alerts.map((a) => a.title).join("\n") },
    { key: "spv", label: "ID încărcare SPV", w: 120, render: (r) => r.invoice.source_file?.replace(/\.xml$/i, "") },
  ];

  const lineCols = [
    { key: "tip", label: "Tip", w: 62, render: () => "Serviciu" },
    { key: "gest", label: "Gestiune", w: 80, render: () => "" },
    { key: "den", label: "Denumire articol / serviciu", w: 240, render: (l) => l.description },
    { key: "cod", label: "Cod", w: 50, render: () => "" },
    { key: "um", label: "UM", w: 70, render: (l) => (isPenalty(l) ? "buc" : contract?.unit || "buc") },
    { key: "tvap", label: "TVA %", w: 46, align: "r", render: (l) => l.vat_pct },
    { key: "cant", label: "Cantitate", w: 70, align: "r", render: (l) => l.quantity.toFixed(3) },
    { key: "pu", label: "Preț unitar", w: 84, align: "r", render: (l) => lei(l.unit_price) },
    { key: "pc", label: "Preț contract", w: 88, align: "r", cls: "grey", render: (l) => (isPenalty(l) || !cur?.allowed_price ? "" : lei(cur.allowed_price)) },
    { key: "dif", label: "Diferență", w: 74, align: "r", cls: "pink", render: (l) => {
      if (isPenalty(l) || !cur?.allowed_price) return "";
      const d = l.unit_price - cur.allowed_price;
      return d > 0.009 ? <b className="err">+{lei(d)}</b> : "0,00";
    } },
    { key: "val", label: "Valoare", w: 84, align: "r", render: (l) => lei(l.line_total) },
    { key: "tot", label: "Total", w: 86, align: "r", bold: true, render: (l) => lei(l.line_total * (1 + l.vat_pct / 100)) },
    { key: "tvav", label: "TVA", w: 70, align: "r", render: (l) => lei(l.line_total * l.vat_pct / 100) },
    { key: "nded", label: "Nedeductibil", w: 76, align: "r", render: () => "" },
    { key: "cont", label: "Cont", w: 50, render: (l) => (isPenalty(l) ? "6581" : contract?.expense_account || "628") },
  ];

  const validate = (value) => {
    if (!cur) return;
    if (value && cur.status === "error"
      && !confirm(`Factura ${cur.invoice.number} are erori față de contract:\n\n• ${cur.alerts.filter((a) => a.severity === "error").map((a) => a.title).join("\n• ")}\n\nO validezi totuși?`)) return;
    ctx.run(value ? "Validare" : "Devalidare", async () => {
      await api.setValidated(cur.invoice.id, value);
      return `Factura ${cur.invoice.number} a fost ${value ? "validată" : "devalidată"}`;
    });
  };
  const del = () => cur && confirm(`Ștergi factura ${cur.invoice.number}?`) && ctx.run("Ștergere", () => api.deleteInvoice(cur.invoice.id));
  const pay = () => cur && setPayment({ supplier_cui: cur.invoice.supplier_cui, invoice_number: cur.invoice.number,
    amount: Math.max(0, cur.invoice.total_with_vat - cur.paid).toFixed(2) });
  const disputable = cur?.alerts.some((a) => !["OVERDUE", "OVERPAID", "NO_CONTRACT"].includes(a.code));
  const contest = async () => disputable && setEmail(await api.dispute(cur.invoice.id));
  const noEdit = () => alert("Facturile primite prin e-Factura nu se modifică. Pentru neconcordanțe folosește „Contestație”.");

  const totals = rows.reduce((t, r) => ({ v: t.v + r.invoice.total_without_vat, tva: t.tva + r.invoice.vat_total,
    tot: t.tot + r.invoice.total_with_vat, n: t.n + r.invoice.total_with_vat - r.paid }), { v: 0, tva: 0, tot: 0, n: 0 });

  return (
    <Window onClose={onClose}>
      <LinkBar onAdd={ctx.importInvoices} onEdit={noEdit} onDelete={del}
        tools={<>
          <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" onClick={() => window.open("/api/report.csv")} /></Group>
          <div className="search">
            <input placeholder="Căutare..." value={q} onChange={(e) => setQ(e.target.value)} />
            <TBtn icon={<Search />} title="Căutare" onClick={() => {}} />
          </div>
          <Group>
            <TBtn icon={<FilterI />} title="Filtrare: doar facturile cu probleme" active={f.probleme} onClick={() => setF({ ...f, probleme: !f.probleme })} />
            <TBtn icon={<Folder />} title="Import facturi e-Factura (XML / ZIP)" onClick={ctx.importInvoices} />
          </Group>
          <Group><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
          <Group><TBtn icon={<Sync />} title="Fișiere e-Factura: descărcare din SPV" onClick={ctx.importInvoices} /></Group>
          {f.probleme && <span className="chk">Filtru: doar cu probleme</span>}
        </>}
        detalii={{ on: showDet, toggle: () => setShowDet(!showDet) }} />

      <div className={showDet ? "with-det" : "split"}>
        <div>
          <div className="pane top">
            <Grid columns={columns} rows={rows} getId={(r) => r.invoice.id} selected={sel}
              onSelect={(id) => { setSel(id); setSelLine(0); }} onOpen={() => setShowDet(true)} onInsert={ctx.importInvoices} onDelete={del}
              rowClass={(r) => `st-${r.status}${r.invoice.validated ? " validated" : ""}`} defaultSort={{ key: "data", dir: "asc" }}
              empty="Nu există facturi. Adaug → import XML / ZIP din SPV."
              footer={{ furnizor: `${rows.length} documente`, valoare: lei(totals.v), tva: lei(totals.tva), total: lei(totals.tot), neach: lei(totals.n) }} />
            <div className="filterrow">
              <input placeholder="Nr. int." style={{ width: 56 }} value={f.nrInt} onChange={(e) => setF({ ...f, nrInt: e.target.value })} />
              <input placeholder="Nr. doc." style={{ width: 100 }} value={f.nr} onChange={(e) => setF({ ...f, nr: e.target.value })} />
              <input placeholder="Cod" style={{ width: 72 }} value={f.cod} onChange={(e) => setF({ ...f, cod: e.target.value })} />
              <input placeholder="Furnizor" style={{ width: 200 }} value={f.furnizor} onChange={(e) => setF({ ...f, furnizor: e.target.value })} />
            </div>
          </div>
          <div className="pane bottom">
            <LinkBar keys="DOT" onEdit={noEdit}
              tools={<>
                <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
                <Group><TBtn icon={<Doc />} title="Fișa contractului" onClick={() => contract && ctx.open("contracte", { select: contract.id })} /></Group>
                <TextBtns items={[
                  ["Contract", contract ? () => ctx.open("contracte", { select: contract.id }) : null, "Deschide contractul furnizorului"],
                  ["Contestație", disputable ? contest : null, "Email de contestație către furnizor"],
                  ["Plată", cur ? pay : null],
                  ["Fișă furnizor", cur ? () => ctx.open("furnizori", { select: cur.invoice.supplier_cui }) : null],
                ]} />
              </>} />
            <Grid columns={lineCols} rows={cur?.invoice.lines.map((l, i) => ({ ...l, id: i })) || []} selected={selLine} onSelect={setSelLine} />
          </div>
        </div>
        {showDet && <CompareDetail r={cur} contract={contract} />}
      </div>

      <BottomBar>
        <Btn icon={<Lock />} label="Validez" alt="V" onClick={() => validate(true)} disabled={!cur || cur.invoice.validated} />
        <Btn icon={<Tag />} label="Plată" alt="P" onClick={pay} disabled={!cur} />
        <Btn icon={<Arrows />} label="Stornez" disabled title="Stornarea se face în programul de contabilitate" />
        <Btn icon={<Doc />} label="N.C." disabled title="Nota contabilă se generează în programul de contabilitate" />
        <Btn icon={<Print />} label="Tipărire" alt="E" onClick={() => window.print()} />
        <Btn icon={<Unlock />} label="Devalidez" alt="D" onClick={() => validate(false)} disabled={!cur?.invoice.validated} />
        <Btn icon={<Gavel />} label="Contestație" alt="C" onClick={contest} disabled={!disputable} className={disputable ? "primary" : ""} />
      </BottomBar>

      {payment && <PaymentModal ctx={ctx} initial={payment} onClose={() => setPayment(null)} />}
      {email && <EmailModal email={email} onClose={() => setEmail(null)} />}
    </Window>
  );
}
