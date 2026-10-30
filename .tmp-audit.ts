import { readFileSync } from 'node:fs';
import { buildCompleteMatchStats, buildCompleteStatTabs } from '@/lib/matchStatsFromEvents';

const MENOS_ES_MEJOR = new Set<string>(JSON.parse(readFileSync('.tmp-claves.json', 'utf8')));
const deportes = ['rugby','football','basketball','hockey','handball','american-football'];
const vacias = buildCompleteMatchStats([], {});

let barrasMalas = 0, filas = 0;
for (const sportId of deportes) {
    const tabs = buildCompleteStatTabs(vacias, 'Local', 'Visitante', { sportId, includeEmptyRows: true });
    const inv: string[] = [], barras: string[] = [];
    for (const tab of tabs) for (const sec of tab.sections) for (const row of sec.rows) {
        filas++;
        const invertida = MENOS_ES_MEJOR.has(row.key);
        if (invertida) inv.push(row.key);
        if (row.accent && row.valueKind !== 'percent') {
            barras.push(row.key + (invertida ? ' <-- INVERTIDA' : ''));
            if (invertida) barrasMalas++;
        }
    }
    console.log(`\n${sportId}: ${tabs.length} pestanas`);
    console.log(`  barras partidas: ${barras.join(', ') || '(ninguna)'}`);
    console.log(`  invertidas     : ${inv.join(', ') || '(ninguna)'}`);
}
console.log(`\nfilas=${filas}  barras-invertidas=${barrasMalas}`);
