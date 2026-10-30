@echo off
cd /d "%~dp0"
echo === head === > _push.log
git rev-parse HEAD >> _push.log 2>&1
echo === pushing === >> _push.log
git push origin main >> _push.log 2>&1
echo === done %ERRORLEVEL% === >> _push.log
