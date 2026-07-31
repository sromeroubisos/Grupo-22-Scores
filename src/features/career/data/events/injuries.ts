import type { GameEvent } from '../../types/event.ts';

export const INJURY_EVENTS: GameEvent[] = [
    {
        id: 'inj-rush-return',
        category: 'injury',
        title: 'Volver antes de tiempo',
        text: 'Venís de una molestia y el club te necesita para un partido clave. ¿Forzás la vuelta?',
        weight: 12,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'rush',
                label: 'Apurar la vuelta',
                hint: 'Ayudás al equipo, arriesgás recaída.',
                outcomes: [
                    { weight: 0.5, effect: { fame: 4, morale: 4 }, resultText: 'Aguantás y respondés. El club te lo agradece.' },
                    { weight: 0.5, effect: { forceInjury: { name: 'Recaída muscular', severity: 'moderada', seasonsOut: 0.3 }, injuryRisk: 6 }, resultText: 'Volviste verde y recaés. Peor el remedio que la enfermedad.' },
                ],
            },
            {
                id: 'wait',
                label: 'Respetar los tiempos',
                hint: 'Cuidás el cuerpo, perdés el partido.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -4, morale: -2 }, resultText: 'Te tomás la recuperación con calma. Volvés entero.' },
                ],
            },
        ],
    },
    {
        id: 'inj-rehab-invest',
        category: 'injury',
        title: 'Kinesiólogo propio',
        text: 'Podés invertir en un equipo de recuperación personal para cuidarte todo el año.',
        weight: 9,
        repeatable: false,
        minAge: 26,
        options: [
            {
                id: 'invest',
                label: 'Invertir en tu cuerpo',
                hint: 'Baja el riesgo de lesión de por vida.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -12, stamina: 0, morale: 3 }, resultText: 'Armás tu equipo de recuperación. Tu cuerpo lo agradece.' },
                ],
            },
            {
                id: 'skip',
                label: 'Dejarlo al club',
                hint: 'Ahorrás, pero seguís expuesto.',
                outcomes: [
                    { weight: 1, effect: {}, resultText: 'Confiás en la estructura del club. Seguís como venías.' },
                ],
            },
        ],
    },
    {
        id: 'inj-concussion-protocol',
        category: 'injury',
        title: 'Protocolo de conmoción',
        text: 'Recibiste un golpe fuerte en la cabeza. El protocolo dice descansar; vos querés seguir.',
        weight: 8,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'respect',
                label: 'Respetar el protocolo',
                hint: 'Lo más sano, siempre.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -3, mental: 1 }, resultText: 'Parás. La cabeza no se negocia.' },
                ],
            },
            {
                id: 'hide',
                label: 'Ocultar los síntomas',
                hint: 'Muy arriesgado.',
                outcomes: [
                    { weight: 0.6, effect: { fame: 2, morale: 2 }, resultText: 'Zafás y seguís jugando, aunque no fue lo más inteligente.' },
                    { weight: 0.4, effect: { forceInjury: { name: 'Conmoción reiterada', severity: 'grave', seasonsOut: 0.5 }, injuryRisk: 10 }, resultText: 'La cabeza te pasa factura. Lesión grave y un susto enorme.' },
                ],
            },
        ],
    },
    {
        id: 'inj-surgery-decision',
        category: 'injury',
        title: 'Operarte o convivir',
        text: 'Arrastrás una lesión que no termina de irse. Los médicos ofrecen operar.',
        weight: 7,
        repeatable: false,
        minAge: 28,
        requiresFlags: [],
        options: [
            {
                id: 'surgery',
                label: 'Operarte ahora',
                hint: 'Perdés media temporada, volvés mejor.',
                outcomes: [
                    { weight: 1, effect: { forceInjury: { name: 'Cirugía programada', severity: 'moderada', seasonsOut: 0.4 }, injuryRisk: -14 }, resultText: 'Pasás por el quirófano. Duele, pero volvés sin la molestia.' },
                ],
            },
            {
                id: 'manage',
                label: 'Convivir con la molestia',
                hint: 'Seguís jugando, pero con riesgo.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: 8, morale: -2 }, resultText: 'Elegís seguir jugando con la molestia a cuestas.' },
                ],
            },
        ],
    },
    {
        id: 'inj-load-management',
        category: 'injury',
        title: 'Gestión de carga',
        text: 'El cuerpo médico propone rotarte para dosificarte durante la temporada.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        minAge: 31,
        options: [
            {
                id: 'rotate',
                label: 'Aceptar la rotación',
                hint: 'Sin sorpresas: menos desgaste y menos protagonismo.',
                outcomes: [
                    { weight: 1, effect: { fatigue: -10, injuryRisk: -5, playingTime: -1, morale: -2 }, resultText: 'Dosificás minutos. Llegás más entero al final del año, jugando menos.' },
                ],
            },
            {
                id: 'all-in',
                label: 'Jugar todo',
                // La APUESTA de este evento: aceptar la rotación mantiene lo que hay,
                // jugar todo se arriesga a mejorar o a empeorar. Los pesos son la
                // chance del jugador PROMEDIO — con más media el desenlace bueno se
                // vuelve más probable y con menos, menos (`outcomeWeights`).
                hint: 'Te la juegas: a esta edad el cuerpo puede responder o pasarte la factura.',
                outcomes: [
                    { weight: 55, effect: { stamina: 3, power: 2, playingTime: 2, fame: 3, fatigue: 8 }, resultText: 'Jugás absolutamente todo y el cuerpo aguanta. Terminás el año como referente del plantel.' },
                    { weight: 45, effect: { stamina: -2, form: -6, fatigue: 14, injuryRisk: 8 }, resultText: 'Jugás absolutamente todo y lo pagás: llegás fundido a la última parte del año.' },
                ],
            },
        ],
    },
    {
        id: 'inj-comeback-story',
        category: 'injury',
        title: 'La vuelta después de la grave',
        text: 'Volvés de una lesión grave. La cabeza pesa más que la rodilla.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        requiresFlags: [],
        condition: (ctx) => ctx.state.player.injuries.some((i) => i.severity === 'grave'),
        options: [
            {
                id: 'brave',
                label: 'Volver sin miedo',
                hint: 'Recuperás confianza y forma.',
                outcomes: [
                    { weight: 0.7, effect: { morale: 8, form: 6, mental: 2 }, resultText: 'Volvés a entrar sin especular. El miedo se va jugando.' },
                    { weight: 0.3, effect: { morale: -3, injuryRisk: 4 }, resultText: 'Volvés tenso; el cuerpo todavía no responde como antes.' },
                ],
            },
            {
                id: 'cautious',
                label: 'Volver de a poco',
                hint: 'Seguro pero lento.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -6, form: -2, mental: 1 }, resultText: 'Sumás minutos de a poco, cuidándote de más.' },
                ],
            },
        ],
    },
    // ── La molestia de esta semana ───────────────────────────────────────────
    // El cuerpo avisando ANTES del partido, que es la versión más común de la
    // lesión y la que el pool no tenía: no la lesión ya ocurrida, sino la
    // decisión de arriesgarla.
    {
        id: 'inj-derby-niggle',
        category: 'injury',
        title: 'Una molestia antes del clásico',
        text: 'Arrastrás un tirón en el aductor desde el martes. El kinesiólogo levanta las cejas y el partido es el domingo.',
        weight: 12,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'play',
                label: 'Jugar igual',
                hint: 'Es el clásico. Si aguanta, sos parte.',
                outcomes: [
                    { weight: 70, effect: { statBoost: { tries: 1 }, fame: 4, morale: 4 }, resultText: 'Aguanta los ochenta minutos y encima apoyás. El clásico se cuenta con tu nombre.' },
                    { weight: 30, effect: { forceInjury: { name: 'Desgarro de aductor', severity: 'moderada', seasonsOut: 0.25 }, morale: -4 }, resultText: 'A los treinta minutos el aductor se corta del todo. Salís caminando despacio.' },
                ],
            },
            {
                id: 'rest',
                label: 'Parar esta semana',
                hint: 'Llegás entero al resto del año. Te perdés el clásico.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -4, playingTime: -1, morale: -3 }, resultText: 'Avisás que no llegás. Lo ves por televisión con hielo en la pierna.' },
                ],
            },
        ],
    },
    {
        id: 'inj-hamstring-warmup',
        category: 'injury',
        title: 'Un pinchazo en el calentamiento',
        text: 'Faltan diez minutos para salir y sentís un pinchazo en el isquiotibial. Nadie lo vio.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'tell',
                label: 'Avisar al médico',
                hint: 'Te bajás del partido y te ahorrás lo grave.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -5, playingTime: -1, mental: 1 }, resultText: 'Levantás la mano antes de salir. El isquiotibial se queda en un susto.' },
                ],
            },
            {
                id: 'hide',
                label: 'Salir a jugar igual',
                hint: 'Nadie se entera. El isquiotibial sí.',
                outcomes: [
                    { weight: 55, effect: { form: 3, mental: 2 }, resultText: 'Sale bien: entrás en calor de nuevo y el pinchazo no vuelve.' },
                    { weight: 45, effect: { forceInjury: { name: 'Desgarro de isquiotibial', severity: 'grave', seasonsOut: 0.45 }, morale: -6 }, resultText: 'A los diez minutos se rompe en una corrida. Ese pinchazo era el aviso.' },
                ],
            },
        ],
    },
    {
        id: 'inj-physical-prep',
        category: 'injury',
        title: 'Cambiar la preparación física',
        text: 'El preparador te ofrece un plan más exigente que el del plantel. Más carga, menos margen de recuperación.',
        weight: 10,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'harder',
                label: 'Entrenar más fuerte',
                hint: 'Ganás en el cuerpo. El riesgo de romperte sube.',
                outcomes: [
                    // Misma medición que `per-summer-coach`: la ⭐ de una tarjeta
                    // se queda en +1. Lo que sube el plan exigente es el techo de
                    // la temporada, no un regalo de OVR.
                    { weight: 70, effect: { valoracion: 1, stamina: 2, fatigue: 5 }, resultText: 'El plan rinde: llegás a fin de año más fuerte que nunca.' },
                    { weight: 30, effect: { forceInjury: { name: 'Sobrecarga de cuádriceps', severity: 'leve', seasonsOut: 0.15 }, injuryRisk: 5 }, resultText: 'El cuerpo no llega a asimilar la carga y te agarra una sobrecarga.' },
                ],
            },
            {
                id: 'keep-plan',
                label: 'Mantener el plan del plantel',
                hint: 'Sin sobresaltos y sin saltos.',
                outcomes: [
                    { weight: 1, effect: { injuryRisk: -3, mental: 1, stamina: 1 }, resultText: 'Seguís el plan de todos. Nada espectacular, nada roto.' },
                ],
            },
        ],
    },
];
