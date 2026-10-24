import React, { useMemo, useState } from "react";
import { api, lei } from "../api.js";
import { Check, Copy, Dot, ExportI, Paste, Print, Search } from "../icons.jsx";
import { Grid, Group, LinkBar, TBtn, Window } from "../ui.jsx";
import { partners } from "./shared.jsx";

const DRAFT = "__draft";
const JUDETE = ["AB", "AG", "AR", "B", "BC", "BH", "BN", "BR", "BT", "BV", "BZ", "CJ", "CL", "CS", "CT", "CV", "DB", "DJ", "GJ", "GL", "GR",
  "HD", "HR", "IF", "IL", "IS", "MH", "MM", "MS", "NT", "OT", "PH", "SB", "SJ", "SM", "SV", "TL", "TM", "TR", "VL", "VN", "VS"];

/** Furnizori: o singură grilă, cu adăugare și modificare direct în grilă (Salvez / Renunț). */
export default function Furnizori({ ctx, params, onClose }) {
  const rows = useMemo(() => partners(ctx).sort((a, b) => String(a.cod).localeCompare(String(b.cod))), [ctx]);
  const [selState, setSel] = useState(params.select);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ cod: "", name: "", cui: "" });
  const [draft, setDraft] = useState(null);
  const has = (v, s) => String(v ?? "").toLowerCase().includes(s.toLowerCase());
  const shown = rows.filter((p) => has(p.cod, f.cod) && has(p.name, f.name) && has(p.cui, f.cui) && (!q || has(`${p.name} ${p.cui}`, q)));
  const sel = draft ? DRAFT : selState ?? shown[0]?.cui;
  const cur = rows.find((p) => p.cui === sel);

  const nextCod = String(Math.max(0, ...rows.map((r) => Number(r.cod) || 0)) + 1).padStart(5, "0");
  const startAdd = () => setDraft({ name: "", cui: "", tara: "RO", judet: "", localitate: "", adresa: "", iban: "", banca: "" });
  const startEdit = () => cur?.id && setDraft({ ...cur });
  const save = async () => {
    const { contracts, invoices, rulaj, paid, sold, errors, warnings, ...s } = draft;
    let saved;
    if (await ctx.run("Salvare furnizor", async () => { saved = await api.saveSupplier(s); return `Furnizorul ${saved.name} a fost salvat`; })) {
      setDraft(null);
      setSel(saved.cui);
    }
  };
  const del = () => cur?.id && confirm(`Ștergi furnizorul ${cur.name}?`) && ctx.run("Ștergere furnizor", () => api.deleteSupplier(cur.id));
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const D = (p) => p.cui === DRAFT;
  const inp = (k, props = {}) => <input className="cell-in" value={draft[k] ?? ""} onChange={set(k)} {...props} />;

  const columns = [
    { key: "cod", label: "Cod", w: 56, render: (p) => (D(p) ? draft.cod || nextCod : p.cod) },
    { key: "name", label: "Denumire", w: 230, render: (p) => (D(p) ? inp("name", { autoFocus: true, placeholder: "Denumire" }) : p.name) },
    { key: "cui", label: "Cod Fiscal / CNP", w: 110, render: (p) => (D(p) ? inp("cui", { placeholder: "CUI" }) : p.cui) },
    { key: "analitic", label: "Cont analitic", w: 90, render: (p) => `401.${D(p) ? draft.cod || nextCod : p.cod}` },
    { key: "tara", label: "Țara", w: 48, render: (p) => (D(p) ? (
      <select className="cell-in" value={draft.tara} onChange={set("tara")}>{["RO", "BG", "HU", "DE", "IE", "NL", "US"].map((t) => <option key={t}>{t}</option>)}</select>
    ) : p.tara) },
    { key: "judet", label: "Județ", w: 52, render: (p) => (D(p) ? (
      <select className="cell-in" value={draft.judet} onChange={set("judet")}><option value="" />{JUDETE.map((j) => <option key={j}>{j}</option>)}</select>
    ) : p.judet) },
    { key: "localitate", label: "Localitate", w: 110, render: (p) => (D(p) ? inp("localitate") : p.localitate) },
    { key: "adresa", label: "Adresa", w: 170, render: (p) => (D(p) ? inp("adresa") : p.adresa) },
    { key: "iban", label: "Cont Bancar", w: 200, render: (p) => (D(p) ? inp("iban") : p.iban) },
    { key: "contracts", label: "Contracte", w: 64, align: "r", render: (p) => (D(p) ? "" : p.contracts) },
    { key: "sold", label: "Sold", w: 92, align: "r", cls: "pink", bold: true, render: (p) => (D(p) ? "" : lei(p.sold)) },
    { key: "verif", label: "Verificare contract", w: 170, sortValue: (p) => -p.errors,
      render: (p) => (D(p) ? "" : <span className="verif-cell"><Dot status={p.errors ? "error" : p.warnings ? "warning" : "ok"} />
        {[p.errors && `${p.errors} erori`, p.warnings && `${p.warnings} atenționări`].filter(Boolean).join(", ") || (p.invoices ? "Corect" : "")}</span>) },
  ];
  const gridRows = draft ? [...shown.filter((p) => !draft.id || p.id !== draft.id), { ...draft, cui: DRAFT }] : shown;

  return (
    <Window onClose={draft ? () => setDraft(null) : onClose}>
      <LinkBar onAdd={startAdd} onEdit={startEdit} onDelete={del} editing={draft && { save, cancel: () => setDraft(null) }}
        tools={<>
          <Group><TBtn icon={<Copy />} title="Copiere" /><TBtn icon={<Paste />} title="Lipire" /><TBtn icon={<ExportI />} title="Export date" /></Group>
          <div className="search"><input placeholder="Căutare..." value={q} onChange={(e) => setQ(e.target.value)} /><TBtn icon={<Search />} onClick={() => {}} title="Căutare" /></div>
          <Group>
            <TBtn icon={<Check />} label="Verificare" onClick={cur && !draft ? () => ctx.open("intrari", { furnizor: cur.name }) : null}
              title="Facturile furnizorului selectat, verificate față de contract" />
            <TBtn icon={<Check />} label="Verificare toți furnizorii" onClick={draft ? null : () => ctx.open("verificare")} />
          </Group>
          <Group><TBtn icon={<Print />} title="Tipărire" onClick={() => window.print()} /></Group>
        </>} />
      <div className="split">
        <div className="pane">
          <Grid columns={columns} rows={gridRows} getId={(p) => p.cui} selected={sel} onSelect={(id) => !draft && setSel(id)}
            onOpen={(p) => !draft && ctx.open("scadentar", { tab: "facturi", select: p.cui })} onInsert={startAdd} onDelete={del}
            rowClass={(p) => (D(p) ? "editing" : "")} minRows={12} />
          <div className="filterrow" style={{ paddingLeft: 10 }}>
            <input placeholder="Cod" style={{ width: 56 }} value={f.cod} onChange={(e) => setF({ ...f, cod: e.target.value })} />
            <input placeholder="Denumire" style={{ width: 230 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input placeholder="Cod Fiscal / CNP" style={{ width: 110 }} value={f.cui} onChange={(e) => setF({ ...f, cui: e.target.value })} />
            <span className="info">Dublu-click → facturile și plățile furnizorului (Situație furnizori)</span>
          </div>
        </div>
      </div>
    </Window>
  );
}
