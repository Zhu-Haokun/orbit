@echo off
REM ============================================================
REM  Orbit - apply a downloaded update
REM
REM  Run this AFTER closing every Orbit window. It replaces the
REM  program files and never touches your data.
REM
REM  IMPORTANT: keep this file pure ASCII. cmd.exe re-seeks the
REM  script by byte offset on every GOTO/CALL, so a multi-byte
REM  (Chinese) line before a label desyncs the parser.
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "STAGING=%CD%\update-staging"
set "FILES=%STAGING%\files"
set "BACKUP=%CD%\update-backup"

echo.
echo   ==========================================
echo      Orbit - apply update
echo   ==========================================
echo.

if not exist "%FILES%" goto :nothing_staged
if not exist "%STAGING%\READY" goto :nothing_staged

REM ---- 1. make sure nothing is holding our files ----
call :port_busy 8000
if not errorlevel 1 goto :still_running

echo   [1/5] preparing backup...
if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
mkdir "%BACKUP%" 2>nul

REM Your records. Backed up before anything is overwritten.
if exist "%CD%\backend\orbit.db" (
  copy /y "%CD%\backend\orbit.db" "%BACKUP%\orbit.db" >nul
  echo         orbit.db backed up
)
REM The code we are about to replace, so a failure can be undone.
for %%D in (backend\app backend\alembic frontend\dist) do (
  if exist "%CD%\%%D" (
    mkdir "%BACKUP%\%%D" 2>nul
    xcopy /e /i /q /y "%CD%\%%D" "%BACKUP%\%%D" >nul
  )
)

echo   [2/5] copying new files...
call :copy_tree "backend\app"
call :copy_tree "backend\alembic"
call :copy_tree "frontend\dist"
call :copy_tree "frontend\src"
call :copy_tree "frontend\public"
for %%F in (start-orbit.bat apply-update.bat release.json README.md docker-compose.yml) do (
  if exist "%FILES%\%%F" copy /y "%FILES%\%%F" "%CD%\%%F" >nul
)
for %%F in (alembic.ini pyproject.toml requirements.txt requirements.lock.txt requirements-dev.txt smoke_test.py) do (
  if exist "%FILES%\backend\%%F" copy /y "%FILES%\backend\%%F" "%CD%\backend\%%F" >nul
)
if exist "%FILES%\backend\tests" (
  if not exist "%CD%\backend\tests" mkdir "%CD%\backend\tests"
  xcopy /e /i /q /y "%FILES%\backend\tests" "%CD%\backend\tests" >nul
)
if exist "%FILES%\frontend\package.json" copy /y "%FILES%\frontend\package.json" "%CD%\frontend\package.json" >nul
if exist "%FILES%\frontend\package-lock.json" copy /y "%FILES%\frontend\package-lock.json" "%CD%\frontend\package-lock.json" >nul

echo   [3/5] running database migrations...
if not exist "%CD%\backend\.venv\Scripts\python.exe" goto :skip_migrate
pushd "%CD%\backend"
".venv\Scripts\python.exe" -m alembic upgrade head
set "MIGRATED=!errorlevel!"
popd
if not "!MIGRATED!"=="0" goto :migrate_failed
echo         migrations OK
goto :after_migrate

:skip_migrate
echo         no local virtualenv - migrations will run on first start

:after_migrate
echo   [4/5] cleaning up...
rmdir /s /q "%STAGING%" 2>nul
rmdir /s /q "%BACKUP%" 2>nul

echo   [5/5] done.
echo.
echo   ==========================================
echo      updated
echo   ==========================================
echo.
echo     start Orbit again:  start-orbit.bat
echo     your records are untouched.
echo.
pause
exit /b 0

REM ============================================================
REM  subroutines
REM ============================================================

:copy_tree
if not exist "%FILES%\%~1" exit /b 0
if not exist "%CD%\%~1" mkdir "%CD%\%~1" 2>nul
xcopy /e /i /q /y "%FILES%\%~1" "%CD%\%~1" >nul
exit /b 0

:port_busy
netstat -ano | findstr ":%1" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

REM ============================================================
REM  exits
REM ============================================================

:nothing_staged
echo   Nothing to apply: update-staging\files not found.
echo.
echo   Download the update first, from Settings - About - Check for updates.
echo.
pause
exit /b 1

:still_running
echo   [!] Orbit is still running (port 8000 is answering).
echo.
echo   Close every Orbit window, then run this file again.
echo.
pause
exit /b 1

:migrate_failed
echo.
echo   [!] Database migration failed. Restoring the backup...
if exist "%BACKUP%\orbit.db" copy /y "%BACKUP%\orbit.db" "%CD%\backend\orbit.db" >nul
for %%D in (backend\app backend\alembic frontend\dist) do (
  if exist "%BACKUP%\%%D" xcopy /e /i /q /y "%BACKUP%\%%D" "%CD%\%%D" >nul
)
echo.
echo   Your records were restored from update-backup\orbit.db
echo   The program files were rolled back too. Nothing was lost.
echo.
pause
exit /b 1
