// Iconițe proprii, desenate simplu, în culoarea textului (currentColor).
import React from "react";

const I = ({ children, size = 12, vb = 16, title }) => (
  <svg className="ico" width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={!title}>{title && <title>{title}</title>}{children}</svg>
);

export const Plus = () => <I><path d="M8 2.5v11M2.5 8h11" strokeWidth="2.2" /></I>;
export const Pencil = () => <I><path d="M3 13l1-3.5L11 2.5l2.5 2.5-7 7z" /><path d="M9.5 4l2.5 2.5" /></I>;
export const Save = () => <I><path d="M2.5 2.5h9l2 2v9h-11z" /><path d="M5 2.5v3.5h5V2.5M5 13.5V9.5h6v4" /></I>;
export const Cancel = () => <I><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeWidth="2.2" /></I>;
export const Trash =() => <I><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.8 9h6.4l.8-9" /></I>;
export const Copy = () => <I><rect x="5" y="5" width="8.5" height="8.5" rx="1" /><path d="M3 10.5V3a.5.5 0 0 1 .5-.5H10" /></I>;
export const Paste = () => <I><rect x="3" y="3" width="10" height="11" rx="1" /><path d="M6 2h4v2.5H6z" /></I>;
export const ExportI = () => <I><path d="M2.5 3h7v10h-7z" /><path d="M8 8h6M11.5 5.5L14 8l-2.5 2.5" /></I>;
export const Search = () => <I><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2l3.5 3.5" strokeWidth="2.2" /></I>;
export const FilterI = () => <I><path d="M2 3h12L9.5 8.5V13l-3-1.5v-3z" fill="currentColor" stroke="none" /></I>;
export const Folder = () => <I><path d="M1.8 4.5h4.5l1.2 1.5h6.7v7.5H1.8z" fill="currentColor" stroke="none" /></I>;
export const Print = () => <I><path d="M4.5 6V2.5h7V6M4.5 11H2.5V6h11v5h-2" /><path d="M4.5 9h7v4.5h-7z" /></I>;
export const Sync = () => <I><path d="M13 6.5A5 5 0 0 0 4 4.5L2.5 6M3 9.5A5 5 0 0 0 12 11.5l1.5-1.5" /><path d="M2.5 2.5V6H6M13.5 13.5V10H10" /></I>;
export const Lock = () => <I><rect x="3.5" y="7" width="9" height="7" rx="1" fill="currentColor" stroke="none" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></I>;
export const Unlock = () => <I><rect x="3.5" y="7" width="9" height="7" rx="1" fill="currentColor" stroke="none" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" /></I>;
export const Tag = () => <I><path d="M2 8.5V2.5h6l6 6-6 6z" fill="currentColor" stroke="none" /><circle cx="5" cy="5.5" r="1.1" fill="#fff" stroke="none" /></I>;
export const Arrows = () => <I><path d="M2 5h11M10.5 2.5L13 5l-2.5 2.5M14 11H3M5.5 8.5L3 11l2.5 2.5" /></I>;
export const Doc = () => <I><path d="M3.5 1.8h6l3 3v9.4h-9z" /><path d="M9.5 1.8v3h3" /></I>;
export const Gavel = () => <I><path d="M7 2.5l4 4M5 4.5l4 4M6 3.5l-2 2 4 4 2-2zM8.5 8l5 5" /></I>;
export const Chevrons = () => <I><path d="M3 4l4 4-4 4M8.5 4l4 4-4 4" /></I>;
export const Bell = () => <I><path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14h3" fill="currentColor" /></I>;
export const Logout = () => <I><path d="M6.5 2.5h-4v11h4M10 5l3 3-3 3M13 8H6" /></I>;
export const Book = () => <I size={14}><path d="M1.5 3c2.5-1 4.5-.5 6.5 1 2-1.5 4-2 6.5-1v10c-2.5-1-4.5-.5-6.5 1-2-1.5-4-2-6.5-1z" fill="currentColor" stroke="none" /><path d="M8 4v10" stroke="#fff" strokeWidth="1" /></I>;
export const Contrast = () => <I size={14}><path d="M1.5 14.5V1.5h13z" fill="currentColor" stroke="none" /><path d="M1.5 14.5h13V1.5" /></I>;
export const Check = () => <I><path d="M2.5 8.5l3.5 3.5 7.5-8" strokeWidth="2.2" /></I>;
export const Mail = () => <I><rect x="1.8" y="3.5" width="12.4" height="9" rx="1" /><path d="M2 4l6 5 6-5" /></I>;
export const Warn = () => <I><path d="M8 1.5L15 14H1z" fill="currentColor" stroke="none" /><path d="M8 6v3.5M8 11.5v.2" stroke="#fff" strokeWidth="1.6" /></I>;
export const Caret = () => <svg className="caret" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M0 2h8L4 6.5z" fill="currentColor" /></svg>;

export const Dot = ({ status }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <circle cx="5" cy="5" r="4" fill={{ ok: "#2e9d55", warning: "#e7a100", error: "#e0383e" }[status] || "#bbb"} />
  </svg>
);

/** Sigla aplicației (proprie). */
export const Logo = () => (
  <svg width="58" height="18" viewBox="0 0 58 18" aria-label="Bill vs Signed">
    <rect x="0" y="1" width="16" height="16" rx="3" fill="#0373a1" />
    <path d="M4 9.5l2.8 2.8L12 6.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <text x="20" y="13.5" fontFamily="Open Sans, Segoe UI, sans-serif" fontWeight="800" fontSize="12" fill="#0373a1" letterSpacing=".5">BvS</text>
  </svg>
);
