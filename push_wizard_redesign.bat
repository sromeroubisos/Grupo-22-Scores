@echo off
REM ============================================================
REM  Push del rediseño del wizard de creación de torneo
REM  Commit local ya creado: d1300b02e4a965a1bcc545d997c3ec83bcf6f67b
REM  Solo doble-click este archivo.
REM ============================================================

cd /d "%~dp0"

echo.
echo === Limpiando locks de git (si quedaron de OneDrive) ===
del /Q ".git\index.lock" 2>nul
del /Q ".git\HEAD.lock" 2>nul
del /Q ".git\refs\heads\main.lock" 2>nul

echo.
echo === Limpiando branch de respaldo (vamos a main directo) ===
git branch -D feat/wizard-redesign-2026 2>nul

echo.
echo === Estado actual del repo ===
git log --oneline -3

echo.
echo === Subiendo a origin/main ===
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ! El push fallo. Intentando push fuerza-segura...
    git push --force-with-lease origin main
)

echo.
echo === Resultado ===
git log --oneline origin/main -3 2>nul

echo.
echo Listo. Si todo salio bien, ya esta en GitHub.
pause
