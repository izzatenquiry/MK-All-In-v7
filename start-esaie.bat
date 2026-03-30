@echo off
title Starting - ESAIE
color 0E

echo.
echo ================================================================
echo              ESAIE - Starting All Services
echo ================================================================
echo.

cd /d "%~dp0"

echo [INFO] Current directory: %CD%
echo.
echo [INFO] Verifying .env.esai file...
if exist "%~dp0.env.esai" (
    echo [SUCCESS] .env.esai found
) else (
    echo [WARNING] .env.esai not found! Creating it...
    echo VITE_BRAND=esai > "%~dp0.env.esai"
    echo [SUCCESS] .env.esai created
)
echo.

:: Start all: start "Title" /d "folder_path" cmd /k "command"
echo [INFO] Starting Backend API (Flask)...
start "Backend 1247" /d "%~dp0backend" cmd /k "(if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat) & set BRAND=esai & python web_dashboard.py & pause"
echo [SUCCESS] Backend API starting...
echo.

echo [INFO] Waiting for backend...
timeout /t 3 /nobreak >nul
echo.

echo [INFO] Starting Node.js Server...
start "Server 3001" /d "%~dp0server" cmd /k "node index.js & pause"
echo [SUCCESS] Node.js Server starting...
echo.

echo [INFO] Waiting for server...
timeout /t 2 /nobreak >nul
echo.

echo [INFO] Starting Bridge (captcha_server — auto-generator in-process)...
start "Bridge 6003" /d "%~dp0captcha_server" cmd /k "node bridge-server.js --port=6003 & pause"
echo [SUCCESS] Bridge starting on port 6003...
echo.

echo [INFO] Waiting for bridge...
timeout /t 2 /nobreak >nul
echo.

echo [INFO] Starting React App (ESAIE)...
start "React 8080" /d "%~dp0" cmd /k "npm run dev:esai & pause"
echo [SUCCESS] React App starting...
echo.

echo ================================================================
echo                    SERVICES STARTING
echo ================================================================
echo.
echo [SUCCESS] All services are starting in separate windows!
echo.
echo Service URLs:
echo - Backend API:    http://localhost:1247
echo - Node.js Server: http://localhost:3001
echo - Bridge + Generator: http://localhost:6003 (single process)
echo - React App:      http://localhost:8080
echo.
echo [NOTE] Electron .exe: run this script first so Flask, :3001, and bridge start.
echo.
echo [INFO] Each service runs in its own window.
echo [INFO] Press any key to exit this window (services will continue running)...
pause >nul

