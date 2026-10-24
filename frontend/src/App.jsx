import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { Bell, Book, Caret, Contrast, Logo, Logout, Sync } from "./icons.jsx";
import Intrari from "./windows/Intrari.jsx";
import Plati from "./windows/Plati.jsx";
import Furnizori from "./windows/Furnizori.jsx";
import Contracte from "./windows/Contracte.jsx";
import Verificare from "./windows/Verificare.jsx";
import Scadentar from "./windows/Scadentar.jsx";

const WINDOWS = {
  intrari: [Intrari, "Intrări"],
  furnizori: [Furnizori, "Furnizori"],
  banca: [Plati, "Jurnal de bancă"],
  casa: [Plati, "Registru de casă"],
  contracte: [Contracte, "Contracte furnizori"],
  verificare: [Verificare, "Verificare contracte"],
  scadentar: [Scadentar, "Situație furnizori"],
};

// Structura meniului urmează programele de contabilitate obișnuite. Ce nu ține de verificarea
// facturilor primite rămâne în programul de contabilitate și apare dezactivat.
const OFF = "Rămâne în programul de contabilitate";

export default function App() {
  const [data, setData] = useState({ contracts: [], invoices: [], payments: [] });
  const [analysis, setAnalysis] = useState(null);
  const [win, setWin] = useState({ type: "intrari", params: {}, key: 0 });
  const [msg, setMsg] = useState("");
  const [menu, setMenu] = useState(null);
  const [sub, setSub] = useState(null);
  const invInput = useRef();
  const payInput = useRef();

  const [spv, setSpv] = useState(null);
  const lastSync = useRef(undefined); // undefined = încă nu s-au încărcat datele (serverul poate porni mai târziu)

  const refresh = useCallback(async () => {
    const [s, a, st] = await Promise.all([api.state(), api.analysis(), api.spvStatus()]);
    setData(s);
    setAnalysis(a);
    setSpv(st);
    lastSync.current = st.last_sync;
  }, []);

  // la pornire serverul poate fi încă în curs de pornire: reîncercăm câteva secunde
  useEffect(() => {
    let stop = false;
    (async () => {
      for (let i = 0; i < 30 && !stop; i++) {
        try { await refresh(); setMsg(""); return; } catch (e) {
          setMsg(i < 29 ? "Se pornește serverul..." : `Serverul nu răspunde: ${e.message}`);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })();
    return () => { stop = true; };
  }, [refresh]);

  // sincronizarea cu SPV rulează pe server; aici doar aflăm când au sosit facturi noi
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const st = await api.spvStatus();
        if (st.last_sync !== lastSync.current) {
          await refresh();
          if (st.last_new) setMsg(`Au sosit ${st.last_new} facturi noi din SPV – le găsești marcate NOU în Intrări`);
        } else setSpv(st);
      } catch { /* serverul repornește */ }
    }, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  const syncSpv = useCallback(async () => {
    setMsg("Sincronizare cu SPV...");
    try {
      const st = await api.spvSync();
      await refresh();
      setMsg(st.last_error ? `SPV: ${st.last_error}` : st.last_new
        ? `Au sosit ${st.last_new} facturi noi din SPV – le găsești marcate NOU în Intrări` : "SPV: nicio factură nouă");
    } catch (e) {
      setMsg(`SPV: ${e.message}`);
    }
  }, [refresh]);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(""), 6000); return () => clearTimeout(t); } }, [msg]);

  const run = useCallback(async (label, fn) => {
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

  const open = useCallback((type, params = {}) => { setMenu(null); setSub(null); setWin({ type, params, key: Date.now() }); }, []);
  const close = useCallback(() => setWin({ type: "intrari", params: {}, key: Date.now() }), []);

  const cmap = useMemo(() => Object.fromEntries(data.contracts.map((c) => [c.id, c])), [data.contracts]);
  const company = data.invoices[0]?.customer_name || "Demo Distribuție SRL";
  const today = analysis?.summary.today;
  const problems = (analysis?.summary.error || 0) + (analysis?.summary.warning || 0) + (analysis?.summary.missing || 0) + (spv?.new_invoices || 0);

  const importInvoices = () => invInput.current.click();
  const importPayments = () => payInput.current.click();
  const loadDemo = () => run("Date demo", async () => {
    const r = await api.loadDemo();
    open("intrari");
    return r.warning ? `Date demo încărcate. Atenție: ${r.warning}` : "Date demo încărcate";
  });
  const ctx = { data, analysis, cmap, refresh, run, open, setMsg, today, importInvoices, importPayments, syncSpv };

  // [eticheta, acțiune | null, scurtătură, submeniu]
  const menus = [
    ["Fișiere", [
      ["Furnizori", () => open("furnizori"), "ALT+1"], ["Clienți", null, "ALT+2"], ["Agenți"], ["Plan conturi"], ["Gestiuni"],
      ["Articole"], ["Tipuri de articole / servicii"], ["Grupe"], ["Filiale"], ["Salariați"],
    ]],
    ["Operații", [
      ["Articole contabile"], ["Intrări", () => open("intrari"), "ALT+3"], ["Ieșiri", null, "ALT+4"],
      ["e-Facturi", null, null, [["Sincronizare cu SPV acum", syncSpv], ["Facturi noi din SPV", () => open("intrari", { onlyNew: true })],
        ["Import din fișiere (XML / ZIP)", importInvoices]]], ["Intrări - valută"], ["Ieșiri - valută"], ["Imobilizări"], ["Transferuri"],
      ["Bonuri de consum"], ["Producție"],
      ["Alte operații cu stocuri", null, null, [["Inventariere"], ["Dare în folosință ob. inv."], ["Dezmembrări"], ["Operații speciale"], ["Reglări descărcare"]]],
      "-",
      ["Registru de casă", () => open("casa"), "ALT+5"], ["Deconturi", null, "ALT+8"], ["Jurnal de bancă", () => open("banca"), "ALT+6"],
      ["Cecuri, BO emise/primite"], ["Registru de casă - Valută"], ["Deconturi - Valută"], ["Jurnal de bancă - Valută"],
      "-", ["State salarii", null, "ALT+7"], ["Închidere lună"],
    ]],
    ["Situații", [
      ["Fișe conturi"], ["Balanțe"], ["Carte mare"], ["Jurnal de cumpărări / vânzări"],
      ["Situație furnizori", () => open("scadentar")], ["Situație clienți"], ["Situație cecuri / bilete la ordin"],
      ["Registru jurnal"], ["Registru inventar"], ["Bilanț"], ["Declarația 406 (SAF-T)"], "-",
      ["Raport neconcordanțe contracte (XLS)", () => window.open("/api/report.csv")],
    ]],
    ["Diverse", [
      ["Comenzi"], ["Situație comenzi"],
      ["Contracte furnizori", () => open("contracte"), "ALT+9"],
      ["Verificare facturi față de contracte", () => open("verificare"), "ALT+0"], "-",
      ["Cheltuieli / Venituri în avans"],
      ["Import date", null, null, [["Facturi e-Factura (XML / ZIP SPV)", importInvoices], ["Extras bancar (CSV)", importPayments], ["Date demo", loadDemo]]],
      ["Diurne"], ["Situații manageriale"], ["Acționari"], ["Mașini"], ["e-Transport"], ["Declarația Intrastat"], ["Declarația 205"],
    ]],
    ["Administrare", [
      ["Configurare salarii"], ["Numere și serii"], ["Utilizatori"], "-",
      ["Șterge toate datele", () => confirm("Ștergi contractele, facturile și plățile?") && run("Resetare", api.reset)],
      ["Despre", () => alert("Bill vs Signed – verifică facturile primite prin RO e-Factura față de contractele semnate.\n\nScurtături: ALT+1 Furnizori, ALT+3 Intrări, ALT+5 Casă, ALT+6 Bancă, ALT+9 Contracte, ALT+0 Verificare.\nÎn liste: ALT+A Adaug, ALT+M Modific, ALT+S Șterg, săgeți, Enter, Esc.")],
    ]],
  ];

  // ALT + cifră deschide modulele, ca în programul de contabilitate
  useEffect(() => {
    const keys = { 1: "furnizori", 3: "intrari", 5: "casa", 6: "banca", 9: "contracte", 0: "verificare" };
    const onKey = (e) => {
      if (e.altKey && keys[e.key] && !document.querySelector(".modal-bg")) { e.preventDefault(); open(keys[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const [W, title] = WINDOWS[win.type];
  const renderItem = (it, i) => {
    if (it === "-") return <hr key={i} />;
    const [label, fn, key, children] = it;
    if (children) {
      return (
        <div key={label} className="mi has-sub" onMouseEnter={() => setSub(label)}>
          <span>{label}</span><span className="sub-caret">▸</span>
          {sub === label && <div className="dropdown sub">{children.map(renderItem)}</div>}
        </div>
      );
    }
    return (
      <button key={label} className="mi" disabled={!fn} title={fn ? "" : OFF} onMouseEnter={() => setSub(null)}
        onClick={() => { setMenu(null); setSub(null); fn(); }}>
        <span>{label}</span>{key && <span className="mi-key">{key}</span>}
      </button>
    );
  };

  return (
    <div className="app" onClick={() => menu && (setMenu(null), setSub(null))}>
      <aside className="sidebar">
        <button className="side-logo" title="Verificare facturi" onClick={() => open("verificare")}>
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7.5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="side-title">{title.toUpperCase()}<span className="side-dash" /></div>
        <div className="side-bottom">
          <button title="Ajutor" onClick={() => menus[4][1].at(-1)[1]()}><Book /></button>
          <button title="Temă"><Contrast /></button>
          <span>RO</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Logo />
          <nav className="menus">
            {menus.map(([name, items]) => (
              <div key={name} className={`menu${menu === name ? " open" : ""}`}>
                <button onClick={(e) => { e.stopPropagation(); setSub(null); setMenu(menu === name ? null : name); }}
                  onMouseEnter={() => menu && menu !== name && (setSub(null), setMenu(name))}>{name} <Caret /></button>
                {menu === name && <div className="dropdown" onClick={(e) => e.stopPropagation()}>{items.map(renderItem)}</div>}
              </div>
            ))}
            <div className="menu"><button title="Intervalul de lucru">Interval (01.01.2026 - 31.12.9999) <Caret /></button></div>
          </nav>
          <span className="grow" />
          {spv && (
            <button className={`top-item spv${spv.last_error ? " err" : ""}`} onClick={syncSpv}
              title={`${{ anaf: "Conectat la ANAF e-Factura", supabase: "Facturi și contracte din Supabase (în locul SPV)" }[spv.mode] || "SPV simulat (demo)"} · sincronizare automată la ${spv.every_minutes} min · click = sincronizează acum${spv.last_error ? `\nEroare: ${spv.last_error}` : ""}`}>
              <Sync /> SPV{{ simulat: " (demo)", supabase: " (Supabase)" }[spv.mode] || ""}: {spv.last_sync ? `sincronizat ${spv.last_sync.slice(11, 16)}` : "nesincronizat"}
              {spv.new_invoices > 0 && <span className="tag-new">{spv.new_invoices} NOI</span>}
            </button>
          )}
          <span className="top-item"><Book /> {company}</span>
          <button className="top-item bell" title={`${problems} probleme de verificat`} onClick={() => open("verificare")}>
            <Bell />{problems > 0 && <span className="badge-n">{problems}</span>}
          </button>
          <span className="top-item">contabil@{company.split(" ")[0].toLowerCase()}.ro</span>
          <button className="top-item" title="Ieșire" onClick={close}><Logout /></button>
        </header>

        {msg && (
          <div className="notice" onClick={() => { setMsg(""); if (/facturi noi din SPV/.test(msg)) open("intrari", { onlyNew: true }); }}>{msg}</div>
        )}

        <W key={win.key} ctx={ctx} params={{ ...win.params, method: win.type === "casa" ? "casa" : win.type === "banca" ? "banca" : win.params.method }}
          onClose={close} />
      </div>

      <input ref={invInput} type="file" multiple accept=".xml,.zip" hidden
        onChange={(e) => { const f = [...e.target.files]; e.target.value = "";
          run("Import e-Factura", async () => { const r = await api.importInvoices(f); open("intrari");
            return `Import e-Factura: ${r.added} facturi noi din ${r.parsed}${r.errors.length ? ". Erori: " + r.errors.join("; ") : ""}`; }); }} />
      <input ref={payInput} type="file" accept=".csv" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = "";
          run("Import extras", async () => { const r = await api.importPayments(f); open("banca");
            return `Import extras: ${r.payments} plăți noi${r.skipped ? `, ${r.skipped} existau deja și au fost sărite` : ""}`; }); }} />
    </div>
  );
}
