// EL BARRIDO DE LA MAYOR, INSTRUMENTADO.
//
// Esto NO calibra nada. Mide.
//
// El dato que lo motiva: con la receta del digest, solo el 4% de las carreras
// llega a la selección (2/30 en pilar, 1/30 en wing, 1/30 en apertura). Parece
// bajo. La pregunta es POR QUÉ es bajo, y hay dos respuestas posibles que piden
// arreglos opuestos:
//
//   · UN UMBRAL MAL PUESTO — la barra está tres puntos más arriba de donde
//     debería. Se corrige moviendo un número.
//   · UN PRODUCTO DE COMPUERTAS — pide media ≥ X y cartel ≥ Y y club de cierto
//     nivel y haber sobrevivido hasta cierta edad, y cada una pasa el 50%: te da
//     6% sin que ninguna esté mal sola. Se corrige haciendo las compuertas
//     SECUENCIALES en vez de simultáneas, y mover umbrales no alcanza.
//
// Este archivo produce la tabla con la que se decide cuál de las dos es. Por eso
// no tiene bandas de calibración: si las tuviera, el día que alguien mueva un
// umbral a propósito este test se pondría en rojo y taparía justo la medición
// que hace falta leer. Lo único que se afirma es la CONTABILIDAD —que toda
// carrera quede clasificada exactamente una vez— y que el barrido haya
// producido datos.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput, SquadTrack } from '../../types/captain.ts';
import type { TimeSlot } from '../../types/currencies.ts';
import type { PositionFamilyId } from '../../types/player.ts';
import { SQUAD_TRACKS } from '../../types/captain.ts';
import { ALL_FAMILIES } from '../../data/positions.ts';
import { hasUnion } from '../../data/catalogs.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { getPendingEvent } from '../event-selector.ts';
import { thresholdFor } from '../national-team.ts';

/** Treinta carreras por familia: doscientas cuarenta en total. */
const POR_FAMILIA = 30;

/** El mismo reparto de un jugador normal que usa `calibration.test.ts`. */
const REPARTO: TimeSlot[] = ['entrenar', 'entrenar', 'trabajar', 'club', 'familia', 'gimnasio'];

/**
 * Lo que el gimnasio le suma a la media con la que te MIRAN.
 *
 * Está duplicado de `simulate-season.ts` a propósito y con los ojos abiertos: si
 * se importara, este barrido mediría "lo que el motor dice que hace" en vez de
 * "lo que el motor hace". Si algún día no coinciden, el que tiene razón es
 * `simulate-season.ts` y este número se actualiza a mano.
 */
const EMPUJE_POR_FICHA_GIMNASIO = 1.2;

/** Por qué esta carrera no llegó a la mayor. */
type Compuerta =
    /** Llegó. */
    | 'llego'
    /** No hay federación en su país: no existe la escalera. */
    | 'sin-union'
    /** El techo sorteado a los 18 ya estaba por debajo de la barra. Estaba decidido al nacer. */
    | 'techo-corto'
    /** Tenía el techo, pero nunca llegó a tocarlo: creció poco o se retiró antes. */
    | 'no-alcanzo-su-techo';

interface Carrera {
    family: PositionFamilyId;
    compuerta: Compuerta;
    /** La media que le pide la mayor, con su unión y su puesto ya descontados. */
    umbral: number;
    /** El techo sorteado al nacer. */
    techo: number;
    /** La media más alta con la que lo miraron nunca (gimnasio incluido). */
    pico: number;
    mejorTrack: SquadTrack;
    temporadas: number;
}

/**
 * Juega una carrera y la clasifica.
 *
 * El pico se mide JUSTO ANTES de simular, que es el instante en que
 * `simulate-season` decide el escalón: la media de la trayectoria es la de
 * DESPUÉS de envejecer, y usarla correría la medición una temporada.
 */
