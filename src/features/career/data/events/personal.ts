import type { GameEvent } from '../../types/event.ts';

export const PERSONAL_EVENTS: GameEvent[] = [
    {
        id: 'per-study-vs-train',
        category: 'personal',
        title: 'Estudio o rugby full time',
        text: 'Sos joven: podés seguir una carrera universitaria o dedicarte de lleno al rugby.',
        weight: 12,
        repeatable: false,
        maxAge: 22,
        options: [
            {
                id: 'fulltime',
                label: 'Rugby full time',
                hint: 'Acelerás tu desarrollo físico.',
                outcomes: [
                    { weight: 1, effect: { power: 2, stamina: 2, technique: 2, flags: { profesional_total: 1 } }, resultText: 'Ponés todo en el rugby. El cuerpo y el juego lo notan.' },
                ],
            },
            {
                id: 'study',
                label: 'Estudiar en paralelo',
                hint: 'Cabeza más amueblada, menos foco físico.',
                outcomes: [
                    { weight: 1, effect: { mental: 4, vision: 2, flags: { estudioso: 1 } }, resultText: 'Combinás estudio y rugby. Ganás herramientas para la vida.' },
                ],
            },
        ],
    },
    {
        id: 'per-family',
        category: 'personal',
        title: 'Formar una familia',
        text: 'Tu pareja quiere dar un paso grande. La familia puede cambiar tus prioridades.',
        weight: 10,
        repeatable: false,
        minAge: 25,
        options: [
            {
                id: 'yes',
                label: 'Priorizar la familia',
                hint: 'Estabilidad emocional, menos noches de gimnasio.',
                outcomes: [
                    { weight: 1, effect: { morale: 10, mental: 2, fatigue: 3, flags: { familia: 1 } }, resultText: 'Formás familia. Jugás con el corazón más lleno.' },
                ],
            },
            {
                id: 'later',
                label: 'Esperar por la carrera',
                hint: 'Foco total, a costa de lo personal.',
                outcomes: [
                    { weight: 1, effect: { technique: 1, stamina: 1, morale: -3 }, resultText: 'Elegís esperar. La cabeza sigue 100% en el rugby.' },
                ],
            },
        ],
    },
    {
        id: 'per-nutrition',
        category: 'personal',
        title: 'Cambio de dieta',
        text: 'Un nutricionista te propone un plan estricto que puede cambiar tu cuerpo.',
        weight: 13,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'strict',
                label: 'Plan estricto',
                hint: 'Mejor físico, disciplina dura.',
                outcomes: [
                    { weight: 1, effect: { stamina: 3, speed: 1, injuryRisk: -4, morale: -2 }, resultText: 'Te ponés riguroso con la comida. El cuerpo responde.' },
                ],
            },
            {
                id: 'balanced',
                label: 'Algo más flexible',
                hint: 'Sostenible, menos impacto.',
                outcomes: [
                    { weight: 1, effect: { stamina: 1, morale: 2 }, resultText: 'Ajustás sin volverte loco. Progreso lento pero disfrutable.' },
                ],
            },
        ],
    },
    {
        id: 'per-nightlife',
        category: 'personal',
        title: 'La noche golpea la puerta',
        text: 'La fama abre puertas. Los amigos te invitan a una vida más movida.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        minAge: 20,
        options: [
            {
                id: 'party',
                label: 'Soltarte un poco',
                hint: 'Disfrutás, pero el cuerpo paga.',
                outcomes: [
                    { weight: 0.5, effect: { morale: 6, fame: 4, fatigue: 6 }, resultText: 'Te divertís y descargás presión. Todo con medida.' },
                    { weight: 0.5, effect: { form: -6, fatigue: 8, injuryRisk: 3, morale: 2 }, resultText: 'Se te va la mano y el rendimiento lo siente.' },
                ],
            },
            {
                id: 'focus',
                label: 'Mantener la disciplina',
                hint: 'Aburrido, pero rinde.',
                outcomes: [
                    { weight: 1, effect: { mental: 2, form: 2, flags: { disciplinado: 1 } }, resultText: 'Elegís descansar y cuidarte. La constancia paga.' },
                ],
            },
        ],
    },
    {
        id: 'per-mentor-childhood',
        category: 'personal',
        title: 'El club que te formó',
        text: 'Tu club de origen te pide una mano: una clínica para los pibes del barrio.',
        weight: 9,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'give-back',
                label: 'Devolver lo recibido',
                hint: 'Te llena el alma y la imagen.',
                outcomes: [
                    { weight: 1, effect: { morale: 6, fame: 4, mental: 1, flags: { arraigo: 1 } }, resultText: 'Volvés a tus raíces. Los pibes no lo olvidan.' },
                ],
            },
            {
                id: 'busy',
                label: 'No tengo tiempo ahora',
                hint: 'Priorizás tu semana.',
                outcomes: [
                    { weight: 1, effect: { morale: -2 }, resultText: 'Lo dejás pasar por agenda. Queda un sabor raro.' },
                ],
            },
        ],
    },
    {
        id: 'per-burnout',
        category: 'personal',
        title: 'Cansancio mental',
        text: 'Venís a mil por hora hace años. La cabeza pide un freno.',
        weight: 10,
        repeatable: true,
        cooldown: 4,
        minAge: 28,
        options: [
            {
                id: 'break',
                label: 'Tomarte un respiro',
                hint: 'Recargás energía y moral.',
                outcomes: [
                    { weight: 1, effect: { morale: 9, fatigue: -12, mental: 2, form: -2 }, resultText: 'Frenás la pelota. Volvés con la cabeza fresca.' },
                ],
            },
            {
                id: 'push',
                label: 'Apretar los dientes',
                hint: 'Seguís, pero te desgastás.',
                outcomes: [
                    { weight: 1, effect: { morale: -5, fatigue: 6, mental: 1 }, resultText: 'Seguís empujando. La cuenta llega tarde o temprano.' },
                ],
            },
        ],
    },
    {
        id: 'per-business',
        category: 'personal',
        title: 'Un negocio fuera del rugby',
        text: 'Te ofrecen entrar en un emprendimiento. Podría distraerte o darte tranquilidad.',
        weight: 8,
        repeatable: false,
        minAge: 29,
        options: [
            {
                id: 'invest',
                label: 'Meterte en el proyecto',
                hint: 'Tranquilidad a futuro, foco dividido.',
                outcomes: [
                    { weight: 0.6, effect: { morale: 5, flags: { emprendedor: 1 } }, resultText: 'Armás tu futuro fuera de la cancha. Jugás más liviano.' },
                    { weight: 0.4, effect: { form: -4, morale: 1 }, resultText: 'El proyecto te come tiempo y te distrae del juego.' },
                ],
            },
            {
                id: 'wait',
                label: 'Todavía no',
                hint: 'Foco total en el rugby.',
                outcomes: [
                    { weight: 1, effect: { technique: 1, mental: 1 }, resultText: 'Preferís esperar al retiro para eso.' },
                ],
            },
        ],
    },
    {
        id: 'per-loyalty-test',
        category: 'personal',
        title: 'Oferta millonaria de una liga menor',
        text: 'Una liga lejana y sin prestigio te ofrece una fortuna para terminar tu carrera allá.',
        weight: 7,
        repeatable: false,
        minAge: 30,
        minOvr: 68,
        options: [
            {
                id: 'money',
                label: 'Ir por la plata',
                hint: 'Asegurás el futuro, resignás nivel.',
                outcomes: [
                    { weight: 1, effect: { fame: -4, morale: 6, mental: -1, flags: { mercenario: 1 } }, resultText: 'Aceptás el cheque. La billetera gana, el prestigio no tanto.' },
                ],
            },
            {
                id: 'legacy',
                label: 'Cuidar tu legado',
                hint: 'Prestigio por sobre la plata.',
                outcomes: [
                    { weight: 1, effect: { fame: 3, mental: 2, flags: { legado: 1 } }, resultText: 'Rechazás la oferta: tu historia vale más que el cheque.' },
                ],
            },
        ],
    },
];
