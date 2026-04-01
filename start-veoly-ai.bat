@echo off
title Starting - VEOLY-AI
color 0B

echo.
echo ================================================================
echo              VEOLY-AI - Starting All Services
echo ================================================================
echo.

cd /d "%~dp0"

echo [INFO] Current directory: %CD%
echo.
echo [INFO] Verifying .env file (VITE_BRAND=veoly)...
if exist "%~dp0.env" (
    echo [SUCCESS] .env found
) else (
    echo [WARNING] .env not found! Creating minimal .env for VEOLY-AI...
    echo VITE_BRAND=veoly > "%~dp0.env"
    echo [SUCCESS] .env created
)
echo.

:: Start all in new windows: start "Title" /d "folder_path" cmd /k "command"
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

echo [INFO] Starting Bridge (captcha_server — same window runs auto-generator in-process)...
start "Bridge 6003" /d "%~dp0captcha_server" cmd /k "node bridge-server.js --port=6003 & pause"
echo [SUCCESS] Bridge starting on port 6003...
echo.

echo [INFO] Waiting for bridge...
timeout /t 2 /nobreak >nul
echo.

echo [INFO] Starting React App (VEOLY-AI)...
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
echo - Bridge + Generator: http://localhost:6003 (single Node process; unified Veo needs Flask + this bridge)
echo - React App:      http://localhost:8080
echo.
echo [NOTE] Packaged Electron (.exe): still start THIS script first (or start.bat).
echo        Opening only the .exe does NOT auto-start Flask, proxy :3001, or bridge.
echo        Default bridge port is 6003. If the app calls another port (e.g. 8003), set
echo        bridge to the same port OR clear localStorage key bridgeServerPort in DevTools.
echo.
echo [INFO] Each service runs in its own window.
echo [INFO] Press any key to exit this window (services will continue running)...
pause >nul
