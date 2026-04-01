@echo off
title Cloudflare Tunnel - Token API (Simple)
color 0A

echo Starting Cloudflare Tunnel: token-api
echo.

:: Use Administrator path (most common for server environments)
if exist "C:\Users\Administrator\.cloudflared\cloudflared.exe" (
    C:\Users\Administrator\.cloudflared\cloudflared.exe tunnel run token-api
    goto :end
)

:: Fallback to current directory
if exist "cloudflared.exe" (
    cloudflared.exe tunnel run token-api
    goto :end
)

:: Fallback to PATH
cloudflared.exe tunnel run token-api

:end



