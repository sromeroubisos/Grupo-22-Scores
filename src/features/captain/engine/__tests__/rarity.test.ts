// CADA CUÁNTO LE PASA AL JUGADOR UNA COSA GRANDE.
//
// Es la tercera especie de test del §1.10 —calibración— y no la primera: no
// congela valores, congela una forma. Y la forma que congela es una TASA POR
// CARRERA, que es el punto entero de este archivo.
//
// ── POR QUÉ NO SE MIDE EL PARÁMETRO (§1.8) ─────────────────────────────────
// `RARITY_BAND.oro` vale 3 sobre 100 y verificar ese 3 no cuesta nada: es un
// `assert.equal` contra la constante que uno mismo escribió. No dice nada. Entre
// ese 3 y la pregunta que importa —«¿cuántas carreras ven una oportunidad de
// oro?»— hay tres cosas que el número no sabe:
//
//   · `SEASON_EVENT_PROB`: el 12% de las temporadas no trae decisión.
//   · LOS GATES. Un oro con `minSeasons: 4` no existe para las primeras cuatro
//     temporadas, y una banda sin candidatos elegibles no participa del sorteo.
//   · LA LONGITUD DE LA CARRERA, que va de 12 a 18 temporadas según el puesto y
//     decide cuántos intentos hay. Con la misma banda, un pilar ve más oros que
//     un wing por pura aritmética de intentos — igual que `P ≈ 1 − (1−q)ⁿ` con
//     los carriles representativos.
//
// Las tres empujan la tasa real por debajo de la cota que da la banda. Por eso
// la banda se DERIVÓ del objetivo y lo que se audita es el resultado.
//
// ── LAS BANDAS SE AUDITAN CONTRA LA PREMISA (§1.3) ─────────────────────────
// La premisa, en una línea: UNA CARRERA TIENE QUE PODER TENER UN MOMENTO
// IRREPETIBLE, Y NO TODAS LO TIENEN. Si el oro lo ve el 90% de las carreras deja
// de ser oro y es el catálogo; si no lo ve nadie, escribimos dieciséis tarjetas
// para que no salgan nunca. Las bandas de abajo dicen eso y no «lo que da hoy».
//
// Es determinista: las semillas están fijas, así que no hay test que titile.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { EventRarity } from '../../types/event.ts';
import { ALL_FAMILIES } from '../../data/positions.ts';
import { trainingsFor } from '../../data/trainings.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
 import { playTournament } from '../../state/captain-autoplay.ts';
import { getEvent } from '../../data/events/index.ts';
import { getPendingEvent, rarityOf } from '../event-selector.ts';
import { getMomentDef, isContractKind } from '../moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../moments.ts';

/** Veinte carreras por familia: ciento sesenta en total, igual que la pirámide. */
const POR_FAMILIA = 20;

function manoImposible(kind: never): never {
    throw new Error(`El Momento pre-contrato '${String(kind)}' no tiene mano de referencia.`);
}

/** El jugador de referencia: juega bien y no regala nada. Igual que en la pirámide. */
function manoDeReferencia(state: CaptainState): MomentOutcome {
    const pendiente = state.pendingMoment!;
    if (isContractKind(pendiente.kind)) {
        return getMomentDef(pendiente.kind)!.playAt(pendiente.setup!, 'bien', 0.5);
    }
    switch (pendiente.kind) {
        case 'bunker':
            return { kind: 'bunker' };
        case 'tackle': {
            const zones = tackleZones(state.player, state.damage.cuerpo, pendiente.pressure);
            const { at, zone } = tacklePlayAt(zones, 'bien', 0.5);
            return { kind: 'tackle', zone, at };
        }
        default:
            return manoImposible(pendiente.kind);
    }
}

function cartaDeReferencia(state: CaptainState): string {
    const elegida = trainingsFor(state.player.family).find((t) => t.tier === 'media');
    assert.ok(elegida, `${state.player.family} no ofrece una carta 'media': el barrido mediría otra cosa`);
    return elegida.id;
}

interface Carrera {
    family: string;
    temporadas: number;
    /** Cuántas tarjetas de cada banda le tocaron EN TODA LA CARRERA. */
    porBanda: Record<EventRarity, number>;
}

/**
 * Juega una carrera entera y cuenta las tarjetas por banda.
 *
 * El conteo sale de `decisionLog`, que es lo que el estado guarda de verdad, y
 * no de un contador paralelo llevado por el bucle. La diferencia importa: un
 * contador propio mediría lo que este archivo cree que pasó, y el log mide lo
 * que la partida realmente registró — que es lo que después lee la trayectoria.
 *
 * El mercado se arma en el momento y no está en `ALL_EVENTS`, así que
 * `getEvent` devuelve `null` y esas filas no cuentan para ninguna banda. Es
 * correcto, y desde la 0.21.0 lo es todavía más: la tarjeta de mercado ya ni
 * siquiera pasa por `selectEvent` —corre como paso propio después de la del
 * año—, así que no compite en el sorteo por bandas ni le saca lugar a nadie.
 */
