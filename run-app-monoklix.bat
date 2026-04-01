@echo off
title MONOKLIX App - port 8080
cd /d "%~dp0"
echo.
echo ================================================================
echo WEB MONOKLIX.COM
echo ================================================================
echo.
npm run dev:monoklix
pause
