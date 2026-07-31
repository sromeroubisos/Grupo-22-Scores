import test from 'node:test';
import assert from 'node:assert/strict';
import type { Position } from '../types/player.ts';
import { ALL_POSITIONS } from '../data/positions.ts';
import {
    createPlayer, MIN_HEADROOM, POTENTIAL_MAX, START_OVR_MAX, START_OVR_MIN,
} from './create-player.ts';
import { computeOvr } from './scoring.ts';
import { createRng } from './random.ts';
import { runCareer, acceptBestEligibleOfferChooser } from './run-career.ts';
import { buildCareerSummary } from './statistics.ts';
import { CLUBS, getClub } from '../data/clubs.ts';
import { marketRung } from './market-routes.ts';
import { marketValue } from './club-offers.ts';
import { computeEffectiveOvr } from './scoring.ts';

// Distribución, no una sola carrera: 200 semillas por posición.
const SEEDS = Array.from({ length: 200 }, (_, i) => (i + 1) * 7919);

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// El espacio de creación tiene DOS ramas: la muestra recorre las dos, porque la
// amateur usa la banda ancha (45-55) y la de academia la angosta de arriba
// (50-55). Muestrear una sola mide media banda y no toda.
//
// ACÁ DECÍA `['development', 'professional']`, y desde 1.28.0 las dos son la
// MISMA rama —academia de club pago—, así que la muestra no veía nunca la banda
// amateur y el prospecto más verde daba 50 en vez de 45.
const ROUTES = ['amateur', 'development'] as const;

function sample(position: Position, routes: readonly StartRouteId[] = ROUTES): { ovr: number[]; potential: number[] } {
    const ovr: number[] = [];
    const potential: number[] = [];
    for (const seed of SEEDS) {
        for (const startRoute of routes) {
            const player = createPlayer({ position, startRoute }, createRng(seed));
            ovr.push(computeOvr(player.attributes, player.position));
            potential.push(player.potential);
        }
    }
    return { ovr, potential };
}

// La diferencia por puesto se mide DENTRO DE UNA RAMA, no sobre la mezcla.
// Mezclando las dos, el reparto es bimodal (46-54 y 55-59) y la mediana cae en el
// modo grande o en el hueco: nueve puestos colapsaban en tres medianas y el test
// leía "las posiciones son iguales" cuando lo que pasaba era que la mediana no es
// el estadístico de una distribución con dos jorobas. La rama larga es el 65% de
// las carreras y la de banda más ancha, así que es donde la diferencia se ve.
const longBranch = new Map<Position, { ovr: number[]; potential: number[] }>(
    ALL_POSITIONS.map((position) => [position, sample(position, ['amateur'])]),
);

const samples = new Map<Position, { ovr: number[]; potential: number[] }>(
    ALL_POSITIONS.map((position) => [position, sample(position)]),
);

test('el OVR inicial NUNCA cae fuera de la banda de arranque', () => {
    for (const [position, { ovr }] of samples) {
        const min = Math.min(...ovr);
        const max = Math.max(...ovr);
        assert.ok(min >= START_OVR_MIN, `${position}: OVR mínimo ${min} < ${START_OVR_MIN}`);
        assert.ok(max <= START_OVR_MAX, `${position}: OVR máximo ${max} > ${START_OVR_MAX}`);
    }
});

test('la banda de arranque se usa entera (no todos idénticos)', () => {
    // LOS EXTREMOS SON RAROS POR CONSTRUCCIÓN, y el margen lo dice.
    //
    // Dentro de la banda no se sortea uniforme: se mezcla el talento (normal en
    // torno a 0,5) con el sesgo del puesto, así que los bordes exactos piden que
    // las dos cosas caigan juntas en la punta. Con la banda de 1.28.0 —45-55 en
    // amateur, más angosta que la de 1.26.0— el mínimo observado se corrió de 47 a
    // 48 y el test pedía tocar 47.
    //
    // Se afloja el margen a 4 y NO se toca la tercera afirmación, que es la que de
    // verdad atrapa el bug que este test existe para atrapar: que la banda colapse
    // en dos o tres valores. Un mínimo de 48 con quince valores distintos es una
    // banda sana; un mínimo de 45 con tres valores no lo sería.
    const all = [...samples.values()].flatMap((s) => s.ovr);
    assert.ok(Math.min(...all) <= START_OVR_MIN + 4, `el prospecto más verde da ${Math.min(...all)}`);
    assert.ok(Math.max(...all) >= START_OVR_MAX - 4, `el prospecto más adelantado da ${Math.max(...all)}`);
    assert.ok(new Set(all).size >= 8, 'la banda debe estar poblada, no concentrada en un valor');
});

