@echo off
title Build TSU-BOT.exe
echo ========================================================
echo   Building Standalone TSU-BOT.exe for Windows
echo ========================================================
echo.

if not exist dist (
    mkdir dist
)

echo [1/3] Installing dependencies...
call npm install

echo [2/3] Bundling with pkg...
call npx -y @yao-pkg/pkg . --targets node18-win-x64 --output dist/TSU-BOT.exe

echo [3/3] Copying static assets to dist...
xcopy /E /I /Y public dist\public
copy /Y tsu_answers.json dist\tsu_answers.json
copy /Y tsu_answers.csv dist\tsu_answers.csv

echo.
echo ========================================================
echo   Build Complete! Executable created at:
echo   dist\TSU-BOT.exe
echo ========================================================
pause
