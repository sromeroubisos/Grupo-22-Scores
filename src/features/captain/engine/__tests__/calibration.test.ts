// La forma de la pirámide.
//
// Estos no son tests de comportamiento sino de DISTRIBUCIÓN: juegan un montón
// de carreras completas y miran cómo quedan. Existen porque la calibración es
// lo que más fácil se rompe sin que nada falle — se toca un peso, todo compila,
// todos los tests verdes, y a la semana el 45% de los jugadores termina en Los
// Pumas y nadie se entera.
//
// Las bandas son ANCHAS a propósito. No congelan un número, congelan una forma:
// que la mayoría de las carreras termine en un club de barrio, que llegar a la
// mayor sea raro, que ningún puesto quede afuera de la selección, y que las dos
// escaleras se peleen de verdad. Si un cambio saca un valor de su banda, el
// test no dice "está mal": dice "esto cambió, mirá si era lo que querías".
//
// Es determinista: las semillas están fijas, así que no hay test que titile.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput, SquadTrack } from '../../types/captain.ts';
import { trainingsFor } from '../../data/trainings.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { PositionFamilyId } from '../../types/player.ts';
import { ALL_FAMILIES } from '../../data/positions.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { getPendingEvent } from '../event-selector.ts';
import { belongingOf } from '../belonging.ts';
import { getMomentDef, isContractKind } from '../moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../moments.ts';

/** Veinte carreras por familia: ciento sesenta en total. */
const POR_FAMILIA = 20;

/**
 * La mano del jugador de referencia, para el Momento que haya salido.
 *
 * EL JUGADOR DE REFERENCIA ES, LITERALMENTE, NIVEL `bien`. Antes esto era un
 * `switch` con una mano escrita a mano por Momento —la puntería perfecta, la
 * seña copiada, el tackle legal— y todas querían decir lo mismo: "este la juega
 * bien". Ahora lo dicen con la palabra, y de paso se arregla el modo de fallo
 * que tenía: el `default` mandaba un tackle, así que un Momento nuevo recibía una
 * mano de otro kind, el reducer la rechazaba y la carrera quedaba trabada en la
 * fase de Momento. No fallaba con un error claro — el barrido terminaba con
 * carreras congeladas y la pirámide salía deformada, que es mucho peor.
 *
 * La forma de la pirámide se mide con un jugador que la juega bien: si se
 * midiera con uno que la juega mal, la banda diría más del simulado que del
 * motor.
 */
