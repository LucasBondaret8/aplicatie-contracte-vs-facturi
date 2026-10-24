# Bill vs Signed

Răspunde la întrebarea din challenge: **furnizorul a livrat și a facturat ce s-a semnat, lună de lună?** Pune cap la cap contractul (ce s-a promis), facturile din **RO e-Factura** și plățile (ce s-a cerut și ce s-a plătit) și confirmările de livrare (ce s-a primit efectiv). Verifică prețul, indexarea, reducerile, cantitatea, TVA-ul, termenul de plată, penalitățile, perioada contractului cu reînnoirile automate, dublurile, facturile lipsă, ce s-a livrat, licențele folosite, restanțele și plățile în plus. Interfața imită programul de contabilitate (stil SAGA), ca un contabil să lucreze fără să învețe ceva nou.

## Pornire

**Dintr-un click (Windows):** dublu-click pe `Porneste Bill vs Signed.bat`. Prima dată instalează pachetele (câteva minute), apoi pornește serverul și interfața în două ferestre minimizate, încarcă datele demo dacă nu există date și deschide browserul la http://localhost:5173. Închiderea celor două ferestre „Bill vs Signed” oprește aplicația. Fișierul fixează data de lucru la 24.10.2026 (ca demo-ul să arate mereu la fel) și sincronizarea SPV la 2 minute.

**Manual:** ai nevoie de Python 3.12 și Node.js 20 sau mai nou.

