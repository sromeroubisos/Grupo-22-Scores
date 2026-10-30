@echo off
REM Auto-generated: push the login session fix commit (already committed locally)
setlocal

cd /d "%~dp0"

if exist ".git\index.lock" (
    echo Removing stale .git\index.lock ...
    del /F /Q ".git\index.lock" 2>nul
)

echo Current HEAD:
git log --oneline -1

echo.
echo Pushing to origin main...
git push origin main
if errorlevel 1 goto :err

echo.
echo === DONE ===
goto :end

:err
echo.
echo === FAILED ===
echo See output above for details.
exit /b 1

:end
endlocal
