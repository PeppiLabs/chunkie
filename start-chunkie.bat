@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0chunkie.exe" (
    "%~dp0chunkie.exe" %*
    goto :eof
)

echo ==================================================
echo            Peppi Labs - Chunkie Launcher
echo ==================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js was not found on your system.
    echo Please install Node.js (v20.19.0 or newer) from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Starting Chunkie...
call npm run dev -- --open

pause
