async function req(method, url, body) {
  const opts = { method };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Eroare ${r.status}`);
  return r.json();
}

function form(field, files) {
  const fd = new FormData();
  for (const f of files) fd.append(field, f);
  return fd;
}

export const api = {
  state: () => req("GET", "/api/state"),
  analysis: () => req("GET", "/api/analysis"),
  extractContract: (file) => req("POST", "/api/contracts/extract", form("file", [file])),
  saveContract: (c) => req("POST", "/api/contracts", c),
  deleteContract: (id) => req("DELETE", `/api/contracts/${id}`),
  importInvoices: (files) => req("POST", "/api/invoices/import", form("files", files)),
  saveManualInvoice: (inv) => req("POST", "/api/invoices/manual", inv),
  setValidated: (id, value) => req("POST", `/api/invoices/${id}/validated`, { value }),
  spvStatus: () => req("GET", "/api/spv/status"),
  spvSync: () => req("POST", "/api/spv/sync"),
  deleteInvoice: (id) => req("DELETE", `/api/invoices/${id}`),
  importPayments: (file) => req("POST", "/api/payments/import", form("file", [file])),
  savePayment: (p) => req("POST", "/api/payments", p),
  deletePayment: (id) => req("DELETE", `/api/payments/${id}`),
  dispute: (id) => req("GET", `/api/invoices/${id}/dispute`),
  loadDemo: () => req("POST", "/api/demo/load"),
  reset: () => req("POST", "/api/reset"),
};

export const lei = (n) =>
  (n ?? 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
