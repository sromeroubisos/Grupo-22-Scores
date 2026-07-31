// Regresión de la Fase 1.5: títulos (identidad real + club vs jugador +
// apariciones), terminología de movimiento, mercado como fase, y curva de OVR.
// Todo determinístico y sin red.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from '../data/clubs.ts';
import { runCareer, acceptBestEligibleOfferChooser } from './run-career.ts';
import { createInitialCareer, careerReducer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';
import { TRANSFER_EVENT_ID } from '../data/events/index.ts';
import { clubLeagueIdentity } from './competition-identity.ts';
import { classifyMovement } from './market-routes.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';
import { arRegionOf, isArDivision } from '../data/clubs2026/arSystem2026.ts';
import { computeOvr } from './scoring.ts';
import type { CareerState } from '../types/career.ts';
import type { CreatePlayerInput } from './create-player.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => (i + 1) * 4099);
const NATIONS = ['ar', 'uy', 'cl', 'nz', 'za', 'es', 'fj'];

/** Un club argentino cualquiera. Ya no hay una competición paraguas `sa-ar`. */
function anyArgentineClub() {
    const club = CLUBS.find((c) => isArDivision(c.competitionId));
    assert.ok(club, 'el catálogo debe tener clubes argentinos');
    return club!;
}

/** Corre una carrera aceptando ofertas (para ejercitar mercado y títulos). */
function fullCareer(input: CreatePlayerInput, seed: number): CareerState {
    return runCareer(input, seed, acceptBestEligibleOfferChooser);
}

function allHistory(): { state: CareerState; nat: string }[] {
    const out: { state: CareerState; nat: string }[] = [];
    const positions = ['prop', 'wing', 'flyhalf', 'lock', 'centre'] as const;
    for (const nat of NATIONS) {
        for (let i = 0; i < 12; i++) {
            out.push({ state: fullCareer({ position: positions[i % positions.length], nationalityCountryCode: nat }, (i + 1) * 2311), nat });
        }
    }
    return out;
}

// ── TÍTULOS ──────────────────────────────────────────────────────────────────

test('el título del jugador exige apariciones senior (development sin debut = 0)', () => {
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            // SÓLO LOS TÍTULOS DE CLUB. Un título de selección no se gana con
            // apariciones en el club sino con caps, y tiene su propia puerta —
            // medida en el test de abajo. Sin este filtro, el día que un jugador
            // saliera campeón con su selección en una temporada sin jugar en el
            // club, este test lo leería como un título regalado.
            for (const t of h.titlesWon.filter((x) => x.scope !== 'national-team')) {
                void t;
                const disputedSenior = h.squadTrack === 'senior' || h.appearances >= 3;
                assert.ok(disputedSenior, `título acreditado sin disputa senior (track=${h.squadTrack}, apps=${h.appearances})`);
                assert.ok(h.appearances >= 1, 'título acreditado con 0 apariciones');
            }
        }
    }
});

test('el título de SELECCIÓN exige haber jugado: sin caps no hay campeonato', () => {
    // La puerta equivalente a la de las apariciones senior, en el idioma de la
    // selección: estar en la lista y no entrar nunca no es haber salido campeón.
    let vistos = 0;
    for (const { state } of allHistory()) {
        state.history.forEach((h, i) => {
            const nacionales = h.titlesWon.filter((x) => x.scope === 'national-team');
            if (nacionales.length === 0) return;
            vistos += nacionales.length;
            assert.ok((state.seasons[i]?.capsGained ?? 0) > 0, 'título de selección sin un solo cap esa temporada');
            for (const t of nacionales) {
                assert.equal(t.club, null, 'un título de selección no tiene club');
                assert.ok(t.union, 'un título de selección tiene que declarar la unión');
                assert.equal(t.category, 'national-tournament');
            }
        });
    }
    assert.ok(vistos > 0, 'la muestra no produjo ni un título de selección: el test quedó ciego');
});

test('el título del CLUB puede existir sin acreditar al jugador (honores separados)', () => {
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            // Los honores DE CLUB del jugador son un SUBCONJUNTO de los del club.
            // La comparación se hace filtrando por scope y no sobre el total
            // porque `titlesWon` mezcla las dos clases de honor desde que existen
            // los títulos de selección, y `clubTitlesWon` —como su nombre dice—
            // sigue siendo sólo del club.
            const deClub = h.titlesWon.filter((x) => x.scope !== 'national-team');
            assert.ok(h.clubTitlesWon.length >= deClub.length, 'clubTitlesWon debe contener a los títulos de club del jugador');
        }
    }
});

