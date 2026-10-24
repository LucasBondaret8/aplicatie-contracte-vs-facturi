@echo off
rem Porneste aplicatia Bill vs Signed dintr-un click: serverul (backend), interfata (frontend) si browserul.
rem Prima pornire instaleaza pachetele (cateva minute). Inchiderea celor doua ferestre minimizate opreste aplicatia.
setlocal
cd /d "%~dp0"
title Bill vs Signed

rem --- Python: cel instalat, nu scurtatura din Microsoft Store ---
set "PY="
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do if exist "%%D\python.exe" set PY="%%D\python.exe"
if not defined PY (
  where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
  echo Nu am gasit Python 3. Instaleaza-l de pe https://www.python.org/downloads/ si porneste din nou.
  pause
  exit /b 1
)
where npm >nul 2>nul || (
  echo Nu am gasit Node.js. Instaleaza-l de pe https://nodejs.org/ si porneste din nou.
  pause
  exit /b 1
)

rem --- daca aplicatia ruleaza deja, doar deschide browserul ---
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/api/spv/status -TimeoutSec 2 | Out-Null; Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  start "" http://localhost:5173
  exit /b 0
)

rem --- pachete, doar prima data ---
%PY% -c "import fastapi, uvicorn, multipart, httpx, pypdf" >nul 2>nul || (
  echo Instalez pachetele Python...
  %PY% -m pip install -q -r backend\requirements.txt || ( pause & exit /b 1 )
)
if not exist "frontend\node_modules" (
  echo Instalez pachetele interfetei...
  pushd frontend
  call npm install --no-audit --no-fund || ( popd & pause & exit /b 1 )
  popd
)

rem --- demo: data de lucru fixa, sincronizare SPV la 2 minute, date demo la prima pornire ---
set "BVS_TODAY=2026-10-24"
set "BVS_SYNC_MINUTES=2"
set "BVS_DEMO=1"

echo Pornesc serverul si interfata...
start "Bill vs Signed - server" /min /D "%~dp0backend" %PY% -m uvicorn app.main:app --port 8765
start "Bill vs Signed - interfata" /min /D "%~dp0frontend" npx vite --port 5173 --strictPort

rem --- asteapta serverul si interfata (max. 90 s), apoi deschide browserul ---
powershell -NoProfile -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/api/spv/status -TimeoutSec 1 | Out-Null; Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep 1 } }; exit 1"
if errorlevel 1 (
  echo Aplicatia nu a pornit. Uita-te in ferestrele minimizate "Bill vs Signed" dupa erori.
  pause
  exit /b 1
)
start "" http://localhost:5173
exit /b 0
