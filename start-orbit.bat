@echo off
REM ============================================================
REM  Orbit / RenQingXingTu  -  quick start
REM
REM  IMPORTANT: keep this file pure ASCII.
REM  cmd.exe re-seeks the script by byte offset on every GOTO/CALL,
REM  so any multi-byte (Chinese) line before a label desyncs the
REM  parser and the whole script falls apart. Do not "translate" it.
REM ============================================================
setlocal
title Orbit - quick start
cd /d "%~dp0"

set "ROOT=%CD%"
set "FRONTEND=%ROOT%\frontend"
set "BACKEND=%ROOT%\backend"
set "WEB_URL=http://127.0.0.1:5173"
set "API_URL=http://127.0.0.1:8000/docs"
REM Optional portable runtimes shipped next to this file, e.g. a "runtime\node"
REM or "runtime\python" folder copied along with the project. Used only when the
REM machine has nothing usable on PATH. Keep these RELATIVE - an absolute path
REM here would point at whoever built the package, not at whoever runs it.
set "BUNDLED_NODE=%ROOT%\runtime\node\node.exe"
set "BUNDLED_PYTHON=%ROOT%\runtime\python\python.exe"
REM Cache %ProgramFiles(x86)% once: its parentheses break FOR sets if the
REM variable is expanded inline there.
set "PF86=%ProgramFiles(x86)%"

echo.
echo   ==========================================
echo      Orbit - quick start
echo   ==========================================
echo.

if not exist "%FRONTEND%\package.json" goto :bad_layout
if not exist "%BACKEND%\requirements.txt" goto :bad_layout

REM ---------------- 0a. which mode ----------------
REM If the frontend was built ahead of time (frontend\dist), FastAPI serves the
REM whole app on one port and Node is NOT needed at runtime: no npm install, no
REM Vite, one URL. Otherwise fall back to the two-process dev setup.
set "PREBUILT="
if exist "%FRONTEND%\dist\index.html" set "PREBUILT=1"
if defined PREBUILT set "WEB_URL=http://127.0.0.1:8000"
if defined PREBUILT set "API_URL=http://127.0.0.1:8000/docs"

REM ---------------- 0b. dependencies ----------------
REM probe_deps already knows about PREBUILT and leaves Node out of MISSING
REM (see :probe_node_done), so no post-processing is needed here.
call :probe_deps
call :report_missing
if not defined MISSING goto :deps_ready

echo.
echo   Orbit needs these to run. They are free and take a few minutes.
echo.
where winget >nul 2>nul
if errorlevel 1 goto :no_winget

echo   Install them now?
echo.
REM choice, not set /p: set /p keeps trailing whitespace from piped input
REM ("Y " does not equal "Y"), and choice only needs one keypress anyway.
REM errorlevel is 1 for the first choice, 2 for the second. If choice itself
REM cannot run (no console) it returns 255, which also lands on quit.
choice /C YN /N /M "    [Y] install automatically   [N] quit  : "
if errorlevel 2 goto :declined
echo.

:do_install
echo.
call :install_deps

REM winget updates PATH for *new* sessions only, so re-probe with the
REM well-known install locations before giving up.
call :probe_deps
call :report_missing
if defined MISSING goto :install_incomplete
echo.
echo   Dependencies installed.
goto :deps_ready

REM ---------------- 1. frontend deps ----------------
:deps_ready
REM ---- zero-install path ----
REM runtime\packages-<py><min> holds every backend dependency prebuilt for one
REM Python version. The compiled parts are version-locked (a cp312 .pyd cannot
REM load on 3.13), so pick the folder matching the interpreter we found and
REM skip the entire pip step. No match -> fall through to the normal install.
set "PYEXE="
set "PRELOADED="
if not defined PYCMD goto :pick_done
REM Parse "Python 3.13.9" instead of running python -c: the brackets and
REM parentheses in sys.version_info[0] break the for /f command parser, and
REM PYCMD may itself be quoted ("D:\...\python.exe").
for /f "tokens=2" %%V in ('%PYCMD% --version 2^>nul') do set "PYFULL=%%V"
if not defined PYFULL goto :pick_done
for /f "tokens=1,2 delims=." %%A in ("%PYFULL%") do set "PYVER=%%A%%B"
if not defined PYVER goto :pick_done
if not exist "%ROOT%\runtime\packages-%PYVER%" goto :pick_done
set "PRELOADED=1"
if defined PYTHONPATH (
  set "PYTHONPATH=%ROOT%\runtime\packages-%PYVER%;%PYTHONPATH%"
) else (
  set "PYTHONPATH=%ROOT%\runtime\packages-%PYVER%"
)
:pick_done
if defined PRELOADED set "PYEXE=%PYCMD%"
if not defined PYEXE set "PYEXE=%BACKEND%\.venv\Scripts\python.exe"

