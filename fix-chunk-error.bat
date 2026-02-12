@echo off
echo ========================================
echo Solucionando ChunkLoadError de Next.js
echo ========================================
echo.

echo [1/4] Deteniendo procesos de Node.js...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Limpiando cache de Next.js...
rmdir /s /q .next 2>nul
echo Cache .next eliminado

echo [3/4] Limpiando cache de node_modules...
rmdir /s /q node_modules\.cache 2>nul
echo Cache de node_modules eliminado

echo [4/4] Limpiando Turbopack cache...
rmdir /s /q .turbo 2>nul
echo Cache de Turbopack eliminado

echo.
echo ========================================
echo Limpieza completada
echo ========================================
echo.
echo Ahora ejecuta: npm run dev
echo.
pause
