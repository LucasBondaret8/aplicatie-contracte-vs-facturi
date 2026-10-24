import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Copy, ExportI, Paste, Print, Search } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, LinkBar, TBtn, Window } from "../ui.jsx";
import { PaymentModal, supplierName } from "./shared.jsx";

/** Jurnal de bancă / Registru de casă: sus zilele, jos operațiile zilei (plăți către furnizori). */
export default function Plati({ ctx, params, onClose }) {
  const method = params.method || "banca";
  const cont = method === "casa" ? "5311" : "5121";
  const all = ctx.data.payments.filter((p) => (p.method || "banca") === method);
  const days = useMemo(() => {
    const m = {};
    for (const p of all) (m[p.date] ||= { id: p.date, date: p.date, plati: 0, n: 0 }), (m[p.date].plati += p.amount), m[p.date].n++;
    return Object.values(m);
  }, [all]);
  const [day, setDay] = useState(days.map((d) => d.id).sort().at(-1));
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const ops = all.filter((p) => p.date === day);
  const cur = ops.find((p) => p.id === sel);

  const dayCols = [
    { key: "date", label: "Data", w: 90, render: (d) => dmy(d.date) },
    { key: "inc", label: "Încasări", w: 110, align: "r", cls: "green", render: () => lei(0) },
    { key: "plati", label: "Plăți", w: 110, align: "r", cls: "green", bold: true, render: (d) => lei(d.plati) },
    { key: "n", label: "Nr. operații", w: 90, align: "r" },
  ];
  const opCols = [
    { key: "doc", label: "Nr. doc.", w: 90, render: (p) => p.doc || (method === "casa" ? "Chitanță" : "OP") },
    { key: "debit", label: "Cont debit", w: 80, render: () => "401" },
    { key: "credit", label: "Cont credit", w: 80, render: () => cont },
    { key: "amount", label: "Suma", w: 100, align: "r", bold: true, render: (p) => lei(p.amount) },
    { key: "tip", label: "Tip operație", w: 120, render: () => "Plată furnizor" },
    { key: "furnizor", label: "Furnizor", w: 200, render: (p) => supplierName(ctx, p.supplier_cui) },
    { key: "factura", label: "Nr. factură", w: 110, render: (p) => p.invoice_number },
    { key: "expl", label: "Explicație", w: 260, render: (p) => `Plată factura ${p.invoice_number}` },
  ];
  const del = (p = cur) => p && confirm(`Ștergi plata de ${lei(p.amount)} pentru factura ${p.invoice_number}?`)
    && ctx.run("Ștergere plată", () => api.deletePayment(p.id));
  const add = () => setEdit({ method, date: day || ctx.today });

  return (
    <Window onClose={onClose}>
      <LinkBar onAdd={add}
        tools={<>
          <Group><TBtn icon={<ExportI />} title="Import extras bancar (CSV)" onClick={ctx.importPayments} /><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
        </>}
        right={<span className="chk">Cont contabil: <b>{cont}</b> · {method === "casa" ? "Casa în lei" : "Conturi la bancă în lei"}</span>} />
      <div className="split">
        <div className="pane top" style={{ flex: 0.8 }}>
          <Grid columns={dayCols} rows={days} selected={day} onSelect={(id) => { setDay(id); setSel(null); }}
            defaultSort={{ key: "date", dir: "asc" }} empty={`Nu există plăți prin ${method === "casa" ? "casă" : "bancă"}.`}
            footer={{ date: `${days.length} zile`, plati: lei(all.reduce((t, p) => t + p.amount, 0)), n: all.length }} />
        </div>
        <div className="pane bottom">
          <LinkBar keys="DOT" onAdd={add} onEdit={() => cur && setEdit(cur)} onDelete={() => del()}
            tools={<Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<Search />} title="Căutare avansată" /></Group>} />
          <Grid columns={opCols} rows={ops} selected={sel} onSelect={setSel} onOpen={setEdit} onInsert={add} onDelete={del} />
        </div>
      </div>
      <BottomBar>
        <Btn icon={<Print />} label="Jurnal" alt="J" onClick={() => window.print()} />
        <Btn icon={<Print />} label={method === "casa" ? "Chitanță" : "OP"} disabled />
        <Btn icon={<ExportI />} label="Import extras" onClick={ctx.importPayments} />
      </BottomBar>
      {edit && <PaymentModal ctx={ctx} initial={edit} onClose={() => setEdit(null)} />}
    </Window>
  );
}