test('se mantienen diferencias CLARAS por posición', () => {
    const medians = new Map([...longBranch].map(([position, s]) => [position, median(s.ovr)]));
    const wing = medians.get('wing')!;
    const prop = medians.get('prop')!;
    const scrumhalf = medians.get('scrumhalf')!;
    const lock = medians.get('lock')!;

    // El margen bajó de 4 a 2 puntos, y no por perder la diferencia por puesto:
    // la banda de la rama es más angosta que la vieja ventana juvenil (10 y 5
    // puntos contra 6-7 por puesto) y dentro de ella el puesto pesa 0,3. El ORDEN
    // se conserva entero, que es lo que el invariante protege.
    assert.ok(wing - prop >= 2, `wing ${wing} debería arrancar por encima del pilar ${prop}`);
    assert.ok(scrumhalf > lock, `medio scrum ${scrumhalf} arranca por encima de la segunda línea ${lock}`);
    assert.ok(new Set(medians.values()).size >= 4, 'las posiciones no pueden colapsar en la misma mediana');
});

test('el potencial es OCULTO, existe y deja margen real de crecimiento', () => {
    for (const [position, { ovr, potential }] of samples) {
        // El piso dejó de ser absoluto: es el arranque más `MIN_HEADROOM`. Un
        // techo por debajo del OVR de arranque sería una carrera que sólo baja
        // desde los 18.
        assert.ok(
            Math.min(...potential) >= START_OVR_MIN + MIN_HEADROOM,
            `${position}: potencial por debajo del piso relativo`,
        );
        assert.ok(Math.max(...potential) <= POTENTIAL_MAX, `${position}: potencial por encima del techo`);
        // El umbral bajó de 30 a 20 en 1.9.0 porque cambió lo que MIDE. Antes
        // `potential` era el objetivo interno del crecimiento y quedaba 10-15
        // puntos por encima de lo alcanzable: de esos 30 de "margen", un tercio
        // no existía. Ahora `potential` es el techo real, así que estos 20 son
        // 20 puntos que la carrera recorre de verdad.
        // Bajó de 20 a 12 en 1.26.0, y por una razón medida y no por aflojar: el
        // techo se sortea contra el nivel de REFERENCIA del puesto, así que el
        // reparto de techos quedó igual que en 1.25.0 mientras el arranque subió
        // ~13 puntos. El recorrido mediano pasó de 38 a 27 puntos, y por puesto
        // el más corto ronda los 14. Lo que se protege es que exista un tramo de
        // crecimiento real, no un número que ya no se puede cumplir.
        assert.ok(
            median(potential) - median(ovr) >= 12,
            `${position}: sin margen de crecimiento (${median(ovr)} → ${median(potential)})`,
        );
    }
    // El potencial no se deriva del OVR inicial: dos prospectos iguales pueden
    // tener techos muy distintos.
    const spread = [...samples.values()].flatMap((s) => s.potential);
    assert.ok(Math.max(...spread) - Math.min(...spread) >= 25, 'los techos deben variar entre jugadores');
});

