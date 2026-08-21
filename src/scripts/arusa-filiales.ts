/**
 * Mapa de FILIALES de ARUSA: qué equipos de qué competencias pertenecen al
 * mismo club de la fuente.
 *
 *   npx tsx src/scripts/arusa-filiales.ts
 *
 * En Leverade cada `team` cuelga de un `club`. Dos entradas con el mismo club
 * son el mismo club con otro plantel — "PWCC" juega Primera con su primer
 * equipo y Cuarta con el B, y "Old Boys Azul"/"Old Boys Blanco" son dos
 * equipos del mismo club en el mismo torneo juvenil.
 *
 * Eso NO se fusiona: en G22 las filiales van separadas (la ficha del club
 * mezclaría un 81-0 de Cuarta con la tabla de Primera). El script solo informa;
 * decidir el id de cada filial es cosa del alta.
 */
import { fetchCabecera } from '../lib/integrations/arusa/client.ts';

const TEMPORADA_2026: { id: string; rotulo: string }[] = [
    { id: '1328550', rotulo: 'Primera' },
    { id: '1328552', rotulo: 'Segunda' },
    { id: '1328553', rotulo: 'Tercera' },
    { id: '1328554', rotulo: 'Cuarta' },
    { id: '1329068', rotulo: 'Femenino XV' },
    { id: '1329067', rotulo: 'Masters M+35' },
    { id: '1332975', rotulo: 'M18 Primera' },
    { id: '1332976', rotulo: 'M16 Primera' },
    { id: '1332977', rotulo: 'M14 Primera' },
    { id: '1332978', rotulo: 'M13 Primera' },
    { id: '1332982', rotulo: 'M18 Segunda' },
    { id: '1332984', rotulo: 'M16 Segunda' },
    { id: '1332985', rotulo: 'M14 Segunda' },
];

async function main() {
    // club de Leverade → { nombres usados, dónde juega }
    const porClub = new Map<string, { nombres: Set<string>; donde: string[] }>();

    for (const c of TEMPORADA_2026) {
        const t = await fetchCabecera(c.id);
        for (const [teamId, nombre] of Object.entries(t.equipos)) {
            const club = t.clubes[teamId] ?? `sin-club:${teamId}`;
            if (!porClub.has(club)) porClub.set(club, { nombres: new Set(), donde: [] });
            const fila = porClub.get(club)!;
            fila.nombres.add(nombre);
            fila.donde.push(`${c.rotulo}:${nombre}`);
        }
    }

    const conVarias = [...porClub.entries()]
        .filter(([, v]) => v.donde.length > 1)
        .sort((a, b) => b[1].donde.length - a[1].donde.length);

    console.log(`Clubes de ARUSA: ${porClub.size} · con más de un equipo inscripto: ${conVarias.length}\n`);
    for (const [club, v] of conVarias) {
        const nombres = [...v.nombres];
        const marca = nombres.length > 1 ? ' ← NOMBRES DISTINTOS' : '';
        console.log(`club ${club}${marca}`);
        console.log(`  nombres: ${nombres.join(' | ')}`);
        console.log(`  juega:   ${v.donde.join(' · ')}\n`);
    }

    const solos = [...porClub.entries()].filter(([, v]) => v.donde.length === 1);
    console.log(`Con un solo equipo (${solos.length}): ${solos.map(([, v]) => [...v.nombres][0]).sort().join(' · ')}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
