@echo off
setlocal enabledelayedexpansion

:: Try to set UTF-8 encoding, but don't fail if it doesn't work
chcp 65001 >nul 2>&1

title Installation - MONOKLIX
color 0A

echo.
echo ================================================================
echo                  MONOKLIX - Installation
echo ================================================================
echo.

cd /d "%~dp0"
if errorlevel 1 (
    echo [ERROR] Failed to change directory!
    pause
    exit /b 1
)

:: Check if Node.js is installed
echo [INFO] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [INFO] Node.js found
node --version
if errorlevel 1 (
    echo [WARNING] Failed to get Node.js version
)
echo.

:: Check if Python is installed
echo [INFO] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo Please install Python from https://www.python.org
    echo.
    pause
    exit /b 1
)
echo [INFO] Python found
python --version
if errorlevel 1 (
    echo [WARNING] Failed to get Python version
)
echo.

:: Check if pip is installed
echo [INFO] Checking pip...
where pip >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pip not found!
    echo Please install pip (usually comes with Python)
    echo.
    pause
    exit /b 1
)
echo [INFO] pip found
pip --version
if errorlevel 1 (
    echo [WARNING] Failed to get pip version
)
echo.

echo ================================================================
echo            [1/4] Installing Root Dependencies (React)
echo ================================================================
echo.
cd /d "%~dp0"
if exist "package.json" (
    echo [INFO] Installing npm packages for React app...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install root dependencies!
        pause
        exit /b 1
    )
    echo [SUCCESS] Root dependencies installed successfully
) else (
    echo [WARNING] package.json not found in root folder
)
echo.

echo ================================================================
echo          [2/4] Installing Server Dependencies (Node.js)
echo ================================================================
echo.
cd /d "%~dp0server"
if exist "package.json" (
    echo [INFO] Installing npm packages for Node.js server...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install server dependencies!
        pause
        exit /b 1
    )
    echo [SUCCESS] Server dependencies installed successfully
) else (
    echo [WARNING] package.json not found in server folder
)
echo.

echo ================================================================
echo       [3/4] Installing Backend Dependencies (Python)
echo ================================================================
echo.
cd /d "%~dp0backend"
if exist "requirements.txt" (
    :: Check if venv exists
    if exist "venv\" (
        echo [INFO] Virtual environment already exists
    ) else (
        echo [INFO] Creating virtual environment...
        python -m venv venv
        if errorlevel 1 (
            echo [ERROR] Failed to create virtual environment!
            pause
            exit /b 1
        )
        echo [SUCCESS] Virtual environment created successfully
    )
    echo.

    :: Activate venv
    echo [INFO] Activating virtual environment...
    if exist "venv\Scripts\activate.bat" (
        call venv\Scripts\activate.bat
        if errorlevel 1 (
            echo [ERROR] Failed to activate virtual environment!
            pause
            exit /b 1
        )
    ) else (
        echo [ERROR] Virtual environment activation script not found!
        pause
        exit /b 1
    )
    echo.

    :: Upgrade pip
    echo [INFO] Upgrading pip...
    python -m pip install --upgrade pip
    if errorlevel 1 (
        echo [WARNING] Failed to upgrade pip, continuing anyway...
    )
    echo.

    :: Install requirements
    echo [INFO] Installing dependencies from requirements.txt...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [SUCCESS] Backend dependencies installed successfully
    echo.

    :: Install Playwright browsers
    echo [INFO] Installing Playwright browsers...
    echo.
    python -m playwright install chromium
    if errorlevel 1 (
        echo [WARNING] Failed to install Playwright browser
        echo Try running manually: python -m playwright install chromium
    ) else (
        echo [SUCCESS] Playwright browser installed successfully
    )
) else (
    echo [WARNING] requirements.txt not found in backend folder
)
echo.

echo ================================================================
echo    [4/4] Installing captcha_server (Bridge + Auto Generator)
echo ================================================================
echo.
cd /d "%~dp0captcha_server"
if exist "package.json" (
    echo [INFO] Installing npm packages for captcha_server...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install captcha_server dependencies!
        pause
        exit /b 1
    )
    echo [SUCCESS] captcha_server dependencies installed successfully
) else (
    echo [WARNING] package.json not found in captcha_server folder
)
echo.

cd /d "%~dp0"

echo ================================================================
echo                    INSTALLATION COMPLETE!
echo ================================================================
echo.
echo [SUCCESS] All dependencies installed successfully!
echo.
echo Installation Summary:
echo - Root (React):        npm packages installed
echo - Server (Node.js):    npm packages installed
echo - Backend (Python):    pip packages installed (with virtual environment)
echo - captcha_server:      npm packages installed (bridge + auto-generator)
echo.
echo Use start.bat to run all services (web). For desktop one-click after install.bat:
echo   npm run electron:dev     — build UI + Electron; auto-starts Flask :1247, proxy :3001, bridge :6003
echo   npm run electron:build   — portable .exe under release\ (needs Python + Node on the PC for backend stack)
echo.
pause
