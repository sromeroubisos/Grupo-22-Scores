import type { GameEvent } from '../../types/event.ts';

// Eventos de club (no incluyen el pase en sí: ese es un evento dinámico que arma
// el motor con ofertas reales). Acá van capitanía, contrato, préstamos y foco.
// Contrato de efectos: atributos y dinámica se declaran planos (`{ mental: 4 }`).
export const CLUB_EVENTS: GameEvent[] = [
    {
        id: 'club-captaincy',
        category: 'club',
        title: 'La cinta de capitán',
        text: 'El entrenador te ofrece la capitanía del equipo. Es un salto de responsabilidad.',
        weight: 12,
        repeatable: false,
        minAge: 24,
        minOvr: 66,
        forbidsFlags: ['capitan'],
        options: [
            {
                id: 'accept',
                label: 'Aceptar la capitanía',
                hint: 'Sube liderazgo y fama, pero también presión.',
                outcomes: [
                    { weight: 1, effect: { mental: 4, vision: 2, fame: 8, morale: 6, flags: { capitan: 1 } }, resultText: 'Te ponés el equipo al hombro. El vestuario te sigue.' },
                ],
            },
            {
                id: 'decline',
                label: 'Rechazar por ahora',
                hint: 'Preferís enfocarte en tu juego.',
                outcomes: [
                    { weight: 1, effect: { morale: -2, technique: 1 }, resultText: 'Preferís seguir concentrado en lo tuyo. El técnico lo entiende.' },
                ],
            },
        ],
    },
    {
        id: 'club-contract-renewal',
        category: 'club',
        title: 'Renovación de contrato',
        text: 'El club quiere renovarte. Ofrecen mejor sueldo pero una cláusula más larga.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        minAge: 21,
        // Habla de sueldo y de cláusula: no existe para el que juega sin contrato.
        requires: { employment: ['semi-professional', 'full-time-professional'] },
        options: [
            {
                id: 'renew-long',
                label: 'Firmar largo',
                hint: 'Estabilidad y moral, menos margen para irte.',
                outcomes: [
                    { weight: 1, effect: { morale: 8, fame: 3, flags: { leal: 1 } }, resultText: 'Firmás por varias temporadas. El club te hace sentir importante.' },
                ],
            },
            {
                id: 'renew-short',
                label: 'Firmar corto',
                hint: 'Te dejás una puerta abierta al mercado.',
                outcomes: [
                    { weight: 1, effect: { morale: 2, flags: { ambicioso: 1 } }, resultText: 'Firmás corto: querés ver qué pasa en el mercado más adelante.' },
                ],
            },
        ],
    },
    {
        id: 'club-loan-youth',
        category: 'club',
        title: 'Oferta de préstamo',
        text: 'Sos joven y no sumás minutos. Aparece un préstamo a un club donde jugarías todo.',
        weight: 14,
        repeatable: false,
        maxAge: 23,
        options: [
            {
                id: 'go-loan',
                label: 'Irte a préstamo',
                hint: 'Minutos reales: crecés más rápido.',
                outcomes: [
                    { weight: 1, effect: { technique: 3, stamina: 2, tackle: 2, morale: 5, flags: { curtido: 1 } }, resultText: 'Te vas a jugar. La competencia real te curte.' },
                ],
            },
            {
                id: 'stay-bench',
                label: 'Quedarte a pelearla',
                hint: 'Entrenás con los grandes, pero jugás poco.',
                outcomes: [
                    { weight: 1, effect: { mental: 2, morale: -3 }, resultText: 'Te quedás entrenando con el plantel principal, aunque casi no jugás.' },
                ],
            },
        ],
    },
    {
        id: 'club-training-focus',
        category: 'club',
        title: 'Foco de pretemporada',
        text: 'El preparador te deja elegir en qué poner el foco esta pretemporada.',
        weight: 16,
        repeatable: true,
        cooldown: 2,
        options: [
            {
                id: 'gym',
                label: 'Gimnasio y potencia',
                hint: 'Más potencia y resistencia.',
                outcomes: [
                    { weight: 1, effect: { power: 3, stamina: 2, fatigue: 4 }, resultText: 'Cargás el gimnasio. Terminás más fuerte, un poco más cansado.' },
                ],
            },
            {
                id: 'skills',
                label: 'Técnica y manejo',
                hint: 'Más técnica y visión.',
                outcomes: [
                    { weight: 1, effect: { technique: 3, vision: 2 }, resultText: 'Trabajás fino: manos, apoyos, lectura de juego.' },
                ],
            },
            {
                id: 'speed',
                label: 'Velocidad y agilidad',
                hint: 'Más velocidad.',
                outcomes: [
                    { weight: 1, effect: { speed: 3, technique: 1, fatigue: 3 }, resultText: 'Pista y pliometría: ganás un cambio de ritmo.' },
                ],
            },
        ],
    },
    {
        id: 'club-new-coach',
        category: 'club',
        title: 'Cambio de entrenador',
        text: 'Llega un entrenador nuevo con otra idea. No sabés si entrás en sus planes.',
        weight: 11,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'adapt',
                label: 'Adaptarte a su sistema',
                hint: 'Ganás en lo colectivo.',
                outcomes: [
                    { weight: 0.6, effect: { vision: 2, mental: 2, morale: 3 }, resultText: 'Te ponés la camiseta de su idea y te ganás su confianza.' },
                    { weight: 0.4, effect: { vision: 1, morale: -3 }, resultText: 'Te cuesta entrar en su cabeza; el arranque es duro.' },
                ],
            },
            {
                id: 'resist',
                label: 'Jugar a tu manera',
                hint: 'Arriesgás el lugar por tu estilo.',
                outcomes: [
                    { weight: 0.5, effect: { technique: 2, fame: 3 }, resultText: 'Imponés tu juego y el técnico se rinde a la evidencia.' },
                    { weight: 0.5, effect: { morale: -6, form: -6 }, resultText: 'Chocás con el nuevo cuerpo técnico y perdés terreno.' },
                ],
            },
        ],
    },
    {
        id: 'club-derby',
        category: 'club',
        title: 'La semana del clásico',
        text: 'Se viene el clásico. La ciudad respira rugby y todos te miran a vos.',
        weight: 13,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'lead',
                label: 'Tomar la responsabilidad',
                hint: 'Si sale bien, sos ídolo.',
                outcomes: [
                    { weight: 0.55, effect: { fame: 7, morale: 5, form: 5 }, resultText: 'Jugás el partido de tu vida. El clásico lleva tu nombre.' },
                    { weight: 0.45, effect: { fame: 2, morale: -4, form: -3 }, resultText: 'La presión te pesa y no es tu mejor tarde.' },
                ],
            },
            {
                id: 'team',
                label: 'Diluirte en el equipo',
                hint: 'Menos riesgo, menos brillo.',
                outcomes: [
                    { weight: 1, effect: { tackle: 1, morale: 2 }, resultText: 'Hacés un partido sólido, sin sobresaltos.' },
                ],
            },
        ],
    },
    {
        id: 'club-veteran-mentor',
        category: 'club',
        title: 'Mentor del plantel',
        text: 'Los más chicos te buscan. El club te pide que seas referente del vestuario.',
        weight: 9,
        repeatable: false,
        minAge: 30,
        options: [
            {
                id: 'mentor',
                label: 'Asumir el rol de mentor',
                hint: 'Liderazgo y fama a cambio de foco propio.',
                outcomes: [
                    { weight: 1, effect: { mental: 3, vision: 2, fame: 4, morale: 4, flags: { referente: 1 } }, resultText: 'Te convertís en la brújula del vestuario.' },
                ],
            },
            {
                id: 'self',
                label: 'Cuidar tu propio juego',
                hint: 'Estirás tu nivel un poco más.',
                outcomes: [
                    { weight: 1, effect: { technique: 2, stamina: 1 }, resultText: 'Elegís seguir enfocado en estirar tu propio rendimiento.' },
                ],
            },
        ],
    },
    {
        id: 'club-salary-cap',
        category: 'club',
        title: 'Problemas de presupuesto',
        text: 'El club tiene que recortar. Te piden bajar el sueldo para no desarmar el plantel.',
        weight: 8,
        repeatable: true,
        cooldown: 5,
        minAge: 25,
        // Mismo motivo: no se le puede pedir un recorte a quien no cobra.
        requires: { employment: ['semi-professional', 'full-time-professional'] },
        options: [
            {
                id: 'accept-cut',
                label: 'Bajarte el sueldo',
                hint: 'Gesto que el vestuario valora.',
                outcomes: [
                    { weight: 1, effect: { morale: 5, fame: 2, flags: { leal: 1 } }, resultText: 'Ponés el hombro. El plantel se mantiene unido.' },
                ],
            },
            {
                id: 'refuse',
                label: 'No resignar plata',
                hint: 'Cuidás lo tuyo, se enfría la relación.',
                outcomes: [
                    { weight: 1, effect: { morale: -4, flags: { ambicioso: 1 } }, resultText: 'No aceptás el recorte. La dirigencia toma nota.' },
                ],
            },
        ],
    },
    // ── El puesto, semana a semana ───────────────────────────────────────────
    // Las tres decisiones que faltaban del eje 🕒: la competencia por el puesto,
    // el banco que se hace largo y la cinta que queda libre. Son las que hacen
    // que el tiempo de juego se pueda pelear, y no sólo esperar.
    {
        id: 'club-coach-doubts',
        category: 'club',
        title: 'El técnico duda entre vos y otro',
        text: 'El entrenador prueba a los dos en la semana y no larga el equipo hasta el viernes. Vos sabés que el puesto es de uno.',
        weight: 12,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'meeting',
                label: 'Pedir una reunión',
                hint: 'Sabés a qué atenerte. La respuesta puede no gustarte.',
                outcomes: [
                    { weight: 60, effect: { playingTime: 2, mental: 1 }, resultText: 'Te dice qué quiere ver y se lo das. El viernes tu nombre está en el equipo.' },
                    { weight: 40, effect: { mental: 2, morale: -2 }, resultText: 'Te escucha, te agradece la charla y arranca el otro. Al menos ya sabés dónde estás parado.' },
                ],
            },
            {
                id: 'wait',
                label: 'Esperar tu oportunidad',
                hint: 'Sin ruido. El puesto lo decide él y puede no ser tuyo.',
                outcomes: [
                    { weight: 30, effect: { playingTime: 1, technique: 1 }, resultText: 'Trabajás en silencio y la oportunidad llega igual, a mitad de temporada.' },
                    { weight: 70, effect: { playingTime: -1, morale: -2 }, resultText: 'El otro arranca y no lo saca más. Tu semana se vuelve entrenar y mirar.' },
                ],
            },
            {
                id: 'other-position',
                label: 'Ofrecerte para otro puesto',
                hint: 'Entrás igual, en un lugar que no es el tuyo.',
                outcomes: [
                    { weight: 1, effect: { vision: 2, mental: 2, playingTime: 1, form: -2 }, resultText: 'Le decís que podés cubrir el otro lado. Jugás casi todo, aunque nunca donde querés.' },
                ],
            },
        ],
    },
    {
        id: 'club-bench-third-game',
        category: 'club',
        title: 'Tercer partido en el banco',
        text: 'Tercer domingo sin entrar. Calentás veinte minutos, te sentás y el partido se termina sin vos.',
        weight: 12,
        repeatable: true,
        cooldown: 3,
        minAge: 20,
        options: [
            {
                id: 'talk',
                label: 'Hablar con el entrenador',
                hint: 'Te va a decir la verdad. La verdad puede ser que no entrás.',
                outcomes: [
                    { weight: 55, effect: { playingTime: 2, morale: 2 }, resultText: 'Le pedís cinco minutos y salís con una lista de cosas para corregir. El domingo entrás.' },
                    { weight: 45, effect: { playingTime: -1, morale: -4 }, resultText: 'Te dice que hoy no estás para arrancar. Es honesto y duele igual.' },
                ],
            },
            {
                id: 'work',
                label: 'Esperar trabajando',
                hint: 'Nadie se enoja. Tampoco nadie se acuerda de vos.',
                outcomes: [
                    { weight: 35, effect: { playingTime: 1, technique: 1, mental: 1 }, resultText: 'Sos el primero en llegar y el último en irse. Una lesión te abre la puerta y no la sueltas.' },
                    { weight: 65, effect: { playingTime: -1, form: -3 }, resultText: 'Las semanas pasan iguales. Sin partidos, el ritmo se va solo.' },
                ],
            },
            {
                id: 'ask-out',
                label: 'Pedir salir del club',
                hint: 'Te sacás la mochila. El club deja de contar con vos.',
                outcomes: [
                    { weight: 1, effect: { playingTime: -2, morale: -3, fame: 2, flags: { pidio_salir: 1 } }, resultText: 'Pedís permiso para buscar club. Te lo dan, y desde ese lunes ya no entrás en los planes.' },
                ],
            },
        ],
    },
    {
        id: 'club-captain-injured',
        category: 'club',
        title: 'El capitán se rompió',
        text: 'El capitán sale en camilla y estará afuera medio año. El técnico mira al plantel buscando quién agarra la cinta.',
        weight: 10,
        repeatable: true,
        cooldown: 5,
        minAge: 23,
        options: [
            {
                id: 'step-up',
                label: 'Ofrecerte para liderar',
                hint: 'Cargás con el grupo además de con tu partido.',
                outcomes: [
                    { weight: 70, effect: { valoracion: 1, fame: 5, morale: 3, flags: { capitan_interino: 1 } }, resultText: 'Levantás la mano y el vestuario te acompaña. Te queda bien la cinta.' },
                    { weight: 30, effect: { morale: -3, form: -2 }, resultText: 'Te queda grande por ahora: pensando en los otros catorce, tu partido se te escapa.' },
                ],
            },
            {
                id: 'let-be',
                label: 'Dejar que elijan a otro',
                hint: 'Seguís con lo tuyo. La cinta pasa de largo.',
                outcomes: [
                    { weight: 1, effect: { technique: 1, mental: 1, form: 2 }, resultText: 'Preferís no levantar la mano. Jugás liviano y sin discursos.' },
                ],
            },
        ],
    },
];
