# Date demo din Supabase

Când `backend/.env` are `SUPABASE_URL` și `SUPABASE_KEY`, aplicația ia datele din proiectul Supabase în loc de folderul `demo/`:

- **bucket `facturi`** ține locul SPV-ului: XML-urile de aici „sosesc” la sincronizare, marcate NOU în Intrări;
- **bucket `contracte`**: PDF-urile sunt citite automat (cu Claude dacă există `ANTHROPIC_API_KEY`, altfel fără AI) și devin fișe în Contracte furnizori;
- **plățile** vin din `plati.csv` din acest folder (fiecare factură plătită integral la scadență).

Toate firmele, CUI-urile și sumele sunt **fictive**.

## Ce e în folder

| Fișier | Ce conține |
|---|---|
| `contracte/` | 3 contracte PDF: `telconet.pdf` (telefonie, 5 abonamente, indexare IPC max 5,6%, reînnoire automată), `cleanpro.pdf` (curățenie, preț fix), `softnet.pdf` (20 licențe, reducere 10% până la 31.03.2026, reînnoire automată) |
| `facturi/<furnizor>/` | 12 e-Facturi XML (UBL 2.1 / CIUS-RO) pentru fiecare furnizor, oct. 2025 – sep. 2026 |
| `plati.csv` | plățile, în formatul de import al aplicației |
| `rezultate_asteptate.json` | alertele pe care trebuie să le dea aplicația pentru fiecare factură (verificat de `backend/tests/test_supabase_demo.py`) |
| `setup.sql` | creează bucket-urile și regulile de citire în Supabase (o singură dată, din SQL Editor) |
| `upload.py` | urcă / înlocuiește fișierele în Supabase |
| `generate_demo.py` | regenerează datele (necesită `pip install reportlab`) |

## Nepotrivirile ascunse (12 din 36 de facturi)

| Furnizor | Luni | Alertă în aplicație | Problema |
|---|---|---|---|
| TelcoNet | mar.–sep. 2026 | Preț peste contract | 22,40 lei/abonament, maximul după indexare e 21,12 (+5,6%) |
| TelcoNet | sep. 2026 | Cantitate peste contract | 6 abonamente facturate, contractate 5 |
| CleanPro | iun. 2026 | Preț peste contract | 1.600 lei în loc de 1.450, preț fix |
| SoftNet | ian.–mar. 2026 | Reducerea din contract nu e aplicată | lipsește reducerea de 10% valabilă până la 31.03.2026 |
| SoftNet | aug. 2026 | Linie care nu apare în contract | „Suport premium”, apărută pentru prima dată |

Plus, la contracte: TelcoNet și SoftNet se reînnoiesc automat pe 31.12.2026, iar termenul de denunțare (01.12.2026) e aproape.

## Configurare

1. Copiază `backend/.env.example` ca `backend/.env` și completează cheile (Supabase → **Connect** sau **Project Settings → API Keys**). `backend/.env` nu ajunge pe GitHub.
2. Urcă fișierele (înlocuiește ce e deja în bucket-uri): `python demo_supabase/upload.py`
3. Pornește aplicația și apasă **Date demo**: contractele și facturile vin din Supabase.

## Securitate

- `SUPABASE_KEY` (cheia publică) ajunge pentru aplicație. `SUPABASE_SECRET_KEY` are acces total și e folosită doar de `upload.py`.
- Regulile din `setup.sql` permit citirea cu cheia publică. E acceptabil doar pentru demo cu date fictive.
