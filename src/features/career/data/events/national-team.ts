import type { GameEvent } from '../../types/event.ts';
import { playsEndOfYearTour } from '../international-calendar.ts';

// Requiere estar en el radar de la selección (OVR alto). Corren en paralelo al club.
export const NATIONAL_TEAM_EVENTS: GameEvent[] = [
    {
        id: 'nt-first-callup-nerves',
        category: 'national-team',
        title: 'Primera concentración',
        text: 'Te citan por primera vez a la selección mayor. El vestuario impone respeto.',
        weight: 14,
        repeatable: false,
        // Ya NO es la puerta de entrada a la selección: es lo que se cuenta
        // DESPUÉS de que la convocatoria real ocurrió. Antes tenía `minOvr: 66`
        // y regalaba caps por su cuenta, así que un jugador de 66 sumaba caps de
        // los All Blacks sin acercarse al umbral. `repeatable: false` alcanza
        // para que sea la PRIMERA concentración y de ninguna otra.
        requires: { nationalStatus: ['squad', 'starter'] },
        options: [
            {
                id: 'humble',
                label: 'Entrar de perfil bajo',
                hint: 'Te ganás al grupo de a poco.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, morale: 4 }, resultText: 'Escuchás, trabajás y te hacés un lugar sin ruido.' },
                ],
            },
            {
                id: 'bold',
                label: 'Mostrarte desde el arranque',
                hint: 'Arriesgás, pero podés acelerar.',
                outcomes: [
                    { weight: 0.55, effect: { fame: 6, morale: 3 }, resultText: 'Te animás y dejás una imagen fuerte en el cuerpo técnico.' },
                    { weight: 0.45, effect: { morale: -3 }, resultText: 'Quisiste destacarte de más y no cayó del todo bien.' },
                ],
            },
        ],
    },
    {
        id: 'nt-eligibility-switch',
        category: 'national-team',
        title: 'Otra bandera te llama',
        // "Por tu ascendencia" era mentira: el motor no genera ascendencia (ver
        // HERITAGE_LINKS en data/nations.ts, sembrado y sin consumir). Lo que sí
        // existe y se venía acumulando solo es el registro por RESIDENCIA — cinco
        // temporadas en la misma unión, Reg. 8.1(c) —, que además es la vía por la
        // que esto pasa de verdad en el rugby y está declarada en el CLAUDE.md.
        text: 'Jugaste tantos años acá que ahora esta unión te quiere. Es una decisión de vida.',
        weight: 7,
        repeatable: false,
        minOvr: 70,
        maxAge: 27,
        // Sin una unión rival concreta la tarjeta no sale. Antes salía siempre y
        // no decía a dónde irías, así que se elegía a ciegas entre dos banderas de
        // las que sólo conocías una.
        requires: { requiresRivalUnion: true },
        options: [
            {
                id: 'switch',
                label: 'Cambiar de selección',
                hint: 'Más vidriera, menos raíces.',
                outcomes: [
                    { weight: 1, effect: { fame: 12, flags: { cambio_bandera: 1 }, morale: -4 }, resultText: 'Cambiás de camiseta internacional. Más foco, sensaciones encontradas.' },
                ],
            },
            {
                id: 'stay',
                label: 'Quedarte con la tuya',
                hint: 'Identidad por sobre todo.',
                outcomes: [
                    { weight: 1, effect: { morale: 8, mental: 2, flags: { identidad: 1 } }, resultText: 'Elegís tu bandera de siempre. El país te lo reconoce.' },
                ],
            },
        ],
    },
    {
        id: 'nt-captaincy',
        category: 'national-team',
        title: 'Capitán de tu país',
        text: 'El head coach te ofrece la capitanía de la selección. Es lo más alto.',
        weight: 8,
        repeatable: false,
        minOvr: 76,
        minAge: 27,
        requires: { nationalStatus: ['squad', 'starter'] },
        options: [
            {
                id: 'accept',
                label: 'Aceptar y liderar',
                hint: 'Leyenda en construcción.',
                outcomes: [
                    { weight: 1, effect: { mental: 5, vision: 3, fame: 14, flags: { capitan_nacional: 1 } }, resultText: 'Te ponés la número de capitán del seleccionado. Historia pura.' },
                ],
            },
            {
                id: 'decline',
                label: 'Ceder el rol',
                hint: 'Preferís jugar sin la mochila.',
                outcomes: [
                    { weight: 1, effect: { morale: 2, technique: 1 }, resultText: 'Preferís aportar sin la cinta. El grupo te valora igual.' },
                ],
            },
        ],
    },
    {
        id: 'nt-tour-vs-rest',
        category: 'national-team',
        title: 'Gira de fin de año',
        text: 'Hay una gira larga con la selección justo cuando venís al límite físico.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        requires: { nationalStatus: ['squad', 'starter'] },
        // Sólo si la unión EFECTIVAMENTE gira esta temporada. Sin esto se le
        // ofrecía la gira de fin de año al tailandés, cuya unión no tiene ventana
        // de noviembre en el calendario: el evento daba por sentado un fixture que
        // no existe. Mismo patrón que los hitos del Mundial, más chico.
        condition: (ctx) => playsEndOfYearTour(ctx.state.player.nationalTeam, ctx.state.player.seasonsPlayed),
        options: [
            {
                id: 'go',
                label: 'Ir a la gira',
                hint: 'Más caps, más fatiga.',
                outcomes: [
                    { weight: 1, effect: { testShare: 1.3, fame: 5, fatigue: 12, injuryRisk: 3 }, resultText: 'Te subís al avión. Sumás tests, pero terminás fundido.' },
                ],
            },
            {
                id: 'rest',
                label: 'Pedir descanso',
                hint: 'Cuidás el cuerpo, resignás caps.',
                outcomes: [
                    { weight: 1, effect: { testShare: 0.55, fatigue: -12, morale: -3 }, resultText: 'Te bajás para recuperar. El técnico lo entiende, a medias.' },
                ],
            },
        ],
    },
    {
        id: 'nt-bench-role',
        category: 'national-team',
        title: 'Suplente en la selección',
        text: 'En tu país hay un fenómeno en tu puesto. Te toca pelear desde el banco.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        requires: { nationalStatus: ['squad', 'starter'] },
        options: [
            {
                id: 'fight',
                label: 'Pelear el puesto',
                hint: 'Entrenás para desbancarlo.',
                outcomes: [
                    { weight: 0.5, effect: { technique: 3, mental: 2, testShare: 1.2 }, resultText: 'Le hacés partido en cada práctica y te ganás minutos.' },
                    { weight: 0.5, effect: { morale: -4, mental: 1 }, resultText: 'El titular no afloja. Te toca esperar tu momento.' },
                ],
            },
            {
                id: 'accept-role',
                label: 'Aceptar el rol de impacto',
                hint: 'Especializarte como revulsivo.',
                outcomes: [
                    { weight: 1, effect: { stamina: 2, speed: 1, testShare: 1.25, flags: { revulsivo: 1 } }, resultText: 'Te hacés experto en entrar y cambiar partidos.' },
                ],
            },
        ],
    },
    {
        id: 'nt-media-pressure',
        category: 'national-team',
        title: 'La presión del hincha',
        text: 'El país entero opina de vos antes de un test decisivo. Las redes arden.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        requires: { nationalStatus: ['squad', 'starter'] },
        options: [
            {
                id: 'ignore',
                label: 'Aislarte del ruido',
                hint: 'Cabeza fría.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, morale: 2 }, resultText: 'Te desconectás de las redes y jugás liberado.' },
                ],
            },
            {
                id: 'feed',
                label: 'Usar la presión a favor',
                hint: 'Doble filo.',
                outcomes: [
                    { weight: 0.55, effect: { form: 6, fame: 5 }, resultText: 'La presión te enciende y respondés en la cancha.' },
                    { weight: 0.45, effect: { form: -5, morale: -4 }, resultText: 'El ruido te mete en la cabeza y no rendís.' },
                ],
            },
        ],
    },
    {
        id: 'nt-retire-international',
        category: 'national-team',
        title: 'Retiro de la selección',
        text: 'Ya sos veterano. Podés dar un paso al costado en la selección para cuidar tu club.',
        weight: 8,
        repeatable: false,
        minAge: 33,
        requires: { nationalStatus: ['squad', 'starter'] },
        options: [
            {
                id: 'retire-nt',
                label: 'Retirarte del seleccionado',
                hint: 'Alargás tu carrera de club.',
                outcomes: [
                    { weight: 1, effect: { fatigue: -15, injuryRisk: -6, morale: 3, flags: { retiro_seleccion: 1 } }, resultText: 'Le decís adiós a la selección. Tu club gana un jugador más entero.' },
                ],
            },
            {
                id: 'keep',
                label: 'Seguir mientras el cuerpo aguante',
                hint: 'Más caps, más desgaste.',
                outcomes: [
                    { weight: 1, effect: { testShare: 1.15, fatigue: 6, fame: 3 }, resultText: 'Seguís dando el presente con tu país hasta donde el cuerpo diga.' },
                ],
            },
        ],
    },
    {
        id: 'nt-lost-shirt',
        category: 'national-team',
        title: 'Te dejaron afuera de la gira',
        text: 'La lista salió sin tu nombre. Después de años yendo, esta vez el llamado no llegó.',
        weight: 13,
        repeatable: true,
        cooldown: 6,
        requires: { nationalStatus: ['dropped'] },
        options: [
            {
                id: 'chase',
                label: 'Ir a buscarla',
                hint: 'Entrenás para volver. El cuerpo lo paga.',
                outcomes: [
                    { weight: 0.45, effect: { form: 7, mental: 3, fatigue: 10, injuryRisk: 4 }, resultText: 'Te ponés en modo revancha. El desgaste se nota, el nivel también.' },
                    { weight: 0.55, effect: { morale: -6, fatigue: 8 }, resultText: 'Dejás todo en las prácticas y la lista vuelve a salir sin vos.' },
                ],
            },
            {
                id: 'let-go',
                label: 'Soltarla',
                hint: 'Ganás cuerpo y cabeza para el club. La camiseta queda lejos.',
                outcomes: [
                    { weight: 1, effect: { fatigue: -14, morale: 4, injuryRisk: -5, flags: { camiseta_soltada: 1 } }, resultText: 'Hacés las paces con la idea. Tu club se queda con la mejor versión tuya.' },
                ],
            },
        ],
    },
    {
        id: 'nt-place-under-threat',
        category: 'national-team',
        title: 'El puesto se te va',
        text: 'Venís de una temporada floja y el cuerpo técnico probó a otro en tu lugar. La próxima lista es una pregunta abierta.',
        weight: 12,
        repeatable: true,
        cooldown: 5,
        requires: { nationalStatus: ['squad', 'starter'] },
        options: [
            {
                id: 'fight-back',
                label: 'Jugártela en el club',
                hint: 'Todo al rendimiento. Si no sale, quedás peor.',
                outcomes: [
                    { weight: 0.5, effect: { form: 8, mental: 3, fatigue: 8 }, resultText: 'Metés una temporada seria en el club y el debate se termina solo.' },
                    { weight: 0.5, effect: { selectionPenalty: { points: 9, seasons: 2 }, morale: -6, fatigue: 6 }, resultText: 'Forzás, no te sale, y el otro se queda con la camiseta.' },
                ],
            },
            {
                id: 'talk-to-coach',
                label: 'Hablar con el entrenador',
                hint: 'Sabés a qué atenerte. La respuesta puede no gustarte.',
                outcomes: [
                    { weight: 0.45, effect: { mental: 4, morale: 3 }, resultText: 'Te dice qué quiere ver. Es concreto y te sirve.' },
                    { weight: 0.55, effect: { selectionPenalty: { points: 7, seasons: 2 }, mental: 2, morale: -4 }, resultText: 'Te agradece los años y te avisa que va a mirar a otros. Sin vueltas.' },
                ],
            },
        ],
    },
    {
        id: 'nt-long-injury-place-lost',
        category: 'national-team',
        title: 'La lesión te dejó afuera de la ventana',
        text: 'Te perdiste la ventana entera y el que entró por vos anduvo bien. Volvés a un plantel que ya se acomodó sin tu nombre.',
        weight: 11,
        repeatable: true,
        cooldown: 6,
        requires: { nationalStatus: ['squad', 'starter'], requiresRecentInjury: true },
        options: [
            {
                id: 'rush-back',
                label: 'Volver antes de tiempo',
                hint: 'Recuperás el lugar o te rompés de nuevo.',
                outcomes: [
                    { weight: 0.4, effect: { form: 6, fame: 3, fatigue: 10 }, resultText: 'Volvés antes de lo previsto y el técnico toma nota.' },
                    { weight: 0.6, effect: { selectionPenalty: { points: 8, seasons: 2 }, injuryRisk: 8, fatigue: 12 }, resultText: 'Apurás la vuelta, no llegás bien y la ventana pasa sin vos.' },
                ],
            },
            {
                id: 'full-recovery',
                label: 'Recuperarte del todo',
                hint: 'Volvés entero, pero la ventana ya pasó.',
                outcomes: [
                    { weight: 1, effect: { selectionPenalty: { points: 5, seasons: 1 }, injuryRisk: -8, fatigue: -10, mental: 2 }, resultText: 'Hacés la recuperación completa. El cuerpo te lo agradece, la lista no.' },
                ],
            },
        ],
    },
];
