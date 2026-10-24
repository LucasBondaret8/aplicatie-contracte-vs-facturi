// Iconițe proprii, desenate simplu (nu sunt preluate din alt program).
import React from "react";

const S = ({ size = 16, children, vb = 16 }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} aria-hidden="true">{children}</svg>
);

export const Lock = () => (
  <S size={12}>
    <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="#7a1010" strokeWidth="1.6" />
    <rect x="3.5" y="7" width="9" height="7" rx="1" fill="#c62828" stroke="#7a1010" />
  </S>
);
export const Dot = ({ status }) => (
  <S size={12}><circle cx="8" cy="8" r="5" fill={{ ok: "#2e8b3a", warning: "#e0a000", error: "#d32f2f" }[status] || "#bbb"} stroke="#0003" /></S>
);
export const Find = () => (
  <S><circle cx="6.5" cy="6.5" r="4" fill="#e8f1fb" stroke="#3b5e8c" strokeWidth="1.5" /><path d="M9.5 9.5l4.5 4.5" stroke="#3b5e8c" strokeWidth="2" /></S>
);
export const Excel = () => (
  <S><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="#1e7b45" /><path d="M5 4.5l6 7M11 4.5l-6 7" stroke="#fff" strokeWidth="1.7" /></S>
);
export const Printer = () => (
  <S><rect x="4" y="1.5" width="8" height="4" fill="#fff" stroke="#555" /><rect x="1.5" y="5.5" width="13" height="6" rx="1" fill="#9aa7b8" stroke="#555" /><rect x="4" y="9.5" width="8" height="5" fill="#fff" stroke="#555" /></S>
);
export const Refresh = () => (
  <S><path d="M13 8a5 5 0 1 1-1.5-3.6" fill="none" stroke="#2c6db5" strokeWidth="1.8" /><path d="M12.5 1.5v3.5H9" fill="none" stroke="#2c6db5" strokeWidth="1.8" /></S>
);
export const Filter = () => (
  <S><path d="M1.5 2.5h13l-5 6v5l-3 1.5v-6.5z" fill="#f4d35e" stroke="#8a6d00" /></S>
);

// iconițe mari pentru bara principală
const B = ({ children }) => <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">{children}</svg>;
export const Big = {
  furnizori: () => (
    <B><circle cx="12" cy="10" r="5" fill="#f2c18d" stroke="#8a5a2b" /><path d="M3 27c1-7 5-10 9-10s8 3 9 10z" fill="#3d6fb6" stroke="#22457a" />
      <rect x="18" y="15" width="11" height="13" rx="1" fill="#fff" stroke="#555" /><path d="M20 19h7M20 22h7M20 25h5" stroke="#888" /></B>
  ),
  intrari: () => (
    <B><rect x="6" y="3" width="18" height="24" fill="#fff" stroke="#555" /><path d="M9 8h12M9 12h12M9 16h8" stroke="#999" />
      <path d="M2 21h11" stroke="#2e8b3a" strokeWidth="3" /><path d="M10 16l5 5-5 5z" fill="#2e8b3a" /><text x="17" y="25" fontSize="7" fill="#c62828" fontWeight="bold">lei</text></B>
  ),
  plati: () => (
    <B><rect x="2" y="9" width="28" height="16" rx="2" fill="#7cb342" stroke="#33691e" /><circle cx="16" cy="17" r="5" fill="#c5e1a5" stroke="#33691e" />
      <text x="13.5" y="20" fontSize="8" fill="#33691e" fontWeight="bold">$</text></B>
  ),
  contracte: () => (
    <B><rect x="6" y="2" width="20" height="27" fill="#fffbe6" stroke="#8a6d00" /><path d="M10 7h12M10 11h12M10 15h12M10 19h7" stroke="#b39a4a" />
      <path d="M11 25c2-3 3 1 5-2s3 2 6-1" fill="none" stroke="#1a3d8f" strokeWidth="1.5" /></B>
  ),
  verificare: () => (
    <B><rect x="4" y="3" width="17" height="23" fill="#fff" stroke="#555" /><path d="M7 8h11M7 12h11M7 16h7" stroke="#999" />
      <circle cx="21" cy="21" r="7" fill="#e3f2e5" stroke="#2e8b3a" strokeWidth="2" /><path d="M17.5 21l2.5 2.5 4.5-5" fill="none" stroke="#2e8b3a" strokeWidth="2.2" /></B>
  ),
  scadentar: () => (
    <B><rect x="3" y="5" width="26" height="23" rx="2" fill="#fff" stroke="#555" /><rect x="3" y="5" width="26" height="6" fill="#d32f2f" />
      <path d="M8 2v6M24 2v6" stroke="#555" strokeWidth="2" /><path d="M7 15h4M14 15h4M21 15h4M7 20h4M14 20h4M21 20h4" stroke="#999" strokeWidth="2" /></B>
  ),
  raport: () => (
    <B><rect x="4" y="3" width="24" height="26" fill="#fff" stroke="#555" /><rect x="8" y="17" width="4" height="8" fill="#3d6fb6" />
      <rect x="14" y="12" width="4" height="13" fill="#2e8b3a" /><rect x="20" y="8" width="4" height="17" fill="#e0a000" /></B>
  ),
  iesire: () => (
    <B><rect x="5" y="3" width="15" height="26" fill="#d7ccc8" stroke="#5d4037" /><path d="M14 16h14" stroke="#c62828" strokeWidth="3" /><path d="M24 11l5 5-5 5z" fill="#c62828" /></B>
  ),
};
