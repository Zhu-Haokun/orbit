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

REM ------------------------------------------------------------
REM  THE list. Backup and copy both walk it, so they can never
REM  drift apart. They did once: the backup only covered three
REM  folders while the copy covered six plus a pile of loose
REM  files, so a failed migration left frontend\src and README.md
REM  replaced with no way back. Found by actually running it.
REM ------------------------------------------------------------
set "DIRS=backend\app backend\alembic backend\tests frontend\dist frontend\src frontend\public"
set "LOOSE=README.md release.json start-orbit.bat apply-update.bat docker-compose.yml"
set "LOOSE=%LOOSE% backend\alembic.ini backend\pyproject.toml backend\requirements.txt"
set "LOOSE=%LOOSE% backend\requirements.lock.txt backend\requirements-dev.txt backend\smoke_test.py"
set "LOOSE=%LOOSE% frontend\package.json frontend\package-lock.json"

echo.
echo   ==========================================
echo      Orbit - apply update
echo   ==========================================
echo.

REM staged ????????????????????
REM ?? files\ ?"????"?files\ ?? READY ???"?????"?
if not exist "%FILES%" goto :no_files
if not exist "%STAGING%\READY" goto :incomplete

REM ---- make sure nothing is holding our files ----
call :port_busy 8000
if not errorlevel 1 goto :still_running

echo   [1/5] preparing backup...
if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
mkdir "%BACKUP%" 2>nul

REM Your records first. Nothing below this line can lose them.
if exist "%CD%\backend\orbit.db" (
  copy /y "%CD%\backend\orbit.db" "%BACKUP%\orbit.db" >nul
  echo         orbit.db backed up
)
for %%D in (%DIRS%) do (
  if exist "%CD%\%%D" (
    mkdir "%BACKUP%\%%D" 2>nul
    xcopy /e /i /q /y "%CD%\%%D" "%BACKUP%\%%D" >nul
  )
)
for %%F in (%LOOSE%) do (
  if exist "%CD%\%%F" (
    mkdir "%BACKUP%\%%~dpF" 2>nul
    copy /y "%CD%\%%F" "%BACKUP%\%%F" >nul
  )
)

echo   [2/5] copying new files...
for %%D in (%DIRS%) do (
  if exist "%FILES%\%%D" (
    if not exist "%CD%\%%D" mkdir "%CD%\%%D" 2>nul
    xcopy /e /i /q /y "%FILES%\%%D" "%CD%\%%D" >nul
  )
)
for %%F in (%LOOSE%) do (
  if exist "%FILES%\%%F" (
    mkdir "%CD%\%%~dpF" 2>nul
    copy /y "%FILES%\%%F" "%CD%\%%F" >nul
  )
)

echo   [3/5] upgrading the database...
if not exist "%CD%\backend\.venv\Scripts\python.exe" goto :skip_migrate
pushd "%CD%\backend"
REM app.db.migrate, not "alembic upgrade head": a database created by
REM start-orbit.bat was made with create_all and has no alembic_version
REM stamp, so a plain upgrade would replay 0001_initial and hit
REM "table users already exists". That module detects and repairs it.
".venv\Scripts\python.exe" -m app.db.migrate
set "MIGRATED=!errorlevel!"
popd
if not "!MIGRATED!"=="0" goto :migrate_failed
goto :after_migrate

:skip_migrate
echo         no local virtualenv - migrations run on first start

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

:port_busy
netstat -ano | findstr ":%1" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

REM ============================================================
REM  exits
REM ============================================================

:no_files
echo   Nothing staged yet.
echo.
echo   In Orbit: Settings - About - check for updates, then click download.
echo.
echo   (Note: this script lives in the Orbit folder, next to start-orbit.bat.
echo    The download goes into update-staging\, it does not land here.)
echo.
pause
exit /b 1

:incomplete
echo   [!] The download did not finish.
echo.
echo   update-staging\files exists but the READY marker is missing - Orbit
echo   writes that marker only after a download completes, so this means it
echo   was interrupted or failed partway (a network drop or GitHub rate
echo   limiting will do it).
echo.
echo   Go back to Settings - About and download the update again.
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
echo   [!] Database upgrade failed. Rolling everything back...
if exist "%BACKUP%\orbit.db" copy /y "%BACKUP%\orbit.db" "%CD%\backend\orbit.db" >nul
for %%D in (%DIRS%) do (
  if exist "%BACKUP%\%%D" xcopy /e /i /q /y "%BACKUP%\%%D" "%CD%\%%D" >nul
)
for %%F in (%LOOSE%) do (
  if exist "%BACKUP%\%%F" copy /y "%BACKUP%\%%F" "%CD%\%%F" >nul
)
echo.
echo   Restored: orbit.db plus every program file that was replaced.
echo   The staging folder is kept so you can retry after fixing the cause:
echo     %STAGING%
echo.
pause
exit /b 1