```bash
# backend (o singură dată)
pip install -r backend/requirements.txt

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
   - **Supabase:** cu `SUPABASE_URL` și `SUPABASE_KEY` în `backend/.env`, bucket-ul `facturi` ține locul SPV-ului, iar contractele PDF din bucket-ul `contracte` sunt citite automat. Vezi `demo_supabase/README.md`.
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
| Intrări | facturile primite (SPV / manual / import), liniile cu prețul din contract și diferența; „Detalii” lângă grila de sus: plățile facturii + verificarea față de contract; Validez / Plată / Devalidez / Contestație |
| Furnizori | o grilă (Cod, Denumire, Cod fiscal, Cont analitic 401.xxxxx, Țara, Județ, Localitate, Adresă, Cont bancar) + sold și verificare; Adaug / Modific direct în grilă |
| Situație furnizori | perioadă (de la / până la / lună / an) și tab-urile Situație generală, Facturi - furnizor (cu plățile fiecărei facturi), Scadențar (și pe intervale, ALT+S) |
| Jurnal de bancă / Registru de casă | zilele cu sold inițial, încasări, plăți, sold final; operațiile zilei (401.xxxxx / 5121 sau 5311, „Achit. FURNIZOR nr.: X”) |
| Plată | dialogul Data, Cont plată, Reține ca implicit, Suma plătită, Nr. doc plată; Accept (ALT+A) / Renunț (ALT+R) |
| Contracte furnizori | fișa contractului (completată din PDF, în română sau engleză: preț, indexare, reducere, reînnoire automată și preaviz, licențe); pe fiecare contract: facturile lunare cu ce s-a livrat, **istoricul prețului** (grafic facturat vs. contract) și livrările confirmate; alertele de reînnoire / expirare |
| Confirmare livrări | pentru o lună, ce s-a primit efectiv pe fiecare contract (livrat / parțial / nelivrat, cantitate sau licențe folosite, document); ALT+L / ALT+P / ALT+N; factura se reverifică pe loc |
| Verificare | toate neconcordanțele, cu suma de recuperat |

**Toate opțiunile din meniu funcționează:**
- *Fișiere*: Furnizori, Plan conturi (cu analiticele 401.xxxxx), Articole (din liniile facturilor), Tipuri de articole; Clienți, Agenți, Gestiuni, Grupe, Filiale, Salariați – liste editabile în grilă.
- *Operații*: Intrări, e-Facturi (SPV), Registru de casă, Jurnal de bancă, **Articole contabile** (generate automat: `% = 401.xxxxx` pentru facturi cu 6xx / 4426, `401.xxxxx = 5121 / 5311` pentru plăți), **Închidere lună** (ce mai e de rezolvat + validarea facturilor corecte).
- *Situații*: **Fișe conturi, Balanțe** (sintetică / analitică, debit = credit), **Carte mare, Registru jurnal, Jurnal de cumpărări** (baze și TVA pe cote), Situație furnizori, Situație aprovizionări, Fișe articole, raport neconcordanțe.
- *Diverse*: Contracte furnizori, Confirmare livrări, Verificare, Import date, Acționari, Mașini.
- *Administrare*: Date firmă, Numere și serii, Utilizatori, **Salvare / restaurare** (fișier .json), ștergere date.
- Operațiile din contabilitatea completă care nu țin de facturile primite (Ieșiri, salarii, declarații D406/D205/Intrastat, producție, stocuri, imobilizări, deconturi) deschid un ecran care explică faptul că se fac în programul de contabilitate.
- **Interval** (sus): de la începutul anului până în *prezent*, luna curentă, luna trecută, anul trecut sau toate datele; se aplică în Intrări și în situații.

Contabilitatea calculată aici e partea de cumpărări (facturi primite și plăți). Interfața imită stilul general, nu copiază numele, logo-ul sau iconițele altui produs.

## Cum funcționează

1. **Contract → fișă** (`backend/app/extract.py`): PDF/TXT trimis la Claude cu răspuns JSON structurat (preț, TVA, termen, penalități, indexare, valabilitate). Utilizatorul corectează fișa înainte de salvare.
2. **Facturi** (`backend/app/efactura.py`): XML UBL CIUS-RO sau ZIP descărcat din SPV.
3. **Plăți**: CSV `numar_factura;cui_furnizor;data;suma[;metoda]` (metoda: banca / casa) (export din registrul de bancă).
4. **Reguli** (`backend/app/rules.py`): deterministe, fără AI, fiecare alertă cu suma de recuperat.
5. **Rezultat**: dashboard, comparație factură ↔ contract, email de contestație, raport CSV pentru Excel.

| Cod | Ce verifică | Ce spune challenge-ul |
|---|---|---|
| PRICE | preț unitar peste contract (cu indexare IPC plafonată) | „prices go up by indexation” |
| DISCOUNT_MISSING | reducerea din contract nu mai apare pe factură | „a discount quietly disappears” |
| OUT_OF_CONTRACT / RENEWAL_NOTICE / RENEWAL_LOCKED / EXPIRING | factură după expirare (ținând cont de reînnoirea automată); termen de denunțare apropiat sau trecut; contract care expiră | „contracts renew automatically” |
| NOT_DELIVERED / UNDER_DELIVERED / PARTIAL_DELIVERY | facturat dar nelivrat; facturat mai mult decât s-a primit (din confirmările de livrare) | „a service stops being delivered”, „delivery evidence” |
| UNUSED_LICENSES | licențe plătite față de licențe folosite (economie posibilă, separată de sumele de recuperat) | licențele SaaS nefolosite |
| QUANTITY | cantitate peste cea contractată | |
| VAT_RATE / VAT_CALC / TOTAL_CALC | cotă TVA greșită, TVA sau total calculate greșit | |
| DUE_DATE | termen de plată mai scurt decât în contract | |
| PENALTY | penalități pe care contractul nu le prevede | |
| DUPLICATE / MISSING | aceeași lună facturată de două ori / lună nefacturată | |
| OVERDUE / OVERPAID | restanță (cu risc de penalități) / plată în plus | |
| NO_CONTRACT | furnizor fără contract | |
| NEW_LINE | linie care apare pentru prima dată pe facturile unui contract (serviciu neprevăzut, fără act adițional) | „did the other side actually charge what we agreed” |

Prețurile se compară după reducerile de la nivelul facturii (AllowanceCharge pe document), ca un discount pus pe factură, nu pe linie, să nu dea alarme false.

## Date demo

`python demo/generate_demo.py` regenerează 5 contracte (chirie, IT, curățenie, telefonie cu reducere, licențe CRM cu contract în engleză și reînnoire automată), 45 de facturi deja preluate + 5 care sosesc din SPV-ul simulat, plățile și confirmările de livrare. Erorile intenționate sunt în `ERORI_INTENTIONATE`, iar testele verifică exact acele alerte:

```bash
python -m pytest backend/tests
```

## Pași următori pentru produs

- Testarea conectorului ANAF pe un cont real (mediul de test ANAF, apoi producție).
- Import plăți direct din exporturile SAGA (registru bancă / casă) și extrase MT940.
- Mai multe firme pe un cont de contabil; autentificare; bază de date Postgres.
- Curs BNR pentru contractele în EUR.
