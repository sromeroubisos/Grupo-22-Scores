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
import type { MilestoneId, SeasonAwardId } from '../../types/achievements.ts';
import { SQUAD_TRACKS } from '../../types/captain.ts';
import { trainingsFor } from '../../data/trainings.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { PositionFamilyId } from '../../types/player.ts';
import { ALL_FAMILIES } from '../../data/positions.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
 import { playTournament } from '../../state/captain-autoplay.ts';
import { getPendingEvent } from '../event-selector.ts';
import { belongingOf, belongingTier } from '../belonging.ts';
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
    /**
     * Todos los carriles que PISÓ, temporada a temporada.
     *
     * Separado de `mejorTrack` por un falso positivo medido: `bestTrack` es un
     * máximo corrido, así que un carril juvenil solo puede ser el MEJOR de
     * alguien que nunca subió más. Los que llegan a M20 después llegan a A-XV,
     * y M20 desaparece de la foto aunque lo hayan jugado.
     */
    viasPisadas: SquadTrack[];
    pertenencia: number;
    titulos: number;
    cabeza: number;
    profesional: boolean;
    /** Los hitos que alcanzó, por id. Para el censo de estructura de abajo. */
    hitos: MilestoneId[];
    /** Los premios individuales que ganó, por id. */
    premios: SeasonAwardId[];
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
    const viasPisadas: SquadTrack[] = [];

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

        s = playTournament(captainReducer(s, { type: 'ADVANCE' }));

        // Bucle y no `if`: una temporada trae la tarjeta del año Y la del
        // mercado, que desde la 0.21.0 corre después en vez de reemplazarla. Con
        // un `if`, el brazo `fiel` —el que siempre se queda— se saltaba la mitad
        // de las decisiones y la pirámide se medía con otro jugador.
        let decisiones = 0;
        while (s.phase === 'event') {
            if (decisiones >= 4) trabada(s, `${family} con semilla ${seed}`);
            const evento = getPendingEvent(s)!;
            const i = fiel && evento.category === 'mercado'
                ? evento.options.length - 1
                : vuelta % evento.options.length;
            s = captainReducer(s, { type: 'CHOOSE', optionId: evento.options[i].id });
            decisiones += 1;
        }
        if (!viasPisadas.includes(s.national.track)) viasPisadas.push(s.national.track);
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
        viasPisadas,
        pertenencia: porClub.length > 0 ? Math.max(...porClub) : belongingOf(s.belonging, s.homeClubId),
        titulos: s.titles.length,
        cabeza: s.damage.cabeza,
        profesional: s.stage === 'professional' || s.signedProSeason !== null,
        hitos: s.milestones.map((m) => m.id),
        premios: s.awards.map((a) => a.id),
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
    //
    // ── LA BANDA SE MOVIÓ CON `START_AGE`, Y ES ARITMÉTICA ──
    // Era [11 – 16] y describía una carrera que empezaba a los 18. Desde que
    // empieza a los 16 son DOS TEMPORADAS MÁS por el mismo retiro: la banda
    // vieja se rompía sola sin que hubiera cambiado nada de lo que mide.
    //
    // Y la referencia real acompaña: 12,7 ± 3,6 años es la carrera de un jugador
    // que en el rugby de verdad tampoco debuta en primera a los 16 — lo que se
    // suman acá son dos años de juveniles, que el motor simula como temporadas
    // con casi nada de tiempo de juego.
    //
    // ── 0.20.0 · LA BANDA SE MUEVE PORQUE LA PREMISA CAMBIÓ ────────────────────
    // Era [13 – 18] temporadas y [30 – 34] de retiro, y describía un juego que
    // se terminaba a mitad de los treinta. La decisión de diseño nueva es que LA
    // CARRERA LLEGA A LOS 40: la curva de cada puesto se corrió cuatro años del
    // declive para atrás y entró la tirada de longevidad.
    //
    // No es una banda que se corre para que pase el número medido: es la misma
    // afirmación —"una carrera dura lo que dura una carrera de rugby"— hecha
    // sobre un rugby que ahora incluye al veterano de 38 y 39, que existe y que
    // el juego no tenía. La referencia real no se contradice: 12,7 ± 3,6 años se
    // cuentan desde el debut en primera, y acá se cuentan desde los 16.
    entre(media(NORMAL, (r) => r.temporadas), 17, 21, 'temporadas por carrera');
    entre(media(NORMAL, (r) => r.edad), 33, 37, 'edad de retiro');

    // LA COLA ES LA MITAD DE LA PROMESA, y sin este renglón la de arriba se
    // cumple con todo el mundo retirándose a los 35 clavado. Que llegar a los 38
    // sea POSIBLE y RARO es lo que hace que la longevidad signifique algo: si
    // fuera 0, el tope de 40 sería decorativo; si fuera la mitad de la
    // población, el veterano dejaría de ser una historia.
    entre(proporcion(NORMAL, (r) => r.edad >= 38), 0.03, 0.3, 'llegan a los 38 o más');
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
    // │ ARREGLO HECHO: cupos en vez de umbrales. El piso volvió por            │
    // │ construcción —el número de camisetas no depende de cuánto crezca       │
    // │ nadie— y la base subió de 0,01 a 0,51. La causa estructural está       │
    // │ cerrada; el número todavía no llega al objetivo, que es otra cosa y    │
    // │ está anotado abajo.                                                    │
    // └───────────────────────────────────────────────────────────────────────┘
    // ── 0.14.0 · EL PISO DEL TECHO ABRIÓ LA ESCALERA, Y ESTA BANDA LO DICE ──
    //
    // Da 0,66 contra [0,10 – 0,35] y NO se mueve, porque la premisa no cambió:
    // la mayoría no sale del club. Lo que cambió es la población.
    //
    // Con `POTENTIAL_FLOOR = 84` nadie nace con un techo que lo deje afuera, así
    // que los picos de media se aprietan entre 80 y 92 (antes: 75 y 93). Las dos
    // puertas de arriba son UMBRALES —`player.ovr >= thresholdFor()`— y sobre una
    // población apretada un umbral se vuelve un interruptor: mover la camada un
    // punto mueve la tasa treinta. Medido, con la camada anclada al modelo nuevo:
    //
    //     realización 0,70 → mayor 0,00      0,60 → 0,14      0,56 → 0,38
    //
    // Se eligió 0,60 porque sostiene «llegar a la mayor es raro» (0,26, adentro
    // de su banda). Lo que NO se puede sostener con el mismo movimiento es la
    // base: el A-XV lo pisa el 75% y por eso este número da 0,81.
    //
    // 0.15.0 lo empujó otro escalón (0,66 → 0,81) y era esperable: arreglar los
    // partidos sube el puntaje de todos, y con un umbral absoluto arriba, todo
    // lo que suba la población entra. Es la misma causa dicha por tercera vez.
    //
    // La causa es estructural y ya está diagnosticada tres párrafos más arriba:
    // los tres carriles de abajo se arreglaron pasándolos a CUPO —camisetas, no
    // umbral— y los dos de arriba quedaron como umbral a propósito, cuando el
    // problema medido era el piso. Con el piso del techo puesto, el problema
    // pasó a ser también el techo, y la medicina es la misma: Los Pumas son 33
    // camisetas, no «todos los que pasen 89».
    //
    // 0.16.0 lo bajó de 0,81 a 0,78. LA BANDA NO SE MUEVE POR ESO: son tres
    // puntos, la premisa es la misma y el mecanismo que la rompe sigue entero.
    // Se anota para que la próxima medición sepa contra qué compara y para que
    // nadie lea el 0,78 como una mejora del problema — la rareza reparte las
    // tarjetas grandes de otra manera, no convierte un umbral en un cupo.
    //
    // Medido con las dos causas separadas (`SONDA_SORTEO_PLANO`/`SONDA_SIN_OFICIO`,
    // descartables): el sorteo por bandas solo da 0,76 y las tarjetas de oficio
    // solas 0,84. O sea que se compensan, y el neto de tres puntos NO es la suma
    // de dos efectos chicos sino la resta de dos grandes. Si alguna de las dos se
    // toca por separado, este número se va a mover más de lo que sugiere.
    //
    // ALARMA-VIVA: las dos puertas de arriba siguen siendo umbral y con el piso del techo la base se erosiona
    entre(proporcion(NORMAL, (r) => ['m20', 'a-xv', 'nacional'].includes(r.mejorTrack)), 0.1, 0.35, 'llegan a M20 o más');
    // ── BANDA REAUTORIZADA CONTRA LA PREMISA. HOY DA 0,119 Y ESTÁ ROJA. ──
    //
    // Era [0,12 – 0,45] y afirmaba un mundo que ya decidimos que no queremos.
    // Dejarla ahí era dejar una mentira que encima estaba roja por el motivo
    // equivocado: por una milésima, como si fuera deriva. Puesta en el objetivo,
    // el rojo dice "esto todavía no está hecho" en vez de "algo se rompió".
    //
    // ESTO ES UN OBJETIVO DE DISEÑO, NO UN DATO MEDIDO. No tenemos cifra dura de
    // qué fracción de los juveniles de club argentino recibe una convocatoria de
    // su unión, y no hay que leer este [0,55 – 0,80] como si saliera de una
    // fuente. Sale de la premisa del juego —~500 clubes, 100.000 fichados, y "de
    // la M14 a la 1 del club, y SI el cuerpo aguanta, a Los Pumas"—, que asume
    // que la mayoría no sale. El próximo que la toque tiene que saber que está
    // discutiendo con una decisión de diseño y no con investigación.
    //
    // 0.10.0 · LA DISPONIBILIDAD LO MOVIÓ HACIA LA BANDA, y poco: 0,512 → 0,525.
    // Poco es la lectura importante. Las ausencias bajan el pico de todos por
    // igual, y este número no depende del pico sino de un CUPO: el que entra a
    // los Pumitas entra porque es de los treinta mejores de su camada, y si toda
    // la camada baja, los treinta siguen siendo treinta. Confirma que lo que
    // falta acá no es calibración: son las puertas de la Formación.
    //
    // 0.11.0 · LA PROGRESIÓN LO MOVIÓ EN CONTRA, Y POCO: 0,525 → 0,49. Hay que
    // anotarlo aunque incomode, porque la intuición decía lo opuesto: si el
    // entorno amateur ahora rinde 0,80 en vez de 1,0, el pibe de club debería
    // quedarse MÁS abajo, no menos.
    //
    // La explicación medida es la VARIANZA, no el nivel. `growthScale` es un
    // producto de seis factores y tres de ellos abren cola hacia arriba —la
    // tirada del año llega a 1,5, el mérito a 1,32 y el empuje juvenil a 1,22—,
    // así que una buena temporada rinde mucho más que antes aunque el promedio
    // baje. Y los carriles se evalúan TODAS las temporadas: lo que decide si
    // salís del club no es tu media promedio sino tu MEJOR año. Más varianza con
    // la misma media sube el máximo, y el escalón `union` es un umbral puro, que
    // es donde más se nota (0,375 lo pisan).
    //
    // Es la misma familia de error que el §1.8 —el promedio de la entrada no es
    // la entrada del promedio— aplicada al revés: bajar la media de una entrada
    // NO baja la tasa de un evento de cola. Si algún día se quiere mover este
    // número desde acá, hay que apretar la COLA (recortar `tirada`, achicar
    // `MERIT_MAX`) y no el nivel — pero la causa estructural sigue siendo la que
    // dice el bloque de arriba: faltan las puertas de la Formación, y esto no se
    // arregla calibrando.
    //
    // ALARMA-VIVA: la carrera modal del rugby todavía no llega — se sale del club más de lo que la premisa admite
    entre(proporcion(NORMAL, (r) => r.mejorTrack === 'club'), 0.55, 0.8, 'nunca salen del club');
});

