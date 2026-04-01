@echo off
title Cloudflare Tunnel - Token API
color 0A

echo ================================================================
echo          Cloudflare Tunnel - Token API
echo ================================================================
echo.

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

:: Check common cloudflared installation paths
if exist "C:\Users\%USERNAME%\.cloudflared\cloudflared.exe" (
    echo [INFO] Found cloudflared.exe in user directory
    set CLOUDFLARED_PATH=C:\Users\%USERNAME%\.cloudflared\cloudflared.exe
    goto :run_tunnel
)

if exist "C:\Users\Administrator\.cloudflared\cloudflared.exe" (
    echo [INFO] Found cloudflared.exe in Administrator directory
    set CLOUDFLARED_PATH=C:\Users\Administrator\.cloudflared\cloudflared.exe
    goto :run_tunnel
)

:: If not found, ask user for path
echo [WARNING] cloudflared.exe not found automatically
echo.
echo Please specify the full path to cloudflared.exe:
set /p CLOUDFLARED_PATH="Path: "

if not exist "%CLOUDFLARED_PATH%" (
    echo [ERROR] cloudflared.exe not found at specified path: %CLOUDFLARED_PATH%
    echo.
    echo Please install cloudflared or provide the correct path.
    echo Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
    echo.
    pause
    exit /b 1
)

:run_tunnel
echo.
echo [INFO] Starting Cloudflare Tunnel...
echo [INFO] Tunnel Name: token-api
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