function jugar(seed: number, family: PositionFamilyId): Carrera {
    const input: CreateCaptainInput = { name: 'X', surname: 'Y', family, countryCode: 'ar' };
    let s = createInitialCaptain(input, seed);

    const umbral = thresholdFor('nacional', s.player);
    const techo = s.player.potential;
    let pico = 0;
    let vuelta = 0;

    while (s.phase !== 'retired' && vuelta < 60) {
        for (const slot of REPARTO) s = captainReducer(s, { type: 'SPEND_TIME', slot });
        s = captainReducer(s, { type: 'CONFIRM_TIME' });

        let guarda = 0;
        while (s.phase === 'moment' && guarda < 4) {
            const kind = s.pendingMoment?.kind;
            s = kind === 'bunker'
                ? captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } })
                : kind === 'jackal'
                    ? captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'jackal', reactions: [240, 240, 240] } })
                    : captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: 'legal', at: 0.5 } });
            guarda += 1;
        }

        // Acá está parado el jugador cuando el seleccionador lo mira.
        pico = Math.max(pico, s.player.ovr + (s.time.spent.gimnasio ?? 0) * EMPUJE_POR_FICHA_GIMNASIO);

        s = captainReducer(s, { type: 'ADVANCE' });
        if (s.phase === 'event') {
            const evento = getPendingEvent(s)!;
            s = captainReducer(s, { type: 'CHOOSE', optionId: evento.options[vuelta % evento.options.length].id });
        }
        vuelta += 1;
    }

    const mejorTrack = s.national.bestTrack;
    const techoConGimnasio = techo + REPARTO.filter((x) => x === 'gimnasio').length * EMPUJE_POR_FICHA_GIMNASIO;

    const compuerta: Compuerta = !hasUnion(s.player.countryCode) ? 'sin-union'
        : mejorTrack === 'nacional' ? 'llego'
            : techoConGimnasio < umbral ? 'techo-corto'
                : 'no-alcanzo-su-techo';

    return { family, compuerta, umbral, techo, pico, mejorTrack, temporadas: s.history.length };
}

const MUESTRA: Carrera[] = (() => {
    const out: Carrera[] = [];
    for (const family of ALL_FAMILIES) {
        for (let i = 0; i < POR_FAMILIA; i += 1) out.push(jugar(4100 + i * 13, family));
    }
    return out;
})();

const pct = (n: number, total: number): string => `${((n / total) * 100).toFixed(1)}%`;

// ═══════════════════════════════════════════════════════════════════════════
//  La contabilidad — lo único que se afirma
// ═══════════════════════════════════════════════════════════════════════════

test('toda carrera queda clasificada exactamente una vez', () => {
    assert.equal(MUESTRA.length, ALL_FAMILIES.length * POR_FAMILIA);

    const COMPUERTAS: Compuerta[] = ['llego', 'sin-union', 'techo-corto', 'no-alcanzo-su-techo'];
    const suma = COMPUERTAS.reduce((acc, c) => acc + MUESTRA.filter((r) => r.compuerta === c).length, 0);
    assert.equal(suma, MUESTRA.length, 'hay carreras sin clasificar o clasificadas dos veces');

    // Y la clasificación tiene que coincidir con el estado: nadie marcado como
    // "llegó" sin haber pisado la mayor, y al revés.
    for (const r of MUESTRA) {
        assert.equal(
            r.compuerta === 'llego',
            r.mejorTrack === 'nacional',
            `${r.family}: la clasificación no coincide con el mejor escalón (${r.mejorTrack})`,
        );
    }
});