// ═══════════════════════════════════════════════════════════════════════════
//  ESTRUCTURA — otra especie, y por eso va con su propio encabezado
// ═══════════════════════════════════════════════════════════════════════════
//
// Las bandas de arriba miden si un número está BIEN. Esto mide si el escalón
// EXISTE, que es una pregunta anterior y que ninguna banda hace.
//
// Existe por un agujero medido: al convertir los carriles a cupo, el agregado
// `nunca salen del club` cayó en 0,681 —adentro del objetivo, verde si lo
// mirabas solo— mientras `union`, `academia` y `m20` valían EXACTAMENTE 0,000.
// La escalera no se había graduado: se le había borrado el medio, y los que
// salían del club saltaban directo a los dos escalones que seguían por umbral.
// Un agregado en target escondió tres ceros.
//
// Y es la TERCERA vez que este motor produce una distribución todo-o-nada:
// `no-alcanzó-su-techo = 0`, `nunca-salen-del-club = 0,01`, y ahora tres vías en
// 0,000. Misma forma en tres capas distintas — algo resuelve por corte duro y el
// medio queda vacío. Este test es la red para la cuarta.
//
// Vive en este archivo y no en uno propio por una razón práctica: el barrido de
// 160 carreras cuesta, y `NORMAL` ya está calculado. La separación es de
// ESPECIE, no de archivo, y por eso el encabezado.

