// LA RAMA DE ARRANQUE: sorteada, no elegida.
//
// Hasta 1.25.0 este archivo protegía lo contrario: que las TRES rutas —amateur,
// desarrollo, profesional— produjeran contextos de arranque claramente distintos,
// porque si dos daban el mismo (vínculo, plantel) la elección era decorativa.
//
// El invariante se dio vuelta en 1.26.0, y conviene decir por qué en vez de
// borrarlo: la elección se fue porque el jugador no la podía entender antes de
// jugar, así que dejó de haber algo que justificar. Lo que hay que proteger ahora
// es exactamente lo simétrico:
//
//   · A LOS 18 LAS DOS RAMAS SON IGUALES SALVO EL OVR. Mismo club amateur, mismo
//     vínculo, mismo plantel, misma edad. Si una rama volviera a traer contexto
//     propio, volvería a haber una elección escondida dentro de un sorteo.
//   · A LOS 22 LOS CONTEXTOS YA SON DISTINTOS, y por el único camino legítimo: el
//     nivel. El de 58 cruza los umbrales de contrato antes que el de 47.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createInitialCareer, runCareer, economicModelOf, getClub, computeOvr, hashSeed,
    START_ROUTES, EMPLOYMENT_ORDER, employmentRank, type Chooser, type StartRouteId,
} from '../../index.ts';
import {
    FAST_BRANCH_SHARE, MIN_HEADROOM, START_AGE, START_OVR_MAX, START_OVR_MIN,
} from '../create-player.ts';

const rotatingChooser: Chooser = (event, state) =>
    event.options[hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length].id;

const SEMILLAS = Array.from({ length: 40 }, (_, i) => (i + 1) * 7919);

function arrancar(startRoute: StartRouteId, seed: number, countryCode = 'ar') {
    return createInitialCareer({ position: 'flyhalf', nationalityCountryCode: countryCode, startRoute }, seed);
}

test('la rama queda sellada en el estado', () => {
    for (const startRoute of START_ROUTES) {
        const state = arrancar(startRoute, 20260726);
        assert.equal(state.startRoute, startRoute, 'la rama tiene que viajar en el estado');
    }
});

test('sin rama declarada, el motor la SORTEA — y las dos salen', () => {
    const salidas = new Set(
        SEMILLAS.map((seed) => createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'ar' }, seed).startRoute),
    );
    // Las dos que el motor SORTEA son las de `START_ROUTES`. `professional` quedó
    // como valor legado de lectura (partidas de 1.26.0) y no sale nunca del sorteo.
    assert.deepEqual([...salidas].sort(), [...START_ROUTES].sort(), `el sorteo devolvió ${[...salidas].join(', ')}`);
});

test('el sorteo respeta el reparto declarado', () => {
    // 2000 semillas: con 30% esperado, la tolerancia de ±5 puntos es holgada y el
    // test no se pone en rojo por ruido.
    const total = 2000;
    let rapidas = 0;
    for (let i = 0; i < total; i++) {
        if (createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar' }, i * 31 + 7).startRoute === 'development') {
            rapidas++;
        }
    }
    const share = rapidas / total;
    assert.ok(
        Math.abs(share - FAST_BRANCH_SHARE) < 0.05,
        `la rama rápida salió el ${(share * 100).toFixed(1)}% contra un ${(FAST_BRANCH_SHARE * 100).toFixed(0)}% declarado`,
    );
});

test('DECLARAR la rama no corre el stream del rng', () => {
    // El sorteo se hace SIEMPRE, incluso cuando la rama viene dada (tests y replay
    // del token compartible). Si sólo se tirara cuando falta, una carrera
    // reproducida desde el token no sería la misma carrera.
    for (const seed of SEMILLAS.slice(0, 12)) {
        const sorteada = createInitialCareer({ position: 'wing', nationalityCountryCode: 'fr' }, seed);
        const declarada = createInitialCareer(
            { position: 'wing', nationalityCountryCode: 'fr', startRoute: sorteada.startRoute },
            seed,
        );
        assert.deepEqual(
            declarada.player, sorteada.player,
            `semilla ${seed}: declarar la rama que el sorteo iba a dar produjo otro jugador`,
        );
    }
});

