#!/bin/bash
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "GooPro iniciando..."
sleep 1
open http://localhost:3000
node server/index.js
