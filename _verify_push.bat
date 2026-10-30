@echo off
cd /d "%~dp0"
echo === LOCAL HEAD ===
git log --oneline -1
echo.
echo === LOCAL origin/main ===
git log --oneline -1 origin/main
echo.
echo === REMOTE main via ls-remote ===
git ls-remote origin refs/heads/main
echo.
echo === push attempt ===
git push origin main
echo.
echo === DONE - press a key ===
> "_verify_push.log" (
  echo === LOCAL HEAD ===
  git log --oneline -1
  echo.
  echo === REMOTE main via ls-remote ===
  git ls-remote origin refs/heads/main
  echo.
  echo === push ===
  git push origin main 2>^&1
)
type _verify_push.log
pause