test('el que llegó a la mayor pasó la barra, y el que no llegó no la pasó', () => {
    // Es la verificación de que la compuerta medida ES la compuerta real. Si
    // esto falla, la tabla de abajo está midiendo otra cosa que la que dice.
    for (const r of MUESTRA) {
        if (r.compuerta === 'llego') {
            assert.ok(r.pico >= r.umbral, `${r.family}: llegó con pico ${r.pico.toFixed(1)} y umbral ${r.umbral.toFixed(1)}`);
        } else if (r.compuerta !== 'sin-union') {
            assert.ok(r.pico < r.umbral, `${r.family}: no llegó pero superó la barra (${r.pico.toFixed(1)} ≥ ${r.umbral.toFixed(1)})`);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  La medición — la tabla que hay que leer
// ═══════════════════════════════════════════════════════════════════════════

test('BARRIDO: qué compuerta frena a cada carrera', () => {
    const total = MUESTRA.length;
    const lineas: string[] = [];

    lineas.push('');
    lineas.push(`═══ ${total} carreras (${POR_FAMILIA} por familia), reparto normal ═══`);
    lineas.push('');

    // ── 1 · El embudo de la escalera ────────────────────────────────────────
    // Los escalones son barras de media crecientes sobre el MISMO número, así
    // que este embudo es directamente la distribución de picos contra cinco
    // barras. Si cada escalón cortara a la mitad, sería el producto de
    // compuertas de la hipótesis; si el corte está concentrado en uno, es un
    // umbral.
    lineas.push('EMBUDO — hasta dónde llegó cada carrera');
    for (const track of SQUAD_TRACKS) {
        const n = MUESTRA.filter((r) => r.mejorTrack === track).length;
        const acumulado = MUESTRA.filter((r) => SQUAD_TRACKS.indexOf(r.mejorTrack) >= SQUAD_TRACKS.indexOf(track)).length;
        lineas.push(`  ${track.padEnd(9)} se quedó ahí: ${String(n).padStart(3)} (${pct(n, total).padStart(6)})   llegó al menos: ${String(acumulado).padStart(3)} (${pct(acumulado, total).padStart(6)})`);
    }

    // ── 2 · La compuerta que frenó ──────────────────────────────────────────
    lineas.push('');
    lineas.push('COMPUERTA — por qué no llegó a la mayor');
    for (const c of ['llego', 'sin-union', 'techo-corto', 'no-alcanzo-su-techo'] as Compuerta[]) {
        const n = MUESTRA.filter((r) => r.compuerta === c).length;
        lineas.push(`  ${c.padEnd(20)} ${String(n).padStart(3)} (${pct(n, total).padStart(6)})`);
    }

    // ── 3 · Cuánto faltó ────────────────────────────────────────────────────
    // Si a los que no llegaron les faltaron dos puntos, la barra está apenas
    // alta. Si les faltaron doce, el problema no es la barra sino la campana de
    // potencial que la alimenta.
    const fallados = MUESTRA.filter((r) => r.compuerta === 'techo-corto' || r.compuerta === 'no-alcanzo-su-techo');
    const faltantes = fallados.map((r) => r.umbral - r.pico).sort((a, b) => a - b);
    const cuantil = (q: number): number => faltantes[Math.min(faltantes.length - 1, Math.floor(faltantes.length * q))];

    lineas.push('');
    lineas.push('CUÁNTO FALTÓ — puntos de media entre el pico y la barra');
    lineas.push(`  mediana ${cuantil(0.5).toFixed(1)}   p25 ${cuantil(0.25).toFixed(1)}   p10 ${cuantil(0.1).toFixed(1)}   mínimo ${faltantes[0].toFixed(1)}`);
    for (const margen of [1, 2, 3, 5]) {
        const n = faltantes.filter((f) => f <= margen).length;
        lineas.push(`  a ${margen} punto${margen === 1 ? '' : 's'} o menos de la barra: ${String(n).padStart(3)} (${pct(n, total).padStart(6)} de todas)`);
    }

    // ── 4 · Por familia ─────────────────────────────────────────────────────
    // La barra no es la misma para todos: la escasez del puesto la baja hasta
    // dos puntos. Partir por familia dice si el 4% es parejo o si hay puestos
    // que directamente no entran.
    lineas.push('');
    lineas.push('POR FAMILIA — barra, pico medio y llegadas');
    for (const family of ALL_FAMILIES) {
        const sub = MUESTRA.filter((r) => r.family === family);
        const llegaron = sub.filter((r) => r.compuerta === 'llego').length;
        const picoMedio = sub.reduce((a, r) => a + r.pico, 0) / sub.length;
        const techoMedio = sub.reduce((a, r) => a + r.techo, 0) / sub.length;
        lineas.push(
            `  ${family.padEnd(14)} barra ${sub[0].umbral.toFixed(1).padStart(5)}   techo medio ${techoMedio.toFixed(1).padStart(5)}`
            + `   pico medio ${picoMedio.toFixed(1).padStart(5)}   llegaron ${String(llegaron).padStart(2)}/${sub.length}`,
        );
    }
    lineas.push('');

    console.log(lineas.join('\n'));

    // El barrido tiene que haber producido datos. Nada más: mover un umbral no
    // puede poner en rojo el test que existe para leer qué pasa cuando lo movés.
    assert.ok(faltantes.length > 0, 'el barrido no produjo una sola carrera que no llegara');
});
