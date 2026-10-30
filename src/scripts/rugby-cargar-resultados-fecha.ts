/**
 * Carga los resultados de una fecha de un torneo de rugby cargado a mano.
 *
 *   npx tsx src/scripts/rugby-cargar-resultados-fecha.ts noa            # dry-run
 *   npx tsx src/scripts/rugby-cargar-resultados-fecha.ts noa --apply
 *
 * Mismo criterio que `trp-2026-cargar-resultados.ts`: la fuente da el marcador,
 * no los tries. El bonus OFENSIVO va declarado (`ofensivo`, el "(1)" de los
 * partes) y entra con los puntos a mano; el resto entra en automático y el
 * motor pone el DEFENSIVO (perder por 7 o menos).
 *
 * `home`/`away` son los del fixture cargado, no los del orden en que lo publique
 * la fuente. `reprogramar` mueve partidos que la programación corrió de día
 * (hora de Argentina).
 *
 * Para la fecha siguiente: cambiar `fecha`, `resultados` y `reprogramar` del
 * torneo que corresponda.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

type Resultado = { home: string; away: string; homeScore: number; awayScore: number; ofensivo?: 'home' | 'away' | 'ambos' };
type Reprogramacion = { home: string; away: string; nuevaFecha: string };
/**
 * `todoAMano`: para torneos donde el automático no suma bonus (el Uruguayo guarda
 * las reglas en una forma que el motor no lee). Ahí también el defensivo va
 * escrito a mano, con la misma cuenta.
 */
type Carga = { torneo: string; fecha: string; razon: string; resultados: Resultado[]; reprogramar?: Reprogramacion[]; todoAMano?: boolean; sinTabla?: boolean };