REM ---------------- 1. frontend deps ----------------
if defined PREBUILT goto :prebuilt_frontend
if exist "%FRONTEND%\node_modules" goto :frontend_ready
echo   [1/4] first run: installing frontend dependencies (about 1 min)...
pushd "%FRONTEND%"
call "%NPM_CMD%" install --no-fund --no-audit
set "STEP_RESULT=%errorlevel%"
popd
if not "%STEP_RESULT%"=="0" goto :npm_failed
goto :frontend_ready

:prebuilt_frontend
REM frontend\dist is shipped, so FastAPI serves it on :8000 - nothing to do.
echo   [1/4] frontend prebuilt, Node not needed   OK
goto :venv_start

:frontend_ready
echo   [1/4] frontend dependencies   OK

REM ---------------- 2. backend venv ----------------
:venv_start
REM Zero-install: dependencies are already sitting in runtime\packages-<ver>,
REM so there is nothing to create and nothing to download.
if defined PRELOADED goto :venv_ready
if exist "%BACKEND%\.venv\Scripts\python.exe" goto :venv_ready
echo   [2/4] first run: creating the Python virtualenv (this can take 1-2 min)...
%PYCMD% -m venv "%BACKEND%\.venv"
if errorlevel 1 goto :venv_failed
REM Prefer the pinned lock file. requirements.txt uses open ranges
REM (fastapi>=0.115, ...) and pip's resolver can spend many minutes
REM backtracking without installing anything - measured over 10 minutes of
REM 100%% CPU with an empty site-packages. With every version pinned there is
REM exactly one solution and it finishes in seconds. Fall back for old copies.
REM Not -q: a silent minute looks like a hang, and people close the window.
set "REQS=%BACKEND%\requirements.lock.txt"
if not exist "%REQS%" set "REQS=%BACKEND%\requirements.txt"
echo         installing backend packages, please wait...
"%BACKEND%\.venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "%REQS%"
if errorlevel 1 goto :venv_failed

:venv_ready
if defined PRELOADED (echo   [2/4] backend deps preloaded, no install needed   OK) else (echo   [2/4] backend virtualenv       OK)

REM ---------------- 3. demo data ----------------
if exist "%BACKEND%\orbit.db" goto :db_ready
echo   [3/4] first run: writing the demo dataset...
pushd "%BACKEND%"
%PYEXE% -m app.seed
set "STEP_RESULT=%errorlevel%"
popd
if not "%STEP_RESULT%"=="0" goto :seed_failed

:db_ready
echo   [3/4] demo data                OK

REM ---------------- 4. start services ----------------
echo   [4/4] starting services...

call :port_busy 8000
if not errorlevel 1 goto :api_running
start "Orbit API :8000" /d "%BACKEND%" cmd /k "%PYEXE% -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
echo         backend API   started in a new window
goto :after_api

:api_running
echo         backend API   already running - skipped

:after_api
REM Prebuilt mode: the backend also serves the page, so there is no second
REM process and no port 5173. This check must sit AFTER both start paths -
REM putting it only in :api_running let the normal path fall through to Vite.
if defined PREBUILT goto :wait_web

:start_web
call :port_busy 5173
if not errorlevel 1 goto :web_running
start "Orbit Web :5173" /d "%FRONTEND%" cmd /k ""%NPM_CMD%" run dev"
echo         frontend      started in a new window
goto :wait_web

:web_running
echo         frontend      already running - skipped

REM ---------------- wait for the web server ----------------
:wait_web
echo.
echo   waiting for the page to come up...
set /a TRIES=0

:wait_loop
REM Probe the real page, not just the port: Vite binds the port before it can
REM actually serve, so a port check alone opens the browser too early.
call :web_ready
if not errorlevel 1 goto :open_browser
set /a TRIES+=1
if %TRIES% GEQ 90 goto :timeout
REM ping instead of "timeout /t 1": timeout refuses to run when stdin is
REM redirected, which would make this loop spin without ever sleeping.
ping -n 2 127.0.0.1 >nul 2>nul
goto :wait_loop

