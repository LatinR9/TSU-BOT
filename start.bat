@echo off
title TSU-BOT Pro
echo ========================================================
echo   TSU-BOT Pro - Multi-Browser & Auto-Quiz Suite
echo ========================================================
echo.

if not exist node_modules (
    echo [INFO] Installing required dependencies...
    call npm install
    call npx playwright install chromium
)

echo [INFO] Starting TSU-BOT Server...
node server.js
pause
