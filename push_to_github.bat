@echo off
title Push TSU-BOT to GitHub
echo ========================================================
echo   Pushing TSU-BOT Pro to https://github.com/LatinR9/TSU-BOT
echo ========================================================
echo.
echo [1/2] Syncing with GitHub repository...
git pull origin main --rebase --allow-unrelated-histories

echo [2/2] Pushing all files...
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
