import React, { useState } from "react";
import { api, dmy, lei } from "../api.js";
import { Excel, Refresh } from "../icons.jsx";
import { BottomBar, Btn, Grid, IconBtn, LinkBar, Window } from "../ui.jsx";
import { PaymentModal, supplierName } from "./shared.jsx";

/** Plăți către furnizori, prin casă sau bancă. */
export default function Plati({ ctx, onClose }) {
  const rows = ctx.data.payments;
  const [sel, setSel] = useState(rows[0]?.id);
  const [edit, setEdit] = useState(null);
  const cur = rows.find((p) => p.id === sel);

  const columns = [
    { key: "method", label: "Tip", w: 34, render: (p) => (p.method === "casa" ? "C" : "B") },
    { key: "doc", label: "Nr. doc.", w: 90, render: (p) => p.doc || "—" },
    { key: "date", label: "Data", w: 80, render: (p) => dmy(p.date) },
    { key: "supplier_cui", label: "Cod", w: 80 },
    { key: "furnizor", label: "Furnizor", w: 220, render: (p) => supplierName(ctx, p.supplier_cui), sortValue: (p) => supplierName(ctx, p.supplier_cui) },
    { key: "invoice_number", label: "Factura", w: 110 },
    { key: "explicatie", label: "Explicație", w: 220, render: (p) => `Plată factura ${p.invoice_number}` },
    { key: "amount", label: "Suma", w: 100, align: "r", bold: true, render: (p) => lei(p.amount) },
  ];
  const del = (p = cur) => p && confirm(`Ștergi plata de ${lei(p.amount)} pentru factura ${p.invoice_number}?`)
    && ctx.run("Ștergere plată", () => api.deletePayment(p.id));
  const total = rows.reduce((s, p) => s + p.amount, 0);

  return (
    <Window title="Plăți furnizori (casă, bancă)" onClose={onClose}>
      <LinkBar onAdd={() => setEdit({})} onEdit={() => cur && setEdit(cur)} onDelete={() => del()}
        tools={<>
          <IconBtn title="Import extras bancar (CSV)" onClick={ctx.importPayments}><Excel /></IconBtn>
          <IconBtn title="Reîmprospătare" onClick={ctx.refresh}><Refresh /></IconBtn>
        </>} />
      <div className="single-area">
        <Grid columns={columns} rows={rows} selected={sel} onSelect={setSel} onOpen={setEdit} onInsert={() => setEdit({})} onDelete={del}
          defaultSort={{ key: "date", dir: "asc" }} empty="Nu există plăți. Adaug sau importă extrasul bancar."
          footer={{ furnizor: `${rows.length} plăți`, amount: lei(total) }} />
      </div>
      <BottomBar>
        <Btn onClick={ctx.importPayments}>Import extras bancar...</Btn>
        <span className="muted">Format CSV: numar_factura;cui_furnizor;data;suma</span>
        <span className="grow" />
        <Btn className="exit" onClick={onClose}>Ieșire</Btn>
      </BottomBar>
      {edit && <PaymentModal ctx={ctx} initial={edit} onClose={() => setEdit(null)} />}
    </Window>
  );
}