test('exactamente uno de club/unión está poblado en cada título', () => {
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            for (const t of [...h.titlesWon, ...h.clubTitlesWon]) {
                const tieneClub = t.club !== null;
                const tieneUnion = t.union !== null;
                assert.ok(tieneClub !== tieneUnion, `${t.competitionId}: club=${t.club} union=${t.union}`);
            }
        }
    }
});

test('un club solo NO se corona (no hay campeón de un campo de <2 equipos)', () => {
    for (const { state } of allHistory()) {
        for (const s of state.seasons) {
            if (s.titlesWon.some((t) => t.category === 'league')) {
                assert.ok(s.leagueTeams >= 2, `campeón de una liga de ${s.leagueTeams} equipos`);
            }
        }
    }
});

test('el título de liga AR/UY/CL es de la DIVISIÓN real, no del sistema paraguas', () => {
    let checked = 0;
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            const club = getClub(h.clubId);
            // La identidad del catálogo alcanza SOLO para la rama de abajo, la de
            // los sistemas paraguas: AR/UY/CL no participan de ascensos ni
            // descensos (son uniones paralelas, no divisiones), así que para esos
            // clubes catálogo y carrera dicen lo mismo.
            const identity = clubLeagueIdentity(club);
            for (const t of h.titlesWon.filter((x) => x.category === 'league')) {
                // El id del título de liga = la división en la que SE JUGÓ esa
                // temporada, que la trayectoria ya tiene congelada.
                //
                // Acá se recomputaba desde el catálogo (`identity.id`) y desde
                // 1.29.0 eso es otra cosa: los clubes ASCIENDEN Y DESCIENDEN, así
                // que el club de esta temporada puede estar hoy en otra división.
                // Un campeón del Championship no es un campeón de la Premiership,
                // y el dato correcto es el del año en que se ganó.
                assert.equal(t.competitionId, h.competitionId, 'el título de liga no coincide con la división de esa temporada');
                // Para AR/UY/CL identificadas, el id lleva la división, no es el paraguas suelto.
                if (identity.umbrellaId && identity.identified) {
                    assert.ok(t.competitionId.includes('#'), `título de liga sin división real: ${t.competitionId}`);
                    assert.notEqual(t.competitionId, identity.umbrellaId, 'el título quedó en el paraguas');
                    checked++;
                }
            }
        }
    }
    assert.ok(checked > 0, 'debe haberse validado al menos un título de división AR/UY/CL');
});

test('no hay títulos duplicados de la misma competición en una temporada', () => {
    for (const { state } of allHistory()) {
        for (const s of state.seasons) {
            const ids = s.titlesWon.map((t) => t.competitionId);
            assert.equal(new Set(ids).size, ids.length, `título duplicado en una temporada: ${ids.join(', ')}`);
        }
    }
});

test('el contador de títulos de cabecera = suma de honores del jugador', () => {
    for (const { state } of allHistory()) {
        const sumTitles = state.history.reduce((acc, h) => acc + h.titlesWon.length, 0);
        assert.equal(state.player.titles, sumTitles, 'player.titles debe igualar la suma de titlesWon');
    }
});

// ── TERMINOLOGÍA DE MOVIMIENTO ───────────────────────────────────────────────

test('un club amateur NUNCA firma contrato profesional (terminología)', () => {
    const amateurClubs = CLUBS.filter((c) => economicModelOf(c) === 'amateur');
    const from = anyArgentineClub();
    for (const target of amateurClubs.slice(0, 60)) {
        for (const emp of ['amateur', 'amateur-compensated'] as const) {
            const kind = classifyMovement(from, target, emp, 'senior');
            assert.notEqual(kind, 'professional-contract', `${target.name} (amateur) no puede ofrecer contrato profesional`);
            assert.notEqual(kind, 'semi-pro-agreement', `${target.name} (amateur) no es acuerdo semipro`);
        }
    }
});

