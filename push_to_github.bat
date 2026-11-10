@echo off
title Push TSU-BOT to GitHub
echo ========================================================
echo   Pushing TSU-BOT Pro to https://github.com/LatinR9/TSU-BOT
echo ========================================================
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Push completed successfully!
) else (
    echo [ERROR] Push failed. Please make sure you are logged into GitHub in your browser.
)
echo.
pause