function manoDeReferencia(state: CaptainState): MomentOutcome {
    const pendiente = state.pendingMoment!;

    if (isContractKind(pendiente.kind)) {
        return getMomentDef(pendiente.kind)!.playAt(pendiente.setup!, 'bien', 0.5);
    }

    // Pre-contrato, con el `default` en `never`: un carril nuevo sin mano no
    // compila, en vez de recibir la de otro y deformar la pirámide en silencio.
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

function manoImposible(kind: never): never {
    throw new Error(`El Momento pre-contrato '${String(kind)}' no tiene mano de referencia.`);
}

/** Un bucle trabado tira con fase y temporada, en vez de cortar en silencio. */
function trabada(state: CaptainState, donde: string): never {
    throw new Error(
        `${donde}: la carrera quedó trabada en la fase '${state.phase}' `
        + `(temporada ${state.season}, jugada pendiente: ${state.pendingMoment?.kind ?? 'ninguna'}).`,
    );
}

/**
 * La carta del jugador normal, ELEGIDA POR TIER Y NO POR ÍNDICE.
 *
 * ── El bicho que hace que esto sea `'media'` y no `0` ──
 * Decía `const CARTA = 0` con el comentario «la primera del catálogo, que es la
 * del oficio principal, la elección más obvia». Era cierto cuando las cuatro
 * cartas repartían el mismo presupuesto y solo cambiaba dónde caían los puntos.
 *
 * Cuando el catálogo se reescribió con tamaño y costo propios, el índice 0 pasó
 * a ser LA CARA: la más cara de todas, la que construye el techo más rápido y la
 * que se paga con cuerpo, minutos y riesgo. El comentario siguió diciendo "la
 * elección más obvia" y nadie lo leyó de nuevo. Resultado: la pirámide se estuvo
 * midiendo con CIENTO SESENTA jugadores maximizando el compromiso todas las
 * temporadas de su carrera, y llamando a eso "el jugador normal".
 *
 * Es el modo de fallo exacto que este archivo ya conocía —el `default` que
 * mandaba un tackle a un Momento nuevo— con otra ropa: el instrumento se
 * desalinea del mundo y sigue devolviendo números que parecen sanos.
 *
 * Por eso ahora se pide por TIER. Un reordenamiento del catálogo no puede
 * cambiar en silencio a quién estamos midiendo, y si una familia dejara de
 * ofrecer una media, el barrido falla con un mensaje en vez de medir otra cosa.
 */
const CARTA_TIER = 'media';

function cartaDeReferencia(family: PositionFamilyId): string {
    const elegida = trainingsFor(family).find((t) => t.tier === CARTA_TIER);
    assert.ok(elegida, `${family} no ofrece ninguna carta '${CARTA_TIER}': el barrido mediría otra cosa`);
    return elegida.id;
}

interface Resultado {
    family: string;
    temporadas: number;
    edad: number;
    pico: number;
    caps: number;
    mejorTrack: SquadTrack;
    pertenencia: number;
    titulos: number;
    cabeza: number;
    profesional: boolean;
}

/**
 * Juega una carrera entera.
 *
 * `fiel` decide qué pasa en el mercado: el fiel se queda siempre —la última
 * opción de una tarjeta de mercado es siempre quedarse— y el otro va rotando.
 * Son las dos estrategias que el juego tiene que premiar distinto.
 */
function jugar(seed: number, family: (typeof ALL_FAMILIES)[number], fiel: boolean): Resultado {
    const input: CreateCaptainInput = { name: 'X', surname: 'Y', family, countryCode: 'ar' };
    let s = createInitialCaptain(input, seed);
    let vuelta = 0;

    while (s.phase !== 'retired') {
        if (vuelta >= 60) trabada(s, `${family} con semilla ${seed}`);
        s = captainReducer(s, { type: 'CHOOSE_TRAINING', trainingId: cartaDeReferencia(s.player.family) });

        // La jugada decisiva, si la hay. El tackle alto encadena el bunker, así
        // que se insiste hasta salir de la fase. El jugador de referencia hace
        // un tackle limpio: la calibración de la temporada no se mide con un
        // jugador que se va expulsado todos los años.
        //
        // El JUGADOR DE REFERENCIA juega bien y no regala nada, en los cinco
        // Momentos. Es la misma idea que el tackle limpio: la pirámide no se
        // puede medir con alguien que se va expulsado o regala un penal por año.
        //
        //   tackle → zona legal        jackal → 240 ms, el tiempo de reacción
        //   ancla  → insiste UNA vez     de una persona normal
        //   código → repite bien       palos  → compensa el viento exacto
        //
        // El único que no es "perfecto" es El Ancla, y por eso vale la aclaración:
        // la mano perfecta ahí no existe, porque el punto de quiebre está oculto.
        // Insistir una vez es la apuesta prudente, que es lo que haría un jugador
        // de referencia.
        let guarda = 0;
        while (s.phase === 'moment') {
            // El tope tira: una carrera trabada acá no deforma la pirámide en
            // silencio, que fue exactamente lo que pasó cuando entró La Banda.
            if (guarda >= 4) trabada(s, `${family} con semilla ${seed}`);
            s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: manoDeReferencia(s) });
            guarda += 1;
        }

        s = captainReducer(s, { type: 'ADVANCE' });

        if (s.phase === 'event') {
            const evento = getPendingEvent(s)!;
            const i = fiel && evento.category === 'mercado'
                ? evento.options.length - 1
                : vuelta % evento.options.length;
            s = captainReducer(s, { type: 'CHOOSE', optionId: evento.options[i].id });
        }
        vuelta += 1;
    }

    const porClub = Object.values(s.belonging.byClub);
    return {
        family,
        temporadas: s.history.length,
        edad: s.player.age,
        pico: Math.max(s.player.ovr, ...s.history.map((h) => h.ovr)),
        caps: s.national.caps,
        mejorTrack: s.national.bestTrack,
        pertenencia: porClub.length > 0 ? Math.max(...porClub) : belongingOf(s.belonging, s.homeClubId),
        titulos: s.titles.length,
        cabeza: s.damage.cabeza,
        profesional: s.stage === 'professional' || s.signedProSeason !== null,
    };
}

