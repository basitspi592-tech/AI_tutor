@echo off
title AI Tutor - Dev Server
cd /d "%~dp0"

if not exist node_modules (
    echo [setup] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo [error] npm install failed.
        pause
        exit /b 1
    )
)

echo [run] Starting AI Tutor at http://localhost:3000
echo [run] Press Ctrl+C in this window to stop.
echo.
call npm run dev

echo.
echo [stop] Dev server stopped.
pause
