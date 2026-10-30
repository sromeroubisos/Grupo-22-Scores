#!/bin/bash
# Reintenta la carga hasta que cierre con "listo" (un fetch failed de red la corta a mitad; es idempotente).
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores
export TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}'
D=scripts/cordoba-m15-b-tarjetas
for i in 1 2 3 4 5 6 7 8; do
  node -r ts-node/register -r tsconfig-paths/register src/scripts/ficha-partido-local.ts src/scripts/formaciones/2026-10-30-m15-b-tarjetas.json --execute > $D/ejecucion.txt 2>&1
  if grep -q "^listo" $D/ejecucion.txt; then echo "OK intento $i" >> $D/fin.txt; echo FIN >> $D/fin.txt; exit 0; fi
  echo "intento $i fallo: $(grep -m1 'Error' $D/ejecucion.txt)" >> $D/reintentos.txt
  sleep 20
done
echo "FALLO tras 8 intentos" >> $D/fin.txt; echo FIN >> $D/fin.txt
