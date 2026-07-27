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
];
