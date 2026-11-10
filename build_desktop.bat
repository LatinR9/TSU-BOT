@echo off
title Build TSU-BOT-Pro.exe (WinForms Desktop)
echo ========================================================
echo   Building TSU-BOT-Pro.exe from AppUI.cs
echo ========================================================
echo.

setlocal
set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
) else if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
    set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if "%CSC%"=="" (
    echo [ERROR] Could not find .NET Framework csc.exe
    echo Install .NET Framework 4.x Developer Pack / Visual Studio Build Tools.
    exit /b 1
)

echo Using compiler:
echo   %CSC%
echo.

if not exist dist mkdir dist

echo [1/2] Compiling AppUI.cs ...
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu ^
    /out:TSU-BOT-Pro.exe ^
    /reference:System.dll ^
    /reference:System.Drawing.dll ^
    /reference:System.Windows.Forms.dll ^
    /reference:System.Core.dll ^
    AppUI.cs
if errorlevel 1 (
    echo [ERROR] Compile failed.
    exit /b 1
)

echo [2/2] Copying to dist\TSU-BOT-Pro.exe ...
copy /Y TSU-BOT-Pro.exe dist\TSU-BOT-Pro.exe >nul

echo.
echo ========================================================
echo   Build complete:
echo     TSU-BOT-Pro.exe
echo     dist\TSU-BOT-Pro.exe
echo ========================================================
endlocal