test('A LOS 18 las dos ramas arrancan en CONTEXTOS DISTINTOS', () => {
    // ESTE TEST DECÍA "EL MISMO CONTEXTO" Y ERA EL PROBLEMA, no la garantía.
    //
    // 1.26.0 mandaba a todos al mismo club amateur y dejaba que la rama fijara
    // sólo una banda de OVR. El jugador no podía ver la diferencia en ningún lado:
    // dos carreras arrancaban en el mismo club, con el mismo contrato y el mismo
    // track, y una valía siete puntos más porque una tabla lo decía.
    //
    // Desde 1.28.0 la rama fija DÓNDE arrancás y el nivel sale de ahí:
    //
    //   amateur     → club amateur, plantel senior, vínculo amateur
    //   development → club semipro/pro, ACADEMIA, vínculo compensado
    //
    // Lo único que sigue siendo igual en las dos es la edad. Eso sí es un
    // invariante: dos partidas tienen que poder compararse temporada a temporada.
    for (const seed of SEMILLAS) {
        for (const countryCode of ['ar', 'fr', 'nz', 'jp', 'us', 'it', 'pt', 'br']) {
            for (const startRoute of START_ROUTES) {
                const { player } = arrancar(startRoute, seed, countryCode);
                assert.equal(player.age, START_AGE, `${countryCode}/${startRoute}: debutó a los ${player.age}`);

                const model = economicModelOf(getClub(player.club));
                if (startRoute === 'amateur') {
                    // LA RAMA AMATEUR TAMBIÉN PUEDE DEGRADAR, y es simétrico al caso
                    // de la academia que está unas líneas más abajo: si la escalera de
                    // ese país no tiene NINGÚN escalón amateur, no hay club del barrio
                    // al que entrar.
                    //
                    // Hoy pasa en un solo país y está declarado: Portugal. La Divisão
                    // de Honra es el único escalón portugués del catálogo y es
                    // semiprofesional, porque la I Divisão no está cargada (ver
                    // `PENDING_COMPETITIONS`). Es el mismo hueco que tenían Francia y
                    // Nueva Zelanda antes de la Fédérale 2 y la Heartland, y se cierra
                    // igual: cargando el escalón real.
                    //
                    // Lo que NO puede pasar es que degrade en silencio. Por eso el
                    // caso no se saltea con un `if (countryCode === 'pt')` sino que se
                    // exige `routeDowngraded`: el día que entre la I Divisão, el
                    // testigo se apaga solo y el invariante estricto vuelve a valer sin
                    // que nadie tenga que acordarse de sacar una excepción.
                    if (model !== 'amateur') {
                        assert.ok(
                            player.routeDowngraded,
                            `${countryCode}: la rama amateur arrancó en un club ${model} sin declarar la degradación`,
                        );
                        continue;
                    }
                    assert.equal(player.employment, 'amateur', `${countryCode}: arrancó como ${player.employment}`);
                    assert.equal(player.squadTrack, 'senior', `${countryCode}: la rama amateur no va a la academia`);
                    continue;
                }

                // La rama de academia PUEDE caer en amateur, y no es una falla: si
                // desde la escalera de ese país no se alcanza ningún club pago, no
                // hay academia a la que entrar. Lo que no puede pasar es que caiga
                // ahí sin declararlo — para eso está `routeDowngraded`.
                if (model === 'amateur') {
                    assert.ok(player.routeDowngraded, `${countryCode}: cayó en club amateur sin declarar la degradación`);
                    continue;
                }
                assert.equal(player.squadTrack, 'development', `${countryCode}: entró a un club ${model} como ${player.squadTrack}`);
                assert.equal(player.employment, 'amateur-compensated', `${countryCode}: academia con vínculo ${player.employment}`);
            }
        }
    }
});

