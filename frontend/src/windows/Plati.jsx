import React, { useMemo, useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Copy, ExportI, Paste, Print, Search } from "../icons.jsx";
import { BottomBar, Btn, Grid, Group, LinkBar, TBtn, Window } from "../ui.jsx";
import { PaymentModal, analitic, supplierName } from "./shared.jsx";

/** Jurnal de bancă / Registru de casă: sus zilele (sold inițial, încasări, plăți, sold final), jos operațiile zilei. */
export default function Plati({ ctx, params, onClose }) {
  const method = params.method || "banca";
  const casa = method === "casa";
  const cont = casa ? "5311" : "5121";
  const all = ctx.data.payments.filter((p) => (p.method || "banca") === method);
  const opening = ctx.data.opening?.[method] || 0;
  const days = useMemo(() => {
    const m = {};
    for (const p of all) (m[p.date] ||= { id: p.date, date: p.date, plati: 0 }).plati += p.amount;
    let sold = opening;
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
      const row = { ...d, initial: sold, incasari: 0, final: sold - d.plati };
      sold = row.final;
      return row;
    });
  }, [all, opening]);
  const [day, setDay] = useState(days.at(-1)?.id);
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const ops = all.filter((p) => p.date === day);
  const cur = ops.find((p) => p.id === sel) || ops[0];

  const z = () => lei(0);
  const dayCols = [
    { key: "date", label: "Data", w: 90, render: (d) => dmy(d.date) },
    { key: "initial", label: "Sold inițial zi", w: 110, align: "r", cls: "green", render: (d) => lei(d.initial) },
    { key: "incasari", label: "Încasări", w: 100, align: "r", cls: "green", render: (d) => lei(d.incasari) },
    { key: "plati", label: "Plăți", w: 100, align: "r", cls: "green", render: (d) => lei(d.plati) },
    { key: "final", label: "Sold final zi", w: 110, align: "r", cls: "green", bold: true, render: (d) => lei(d.final) },
    { key: "bti", label: "Baza TVA I", w: 90, align: "r", render: z },
    { key: "tvai", label: "TVA I", w: 80, align: "r", render: z },
    { key: "btp", label: "Baza TVA P", w: 90, align: "r", render: z },
    { key: "tvap", label: "TVA P", w: 80, align: "r", render: z },
  ];
  const opCols = [
    { key: "doc", label: "Nr. doc.", w: 90, render: (p) => p.doc || "" },
    { key: "debit", label: "Cont debit", w: 90, render: (p) => analitic(ctx, p.supplier_cui) },
    { key: "credit", label: "Cont credit", w: 80, render: () => cont },
    { key: "amount", label: "Suma", w: 100, align: "r", render: (p) => lei(p.amount) },
    { key: "tvaip", label: "TVA I/P", w: 70, align: "r", render: z },
    { key: "expl", label: "Explicație", w: 420, render: (p) => `Achit. ${supplierName(ctx, p.supplier_cui)} nr.: ${p.invoice_number}` },
  ];
  const del = (p = cur) => p && confirm(`Ștergi plata de ${lei(p.amount)} pentru factura ${p.invoice_number}?`)
    && ctx.run("Ștergere plată", () => api.deletePayment(p.id));
  const add = () => setEdit({ method, date: day || ctx.today });

  return (
    <Window onClose={onClose}>
      <LinkBar onAdd={add}
        tools={<>
          <Group><TBtn icon={<ExportI />} title="Export date" /><TBtn icon={<ExportI />} title={casa ? "Import" : "Import extras bancar (CSV)"} onClick={ctx.importPayments} /></Group>
          {casa && <Group><TBtn label="Monetar" title="Monetar" /></Group>}
        </>}
        right={<span className="chk">Cont contabil: <select disabled value={cont}><option>{cont}</option></select> <b>{casa ? "CASA ÎN LEI" : "CONTURI LA BĂNCI ÎN LEI"}</b></span>} />
      <div className="split">
        <div className="pane top" style={{ flex: 0.8 }}>
          <Grid columns={dayCols} rows={days} selected={day} onSelect={(id) => { setDay(id); setSel(null); }}
            defaultSort={{ key: "date", dir: "asc" }} />
        </div>
        <div className="pane bottom">
          <LinkBar keys="DOT" onAdd={add} onEdit={() => cur && setEdit(cur)} onDelete={() => del()}
            tools={<>
              <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
              <div className="search"><input placeholder="" /><TBtn icon={<Search />} title="Căutare avansată" onClick={() => {}} /></div>
            </>}
            detalii={{ on: false, toggle: () => cur && setEdit(cur) }} />
          <Grid columns={opCols} rows={ops} selected={cur?.id} onSelect={setSel} onOpen={setEdit} onInsert={add} onDelete={del} />
        </div>
      </div>
      <BottomBar>
        {casa ? <>
          <Btn icon={<Print />} label="Registru" alt="R" onClick={() => window.print()} />
          <Btn icon={<Print />} label="Chitanță" alt="C" disabled />
          <Btn icon={<Print />} label="Contract creditare" disabled />
          <Btn icon={<Print />} label="D.P." disabled />
          <Btn icon={<Print />} label="D.I." disabled />
          <Btn icon={<Print />} label="N.T." alt="N" disabled />
        </> : <>
          <Btn icon={<Print />} label="Jurnal" alt="J" onClick={() => window.print()} />
          <Btn icon={<Print />} label="OP" disabled />
          <Btn icon={<Print />} label="Contract creditare" disabled />
        </>}
      </BottomBar>
      {edit && <PaymentModal ctx={ctx} initial={edit} onClose={() => setEdit(null)} />}
    </Window>
  );
}
