/**
 * LOS DOS PLANTELES DE UN PARTIDO, reconstruidos de la cosecha.
 *
 * El puntaje mide la PARTE que cada jugador se llevo del total de su equipo,
 * asi que todo script que puntue necesita saber quien juega con quien y cuanto
 * hizo el plantel entero.
 *
 * En produccion esto es trivial —`planillaDelPartido` recibe `lineups.home` y
 * `lineups.away` por separado— pero la cosecha guarda una fila por jugador sin
 * decir de que lado esta. Se reconstruye por el orden: las filas se escribieron
 * como `[...local, ...visitante]`, asi que el corte cae donde el numero de
 * camiseta deja de subir.
 *
 * Un partido cuyo corte no deje dos planteles creibles se descarta. Adivinarlo
 * seria peor: un plantel mal partido contamina los totales de los dos.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

/** Cuantos jugadores hacen un plantel creible. Menos que esto no se usa. */
const MINIMO_POR_PLANTEL = 12;

/** Lee la cosecha y devuelve los partidos con sus dos planteles. */
export async function partidosDeLaCosecha(ruta) {
    const porPartido = new Map();
    const rl = createInterface({ input: createReadStream(ruta), crlfDelay: Infinity });
    for await (const linea of rl) {
        if (!linea.trim()) continue;
        let fila;
        try { fila = JSON.parse(linea); } catch { continue; }
        if (fila.marca || fila.number == null) continue;
        if (!porPartido.has(fila.match_id)) porPartido.set(fila.match_id, []);
        porPartido.get(fila.match_id).push(fila);
    }

    const salida = [];
    let descartados = 0;
    for (const [matchId, filas] of porPartido) {
        let corte = -1;
        for (let i = MINIMO_POR_PLANTEL; i < filas.length; i++) {
            if (filas[i].number < filas[i - 1].number) { corte = i; break; }
        }
        if (corte < 0) { descartados++; continue; }

        const local = filas.slice(0, corte);
        const visitante = filas.slice(corte);
        if (local.length < MINIMO_POR_PLANTEL || visitante.length < MINIMO_POR_PLANTEL) { descartados++; continue; }

        salida.push({
            matchId,
            planteles: [local, visitante].map((jugadores) => ({ jugadores, totales: totalesDe(jugadores) })),
        });
    }
    return { partidos: salida, descartados };
}

/** Lo que hizo el plantel entero, rubro por rubro. Es el denominador. */
export function totalesDe(jugadores) {
    const totales = {};
    for (const jugador of jugadores) {
        for (const [metricId, valor] of Object.entries(jugador.stats ?? {})) {
            if (!Number.isFinite(valor)) continue;
            totales[metricId] = (totales[metricId] ?? 0) + valor;
        }
    }
    return totales;
}
