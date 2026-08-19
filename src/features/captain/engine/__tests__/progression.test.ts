// LA PROGRESIÓN: que el canal exista, y que lo que promete sea lo que hace.
//
// Este archivo se escribió con la disciplina del §2 del CLAUDE de captain:
// ANTES de creerle a una palanca hay que verificar que el motor tenga un canal
// que la transporte. Se pagó dos veces no hacerlo —la carta de pretemporada
// rediseñada entera para mover una medición que no se podía mover, y una
// compuerta sobre el tiempo de juego que premiaba al brazo que quería frenar—.
//
// Por eso el primer test no es "el entorno da 1,25 en el Top 14" —eso es la
// tabla leyéndose a sí misma— sino "dos jugadores IDÉNTICOS, uno en el Top 14 y
// otro en un club de barrio, terminan distinto". Si eso no pasa, ninguna
// calibración del mundo lo arregla.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainAttributes, CaptainPlayer, DevelopmentProfile } from '../../types/player.ts';
import type { SquadTrack } from '../../types/captain.ts';
import { baseAttributes, getFamily } from '../../data/positions.ts';
import { createRng } from '../random.ts';
import { ovrFromAttributes, potentialOf } from '../ovr.ts';
import {
    OVR_GROWTH_CAP_PER_SEASON,
    ageOneSeason,
    applySeriousInjuryRegression,
} from '../aging.ts';
import {
    DEVELOPMENT_PROFILES,
    profileDistribution,
    profileGrowthFactor,
    rollDevelopmentProfile,
} from '../development-profile.ts';
import { environmentFactor, meritFactor, seasonGrowthScale, youthFactor } from '../growth.ts';
// El jugador de laboratorio no compra nada: este archivo mide la progresión y la
// tienda tiene el suyo. Pasarlo explícito —y no dejar que `ageOneSeason` ponga un
// default— es lo que hace visible que acá NO hay compras adentro.
import { NO_SHOP_PERKS } from '../shop.ts';
import { RATING_PIVOT, seasonRating } from '../season-rating.ts';
import { evaluateSeasonAwards } from '../awards.ts';
import { divisionMoveFor } from '../promotion.ts';
import { championOf, cupsFor, leagueTableOf } from '../clubs.ts';
import { emptyNational, evaluateNationalTeam } from '../national-team.ts';
import { createEligibility } from '../eligibility.ts';
import type { NationalRecord } from '../../types/captain.ts';
import { getClub } from '../../data/catalogs.ts';
import { awardableTrophies, championOfTournament, nationalTitlesFor } from '../international-results.ts';
import {
    INTERNATIONAL_COMPETITIONS,
    WORLD_CUP_ID,
    competitionsFor,
    getInternationalCompetition,
    internationalSeason,
} from '../../data/catalogs.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  Un jugador de laboratorio
// ═══════════════════════════════════════════════════════════════════════════

function jugador(overrides: Partial<CaptainPlayer> = {}): CaptainPlayer {
    const family = overrides.family ?? 'tercera-linea';
    const attrs: CaptainAttributes = baseAttributes(family);
    const ovr = ovrFromAttributes(family, attrs);
    return {
        name: 'Test',
        surname: 'Jugador',
        age: 18,
        family,
        number: getFamily(family).numbers[0],
        attrs,
        ovr,
        potentialBase: ovr + 20,
        developmentProfile: 'normal',
        // LONGEVIDAD CERO: el jugador de laboratorio se queda en la curva
        // exacta de su puesto. Es el mismo criterio que `shop: []` de más
        // abajo — este archivo mide la progresión, y una tirada de longevidad
        // encima movería la meseta por un canal que no está bajo estudio.
        longevity: 0,
        built: 0,
        clubId: null,
        countryCode: 'ar',
        retired: false,
        retirementReason: null,
        flags: {},
        // EL JUGADOR DE LABORATORIO NO COMPRA NADA, y eso es lo que se quiere
        // medir acá: este archivo mide la PROGRESIÓN —entorno, curva, perfil,
        // lesión— y una compra adentro le movería el techo por un canal que no
        // es el que está bajo estudio. La tienda tiene su propio archivo.
        shop: [],
        injuryLoss: {},
        ...overrides,
    };
}