test('ESTRUCTURA: ninguna vía de la escalera queda vacía', () => {
    // ── SE MIDE LO PISADO, NO EL MEJOR DE LA CARRERA ──
    // La primera versión de este test usaba `mejorTrack` y habría mentido en la
    // dirección más cara: la de la falsa alarma. `bestTrack` es un máximo
    // corrido, así que un carril juvenil solo puede ser el MEJOR de alguien que
    // nunca subió más — y el que llega a M20 a los 19 llega a A-XV a los 25.
    //
    // Medido con `mejorTrack`: academia y M20 daban 0,000 y parecían escalones
    // inexistentes. Medido por temporada pisada: 36 y 12 temporadas. Los
    // escalones estaban ahí; lo que no estaba era gente que se quedara en ellos.
    //
    // La lección es la del §1.5 del CLAUDE.md con otra ropa: el instrumento
    // contestaba una pregunta distinta de la que le hacíamos.
    const pisadas = new Map<SquadTrack, number>();
    for (const track of SQUAD_TRACKS) pisadas.set(track, 0);
    for (const r of NORMAL) {
        for (const track of r.viasPisadas) pisadas.set(track, (pisadas.get(track) ?? 0) + 1);
    }

    const vacias = SQUAD_TRACKS.filter((track) => pisadas.get(track) === 0);
    const detalle = SQUAD_TRACKS.map((t) => `${t}=${pisadas.get(t)}`).join(' · ');

    assert.deepEqual(
        vacias,
        [],
        `hay ${vacias.length} vía(s) de la escalera que NADIE pisa NUNCA: ${vacias.join(', ')}.\n`
        + 'No es calibración: es que ese escalón no existe. Casi siempre significa que su corte quedó '
        + 'por encima del corte del escalón de ARRIBA, así que no se evalúa jamás.\n'
        + `Carreras que pisaron cada vía, de ${NORMAL.length}: ${detalle}`,
    );

    // El embudo, POR CARRERA. Se imprime siempre porque es la lectura que ningún
    // agregado da: `mejorTrack` esconde a los que pasaron y siguieron, y contar
    // temporadas mezcla vías de una sola temporada con vías de doce.
    console.log(
        `      · pisan cada vía: ${SQUAD_TRACKS.map(
            (t) => `${t}=${(pisadas.get(t)! / NORMAL.length).toFixed(3)}`,
        ).join(' · ')}`,
    );
});

