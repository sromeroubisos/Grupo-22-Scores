// LA VENTANA DEL QUE NO SE PROFESIONALIZÓ NO CRUZA LA FRONTERA.
//
// El caso que cierra este archivo, encontrado jugando: a un sudafricano de 18 en
// un club amateur el mercado le ofrecía Paraná Rowing Club, Tucumán Lawn Tennis y
// Berazategui. Medido sobre 60 carreras `za`, sus primeras ofertas venían 46 de
// Argentina, 28 de Francia, 12 de Inglaterra y 11 de Sudáfrica.
//
// No era un peso mal calibrado: era VOLUMEN. El catálogo argentino tiene ~200
// clubes en los escalones bajos, y doscientos candidatos con peso 0,5 le ganan a
// doce con peso 2,2 sin que ninguna constante esté mal. Por eso el arreglo es una
// PUERTA y no un número — subir el multiplicador habría tapado el síntoma hasta
// que entrara el próximo catálogo nacional.
//
// Se testea contra `generateOffers` y no jugando carreras: las ofertas viven en el
// estado desde la temporada anterior, así que leerlas después de avanzar mezcla el
// empleo con el que se generaron y el de ahora. Acá se pregunta en el momento
// exacto en que el motor decide.

import test from 'node:test';
import assert from 'node:assert/strict';
import { careerReducer, getPendingEvent } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import type { Player } from '../../types/player.ts';
import { allowedRungs, generateOffers } from '../club-offers.ts';
import { computeEffectiveOvr, computeOvr, ovrExact } from '../scoring.ts';
import { createRng } from '../random.ts';
import { getClub } from '../../data/clubs.ts';
import { affinityCountryOf, homeCountryOf, marketRung, pathwayFor } from '../market-routes.ts';
import { CLUBS } from '../../data/clubs.ts';

const NACIONALIDADES = ['za', 'ar', 'fr', 'nz', 'jp', 'es', 'gb-eng', 'fj', 'gl'];
const PUESTOS = ['flyhalf', 'lock', 'wing', 'prop'] as const;

/** Un jugador recién creado, con su club y su contexto reales. */
function nuevo(nat: string, i: number): CareerState {
    return careerReducer({} as CareerState, {
        type: 'START',
        input: { position: PUESTOS[i % PUESTOS.length], nationalityCountryCode: nat },
        seed: 7000 + i * 613,
    });
}

/** Los países de los que el jugador SÍ puede recibir ofertas de ventana. */
function propios(player: Player): Set<string> {
    const anchors = new Set<string>();
    const club = getClub(player.club);
    if (club.countryCode !== 'multi') anchors.add(club.countryCode);
    const home = homeCountryOf(player.nationality);
    if (home) anchors.add(home);
    return anchors;
}

function ofertasDe(state: CareerState, semilla = 99) {
    const p = state.player;
    return generateOffers(p, computeEffectiveOvr(p), createRng(semilla));
}

// ── 1. El amateur se queda en su sistema ─────────────────────────────────────

test('ningún amateur recibe una oferta de VENTANA de otro país', () => {
    const fugas: string[] = [];
    let miradas = 0;

    for (const nat of NACIONALIDADES) {
        for (let i = 0; i < 12; i++) {
            const state = nuevo(nat, i);
            const p = state.player;
            // Todos arrancan amateur o en academia: es el caso que se vigila.
            assert.ok(
                p.employment === 'amateur' || p.employment === 'amateur-compensated' || p.squadTrack === 'development',
                `${nat}: el arranque dejó de ser amateur, este test quedó ciego`,
            );
            const anchors = propios(p);
            for (const offer of ofertasDe(state)) {
                miradas++;
                if (offer.via !== 'window') continue;
                const club = getClub(offer.club);
                if (!anchors.has(club.countryCode)) {
                    fugas.push(`${nat} en ${getClub(p.club).labelEs} → ${club.labelEs} [${club.countryCode}]`);
                }
            }
        }
    }

    assert.ok(miradas > 50, `muestra chica: sólo ${miradas} ofertas`);
    assert.deepEqual(fugas, [], `ofertas extranjeras por ventana a un amateur:\n  ${fugas.join('\n  ')}`);
});