:open_browser
start "" "%WEB_URL%"
echo.
echo   ==========================================
echo      ready
echo   ==========================================
echo.
echo     page    %WEB_URL%
echo     api     %API_URL%
echo.
echo     demo account   demo@orbit.local / orbitdemo
echo     the login page also has a one-click demo button.
echo.
echo     each service has its own window; close it to stop.
echo.
pause
exit /b 0

:timeout
echo.
echo   [!] timed out. Check the "Orbit Web :5173" window for errors.
echo.
pause
exit /b 1

REM ============================================================
REM  subroutines
REM ============================================================

REM ---- probe: fill NODE_CMD / NPM_CMD / PYCMD, and MISSING ----
:probe_deps
set "NODE_CMD="
set "NPM_CMD="
set "PYCMD="
set "MISSING="
set "VENV_READY="
set "PY_TOO_OLD="

REM Node: PATH first, then the well-known install locations. The explicit
REM paths matter right after a winget install, because this cmd session
REM still holds the PATH it started with.
where node >nul 2>nul
if not errorlevel 1 for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%N"
if defined NODE_CMD goto :probe_npm
if exist "%BUNDLED_NODE%" set "NODE_CMD=%BUNDLED_NODE%"
if defined NODE_CMD goto :probe_npm
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
if defined NODE_CMD goto :probe_npm
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"

:probe_npm
if not defined NODE_CMD goto :probe_node_done
REM npm lives next to node, but resolve it to a FULL PATH and never fall back
REM to the bare name. `call "npm" install` makes cmd look for npm relative to
REM the current directory, which breaks npm's own %~dp0 and produces
REM "Cannot find module <cwd>\node_modules\npm\bin\npm-cli.js".
REM Ask for npm.cmd explicitly: `where npm` also lists the extensionless
REM shell script, which Windows cannot execute.
for /f "delims=" %%N in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%N"
if not defined NPM_CMD for %%I in ("%NODE_CMD%") do if exist "%%~dpInpm.cmd" set "NPM_CMD=%%~dpInpm.cmd"
:probe_node_done
REM Prebuilt mode does not need Node at RUN time, so never add it to MISSING.
REM Skipping it here is deliberate: string surgery on MISSING afterwards
REM (%MISSING: node=%) proved unreliable and left a stray "node=" behind.
if defined PREBUILT goto :probe_node_skip
if not defined NODE_CMD set "MISSING=%MISSING% node"
if not defined NPM_CMD set "MISSING=%MISSING% node"
:probe_node_skip

REM Python: an existing venv is already enough to RUN, so treat it as
REM satisfied first - a system interpreter is only needed to CREATE the venv.
REM Without this, machines that keep Python inside the venv (or only have the
REM useless Microsoft Store alias) get a false "Python missing".
if exist "%BACKEND%\.venv\Scripts\python.exe" set "PYCMD="%BACKEND%\.venv\Scripts\python.exe""
if defined PYCMD set "VENV_READY=1"
if defined PYCMD goto :probe_py_done
py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,12) else 1)" >nul 2>nul
if not errorlevel 1 set "PYCMD=py -3"
if defined PYCMD goto :probe_py_done
call :try_py_cmd python
call :try_py_cmd python3
if defined PYCMD goto :probe_py_done
call :try_py "%BUNDLED_PYTHON%"
if defined PYCMD goto :probe_py_done

REM Registry is the authoritative list of installed CPython. Read the
REM (Default) value of PythonCore\<version>\InstallPath - note that
REM ExecutablePath is NOT written by every installer, so do not rely on it.
for %%H in (HKCU HKLM) do (
  for %%R in ("SOFTWARE\Python\PythonCore" "SOFTWARE\WOW6432Node\Python\PythonCore") do (
    for /f "tokens=*" %%V in ('reg query "%%H\%%~R" 2^>nul ^| findstr /r "PythonCore\\\\[0-9]"') do (
      for /f "tokens=2,*" %%A in ('reg query "%%V\InstallPath" /ve 2^>nul ^| findstr /i "REG_SZ"') do (
        call :try_py "%%B\python.exe"
      )
    )
  )
)
if defined PYCMD goto :probe_py_done

