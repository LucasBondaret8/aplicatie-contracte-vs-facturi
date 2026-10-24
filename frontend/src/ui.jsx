// Componente de bază: zona de lucru, bare de butoane, grile, ferestre de dialog.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Cancel, Caret, Check, Chevrons, Pencil, Plus, Save, Trash } from "./icons.jsx";

/** Scurtătură ALT + literă (ca în programele de contabilitate). */
export function useAlt(letter, fn, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!letter || !enabled) return;
    const onKey = (e) => {
      if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === letter.toLowerCase() && !document.querySelector(".modal-bg")) {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [letter, enabled]);
}

/** Textul unui buton cu litera de acces subliniată: label="Adaug", alt="A". */
function Accel({ label, alt }) {
  if (!alt) return label;
  const i = label.toLowerCase().indexOf(alt.toLowerCase());
  if (i < 0) return label;
  return <>{label.slice(0, i)}<u>{label[i]}</u>{label.slice(i + 1)}</>;
}

/** Zona de lucru a unui modul. Esc închide. */
export function Window({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector(".modal-bg")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="module">{children}</div>;
}

export function TBtn({ icon, label, alt, onClick, disabled, title, active, className = "" }) {
  useAlt(alt, () => onClick?.(), !!onClick && !disabled);
  return (
    <button className={`tbtn${label ? "" : " icon-only"}${active ? " on" : ""} ${className}`} onClick={onClick} disabled={disabled || !onClick}
      title={title || (alt ? `${label} (ALT + ${alt.toUpperCase()})` : label)}>
      {icon}{label && <span><Accel label={label} alt={alt} /></span>}
    </button>
  );
}

/** Bara „Adaug / Modific / Șterg” de deasupra unei grile. În modul de editare devine „Adaug / Salvez / Renunț”. */
export function LinkBar({ onAdd, onEdit, onDelete, keys = "AMS", tools, right, detalii, editing, detaliiLabel }) {
  return (
    <div className="toolbar">
      <div className="tgroup">
        <TBtn icon={<Plus />} label="Adaug" alt={editing ? null : keys[0]} onClick={editing ? null : onAdd} />
        {editing ? <>
          <TBtn icon={<Save />} label="Salvez" alt="S" onClick={editing.save} className="save" />
          <TBtn icon={<Cancel />} label="Renunț" alt="R" onClick={editing.cancel} />
        </> : <>
          <TBtn icon={<Pencil />} label="Modific" alt={keys[1]} onClick={onEdit} />
          <TBtn icon={<Trash />} label="Șterg" alt={keys[2]} onClick={onDelete} />
        </>}
      </div>
      {tools}
      <span className="grow" />
      {right}
      {detalii && <TBtn icon={<Chevrons />} label={detalii.on ? "Listă" : "Detalii"} onClick={detalii.toggle} />}
    </div>
  );
}

export function Group({ children }) {
  return <div className="tgroup">{children}</div>;
}

/** Butoane-text separate prin bară verticală (ex. „Discount | Serii | ...”). */
export function TextBtns({ items }) {
  return (
    <div className="textbtns">
      {items.map(([label, fn, title], i) => (
        <button key={label} disabled={!fn} onClick={fn} title={title || label}>{label}</button>
      ))}
    </div>
  );
}

export function BottomBar({ children }) {
  return <div className="bottombar">{children}</div>;
}

export function Btn({ children, label, alt, icon, onClick, disabled, title, className = "" }) {
  useAlt(alt, () => onClick?.(), !!onClick && !disabled);
  return (
    <button className={`bbtn ${className}`} onClick={onClick} disabled={disabled} title={title || (alt ? `${label} (ALT + ${alt.toUpperCase()})` : undefined)}>
      {icon}<span>{label ? <Accel label={label} alt={alt} /> : children}</span>
    </button>
  );
}

/** Grilă sortabilă, cu selecție, navigare din săgeți și Ins / Enter / Del. */
export function Grid({ columns, rows, getId = (r) => r.id, selected, onSelect, onOpen, onInsert, onDelete,
  rowClass, defaultSort, empty = "", footer, minRows = 3 }) {
  const [sort, setSort] = useState(defaultSort || null);
  const wrap = useRef();
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = col?.sortValue || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "ro");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  useEffect(() => {
    wrap.current?.querySelector("tr.sel")?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKey = (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; // tastele din câmpurile rândului editat
    const idx = sorted.findIndex((r) => getId(r) === selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = sorted[Math.min(sorted.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) onSelect?.(getId(next));
    } else if (e.key === "Enter" && idx >= 0) onOpen?.(sorted[idx]);
    else if (e.key === "Insert") onInsert?.();
    else if (e.key === "Delete" && idx >= 0) onDelete?.(sorted[idx]);
  };
  const filler = Math.max(0, minRows - sorted.length);

  return (
    <div className="grid-wrap" ref={wrap} tabIndex={0} onKeyDown={onKey}>
      <table className="grid">
        <thead>
          <tr>
            <th className="rowsel" />
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.w, minWidth: c.w }} className={c.align === "r" ? "r" : ""}
                onClick={() => c.label && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "asc" ? "desc" : "asc" }))}>
                {c.label}{sort?.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
            <th className="fill" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const id = getId(r);
            return (
              <tr key={id} className={`${selected === id ? "sel " : ""}${rowClass?.(r) || ""}`}
                onClick={() => onSelect?.(id)} onDoubleClick={() => onOpen?.(r)}>
                <td className="rowsel" />
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === "r" ? "r" : ""}${c.bold ? " b" : ""}${c.cls ? ` col-${c.cls}` : ""}`} title={c.title?.(r)}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
                <td className="fill" />
              </tr>
            );
          })}
          {Array.from({ length: filler }, (_, i) => (
            <tr key={`f${i}`} className="filler">
              <td className="rowsel" />
              {columns.map((c) => <td key={c.key} className={c.cls ? `col-${c.cls}` : ""} />)}
              <td className="fill" />
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot><tr><td className="rowsel" />{columns.map((c) => <td key={c.key} className={c.align === "r" ? "r" : ""}>{footer[c.key] ?? ""}</td>)}<td className="fill" /></tr></tfoot>
        )}
      </table>
      {!sorted.length && empty && <div className="grid-empty">{empty}</div>}
    </div>
  );
}

/** Fereastră de dialog: titlu subliniat, câmpuri, butoane Accept / Renunț jos. Esc = Renunț. */
export function Modal({ title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }}>
        <div className="modal-h">{title}</div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/** Butoanele standard ale unui dialog: Accept (ALT+A) și Renunț (ALT+R). */
export function DialogButtons({ onAccept, onCancel, acceptLabel = "Accept", disabled, extra }) {
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      if (e.key.toLowerCase() === "a" && !disabled) { e.preventDefault(); onAccept(); }
      if (e.key.toLowerCase() === "r") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <>
      {extra}
      <button className="dbtn" onClick={onAccept} disabled={disabled} title="ALT + A"><Check /><span><u>{acceptLabel[0]}</u>{acceptLabel.slice(1)}</span></button>
      <button className="dbtn" onClick={onCancel} title="ALT + R"><Cancel /><span><u>R</u>enunț</span></button>
    </>
  );
}

export function Field({ label, children, wide }) {
  return (
    <label className={`field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Listă derulantă cu căutare, ca în programul de contabilitate: câmp + ▾, sub el un tabel de opțiuni
 * (ex. Denumire · Cod · Cod fiscal), opțiunea activă pe fond închis. Săgeți / Enter / Esc.
 */
export function Combo({ value, onType, onPick, options, placeholder, width = 560, className = "cell-in", autoFocus, cols }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef();
  const [pos, setPos] = useState(null);
  const text = (value || "").toLowerCase();
  const shown = options.filter((o) => !text || o.cols.some((c) => String(c).toLowerCase().includes(text))).slice(0, 50);
  const show = () => {
    const r = ref.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 1 });
    setOpen(true);
  };
  const pick = (o) => { onPick(o); setOpen(false); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) show(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  return (
    <span className="combo" ref={ref}>
      <input className={className} value={value ?? ""} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => { onType(e.target.value); setHi(0); if (!open) show(); }}
        onFocus={show} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey} />
      <button type="button" tabIndex={-1} className="combo-caret" onMouseDown={(e) => { e.preventDefault(); open ? setOpen(false) : (ref.current.querySelector("input").focus(), show()); }}><Caret /></button>
      {open && pos && shown.length > 0 && (
        <div className="combo-list" style={{ left: pos.left, top: pos.top, width }}>
          {cols && <div className="combo-row head">{cols.map((c, i) => <span key={i}>{c}</span>)}</div>}
          {shown.map((o, i) => (
            <div key={o.key} className={`combo-row${i === hi ? " hi" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(i)}>
              {o.cols.map((c, j) => <span key={j}>{c}</span>)}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