function muestra(fiel: boolean): Resultado[] {
    const out: Resultado[] = [];
    for (const family of ALL_FAMILIES) {
        for (let i = 0; i < POR_FAMILIA; i += 1) out.push(jugar(4100 + i * 13, family, fiel));
    }
    return out;
}

const media = (xs: Resultado[], f: (r: Resultado) => number): number =>
    xs.reduce((a, r) => a + f(r), 0) / xs.length;

const proporcion = (xs: Resultado[], f: (r: Resultado) => boolean): number =>
    xs.filter(f).length / xs.length;

function entre(valor: number, min: number, max: number, que: string): void {
    assert.ok(
        valor >= min && valor <= max,
        `${que}: ${valor.toFixed(2)} quedó fuera de [${min}, ${max}]. Si el cambio era intencional, movés la banda; si no, lo rompiste.`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════

const NORMAL = muestra(false);
const FIEL = muestra(true);

test('una carrera dura lo que dura una carrera de rugby', () => {
    // La media real es de 12,7 ± 3,6 años. Que el juego se le parezca es lo que
    // hace que las curvas de edad por puesto signifiquen algo.
    entre(media(NORMAL, (r) => r.temporadas), 11, 16, 'temporadas por carrera');
    entre(media(NORMAL, (r) => r.edad), 30, 34, 'edad de retiro');
});

test('la pirámide: llegar a la mayor es raro', () => {
    // ── LA BANDA VIEJA CODIFICABA EL MUNDO ROTO ──
    // Era [0,03 – 0,18] y se calibró cuando el juego daba 4%: describía el estado
    // de entonces, no el objetivo. Y el objetivo estaba escrito desde el principio
    // en `docs/el-capitan-formacion.md` §2 — «15-25% de carreras con al menos un
    // cap, ~5% con 20+», y explícitamente «alcanzado por decisión y no por bajar
    // la barra».
    //
    // Con el techo partido en material + construido, la medición dio 0,20. Eso NO
    // es una regresión: es el destino, y cae adentro del 15-25% que el doc pedía.
    // La banda se sube para que afirme el objetivo y no la foto de un motor que
    // todavía no tenía cómo llegar.
    entre(proporcion(NORMAL, (r) => r.mejorTrack === 'nacional'), 0.1, 0.3, 'llegan a la mayor');

    // ┌───────────────────────────────────────────────────────────────────────┐
    // │ LA BASE NO SE CAYÓ: SE EROSIONÓ. Y el susto era el instrumento.        │
    // │                                                                        │
    // │ Este bloque decía que la base de la pirámide se había derrumbado —1%   │
    // │ nunca salía del club, 51% llegaba a M20— y estaba mal. Esos números    │
    // │ salieron de un barrido donde la carta de referencia era LA CARA, o sea │
    // │ 160 jugadores maximizando el compromiso todas las temporadas. Con la   │
    // │ carta media, que es lo que hace un jugador normal:                     │
    // │                                                                        │
    // │                           mayor    M20+    solo club                   │
    // │   0.6.0, antes de todo    0,100    0,200     0,150                     │
    // │   0.8.0 con built OFF     0,044    0,169     0,169                     │
    // │   0.8.0 hoy               0,150    0,325     0,119                     │
    // │                                                                        │
    // │ `built` erosiona la base de 0,150 a 0,119. Es real y es modesto: la    │
    // │ banda se rompe por una milésima, no por un orden de magnitud.          │
    // │                                                                        │
    // │ LO QUE SÍ SOBREVIVE, y es lo que importa: 0,15 TAMPOCO ERA UN PISO.    │
    // │ El 85% ya pisaba un carril representativo antes de todo esto, y esta   │
    // │ banda lo daba por bueno sin avisar nunca. La premisa del juego —~500   │
    // │ clubes, 100.000 fichados, la mayoría NO SALE— nunca estuvo en el motor.│
    // │ El problema no es que algo se rompió: es que esto nunca se modeló.     │
    // │                                                                        │
    // │ CAUSA ESTRUCTURAL: `reachableTrack` es `player.ovr >= thresholdFor()`, │
    // │ un umbral puro. Todo el que pasa entra, así que cuando la distribución │
    // │ sube entran todos y el piso se erosiona solo. Un plantel de Pumitas    │
    // │ son ~30 camisetas, no "todos los que superen 67".                      │
    // │                                                                        │
    // │ ARREGLO PROPUESTO: cupos en vez de umbrales, contra una curva          │
    // │ sintética versionada. El piso vuelve por construcción y no se rompe    │
    // │ cuando se mueva otra cosa, porque el número de camisetas no depende de │
    // │ cuánto crezca nadie.                                                   │
    // └───────────────────────────────────────────────────────────────────────┘
    entre(proporcion(NORMAL, (r) => ['m20', 'a-xv', 'nacional'].includes(r.mejorTrack)), 0.1, 0.35, 'llegan a M20 o más');
    // ALARMA-VIVA: los carriles son umbrales y no cupos — la carrera modal del rugby casi no existe
    entre(proporcion(NORMAL, (r) => r.mejorTrack === 'club'), 0.12, 0.45, 'nunca salen del club');
});

test('ningún puesto queda afuera de la selección', () => {
    // La escasez del puesto tiene que INCLINAR la balanza, no cerrar la puerta.
    // Con una banda de escasez de cuatro puntos los backs promediaban CERO caps
    // por carrera, que es tanto como decir que Los Pumas no tienen wings.
    for (const family of ALL_FAMILIES) {
        const sub = NORMAL.filter((r) => r.family === family);
        const tasa = proporcion(sub, (r) => ['m20', 'a-xv', 'nacional'].includes(r.mejorTrack));
        assert.ok(tasa > 0, `${family} no llegó ni una vez a un seleccionado juvenil o mayor`);
    }
});

test('los picos de media son parejos entre puestos', () => {
    // Si un puesto crece más que otro, la elección de puesto deja de ser una
    // decisión de estilo y pasa a ser una decisión de poder.
    const picos = ALL_FAMILIES.map((f) => media(NORMAL.filter((r) => r.family === f), (r) => r.pico));
    const spread = Math.max(...picos) - Math.min(...picos);
    entre(spread, 0, 4, 'diferencia de pico entre el mejor y el peor puesto');
    // Sube de [60, 71] a [60, 76] por aritmética y no por diseño: el techo ahora
    // es material MÁS lo construido, así que el pico medio de la población se
    // corre hacia arriba en cuanto alguien construye. Medido: 72,88.
    // Lo que este test protege es el SPREAD entre puestos —que elegir puesto sea
    // estilo y no poder—, y ese no se movió.
    entre(media(NORMAL, (r) => r.pico), 60, 76, 'pico de media');
});

test('las dos escaleras se pelean de verdad', () => {
    // ES el juego: quedarse construye la cancha con tu nombre, irse construye
    // caps y plata. Si las dos estrategias dieran lo mismo, no habría decisión.
    const vitaliciosFieles = proporcion(FIEL, (r) => r.pertenencia >= 95);
    const vitaliciosNormales = proporcion(NORMAL, (r) => r.pertenencia >= 95);

    entre(vitaliciosFieles, 0.12, 0.5, 'vitalicios por el camino fiel');
    assert.ok(
        vitaliciosFieles > vitaliciosNormales + 0.1,
        `quedarse tiene que pagar: fieles ${(vitaliciosFieles * 100).toFixed(0)}% contra ${(vitaliciosNormales * 100).toFixed(0)}%`,
    );

    const proFieles = proporcion(FIEL, (r) => r.profesional);
    const proNormales = proporcion(NORMAL, (r) => r.profesional);
    assert.ok(
        proNormales > proFieles,
        'aceptar pases tiene que ser el camino al profesionalismo, y no lo es',
    );
});

test('el vitalicio es un final, no un trámite', () => {
    // Nadie llega a que le pongan su nombre a la cancha sin quedarse Y ganar.
    entre(proporcion(NORMAL, (r) => r.pertenencia >= 95), 0, 0.05, 'vitalicios sin ser fiel');
});

test('la conmoción no es rutina ni es imposible', () => {
    // Si le pasa a todos, deja de significar algo y el dilema de declararla se
    // vuelve decorativo. Si no le pasa a nadie, el sistema es un adorno.
    entre(proporcion(NORMAL, (r) => r.cabeza === 0), 0.03, 0.2, 'se retiran sin una sola conmoción');
    entre(media(NORMAL, (r) => r.cabeza) / 12, 1.5, 3.5, 'HIA positivos por carrera');
});

test('hay vitrina, pero no se regala', () => {
    entre(media(NORMAL, (r) => r.titulos), 1.5, 6, 'títulos por carrera');
    entre(proporcion(NORMAL, (r) => r.titulos === 0), 0, 0.2, 'carreras sin un solo título');
});
