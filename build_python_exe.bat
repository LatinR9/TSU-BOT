@echo off
title Build Python TSU-BOT.exe
echo ========================================================
echo   Building Python TSU-BOT.exe via PyInstaller
echo ========================================================
echo.

pip install pyinstaller playwright
playwright install chromium
pyinstaller --onefile --windowed --name "TSU-BOT" --add-data "tsu_answers.json;." tsu_bot_gui.py

echo.
echo Build finished. Executable is located in dist\TSU-BOT.exe
pause