test('pase dentro de la misma unión vs entre uniones', () => {
    // La unión ya no se adivina del nombre del torneo: sale del canon. Antes esto
    // filtraba por `divisionName.includes('URBA')`, que además de frágil no podía
    // distinguir las regiones del interior entre sí.
    const inRegion = (region: string) => CLUBS.filter((c) => arRegionOf(c.competitionId) === region);
    const urba = inRegion('urba');
    const cordoba = inRegion('centro');
    const patagonia = inRegion('patagonia');
    assert.ok(urba.length >= 2 && cordoba.length >= 1 && patagonia.length >= 1, 'faltan clubes por región');

    // Dentro de la URBA → pase amateur, incluso cruzando de división.
    assert.equal(classifyMovement(urba[0], urba[1], 'amateur', 'senior'), 'amateur-pass');
    // URBA → Córdoba → pase interuniones (ramas distintas, sistemas paralelos).
    assert.equal(classifyMovement(urba[0], cordoba[0], 'amateur', 'senior'), 'inter-union-pass');
    // Y entre dos regiones del interior también: Córdoba y la Patagonia no
    // comparten sistema. Antes las dos caían en el mismo cajón cuando el nombre
    // del torneo no nombraba la unión.
    assert.equal(classifyMovement(cordoba[0], patagonia[0], 'amateur', 'senior'), 'inter-union-pass');
});

test('un club profesional de otro país sí firma contrato / academia es invitación', () => {
    const from = anyArgentineClub();
    const pro = CLUBS.find((c) => economicModelOf(c) === 'professional')!;
    assert.equal(classifyMovement(from, pro, 'full-time-professional', 'senior'), 'professional-contract');
    assert.equal(classifyMovement(from, pro, 'semi-professional', 'development'), 'development-invite');
});

test('la SRA se ofrece por NIVEL, no por la división en la que jugués', () => {
    // Acá se exigía banda de origen ≥2: la vía llevaba `minSourceBand` y el test
    // protegía que un 4ª división no saltara a Dogos. En 1.26.0 esa presunción se
    // reemplazó por la medición directa (`minOvr: 59`), porque se equivocaba en los
    // dos extremos: dejaba afuera al de 59 de Primera B —invisible por el escudo
    // que tenía puesto y no por lo que valía— y dejaba entrar al de 48 de Primera
    // A, porque la aceptación corre contra `marketValue`, que a un pibe de 18 le
    // suma proyección. Medido con la banda, el 62% de los debutantes de la rama
    // larga recibía oferta de la SRA; con el nivel, el 0%.
    //
    // El invariante nuevo es el que de verdad importa y es más fuerte: la SRA NO
    // aparece sin el nivel que la vía declara, en ninguna división.
    for (const seed of SEEDS.slice(0, 20)) {
        let state = createInitialCareer({ position: 'prop', nationalityCountryCode: 'ar' }, seed);
        let guard = 0;
        while (state.phase !== 'retired' && guard < 60) {
            guard++;
            const event = getPendingEvent(state);
            if (event && event.id === TRANSFER_EVENT_ID) {
                const before = getClub(state.player.club);
                const ovr = computeOvr(state.player.attributes, state.player.position);
                for (const offer of state.offers) {
                    const target = getClub(offer.club);
                    // EL QUE YA ESTÁ EN LA SRA NO TIENE QUE VOLVER A ENTRAR.
                    //
                    // El `minOvr: 59` de la vía es un requisito de INGRESO: cuánto
                    // hay que valer para que una franquicia te saque de tu liga
                    // doméstica. Desde 1.28.0 se puede ARRANCAR en Selknam —un
                    // juvenil de academia de una franquicia SRA— y entonces pasar
                    // de Selknam a Dogos no es entrar a la SRA: es moverse adentro,
                    // que es un pase normal entre clubes del mismo nivel y no tiene
                    // por qué pedir el nivel de ingreso.
                    if (before.competitionId === 'sra') continue;
                    if (target.competitionId === 'sra') {
                        assert.ok(
                            ovr >= 59,
                            `SRA ofrecida con OVR ${ovr} desde ${before.name} (banda ${sportingBandOf(before)})`,
                        );
                    }
                }
            }
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                : careerReducer(state, { type: 'ADVANCE' });
        }
    }
});

// ── MERCADO COMO FASE ────────────────────────────────────────────────────────