/**
 * TODOS LOS HITOS DECLARADOS, para que el censo falle si alguno no existe.
 *
 * Se escribe la lista a mano y no se deriva de `MilestoneId` porque el tipo no
 * sobrevive a la compilación: lo que se quiere es que agregar un hito nuevo
 * OBLIGUE a venir acá y a preguntarse si es alcanzable. Un hito que nadie puede
 * sacar es exactamente lo que este test existe para no dejar pasar.
 */
const HITOS_DECLARADOS: readonly MilestoneId[] = [
    'debut-senior',
    'primera-convocatoria',
    'debut-mayor',
    'primer-contrato',
    'primer-titulo',
    'competicion-de-elite',
    'transferencia-internacional',
    'vuelta-a-casa',
    'capitan-de-la-seleccion',
    'salon-de-la-fama',
];

const PREMIOS_DECLARADOS: readonly SeasonAwardId[] = ['mejor-del-mundo', 'xv-ideal', 'mejor-local'];

test('ESTRUCTURA: ningún hito ni premio declarado es inalcanzable', () => {
    // ── POR QUÉ ESTE TEST EXISTE, y no es una precaución teórica ────────────
    // Los dos hitos raros nacieron muertos y ninguna otra red lo habría visto:
    //
    //   · el Salón de la Fama pedía media 72 A LOS 33, y a los 33 el declive ya
    //     se la comió. Las dos condiciones se peleaban entre sí: la edad recién
    //     abre la puerta cuando el nivel ya se fue. Medido: 0 de 60.
    //   · la cinta de capitán pedía liderazgo 75, y el liderazgo es el atributo
    //     de MENOR peso en las ocho familias, así que es el que menos crece. El
    //     mejor de doscientas carreras llegó a 71. Medido: 0 de 200.
    //
    // Ninguno de los dos era un umbral estricto: los dos eran imposibles, y por
    // construcción. Es la tercera vez que este motor produce un escalón vacío
    // —`no-alcanzó-su-techo = 0`, tres vías representativas en 0,000, y ahora
    // esto— y siempre con la misma firma: un corte duro que nadie mide.
    //
    // ── EL CENSO SE IMPRIME SIEMPRE ────────────────────────────────────────
    // Un hito que sale una vez en ciento sesenta carreras pasa este test y aun
    // así puede estar mal calibrado. El assert dice "existe"; el censo dice
    // "cuánto", y esa segunda lectura no la da ningún booleano.
    const censoHitos = new Map<MilestoneId, number>();
    for (const id of HITOS_DECLARADOS) censoHitos.set(id, 0);
    for (const r of NORMAL) {
        for (const id of r.hitos) censoHitos.set(id, (censoHitos.get(id) ?? 0) + 1);
    }

    const censoPremios = new Map<SeasonAwardId, number>();
    for (const id of PREMIOS_DECLARADOS) censoPremios.set(id, 0);
    for (const r of NORMAL) {
        for (const id of r.premios) censoPremios.set(id, (censoPremios.get(id) ?? 0) + 1);
    }

    console.log(
        `      · hitos: ${HITOS_DECLARADOS.map((id) => `${id}=${censoHitos.get(id)}`).join(' · ')}`,
    );
    console.log(
        `      · premios: ${PREMIOS_DECLARADOS.map((id) => `${id}=${censoPremios.get(id)}`).join(' · ')}`,
    );

    // El mejor jugador del mundo se excluye del assert Y SE DICE POR QUÉ: es uno
    // por año en todo el rugby y pide media 88 con plantel de la mayor, así que
    // ciento sesenta carreras no son muestra suficiente para exigirlo. Excluirlo
    // en silencio sería el "silent cap" que este archivo persigue en otros lados.
    const inalcanzables = [
        ...HITOS_DECLARADOS.filter((id) => censoHitos.get(id) === 0),
        ...PREMIOS_DECLARADOS.filter((id) => id !== 'mejor-del-mundo' && censoPremios.get(id) === 0),
    ];

    assert.deepEqual(
        inalcanzables,
        [],
        `hay ${inalcanzables.length} distinción(es) que NADIE saca NUNCA: ${inalcanzables.join(', ')}.\n`
        + 'No es calibración: es que esa condición no se puede cumplir con el resto del motor. '
        + 'Casi siempre son dos condiciones que se pelean entre sí —una pide edad y la otra pide '
        + 'nivel, y a esa edad el nivel ya se fue— o un umbral sobre un atributo que el reparto '
        + 'de crecimiento no puede empujar hasta ahí.',
    );
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
    // 0.14.0 · De [0 – 4] a [0 – 5], medido 4,35, y la causa tiene nombre.
    // `aging.ts` corrige el ritmo por lo corta que sea la ventana del puesto:
    // `REFERENCE_GROWTH_WINDOW / (pico − START_AGE)`. Con la carrera empezando a
    // los 16 las dos ventanas crecen en dos, y el COCIENTE se achica —el wing
    // pasa de cobrar 1,50 a cobrar 1,375— así que la corrección compensa un poco
    // menos y los puestos se separan un poco más. Es el precio aritmético de las
    // dos temporadas, no una decisión sobre los puestos: medio punto de media
    // sobre una escala de 99, y la premisa —elegir puesto es estilo, no poder—
    // se sostiene. Si algún día pasa de 5, ahí sí hay que discutir la corrección.
    entre(spread, 0, 5, 'diferencia de pico entre el mejor y el peor puesto');
    // Sube de [60, 76] a [60, 92] por el PISO DEL TECHO, y es aritmética otra
    // vez: con `POTENTIAL_FLOOR = 84` nadie puede terminar abajo de ese número
    // menos el declive, así que el pico medio de la población se va a 87. La
    // banda de abajo se conserva —el que se rompe el cuerpo joven sigue pudiendo
    // terminar mucho más abajo— y lo que este test protege, el SPREAD entre
    // puestos, vive en la línea de arriba.
    entre(media(NORMAL, (r) => r.pico), 60, 92, 'pico de media');
});

