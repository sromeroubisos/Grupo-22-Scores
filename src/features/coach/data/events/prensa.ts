// Prensa y comunidad. El diario de la provincia, la radio del pueblo, el barrio.
//
// En el rugby de club la prensa no es nacional: es el que hace el resumen del
// sábado en la radio AM y el que sube los goles al Facebook del club. Pesa poco
// en el resultado y mucho en cómo te miran cuando entrás a la sede.

import type { CoachEvent } from '../../types/event.ts';

export const PRENSA_EVENTS: readonly CoachEvent[] = [
    {
        id: 'pre-la-radio-del-pueblo',
        family: 'prensa',
        title: 'La radio del pueblo',
        text: 'El programa deportivo del sábado a la mañana te quiere todas las semanas quince minutos. Es gratis y es media hora de tu vida.',
        weight: 8,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'ir-siempre',
                label: 'Ir todas las semanas',
                hint: 'El club se hace conocer. Todo lo que digas queda grabado.',
                outcomes: [
                    {
                        weight: 70,
                        effect: { hinchada: 6, socios: 30, reputacion: 2 },
                        resultText:
                            'Quince minutos cada sábado, hablando de rugby y del club. Aparecieron socios nuevos que se enteraron por la radio.',
                    },
                    {
                        weight: 30,
                        effect: { hinchada: 3, presion: 6 },
                        resultText:
                            'Una tarde dijiste algo del arbitraje que no había que decir. Lo levantaron todos y la unión te pidió explicaciones.',
                    },
                ],
            },
            {
                id: 'mandar-al-presidente',
                label: 'Que vaya el presidente del club',
                hint: 'Te sacás la radio de encima. La cara del proyecto es otra.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { hinchada: 2 },
                        resultText: 'Fue el presidente, habló de la sede y del buffet, y del equipo casi no se habló.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pre-el-clasico-en-la-tapa',
        family: 'prensa',
        title: 'La semana del clásico',
        text: 'El diario de la provincia quiere una nota de las dos. El entrenador de enfrente ya declaró que ustedes juegan a romper.',
        weight: 9,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'contestar',
                label: 'Contestarle',
                hint: 'El vestuario se enciende. El clásico se pone bravo.',
                outcomes: [
                    {
                        weight: 55,
                        effect: { cohesion: 7, rating: 1, hinchada: 5 },
                        resultText:
                            'Le contestaste con nombre y apellido. El plantel salió el sábado con una cara que no se le vio en todo el año.',
                    },
                    {
                        weight: 45,
                        effect: { cohesion: 3, injuryRisk: 0.05, hinchada: 4, reputacion: -2 },
                        resultText:
                            'El clásico se jugó al límite de todo. Dos amarillas, un tumulto y dos jugadores lastimados por una pelea que empezó en el diario.',
                    },
                ],
            },
            {
                id: 'no-entrar',
                label: 'No entrar',
                hint: 'No hay ruido. Tampoco hay chispa.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { reputacion: 2, cohesion: -1 },
                        resultText:
                            'Dijiste que se habla en la cancha y cortaste. En el ambiente quedó la idea de que este club no entra en el barro.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pre-la-nota-que-incomoda',
        family: 'prensa',
        title: 'La nota que incomoda',
        text: 'Un periodista escribió que el club vive del M19 porque no puede sostener una primera. Tiene razón y quedó por escrito.',
        weight: 8,
        repeatable: true,
        cooldown: 4,
        requires: { minPressure: 45 },
        options: [
            {
                id: 'darle-la-razon',
                label: 'Darle la razón en público',
                hint: 'Queda bien parado el club. Queda expuesto el proyecto.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { reputacion: 3, presion: 4, hinchada: 2 },
                        resultText:
                            'Dijiste que sí, que el club se sostiene con los pibes, y que es lo único honesto que se puede hacer. La nota se compartió por todos lados.',
                    },
                ],
            },
            {
                id: 'ignorarla',
                label: 'No darle entidad',
                hint: 'Se apaga sola. O no.',
                outcomes: [
                    {
                        weight: 65,
                        effect: {},
                        resultText: 'No la contestó nadie y a la semana ya no se hablaba del tema.',
                    },
                    {
                        weight: 35,
                        effect: { presion: 7, hinchada: -3 },
                        resultText:
                            'El silencio la agrandó. Para el jueves la discutían en la sede y dos socios pidieron una asamblea.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pre-el-barrio-en-la-cancha',
        family: 'prensa',
        title: 'Abrir la cancha al barrio',
        text: 'Se puede abrir el club una tarde por semana para las escuelas de la zona. Ocupa la cancha, ocupa gente y no deja un peso.',
        weight: 7,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'abrirlo',
                label: 'Abrirlo',
                hint: 'El barrio entra al club. La cancha se gasta el doble.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { hinchada: 9, socios: 45, estructura: -3 },
                        resultText:
                            'Doscientos chicos por semana pisando la cancha. El pasto quedó hecho un desastre y la tribuna del sábado no volvió a estar vacía.',
                    },
                ],
            },
            {
                id: 'cuidarla',
                label: 'Cuidar la cancha',
                hint: 'El campo llega impecable a octubre. El barrio sigue afuera.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { estructura: 3, hinchada: -3 },
                        resultText:
                            'La cancha llegó a la definición como una alfombra. En el barrio siguen sin saber bien qué hay adentro del club.',
                    },
                ],
            },
        ],
    },
];