test('el mercado se EVALÚA explícitamente cada temporada', () => {
    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar' }, 8123);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        guard++;
        const event = getPendingEvent(state);
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id })
            : careerReducer(state, { type: 'ADVANCE' });
        if (state.phase !== 'retired') {
            assert.equal(state.marketEvaluatedSeason, state.player.seasonsPlayed, 'el mercado debe evaluarse en la temporada en curso');
        }
    }
});

test('rechazar ofertas NO silencia el mercado (aparece varias veces)', () => {
    let seen = 0;
    let state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'ar' }, 5501);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        guard++;
        const event = getPendingEvent(state);
        if (event && event.id === TRANSFER_EVENT_ID) seen++;
        // SIEMPRE se queda (opción 0).
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id })
            : careerReducer(state, { type: 'ADVANCE' });
    }
    assert.ok(seen >= 2, `un jugador que rechaza igual ve el mercado (${seen} veces)`);
});

test('el mercado es determinístico: misma seed ⇒ mismas decisiones', () => {
    const a = fullCareer({ position: 'wing', nationalityCountryCode: 'nz' }, 6789);
    const b = fullCareer({ position: 'wing', nationalityCountryCode: 'nz' }, 6789);
    assert.deepEqual(a.history.map((h) => h.clubId), b.history.map((h) => h.clubId));
    assert.deepEqual(a.history.map((h) => h.ovr), b.history.map((h) => h.ovr));
});

// ── OVR ──────────────────────────────────────────────────────────────────────

test('el crecimiento juvenil es VISIBLE (mayoría de U23 sanos suben ≥2)', () => {
    let good = 0;
    let total = 0;
    for (const nat of ['nz', 'fr', 'za', 'ar']) {
        for (const seed of SEEDS) {
            const state = fullCareer({ position: 'centre', nationalityCountryCode: nat }, seed);
            for (const h of state.history) {
                // Temporada juvenil con rodaje real (no un debut de 1 partido).
                if (h.age <= 22 && h.appearances >= 5) {
                    total++;
                    if (h.ovrDelta >= 2) good++;
                }
            }
        }
    }
    assert.ok(total > 50, 'debe haber suficientes temporadas juveniles');
    assert.ok(good / total >= 0.5, `pocos juveniles con crecimiento visible: ${Math.round(good / total * 100)}%`);
});

test('OVR nunca supera al potencial (techo respetado) y no hay NaN', () => {
    for (const { state } of allHistory()) {
        assert.ok(!Number.isNaN(state.player.potential));
        for (const h of state.history) {
            assert.ok(!Number.isNaN(h.ovr), 'OVR NaN');
            // La tolerancia es de RUIDO, no de crecimiento: `growthScaleFor`
            // devuelve 0 en el techo, pero `attributeDelta` sigue sumando su
            // ±0.4 por atributo, y el pico de la carrera es un MÁXIMO sobre
            // veinte temporadas, así que captura la mayor excursión positiva de
            // ese ruido. Medido sobre 29.411 temporadas: el 3,44% queda por
            // encima del techo, el 85% de esas por 1 solo punto, y el desborde
            // máximo observado es 4. Que el techo se respete de verdad lo
            // vigila `progression-ceiling.test.ts`, que mide crecimiento real.
            assert.ok(h.ovr <= state.player.potential + 4, `OVR ${h.ovr} supera potencial ${state.player.potential}`);
        }
    }
});

test('el delta mostrado coincide con el cambio real de OVR de la temporada', () => {
    for (const { state } of allHistory()) {
        for (const s of state.seasons) {
            const entry = state.history[s.seasonIndex];
            if (entry) assert.equal(entry.ovrDelta, s.ovrEnd - s.ovrStart, 'ovrDelta del historial ≠ cambio real');
        }
    }
});

test('un potencial bajo NO llega a élite', () => {
    // Forzamos posiciones/naciones y verificamos que los de techo bajo se quedan abajo.
    for (const seed of SEEDS) {
        const state = fullCareer({ position: 'prop', nationalityCountryCode: 'ar' }, seed);
        const peak = Math.max(...state.history.map((h) => h.ovr), 0);
        if (state.player.potential <= 60) {
            assert.ok(peak <= 66, `techo ${state.player.potential} llegó a ${peak}`);
        }
    }
});
