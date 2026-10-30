#!/bin/bash
# Reintenta la carga hasta que cierre con "listo" (un fetch failed de red la corta a mitad; es idempotente).
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores
export TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}'
D=scripts/cordoba-bloque-juv-tarjetas
for k in m16 m17; do
  ok=0
  for i in 1 2 3 4 5 6 7 8; do
    node -r ts-node/register -r tsconfig-paths/register src/scripts/ficha-partido-local.ts src/scripts/formaciones/2026-10-22-$k-a-tarjetas.json --execute > $D/ejecucion.$k.txt 2>&1
    if grep -q "^listo" $D/ejecucion.$k.txt; then echo "$k OK intento $i" >> $D/fin.txt; ok=1; break; fi
    echo "$k intento $i fallo: $(grep -m1 'Error' $D/ejecucion.$k.txt)" >> $D/reintentos.txt
    sleep 20
  done
  [ $ok = 1 ] || echo "$k FALLO tras 8 intentos" >> $D/fin.txt
done
echo FIN >> $D/fin.txt
