@echo off
title GooPro - Sbalott Ecosystem
color 0B
cd /d "%~dp0"
cls
echo.
echo  GooPro - Sbalott Ecosystem
echo  ============================================
if not exist "node_modules" (
    color 0E
    echo  [!] Ejecuta primero: INSTALAR_WINDOWS.bat
    pause & exit /b 1
)
echo  Servidor en: http://localhost:3000
echo  Ctrl+C para detener
echo  ============================================
echo.
timeout /t 1 >nul
start "" "http://localhost:3000"
node server\index.js
pause
