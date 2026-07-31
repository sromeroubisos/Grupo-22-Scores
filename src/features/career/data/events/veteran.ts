import type { GameEvent } from '../../types/event.ts';

/**
 * EL FINAL DE CARRERA, COMO DECISIÓN.
 *
 * Hasta 1.14.0 la carrera se cerraba sola: `shouldRetire` tiraba un dado contra
 * la edad y te retiraba a los 34 titular, con 81 de OVR y viniendo de ganar una
 * copa. Eso no es un final, es una interrupción.
 *
 * Ahora el retiro es una elección que aparece TODAS las temporadas entre los 34
 * y los 38, y recién a los 39 se fuerza. Este evento es el que la sostiene
 * cuando la temporada no trajo ninguna otra decisión — cuando sí la trajo (el
 * mercado, por ejemplo), la opción de retirarse se agrega a esa (ver
 * `engine/retirement.ts`).
 *
 * Las dos opciones cuestan algo, como cualquier decisión del juego: seguir es
 * más caps y más partidos a cambio de OVR y de riesgo; retirarse es cerrar en lo
 * más alto a cambio de todo lo que faltaba.
 */
export const VETERAN_END_OF_SEASON_ID = 'vet-end-of-season';

export const VETERAN_EVENTS: GameEvent[] = [
    {
        id: VETERAN_END_OF_SEASON_ID,
        category: 'personal',
        title: 'Fin de temporada',
        text: 'El cuerpo tarda más en volver y la pretemporada se hace larga. Hay que decidir si va otro año.',
        // Peso alto pero no exclusivo: si el mercado abre, manda el mercado y la
        // opción de retirarse viaja con él.
        weight: 9,
        repeatable: true,
        requires: { minAge: 34, maxAge: 38 },
        options: [
            {
                id: 'one-more-year',
                label: 'Seguir un año más',
                hint: 'Más caps y más partidos. El OVR va a seguir bajando y el riesgo de lesión sube.',
                outcomes: [
                    {
                        weight: 3,
                        effect: { morale: 4, fatigue: 6, injuryRisk: 4 },
                        resultText: 'Firmás una temporada más. El cuerpo protesta en cada pretemporada, pero seguís entrando.',
                    },
                    {
                        weight: 1,
                        effect: { morale: 6, form: 4, fatigue: 8, injuryRisk: 6 },
                        resultText: 'Seguís, y el cuerpo técnico te pone de referente del plantel. Se paga con carga.',
                    },
                ],
            },
            {
                id: 'retire-now',
                label: 'Retirarte ahora',
                hint: 'Cerrás en lo más alto. Te quedás con lo que tenés.',
                outcomes: [
                    {
                        weight: 1,
                        effect: { retire: true },
                        resultText: 'Anunciás el retiro con la temporada terminada y el plantel de pie.',
                    },
                ],
            },
        ],
    },
];