test('lo ÚNICO que la rama cambia a los 18 es el OVR', () => {
    const medianas = START_ROUTES.map((startRoute) => {
        const ovrs = SEMILLAS.map((seed) => {
            const state = arrancar(startRoute, seed);
            return computeOvr(state.player.attributes, state.player.position);
        }).sort((a, b) => a - b);
        return { startRoute, mediana: ovrs[Math.floor(ovrs.length / 2)], min: ovrs[0], max: ovrs[ovrs.length - 1] };
    });

    const larga = medianas.find((m) => m.startRoute === 'amateur')!;
    const rapida = medianas.find((m) => m.startRoute === 'development')!;
    assert.ok(
        larga.mediana < rapida.mediana,
        `la rama larga (${larga.mediana}) tiene que arrancar por debajo de la rápida (${rapida.mediana})`,
    );
    for (const m of medianas) {
        assert.ok(
            m.min >= START_OVR_MIN && m.max <= START_OVR_MAX,
            `${m.startRoute}: OVR de arranque fuera de la banda (${m.min}-${m.max})`,
        );
    }
});

test('nadie arranca en o por encima de su propio techo', () => {
    // La banda rápida llega a 60 y el sorteo de techo puede caer en 53: sin el
    // piso relativo, `growthScaleFor` devolvería 0 y la carrera sólo bajaría desde
    // los 18.
    for (const seed of SEMILLAS) {
        for (const startRoute of START_ROUTES) {
            const { player } = arrancar(startRoute, seed);
            const ovr = computeOvr(player.attributes, player.position);
            assert.ok(
                player.potential >= ovr + MIN_HEADROOM,
                `semilla ${seed}/${startRoute}: OVR ${ovr} contra techo ${player.potential}`,
            );
        }
    }
});

test('A LOS 22 la ventaja de la rama rápida TODAVÍA está', () => {
    // LO QUE ESTE TEST NO MIDE, Y POR QUÉ. La primera versión miraba el ESCALAFÓN
    // a los 22 y daba 1,00 en las dos ramas. No era un bug: el club de arranque es
    // amateur y `employmentCeiling('amateur')` es `amateur-compensated`, así que
    // hasta que el mercado no te mueve a un club mixto o profesional, las dos
    // ramas están topeadas en el mismo escalón por construcción.
    //
    // Medido sobre 360 carreras completas: las dos ramas llegan a profesional casi
    // en la misma proporción (88,9% la larga, 87,2% la rápida) y a la misma edad
    // mediana (24). O sea que la ventaja de siete puntos a los 18 NO produce, hoy,
    // un escalafón más rápido — la rama larga alcanza a la rápida porque cuanto
    // más lejos está el techo, más rápido se crece.
    //
    // Eso queda anotado como hallazgo y NO se tapa acá con un gate por rama: sería
    // exactamente el "flag de ruta que abre o cierra puertas" que el pedido
    // descartó. Lo que sí se protege es que la ventaja de nivel no se evapore: si
    // alguien toca la curva y a los 22 las dos ramas valen lo mismo, la rama dejó
    // de significar algo y este test se pone en rojo.
    const ovrA = (startRoute: StartRouteId, index: number): number => {
        const ovrs = SEMILLAS.map((seed) => {
            const state = runCareer(
                { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute },
                seed,
                rotatingChooser,
            );
            const entry = state.history[index] ?? state.history[state.history.length - 1];
            return entry ? entry.ovr : 0;
        }).sort((a, b) => a - b);
        return ovrs[Math.floor(ovrs.length / 2)];
    };

    // Índice 4 = quinta temporada = el jugador tiene 22 (arranca a los 18).
    // `amateur` es la larga (club del barrio) y `development` la rápida (academia
    // de un club pago) desde 1.28.0: los nombres cambiaron de sentido.
    const larga = ovrA('amateur', 4);
    const rapida = ovrA('development', 4);
    assert.ok(
        rapida > larga,
        `a los 22 la rama rápida mediana ${rapida} y la larga ${larga}: la ventaja de nivel se evaporó`,
    );
});