const CARGAS: Record<string, Carga> = {
    // Fecha 6, sábado 26/09. Fuente: placa de @urtrugby ("Resultados fecha 6",
    // sujeto a boletín), que da el marcador sin tries. El ofensivo va declarado
    // solo donde el marcador lo garantiza (74 no se hace con menos de cuatro
    // tries); Universitario 45-38 Los Tarcos queda sin ofensivo hasta el boletín.
    //
    // Lince-Universitario de Tucumán ya estaba al domingo 27. Los dos postergados
    // pasan al sábado 03/10, a la hora del fixture porque la placa no la dice.
    noa: {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-09-26',
        razon: 'Resultado de la fecha 6 del Regional del NOA "A" (placa de la URT); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'universitario-de-salta', away: 'los-tarcos', homeScore: 45, awayScore: 38 },
            { home: 'huirapuca', away: 'cardenales-r-c', homeScore: 74, awayScore: 21, ofensivo: 'home' },
        ],
        reprogramar: [
            { home: 'natacion-y-gimnasia', away: 'jockey-club-salta', nuevaFecha: '2026-10-03T15:30:00-03:00' },
            { home: 'tucuman-rugby-club', away: 'tucuman-lawn-tennis', nuevaFecha: '2026-10-03T15:30:00-03:00' },
        ],
    },
    // Fecha 6, el del domingo 27/09. Fuente: placa de resultados y tabla de
    // @urtrugby. Sin ofensivo: la tabla da Universitario 17 (13 + 4) y Lince 5
    // (4 + el defensivo por perder por dos, que pone el motor).
    'noa-domingo': {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-09-27',
        razon: 'Resultado de la fecha 6 del Regional del NOA "A" (placa de la URT).',
        resultados: [
            { home: 'lince-rugby-club', away: 'universitario-de-tucuman', homeScore: 40, awayScore: 42 },
        ],
    },
    // Fecha 5, sábado 26/09. Fuente: placa de @fue.try ("Resultados F5, Austral
    // 2026 P. Superior"), que da el marcador sin tries; el bonus ofensivo de
    // Comodoro y Calafate lo confirmó el usuario.
    //
    // Los otros tres "mañana se completan en el Valle": pasan al domingo 27. La
    // hora es la del fixture (16:00) porque la placa no la dice.
    //
    // (Fecha 4: Trelew 53-37 Comodoro fue SIN bonus aunque la crónica contaba 7
    // tries contra 5 — la Unión da el ofensivo por diferencia de tries. El bonus
    // es el que declara la fuente, nunca el que sale de contar tries.)
    austral: {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-09-26',
        razon: 'Resultados de la fecha 5 del Austral (placa de Fue Try); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'comodoro-r-c', away: 'chenque-r-c', homeScore: 29, awayScore: 10, ofensivo: 'home' },
            { home: 'san-jorge-r-c-ua', away: 'calafate-r-c', homeScore: 21, awayScore: 71, ofensivo: 'away' },
        ],
        reprogramar: [
            { home: 'patoruzu-r-c', away: 'bigornia-r-c', nuevaFecha: '2026-09-27T16:00:00-03:00' },
            { home: 'trelew-r-c', away: 'draig-goch-r-c', nuevaFecha: '2026-09-27T16:00:00-03:00' },
            { home: 'puerto-madryn-r-c', away: 'deportivo-portugues', nuevaFecha: '2026-09-27T16:00:00-03:00' },
        ],
    },
    // Fecha 5, los tres del domingo 27/09 en el Valle (reprogramados arriba).
    // Misma placa de @fue.try; el bonus ofensivo de Patoruzú, Trelew y Portugués
    // lo confirmó el usuario.
    'austral-f5-domingo': {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-09-27',
        razon: 'Resultados de la fecha 5 del Austral (placa de Fue Try); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'patoruzu-r-c', away: 'bigornia-r-c', homeScore: 48, awayScore: 25, ofensivo: 'home' },
            { home: 'trelew-r-c', away: 'draig-goch-r-c', homeScore: 89, awayScore: 21, ofensivo: 'home' },
            { home: 'puerto-madryn-r-c', away: 'deportivo-portugues', homeScore: 17, awayScore: 39, ofensivo: 'away' },
        ],
    },
    // Fecha 7, sábado 10/10. Fuente: placa de @fue.try ("Resultados F7, Austral
    // 2026 P. Superior"), que da el marcador sin tries y sin bonus: ninguno va
    // declarado hasta que el parte de la Unión marque los "(1)". Comodoro-Patoruzú
    // figura sin resultado en la placa y queda programado.
    'austral-f7': {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-10-10',
        razon: 'Resultados de la fecha 7 del Austral (placa de Fue Try); el bonus ofensivo queda sin declarar porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'san-jorge-r-c-ua', away: 'bigornia-r-c', homeScore: 20, awayScore: 32 },
            { home: 'puerto-madryn-r-c', away: 'chenque-r-c', homeScore: 22, awayScore: 37 },
            { home: 'trelew-r-c', away: 'calafate-r-c', homeScore: 36, awayScore: 31 },
            { home: 'deportivo-portugues', away: 'draig-goch-r-c', homeScore: 21, awayScore: 0, ofensivo: 'home' },
        ],
    },
    // Ajuste al Regional del Litoral "A" contra la tabla de Tercer Tiempo tras la
    // fecha 16: Old Resian 28. La nota de la fecha 10 da GER 34-27 Old Resian
    // (5-2): el perdedor suma ofensivo y defensivo, así que los dos llevan ofensivo.
    'litoral-a-f10-ajuste': {
        torneo: 'b1ba2ecc-06e3-400f-9a45-1385321aad46',
        fecha: '2026-07-11',
        razon: 'Ajuste a la tabla de Tercer Tiempo (fecha 16): GER 34-27 Old Resian (5-2); el bonus ofensivo va declarado porque la fuente da puntos, no tries.',
        resultados: [
            { home: 'gimnasia-y-esgrima-de-rosario', away: 'old-resian-club', homeScore: 34, awayScore: 27, ofensivo: 'ambos' },
        ],
    },
    // Torneo Regional del NEA Ascenso, sábado 10/10 y domingo 11/10. Fuente:
    // resultados pasados por el usuario; los ofensivos los declaró él (Sixty,
    // Tacurú, Lomas). Abipones 33-29 Capri sin ofensivo: Capri suma el defensivo
    // por perder por 4, que pone el motor.
    'nea-ascenso-sabado': {
        torneo: 'c1e37680-3f1e-482a-8dc6-c14f4ba417c7',
        fecha: '2026-10-10',
        razon: 'Resultado del Regional del NEA Ascenso; el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'pay-ubre', away: 'sixty-r-c', homeScore: 7, awayScore: 65, ofensivo: 'away' },
        ],
    },
    'nea-ascenso-domingo': {
        torneo: 'c1e37680-3f1e-482a-8dc6-c14f4ba417c7',
        fecha: '2026-10-11',
        razon: 'Resultados del Regional del NEA Ascenso; el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'tacuru-social-club', away: 'caza-y-pesca', homeScore: 78, awayScore: 21, ofensivo: 'home' },
            { home: 'qompi', away: 'lomas-r-c-posadas', homeScore: 7, awayScore: 38, ofensivo: 'away' },
            { home: 'abipones', away: 'capri', homeScore: 33, awayScore: 29 },
        ],
    },
    // Torneo Regional del NEA, fecha 15, domingo 11/10. Fuente: grupo "URNE
    // Prensa 2026": "Final. Regatas 33 - ARC 59, 9 tries a 5" (el mensaje de
    // las 16:48, 7-35, era el primer tiempo). Con 9 y 5 tries los dos llegan al
    // ofensivo; perder por 26 no da defensivo.
    'nea-f15-domingo': {
        torneo: 'b0562cf3-4ea1-463e-86cb-86988dc22f10',
        fecha: '2026-10-11',
        razon: 'Resultado de la fecha 15 del Regional del NEA (grupo de prensa de la URNE); los tries (9 a 5) dan el ofensivo a los dos.',
        resultados: [
            { home: 'regatas-de-resistencia', away: 'aranduroga-r-c', homeScore: 33, awayScore: 59, ofensivo: 'ambos' },
        ],
    },
    // Tierra del Fuego Clausura (Zona Campeonato, plantel superior), sábado 10/10.
    // Fuente: historias de @unionrugbytdf, que dan el marcador sin tries. El
    // ofensivo de Universitario (57-0 a Colegio del Sur) y el de Ushuaia (0-54 en
    // Tolhuin) los confirmó el usuario.
    'tdf-campeonato': {
        torneo: 'e77a678a-776c-412e-a012-2fd17bde630e',
        fecha: '2026-10-10',
        razon: 'Resultados de la Zona Campeonato de Tierra del Fuego (historias de la URTDF); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'universitario-de-rio-grande', away: 'club-colegio-del-sur', homeScore: 57, awayScore: 0, ofensivo: 'home' },
            { home: 'tolhuin-rugby-club', away: 'ushuaia-rugby-club', homeScore: 0, awayScore: 54, ofensivo: 'away' },
        ],
    },
    // Tierra del Fuego Clausura M18, sábado 10/10: Ushuaia 41-19 Universitario,
    // con el ofensivo de Ushuaia (lo confirmó el usuario).
    'tdf-m18': {
        torneo: '4ded08da-df73-4865-92c3-dbb0f8c6ae83',
        fecha: '2026-10-10',
        razon: 'Resultado de Juveniles M18 de Tierra del Fuego (historia de la URTDF); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'ushuaia-rugby-club', away: 'universitario-de-rio-grande', homeScore: 41, awayScore: 19, ofensivo: 'home' },
        ],
    },
    // Ajustes a pedido del usuario para que las tablas del Litoral coincidan con
    // las de Tercer Tiempo tras la fecha 16 (la nota manda). Donde la nota no
    // da el partido, el punto se carga como bonus ofensivo en un partido que no
    // lo tenía y cuyo marcador lo hace plausible; el motivo queda en
    // `points_override_reason`. Jockey de Venado Tuerto 16: Rowing 18-10 VT.
    'litoral-a-vt-ajuste': {
        torneo: 'b1ba2ecc-06e3-400f-9a45-1385321aad46',
        fecha: '2026-08-22',
        razon: 'Ajuste a la tabla de Tercer Tiempo (fecha 16): un punto de bonus de Jockey de Venado Tuerto que la nota publica y ningún partido explica.',
        resultados: [
            { home: 'parana-rowing', away: 'jockey-club-de-venado-tuerto', homeScore: 18, awayScore: 10, ofensivo: 'away' },
        ],
    },
    // Litoral "B" Copa Oro: CRAR 14, Alma 12, Caranchos 5.
    'litoral-b-ajuste-0829': {
        torneo: 'b28a55ac-b372-4b89-ba81-ee43232abffb',
        fecha: '2026-08-29',
        razon: 'Ajuste a la tabla de Tercer Tiempo (fecha 3 de Copa Oro): CRAR suma el ofensivo del 30-14.',
        resultados: [
            { home: 'crar', away: 'logaritmo-rugby-club', homeScore: 30, awayScore: 14, ofensivo: 'home' },
        ],
    },
    // Litoral "B": Alma 12, Caranchos 5 (Copa Oro); Pampas 11, Regatas 6,
    // Gimnasia 8, Cha Roga 5 (Copa Plata).
    'litoral-b-ajuste-0919': {
        torneo: 'b28a55ac-b372-4b89-ba81-ee43232abffb',
        fecha: '2026-09-19',
        razon: 'Ajuste a las tablas de Tercer Tiempo (fecha 3 de Copa Oro y Copa Plata): el punto de bonus sale de la tabla, no de un conteo de tries.',
        resultados: [
            { home: 'alma-juniors', away: 'crar', homeScore: 33, awayScore: 39, ofensivo: 'home' },
            { home: 'c-a-provincial', away: 'los-caranchos', homeScore: 15, awayScore: 29, ofensivo: 'away' },
            { home: 'regatas-belgrano-san-nicolas', away: 'pampas-de-rufino', homeScore: 54, awayScore: 33, ofensivo: 'ambos' },
            { home: 'gimnasia-y-esgrima-de-pergamino', away: 'cha-roga-r-c', homeScore: 25, awayScore: 27, ofensivo: 'ambos' },
        ],
    },
    // Súper 9 "B" (Unión Cordobesa), sábado 10/10. Fuente: placas "Resultado
    // final" de @unioncordobesaderugby. El ofensivo de Córdoba, San Francisco y
    // Baguales lo confirmó el usuario; La Carlota (15-20 en casa) suma el
    // defensivo por perder por 5, que pone el motor. Alta Gracia, sin ofensivo.
    'super9-b-f15': {
        torneo: 'b6ed4086-2e75-4e68-962b-2d2363c9694c',
        fecha: '2026-10-10',
        razon: 'Resultados del Súper 9 "B" (placas de la Unión Cordobesa); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'rio-tercero-r-c', away: 'cordoba-rugby-club', homeScore: 14, awayScore: 35, ofensivo: 'away' },
            { home: 'santa-rosa-r-c-c', away: 'baguales-r-c', homeScore: 8, awayScore: 29, ofensivo: 'away' },
            { home: 'san-francisco-r-c', away: 'aero-club-rio-iv', homeScore: 41, awayScore: 12, ofensivo: 'home' },
            { home: 'c-s-la-carlota', away: 'alta-gracia-r-c', homeScore: 15, awayScore: 20 },
        ],
    },
    // Regional Pampeano A (Primera), fecha 14, sábado 10/10. Fuente: @rugbymdq,
    // que da el marcador sin tries; con la fe de erratas de la misma cuenta:
    // Argentino-Sporting terminó 15-75. El ofensivo va declarado solo donde el
    // marcador lo garantiza (50, 75 y 40 no se hacen con menos de cuatro tries).
    // Comercial 10-3 San Ignacio queda sin bonus ofensivo.
    'pampeano-f14': {
        torneo: '594fcb55-b052-4a8f-bf24-5a288e35e4f5',
        fecha: '2026-10-10',
        razon: 'Resultados de Primera del TRP A publicados por @rugbymdq (fecha 14); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'mar-del-plata-club', away: 'los-cardos-r-c', homeScore: 50, awayScore: 5, ofensivo: 'home' },
            { home: 'argentino-de-bahia-blanca', away: 'ipr-sporting', homeScore: 15, awayScore: 75, ofensivo: 'away' },
            { home: 'comercial-r-c', away: 'san-ignacio-r-c', homeScore: 10, awayScore: 3 },
            { home: 'sociedad-sportiva-de-bahia-blanca', away: 'universitario-de-mar-del-plata', homeScore: 40, awayScore: 21, ofensivo: 'home' },
        ],
    },
    // Torneo Regional del NEA, fecha 15, sábado 10/10. Fuente: placa "Resultados
    // Fecha 15" de @_urne (más el grupo de prensa de la URNE). San Patricio 39-36
    // Taragüí vino con "(4-1)": los 4 del ganador y el defensivo del perdedor, que
    // pone el motor. Ofensivo: solo CURNE en San José (lo dijo el usuario; San
    // José sin bonus) y Curda en el 60-22, que no se hace con menos de cuatro tries.
    'nea-f10': {
        torneo: 'b0562cf3-4ea1-463e-86cb-86988dc22f10',
        fecha: '2026-10-10',
        razon: 'Resultados de la fecha 15 del Regional del NEA (placa de la URNE); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'san-jose', away: 'curne', homeScore: 33, awayScore: 24, ofensivo: 'away' },
            { home: 'aguara', away: 'curda', homeScore: 22, awayScore: 60, ofensivo: 'away' },
            { home: 'san-patricio', away: 'taraguy-r-c', homeScore: 39, awayScore: 36 },
        ],
    },
    // Fecha 7 del Austral, domingo 11/10: el partido que no se jugó el sábado.
    // Fuente: placa y tabla de @fue.try (Comodoro 28, Patoruzú 26): Comodoro suma
    // los 4 sin bonus y Patoruzú pierde por 8, sin defensivo ni ofensivo.
    'austral-f7-domingo': {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-10-11',
        razon: 'Resultado de la fecha 7 del Austral (placa de Fue Try, domingo 11/10); la tabla publicada no da bonus a ninguno.',
        resultados: [
            { home: 'comodoro-r-c', away: 'patoruzu-r-c', homeScore: 29, awayScore: 21 },
        ],
    },
    // Ajuste de la fecha 6 (03/10) contra la "Tabla Austral, Primera - fecha 7" de
    // @fue.try: Patoruzú 27 (le faltaba el ofensivo del 57-19), Portugués 21 (el
    // ofensivo del 21-0 de la fecha 7, arriba) y Bigornia 8 (sin el ofensivo del
    // 33-19 a Madryn). Los otros siete clubes coincidían con la tabla.
    'austral-f6-ajuste': {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-10-03',
        razon: 'Ajuste a la tabla de la fecha 7 publicada por Fue Try: el bonus ofensivo sale de la tabla, la fuente da puntos y no tries.',
        resultados: [
            // Sin ofensivo (corregido al salir la tabla del domingo 11/10: Patoruzú 26).
            { home: 'patoruzu-r-c', away: 'san-jorge-r-c-ua', homeScore: 57, awayScore: 19 },
            { home: 'bigornia-r-c', away: 'puerto-madryn-r-c', homeScore: 33, awayScore: 19 },
        ],
    },
    // Regional del Litoral "A", fecha 16, sábado 10/10. Marcadores: post de
    // @despuesdeltry. Bonus: la nota de Tercer Tiempo da los PUNTOS de cada equipo
    // en cada partido, entre paréntesis: (5-0) = 4 + ofensivo; (5-2) = 4 + ofensivo
    // del ganador, y el perdedor suma defensivo + ofensivo. Por eso van declarados
    // los ofensivos de los dos lados donde la nota da 2 (Santa Fe, Jockey de
    // Rosario, Jockey de Venado Tuerto). "El CAE a Jockey" en las Cuatro
    // Hectáreas = Estudiantes de Paraná visitando a Jockey de Rosario.
    'litoral-a': {
        torneo: 'b1ba2ecc-06e3-400f-9a45-1385321aad46',
        fecha: '2026-10-10',
        razon: 'Regional del Litoral "A", fecha 16 (Tercer Tiempo): los puntos de cada equipo salen de la nota; el bonus ofensivo va declarado porque la fuente da puntos, no tries.',
        resultados: [
            { home: 'crai', away: 'santa-fe-r-c', homeScore: 31, awayScore: 30, ofensivo: 'ambos' },
            { home: 'universitario-de-rosario', away: 'duendes-r-c', homeScore: 30, awayScore: 38, ofensivo: 'away' },
            { home: 'jockey-club-de-rosario', away: 'estudiantes-de-parana', homeScore: 29, awayScore: 34, ofensivo: 'ambos' },
            { home: 'jockey-club-de-venado-tuerto', away: 'gimnasia-y-esgrima-de-rosario', homeScore: 27, awayScore: 31, ofensivo: 'ambos' },
            { home: 'parana-rowing', away: 'old-resian-club', homeScore: 44, awayScore: 17, ofensivo: 'home' },
        ],
    },
    // Regional del Litoral "B" (Segunda), fecha 3 de los dos hexagonales, 10/10.
    // Fuente: Tercer Tiempo, que da el marcador y los puntos de cada equipo entre
    // paréntesis: (5-0) = 4 + ofensivo, (0-5) = ofensivo del visitante.
    // Pampas-Tilcara se jugó el domingo 04/10 (la nota dice "disputado 4/10"); la
    // hora es la del sábado porque la nota no la dice.
    'litoral-b': {
        torneo: 'b28a55ac-b372-4b89-ba81-ee43232abffb',
        fecha: '2026-10-17',
        razon: 'Regional del Litoral "B", fecha 4 de Copa Oro y Copa Plata (Tercer Tiempo): los puntos salen de la nota; el ofensivo va declarado porque la fuente da puntos, no tries.',
        resultados: [
            { home: 'c-a-provincial', away: 'crar', homeScore: 30, awayScore: 18, ofensivo: 'home' },
            { home: 'los-caranchos', away: 'universitario-de-santa-fe', homeScore: 20, awayScore: 27, ofensivo: 'away' },
            { home: 'alma-juniors', away: 'logaritmo-rugby-club', homeScore: 28, awayScore: 25, ofensivo: 'home' },
            { home: 'gimnasia-y-esgrima-de-pergamino', away: 'la-salle-jobson', homeScore: 18, awayScore: 12 },
            { home: 'cha-roga-r-c', away: 'pampas-de-rufino', homeScore: 24, awayScore: 18 },
            { home: 'club-tilcara', away: 'regatas-belgrano-san-nicolas', homeScore: 57, awayScore: 7, ofensivo: 'home' },
        ],
    },
    // Argentino Juvenil M17, 2da fecha (19/9). Fuente: parte de la UAR, que da el
    // marcador y NO los tries, y todavia no publico la tabla de posiciones de la
    // fecha. Por eso el bonus ofensivo va declarado solo donde el marcador lo
    // garantiza (59, 68 y 99 puntos no se hacen con menos de cuatro tries); en
    // Entrerriana 24-15 Austral queda en cero hasta que salga la tabla oficial.
    //
    // Dos de estos NO son altas: son correcciones de una carga previa hecha con
    // otra fuente. Rosario-Cuyo estaba 33-23 y la UAR dice 31-23, y
    // Mar del Plata-Oeste estaba cargado al reves (0-99 en vez de 99-0).
    'm17-campeonato': {
        torneo: '0e40f4dc-fa8e-4528-935b-eb5e2d1dd08b',
        fecha: '2026-09-19',
        razon: 'Parte de la UAR de la 2da fecha del Argentino Juvenil M17: el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'tucuman-m17', away: 'uruguay-m17', homeScore: 59, awayScore: 22, ofensivo: 'home' },
            { home: 'rosario-m17', away: 'cuyo-m17', homeScore: 31, awayScore: 23, ofensivo: 'home' },
        ],
    },
    'm17-ascenso': {
        torneo: '302a89ef-879f-446a-8fe8-8ffe7a2df818',
        fecha: '2026-09-19',
        razon: 'Parte de la UAR de la 2da fecha del Argentino Juvenil M17: el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'mar-del-plata-m17', away: 'oeste-m17', homeScore: 99, awayScore: 0, ofensivo: 'home' },
            { home: 'sanjuanina-m17', away: 'chile-m17', homeScore: 24, awayScore: 68, ofensivo: 'away' },
            { home: 'entrerriana-m17', away: 'austral-m17', homeScore: 24, awayScore: 15 },
        ],
        // El unico partido del domingo: la programacion de la UAR lo daba 20/9 16:00.
        reprogramar: [
            { home: 'entrerriana-m17', away: 'austral-m17', nuevaFecha: '2026-09-20T16:00:00-03:00' },
        ],
    },
    // Copa Plata del Oeste (Cuyano 2026), fechas 9 y 11. Fuente: la pagina de
    // posiciones y resultados de rugbydecuyo.com.ar, que es la unica que publica
    // los marcadores (el fixture-plata.jpg de la Union es solo la programacion, y
    // ademas quedo desactualizado en las fechas 13 y 14).
    //
    // El bonus NO sale del marcador: esta DEDUCIDO de la tabla oficial. Con las
    // nueve fechas ya cargadas y los ocho resultados que faltaban, los puntos y la
    // columna BS de los ocho clubes cierran exactos con una sola reparticion, y es
    // esta. Donde quedaba margen se eligio el partido mas plausible: Huazihul suma
    // el ofensivo en el 24-5 y no en el 24-29, y Universitario en el 38-7 y no en
    // el 42-40. Ojo: la tabla oficial NO cierra sus tantos (suman 2590 a favor
    // contra 2640 en contra), asi que los TF/TC salen de los partidos, no de ella.
    'plata-f9': {
        torneo: '8e21ce2b-459c-40f5-8012-d0968d6a4d95',
        fecha: '2026-08-29',
        razon: 'Copa Plata del Oeste, 9na fecha. El bonus sale de la tabla oficial de rugbydecuyo.com.ar: la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'tacuru-rugby-hockey-club', away: 'peumayen-rugby-club', homeScore: 26, awayScore: 15 },
            { home: 'rivadavia-rugby-club', away: 'banco-rugby-club', homeScore: 5, awayScore: 27, ofensivo: 'away' },
            { home: 'universitario-de-mendoza', away: 'jockey-club-san-juan', homeScore: 42, awayScore: 40, ofensivo: 'away' },
            { home: 'huazihul', away: 'alfiles-s-c', homeScore: 29, awayScore: 24 },
        ],
    },
    // La 11ma fecha esta partida en dos dias en la base, asi que va en dos entradas.
    'plata-f11': {
        torneo: '8e21ce2b-459c-40f5-8012-d0968d6a4d95',
        fecha: '2026-09-19',
        razon: 'Copa Plata del Oeste, 11ma fecha. El bonus sale de la tabla oficial de rugbydecuyo.com.ar: la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'jockey-club-san-juan', away: 'peumayen-rugby-club', homeScore: 24, awayScore: 52, ofensivo: 'away' },
            { home: 'alfiles-s-c', away: 'tacuru-rugby-hockey-club', homeScore: 34, awayScore: 40 },
            { home: 'rivadavia-rugby-club', away: 'universitario-de-mendoza', homeScore: 7, awayScore: 38, ofensivo: 'away' },
        ],
    },
    'plata-f11-domingo': {
        torneo: '8e21ce2b-459c-40f5-8012-d0968d6a4d95',
        fecha: '2026-09-20',
        razon: 'Copa Plata del Oeste, 11ma fecha. El bonus sale de la tabla oficial de rugbydecuyo.com.ar: la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'huazihul', away: 'banco-rugby-club', homeScore: 24, awayScore: 5, ofensivo: 'home' },
        ],
    },
    // Semifinales del Apertura "Eduardo Barletta" de la Union Andina (26/09).
    // Fuentes: placa de @losterosrc (57-10) y posteo de Club Deportivo / El
    // Esquiu (Hurones gano 54-50 de visitante). Son llaves: sin bonus.
    'andina-semis': {
        torneo: '0b54dbb4-a823-4946-9783-2601f2d9c700',
        fecha: '2026-09-26',
        razon: 'Semifinales del Apertura de la Union Andina (Los Teros y Club Deportivo/El Esquiu).',
        resultados: [
            { home: 'los-teros-r-c', away: 'crar-la-rioja', homeScore: 57, awayScore: 10 },
            { home: 'catamarca-r-c', away: 'los-hurones', homeScore: 50, awayScore: 54 },
        ],
    },
    // 12ma fecha (26/09). Fuente: placa de @rugbydecuyo; el bonus ofensivo de
    // Alfiles y Huazihul lo confirmo el usuario. Banco-Jockey paso al domingo
    // (ya reprogramado; va en `plata-f12-domingo`).
    //
    // El ofensivo de Universitario en el 36-27 sale de las posiciones del 27/09:
    // la tabla le da 42 pts y BS 4, y era el unico partido suyo sin cotejar
    // contra una tabla oficial (Peumayen cierra igual, 34 con BS 6).
    'plata-f12': {
        torneo: '8e21ce2b-459c-40f5-8012-d0968d6a4d95',
        fecha: '2026-09-26',
        razon: 'Copa Plata del Oeste, 12ma fecha (placa de Rugby de Cuyo): el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'universitario-de-mendoza', away: 'peumayen-rugby-club', homeScore: 36, awayScore: 27, ofensivo: 'home' },
            { home: 'alfiles-s-c', away: 'rivadavia-rugby-club', homeScore: 69, awayScore: 20, ofensivo: 'home' },
            { home: 'tacuru-rugby-hockey-club', away: 'huazihul', homeScore: 38, awayScore: 65, ofensivo: 'away' },
        ],
    },
    // 12ma fecha, el del domingo 27/09. Fuente: posiciones de @rugbydecuyo
    // ("Banco ante Jockey 35 a 18"). Sin bonus: Banco llega a 25 y Jockey se
    // queda en 27, los dos con BS 5, igual que la tabla.
    'plata-f12-domingo': {
        torneo: '8e21ce2b-459c-40f5-8012-d0968d6a4d95',
        fecha: '2026-09-27',
        razon: 'Copa Plata del Oeste, 12ma fecha (posiciones de Rugby de Cuyo).',
        resultados: [
            { home: 'banco-rugby-club', away: 'jockey-club-san-juan', homeScore: 35, awayScore: 18 },
        ],
    },
    // 13ra fecha (03/10). Fuente: placa y posiciones de @rugbydecuyo. Sin
    // ofensivo: la tabla da Universitario 46, Peumayen 38 y Jockey 31 (+4 cada
    // uno, BS sin cambios). Alfiles llega a 24 con BS 8: el defensivo del 13-15,
    // que pone el motor. Huazihul-Rivadavia no se jugo (los dos quedan con 12 PJ).
    'plata-f13': {
        torneo: '8e21ce2b-459c-40f5-8012-d0968d6a4d95',
        fecha: '2026-10-03',
        razon: 'Copa Plata del Oeste, 13ra fecha (placa y posiciones de Rugby de Cuyo).',
        resultados: [
            { home: 'peumayen-rugby-club', away: 'banco-rugby-club', homeScore: 30, awayScore: 12 },
            { home: 'jockey-club-san-juan', away: 'tacuru-rugby-hockey-club', homeScore: 37, awayScore: 27 },
            { home: 'universitario-de-mendoza', away: 'alfiles-s-c', homeScore: 15, awayScore: 13 },
        ],
    },
    // Playoff de la Primera B del NOA (27/09). Fuente: Pasion & Deporte
    // ("Old Lions vencio a Santiago Lawn Tennis, 37/31"). Es llave: sin bonus.
    'noa-b-playoff': {
        torneo: '3a335922-dc88-42a8-84d3-c38b57b46bca',
        fecha: '2026-09-27',
        razon: 'Playoff de la Primera B del Regional del NOA (Pasion & Deporte).',
        resultados: [
            { home: 'old-lions-r-c', away: 'santiago-lawn-tennis-club', homeScore: 37, awayScore: 31 },
        ],
    },
    // El otro playoff, sabado 26/09. Fuente: @norterugby ("Gimnasia y Tiro vs
    // Tiro Federal por 55-27"); el ofensivo de Gimnasia lo confirmo el usuario.
    'noa-b-playoff-sabado': {
        torneo: '3a335922-dc88-42a8-84d3-c38b57b46bca',
        fecha: '2026-09-26',
        razon: 'Playoff de la Primera B del Regional del NOA (Norte Rugby): el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'gimnasia-y-tiro', away: 'tiro-federal-salta', homeScore: 55, awayScore: 27, ofensivo: 'home' },
        ],
    },
    // Primera B del Regional del NOA, 7ma y ultima fecha de la clasificatoria.
    // Los otros dos partidos (Old Lions 87-7 Aguara y Tiro Federal 32-29 SLTC) ya
    // estaban cargados. El bonus sale de las POSICIONES del parte, que cierran
    // exacto: Jockey 25 + 1 defensivo (perdio por uno) = 26, Gimnasia 20 + 4 = 24,
    // Tigres 22 + 4 + 1 ofensivo = 27 y Santiago Rugby se queda en 2.
    //
    // Ojo con la numeracion del parte: rotula "2) Tigres, 1) Jockey" pero su propio
    // texto dice que Jockey "no pudo asegurar el primer lugar", y 27 le gana a 26.
    'noa-b': {
        torneo: '3a335922-dc88-42a8-84d3-c38b57b46bca',
        fecha: '2026-09-20',
        razon: 'Parte de la 7ma fecha de la Primera B del Regional del NOA: el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'jockey-club-de-tucuman', away: 'gimnasia-y-tiro', homeScore: 36, awayScore: 37 },
            { home: 'santiago-rugby-club', away: 'tigres-r-c', homeScore: 36, awayScore: 56, ofensivo: 'away' },
        ],
    },
    // Super 9 "B" de la Cordobesa, 14ta fecha (Alta Gracia quedo libre). Fuente:
    // el carrusel de Instagram de la Union, que da el marcador y la tabla.
    //
    // El bonus sale de la DIFERENCIA con la tabla anterior, club por club, y cierra
    // exacto: Baguales +5 (gano por 5, o sea ofensivo y nada de defensivo),
    // Los Cuervos +1 (perdio por 5), Cordoba +4 pelado, La Carlota +1 (perdio por
    // 6), Santa Rosa +5, Aero +0, y en Rio III-San Francisco suman +1 LOS DOS:
    // el ganador el ofensivo y el perdedor tambien, que perdio por 11 y no le
    // entra el defensivo. Ver [[super9-b-bonus-que-se-compensan]]: un total que
    // cierra no prueba que las filas esten bien, asi que va fila por fila.
    'super9b': {
        torneo: 'b6ed4086-2e75-4e68-962b-2d2363c9694c',
        fecha: '2026-09-19',
        razon: 'Parte de la 14ta fecha del Super 9 "B": el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'los-cuervos-r-c', away: 'baguales-r-c', homeScore: 21, awayScore: 26, ofensivo: 'away' },
            { home: 'c-s-la-carlota', away: 'cordoba-rugby-club', homeScore: 13, awayScore: 19 },
            { home: 'santa-rosa-r-c-c', away: 'aero-club-rio-iv', homeScore: 42, awayScore: 19, ofensivo: 'home' },
            { home: 'rio-tercero-r-c', away: 'san-francisco-r-c', homeScore: 24, awayScore: 35, ofensivo: 'ambos' },
        ],
    },
    // Fecha 16, sábado 26/09 (San Francisco libre). Fuente: placa y tabla de
    // @unioncordobesaderugby. Diferencia con la tabla anterior: Baguales +5,
    // Córdoba +5 y Aero +5 (ganaron, ofensivo); Alta Gracia +4 pelado; La Carlota
    // +1 y Los Cuervos +1 (defensivo, lo pone el motor); Santa Rosa +0; y Río III
    // +2 perdiendo 37-32: defensivo Y ofensivo, así que en ese partido el
    // ofensivo va para los dos. La tabla publicada trae PJ mal en Alta Gracia
    // (15, con 10G 4P) y Los Cuervos (14, con 10G 5P); los puntos cierran.
    'super9b-f16': {
        torneo: 'b6ed4086-2e75-4e68-962b-2d2363c9694c',
        fecha: '2026-09-26',
        razon: 'Resultados de la fecha 16 del Super 9 "B" (placa de la UCR); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'aero-club-rio-iv', away: 'rio-tercero-r-c', homeScore: 37, awayScore: 32, ofensivo: 'ambos' },
            { home: 'cordoba-rugby-club', away: 'santa-rosa-r-c-c', homeScore: 61, awayScore: 10, ofensivo: 'home' },
            { home: 'baguales-r-c', away: 'c-s-la-carlota', homeScore: 26, awayScore: 20, ofensivo: 'home' },
            { home: 'alta-gracia-r-c', away: 'los-cuervos-r-c', homeScore: 17, awayScore: 14 },
        ],
    },
    // Super 9 "B", sábado 17/10. Fuente: la grilla de bd.uar.com.ar, que da los
    // puntos de tabla entre corchetes: [5] en cada ganador (4 + ofensivo) y 0 el
    // perdedor. Baguales-Río III y Córdoba-San Francisco figuran sin resultado.
    'super9b-17-10': {
        torneo: 'b6ed4086-2e75-4e68-962b-2d2363c9694c',
        fecha: '2026-10-17',
        razon: 'Super 9 "B", fecha del 17/10 (bd.uar.com.ar): el ofensivo va declarado por los puntos de tabla [5] de la fuente.',
        resultados: [
            { home: 'alta-gracia-r-c', away: 'santa-rosa-r-c-c', homeScore: 42, awayScore: 5, ofensivo: 'home' },
            { home: 'los-cuervos-r-c', away: 'c-s-la-carlota', homeScore: 51, awayScore: 7, ofensivo: 'home' },
            // Los dos que la grilla traía sin resultado ya figuran: [5] en cada ganador.
            { home: 'baguales-r-c', away: 'rio-tercero-r-c', homeScore: 112, awayScore: 0, ofensivo: 'home' },
            { home: 'cordoba-rugby-club', away: 'san-francisco-r-c', homeScore: 34, awayScore: 16, ofensivo: 'home' },
        ],
    },
    // Top 10 del Centro (Primera), fecha 17, sábado 17/10. Fuente: la grilla de
    // bd.uar.com.ar, con los puntos de tabla entre corchetes. Tala 27[4]-24[1]: el
    // ganador sin ofensivo y el defensivo de Córdoba Athletic (lo pone el motor).
    // URU-CURE 35[2]-36[5]: perdió por 1 y suma defensivo + ofensivo, así que el
    // ofensivo va para los dos. La Tablada 24[1]: solo el defensivo (perdió por 6).
    'top10-f17': {
        torneo: '55f28144-3d92-484b-a57d-646e06740808',
        fecha: '2026-10-17',
        razon: 'Top 10 del Centro, fecha 17 (bd.uar.com.ar): el ofensivo va declarado por los puntos de tabla de la fuente.',
        resultados: [
            { home: 'tala-rugby-club', away: 'cordoba-athletic-club', homeScore: 27, awayScore: 24 },
            { home: 'jockey-club-cordoba', away: 'san-martin-de-villa-maria', homeScore: 38, awayScore: 24, ofensivo: 'home' },
            { home: 'jockey-club-de-villa-maria', away: 'carlos-paz-rugby-club', homeScore: 62, awayScore: 21, ofensivo: 'home' },
            { home: 'uru-cure-rugby-club', away: 'club-palermo-bajo', homeScore: 35, awayScore: 36, ofensivo: 'ambos' },
            { home: 'club-la-tablada', away: 'club-universitario-de-cordoba', homeScore: 24, awayScore: 30, ofensivo: 'away' },
        ],
    },
    // Torneos de la Unión Cordobesa con tabla oficial `fully_manual` (carga de
    // `scripts/cordoba-torneos`), 17/10. Fuente: grilla de bd.uar.com.ar. Solo se
    // completan los partidos que estaban programados; la tabla no se recalcula.
    'cordoba-s9b-inter-17-10': {
        torneo: 'fbe60cbb-613c-4fe5-a081-d8e6d5b2aadb',
        fecha: '2026-10-17',
        razon: 'Súper 9 "B" Intermedia, 17/10 (bd.uar.com.ar): puntos de tabla [1]-[4] de la fuente.',
        sinTabla: true,
        resultados: [
            { home: 'los-cuervos-r-c-intermedia', away: 'c-s-la-carlota-intermedia', homeScore: 19, awayScore: 20 },
        ],
    },
    'cordoba-m15b-17-10': {
        torneo: 'ffaaab95-59d4-4a2c-a4c3-5d16b1216064',
        fecha: '2026-10-17',
        razon: 'Torneo Cordobés M15 "B", 17/10 (bd.uar.com.ar): ofensivo por los puntos de tabla [5] de la fuente.',
        sinTabla: true,
        resultados: [
            { home: 'baguales-r-c-m15-b', away: 'uru-cure-rugby-club-m15-b', homeScore: 14, awayScore: 62, ofensivo: 'away' },
        ],
    },
    'cordoba-m16b-17-10': {
        torneo: '34135c1b-9ed1-4e5e-afed-0da7724845ce',
        fecha: '2026-10-17',
        razon: 'Torneo Cordobés M16 "B", 17/10 (bd.uar.com.ar): 54[5]-33[1], ofensivo de los dos.',
        sinTabla: true,
        resultados: [
            { home: 'club-universitario-de-cordoba-m16-b', away: 'san-francisco-r-c-m16-b', homeScore: 54, awayScore: 33, ofensivo: 'ambos' },
        ],
    },
    'cordoba-m17b-17-10': {
        torneo: 'adcb3e20-f98e-4f18-bbe4-694758c75e6e',
        fecha: '2026-10-17',
        razon: 'Torneo Cordobés M17 "B", 17/10 (bd.uar.com.ar): 12[1]-19[4], defensivo del perdedor.',
        sinTabla: true,
        resultados: [
            { home: 'club-universitario-de-cordoba-m17-b', away: 'san-francisco-r-c-m17-b', homeScore: 12, awayScore: 19 },
        ],
    },
    'cordoba-m19a-17-10': {
        torneo: '1ad1a41f-a9f3-4b6f-8902-54cfe2261f2b',
        fecha: '2026-10-17',
        razon: 'Torneo Cordobés M19 "A", semifinales 5º al 8º, 17/10 (bd.uar.com.ar): 45[5]-42[1].',
        sinTabla: true,
        resultados: [
            { home: 'uru-cure-rugby-club-m19-a', away: 'cordoba-athletic-club-m19-a', homeScore: 45, awayScore: 42, ofensivo: 'home' },
        ],
    },
    // Liga Desarrollo Sur - Centro, fecha 4, 17/10: Águilas 31[2]-33[5] Unión
    // Oncativo (el perdedor por 2 suma defensivo y ofensivo).
    'desarrollo-sur-centro-17-10': {
        torneo: '683363b8-45a3-444b-a831-7345b0cbc40e',
        fecha: '2026-10-17',
        razon: 'Liga Desarrollo Sur - Centro, fecha 4 (bd.uar.com.ar): puntos de tabla [2]-[5] de la fuente.',
        sinTabla: true,
        resultados: [
            { home: 'aguilas-general-deheza', away: 'union-oncativo-rugby', homeScore: 31, awayScore: 33, ofensivo: 'ambos' },
        ],
    },
    // Regional del Litoral M19, fecha 3, sábado 17/10. Fuente: nota de Tercer Tiempo
    // ("el Torneo Regional del Litoral M19 y el Clausura Santafesino atravesaron otra
    // fecha"), que da los puntos de cada equipo entre paréntesis. Zona A: el 40-40
    // es (3-3), o sea ofensivo para los dos; el GER 24-27 Duendes es (1-4): el
    // defensivo del perdedor y nada más para el ganador. Se contrasta con las
    // posiciones de la nota: Jockey 13, GER 8, CRAI 6, Santa Fe 5.
    'litoral-m19-a-f3': {
        torneo: '58c7e061-d1f7-4016-8007-4ec3e6483d5f',
        fecha: '2026-10-17',
        razon: 'Regional del Litoral M19 "A", fecha 3 (Tercer Tiempo): los puntos de cada equipo salen de la nota; el ofensivo va declarado porque la fuente da puntos, no tries.',
        resultados: [
            { home: 'crai-m19', away: 'estudiantes-de-parana-m19', homeScore: 21, awayScore: 22 },
            { home: 'santa-fe-r-c-m19', away: 'crar-m19', homeScore: 24, awayScore: 15, ofensivo: 'home' },
            { home: 'jockey-club-de-rosario-m19', away: 'atletico-del-rosario-m19', homeScore: 40, awayScore: 40, ofensivo: 'ambos' },
            { home: 'gimnasia-y-esgrima-de-rosario-m19', away: 'duendes-r-c-m19', homeScore: 24, awayScore: 27 },
        ],
    },
    // Zona B del M19, fecha 3: Tilcara (4-0), Rowing, Old Resian (5-0) y
    // Universitario de Rosario (0-5). Posiciones de la nota: Old Resian 15, Tilcara
    // 14, Rowing 10, Provincial 0.
    'litoral-m19-b-f3': {
        torneo: '173d3b6d-4f7e-44fe-80fd-237c8f9f926a',
        fecha: '2026-10-17',
        razon: 'Regional del Litoral M19 "B", fecha 3 (Tercer Tiempo): los puntos de cada equipo salen de la nota; el ofensivo va declarado porque la fuente da puntos, no tries.',
        resultados: [
            { home: 'club-tilcara-m19', away: 'universitario-de-santa-fe-m19', homeScore: 26, awayScore: 17 },
            { home: 'parana-rowing-m19', away: 'la-salle-jobson-m19', homeScore: 45, awayScore: 17, ofensivo: 'home' },
            { home: 'old-resian-club-m19', away: 'los-caranchos-m19', homeScore: 42, awayScore: 7, ofensivo: 'home' },
            { home: 'c-a-provincial-m19', away: 'universitario-de-rosario-m19', homeScore: 7, awayScore: 38, ofensivo: 'away' },
        ],
    },
    // Fecha 6 del NOA "A", los dos postergados al sábado 03/10. Fuente: placa de
    // resultados y posiciones de @tercertiempotv. Sin ofensivo: Lawn Tennis llega
    // a 20 (16 + 4) y los dos perdedores suman el defensivo que pone el motor
    // (Tucumán Rugby 12, Natación 15). La tabla publicada da Jockey 8 y Lince 4,
    // uno menos que lo que dan los partidos (9 y 5): no lo explica ningún
    // resultado, así que no se copia.
    'noa-f6-postergados': {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-10-03',
        razon: 'Fecha 6 del Regional del NOA "A", los dos partidos postergados (placa de Tercer Tiempo).',
        resultados: [
            { home: 'tucuman-rugby-club', away: 'tucuman-lawn-tennis', homeScore: 34, awayScore: 38 },
            { home: 'natacion-y-gimnasia', away: 'jockey-club-salta', homeScore: 37, awayScore: 38 },
        ],
    },
    // Copa de Oro del Cuyano (Top 8), fecha 12, sábado 17/10. Fuente: stories de
    // @rugbydecuyo (marcadores y tabla de posiciones). Contra la tabla: Marista
    // 43 -> 48 (+5, ofensivo del 47-20); Tordos +4, San Juan +4, CPBM +4 sin bonus;
    // Liceo +1 y Teqüe +1 son el defensivo (lo pone el motor).
    'cuyo-oro-f12': {
        torneo: '166c2906-4a73-4354-a8c4-c64342ed875d',
        fecha: '2026-10-17',
        razon: 'Fecha 12 de la Copa de Oro del Cuyano (placas de Rugby de Cuyo); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'universitario-de-san-juan', away: 'los-tordos-rugby-club', homeScore: 31, awayScore: 40 },
            { home: 'san-juan-rugby-club', away: 'liceo-rugby-club', homeScore: 35, awayScore: 34 },
            { home: 'c-p-b-m', away: 'teque-r-c', homeScore: 31, awayScore: 26 },
            { home: 'marista-rugby-club', away: 'mendoza-rugby-club', homeScore: 47, awayScore: 20, ofensivo: 'home' },
        ],
    },
    // Fecha 8 del Austral, sábado 17/10. Fuente: placa de @fue.try ("Resultados F8,
    // Austral 2026 P. Superior"): marcador sin tries ni bonus. Solo el 67-31 de
    // Portugués lleva ofensivo declarado (67 no se hace con menos de cuatro
    // tries); el resto queda hasta que salga la tabla de la Unión. Madryn-Trelew
    // figura sin resultado y queda programado.
    'austral-f8': {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-10-17',
        razon: 'Resultados de la fecha 8 del Austral (placa de Fue Try); el bonus ofensivo queda sin declarar salvo el 67-31, porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'calafate-r-c', away: 'comodoro-r-c', homeScore: 22, awayScore: 27 },
            { home: 'bigornia-r-c', away: 'draig-goch-r-c', homeScore: 21, awayScore: 0 },
            { home: 'chenque-r-c', away: 'patoruzu-r-c', homeScore: 35, awayScore: 34 },
            { home: 'deportivo-portugues', away: 'san-jorge-r-c-ua', homeScore: 67, awayScore: 31, ofensivo: 'home' },
        ],
    },
    // Fecha 7 del NOA "A", sábado 17/10. Fuente: placa de @urtrugby ("Resultados
    // fecha 7", sujeto a boletín) y su tabla. El ofensivo sale de la diferencia con
    // la tabla: Lawn Tennis 20 -> 25 (+5) y Los Tarcos 15 -> 20 (+5); Huirapuca
    // 19 -> 23 y Natación 15 -> 19 (+4, sin bonus). Universitario de Tucumán suma
    // el defensivo del 25-28 (lo pone el motor). Cardenales-Tucumán Rugby se juega
    // mañana domingo 18/10: se reprograma, sin resultado.
    'noa-f7': {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-10-17',
        razon: 'Fecha 7 del Regional del NOA "A" (placa de la URT); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'tucuman-lawn-tennis', away: 'universitario-de-salta', homeScore: 56, awayScore: 28, ofensivo: 'home' },
            { home: 'universitario-de-tucuman', away: 'natacion-y-gimnasia', homeScore: 25, awayScore: 28 },
            { home: 'jockey-club-salta', away: 'huirapuca', homeScore: 35, awayScore: 51 },
            { home: 'los-tarcos', away: 'lince-rugby-club', homeScore: 49, awayScore: 21, ofensivo: 'home' },
        ],
        reprogramar: [
            { home: 'cardenales-r-c', away: 'tucuman-rugby-club', nuevaFecha: '2026-10-18T15:30:00-03:00' },
        ],
    },
    // Fecha 8 del NOA "A", sábado 24/10. Fuente: placa de @urtrugby ("Resultados
    // fecha 8", sujeto a boletín) y su tabla. El ofensivo sale de la diferencia con
    // la tabla: Lawn Tennis 25 -> 30 (+5). Huirapuca 23 -> 27 y Natación 19 -> 23
    // (+4, sin bonus); Los Tarcos y Universitario de Tucumán suman el defensivo de
    // sus derrotas por 7 y por 4 (lo pone el motor).
    'noa-f8': {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-10-24',
        razon: 'Fecha 8 del Regional del NOA "A" (placa de la URT); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'tucuman-lawn-tennis', away: 'cardenales-r-c', homeScore: 54, awayScore: 10, ofensivo: 'home' },
            { home: 'natacion-y-gimnasia', away: 'los-tarcos', homeScore: 21, awayScore: 14 },
            { home: 'huirapuca', away: 'universitario-de-tucuman', homeScore: 27, awayScore: 23 },
        ],
    },
    // Fecha 8 del NOA "A", domingo 25/10 (misma placa). Tucumán Rugby 16 -> 21
    // (+5, ofensivo con 61 puntos); Lince 5 -> 9 (+4 pelados); Universitario de
    // Salta pierde por 8 (sin defensivo) y Jockey de Salta queda en 9.
    'noa-f8-domingo': {
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fecha: '2026-10-25',
        razon: 'Fecha 8 del Regional del NOA "A" (placa de la URT); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'tucuman-rugby-club', away: 'jockey-club-salta', homeScore: 61, awayScore: 17, ofensivo: 'home' },
            { home: 'universitario-de-salta', away: 'lince-rugby-club', homeScore: 40, awayScore: 48 },
        ],
    },
    // Fecha 14 del NEA (03/10). Fuente: placa de @_urne. Taraguy-CURDA y San
    // José-Aranduroga ya los cargó el gestor. CURNE 7-7 Regatas se suspendió a
    // los 17' del 1T: va aparte, como `suspended`, sin puntos. San Patricio 32-0
    // Aguará: el ofensivo de San Patricio y el de San José los confirmó el
    // usuario (la placa no da tries; en la URNE es por tres de diferencia).
    'nea-f14': {
        torneo: 'b0562cf3-4ea1-463e-86cb-86988dc22f10',
        fecha: '2026-10-03',
        razon: 'Fecha 14 del Regional del NEA (placa de la URNE); ofensivos confirmados por el usuario.',
        resultados: [
            { home: 'san-patricio', away: 'aguara', homeScore: 32, awayScore: 0, ofensivo: 'home' },
            { home: 'san-jose', away: 'aranduroga-r-c', homeScore: 48, awayScore: 28, ofensivo: 'home' },
        ],
    },
    // NEA Ascenso (03/10). Fuente: grupo de prensa de la URNE (Raúl Stevens y
    // Luis Lovello). Sin ofensivo declarado: no hay tries. Lomas-Pay Ubre fue
    // walk-over de Pay Ubre: va aparte, a mano.
    'nea-ascenso-03-10': {
        torneo: 'c1e37680-3f1e-482a-8dc6-c14f4ba417c7',
        fecha: '2026-10-03',
        razon: 'Regional del NEA Ascenso (grupo de prensa de la URNE).',
        resultados: [
            { home: 'caza-y-pesca', away: 'qompi', homeScore: 27, awayScore: 36 },
            // Ofensivo de Tacurú confirmado por el usuario.
            { home: 'capri', away: 'tacuru-social-club', homeScore: 31, awayScore: 47, ofensivo: 'away' },
        ],
    },
    // Austral, Primera Superior (03/10). Fuente: placa de @fue.try. Los ofensivos
    // de Comodoro, Bigornia y Chenque los confirmó el usuario; Patoruzú 57-19 sin
    // ofensivo declarado. Portugués suma el defensivo del 34-36 (lo pone el motor).
    'austral-03-10': {
        torneo: '4e0fb15f-89a2-425f-8830-43eeef981860',
        fecha: '2026-10-03',
        razon: 'Torneo Austral, Primera Superior (placa de Fue Try); ofensivos confirmados por el usuario.',
        resultados: [
            { home: 'calafate-r-c', away: 'deportivo-portugues', homeScore: 36, awayScore: 34 },
            { home: 'draig-goch-r-c', away: 'comodoro-r-c', homeScore: 14, awayScore: 75, ofensivo: 'away' },
            { home: 'bigornia-r-c', away: 'puerto-madryn-r-c', homeScore: 33, awayScore: 19, ofensivo: 'home' },
            { home: 'chenque-r-c', away: 'trelew-r-c', homeScore: 43, awayScore: 24, ofensivo: 'home' },
            { home: 'patoruzu-r-c', away: 'san-jorge-r-c-ua', homeScore: 57, awayScore: 19 },
        ],
    },
    // Regional Pampeano "A", fecha 13 (03/10). Fuente: placa de resultados y
    // posiciones de @rugby.report. El ofensivo sale de la diferencia con la tabla
    // anterior: Comercial y San Ignacio suman 5; IPR y Universitario, 4 pelados;
    // MdP +1 (defensivo del 15-20, lo pone el motor). La oficial pone a Argentino
    // en 0 y nosotros en 1: es el defensivo del 19-26 de la F6 que la tabla le
    // sacó sin explicación desde el 29/8 (no se copia).
    'pampeano-f13': {
        torneo: '594fcb55-b052-4a8f-bf24-5a288e35e4f5',
        fecha: '2026-10-03',
        razon: 'Fecha 13 del Regional Pampeano "A" (placa de Rugby Report): el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.',
        resultados: [
            { home: 'san-ignacio-r-c', away: 'argentino-de-bahia-blanca', homeScore: 29, awayScore: 3, ofensivo: 'home' },
            { home: 'universitario-de-mar-del-plata', away: 'mar-del-plata-club', homeScore: 20, awayScore: 15 },
            { home: 'los-cardos-r-c', away: 'comercial-r-c', homeScore: 22, awayScore: 38, ofensivo: 'away' },
            { home: 'ipr-sporting', away: 'sociedad-sportiva-de-bahia-blanca', homeScore: 35, awayScore: 22 },
        ],
    },
    // Semifinales de la Zona Ascenso (Regional del NOA "B"), 03/10. Fuente: placa
    // de @tercertiempotv. Son llaves: la tabla no se toca.
    'noab-semis': {
        torneo: '3a335922-dc88-42a8-84d3-c38b57b46bca',
        fecha: '2026-10-03',
        razon: 'Semifinales de la Zona Ascenso del Regional del NOA (placa de Tercer Tiempo).',
        resultados: [
            { home: 'tigres-r-c', away: 'old-lions-r-c', homeScore: 58, awayScore: 18 },
            { home: 'jockey-club-de-tucuman', away: 'gimnasia-y-tiro', homeScore: 37, awayScore: 27 },
        ],
    },
    // Clausura del Top 12, fecha 8 (03/10). Fuente: parte de @rugbyclubesuru con
    // BO/BD declarados. Trébol-Los Cuervos está al revés en el fixture (local Los
    // Cuervos): Trébol pierde por 2 y suma el BD por margen.
    'uruguay-f8': {
        torneo: '271638cc-3351-42ce-81bd-ef091e82515d',
        fecha: '2026-10-03',
        razon: 'Parte de Rugby Clubes (Clausura - 1ra Top 12, fecha 8): BO/BD declarados por la fuente.',
        todoAMano: true,
        resultados: [
            { home: 'los-cuervos', away: 'trebol-de-paysandu', homeScore: 15, awayScore: 13 },
            { home: 'psg', away: 'champagnat', homeScore: 26, awayScore: 29, ofensivo: 'away' },
            { home: 'carrasco-polo', away: 'montevideo-c-c', homeScore: 29, awayScore: 15, ofensivo: 'home' },
            { home: 'old-christians-club', away: 'circulo-de-tenis', homeScore: 84, awayScore: 0, ofensivo: 'home' },
            { home: 'lobos-pde', away: 'club-seminario', homeScore: 50, awayScore: 14, ofensivo: 'home' },
            { home: 'ceibos-club', away: 'old-boys-girls-club', homeScore: 8, awayScore: 38, ofensivo: 'away' },
        ],
    },
    // Clausura del Top 12, fecha 9 (10/10). Fuente: parte de @rugbyclubesuru con
    // BO/BD en insignias. Old Christians-Champagnat y PSG-Seminario figuran al
    // revés en el fixture (locales Champagnat y Seminario): los marcadores se
    // dan en orden del fixture. En PSG 39-38 Seminario la placa marca BO para
    // los dos y el BD de Seminario, que pierde por 1; en Trébol 22-21 MVD, solo
    // el BD de MVD. El defensivo lo pone la cuenta de margen.
    'uruguay-f9': {
        torneo: '271638cc-3351-42ce-81bd-ef091e82515d',
        fecha: '2026-10-10',
        razon: 'Parte de Rugby Clubes (Clausura - 1ra Top 12, fecha 9): BO/BD declarados por la fuente.',
        todoAMano: true,
        resultados: [
            { home: 'trebol-de-paysandu', away: 'montevideo-c-c', homeScore: 22, awayScore: 21 },
            { home: 'los-cuervos', away: 'ceibos-club', homeScore: 29, awayScore: 5, ofensivo: 'home' },
            { home: 'circulo-de-tenis', away: 'carrasco-polo', homeScore: 0, awayScore: 47, ofensivo: 'away' },
            { home: 'old-boys-girls-club', away: 'lobos-pde', homeScore: 22, awayScore: 6 },
            { home: 'champagnat', away: 'old-christians-club', homeScore: 17, awayScore: 57, ofensivo: 'away' },
            { home: 'club-seminario', away: 'psg', homeScore: 38, awayScore: 39, ofensivo: 'ambos' },
        ],
    },
    // Clausura del Top 12, fecha 10 (17/10). Fuente: placas de @rugbyclubesuru
    // (resultados con BO/BD y tabla). Los Cuervos suma BO y BD en el 27-29: el
    // BD lo pone la cuenta de margen. Se contrasta con la tabla de la placa.
    'uruguay-f10': {
        torneo: '271638cc-3351-42ce-81bd-ef091e82515d',
        fecha: '2026-10-17',
        razon: 'Parte de Rugby Clubes (Clausura - 1ra Top 12, fecha 10): BO/BD declarados por la fuente.',
        todoAMano: true,
        resultados: [
            { home: 'lobos-pde', away: 'los-cuervos', homeScore: 29, awayScore: 27, ofensivo: 'ambos' },
            { home: 'carrasco-polo', away: 'champagnat', homeScore: 38, awayScore: 24, ofensivo: 'home' },
            { home: 'montevideo-c-c', away: 'circulo-de-tenis', homeScore: 50, awayScore: 7, ofensivo: 'home' },
            { home: 'psg', away: 'old-boys-girls-club', homeScore: 5, awayScore: 60, ofensivo: 'away' },
            { home: 'old-christians-club', away: 'club-seminario', homeScore: 33, awayScore: 14, ofensivo: 'home' },
            { home: 'ceibos-club', away: 'trebol-de-paysandu', homeScore: 12, awayScore: 48, ofensivo: 'away' },
        ],
    },
    uruguay: {
        torneo: '271638cc-3351-42ce-81bd-ef091e82515d',
        fecha: '2026-09-12',
        razon: 'Parte de Rugby Clubes (Clausura - 1ra Top 12): BO/BD declarados por la fuente.',
        todoAMano: true,
        resultados: [
            { home: 'psg', away: 'montevideo-c-c', homeScore: 7, awayScore: 33, ofensivo: 'away' },
            { home: 'old-christians-club', away: 'carrasco-polo', homeScore: 17, awayScore: 28 },
            { home: 'old-boys-girls-club', away: 'trebol-de-paysandu', homeScore: 15, awayScore: 13 },
            { home: 'club-seminario', away: 'los-cuervos', homeScore: 22, awayScore: 52, ofensivo: 'away' },
            { home: 'lobos-pde', away: 'circulo-de-tenis', homeScore: 35, awayScore: 7, ofensivo: 'home' },
            { home: 'champagnat', away: 'ceibos-club', homeScore: 22, awayScore: 12 },
        ],
    },
};