test('al sudafricano no le llegan clubes argentinos: era el caso reportado', () => {
    let argentinas = 0;
    let sudafricanas = 0;
    for (let i = 0; i < 25; i++) {
        const state = nuevo('za', i);
        for (const offer of ofertasDe(state)) {
            const club = getClub(offer.club);
            if (offer.via !== 'window') continue;
            if (club.countryCode === 'ar') argentinas++;
            if (club.countryCode === 'za') sudafricanas++;
        }
    }
    assert.equal(argentinas, 0, `siguen llegando ${argentinas} ofertas argentinas`);
    assert.ok(sudafricanas > 0, 'el mercado sudafricano quedó vacío, que es el otro extremo del bug');
});

// ── 2. Y el mercado NO se apaga ──────────────────────────────────────────────

test('cerrar la frontera no deja a nadie sin mercado', () => {
    // Es el riesgo real del arreglo: si el filtro dejara sin candidatos a una
    // nacionalidad, su carrera se trabaría en el club de arranque para siempre.
    // Groenlandia y Fiyi son los casos límite —no tienen liga propia en el
    // catálogo— y por eso el ancla es el país del CLUB, no el pasaporte.
    const secos: string[] = [];
    for (const nat of NACIONALIDADES) {
        let conOfertas = 0;
        for (let i = 0; i < 12; i++) {
            if (ofertasDe(nuevo(nat, i)).length > 0) conOfertas++;
        }
        if (conOfertas === 0) secos.push(nat);
    }
    assert.deepEqual(secos, [], `nacionalidades sin una sola oferta posible: ${secos.join(', ')}`);
});

test('el que empezó afuera recibe ofertas de DONDE ESTÁ, no de su pasaporte', () => {
    // Un jugador colocado en la academia de un club extranjero vive en ese
    // sistema: anclar en la nacionalidad lo habría dejado esperando ofertas de un
    // país en el que no juega.
    let comprobados = 0;
    for (const nat of NACIONALIDADES) {
        for (let i = 0; i < 12; i++) {
            const state = nuevo(nat, i);
            const club = getClub(state.player.club);
            const home = homeCountryOf(state.player.nationality);
            if (club.countryCode === home || club.countryCode === 'multi') continue; // no emigró
            const paises = new Set(ofertasDe(state).filter((o) => o.via === 'window').map((o) => getClub(o.club).countryCode));
            if (paises.size === 0) continue;
            comprobados++;
            for (const pais of paises) {
                assert.ok(
                    pais === club.countryCode || pais === home,
                    `${nat} en ${club.labelEs} [${club.countryCode}] recibió una oferta de ${pais}`,
                );
            }
        }
    }
    assert.ok(comprobados > 0, 'la muestra no tuvo ningún jugador colocado afuera');
});

// ── 3. La puerta se abre al profesionalizarse ────────────────────────────────

test('el profesional SÍ puede firmar en otro país', () => {
    // La frontera se cierra por ser amateur, no para siempre. Sin esto el arreglo
    // habría convertido la carrera en un torneo local de por vida.
    let extranjeras = 0;
    for (const nat of ['za', 'ar', 'fr']) {
        for (let i = 0; i < 12; i++) {
            const state = nuevo(nat, i);
            // Se lo profesionaliza a mano: lo que se mide es la PUERTA, no cuánto
            // tarda en llegar a profesional (eso lo miden los tests de progresión).
            state.player.employment = 'full-time-professional';
            state.player.squadTrack = 'senior';
            const anchors = propios(state.player);
            for (const offer of ofertasDe(state)) {
                if (offer.via !== 'window') continue;
                if (!anchors.has(getClub(offer.club).countryCode)) extranjeras++;
            }
        }
    }
    assert.ok(extranjeras > 0, 'ningún profesional recibió una oferta del exterior: la puerta quedó cerrada');
});

