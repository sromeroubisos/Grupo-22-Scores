#!/bin/bash
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores
export TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}'
D=scripts/trp-tarjetas
for t in 594fcb55 9bd1fc54 62bf0694 683363b8; do
  ok=0
  for i in 1 2 3 4 5 6 7 8; do
    node -r ts-node/register -r tsconfig-paths/register src/scripts/ficha-partido-local.ts src/scripts/formaciones/2026-10-27-tarjetas-$t.json --execute > $D/ejecucion.$t.txt 2>&1
    if grep -q "^listo" $D/ejecucion.$t.txt; then echo "$t OK intento $i" >> $D/fin.txt; ok=1; break; fi
    echo "$t intento $i fallo: $(grep -m1 'Error' $D/ejecucion.$t.txt)" >> $D/reintentos.txt
    sleep 20
  done
  [ $ok = 1 ] || echo "$t FALLO tras 8 intentos" >> $D/fin.txt
done
echo FIN >> $D/fin.txt
