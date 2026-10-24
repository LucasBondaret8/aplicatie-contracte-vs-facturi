// Componente de bază în stilul aplicațiilor contabile desktop: ferestre, grile, bare de butoane.
import React, { useEffect, useMemo, useRef, useState } from "react";

export function Window({ title, icon, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector(".modal-bg")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="win">
      <div className="win-title">
        {icon && <span className="win-icon">{icon}</span>}
        <span>{title}</span>
        <span className="win-ctrls">
          <button title="Minimizare" disabled>_</button>
          <button title="Maximizare" disabled>□</button>
          <button className="close" title="Închide (Esc)" onClick={onClose}>✕</button>
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  );
}

/** Bară de tip „Adaug  Modific  Șterg | iconițe … Detalii” deasupra unei grile. */
export function LinkBar({ onAdd, onEdit, onDelete, addLabel = "Adaug", tools, right }) {
  return (
    <div className="linkbar">
      <button className="lnk" disabled={!onAdd} onClick={onAdd} title="Ins"><u>A</u>{addLabel.slice(1)}</button>
      <button className="lnk" disabled={!onEdit} onClick={onEdit} title="Enter"><u>M</u>odific</button>
      <button className="lnk" disabled={!onDelete} onClick={onDelete} title="Del"><u>Ș</u>terg</button>
      <span className="lb-sep" />
      {tools}
      <span className="lb-right">{right}</span>
    </div>
  );
}

export function IconBtn({ title, onClick, children, disabled }) {
  return <button className="ibtn" title={title} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function BottomBar({ children }) {
  return <div className="bottombar">{children}</div>;
}

export function Btn({ children, onClick, disabled, title, icon, className = "" }) {
  return (
    <button className={`wbtn ${className}`} onClick={onClick} disabled={disabled} title={title}>
      {icon}<span>{children}</span>
    </button>
  );
}

/** Grilă sortabilă, cu selecție, navigare din săgeți și Ins/Enter/Del. */
export function Grid({ columns, rows, getId = (r) => r.id, selected, onSelect, onOpen, onInsert, onDelete,
  rowClass, defaultSort, empty = "Nu există înregistrări.", footer }) {
  const [sort, setSort] = useState(defaultSort || null); // {key, dir}
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
    const el = wrap.current?.querySelector("tr.selected");
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKey = (e) => {
    const idx = sorted.findIndex((r) => getId(r) === selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = sorted[Math.min(sorted.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) onSelect?.(getId(next));
    } else if (e.key === "Enter" && idx >= 0) onOpen?.(sorted[idx]);
    else if (e.key === "Insert") onInsert?.();
    else if (e.key === "Delete" && idx >= 0) onDelete?.(sorted[idx]);
  };

  return (
    <div className="grid-wrap" ref={wrap} tabIndex={0} onKeyDown={onKey}>
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.w, minWidth: c.w }} className={c.align === "r" ? "r" : ""}
                onClick={() => c.label && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "asc" ? "desc" : "asc" }))}>
                {c.label}{sort?.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const id = getId(r);
            return (
              <tr key={id} className={`${selected === id ? "selected " : ""}${rowClass?.(r) || ""}`}
                onClick={() => onSelect?.(id)} onDoubleClick={() => onOpen?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === "r" ? "r" : ""}${c.bold ? " b" : ""}`} title={c.title?.(r)}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
          {!sorted.length && <tr className="empty-row"><td colSpan={columns.length}>{empty}</td></tr>}
        </tbody>
        {footer && <tfoot><tr>{columns.map((c) => <td key={c.key} className={c.align === "r" ? "r" : ""}>{footer[c.key] ?? ""}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg">
      <div className="modal" style={{ width }}>
        <div className="win-title">
          <span>{title}</span>
          <span className="win-ctrls"><button className="close" onClick={onClose}>✕</button></span>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
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
