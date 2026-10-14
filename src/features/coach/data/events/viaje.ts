// Viajes y logística. La familia que no existe en ningún otro juego de deportes.
//
// Clasificar al Torneo del Interior es deportivamente glorioso y económicamente
// un problema: hay que llevar veintiséis personas a Tucumán tres fines de
// semana. "Ganamos, y ahora cómo pagamos el micro" es la médula del rugby de
// club argentino y es la decisión estrella de la primera temporada.

import type { CoachEvent } from '../../types/event.ts';

export const VIAJE_EVENTS: readonly CoachEvent[] = [
    {
        id: 'via-micro-al-interior',
        family: 'viaje',
        title: 'El micro al Interior',
        text: 'Clasificaron al Torneo del Interior. La subcomisión hizo números sobre la mesa del buffet: el viaje se come cuatro meses de cuotas.',
        weight: 12,
        repeatable: true,
        cooldown: 2,
        requires: { requiresTdi: true },
        options: [
            {
                id: 'poner-la-plata',
                label: 'Poner la plata igual',
                hint: 'Se vacía la caja. El plantel viaja completo y lo sabe.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.35, cohesion: 6, hinchada: 4 },
                        resultText:
                            'Se pagó todo del club. El plantel subió al micro sabiendo lo que costó, y eso también se juega.',
                    },
                ],
            },
            {
                id: 'rifa-y-asado',
                label: 'Rifa y asado a beneficio',
                hint: 'Menos plata del club, pero dos semanas con la cabeza en otra cosa.',
                outcomes: [
                    {
                        weight: 65,
                        effect: { cajaPct: -0.1, hinchada: 6, presion: 4 },
                        resultText:
                            'Se llenó la sede. Entre la rifa y los choripanes salió casi todo el micro, y el barrio se metió en el torneo.',
                    },
                    {
                        weight: 35,
                        effect: { cajaPct: -0.25, hinchada: 2, presion: 4 },
                        resultText: 'Llovió el sábado del asado. Juntaron menos de la mitad y el resto lo puso el club.',
                    },
                ],
            },
            {
                id: 'viajar-corto',
                label: 'Viajar con veintidós',
                hint: 'Se abarata el micro. El banco se queda sin primera línea de recambio.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.2, bancoCorto: true, cohesion: -4 },
                        resultText:
                            'Cuatro se quedaron en el club. Ahorraron el pasaje y perdieron el banco: si se lesiona un pilar, hay scrums simulados.',
                    },
                ],
            },
        ],
    },
    {
        id: 'via-fecha-suspendida',
        family: 'viaje',
        title: 'Se llovió la cancha',
        text: 'Cayó agua toda la semana y el campo de juego es un barrial. La unión te deja elegir: se juega igual o se reprograma para el martes.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'jugar-igual',
                label: 'Jugar igual',
                hint: 'Con la cancha así el partido se empareja. Y alguien se puede lastimar.',
                outcomes: [
                    {
                        weight: 60,
                        effect: { rating: -1, injuryRisk: 0.03 },
                        resultText:
                            'Se jugó en el barro. Ochenta minutos de scrum y line, y el que tenía mejores backs se quedó sin ellos.',
                    },
                    {
                        weight: 40,
                        effect: { rating: -1, injuryRisk: 0.06, cohesion: 3 },
                        resultText:
                            'Se jugó, y el equipo se dejó todo en el barro. Salieron enteros de milagro y el vestuario quedó a full.',
                    },
                ],
            },
            {
                id: 'reprogramar',
                label: 'Reprogramar para el martes',
                hint: 'Cancha en condiciones, pero medio plantel labura el miércoles.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: -900_000, cohesion: -3 },
                        resultText:
                            'Se jugó el martes a la noche con luz artificial. Cinco pidieron el día en el laburo y dos no pudieron.',
                    },
                ],
            },
        ],
    },
    {
        id: 'via-micro-roto',
        family: 'viaje',
        title: 'El micro quedó en la ruta',
        text: 'Se rompió la caja del micro a ciento veinte kilómetros. El partido es en tres horas.',
        weight: 6,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'combis',
                label: 'Alquilar combis y llegar como sea',
                hint: 'Llegan. Y sale lo que sale.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: -1_800_000, rating: -1, cohesion: 4 },
                        resultText:
                            'Llegaron cuarenta minutos tarde, sin entrar en calor y con la cabeza en otro lado. Pero llegaron, y el grupo lo cuenta hasta hoy.',
                    },
                ],
            },
            {
                id: 'no-presentarse',
                label: 'Avisar que no se presentan',
                hint: 'Puntos perdidos y la unión toma nota.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { presion: 8, reputacion: -3, hinchada: -4 },
                        resultText:
                            'Se dio por perdido. La unión aplicó el reglamento y en el club nadie quedó contento con la decisión.',
                    },
                ],
            },
        ],
    },
    {
        id: 'via-gira-de-pretemporada',
        family: 'viaje',
        title: 'Gira de pretemporada',
        text: 'Un club del sur invita a jugar dos amistosos en febrero. Es lejos, es plata, y es la única semana del año en que el plantel convive.',
        weight: 7,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'ir',
                label: 'Ir',
                hint: 'Cuesta caro. Vuelven siendo un equipo.',
                outcomes: [
                    {
                        weight: 75,
                        effect: { cajaPct: -0.18, cohesion: 9, rating: 1 },
                        resultText:
                            'Cuatro días juntos, dos partidos y un asado. Volvieron distintos: eso no se entrena un martes a la noche.',
                    },
                    {
                        weight: 25,
                        effect: { cajaPct: -0.18, cohesion: 4, injuryRisk: 0.04 },
                        resultText: 'Buena semana, pero volvieron con dos tocados de una cancha durísima.',
                    },
                ],
            },
            {
                id: 'quedarse',
                label: 'Quedarse y entrenar en casa',
                hint: 'La caja no se toca. La pretemporada es una más.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cohesion: -2 },
                        resultText: 'Pretemporada en el club, como todos los años. Nadie se quejó y nadie se entusiasmó.',
                    },
                ],
            },
        ],
    },
];