REM Any 3.x under the usual roots. A wildcard beats a hardcoded list:
REM Python312/Python313 alone missed D:\Anaconda and every other layout.
for %%D in ("%LOCALAPPDATA%\Programs\Python" "%ProgramFiles%" "%PF86%" "C:\" "D:\") do (
  for /d %%P in ("%%~D\Python3*") do call :try_py "%%~P\python.exe"
)
if defined PYCMD goto :probe_py_done

REM Conda / Anaconda: common per-user and per-machine locations.
for %%D in (
  "%USERPROFILE%\anaconda3" "%USERPROFILE%\miniconda3" "%USERPROFILE%\Anaconda3"
  "%USERPROFILE%\miniforge3" "%ProgramData%\Anaconda3" "%ProgramData%\miniconda3"
  "C:\Anaconda3" "C:\miniconda3" "D:\Anaconda" "D:\Anaconda3" "D:\miniconda3"
) do call :try_py "%%~D\python.exe"

:probe_py_done
if not defined PYCMD set "MISSING=%MISSING% python"
exit /b 0

REM ---- try_py: accept %~1 only when it is Python 3.12+ ----
:try_py
if defined PYCMD exit /b 0
if "%~1"=="" exit /b 0
if not exist "%~1" exit /b 0
"%~1" -c "import sys; raise SystemExit(0 if sys.version_info>=(3,12) else 1)" >nul 2>nul
if errorlevel 1 exit /b 0
set "PYCMD="%~1""
exit /b 0

REM ---- try_py_cmd: same, for a bare command name on PATH ----
REM where can return several hits, including the useless Microsoft Store
REM alias; try_py rejects it because the import test fails there.
:try_py_cmd
if defined PYCMD exit /b 0
if "%~1"=="" exit /b 0
for /f "delims=" %%P in ('where "%~1" 2^>nul') do call :try_py "%%P"
exit /b 0

REM ---- report_missing: print what is absent, if anything ----
:report_missing
if not defined MISSING goto :report_done
echo.
echo   Missing dependencies:
if not "%MISSING: node=%"=="%MISSING%" echo     - Node.js 20 or newer   https://nodejs.org
if not "%MISSING: python=%"=="%MISSING%" echo     - Python 3.12 or newer  https://www.python.org/downloads/
if defined PY_TOO_OLD echo     - Python found, but it is older than 3.12
:report_done
exit /b 0

REM ---- install_deps: winget, per missing dependency ----
:install_deps
echo   installing... this opens a Windows installer and can take a few minutes.
echo.
if "%MISSING: node=%"=="%MISSING%" goto :skip_node
echo     Node.js ...
winget install --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements
:skip_node
if "%MISSING: python=%"=="%MISSING%" goto :skip_python
if not defined PY_TOO_OLD goto :install_python
echo     Python (upgrading an older 3.x) ...
:install_python
echo     Python ...
winget install --id Python.Python.3.12 --source winget --accept-source-agreements --accept-package-agreements
:skip_python
echo.
exit /b 0

REM ---- port_busy / web_ready ----
:port_busy
netstat -ano | findstr ":%1" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

:web_ready
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri '%WEB_URL%/'; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

REM ============================================================
REM  error exits
REM ============================================================

:declined
echo.
echo   Nothing was installed. Orbit was not started.
echo.
pause
exit /b 0

:no_winget
echo   Automatic install needs winget, which this PC does not have.
echo   Install the two items above by hand, then run this file again:
echo.
echo     Node.js 20+    https://nodejs.org
echo     Python 3.12+   https://www.python.org/downloads/
echo.
echo   When installing Python, tick "Add python.exe to PATH".
echo.
pause
exit /b 1

:install_incomplete
echo.
echo   [!] Still missing after the install attempt.
echo.
echo   If the installer finished, close this window and double-click
echo   start-orbit.bat again - Windows only refreshes PATH in a new window.
echo.
echo     Node.js 20+    https://nodejs.org
echo     Python 3.12+   https://www.python.org/downloads/
echo.
pause
exit /b 1

:bad_layout
echo.
echo   [X] Wrong folder: no frontend\ or backend\ next to this file.
echo       Put this .bat in the orbit folder, next to frontend and backend.
echo.
pause
exit /b 1

:npm_failed
echo.
echo   [X] Frontend dependency install failed - see the output above.
echo.
pause
exit /b 1

:venv_failed
echo.
echo   [X] Could not create the Python virtualenv.
echo.
pause
exit /b 1

:seed_failed
echo.
echo   [X] Writing the demo dataset failed.
echo.
pause
exit /b 1
