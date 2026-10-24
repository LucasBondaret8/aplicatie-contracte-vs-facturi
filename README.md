# Bill vs Signed

Verifică automat facturile recurente primite prin **RO e-Factura** față de **contractul semnat**: preț, indexare, cantitate, TVA, termen de plată, penalități, perioada contractului, dubluri, facturi lipsă, restanțe și plăți în plus. Interfața imită o aplicație contabilă desktop (în stilul SAGA), ca un contabil să lucreze fără să învețe ceva nou.

## Pornire

Ai nevoie de Python 3.12 și Node.js 20 sau mai nou.

```bash
# backend (o singură dată)
pip install fastapi "uvicorn[standard]" python-multipart anthropic pypdf pytest httpx

# backend
cd backend
python -m uvicorn app.main:app --port 8765 --reload

# frontend (în alt terminal)
cd frontend
npm install
npm run dev
```

Deschide http://localhost:5173 și apasă **Date demo**.

Pentru extragerea contractelor cu Claude setează `ANTHROPIC_API_KEY` înainte de a porni backend-ul. Fără cheie se folosește un extractor bazat pe reguli de căutare în text, iar fișa trebuie verificată de om.

`BVS_TODAY=2026-10-24` fixează „data de azi” (util ca demo-ul să arate mereu la fel).

## Interfața

Arată și se folosește ca un program de contabilitate desktop: meniu (Fișiere, Operații, Verificare, Situații - Listări, Declarații, Salarii, Administrare), bară cu iconițe mari, ferestre cu grilă principală + grilă de detaliu, bara „Adaug / Modific / Șterg”, butoane jos (Validez, Plată..., Devalidez, Ieșire), rânduri validate cu lacăt, sortare din capul de coloană, total în subsolul grilei.

Scurtături: Ins – Adaug, Enter / dublu-click – Modific, Del – Șterg, săgeți – navigare, Esc – Ieșire.

| Fereastră | Ce face |
|---|---|
| Intrări | facturile primite din e-Factura, cu liniile, prețul din contract, diferența, contul de cheltuială și panoul „Detalii” cu verificarea; Validez / Devalidez, Plată..., Contestație... |
| Plăți | plăți prin casă / bancă, adăugare manuală sau import extras |
| Furnizori | rulaj, plătit, sold și fișa furnizorului cu sold cumulat |
| Contracte | fișele contractelor (completate de AI din PDF) și facturile lunare pe fiecare contract, inclusiv lunile lipsă |
| Verificare | toate neconcordanțele, cu suma de recuperat |
| Scadențar | datorii neachitate pe intervale de întârziere și riscul de penalități |

Meniurile care nu țin de verificarea facturilor (Clienți, Ieșiri, Note contabile, Declarații, Salarii...) apar dezactivate: ele rămân în programul de contabilitate al clientului. Interfața imită stilul general, nu copiază numele, logo-ul sau iconițele altui produs.

## Cum funcționează

1. **Contract → fișă** (`backend/app/extract.py`): PDF/TXT trimis la Claude cu răspuns JSON structurat (preț, TVA, termen, penalități, indexare, valabilitate). Utilizatorul corectează fișa înainte de salvare.
2. **Facturi** (`backend/app/efactura.py`): XML UBL CIUS-RO sau ZIP descărcat din SPV.
3. **Plăți**: CSV `numar_factura;cui_furnizor;data;suma` (export din registrul de bancă).
4. **Reguli** (`backend/app/rules.py`): deterministe, fără AI, fiecare alertă cu suma de recuperat.
5. **Rezultat**: dashboard, comparație factură ↔ contract, email de contestație, raport CSV pentru Excel.

| Cod | Ce verifică |
|---|---|
| PRICE | preț unitar peste contract (cu indexare IPC plafonată) |
| QUANTITY | cantitate peste cea contractată |
| VAT_RATE / VAT_CALC / TOTAL_CALC | cotă TVA greșită, TVA sau total calculate greșit |
| DUE_DATE | termen de plată mai scurt decât în contract |
| OUT_OF_CONTRACT | perioadă facturată în afara valabilității |
| PENALTY | penalități pe care contractul nu le prevede |
| DUPLICATE / MISSING | aceeași lună facturată de două ori / lună nefacturată |
| OVERDUE / OVERPAID | restanță (cu risc de penalități) / plată în plus |
| NO_CONTRACT | furnizor fără contract |

## Date demo

`python demo/generate_demo.py` regenerează 3 contracte, 30 de facturi și plățile. Erorile intenționate sunt în `ERORI_INTENTIONATE`, iar testele verifică exact acele alerte:

```bash
python -m pytest backend/tests
```

## Pași următori pentru produs

- Descărcare automată din SPV prin API-ul ANAF (OAuth cu certificat digital).
- Import plăți direct din exporturile SAGA (registru bancă / casă) și extrase MT940.
- Mai multe firme pe un cont de contabil; autentificare; bază de date Postgres.
- Curs BNR pentru contractele în EUR.
