"""Supabase Storage ca sursă de date: contractele PDF și facturile XML din bucket-urile proiectului.

* bucket `facturi`   – XML-urile e-Factura (în demo ține locul SPV-ului: ce apare aici „sosește” la sincronizare)
* bucket `contracte` – contractele PDF / TXT, din care AI-ul completează fișa contractului

Configurare (backend/.env): SUPABASE_URL și SUPABASE_KEY. Pentru citire ajunge cheia publică
(publishable / anon), dacă bucket-urile au regula de citire din setup.sql.
"""
from __future__ import annotations

import os

import httpx

INVOICES_BUCKET = os.environ.get("SUPABASE_INVOICES_BUCKET", "facturi")
CONTRACTS_BUCKET = os.environ.get("SUPABASE_CONTRACTS_BUCKET", "contracte")


class SupabaseError(RuntimeError):
    pass


def configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_KEY"))


def _base_headers() -> dict:
    key = os.environ["SUPABASE_KEY"]
    headers = {"apikey": key}
    if not key.startswith("sb_"):  # cheile noi (sb_publishable_ / sb_secret_) nu sunt JWT: merg doar în `apikey`
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _url(path: str) -> str:
    return f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1/{path}"


def list_files(bucket: str, prefix: str = "") -> list[str]:
    """Toate fișierele din bucket (inclusiv din subfoldere), ca nume complete: `telconet/2026-01.xml`."""
    r = httpx.post(_url(f"object/list/{bucket}"), headers=_base_headers(), timeout=30,
                   json={"prefix": prefix, "limit": 1000, "sortBy": {"column": "name", "order": "asc"}})
    if r.status_code != 200:
        raise SupabaseError(f"Supabase {bucket}: HTTP {r.status_code} {r.text[:200]}")
    out = []
    for item in r.json():
        name = f"{prefix}{item['name']}"
        if item.get("id") is None:  # folder
            out += list_files(bucket, f"{name}/")
        elif not item["name"].startswith("."):  # .emptyFolderPlaceholder creat de dashboard
            out.append(name)
    return out


def download(bucket: str, name: str) -> bytes:
    r = httpx.get(_url(f"object/authenticated/{bucket}/{name}"), headers=_base_headers(), timeout=60)
    if r.status_code != 200:
        raise SupabaseError(f"Supabase {bucket}/{name}: HTTP {r.status_code} {r.text[:200]}")
    return r.content


class SupabaseSource:
    """Aceeași interfață ca sursele SPV din anaf.py: facturile din bucket-ul `facturi` sosesc ca din SPV."""
    name = "supabase"

    def pending_messages(self, seen: set[str], days: int = 60) -> list[dict]:
        try:
            files = list_files(INVOICES_BUCKET)
        except httpx.HTTPError as e:
            raise SupabaseError(f"Supabase indisponibil: {e}") from e
        return [{"id": f, "label": f} for f in files if f.lower().endswith((".xml", ".zip")) and f not in seen]

    def download(self, msg: dict) -> tuple[bytes, str]:
        return download(INVOICES_BUCKET, msg["id"]), msg["id"].rsplit("/", 1)[-1]
