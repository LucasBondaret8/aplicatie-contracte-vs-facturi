"""Urcă (sau înlocuiește) contractele și facturile demo în Supabase Storage.

Citește SUPABASE_URL și SUPABASE_SECRET_KEY din backend/.env (sau din mediu).
Rulare, din folderul proiectului:  python demo_supabase/upload.py

Cheia secretă are acces total: stă doar în backend/.env, care nu ajunge pe GitHub.
Nu necesită pachete suplimentare.
"""
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV = ROOT.parent / "backend" / ".env"
if ENV.exists():
    for line in ENV.read_text("utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() and not key.lstrip().startswith("#") and value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip('"'))

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
if not URL or not KEY:
    sys.exit("Completează SUPABASE_URL și SUPABASE_SECRET_KEY în backend/.env (vezi backend/.env.example).")

HEADERS = {"apikey": KEY, "x-upsert": "true"}
if not KEY.startswith("sb_"):  # cheile vechi (service_role) sunt JWT și merg și ca Bearer
    HEADERS["Authorization"] = f"Bearer {KEY}"


def incarca(bucket, cale_locala, cale_in_bucket, tip):
    req = urllib.request.Request(f"{URL}/storage/v1/object/{bucket}/{cale_in_bucket}", method="POST",
                                 data=cale_locala.read_bytes(), headers={**HEADERS, "Content-Type": tip})
    try:
        urllib.request.urlopen(req)
        print(f"  OK     {bucket}/{cale_in_bucket}")
        return True
    except urllib.error.HTTPError as e:
        print(f"  EROARE {bucket}/{cale_in_bucket}: {e.code} {e.read().decode()}")
        return False


ok = True
print("Contracte:")
for pdf in sorted((ROOT / "contracte").glob("*.pdf")):
    ok &= incarca("contracte", pdf, pdf.name, "application/pdf")
print("Facturi:")
for xml in sorted((ROOT / "facturi").rglob("*.xml")):
    ok &= incarca("facturi", xml, xml.relative_to(ROOT / "facturi").as_posix(), "application/xml")
sys.exit(0 if ok else 1)
