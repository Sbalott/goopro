@echo off
title GooPro - Sbalott Ecosystem - Instalador
color 0B
cls
cd /d "%~dp0"
echo.
echo  ============================================
echo   GooPro ^| Sbalott Ecosystem
echo   Instalador para Windows
echo  ============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js no esta instalado.
    echo  Descarga desde https://nodejs.org (version LTS)
    echo.
    pause
    start https://nodejs.org
    exit /b 1
)
echo  [OK] Node.js: && node --version
echo.

echo  [1/2] Instalando dependencias (puede tardar 1-2 min)...
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Fallo la instalacion.
    echo  Intenta click derecho - Ejecutar como Administrador
    pause
    exit /b 1
)
echo  [OK] Dependencias instaladas.
echo.

echo  [2/2] Creando acceso directo en el Escritorio...
set SHORTCUT=%USERPROFILE%\Desktop\GooPro.bat
(
echo @echo off
echo title GooPro - Sbalott Ecosystem
echo color 0B
echo cd /d "%~dp0"
echo echo GooPro iniciando...
echo echo Abre: http://localhost:3000
echo start "" "http://localhost:3000"
echo node server\index.js
echo pause
) > "%SHORTCUT%"
echo  [OK] Acceso creado en Escritorio: GooPro.bat
echo.

echo  ============================================
echo   LISTO! Iniciando GooPro...
echo   Navegador: http://localhost:3000
echo   Ctrl+C para detener
echo  ============================================
echo.
timeout /t 2 >nul
start "" "http://localhost:3000"
node server\index.js
pause