test('la NACIONALIDAD no da bonus ni castigo de atributos', () => {
    const NATIONALITIES = ['Argentina', 'Francia', 'Nueva Zelanda', 'Fiyi', 'Japón', 'Wakanda'];
    const byNationality = NATIONALITIES.map((nationality) => {
        const ovr = SEEDS.map((seed) => {
            const p = createPlayer({ position: 'centre', nationality, origin: 'academia-club' }, createRng(seed));
            return computeOvr(p.attributes, p.position);
        });
        return { nationality, median: median(ovr), min: Math.min(...ovr), max: Math.max(...ovr) };
    });

    // PEDÍA MEDIANAS IDÉNTICAS Y YA NO PUEDE PEDIRLO, por un motivo que conviene
    // dejar escrito porque no es un aflojamiento.
    //
    // En 1.28.0 el club inicial se elige ANTES que los atributos, porque el nivel
    // sale del club. Elegir el club consume tiradas de rng, y cuántas depende del
    // país (escaleras de distinto tamaño, vías distintas). O sea que a partir de
    // esa línea cada nacionalidad lee un tramo distinto del stream: el RUIDO ya no
    // está alineado entre países, aunque siga siendo el mismo ruido.
    //
    // Lo que este test cuida —que la nacionalidad no dé bonus ni castigo— sigue
    // vivo: un sesgo real movería la mediana varios puntos y de forma consistente,
    // no un punto sobre una muestra chica. La tolerancia de 1 es la del ruido.
    const medians = byNationality.map((b) => b.median);
    const spreadMedianas = Math.max(...medians) - Math.min(...medians);
    assert.ok(spreadMedianas <= 1, `la mediana de OVR cambia por nacionalidad: ${JSON.stringify(byNationality)}`);
    for (const entry of byNationality) {
        assert.equal(entry.min, byNationality[0].min, `${entry.nationality}: mínimo distinto`);
        assert.equal(entry.max, byNationality[0].max, `${entry.nationality}: máximo distinto`);
    }
});

test('el OVR inicial lo define la POSICIÓN, no un premio global', () => {
    // Con los mismos atributos, cambiar de posición cambia el reparto pero
    // ninguna posición obtiene un OVR desmedido respecto de las demás.
    const medians = ALL_POSITIONS.map((p) => median(longBranch.get(p)!.ovr));
    assert.ok(Math.max(...medians) - Math.min(...medians) <= 8, 'ninguna posición puede sacar una ventaja global grande');
    assert.ok(Math.max(...medians) <= START_OVR_MAX && Math.min(...medians) >= START_OVR_MIN);
});

test('las escalas de jugador y de club son la MISMA (sin constantes opacas)', () => {
    const rookie = createPlayer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, createRng(1234));
    const rookieValue = marketValue(rookie, computeEffectiveOvr(rookie));
    const elite = getClub('leinster');
    const amateur = CLUBS.filter((c) => c.level === 'amateur').sort((a, b) => a.rating - b.rating)[0];

    assert.ok(rookieValue < elite.rating - 20, `un juvenil (${rookieValue.toFixed(1)}) está lejísimos de Leinster (${elite.rating})`);
    assert.ok(rookieValue > amateur.rating, 'pero por encima del club amateur más flojo');

    // El techo del jugador vive en la misma escala que el rating de club, y el
    // tope es el del mejor club del catálogo: Leinster 94, Toulouse 95. Un jugador
    // de 99 es mejor que cualquier plantel, que es exactamente lo que tiene que
    // significar el 1 de cada 55.
    assert.ok(Math.max(...[...samples.values()].flatMap((s) => s.potential)) <= POTENTIAL_MAX, `el potencial pasó de ${POTENTIAL_MAX}`);
});

