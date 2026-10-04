@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0BUILD-LOG.txt"
if exist "%LOG%" del /q "%LOG%"

echo ===== SYSTEM =====>"%LOG%"
ver >>"%LOG%" 2>&1
node --version >>"%LOG%" 2>&1
npm --version >>"%LOG%" 2>&1

echo ===== ROOT NPM INSTALL =====>>"%LOG%"
call npm install --no-audit --no-fund >>"%LOG%" 2>&1
if errorlevel 1 goto fail

echo ===== RENDERER NPM INSTALL =====>>"%LOG%"
call npm install --prefix renderer --no-audit --no-fund >>"%LOG%" 2>&1
if errorlevel 1 goto fail

rem The RTF client mod ships pre-built in src\resources\required-mods\rtfclient-builtin.jar
rem and is bundled by ensureRequiredMods at runtime; there is no gradle
rem project in this repository, so no gradle step is needed here.

echo ===== QA =====>>"%LOG%"
call npm run qa >>"%LOG%" 2>&1
if errorlevel 1 goto fail

echo ===== LAUNCHER BUILD =====>>"%LOG%"
call npm run build >>"%LOG%" 2>&1
if errorlevel 1 goto fail

echo BUILD ALL PASS>>"%LOG%"
echo.
echo BUILD BASARILI
echo Log: "%LOG%"
pause
exit /b 0

:fail
cd /d "%~dp0"
echo.
echo BUILD BASARISIZ.
echo Tum hata kaydi: "%LOG%"
echo Son 50 satir:
powershell -NoProfile -Command "Get-Content -Tail 50 '%LOG%'"
echo.
echo Simdi sadece BUILD-LOG.txt dosyasini bana yukle.
pause
exit /b 1
