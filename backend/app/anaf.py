"""Preluarea automată a facturilor primite din SPV (RO e-Factura).

Două surse, aceeași interfață (`pending_messages` + `download`):

* AnafSource – API-ul real ANAF. Are nevoie de o aplicație înregistrată la ANAF
  (Servicii Online → Înregistrare utilizatori → Dezvoltatori aplicații), de unde vin
  ANAF_CLIENT_ID / ANAF_CLIENT_SECRET / ANAF_REDIRECT_URI (https). Autorizarea o face
  omul, o singură dată, cu certificatul digital pe logincert.anaf.ro.
  NETESTAT încă pe un cont real: adresele și parametrii urmează documentația publică
  și trebuie confirmați la prima conectare.
* SimulatedSource – un „SPV” local pentru demo: fișierele din demo/spv/ sunt facturi
  care „sosesc” la prima sincronizare după încărcarea datelor demo.
* SupabaseSource (supabase.py) – când SUPABASE_URL / SUPABASE_KEY sunt setate, bucket-ul
  `facturi` din Supabase ține locul SPV-ului.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

OAUTH = "https://logincert.anaf.ro/anaf-oauth2/v1"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TOKEN_FILE = DATA_DIR / "anaf_token.json"
DEMO_SPV = Path(__file__).resolve().parents[2] / "demo" / "spv"


class AnafError(RuntimeError):
    pass


def anaf_config() -> dict | None:
    cfg = {k: os.environ.get(f"ANAF_{k.upper()}") for k in ("client_id", "client_secret", "redirect_uri", "cif")}
    cfg["env"] = os.environ.get("ANAF_ENV", "test")  # test | prod
    return cfg if cfg["client_id"] and cfg["client_secret"] and cfg["redirect_uri"] else None


class AnafSource:
    name = "anaf"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.api = f"https://api.anaf.ro/{cfg['env']}/FCTEL/rest"

    # --- OAuth ---
    def authorize_url(self) -> str:
        return f"{OAUTH}/authorize?" + urlencode({
            "response_type": "code", "client_id": self.cfg["client_id"],
            "redirect_uri": self.cfg["redirect_uri"], "token_content_type": "jwt"})

    def exchange_code(self, code: str):
        self._token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": self.cfg["redirect_uri"]})

    def _token_request(self, form: dict):
        form |= {"client_id": self.cfg["client_id"], "client_secret": self.cfg["client_secret"], "token_content_type": "jwt"}
        r = httpx.post(f"{OAUTH}/token", data=form, timeout=30)
        if r.status_code != 200:
            raise AnafError(f"ANAF token: HTTP {r.status_code} {r.text[:200]}")
        tok = r.json()
        tok["obtained_at"] = time.time()
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(json.dumps(tok), "utf-8")

    @staticmethod
    def connected() -> bool:
        return TOKEN_FILE.exists()

    def _access_token(self) -> str:
        if not TOKEN_FILE.exists():
            raise AnafError("Aplicația nu e conectată la SPV. Autorizează-o cu certificatul digital.")
        tok = json.loads(TOKEN_FILE.read_text("utf-8"))
        if time.time() > tok["obtained_at"] + tok.get("expires_in", 0) - 300 and tok.get("refresh_token"):
            self._token_request({"grant_type": "refresh_token", "refresh_token": tok["refresh_token"]})
            tok = json.loads(TOKEN_FILE.read_text("utf-8"))
        return tok["access_token"]

    def _get(self, path: str, params: dict) -> httpx.Response:
        r = httpx.get(f"{self.api}/{path}", params=params, timeout=60,
                      headers={"Authorization": f"Bearer {self._access_token()}"})
        if r.status_code != 200:
            raise AnafError(f"ANAF {path}: HTTP {r.status_code} {r.text[:200]}")
        return r

    # --- mesaje ---
    def pending_messages(self, seen: set[str], days: int = 60) -> list[dict]:
        """Facturile primite (filtru P) din ultimele `days` zile, încă nedescărcate."""
        if not self.cfg.get("cif"):
            raise AnafError("Lipsește ANAF_CIF (codul fiscal al firmei, fără RO).")
        data = self._get("listaMesajeFactura", {"zile": days, "cif": self.cfg["cif"], "filtru": "P"}).json()
        if data.get("eroare"):
            # ANAF răspunde cu „eroare” și când pur și simplu nu sunt mesaje în interval
            if "nu exista mesaje" in data["eroare"].lower():
                return []
            raise AnafError(data["eroare"])
        return [{"id": str(m["id"]), "label": m.get("detalii", "")} for m in data.get("mesaje", []) if str(m["id"]) not in seen]

    def download(self, msg: dict) -> tuple[bytes, str]:
        return self._get("descarcare", {"id": msg["id"]}).content, f"{msg['id']}.zip"


class SimulatedSource:
    name = "simulat"

    def pending_messages(self, seen: set[str], days: int = 60) -> list[dict]:
        files = sorted(DEMO_SPV.glob("*.xml")) if DEMO_SPV.exists() else []
        return [{"id": p.stem, "label": p.name} for p in files if p.stem not in seen]

    def download(self, msg: dict) -> tuple[bytes, str]:
        p = DEMO_SPV / f"{msg['id']}.xml"
        return p.read_bytes(), p.name


def current_source():
    from . import supabase

    cfg = anaf_config()
    if cfg:
        return AnafSource(cfg)
    return supabase.SupabaseSource() if supabase.configured() else SimulatedSource()
