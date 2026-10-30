#!/bin/bash
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores
export TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}'
D=scripts/trp-tarjetas
rm -f $D/fin2.txt
for t in ee59eaf4 8106fbcf 594fcb55 9bd1fc54 62bf0694 683363b8; do
  ok=0
  for i in 1 2 3 4 5 6 7 8; do
    node -r ts-node/register -r tsconfig-paths/register src/scripts/ficha-partido-local.ts src/scripts/formaciones/2026-10-27-final-$t.json --execute > $D/final.$t.txt 2>&1
    if grep -q "^listo" $D/final.$t.txt; then echo "$t OK intento $i" >> $D/fin2.txt; ok=1; break; fi
    echo "$t intento $i: $(grep -m1 -i 'error\|abort' $D/final.$t.txt)" >> $D/reintentos2.txt
    sleep 20
  done
  [ $ok = 1 ] || echo "$t FALLO" >> $D/fin2.txt
done
echo FIN >> $D/fin2.txt
