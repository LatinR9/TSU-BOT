@echo off
title Push TSU-BOT to GitHub
echo ========================================================
echo   Pushing TSU-BOT Pro to https://github.com/LatinR9/TSU-BOT
echo ========================================================
echo.
git push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCCESS] Push completed successfully!
    echo   Check your repository at:
    echo   https://github.com/LatinR9/TSU-BOT
    echo ========================================================
) else (
    echo [ERROR] Push failed. Please check your GitHub connection.
)
echo.
pause