test('las dos escaleras se pelean de verdad', () => {
    // ES el juego: quedarse construye la cancha con tu nombre, irse construye
    // caps y plata. Si las dos estrategias dieran lo mismo, no habría decisión.
    // ── SE PREGUNTA POR EL ESCALÓN, NO POR EL NÚMERO (0.28.0) ────────────────
    // Decía `r.pertenencia >= 95`, que era el piso del vitalicio EN SU MOMENTO.
    // Cuando los escalones se reanclaron a la carrera real, el 95 dejó de
    // significar «vitalicio» y pasó a ser un número suelto bastante más arriba
    // del último escalón: el test se puso rojo midiendo algo que ya no existía.
    // Es el §1.5 del CLAUDE de captain con otra ropa —pedir por lo que la cosa
    // ES y no por dónde estaba cuando miraste— y la medicina es la de siempre.
    const esVitalicio = (r: { pertenencia: number }) => belongingTier(r.pertenencia) === 'vitalicio';
    const vitaliciosFieles = proporcion(FIEL, esVitalicio);
    const vitaliciosNormales = proporcion(NORMAL, esVitalicio);

    // ── LO QUE SIGUE ES HISTORIA, y termina en 0.20.0 con el problema cerrado.
    // Se deja entera porque explica de dónde salió cada número, y porque la
    // pregunta de diseño del último párrafo sigue sin contestar.
    //
    // Se apagó junto con la vitrina, y es la misma causa: al vitalicio se llega
    // quedándose Y ganando (ver `el vitalicio es un final`), así que un campeón
    // por liga le corta la mitad del camino.
    //
    // Mientras el rojo estuvo vivo, `entre` cortaba el test y los dos asserts que
    // siguen —quedarse paga, y los pases llevan al profesionalismo— NO se
    // estaban midiendo. Desde que la banda volvió al verde se miden de nuevo.
    // 0.10.0 lo empujó de 0,075 a 0,025, y ES LA MISMA CAUSA: al vitalicio se
    // llega quedándose Y ganando, así que todo lo que le saque títulos a la
    // carrera le saca vitalicios. Se anota acá para que no se lea como una
    // segunda deriva — es una sola, contada dos veces.
    //
    // 0.11.0 lo empujó otra vez, de 0,075 a 0,04, Y NO ES LA MISMA CAUSA que
    // las dos anteriores. Los títulos SUBIERON en 0.11.0 (0,96 → 1,28), así que
    // el relato de "se apagó con la vitrina" ya no alcanza para explicar esta
    // caída. Lo que la explica es que los títulos que entraron son de SELECCIÓN
    // y de ASCENSO, y ninguno de los dos construye Pertenencia con el club:
    // `BELONGING_PER_TITLE` se cobra por `titulos.length` de la temporada, pero
    // el vitalicio necesita además QUEDARSE, y el que sube con su club y juega
    // para su unión es exactamente el que el mercado se lleva.
    //
    // O sea: la vitrina y la Pertenencia dejaron de moverse juntas. Cuando se
    // toque el vitalicio hay que decidir si un título de selección tiene que
    // pesar en el vínculo con el club — hoy pesa, y es discutible.
    //
    // ── 0.20.0 · EL PROBLEMA QUE ESTE ROJO VIGILABA SE CERRÓ ──────────────────
    // El `ALARMA-VIVA` decía «el vitalicio se apagó con la vitrina — quedarse
    // fiel dejó de tener su final», y se borra acá porque el final volvió: 0,04
    // → 0,68. Se borra en el mismo commit que lo cierra, que es la regla (§1.2);
    // un marcador que sobrevive a su problema es la alarma rota que el mecanismo
    // existe para evitar.
    //
    // Lo cerró la carrera larga, no la vitrina: con diecinueve temporadas,
    // `BELONGING_PER_SEASON` sola pone 28 puntos, así que el que se queda toda
    // la vida llega. La causa que el marcador nombraba —los títulos de selección
    // y de ascenso no construyen vínculo con el club— SIGUE ABIERTA y sigue
    // siendo discutible; lo que ya no es cierto es que el camino fiel no tenga
    // final, y un rojo no puede seguir afirmando algo que dejó de pasar.
    //
    // La banda nueva afirma el mundo que queremos: quedarse toda la carrera en
    // un club TERMINA en el vitalicio la mayoría de las veces —en rugby quedarse
    // es la norma, no la excepción— pero no siempre, porque una carrera fiel que
    // se corta a los 31 por el cuerpo no se lo ganó. El techo de 0,85 es el que
    // vigila eso.
    entre(vitaliciosFieles, 0.4, 0.85, 'vitalicios por el camino fiel');
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
    entre(proporcion(NORMAL, (r) => belongingTier(r.pertenencia) === 'vitalicio'), 0, 0.05, 'vitalicios sin ser fiel');
});

