#!/bin/bash
# Reintenta la carga hasta que el script cierre con "listo" (un fetch failed de red lo corta a mitad de camino; es idempotente).
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores
export TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}'
for i in 1 2 3 4 5 6 7 8; do
  node -r ts-node/register -r tsconfig-paths/register src/scripts/ficha-partido-local.ts src/scripts/formaciones/2026-10-22-pre-b-tarjetas.json --execute > scripts/cordoba-pre-b-tarjetas/ejecucion.txt 2>&1
  grep -q "^listo" scripts/cordoba-pre-b-tarjetas/ejecucion.txt && { echo "OK intento $i" > scripts/cordoba-pre-b-tarjetas/fin.txt; exit 0; }
  echo "intento $i fallo: $(grep -m1 '^Error' scripts/cordoba-pre-b-tarjetas/ejecucion.txt)" >> scripts/cordoba-pre-b-tarjetas/reintentos.txt
  sleep 20
done
echo "FALLO tras 8 intentos" > scripts/cordoba-pre-b-tarjetas/fin.txt
