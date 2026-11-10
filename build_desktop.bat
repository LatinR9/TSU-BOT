@echo off
title Build TSU-BOT-Pro.exe (WinForms Desktop)
echo ========================================================
echo   Building TSU-BOT-Pro.exe from AppUI.cs
echo ========================================================
echo.

setlocal EnableExtensions
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

echo [1/3] Compiling AppUI.cs ...
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

echo [2/3] Copying to dist\TSU-BOT-Pro.exe ...
copy /Y TSU-BOT-Pro.exe dist\TSU-BOT-Pro.exe >nul

echo [3/3] Writing sha256 into version.json ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$exe = Resolve-Path '.\TSU-BOT-Pro.exe';" ^
  "$hash = (Get-FileHash -Algorithm SHA256 -Path $exe).Hash.ToLowerInvariant();" ^
  "$vj = '.\version.json';" ^
  "if (-not (Test-Path $vj)) { throw 'version.json not found' };" ^
  "$raw = Get-Content -Raw -Encoding UTF8 $vj;" ^
  "if ($raw -match '\"sha256\"\s*:') {" ^
  "  $raw = [regex]::Replace($raw, '\"sha256\"\s*:\s*\"[^\"]*\"', ('\"sha256\": \"' + $hash + '\"'));" ^
  "} else {" ^
  "  $raw = [regex]::Replace($raw, '\}\s*$', (',\"sha256\": \"' + $hash + '\"`r`n}'));" ^
  "}" ^
  "[System.IO.File]::WriteAllText((Resolve-Path $vj), $raw, (New-Object System.Text.UTF8Encoding $false));" ^
  "Write-Host ('sha256=' + $hash)"
if errorlevel 1 (
    echo [ERROR] Failed to write sha256 into version.json
    exit /b 1
)

echo.
echo ========================================================
echo   Build complete:
echo     TSU-BOT-Pro.exe
echo     dist\TSU-BOT-Pro.exe
echo     version.json  (sha256 updated)
echo   Commit/push version.json + exe together for in-app updates.
echo ========================================================
endlocal