test('graduar de la academia al plantel senior también abre la ventana', () => {
    // El otro eje: un compensado de academia tiene la frontera cerrada, y el mismo
    // jugador graduado a senior con vínculo semipro ya no.
    let abrio = 0;
    for (let i = 0; i < 25; i++) {
        const state = nuevo('za', i);
        state.player.squadTrack = 'senior';
        state.player.employment = 'semi-professional';
        const anchors = propios(state.player);
        if (ofertasDe(state).some((o) => o.via === 'window' && !anchors.has(getClub(o.club).countryCode))) abrio++;
    }
    assert.ok(abrio > 0, 'el semiprofesional senior sigue sin poder salir del país');
});

// ── 4. A cada país, primariamente las ofertas de su país ─────────────────────

/** Corre carreras enteras y cuenta de dónde vinieron las ofertas. */
function repartoPorPais(nat: string, carreras: number) {
    let propias = 0;
    let total = 0;
    for (let i = 0; i < carreras; i++) {
        let st = nuevo(nat, i);
        let guard = 0;
        while (st.phase !== 'retired' && guard++ < 40) {
            const ev = getPendingEvent(st);
            if (ev && st.offers.length > 0) {
                const home = homeCountryOf(st.player.nationality);
                const propio = new Set([affinityCountryOf(getClub(st.player.club)), home].filter(Boolean));
                for (const o of st.offers) {
                    total++;
                    if (propio.has(affinityCountryOf(getClub(o.club)) ?? 'multi')) propias++;
                }
            }
            st = st.phase === 'event' && ev
                ? careerReducer(st, { type: 'CHOOSE', optionId: ev.options[0].id })
                : careerReducer(st, { type: 'ADVANCE' });
        }
    }
    return { propias, total, share: total === 0 ? 0 : propias / total };
}

test('a cada país le corresponden PRIMARIAMENTE las ofertas de su país', () => {
    // "Primariamente" es la mayoría, no la exclusividad: el que se profesionaliza
    // puede salir al exterior, y el que tiene un convenio lo usa. Medido, el
    // reparto propio queda entre el 65% y el 85% en las nueve nacionalidades.
    const flojas: string[] = [];
    for (const nat of NACIONALIDADES) {
        const { share, total } = repartoPorPais(nat, 8);
        assert.ok(total > 20, `${nat}: muestra chica (${total} ofertas)`);
        if (share < 0.55) flojas.push(`${nat}: ${Math.round(share * 100)}%`);
    }
    assert.deepEqual(flojas, [], `nacionalidades cuyo mercado NO es primariamente propio: ${flojas.join(', ')}`);
});

test('el reparto NO depende del tamaño del catálogo', () => {
    // ES EL INVARIANTE QUE CIERRA EL BUG DE RAÍZ. Argentina tiene ~200 clubes en el
    // catálogo y Sudáfrica ~30: con el sorteo viejo —un peso por club— eso solo
    // bastaba para que el mercado de un sudafricano fuera argentino. Con el sorteo
    // en dos etapas los dos tienen que quedar en la misma banda, y el día que entre
    // otro catálogo nacional este test es el que avisa si volvió a pasar.
    const za = repartoPorPais('za', 8).share;
    const ar = repartoPorPais('ar', 8).share;
    assert.ok(
        Math.abs(za - ar) < 0.25,
        `el país con catálogo chico (za ${Math.round(za * 100)}%) y el grande (ar ${Math.round(ar * 100)}%) quedaron en bandas distintas`,
    );
});