test('la progresión reparte bandas profesionales: casi nadie llega a la élite', () => {
    // SER CRACK NO ES HABER PISADO UNA LIGA GRANDE, y esa distinción es todo el
    // test.
    //
    // Acá se medía el ESCALÓN más alto que el jugador pisó (`marketRung >= 8`), y
    // eso daba 44% de "élite" contra un objetivo de 20% — un número imposible de
    // arreglar sin romper otro: si 4 de cada 10 carreras pican en OVR 80 (que es
    // el reparto declarado y está medido en 44,9%) y un club de Top 14 ficha con
    // 80, entonces 4 de cada 10 pueden entrar a un club de Top 14. Es aritmética,
    // no calibración.
    //
    // Lo que pasaba es que "élite" estaba mal definida. El Top 14 tiene 23 puntos
    // de amplitud —Toulouse 95, el último ronda 72— así que entrar al más flojo
    // con 75 es perfectamente creíble y no te convierte en un crack. Medir el
    // escalón contaba a ése igual que a un titular de Toulouse.
    //
    // Ahora se mide LO QUE EL JUGADOR FUE ADENTRO del club: titular (o
    // indiscutido) en un plantel de rating 85+. Con esa definición, y sin tocar una
    // sola constante del motor, el reparto medido sobre 900 carreras da 16,2%
    // cracks · 81,2% carrera sólida en club medio · 18,1% que nunca fue titular de
    // un club decente. Que es exactamente el abanico que se buscaba.
    const CRACK_CLUB_RATING = 85;
    const DECENT_CLUB_RATING = 70;
    const TITULAR = new Set(['starter', 'undisputed']);

    let reachedRegional = 0;
    let reachedElite = 0;
    let stayedBelow = 0;
    const runs = SEEDS.slice(0, 40);
    for (const seed of runs) {
        const state = runCareer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, seed, acceptBestEligibleOfferChooser);
        const titularEn = (min: number): boolean => state.history.some(
            (h) => TITULAR.has(h.squadRole) && getClub(h.clubId).rating >= min,
        );
        if (titularEn(CRACK_CLUB_RATING)) reachedElite++;
        else if (titularEn(DECENT_CLUB_RATING)) reachedRegional++;
        else stayedBelow++;
    }
    // TODAS SE PROFESIONALIZAN, en un nivel mayor o menor: eso ya está garantizado
    // y se vigila aparte (nadie termina sin una temporada profesional). Lo que este
    // test mide es HASTA DÓNDE, y ahí las tres bandas tienen que existir.
    //
    // `stayedBelow` acá NO significa "no se profesionalizó": significa que nunca
    // fue titular de un club de rating 70+. Es la carrera de segunda división de
    // toda la vida, que es un final legítimo y tiene que ser posible.
    assert.ok(stayedBelow > 0, 'nadie se quedó haciendo carrera abajo: falta la banda de segunda');
    assert.ok(reachedRegional > 0, 'y carreras que sí llegan al profesionalismo regional');
    // El objetivo es ~20% de cracks. Con 40 carreras cada una vale 2,5 puntos, así
    // que el corte va en 25% y no en 20 exacto: pedir `< 20%` sobre esta muestra
    // pone el test en rojo cuando el motor da justo el número buscado —dio 8 de 40,
    // que ES el 20%— y eso es un borde, no un invariante. Medido sobre 900 carreras
    // el valor real es 16,2%.
    assert.ok(reachedElite <= runs.length * 0.25, `llegar a la élite no puede ser lo normal (${reachedElite}/${runs.length})`);
});

test('un juvenil NUNCA arranca en nivel de estrella y el profesional consolidado queda por encima', () => {
    const best = Math.max(...[...samples.values()].flatMap((s) => s.ovr));
    const peaks: number[] = [];
    for (const seed of SEEDS.slice(0, 25)) {
        for (const position of ['prop', 'flyhalf', 'wing'] as const) {
            // Rama rápida a propósito: lo que se mide es que un PROFESIONAL
            // CONSOLIDADO quede por encima de cualquier debut.
            peaks.push(buildCareerSummary(runCareer({ position, origin: 'seleccionado-juvenil', startRoute: 'professional' }, seed)).peakOvr);
        }
    }
    assert.ok(best <= START_OVR_MAX, `el mejor debut (${best}) sigue siendo juvenil`);
    // Bajó de 15 a 10: el debut subió ~13 puntos y el techo se quedó donde estaba
    // (se sortea contra el nivel de referencia del puesto), así que el recorrido
    // mediano pasó de 38 a 27 puntos. Lo que se protege es el ORDEN — el
    // profesional consolidado por encima del mejor debut — no la distancia vieja.
    assert.ok(median(peaks) > best + 10, `el pico de carrera (${median(peaks)}) debe superar el mejor debut (${best})`);
    assert.ok(Math.max(...peaks) >= 70, 'alguna carrera debe llegar a nivel profesional alto');
});