const APPLY = process.argv.includes('--apply');
const MARGEN_DEFENSIVO = 7;

/** Los puntos del partido, como los escribe el gestor: base + bonus por lado. */
function puntos(r: Resultado) {
    const gana = r.homeScore > r.awayScore ? 'home' : r.homeScore < r.awayScore ? 'away' : null;
    const base = (lado: 'home' | 'away') => (gana === null ? 2 : gana === lado ? 4 : 0);
    const diferencia = Math.abs(r.homeScore - r.awayScore);
    const bonus = (lado: 'home' | 'away') =>
        (r.ofensivo === lado || r.ofensivo === 'ambos' ? 1 : 0) + (gana !== null && gana !== lado && diferencia <= MARGEN_DEFENSIVO ? 1 : 0);
    return {
        home_base_points: base('home'),
        away_base_points: base('away'),
        home_bonus_points: bonus('home'),
        away_bonus_points: bonus('away'),
    };
}

async function main() {
    const clave = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';
    const carga = CARGAS[clave];
    if (!carga) { console.error(`Torneo desconocido "${clave}". Opciones: ${Object.keys(CARGAS).join(', ')}`); process.exit(1); }
    const { torneo, fecha, razon, resultados, reprogramar = [], todoAMano = false, sinTabla = false } = carga;

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('matches')
        .select('id, phase_id, season_id, status, date_time, home_club_id, away_club_id, score')
        .eq('tournament_id', torneo)
        .gte('date_time', `${fecha}T00:00:00-03:00`)
        .lt('date_time', `${fecha}T23:59:59-03:00`);
    if (error || !data) { console.error('No pude leer la fecha.', error); process.exit(1); }

    const buscar = (home: string, away: string) => {
        const partido = data.find((m) => m.home_club_id === home && m.away_club_id === away);
        if (!partido) { console.error('No está el partido', home, 'vs', away, 'el', fecha); process.exit(1); }
        return partido;
    };

    const planes = resultados.map((r) => {
        const partido = buscar(r.home, r.away);
        const p = puntos(r);
        const manual = todoAMano || Boolean(r.ofensivo);
        console.log(
            `${r.home} ${r.homeScore}-${r.awayScore} ${r.away}`,
            `| base ${p.home_base_points}/${p.away_base_points} bonus ${p.home_bonus_points}/${p.away_bonus_points}`,
            r.ofensivo ? '| MANUAL (ofensivo declarado)' : manual ? '| MANUAL' : '| AUTO',
            `| antes: ${partido.status} ${partido.score?.home}-${partido.score?.away}`,
        );
        return { partido, r, p, manual };
    });
    const movidas = reprogramar.map((m) => {
        const partido = buscar(m.home, m.away);
        const nueva = new Date(m.nuevaFecha).toISOString();
        console.log(`${m.home} vs ${m.away} | ${partido.date_time} -> ${nueva}`);
        return { partido, nueva };
    });

    if (!APPLY) { console.log('\nDry-run. Con --apply se escribe.'); return; }

    for (const { partido, r, p, manual } of planes) {
        const { error: upErr } = await supabase.from('matches').update({
            status: 'final',
            score: { home: r.homeScore, away: r.awayScore },
            ...p,
            points_autocalculated: !manual,
            points_override_reason: manual ? razon : null,
        }).eq('id', partido.id);
        if (upErr) { console.error('Falló', r.home, r.away, upErr); process.exit(1); }
        console.log('ok', r.home, r.homeScore, '-', r.awayScore, r.away);
    }
    for (const { partido, nueva } of movidas) {
        const { error: upErr } = await supabase.from('matches').update({ date_time: nueva }).eq('id', partido.id);
        if (upErr) { console.error('Falló la reprogramación', partido.id, upErr); process.exit(1); }
        console.log('reprogramado', partido.home_club_id, 'vs', partido.away_club_id, nueva);
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    // `sinTabla`: la fase tiene la tabla oficial cargada a mano (`fully_manual`); recalcularla la pisaría.
    for (const fase of (sinTabla ? [] : [...new Set(planes.map(({ partido }) => partido.phase_id).filter(Boolean))]) as string[]) {
        const seasonId = planes.find(({ partido }) => partido.phase_id === fase)?.partido.season_id ?? null;
        const r = await recalculatePhaseStandingsScopes(torneo, fase, 'general', seasonId);
        console.log('tabla recalculada', fase, JSON.stringify(r)?.slice(0, 200));
    }

    // `invalidateMatchesFeedCaches` importa `server-only` y no corre desde un
    // script: se borran los snapshots de los días tocados con alcance.
    const { deleteMatchesFeedSnapshotsForScope } = await import('@/lib/server/matchesFeedCache');
    const dias = new Set([fecha, ...reprogramar.map((m) => m.nuevaFecha.slice(0, 10))]);
    for (const dia of dias) {
        console.log('feed', dia, 'snapshots borrados:', await deleteMatchesFeedSnapshotsForScope(supabase, { effectiveDate: dia }));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