test('la conmoción no es rutina ni es imposible', () => {
    // Si le pasa a todos, deja de significar algo y el dilema de declararla se
    // vuelve decorativo. Si no le pasa a nadie, el sistema es un adorno.
    entre(proporcion(NORMAL, (r) => r.cabeza === 0), 0.03, 0.2, 'se retiran sin una sola conmoción');
    entre(media(NORMAL, (r) => r.cabeza) / 12, 1.5, 3.5, 'HIA positivos por carrera');
});

test('hay vitrina, pero no se regala', () => {
    // La causa está identificada: desde que una liga tiene UN campeón elegido por
    // rating, los títulos se volvieron escasos y la media cayó a 0,96.
    //
    // Identificada NO ES justificada. Saber por qué da 0,96 no vuelve correcto al
    // 0,96: una carrera promedio ganando un solo título es tacaña contra la
    // dirección que tomamos. Y reautorizar ahora sería calibrar contra un número
    // que está por moverse — el crecimiento acelerado hace que un jugador llegue a
    // los 20 con más pico, juegue en mejores clubes y gane más. Se decide después,
    // en su propio momento, con el número ya quieto.
    // ── 0.10.0 LA EMPUJÓ MÁS ABAJO, Y NO SE COMPENSA A MANO ──────────────────
    // 0,963 → 0,719, y sin título 0,388 → 0,506. La causa es directa: el corte
    // `TITLE_MIN_SHARE` recibe ahora QUÉ PARTE DE LA TEMPORADA JUGASTE, y antes
    // recibía TU LUGAR EN EL EQUIPO, que es más alto porque no descuenta las
    // fechas que te perdiste.
    //
    // No se retoca el corte para devolver el número, y esa es una decisión:
    //
    //   · El input nuevo es EL CORRECTO. Lo dice el propio docstring del corte
    //     —«el que no se puso la camiseta en todo el año, no»—, y con el lugar
    //     en el equipo el titular que se pasaba el año lesionado cobraba la
    //     medalla igual. Parte de esta caída no es pérdida: es dejar de regalar.
    //   · Bajar el corte ahora sería calibrar el PARÁMETRO para mover la TASA,
    //     que es exactamente lo que el §1.8 del CLAUDE.md prohíbe.
    //
    // Sigue valiendo lo de abajo: la vitrina se decide en su propio momento, con
    // el número quieto, y ahora hay DOS causas que separar —el campeón único por
    // liga y el corte alimentado con otra magnitud—.
    //
    // ── 0.11.0 · PRIMERA VEZ QUE ESTE NÚMERO SE MUEVE HACIA SU BANDA ─────────
    // 0,719 → 1,28, y sin título 0,506 → 0,394. Sigue rojo, pero por primera vez
    // el rojo se está achicando en vez de crecer.
    //
    // La causa NO es que el club gane más: el campeón de liga no se movió ni un
    // caso —`leagueTableOf` usa la misma semilla y el mismo primer tiro que
    // usaba `championOf`—. Lo que entró son DOS fuentes nuevas de copa que antes
    // no existían: los títulos de selección (`international-results.ts`), que se
    // acreditan con al menos un cap en el año, y el ascenso, que mete al club en
    // divisiones donde hay otras copas para pelear.
    //
    // ── 0.12.0 · ENTRARON LAS COPAS, Y ALCANZAN A POCOS ─────────────────────
    // 1,28 → 1,36. Se movió, y menos de lo que la 0.11.0 anticipaba: aquella
    // decía que lo que faltaba eran "las copas de club aparte de la liga". Ya
    // están —las once del catálogo, con sus reglas reales de clasificación— y el
    // número apenas se corrió.
    //
    // La medición explica por qué, y conviene dejarla escrita porque contradice
    // la expectativa: LAS COPAS ALCANZAN A 115 DE 822 CLUBES. No es que no
    // funcionen; es que son de pocos, y eso es el rugby — el Nacional de Clubes
    // lo juega el campeón del URBA Top 14 y cinco campeones regionales, la
    // Champions Cup veinticuatro clubes de élite, y el resto del planeta no
    // juega ninguna. La carrera típica de este juego transcurre justo donde no
    // hay copas.
    //
    // O sea: la vitrina de la carrera MODAL no se arregla con más torneos,
    // porque no hay más torneos para esa gente. Lo que queda por decidir es otra
    // cosa —si una liga larga tiene que repartir algo más que el campeonato, o
    // si la banda está pidiendo un mundo que no es el rugby de club—, y esa
    // discusión ya no es de calibración.
    //
    // Lo que sí subió, y mucho, es lo individual: el XV ideal del año pasó de 5 a
    // 16 y el premio local de 77 a 104 sobre las mismas 160 carreras. El censo
    // está en `ESTRUCTURA: ningún hito ni premio declarado es inalcanzable`.
    //
    // ALARMA-VIVA: la vitrina quedó tacaña — una carrera promedio gana un solo título
    entre(media(NORMAL, (r) => r.titulos), 1.5, 6, 'títulos por carrera');
    entre(proporcion(NORMAL, (r) => r.titulos === 0), 0, 0.2, 'carreras sin un solo título');
});
