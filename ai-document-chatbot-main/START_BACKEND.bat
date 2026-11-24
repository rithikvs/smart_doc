@echo off
chcp 65001 >nul
title Document Chatbot Backend Server
color 0A
echo ========================================
echo   Document Chatbot Backend Server
echo ========================================
echo.
cd /d "%~dp0backend"
echo Current directory: %CD%
echo.
echo Checking for .env file...
if not exist ".env" (
    echo WARNING: .env file not found!
    echo Please create .env file with GOOGLE_API_KEY
    echo.
)
echo.
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

if exist "venv\Scripts\activate.bat" (
    echo Activating Python virtual environment (venv)...
    call venv\Scripts\activate.bat
    echo Starting FastAPI server...
    echo Server will be available at: http://127.0.0.1:8000
    echo Press CTRL+C to stop the server
    echo.
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) else (
    echo Virtual environment not found, falling back to system Python...
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
)
pause
