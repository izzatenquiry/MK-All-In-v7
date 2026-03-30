@echo off
title Starting - MONOKLIX
color 0A

echo.
echo ================================================================
echo              MONOKLIX - Starting All Services
echo ================================================================
echo.

cd /d "%~dp0"

echo [INFO] Current directory: %CD%
echo.

:: Start all: start "Title" /d "folder_path" cmd /k "command"
echo [INFO] Starting Backend API (Flask)...
start "Backend 1247" /d "%~dp0backend" cmd /k "(if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat) & python web_dashboard.py & pause"
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

echo [INFO] Starting Bridge (captcha_server — auto-generator runs inside this process)...
start "Bridge 6003" /d "%~dp0captcha_server" cmd /k "node bridge-server.js --port=6003 & pause"
echo [SUCCESS] Bridge starting on port 6003...
echo.

echo [INFO] Waiting for bridge...
timeout /t 2 /nobreak >nul
echo.

echo [INFO] Starting React App...
start "React 8080" /d "%~dp0" cmd /k "npm run dev & pause"
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
echo - Bridge + Generator: http://localhost:6003 (single process; needs Flask for unified Flow OAuth)
echo - React App:      http://localhost:8080
echo.
echo [NOTE] Electron desktop app: run this script before the .exe so Flask, :3001, and bridge are up.
echo        Bridge uses port 6003 unless you start bridge with another --port and set bridgeServerPort to match.
echo.
echo [INFO] Each service runs in its own window.
echo [INFO] Press any key to close this window (this will NOT stop the services).
echo.
pause >nul
