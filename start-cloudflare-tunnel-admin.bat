@echo off
title Cloudflare Tunnel - Token API (Administrator)
color 0B

:: Request administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ================================================================
echo    Cloudflare Tunnel - Token API (Administrator Mode)
echo ================================================================
echo.

:: Check Administrator path first (most common for server environments)
if exist "C:\Users\Administrator\.cloudflared\cloudflared.exe" (
    echo [INFO] Found cloudflared.exe in Administrator directory
    set CLOUDFLARED_PATH=C:\Users\Administrator\.cloudflared\cloudflared.exe
    goto :run_tunnel
)

:: Check if cloudflared.exe exists in current directory
if exist "cloudflared.exe" (
    echo [INFO] Found cloudflared.exe in current directory
    set CLOUDFLARED_PATH=cloudflared.exe
    goto :run_tunnel
)

:: Check if cloudflared is in system PATH
where cloudflared.exe >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [INFO] Found cloudflared.exe in system PATH
    set CLOUDFLARED_PATH=cloudflared.exe
    goto :run_tunnel
)

:: Check current user directory
if exist "C:\Users\%USERNAME%\.cloudflared\cloudflared.exe" (
    echo [INFO] Found cloudflared.exe in user directory
    set CLOUDFLARED_PATH=C:\Users\%USERNAME%\.cloudflared\cloudflared.exe
    goto :run_tunnel
)

:: If not found, show error
echo [ERROR] cloudflared.exe not found
echo.
echo Please install cloudflared or ensure it's in one of these locations:
echo   - Current directory: cloudflared.exe
echo   - System PATH
echo   - C:\Users\Administrator\.cloudflared\cloudflared.exe
echo   - C:\Users\%USERNAME%\.cloudflared\cloudflared.exe
echo.
echo Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
echo.
pause
exit /b 1

:run_tunnel
echo.
echo [INFO] Starting Cloudflare Tunnel...
echo [INFO] Tunnel Name: token-api
echo [INFO] Running as Administrator
echo [INFO] Command: %CLOUDFLARED_PATH% tunnel run token-api
echo.
echo ================================================================
echo.

:: Run the tunnel
cd /d "%~dp0"
%CLOUDFLARED_PATH% tunnel run token-api

:: If tunnel exits, show message
echo.
echo ================================================================
echo [INFO] Cloudflare Tunnel has stopped
echo ================================================================
pause



