import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dmy } from "./api.js";
import { Big } from "./icons.jsx";
import Intrari from "./windows/Intrari.jsx";
import Plati from "./windows/Plati.jsx";
import Furnizori from "./windows/Furnizori.jsx";
import Contracte from "./windows/Contracte.jsx";
import Verificare from "./windows/Verificare.jsx";
import Scadentar from "./windows/Scadentar.jsx";

const WINDOWS = {
  intrari: Intrari, plati: Plati, furnizori: Furnizori, contracte: Contracte, verificare: Verificare, scadentar: Scadentar,
};

// Meniul păstrează structura obișnuită a programelor de contabilitate; ce nu ține de verificarea
// facturilor rămâne în programul de contabilitate și apare dezactivat.
const OFF = "Rămâne în programul de contabilitate – nu face parte din Bill vs Signed";

export default function App() {
  const [data, setData] = useState({ contracts: [], invoices: [], payments: [] });
  const [analysis, setAnalysis] = useState(null);
  const [win, setWin] = useState(null); // {type, params}
  const [msg, setMsg] = useState("Gata");
  const [menu, setMenu] = useState(null);
  const invInput = useRef();
  const payInput = useRef();

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([api.state(), api.analysis()]);
    setData(s);
    setAnalysis(a);
  }, []);

  useEffect(() => { refresh().catch((e) => setMsg(`Serverul nu răspunde: ${e.message}`)); }, [refresh]);

  const run = useCallback(async (label, fn) => {
    setMsg(`${label}...`);
    try {
      const out = await fn();
      await refresh();
      setMsg(typeof out === "string" ? out : `${label}: OK`);
      return true;
    } catch (e) {
      setMsg(`${label}: ${e.message}`);
      alert(e.message);
      return false;
    }
  }, [refresh]);

  const open = useCallback((type, params = {}) => { setMenu(null); setWin({ type, params, key: Date.now() }); }, []);
  const close = useCallback(() => setWin(null), []);

  const cmap = useMemo(() => Object.fromEntries(data.contracts.map((c) => [c.id, c])), [data.contracts]);
  const company = data.invoices[0]?.customer_name || "Demo Distribuție SRL";
  const today = analysis?.summary.today;

  const importInvoices = () => invInput.current.click();
  const importPayments = () => payInput.current.click();
  const ctx = { data, analysis, cmap, refresh, run, open, setMsg, today, importInvoices, importPayments };

  const menus = [
    ["Fișiere", [
      ["Furnizori", () => open("furnizori")],
      ["Clienți", null], ["Articole", null], ["Gestiuni", null], ["Plan de conturi", null], "-",
      ["Contracte furnizori", () => open("contracte")], "-",
      ["Încarcă date demo", () => run("Date demo", async () => { await api.loadDemo(); open("verificare"); return "Date demo încărcate"; })],
      ["Șterge toate datele", () => confirm("Ștergi contractele, facturile și plățile?") && run("Resetare", api.reset)],
    ]],
    ["Operații", [
      ["Intrări (facturi furnizori)", () => open("intrari")],
      ["Ieșiri (facturi clienți)", null], "-",
      ["Plăți (casă, bancă)", () => open("plati")],
      ["Note contabile", null], ["Imobilizări", null], ["Inventar", null],
    ]],
    ["Verificare", [
      ["Verificare facturi față de contracte", () => open("verificare")], "-",
      ["Import facturi e-Factura (XML / ZIP SPV)...", importInvoices],
      ["Import extras bancar (CSV)...", importPayments],
    ]],
    ["Situații - Listări", [
      ["Scadențar furnizori", () => open("scadentar")],
      ["Fișă furnizor", () => open("furnizori")],
      ["Raport neconcordanțe (Excel)", () => window.open("/api/report.csv")], "-",
      ["Jurnal de cumpărări", null], ["Fișă cont", null], ["Balanță de verificare", null], ["Registru jurnal", null],
    ]],
    ["Declarații", [["D300 - Decont TVA", null], ["D394", null], ["D406 - SAF-T", null], ["D112", null]]],
    ["Salarii", [["Stat de plată", null], ["Revisal", null]]],
    ["Administrare", [["Date firmă", null], ["Utilizatori", null], ["Salvare / restaurare", null]]],
    ["Ajutor", [["Scurtături tastatură", () => alert(
      "Ins – Adaug\nEnter / dublu-click – Modific / deschid\nDel – Șterg\nSăgeți – navigare în listă\nEsc – Ieșire din fereastră\nClick pe capul de coloană – sortare")],
    ["Despre Bill vs Signed", () => alert("Bill vs Signed – verifică facturile primite prin RO e-Factura față de contractele semnate.")]]],
  ];

  const W = win && WINDOWS[win.type];

  return (
    <div className="app" onClick={() => menu && setMenu(null)}>
      <div className="app-title">
        <span className="app-logo">BvS</span>
        Bill vs Signed · {company} · Luna de lucru: {today ? `${today.slice(5, 7)}/${today.slice(0, 4)}` : ""}
      </div>

      <div className="menubar">
        {menus.map(([name, items]) => (
          <div key={name} className={`menu${menu === name ? " open" : ""}`}>
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === name ? null : name); }}
              onMouseEnter={() => menu && setMenu(name)}>{name}</button>
            {menu === name && (
              <div className="dropdown" onClick={(e) => e.stopPropagation()}>
                {items.map((it, i) => it === "-" ? <hr key={i} /> : (
                  <button key={it[0]} disabled={!it[1]} title={it[1] ? "" : OFF}
                    onClick={() => { setMenu(null); it[1](); }}>{it[0]}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bigbar">
        <BigBtn icon={<Big.furnizori />} label="Furnizori" onClick={() => open("furnizori")} />
        <BigBtn icon={<Big.contracte />} label="Contracte" onClick={() => open("contracte")} />
        <span className="bb-sep" />
        <BigBtn icon={<Big.intrari />} label="Intrări" onClick={() => open("intrari")} />
        <BigBtn icon={<Big.plati />} label="Plăți" onClick={() => open("plati")} />
        <span className="bb-sep" />
        <BigBtn icon={<Big.verificare />} label="Verificare" onClick={() => open("verificare")} />
        <BigBtn icon={<Big.scadentar />} label="Scadențar" onClick={() => open("scadentar")} />
        <BigBtn icon={<Big.raport />} label="Raport" onClick={() => window.open("/api/report.csv")} />
        <span className="bb-sep" />
        <BigBtn icon={<Big.iesire />} label="Ieșire" onClick={close} />
      </div>

      <div className="desktop">
        {W ? <W key={win.key} ctx={ctx} params={win.params} onClose={close} /> : <Home ctx={ctx} company={company} />}
      </div>

      <div className="statusbar">
        <span className="grow">{msg}</span>
        <span>Firma: {company}</span>
        <span>Contracte: {data.contracts.length}</span>
        <span>Facturi: {data.invoices.length}</span>
        <span>Plăți: {data.payments.length}</span>
        <span>Data: {dmy(today)}</span>
      </div>

      <input ref={invInput} type="file" multiple accept=".xml,.zip" hidden
        onChange={(e) => { const f = [...e.target.files]; e.target.value = "";
          run("Import e-Factura", async () => { const r = await api.importInvoices(f); open("intrari");
            return `Import e-Factura: ${r.added} facturi noi din ${r.parsed}${r.errors.length ? ". Erori: " + r.errors.join("; ") : ""}`; }); }} />
      <input ref={payInput} type="file" accept=".csv" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = "";
          run("Import extras", async () => { const r = await api.importPayments(f); open("plati"); return `Import extras: ${r.payments} plăți`; }); }} />
    </div>
  );
}

function BigBtn({ icon, label, onClick }) {
  return <button className="bigbtn" onClick={onClick}>{icon}<span>{label}</span></button>;
}

function Home({ ctx, company }) {
  const s = ctx.analysis?.summary;
  const empty = !ctx.data.invoices.length;
  return (
    <div className="home">
      <div className="home-card">
        <div className="home-h">{company}</div>
        {empty ? (
          <p>Nu există date. Importă facturile din e-Factura (<b>Verificare → Import</b>) sau{" "}
            <button className="link" onClick={() => ctx.run("Date demo", async () => { await api.loadDemo(); ctx.open("verificare"); return "Date demo încărcate"; })}>
              încarcă datele demo</button>.</p>
        ) : s && (
          <table className="home-t"><tbody>
            <tr><td>Facturi primite verificate</td><td className="r">{s.invoices}</td></tr>
            <tr><td>Facturi cu erori față de contract</td><td className="r err">{s.error}</td></tr>
            <tr><td>Facturi cu atenționări</td><td className="r warn">{s.warning}</td></tr>
            <tr><td>Sume de recuperat / contestat</td><td className="r b">{s.recoverable.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} lei</td></tr>
            <tr><td>Restanțe de plată</td><td className="r err">{s.overdue.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} lei</td></tr>
            <tr><td>Facturi lipsă</td><td className="r warn">{s.missing}</td></tr>
          </tbody></table>
        )}
        {!empty && <button className="wbtn" onClick={() => ctx.open("verificare")}>Deschide verificarea</button>}
      </div>
    </div>
  );
}
