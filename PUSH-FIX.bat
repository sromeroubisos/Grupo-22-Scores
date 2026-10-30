@echo off
cd /d "%~dp0"
echo ============================================
echo  Limpiando locks de git y empujando el fix
echo ============================================
echo.
del /F /Q ".git\index.lock" 2>nul
del /F /Q ".git\HEAD.lock" 2>nul
echo Locks limpiados (si existian).
echo.
echo Moviendo main al commit del fix...
git update-ref refs/heads/main 8e2383fa4b82ba7f415e53906914e4d2f92c62c2
if errorlevel 1 (
    echo ERROR moviendo refs/heads/main. Abortando.
    pause
    exit /b 1
)
echo OK.
echo.
echo Empujando a origin/main...
git push origin main
if errorlevel 1 (
    echo ERROR durante git push.
    pause
    exit /b 1
)
echo.
echo ============================================
echo  Listo. Commit pusheado a main.
echo ============================================
pause
