// EL CAPITÁN — eventos personales. Prefijo `per-`.
//
// El conflicto real del rugby amateur argentino y el que ningún juego modeló:
// el jugador es socio, paga la cuota y compite contra su propio trabajo o su
// facultad por las mismas horas. La investigación sobre el rugby argentino lo
// describe como la fricción entre unas expectativas familiares que rechazan la
// mercantilización y el deseo propio de una carrera profesional. Eso es esto.

import type { CaptainEvent } from '../../types/event.ts';

export const PERSONAL_EVENTS: CaptainEvent[] = [
    {
        id: 'per-trabajo-y-entrenamiento',
        category: 'personal',
        title: 'Trabajo y entrenamiento',
        text: 'El laburo te pisa los horarios de entrenamiento. Llegás tarde los martes y los jueves directamente no llegás. Algo tenés que resignar.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        requires: { stage: ['amateur'] },
        options: [
            {
                id: 'priorizar-el-rugby',
                label: 'Priorizar el rugby',
                hint: 'Entrenás completo. Menos horas, menos ingresos.',
                outcomes: [
                    { weight: 70, effect: { playingTime: 1, attrs: { aguante: 2 } }, resultText: 'Cambiaste el turno y llegaste a todos los entrenamientos. Se notó en la última media hora de cada partido.' },
                    { weight: 30, effect: { playingTime: 1, flags: { 'roce-laboral': 1 } }, resultText: 'Llegaste a entrenar todo el año. En el trabajo te pasaron a un puesto peor.' },
                ],
            },
            {
                id: 'cumplir-con-el-trabajo',
                label: 'Cumplir con el trabajo',
                hint: 'Estabilidad. El físico lo vas a pagar en agosto.',
                outcomes: [
                    { weight: 100, effect: { playingTime: -1, attrs: { aguante: -1 } }, resultText: 'Cumpliste en el trabajo y entrenaste lo que pudiste. En agosto se te fueron las piernas antes que a los demás.' },
                ],
            },
        ],
    },

    {
        id: 'per-la-facultad',
        category: 'personal',
        title: 'La semana del final',
        text: 'Tenés final el jueves y semifinal el sábado. La materia la debés hace dos años.',
        weight: 7,
        repeatable: true,
        cooldown: 5,
        requires: { stage: ['amateur'], maxAge: 27 },
        options: [
            {
                id: 'darlo',
                label: 'Darlo',
                hint: 'Te sacás la materia de encima. Llegás fundido al sábado.',
                outcomes: [
                    { weight: 60, effect: { attrs: { vision: 2 }, playingTime: -1 }, resultText: 'Aprobaste el jueves y el sábado jugaste dormido. Te sacaron a los cincuenta.' },
                    { weight: 40, effect: { attrs: { vision: 1 } }, resultText: 'Aprobaste el jueves y el sábado jugaste igual. No sabés de dónde lo sacaste.' },
                ],
            },
            {
                id: 'dejarlo-para-julio',
                label: 'Dejarlo para julio',
                hint: 'Llegás entero a la semifinal. La materia sigue ahí.',
                outcomes: [
                    { weight: 100, effect: { playingTime: 1, attrs: { vision: -1 } }, resultText: 'No lo diste. Jugaste la semifinal completa y la materia quedó para el año que viene, otra vez.' },
                ],
            },
        ],
    },

    {
        id: 'per-la-casa',
        category: 'personal',
        title: 'En casa',
        text: 'Te reclaman los sábados. Hace tres años que no estás en un cumpleaños, y esta vez lo dijeron en voz alta.',
        weight: 7,
        repeatable: true,
        cooldown: 6,
        requires: { minSeasons: 3 },
        options: [
            {
                id: 'bancar-la-familia',
                label: 'Estar',
                hint: 'La cabeza queda tranquila. Te perdés dos fechas.',
                outcomes: [
                    { weight: 100, effect: { playingTime: -1, body: -8, attrs: { liderazgo: 1 } }, resultText: 'Te perdiste dos fechas y las recuperaste en casa. Volviste con la cabeza en otro lado, en el buen sentido.' },
                ],
            },
            {
                id: 'seguir-igual',
                label: 'Seguir igual',
                hint: 'No resignás nada del rugby. Alguien lo va a resignar por vos.',
                outcomes: [
                    { weight: 55, effect: { playingTime: 1 }, resultText: 'Seguiste con la rutina de siempre. Lo hablaron y quedó en la nada.' },
                    { weight: 45, effect: { playingTime: 1, attrs: { liderazgo: -2 }, flags: { 'desgaste-familiar': 1 } }, resultText: 'Seguiste con la rutina de siempre. En casa dejaron de preguntarte cómo salió el partido.' },
                ],
            },
        ],
    },

    {
        id: 'per-mudanza',
        category: 'personal',
        title: 'El laburo bueno',
        text: 'Te ofrecen un puesto en otra provincia. Es el doble de sueldo y es el trabajo que estudiaste. Queda a ochocientos kilómetros de tu club.',
        weight: 5,
        repeatable: false,
        requires: { stage: ['amateur'], minAge: 23, maxAge: 30 },
        options: [
            {
                id: 'irte',
                label: 'Irte',
                hint: 'La vida se te acomoda. El club queda a ochocientos kilómetros.',
                outcomes: [
                    { weight: 100, effect: { belonging: -8, attrs: { vision: 2 } }, resultText: 'Te mudaste y te fichaste en un club de allá. Al tuyo volvés en las fiestas, como visita.' },
                ],
            },
            {
                id: 'quedarte',
                label: 'Quedarte',
                hint: 'Seguís en el club de toda la vida. El puesto se lo dan a otro.',
                outcomes: [
                    { weight: 100, effect: { belonging: 4 }, resultText: 'Dijiste que no. En el club se enteraron y nadie te lo dijo de frente, pero se enteraron todos.' },
                ],
            },
        ],
    },
];
