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

## De unde vin facturile

1. **Automat din SPV (RO e-Factura).** Serverul verifică singur SPV-ul la fiecare `BVS_SYNC_MINUTES` minute (implicit 60), descarcă facturile primite noi și le verifică pe loc față de contracte. Ele apar în Intrări marcate **NOU**, iar sus scrie „SPV: sincronizat 14:05 · 3 NOI” (click = sincronizează acum). **Validez** scoate factura din lista celor noi.
   - **Demo (fără ANAF):** sursa e un SPV simulat, folderul `demo/spv/`. După „Date demo”, facturile din octombrie sosesc la prima sincronizare (pornește backend-ul cu `BVS_SYNC_MINUTES=2` ca să se vadă la demo).
   - **Real:** înregistrează aplicația la ANAF (Servicii Online → Înregistrare utilizatori → Dezvoltatori aplicații, cu certificat digital calificat) și pornește backend-ul cu `ANAF_CLIENT_ID`, `ANAF_CLIENT_SECRET`, `ANAF_REDIRECT_URI` (https, terminată în `/api/anaf/callback`), `ANAF_CIF` și `ANAF_ENV=test|prod`. Apoi deschide `/api/anaf/connect` și autentifică-te o dată cu certificatul. Conectorul (`backend/app/anaf.py`) **nu a fost încă testat pe un cont ANAF real**.
2. **De mână, direct în grilă.** Adaug (ALT+A) în Intrări deschide un rând nou editabil: Nr. doc., furnizor (din listă sau scris nou), data, scadența. Când alegi un furnizor cu contract, scadența și linia (denumire, UM, cantitate, preț, TVA) se completează din contract, iar „Preț contract / Diferență” se văd cât scrii. Liniile: Adaug (ALT+D) / Șterg (ALT+T) în grila de jos. **Salvez** (ALT+S) verifică factura față de contract, **Renunț** (ALT+R) anulează. Pentru furnizori externi, chitanțe sau facturi urgente. Dacă aceeași factură (furnizor + număr) sosește apoi din SPV, o înlocuiește pe cea manuală.
3. **Din fișiere:** iconița de folder din Intrări importă XML / ZIP descărcate de mână.

## Interfața

Arată și se folosește ca programele de contabilitate web cu care lucrează contabilii: bară laterală cu numele modulului, meniu Fișiere / Operații / Situații / Diverse / Administrare cu aceeași structură, grilă principală + grilă de detaliu cu antet gri, coloane de valori gri și „Neachitat” roz, rândul selectat albastru, rânduri validate cu lacăt, rând de filtre sub grilă, bara „Adaug / Modific / Șterg” și butoanele de jos (Validez, Plată, Stornez, N.C., Tipărire, Devalidez).

Scurtături:
- ALT+1 Furnizori, ALT+3 Intrări, ALT+5 Registru de casă, ALT+6 Jurnal de bancă, ALT+9 Contracte furnizori, ALT+0 Verificare
- ALT+A / M / S – Adaug / Modific / Șterg în grila de sus; ALT+V Validez, ALT+P Plată, ALT+D Devalidez, ALT+E Tipărire
- Ins, Enter / dublu-click, Del, săgeți; Esc revine la Intrări

| Fereastră | Ce face |
|---|---|
| Intrări | facturile primite din e-Factura, cu liniile, prețul din contract, diferența, contul de cheltuială și panoul „Detalii” cu verificarea; Validez / Devalidez, Plată..., Contestație... |
| Jurnal de bancă / Registru de casă | zilele cu plăți sus, operațiile zilei jos (401 / 5121 sau 5311); adăugare manuală sau import extras |
| Furnizori | rulaj, plătit, sold și fișa furnizorului cu sold cumulat |
| Contracte | fișele contractelor (completate de AI din PDF) și facturile lunare pe fiecare contract, inclusiv lunile lipsă |
| Verificare | toate neconcordanțele, cu suma de recuperat |
| Scadențar | datorii neachitate pe intervale de întârziere și riscul de penalități |

Meniurile care nu țin de verificarea facturilor (Clienți, Ieșiri, Note contabile, Declarații, Salarii...) apar dezactivate: ele rămân în programul de contabilitate al clientului. Interfața imită stilul general, nu copiază numele, logo-ul sau iconițele altui produs.

## Cum funcționează

1. **Contract → fișă** (`backend/app/extract.py`): PDF/TXT trimis la Claude cu răspuns JSON structurat (preț, TVA, termen, penalități, indexare, valabilitate). Utilizatorul corectează fișa înainte de salvare.
2. **Facturi** (`backend/app/efactura.py`): XML UBL CIUS-RO sau ZIP descărcat din SPV.
3. **Plăți**: CSV `numar_factura;cui_furnizor;data;suma[;metoda]` (metoda: banca / casa) (export din registrul de bancă).
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

`python demo/generate_demo.py` regenerează 3 contracte, 28 de facturi deja preluate + 3 care sosesc din SPV-ul simulat și plățile. Erorile intenționate sunt în `ERORI_INTENTIONATE`, iar testele verifică exact acele alerte:

```bash
python -m pytest backend/tests
```

## Pași următori pentru produs

- Testarea conectorului ANAF pe un cont real (mediul de test ANAF, apoi producție).
- Import plăți direct din exporturile SAGA (registru bancă / casă) și extrase MT940.
- Mai multe firme pe un cont de contabil; autentificare; bază de date Postgres.
- Curs BNR pentru contractele în EUR.