/**
 * Corre N temporadas con un `growthScale` fijo y devuelve la media final.
 *
 * El rng se re-crea con la misma semilla en cada corrida, así que las dos ramas
 * de una comparación reciben EXACTAMENTE las mismas tiradas: lo único que las
 * separa es lo que se quiso separar. Sin eso, la comparación mediría el ruido.
 */
function correr(p: CaptainPlayer, seasons: number, growthScale: number, playedShare = 0.8): number {
    const rng = createRng(1234);
    for (let i = 0; i < seasons; i += 1) {
        ageOneSeason(p, rng, null, 0, playedShare, {
            growthScale,
            perks: NO_SHOP_PERKS,
        });
        p.age += 1;
    }
    return p.ovr;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · EL CANAL — lo primero, y sin esto lo demás no significa nada
// ═══════════════════════════════════════════════════════════════════════════

test('EL ENTORNO TRANSPORTA: el mismo jugador crece distinto según dónde entrene', () => {
    const elite = correr(jugador(), 6, environmentFactor('elite-world'));
    const barrio = correr(jugador(), 6, environmentFactor('amateur'));

    assert.ok(
        elite > barrio,
        `el entorno no mueve nada: élite ${elite} contra barrio ${barrio}. `
        + 'Si esto falla, la tabla de `growth.ts` es decorativa y ninguna calibración la arregla.',
    );
});

test('EL TECHO SIGUE SIENDO EL TECHO: el entorno cambia CUÁNDO, no ADÓNDE', () => {
    // Es la contracara del test de arriba y la afirmación central de
    // `growth.ts`: `pull` es proporcional a la brecha, así que el lazo converge
    // igual. Con temporadas de sobra, el del club de barrio llega al MISMO lugar
    // que el de élite — solo que tarda el doble.
    //
    // Que esto siga siendo verdad es lo que impide leer mal la palanca: el
    // entorno no le sube ni le baja el techo a nadie.
    const techo = potentialOf(jugador());
    const barrio = correr(jugador(), 14, environmentFactor('amateur'));

    assert.ok(
        barrio >= techo - 2,
        `con catorce temporadas el del barrio tendría que llegar igual: ${barrio} contra un techo de ${techo}`,
    );
});

test('EL TOPE DE TEMPORADA no se pasa ni con un factor absurdo', () => {
    // `growthScale` es un producto de seis factores y los productos tienen cola.
    // Este test es la red: aunque alguien mueva una constante de `growth.ts` sin
    // medir, una temporada no puede subir quince puntos de media.
    const p = jugador({ potentialBase: 99 });
    const antes = p.ovr;
    const rng = createRng(7);
    ageOneSeason(p, rng, null, 0, 1, { growthScale: 40, perks: NO_SHOP_PERKS });

    assert.ok(
        p.ovr - antes <= OVR_GROWTH_CAP_PER_SEASON,
        `una temporada subió ${p.ovr - antes} puntos, y el tope es ${OVR_GROWTH_CAP_PER_SEASON}`,
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA CURVA POR ATRIBUTO
// ═══════════════════════════════════════════════════════════════════════════

test('en el declive se va la velocidad y queda el oficio', () => {
    // Es la afirmación entera de la tabla `ATTRIBUTE_PEAK`, y la razón por la
    // que un apertura juega hasta los 35 y un wing no. Se mide en el wing, que
    // es el puesto donde `velocidad` y `liderazgo` conviven en la misma media.
    const p = jugador({ family: 'wing-fullback', age: 33, potentialBase: 40 });
    const velocidadAntes = p.attrs.velocidad;
    const liderazgoAntes = p.attrs.liderazgo;

    const rng = createRng(99);
    for (let i = 0; i < 3; i += 1) {
        ageOneSeason(p, rng, null, 0, 0.5, { growthScale: 1, perks: NO_SHOP_PERKS });
        p.age += 1;
    }

    const caidaVelocidad = velocidadAntes - p.attrs.velocidad;
    const caidaLiderazgo = liderazgoAntes - p.attrs.liderazgo;

    assert.ok(caidaVelocidad > 0, 'la velocidad no cayó: el declive no está corriendo');
    assert.ok(
        caidaVelocidad > caidaLiderazgo,
        `la velocidad tiene que caer más rápido que el liderazgo: ${caidaVelocidad} contra ${caidaLiderazgo}`,
    );
});

test('LA CURVA REDISTRIBUYE, NO INFLA: el movimiento de la media no se agranda solo', () => {
    // El modo de fallo que la normalización existe para evitar: una tabla de
    // curvas sin normalizar no reparte el movimiento, lo multiplica — y de paso
    // mueve la calibración entera del motor sin que nadie lo haya pedido.
    //
    // La verificación honesta no es leer la fórmula sino comparar CONTRA UNA
    // EDAD DE REFERENCIA: a los 18, con todos los atributos lejos de su pico, la
    // curva devuelve lo mismo para los cuatro y la normalización tiene que ser
    // exactamente neutra. Si el reparto inflara, acá se vería.
    const conCurva = jugador({ age: 18 });
    const antes = conCurva.ovr;
    const rng = createRng(555);
    ageOneSeason(conCurva, rng, null, 0, 0.8, { growthScale: 1, perks: NO_SHOP_PERKS });
    const delta = conCurva.ovr - antes;

    assert.ok(delta > 0, 'a los 18 con techo de sobra el jugador tiene que crecer');
    assert.ok(delta <= 5, `el reparto infló el movimiento: subió ${delta} puntos en una temporada de las normales`);
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL PERFIL — cambia el CUÁNDO, no el CUÁNTO
// ═══════════════════════════════════════════════════════════════════════════

test('el precoz llega antes y el tardío llega después, pero llegan los dos', () => {
    const alos22 = (perfil: DevelopmentProfile): number => {
        const p = jugador({ developmentProfile: perfil });
        const rng = createRng(31);
        for (let i = 0; i < 4; i += 1) {
            ageOneSeason(p, rng, null, 0, 0.8, {
                growthScale: profileGrowthFactor(perfil, p.age),
                perks: NO_SHOP_PERKS,
            });
            p.age += 1;
        }
        return p.ovr;
    };

    assert.ok(alos22('early') > alos22('late'), 'a los 22 el precoz tiene que estar por delante del tardío');

    // Y al final de la carrera se emparejan: si un perfil llegara más alto que
    // otro, dejaría de ser una forma distinta de carrera para ser la mejor.
    const alFinal = (perfil: DevelopmentProfile): number => {
        const p = jugador({ developmentProfile: perfil });
        const rng = createRng(31);
        for (let i = 0; i < 12; i += 1) {
            ageOneSeason(p, rng, null, 0, 0.8, {
                growthScale: profileGrowthFactor(perfil, p.age),
                perks: NO_SHOP_PERKS,
            });
            p.age += 1;
        }
        return p.ovr;
    };

    const spread = Math.max(...DEVELOPMENT_PROFILES.map(alFinal)) - Math.min(...DEVELOPMENT_PROFILES.map(alFinal));
    assert.ok(spread <= 4, `ningún perfil puede ser estrictamente mejor: el pico se separa ${spread} puntos`);
});

test('el reparto de perfiles depende del puesto y no se sortea igual para todos', () => {
    // Los backs viven de la velocidad, que pica joven; los forwards del empuje,
    // que madura cerca de los 30. Si los dos grupos sortearan igual, elegir
    // puesto no cambiaría la forma esperable de la carrera.
    assert.ok(profileDistribution('back').early > profileDistribution('forward').early);
    assert.ok(profileDistribution('forward').late > profileDistribution('back').late);

    // Y el sorteo devuelve siempre uno de los tres declarados, nunca undefined.
    const rng = createRng(2026);
    for (let i = 0; i < 50; i += 1) {
        const perfil = rollDevelopmentProfile(i % 2 === 0 ? 'wing-fullback' : 'primera-linea', rng);
        assert.ok(DEVELOPMENT_PROFILES.includes(perfil), `sorteó un perfil que no existe: ${perfil}`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LOS FACTORES, uno por uno
// ═══════════════════════════════════════════════════════════════════════════

test('los factores tienen el signo que prometen', () => {
    assert.ok(environmentFactor('elite-world') > environmentFactor('semipro'));
    assert.ok(environmentFactor('semipro') > environmentFactor('amateur'));
    // Un nivel que no existe cae al piso y no a `undefined`: un club sin nivel
    // resoluble tiene que entrenar como un club de barrio, no romper la cuenta.
    assert.ok(Number.isFinite(environmentFactor('nivel-que-no-existe')));
    assert.ok(Number.isFinite(environmentFactor(null)));

    assert.ok(youthFactor(19) > youthFactor(22));
    assert.ok(youthFactor(22) > youthFactor(28));
    assert.equal(youthFactor(28), youthFactor(34), 'pasados los 23 el empuje juvenil no existe');

    // El mérito: sin pasado no empuja ni frena. Es una afirmación y no una
    // conveniencia — inventarle una temporada anterior al pibe de 18 sería
    // afirmar algo sobre un año que no se jugó.
    assert.equal(meritFactor(null), 1);
    const bueno: { rating: number; track: SquadTrack } = { rating: 8.5, track: 'club' };
    const malo: { rating: number; track: SquadTrack } = { rating: 5.2, track: 'club' };
    assert.ok(meritFactor(bueno) > 1);
    assert.ok(meritFactor(malo) < 1);
    assert.ok(
        meritFactor({ rating: RATING_PIVOT, track: 'nacional' })
        > meritFactor({ rating: RATING_PIVOT, track: 'club' }),
        'entrenar con el seleccionado tiene que formar más que no hacerlo',
    );
});

test('la tirada del año se hace SIEMPRE y una sola vez', () => {
    // La regla del stream: si el sorteo dependiera de la edad, del club o de si
    // hay temporada anterior, dos partidas con la misma semilla dejarían de ser
    // comparables. Se verifica con el estado del rng, que es lo único que no
    // miente.
    const base = { stage: 'amateur' as const, clubLevel: 'amateur', profile: 'normal' as const, previous: null };

    const a = createRng(4242);
    seasonGrowthScale({ ...base, age: 18 }, a);

    const b = createRng(4242);
    seasonGrowthScale({ ...base, age: 34, clubLevel: 'elite-world', previous: { rating: 9, track: 'nacional' } }, b);

    assert.equal(a.state, b.state, 'la cantidad de tiradas cambió según el input: el stream depende del camino');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LA LESIÓN GRAVE
// ═══════════════════════════════════════════════════════════════════════════

test('volver de una lesión grave cuesta atributos, no solo fechas', () => {
    const p = jugador({ age: 26 });
    const antes = { ...p.attrs };
    applySeriousInjuryRegression(p, createRng(11));

    assert.ok(p.attrs.velocidad < antes.velocidad, 'la lesión no tocó la velocidad');
    assert.ok(p.attrs.choque < antes.choque, 'la lesión no tocó el choque');
    assert.ok(p.attrs.aguante < antes.aguante, 'la lesión no tocó el aguante');
    assert.equal(p.attrs.vision, antes.vision, 'una rodilla no te saca visión de juego');
});

// ═══════════════════════════════════════════════════════════════════════════
//  6 · EL PUNTAJE DE LA TEMPORADA
// ═══════════════════════════════════════════════════════════════════════════

test('el puntaje es RELATIVO: producir lo esperado da una temporada correcta', () => {
    const correcta = seasonRating({
        glory: 10, expectedGlory: 10, share: 0.5, matchesPlayed: 18, caps: 0, titles: 0,
    });
    assert.equal(correcta, RATING_PIVOT, 'producir exactamente lo esperado tiene que dar la temporada correcta');

    const granTemporada = seasonRating({
        glory: 16, expectedGlory: 10, share: 0.9, matchesPlayed: 20, caps: 0, titles: 0,
    });
    assert.ok(granTemporada > correcta);

    // EL CASO QUE IMPORTA: el mismo desempeño relativo puntúa igual arriba y
    // abajo. Es lo que hace que el premio local sea alcanzable desde la Tercera.
    const enLaTercera = seasonRating({
        glory: 6, expectedGlory: 4, share: 0.8, matchesPlayed: 20, caps: 0, titles: 0,
    });
    const enElTop14 = seasonRating({
        glory: 30, expectedGlory: 20, share: 0.8, matchesPlayed: 20, caps: 0, titles: 0,
    });
    assert.equal(enLaTercera, enElTop14, 'el puntaje tiene que ser relativo al nivel, no absoluto');
});

test('una temporada sin jugar no es una temporada correcta: es el piso', () => {
    // Devolver el pivote acá haría que un año entero en la enfermería empujara
    // el crecimiento del siguiente como si se hubiera jugado.
    const sinJugar = seasonRating({
        glory: 0, expectedGlory: 0, share: 0, matchesPlayed: 0, caps: 0, titles: 0,
    });
    assert.ok(sinJugar < RATING_PIVOT);
    assert.ok(meritFactor({ rating: sinJugar, track: 'club' }) < 1, 'un año perdido tiene que frenar, no dar igual');
});

// ═══════════════════════════════════════════════════════════════════════════
//  7 · LOS PREMIOS — la escalera de alcance
// ═══════════════════════════════════════════════════════════════════════════

const PREMIO_BASE = {
    matchesPlayed: 20,
    leagueTeams: 12,
    careerSeed: 777,
};

test('el premio local se puede ganar desde abajo, y el del mundo no', () => {
    // Es la razón de ser de la escalera: sin el premio local, el 100% de los
    // premios era del que ya tenía todo — y en este juego eso quiere decir que
    // la carrera típica no ganaba ninguno.
    let ganoLocalAlgunaVez = false;
    for (let season = 1; season <= 40; season += 1) {
        const premios = evaluateSeasonAwards({
            ...PREMIO_BASE,
            ovr: 62, // un jugador de club, lejos de cualquier élite
            rating: 8.4,
            band: 1,
            leaguePosition: 2,
            track: 'club',
            season,
        });
        assert.ok(!premios.includes('mejor-del-mundo'), 'un jugador de 62 no puede ser el mejor del mundo');
        assert.ok(!premios.includes('xv-ideal'), 'el XV ideal pide competición profesional');
        if (premios.includes('mejor-local')) ganoLocalAlgunaVez = true;
    }
    assert.ok(ganoLocalAlgunaVez, 'el premio local nunca se gana desde abajo: la escalera no tiene primer escalón');
});

test('arriba del corte el mejor del mundo deja de ser una tirada', () => {
    // A 96 el jugador ES el mejor del mundo, y una temporada correcta en vez de
    // extraordinaria no lo cambia. Lo único que se le sigue exigiendo es haber
    // jugado.
    for (let season = 1; season <= 10; season += 1) {
        const premios = evaluateSeasonAwards({
            ...PREMIO_BASE, ovr: 96, rating: 6.8, band: 6, leaguePosition: 3, track: 'nacional', season,
        });
        assert.ok(premios.includes('mejor-del-mundo'), `a 96 el premio tiene que salir siempre (temporada ${season})`);
    }
});

test('un premio de temporada no se gana desde la enfermería', () => {
    const premios = evaluateSeasonAwards({
        ...PREMIO_BASE, matchesPlayed: 3, ovr: 96, rating: 9.9, band: 7, leaguePosition: 1, track: 'nacional', season: 1,
    });
    assert.deepEqual(premios, [], 'con tres partidos no hay premio de temporada completa');
});

test('la tirada de un premio no depende de si el anterior se ganó', () => {
    // Si el bucle cortara al primer premio, agregar uno nuevo arriba
    // desalinearía los de abajo y la misma semilla daría otra vitrina. Se
    // verifica comparando el premio local entre un jugador que gana los de
    // arriba y otro que no.
    const conElite = evaluateSeasonAwards({
        ...PREMIO_BASE, ovr: 96, rating: 8.5, band: 7, leaguePosition: 1, track: 'nacional', season: 5,
    });
    const sinElite = evaluateSeasonAwards({
        ...PREMIO_BASE, ovr: 60, rating: 8.5, band: 1, leaguePosition: 1, track: 'club', season: 5,
    });
    assert.equal(
        conElite.includes('mejor-local'),
        sinElite.includes('mejor-local'),
        'el premio local cambió según si se ganaron los de arriba: el stream se está desalineando',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  8 · ASCENSO Y DESCENSO
// ═══════════════════════════════════════════════════════════════════════════

test('salir primero sube y salir último baja, con las plazas del dato', () => {
    const sube = divisionMoveFor('prod2', 1, 16);
    assert.equal(sube?.direction, 'promotion');
    assert.equal(sube?.to, 'top14');

    // Del Top 14 bajan DOS, así que el anteúltimo también desciende. No hay un
    // "último" universal: las plazas salen del grafo.
    assert.equal(divisionMoveFor('top14', 13, 14)?.direction, 'relegation');
    assert.equal(divisionMoveFor('top14', 12, 14), null);
});

test('las competiciones paralelas no ascienden ni descienden a nadie', () => {
    // El Super Rugby, la URC, el NPC y la SRA no son primera y segunda de nada.
    assert.equal(divisionMoveFor('super-rugby', 1, 12), null);
    assert.equal(divisionMoveFor('urc', 16, 16), null);
    assert.equal(divisionMoveFor('sra', 1, 8), null);
});

test('sin tabla resoluble no se mueve nadie', () => {
    // EL CASO QUE ROMPE: `leagueStandingOf` devuelve posición 0 cuando el club no
    // aparece en la tabla —competición sin campo, club sin resolver—. Un 0
    // tratado como "salió primero" ascendería a todo el mundo en silencio.
    assert.equal(divisionMoveFor('prod2', 0, 16), null);
    assert.equal(divisionMoveFor('prod2', 1, 1), null);
});

// ═══════════════════════════════════════════════════════════════════════════
//  9 · LA TABLA DE LIGA — una sola fuente
// ═══════════════════════════════════════════════════════════════════════════

test('el campeón ES el primero de la tabla, y la tabla es una permutación', () => {
    const tabla = leagueTableOf('top14', 3);
    assert.ok(tabla.length >= 2, 'el Top 14 tendría que tener campo');
    assert.equal(championOf('top14', 3), tabla[0]);
    assert.equal(new Set(tabla).size, tabla.length, 'la tabla repite clubes');
});

test('la liga tiene el mismo campeón juegue quien juegue', () => {
    // La semilla es del torneo y no del jugador: es lo que hace que el mundo sea
    // un mundo y no un espejo de tu carrera.
    assert.equal(championOf('top14', 5), championOf('top14', 5));
    assert.notEqual(
        championOf('top14', 5),
        championOf('top14', 6),
        'la misma liga corona al mismo club dos años seguidos siempre: la temporada no entra en la semilla',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  10 · LOS TÍTULOS DE SELECCIÓN
// ═══════════════════════════════════════════════════════════════════════════

test('sin un cap no hay título de selección, aunque tu unión gane', () => {
    // El Championship que ganó Argentina el año que jugabas la Primera B lo ganó
    // Argentina, no vos.
    for (let seasonIndex = 0; seasonIndex <= 12; seasonIndex += 1) {
        assert.deepEqual(
            nationalTitlesFor({ unionCode: 'ar', seasonIndex, caps: 0 }),
            [],
            `temporada ${seasonIndex}: se acreditó un título sin haber jugado un test`,
        );
    }
});

test('con caps, la unión que gana le acredita el título a su jugador', () => {
    let acreditado = 0;
    for (let seasonIndex = 0; seasonIndex <= 20; seasonIndex += 1) {
        acreditado += nationalTitlesFor({ unionCode: 'nz', seasonIndex, caps: 8 }).length;
    }
    assert.ok(acreditado > 0, 'Nueva Zelanda no ganó un solo torneo en veinte años');
});

test('las giras no reparten trofeos: nadie sale campeón de una ventana', () => {
    // La de julio y la de noviembre son `kind: 'window'` y no declaran trofeo,
    // así que quedan afuera por el DATO y no por un `if` que alguien pueda
    // borrar. Se verifica sobre el calendario entero.
    const ventanas = INTERNATIONAL_COMPETITIONS.filter((c) => c.kind === 'window');
    assert.ok(ventanas.length > 0, 'el calendario no declara ninguna ventana: cambió de forma');
    for (const ventana of ventanas) {
        assert.deepEqual(
            awardableTrophies(ventana, 'ar'),
            [],
            `${ventana.id} reparte un trofeo, y una gira no corona a nadie`,
        );
    }
});

test('el Grand Slam y la Triple Corona NO se otorgan: el motor no simula el fixture', () => {
    // Los dos llevan `requires` en el calendario —ganar los cinco partidos, o
    // ganarles a las otras tres británicas— y este motor sabe quién ganó el
    // torneo, no cómo. Darlos con una moneda aparte sería un trofeo que dice una
    // cosa y se decide por otra.
    //
    // El filtro lee `requires`, así que un condicional nuevo queda excluido solo.
    // Este test verifica las dos mitades: que los condicionales existan en el
    // dato (si no, no estaría probando nada) y que ninguno se cuele.
    const condicionales = INTERNATIONAL_COMPETITIONS
        .flatMap((c) => c.trophies)
        .filter((t) => t.requires);
    assert.ok(condicionales.length >= 2, 'el calendario dejó de declarar trofeos condicionales');

    const seisNaciones = INTERNATIONAL_COMPETITIONS.find((c) => c.trophies.some((t) => t.requires))!;
    for (const trofeo of awardableTrophies(seisNaciones, 'gb-eng')) {
        assert.equal(trofeo.requires ?? null, null, `se otorgó ${trofeo.name}, que pide simular el fixture`);
    }
});

test('el Mundial se juega cada cuatro temporadas y no todos los años', () => {
    const mundialEn = (seasonIndex: number): boolean =>
        competitionsFor('ar', seasonIndex).some((c) => c.id === WORLD_CUP_ID);

    const jugados = [];
    for (let seasonIndex = 0; seasonIndex <= 15; seasonIndex += 1) {
        if (mundialEn(seasonIndex)) jugados.push(seasonIndex);
    }

    assert.equal(jugados.length, 4, `en dieciséis temporadas hay cuatro Mundiales, hubo ${jugados.length}`);
    // Y separados por exactamente cuatro, no "cuatro en total en cualquier lado".
    for (let i = 1; i < jugados.length; i += 1) {
        assert.equal(jugados[i] - jugados[i - 1], 4, 'el Mundial se corrió de período');
    }
});

test('el empujón del Mundial existe pero no decide', () => {
    // Tu peso en el plantel inclina la balanza; si la decidiera, el Mundial
    // dejaría de ser un logro del plantel para ser una recompensa por llegar.
    const mundial = getInternationalCompetition(WORLD_CUP_ID)!;

    let sinVos = 0;
    let conVos = 0;
    let ediciones = 0;
    for (let seasonIndex = 1; seasonIndex <= 400; seasonIndex += 1) {
        if (championOfTournament(mundial, seasonIndex) === 'uy') sinVos += 1;
        if (championOfTournament(mundial, seasonIndex, { unionCode: 'uy', seasonIndex, caps: 9 }) === 'uy') conVos += 1;
        ediciones += 1;
    }
    assert.ok(conVos >= sinVos, 'estar en el plantel tendría que ayudar, no perjudicar');
    assert.ok(
        conVos < ediciones * 0.25,
        'una unión chica no puede ganar un cuarto de los Mundiales por tener un jugador adentro',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  11 · EL TOPE DE CAPS SALE DEL CALENDARIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un titular indiscutido de esa unión, listo para que lo convoquen.
 *
 * Se arma el `NationalRecord` a mano y con el estado ya en `starter` a propósito:
 * lo que estos dos tests miden es EL TOPE DEL FIXTURE, no la puerta. Entrando por
 * la puerta habría que atravesar la tirada, el `trial` y la ventana de edad, y
 * una temporada donde el dado dijo que no se leería como «el calendario funciona»
 * sin que nadie pueda distinguirlo.
 */
function yaEnElPlantel(unionCode: string): NationalRecord {
    const record = emptyNational(createEligibility(unionCode));
    record.status = 'starter';
    record.debutSeason = 1;
    record.byUnion[unionCode] = { caps: 20, squadCaps: 20 };
    return record;
}

function convocar(p: CaptainPlayer, record: NationalRecord, seasonIndex: number): number {
    return evaluateNationalTeam(p, record, {
        careerSeed: 808,
        seasonIndex,
        lastRating: 8,
        clubBand: 8,
        amateur: false,
        potential: 99,
        fame: 60,
        rival: null,
        missedLastSeason: false,
        seasonsSinceLostShirt: null,
        trialSeasons: 0,
        squadSeasons: 3,
    }).capsGained;
}

test('EL CALENDARIO MANDA: ninguna unión suma más caps que partidos tiene', () => {
    // Es la regla del CLAUDE.md raíz hecha máquina. Antes el tope era un `9`
    // escrito a mano que afirmaba que todas las uniones tienen el mismo año,
    // todos los años — y ninguna de las cuatro cosas que sabe el calendario
    // (reemplazos, llaves del Mundial, eliminatorias, suspensiones) era cierta.
    const p = jugador({ countryCode: 'ar', potentialBase: 99, age: 26 });
    p.attrs.trabajo = 99;
    p.attrs.tackle = 99;
    p.attrs.robo = 99;
    p.attrs.liderazgo = 99;
    p.ovr = ovrFromAttributes(p.family, p.attrs);

    const record = yaEnElPlantel('ar');
    for (let seasonIndex = 0; seasonIndex <= 14; seasonIndex += 1) {
        const tope = internationalSeason('ar', seasonIndex).matches;
        const caps = convocar(p, record, seasonIndex);
        assert.ok(
            caps <= tope,
            `temporada ${seasonIndex}: ${caps} caps contra un fixture de ${tope} partidos`,
        );
    }
});

test('una unión sin fixture no suma caps, y no hace falta un caso especial', () => {
    // Rusia está en el catálogo de uniones y suspendida: cero partidos, cero
    // caps. El motor no le inventa calendario, y este test es la red para que
    // nadie lo "arregle" con un piso.
    const ruso = jugador({ countryCode: 'ru', potentialBase: 99, age: 26 });
    ruso.ovr = 95;
    assert.equal(internationalSeason('ru', 2).matches, 0, 'Rusia dejó de estar suspendida en el calendario');
    assert.equal(convocar(ruso, yaEnElPlantel('ru'), 2), 0);
});

test('el año de Mundial da más caps que un año común', () => {
    // Es la clase de diferencia que un tope fijo de nueve no podía expresar: el
    // Mundial suma la fase de grupos MÁS las llaves que te dé tu reputación.
    const mundial = [];
    const comun = [];
    for (let seasonIndex = 0; seasonIndex <= 15; seasonIndex += 1) {
        const total = internationalSeason('nz', seasonIndex).matches;
        if (competitionsFor('nz', seasonIndex).some((c) => c.id === WORLD_CUP_ID)) mundial.push(total);
        else comun.push(total);
    }
    assert.ok(mundial.length > 0 && comun.length > 0, 'no se encontraron los dos tipos de año');
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(
        media(mundial) > media(comun),
        `el año de Mundial tendría que dar más partidos: ${media(mundial)} contra ${media(comun)}`,
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  12 · LAS COPAS DEL CLUB
// ═══════════════════════════════════════════════════════════════════════════

test('un club de élite juega su liga MÁS copas, y uno de barrio no', () => {
    // Es la mitad de la explicación de por qué la vitrina salía tacaña: El
    // Capitán trataba a todos los clubes como si disputaran un solo torneo. Las
    // reglas de quién entra a cada copa ya estaban escritas en el catálogo; lo
    // que faltaba era preguntarlas.
    const elite = getClub('leinster');
    const primero = { competitionId: elite.competitionId, position: 1, teams: 16 };
    assert.ok(
        cupsFor(elite, primero).length > 0,
        'el campeón de la URC no clasifica a ninguna copa: la biblioteca no se está leyendo',
    );

    // Y el corte funciona para el otro lado: un club de los escalones de abajo
    // del rugby argentino no juega copas europeas ni nada parecido.
    const barrio = getClub('sb-comercial-r-c');
    const copasDelBarrio = cupsFor(barrio, { competitionId: barrio.competitionId, position: 8, teams: 12 });
    for (const copa of copasDelBarrio) {
        assert.equal(copa.region, 'ar', `un club de barrio argentino no puede jugar ${copa.id}`);
    }
});

test('sin temporada anterior se entra solo por pertenencia, no por posición', () => {
    // La primera temporada de una carrera no tiene tabla del año pasado, y eso
    // no es un borde a parchear: el club entra a las copas que le tocan por ser
    // de su división y a ninguna que se gane terminando arriba.
    const club = getClub('leinster');
    const sinPasado = cupsFor(club, null).map((c) => c.id).sort();
    const conPrimerPuesto = cupsFor(club, { competitionId: club.competitionId, position: 1, teams: 16 })
        .map((c) => c.id).sort();

    for (const id of sinPasado) {
        assert.ok(conPrimerPuesto.includes(id), `${id} se juega sin pasado pero no saliendo primero`);
    }
});
