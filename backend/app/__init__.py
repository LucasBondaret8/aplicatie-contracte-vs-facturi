"""Încarcă backend/.env (dacă există) înainte ca modulele să citească variabilele de mediu.

Variabilele setate deja în mediu (de ex. de „Porneste Bill vs Signed.bat”) au prioritate.
"""
import os
from pathlib import Path

_ENV = Path(__file__).resolve().parent.parent / ".env"
if _ENV.exists():
    for _line in _ENV.read_text("utf-8").splitlines():
        _key, _sep, _value = _line.partition("=")
        if _sep and _key.strip() and not _key.lstrip().startswith("#") and _value.strip():
            os.environ.setdefault(_key.strip(), _value.strip().strip('"'))
