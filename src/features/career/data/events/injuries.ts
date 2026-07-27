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
                hint: 'Menos desgaste, menos protagonismo.',
                outcomes: [
                    { weight: 1, effect: { fatigue: -10, injuryRisk: -5, morale: -2 }, resultText: 'Dosificás minutos. Llegás más entero al final del año.' },
                ],
            },
            {
                id: 'all-in',
                label: 'Jugar todo',
                hint: 'Protagonismo total, más desgaste.',
                outcomes: [
                    { weight: 1, effect: { fatigue: 8, fame: 3, injuryRisk: 4 }, resultText: 'Jugás absolutamente todo. El cuerpo lo va a sentir.' },
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
];