test('la franquicia de tu país cuenta como tu país', () => {
    // Los Stormers son sudafricanos aunque la URC sea multipaís. Sin esto, para un
    // sudafricano firmar en los Stormers contaba como emigrar, que es lo contrario
    // de lo que es.
    for (const [id, pais] of [['stormers', 'za'], ['bulls', 'za'], ['crusaders', 'nz'], ['dogos-xv', 'ar'], ['penarol-rugby', 'uy'], ['selknam', 'cl']] as const) {
        const club = CLUBS.find((c) => c.id === id);
        if (!club) continue;
        assert.equal(club.countryCode, 'multi', `${id} dejó de ser multipaís: este test quedó viejo`);
        assert.equal(affinityCountryOf(club), pais, `${id} tendría que contar como ${pais}`);
    }
    // Y la que NO tiene nación resoluble se queda sin país, en vez de inventarle uno.
    const moana = CLUBS.find((c) => c.id === 'moana-pasifika');
    if (moana) assert.equal(affinityCountryOf(moana), null, 'Moana Pasifika no representa a un solo país');
});

// ── 5. El pozo de la escalera ────────────────────────────────────────────────

test('el escalón siguiente de tu escalera es alcanzable, esté a uno o a cinco', () => {
    // EL CASO REPORTADO: un japonés con 70 de media pasó seis temporadas en las
    // ligas regionales sin una sola oferta para salir. El regional está en el
    // escalón 1 y la D3 en el 4, y la ventana se mueve ±1: no era mala suerte, era
    // imposible.
    const sanix = CLUBS.find((c) => c.id === 'fukuoka-sanix-blues');
    assert.ok(sanix, 'no está Fukuoka Sanix Blues en el catálogo');

    const state = nuevo('jp', 0);
    const p = state.player;
    p.club = sanix.id;
    p.age = 27;
    p.employment = 'semi-professional';
    p.squadTrack = 'senior';
    p.role = 'starter';
    // Se lo lleva a 70 de media escalando los atributos, que es el caso del reporte.
    for (let i = 0; i < 80; i++) {
        const actual = ovrExact(p.attributes, p.position);
        if (Math.abs(actual - 70) < 0.05) break;
        const f = 70 / actual;
        for (const k of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
            p.attributes[k] = Math.min(99, p.attributes[k] * f);
        }
    }
    assert.equal(computeOvr(p.attributes, p.position), 70);

    const escalones = allowedRungs(p, computeEffectiveOvr(p));
    const regional = marketRung(sanix);
    const d3 = CLUBS.find((c) => c.competitionId === 'jpn-d3');
    assert.ok(d3, 'no hay clubes en la D3 japonesa');
    assert.ok(marketRung(d3) - regional > 1, 'el pozo japonés se tapó en el catálogo: este test quedó viejo');
    assert.ok(
        escalones.includes(marketRung(d3)),
        `con ${marketRung(d3) - regional} escalones de pozo, la D3 (escalón ${marketRung(d3)}) tiene que entrar en la ventana: ${escalones.join(',')}`,
    );

    // Y de verdad llegan ofertas de la D3, no sólo está permitido el escalón.
    let deD3 = 0;
    for (let s = 0; s < 40; s++) {
        for (const o of generateOffers(p, computeEffectiveOvr(p), createRng(1000 + s * 37))) {
            if (getClub(o.club).competitionId === 'jpn-d3') deD3++;
        }
    }
    assert.ok(deD3 > 0, 'sigue sin llegar una sola oferta de la D3 japonesa');
});