function jugar(seed: number, family: (typeof ALL_FAMILIES)[number]): Carrera {
    const input: CreateCaptainInput = { name: 'X', surname: 'Y', family, countryCode: 'ar' };
    let s = createInitialCaptain(input, seed);
    let vuelta = 0;

    while (s.phase !== 'retired') {
        if (vuelta >= 60) {
            throw new Error(`${family} con semilla ${seed}: la carrera quedó trabada en '${s.phase}'.`);
        }
        s = captainReducer(s, { type: 'CHOOSE_TRAINING', trainingId: cartaDeReferencia(s) });

        let guarda = 0;
        while (s.phase === 'moment') {
            if (guarda >= 4) throw new Error(`${family} con semilla ${seed}: trabada en un Momento.`);
            s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: manoDeReferencia(s) });
            guarda += 1;
        }

        s = playTournament(captainReducer(s, { type: 'ADVANCE' }));

        // Bucle y no `if`: la temporada trae la tarjeta del año Y la del
        // mercado, que desde la 0.21.0 corre después en vez de reemplazarla.
        // Con un `if`, la del año se quedaba sin resolver la mitad de las veces
        // y las bandas se medían sobre la mitad de las tarjetas.
        let decisiones = 0;
        while (s.phase === 'event') {
            if (decisiones >= 4) throw new Error(`${family} con semilla ${seed}: trabada en una decisión.`);
            const evento = getPendingEvent(s)!;
            s = captainReducer(s, {
                type: 'CHOOSE',
                optionId: evento.options[vuelta % evento.options.length].id,
            });
            decisiones += 1;
        }
        vuelta += 1;
    }

    const porBanda: Record<EventRarity, number> = { normal: 0, especial: 0, raro: 0, oro: 0 };
    for (const fila of s.decisionLog) {
        const evento = getEvent(fila.eventId);
        if (!evento) continue; // el mercado, que se arma en el momento
        porBanda[rarityOf(evento)] += 1;
    }

    return { family, temporadas: s.history.length, porBanda };
}

function muestra(): Carrera[] {
    const out: Carrera[] = [];
    for (const family of ALL_FAMILIES) {
        for (let i = 0; i < POR_FAMILIA; i += 1) out.push(jugar(4100 + i * 13, family));
    }
    return out;
}

const CARRERAS = muestra();

const proporcion = (f: (c: Carrera) => boolean): number =>
    CARRERAS.filter(f).length / CARRERAS.length;

const media = (f: (c: Carrera) => number): number =>
    CARRERAS.reduce((a, c) => a + f(c), 0) / CARRERAS.length;

/** Una línea legible para el mensaje de una banda que se salió. */
function informe(): string {
    const bandas: EventRarity[] = ['normal', 'especial', 'raro', 'oro'];
    return bandas
        .map((b) => `${b} ${media((c) => c.porBanda[b]).toFixed(2)}/carrera`)
        .join(' · ')
        + ` · temporadas ${media((c) => c.temporadas).toFixed(1)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LA FORMA
// ═══════════════════════════════════════════════════════════════════════════

test('UNA CARRERA PUEDE TENER UN MOMENTO IRREPETIBLE, Y NO TODAS LO TIENEN', () => {
    // La banda es ancha porque lo que se afirma es la forma y no el número: el
    // oro tiene que ser una noticia cuando pasa, y tiene que faltar en la
    // mayoría de las carreras para que lo siga siendo. Fuera de [0,10 – 0,60] ya
    // no describe ese mundo: abajo escribimos dieciséis tarjetas invisibles,
    // arriba el oro es simplemente el catálogo con otro sello.
    const conOro = proporcion((c) => c.porBanda.oro > 0);
    assert.ok(
        conOro >= 0.1 && conOro <= 0.6,
        `${(conOro * 100).toFixed(1)}% de las carreras ve una oportunidad de oro, fuera de [10% – 60%]. ${informe()}`,
    );
});

test('LO RARO PASA UNA VEZ O DOS EN UNA VIDA, NO TODOS LOS AÑOS', () => {
    // Dos afirmaciones en un test porque son la misma: `raro` tiene que ser
    // MEMORABLE (pasa poco) y ALCANZABLE (pasa). Una carrera de quince
    // temporadas con más de tres es un carril más del catálogo; con cero en casi
    // todas, contenido muerto.
    const porCarrera = media((c) => c.porBanda.raro);
    assert.ok(
        porCarrera >= 0.3 && porCarrera <= 3,
        `${porCarrera.toFixed(2)} tarjetas 'raro' por carrera, fuera de [0,3 – 3]. ${informe()}`,
    );
});

test('EL GRUESO DE LA CARRERA ES LA VIDA DEL CLUB', () => {
    // La premisa del juego, dicha en proporción: el laburo, la cuota, el micro a
    // Tucumán. Si las tarjetas grandes pasaran de un tercio, El Capitán dejaría
    // de ser un juego sobre quedarse en un club para ser uno sobre esperar la
    // próxima oportunidad.
    const grandes = media((c) => c.porBanda.especial + c.porBanda.raro + c.porBanda.oro);
    const todas = media((c) => c.porBanda.normal + c.porBanda.especial + c.porBanda.raro + c.porBanda.oro);
    assert.ok(todas > 0, `no se registró una sola decisión en ${CARRERAS.length} carreras. ${informe()}`);
    assert.ok(
        grandes / todas <= 0.35,
        `${((grandes / todas) * 100).toFixed(1)}% de las decisiones son de banda alta, y el tope es 35%. ${informe()}`,
    );
});

test('NINGÚN PUESTO SE QUEDA SIN SU TARJETA GRANDE', () => {
    // El equivalente de la gloria por puesto, del lado de los eventos: si una
    // familia terminara el barrido con cero, su `of-` estaría gateado de más y
    // ese puesto jugaría un juego más chico sin que nada fallara. Es
    // exactamente el problema del pilar que `data/positions.ts` documenta.
    for (const family of ALL_FAMILIES) {
        const suyas = CARRERAS.filter((c) => c.family === family);
        const grandes = suyas.reduce((a, c) => a + c.porBanda.raro + c.porBanda.oro, 0);
        assert.ok(
            grandes > 0,
            `'${family}' terminó ${suyas.length} carreras sin una sola tarjeta 'raro' u 'oro'. ${informe()}`,
        );
    }
});
