@echo off
setlocal
cd /d "%~dp0"
echo [1/3] Renderer bagimliliklari kuruluyor...
call npm ci --prefix renderer
if errorlevel 1 goto fail

echo [2/3] Kok bagimliliklari kuruluyor...
call npm ci
if errorlevel 1 goto fail

echo [3/3] RtfLauncher build ediliyor...
call npm run build
if errorlevel 1 goto fail

echo.
echo ========================================
echo BUILD TAMAMLANDI
echo installer: dist\RtfLauncher Setup ^<package.json surum^>.exe
echo ========================================
pause
exit /b 0
:fail
echo.
echo BUILD BASARISIZ. Yukaridaki hatayi kontrol et.
pause
exit /b 1