test('el puente NO sube a nadie que no dé el nivel', () => {
    // Una puerta abierta no es un ascenso regalado: el escalón entra en la ventana
    // y después decide `clubIsInterested`.
    //
    // El caso se mide a los 30 y no a los 24 A PROPÓSITO. A los 24, un 40 con techo
    // alto SÍ es un fichaje legítimo de la D3 —`marketValue` le suma hasta siete
    // puntos de proyección, y una liga de desarrollo apuesta justamente a eso— así
    // que exigir cero ofertas ahí sería pedirle al mercado que ignore la promesa.
    // A los 30 no hay proyección que valga: o das el nivel o no.
    const sanix = CLUBS.find((c) => c.id === 'fukuoka-sanix-blues')!;
    const conOvr = (ovr: number, edad: number) => {
        const state = nuevo('jp', 1);
        const p = state.player;
        p.club = sanix.id;
        p.age = edad;
        p.employment = 'semi-professional';
        p.squadTrack = 'senior';
        for (let i = 0; i < 80; i++) {
            const actual = ovrExact(p.attributes, p.position);
            if (Math.abs(actual - ovr) < 0.05) break;
            const f = ovr / actual;
            for (const k of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
                p.attributes[k] = Math.max(1, Math.min(99, p.attributes[k] * f));
            }
        }
        let deD3 = 0;
        for (let s = 0; s < 40; s++) {
            for (const o of generateOffers(p, computeEffectiveOvr(p), createRng(2000 + s * 41))) {
                if (getClub(o.club).competitionId === 'jpn-d3') deD3++;
            }
        }
        return deD3;
    };

    // NO se exige cero al de 40, y vale explicar por qué: la tolerancia del mercado
    // perdona ocho puntos en los escalones bajos (`clubIsInterested` con
    // `toleranceScaleFor` = 1 abajo de la banda regional), y esa manga ancha es
    // deliberada — un club de segunda apuesta al que todavía no llegó, porque es lo
    // único que puede fichar. Así que el club más flojo de la D3 (rating 50) sí
    // puede mirar a un 40, y eso no lo trajo el puente.
    //
    // Lo que el puente NO puede hacer es igualar niveles, y eso sí se mide.
    const bueno = conOvr(70, 30);
    const flojo = conOvr(42, 30);
    assert.ok(
        bueno > flojo * 1.5,
        `el de 70 recibió ${bueno} ofertas de la D3 y el de 42 recibió ${flojo}: el nivel dejó de decidir`,
    );
});

test('el puente sólo va hacia ARRIBA y sólo un peldaño', () => {
    // Si el puente agregara más de un peldaño, sería el salto de dos divisiones que
    // el mercado prohíbe (para eso está `qualifiesForExceptionalJump`, con reglas).
    for (const nat of NACIONALIDADES) {
        for (let i = 0; i < 6; i++) {
            const state = nuevo(nat, i);
            const p = state.player;
            p.employment = 'semi-professional';
            p.squadTrack = 'senior';
            const actual = marketRung(getClub(p.club));
            const escalones = allowedRungs(p, computeEffectiveOvr(p)).filter((r) => r > actual);
            const arriba = [...new Set(escalones)].sort((a, b) => a - b);
            // Puede haber dos: el +1 de la ventana y el puente. Nunca tres.
            assert.ok(
                arriba.length <= 2,
                `${nat}: la ventana abrió ${arriba.length} escalones hacia arriba (${arriba.join(',')})`,
            );
        }
    }
});

// ── 6. El convenio con Cobras ────────────────────────────────────────────────

test('Cobras se alcanza desde Sudáfrica por VÍA, nunca por ventana', () => {
    const cobras = CLUBS.find((c) => c.id === 'cobras-brasil-rugby');
    assert.ok(cobras, 'no está Cobras en el catálogo');

    for (const comp of ['currie-premier', 'currie-first', 'za-community']) {
        const club = CLUBS.find((c) => c.competitionId === comp);
        assert.ok(club, `no hay clubes en ${comp}`);
        const via = pathwayFor(club, cobras);
        assert.ok(via, `${comp} no tiene vía declarada a Cobras`);
        assert.equal(via.id, 'za-domestic-to-cobras');
        // Y la vía pide NIVEL: un convenio abre la puerta, no la regala.
        assert.ok((via.minOvr ?? 0) >= 59, 'la vía a Cobras tendría que exigir el nivel de la franquicia');
    }
});

test('la vía a Cobras no se abre desde otro país', () => {
    const cobras = CLUBS.find((c) => c.id === 'cobras-brasil-rugby')!;
    for (const comp of ['top14', 'prem', 'npc', 'jpn-d1', 'ar-urba-top14']) {
        const club = CLUBS.find((c) => c.competitionId === comp);
        if (!club) continue;
        const via = pathwayFor(club, cobras);
        assert.ok(
            via === null || via.id !== 'za-domestic-to-cobras',
            `${comp} no debería tener el convenio sudafricano`,
        );
    }
});
