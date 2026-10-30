#!/bin/bash
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores
export TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}'
D=scripts/trp-tarjetas
rm -f $D/fin3.txt
for t in f769a402 fbe60cbb adcb3e20; do
  ok=0
  for i in 1 2 3 4 5 6 7 8; do
    node -r ts-node/register -r tsconfig-paths/register src/scripts/ficha-partido-local.ts src/scripts/formaciones/2026-10-27-m19b-$t.json --execute > $D/m19b.$t.txt 2>&1
    if grep -q "^listo" $D/m19b.$t.txt; then echo "$t OK intento $i" >> $D/fin3.txt; ok=1; break; fi
    echo "$t intento $i: $(grep -m1 -i 'error\|abort' $D/m19b.$t.txt)" >> $D/reintentos3.txt
    sleep 20
  done
  [ $ok = 1 ] || echo "$t FALLO" >> $D/fin3.txt
done
echo FIN >> $D/fin3.txt
