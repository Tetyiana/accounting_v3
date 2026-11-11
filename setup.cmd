@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist .git (
  echo Репозиторій уже розгорнуто.
  goto deps
)
git init -q
git fetch -q --update-head-ok accounting_v3.bundle "refs/heads/*:refs/heads/*"
git checkout -q tax-coverage
git remote add origin https://github.com/Tetyiana/accounting_v3.git
git config user.name "Tetyiana"
git config user.email "artibyakinatanya@gmail.com"
:deps
call npm install
git log --oneline -5
echo.
echo Готово. Гілка tax-coverage.
pause
