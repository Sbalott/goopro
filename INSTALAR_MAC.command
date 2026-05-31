#!/bin/bash
# GooPro - Sbalott Ecosystem - Instalador Mac/Linux
# Doble clic para ejecutar en Mac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

clear
echo ""
echo "  ============================================"
echo "   GooPro | Sbalott Ecosystem"
echo "   Instalador para macOS / Linux"
echo "  ============================================"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js no está instalado."
    echo ""
    echo "  Opciones para instalar:"
    echo "  • Mac:   brew install node"
    echo "  • O descarga desde: https://nodejs.org"
    echo ""
    # Abrir web en Mac
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open https://nodejs.org
    fi
    read -p "  Presiona Enter para salir..."
    exit 1
fi

echo "  [OK] Node.js detectado: $(node --version)"
echo ""

# Instalar dependencias
echo "  [1/3] Instalando dependencias npm..."
npm install --silent
if [ $? -ne 0 ]; then
    echo "  [ERROR] Falló la instalación."
    read -p "  Presiona Enter para salir..."
    exit 1
fi
echo "  [OK] Dependencias instaladas."
echo ""

# Crear alias en escritorio (Mac)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  [2/3] Creando acceso en el Escritorio..."
    DESKTOP="$HOME/Desktop"
    LAUNCHER="$DESKTOP/GooPro.command"
    cat > "$LAUNCHER" << EOF
#!/bin/bash
cd "$SCRIPT_DIR"
echo "Iniciando GooPro..."
open http://localhost:3000
node server/index.js
EOF
    chmod +x "$LAUNCHER"
    echo "  [OK] Acceso creado en el Escritorio: GooPro.command"
else
    echo "  [2/3] Saltando acceso de escritorio (Linux)..."
fi
echo ""

# Lanzar
echo "  [3/3] Iniciando GooPro..."
echo ""
echo "  ============================================"
echo "   Servidor: http://localhost:3000"
echo "   Presiona Ctrl+C para detener"
echo "  ============================================"
echo ""

# Abrir navegador
sleep 1
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
fi

node server/index.js