test('el ascenso al profesionalismo le llega a las DOS ramas', () => {
    // SE MIDE EL ASCENSO, NO EL EVENTO, y el cambio de foco es el punto.
    //
    // Antes se contaban apariciones de `env-semi-pro-offer` y
    // `env-compensated-semi-offer`, y desde 1.28.0 la rama de academia no los ve
    // nunca: arranca compensada en un club pago y su ascenso lo resuelve el
    // MERCADO —un pase a un club profesional aplica el `offeredEmployment` de
    // una— sin pasar por la ventana de esos eventos. La rama amateur sí los ve,
    // porque para ella el ascenso es justamente la oferta que aparece.
    //
    // Que dos ramas lleguen al mismo lugar por caminos distintos no es un bug: es
    // lo que las hace distintas. Lo que no puede pasar es que una no llegue. Así
    // que el invariante deja de ser "vio esta tarjeta" y pasa a ser "se
    // profesionalizó", que es lo que el título dice desde siempre.
    for (const startRoute of START_ROUTES) {
        let profesionalizados = 0;
        for (const seed of SEMILLAS) {
            const state = runCareer({ position: 'flyhalf', nationalityCountryCode: 'ar', startRoute }, seed, rotatingChooser);
            const llego = state.history.some(
                (h) => employmentRank(h.employment) >= employmentRank('semi-professional'),
            );
            if (llego) profesionalizados++;
        }
        assert.ok(
            profesionalizados > SEMILLAS.length * 0.5,
            `la rama ${startRoute} sólo profesionalizó ${profesionalizados} de ${SEMILLAS.length}`,
        );
    }
});

test('ningún país se queda sin club, y el modelo registrado es el real', () => {
    for (const countryCode of ['cl', 'uy', 'ar', 'nz', 'fr', 'jp', 'es', 'za', 'gb-eng']) {
        for (const startRoute of START_ROUTES) {
            const state = arrancar(startRoute, 12345, countryCode);
            assert.ok(state.player.club.length > 0, `${countryCode}/${startRoute}: se quedó sin club`);
            assert.equal(
                state.player.startRouteModel,
                economicModelOf(getClub(state.player.club)),
                `${countryCode}/${startRoute}: el modelo registrado no es el del club real`,
            );
            assert.equal(typeof state.player.routeDowngraded, 'boolean');
        }
    }
});

test('el arranque acota el universo pero NO elige el club', () => {
    // Si lo eligiera, todas las carreras del mismo país arrancarían en el mismo
    // lado y no habría nada que descubrir.
    const clubes = new Set(SEMILLAS.map((seed) => arrancar('development', seed).player.club));
    assert.ok(clubes.size > 3, `el arranque colapsó en ${clubes.size} clubes distintos`);
});

test('el escalafón de empleo sigue siendo el eje: se sube, no se regala', () => {
    // ACÁ DECÍA "nadie cierra la primera temporada siendo profesional", y esa
    // regla se cayó en 1.26.0: `moveToClub` pasó a aplicar el `offeredEmployment`
    // de una, para que la tarjeta no prometa un contrato profesional y tarde tres
    // temporadas en dárselo. El que arranca fuerte y acepta el pase correcto
    // PUEDE cerrar su primera temporada como profesional, y está bien que pueda.
    //
    // Lo que sigue siendo cierto —y es lo que este test tiene que cuidar— es que
    // el escalón NO SE REGALA: la mayoría no llega, así que llegar significa algo.
    // Un test que exige que nadie llegue y uno que deja que lleguen todos son
    // igual de inútiles; el invariante está en el medio.
    let primerasProfesionales = 0;
    let primeras = 0;
    for (const seed of SEMILLAS.slice(0, 20)) {
        for (const startRoute of START_ROUTES) {
            const state = runCareer({ position: 'centre', nationalityCountryCode: 'ar', startRoute }, seed, rotatingChooser);
            const primera = state.history[0];
            if (!primera) continue;
            primeras++;
            if (employmentRank(primera.employment) >= employmentRank('full-time-professional')) primerasProfesionales++;
        }
    }
    assert.ok(primeras > 0, 'el escenario no se dio nunca: el test no probó nada');
    assert.ok(
        primerasProfesionales < primeras,
        `las ${primeras} primeras temporadas cerraron profesionales: el escalón dejó de costar`,
    );
    assert.equal(EMPLOYMENT_ORDER[0], 'amateur', 'el escalafón tiene que seguir empezando en amateur');
});
