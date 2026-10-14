// El plantel y el vestuario, y sobre todo LOS QUE SE VAN.
//
// En el rugby de clubes no hay mercado de pases: no comprás a nadie y no cobrás
// por nadie. Lo que existe es la RETENCIÓN. Cada temporada tres o cuatro
// jugadores reciben una tentación —la beca, el laburo en otra provincia, la
// oferta de un club de arriba, la lesión que lo hace colgar los botines— y tu
// decisión no es cuánto pagás: es qué le ofrecés. Minutos, la capitanía, el
// puesto que quiere, o dejarlo ir en buenos términos para que vuelva en dos años.

import type { CoachEvent } from '../../types/event.ts';

export const PLANTEL_EVENTS: readonly CoachEvent[] = [
    {
        id: 'pla-apertura-se-va-a-estudiar',
        family: 'plantel',
        title: 'El apertura se va a estudiar',
        text: 'Le dieron la beca en Córdoba y arranca en marzo. Es tu único pateador de verdad.',
        weight: 11,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'dejarlo-ir',
                label: 'Dejarlo ir',
                hint: 'Perdés al jugador. El club queda bien y el vestuario lo ve.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { pierdeMejor: true, estructura: 2, cohesion: 4, reputacion: 1 },
                        resultText:
                            'Se fue con la camiseta puesta y el club le hizo el aguante. En el vestuario quedó claro que acá a nadie se lo retiene a la fuerza.',
                    },
                ],
            },
            {
                id: 'que-viaje',
                label: 'Pedirle que viaje los sábados',
                hint: 'Puede quedarse. Va a llegar cansado a todos los partidos.',
                outcomes: [
                    {
                        weight: 55,
                        effect: { rating: -1, cohesion: 2 },
                        resultText:
                            'Se quedó. Viaja diez horas cada fin de semana y se le nota en la segunda mitad de cada partido.',
                    },
                    {
                        weight: 45,
                        effect: { pierdeMejor: true, cohesion: -5 },
                        resultText: 'Aguantó cuatro fechas y no dio más. Se fue igual, y esta vez sin saludar a nadie.',
                    },
                ],
            },
            {
                id: 'bancarle-el-alquiler',
                label: 'Bancarle el alquiler',
                hint: 'Se queda entero. La caja lo paga todo el año.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.18, cohesion: 2 },
                        resultText:
                            'El club le paga la pieza cerca de la facultad. Entrena martes y jueves y juega los sábados como si nada.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-oferta-de-arriba',
        family: 'plantel',
        title: 'Lo vienen a buscar de arriba',
        text: 'Un club de la categoría superior quiere a tu mejor jugador. No hay plata de por medio: hay una camiseta más grande.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        requires: { minLevel: 3 },
        options: [
            {
                id: 'no-lo-suelto',
                label: 'Pedirle que se quede un año más',
                hint: 'Podés convencerlo. Si no, se va enojado.',
                outcomes: [
                    {
                        weight: 50,
                        effect: { cohesion: 5, rating: 1 },
                        resultText: 'Se quedó. Dijo que quiere subir con este club y no con otro, y lo dijo delante de todos.',
                    },
                    {
                        weight: 50,
                        effect: { pierdeMejor: true, cohesion: -6, presion: 5 },
                        resultText:
                            'Se fue igual, y con la sensación de que el club le puso un palo en la rueda. No se saludan más.',
                    },
                ],
            },
            {
                id: 'dejarlo-ir-bien',
                label: 'Dejarlo ir en buenos términos',
                hint: 'Lo perdés ya. En dos años puede volver.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { pierdeMejor: true, reputacion: 2, hinchada: 2, flags: { puedeVolver: 1 } },
                        resultText: 'Se fue con un asado de despedida. Dejó dicho que cuando termine allá, vuelve acá.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-capitania',
        family: 'plantel',
        title: 'La cinta de capitán',
        text: 'Se fue el capitán de los últimos seis años. Hay dos candidatos y el vestuario está partido.',
        weight: 9,
        repeatable: true,
        cooldown: 5,
        requires: { minSeason: 2 },
        options: [
            {
                id: 'el-veterano',
                label: 'El veterano del pack',
                hint: 'Nadie discute. Tampoco cambia nada.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cohesion: 4, jugador: { delta: 1, target: 'mejor' } },
                        resultText:
                            'La cinta fue para el segunda línea de siempre. Es la decisión que todos esperaban y funciona como siempre funcionó.',
                    },
                ],
            },
            {
                id: 'el-pibe',
                label: 'El nueve de veintitrés',
                hint: 'Apostás a diez años. Este año se puede complicar.',
                outcomes: [
                    {
                        weight: 55,
                        effect: { cohesion: 6, jugador: { delta: 3, target: 'joven', potencial: 3 }, reputacion: 2 },
                        resultText:
                            'Le quedó grande dos fechas y después le quedó justa. El club tiene capitán para la próxima década.',
                    },
                    {
                        weight: 45,
                        effect: { cohesion: -7, presion: 6 },
                        resultText:
                            'Le pesó. Los grandes del plantel no lo terminaron de aceptar y el vestuario se partió en dos.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-el-que-vuelve',
        family: 'plantel',
        title: 'El que volvió de Buenos Aires',
        text: 'Se recibió, volvió al pueblo y quiere jugar. Tiene veintiocho, jugó cuatro años en una categoría más alta y hace dos que no toca una pelota.',
        weight: 9,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'titular-de-una',
                label: 'Ponerlo de titular de entrada',
                hint: 'Sube el nivel. Y desplaza a uno que estuvo todo el verano.',
                outcomes: [
                    {
                        weight: 65,
                        effect: { jugador: { delta: 6, target: 'peor' }, cohesion: -4 },
                        resultText:
                            'Entró y se notó desde el primer line. También se notó la cara del que perdió el puesto sin haber jugado mal.',
                    },
                    {
                        weight: 35,
                        effect: { jugador: { delta: 2, target: 'peor' }, cohesion: -6, presion: 4 },
                        resultText:
                            'Llegó más lejos de lo que creía. Le costó tres fechas agarrar ritmo y el vestuario ya había tomado partido.',
                    },
                ],
            },
            {
                id: 'de-a-poco',
                label: 'Meterlo de a poco desde el banco',
                hint: 'Nadie se queja. Tarda medio torneo en rendir.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { jugador: { delta: 3, target: 'peor' }, cohesion: 2 },
                        resultText:
                            'Entró veinte minutos por fecha hasta agarrar estado. Para la segunda rueda ya era titular sin que nadie lo discutiera.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-vestuario-partido',
        family: 'plantel',
        title: 'El vestuario está partido',
        text: 'Hay dos grupos y no se hablan: los del club de toda la vida y los que llegaron en los últimos dos años. Se ve en el calentamiento.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        requires: { minSeason: 2 },
        options: [
            {
                id: 'charla-de-frente',
                label: 'Sentarlos a todos y hablarlo',
                hint: 'Se arregla o se rompe del todo. No hay término medio.',
                outcomes: [
                    {
                        weight: 60,
                        effect: { cohesion: 12 },
                        resultText: 'Dos horas de vestuario con la puerta cerrada. Salieron distintos, y el sábado se vio.',
                    },
                    {
                        weight: 40,
                        effect: { cohesion: -8, presion: 5 },
                        resultText:
                            'Salió todo a la luz y nadie retrocedió. Ahora además de partido, el vestuario está lastimado.',
                    },
                ],
            },
            {
                id: 'cortar-por-lo-sano',
                label: 'Sacar del plantel al que enciende la mecha',
                hint: 'Se ordena rápido. Perdés un jugador.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { pierdeMejor: true, cohesion: 7, presion: 3 },
                        resultText:
                            'Se fue el que tiraba el fósforo, que además era de los mejores. El grupo se ordenó y el equipo perdió una pieza.',
                    },
                ],
            },
            {
                id: 'dejar-que-decante',
                label: 'Dejar que se acomode solo',
                hint: 'No gastás capital. Puede seguir igual todo el año.',
                outcomes: [
                    {
                        weight: 45,
                        effect: { cohesion: 3 },
                        resultText:
                            'Se acomodó solo después de ganar dos seguidas. A veces la tabla arregla lo que no arregla una charla.',
                    },
                    {
                        weight: 55,
                        effect: { cohesion: -6 },
                        resultText: 'Siguió igual toda la temporada. Se entrena bien y se juega a la mitad.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-el-laburo-lo-gana',
        family: 'plantel',
        title: 'El laburo le gana al rugby',
        text: 'Tres del plantel entraron a trabajar en turnos rotativos. Uno de cada tres sábados no van a estar.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'entrenar-domingo',
                label: 'Mover el entrenamiento al domingo a la mañana',
                hint: 'Los recuperás. El resto del plantel resigna el domingo.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: 1, cohesion: -4 },
                        resultText:
                            'Se entrena domingo a las nueve. Los tres del turno están y a los otros veintitrés se les fue el fin de semana.',
                    },
                ],
            },
            {
                id: 'bancarlos',
                label: 'Bancarlos con lo que puedan dar',
                hint: 'Nadie resigna nada. El equipo cambia todas las fechas.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -1, cohesion: 5 },
                        resultText:
                            'Juegan cuando pueden. La formación cambia cada sábado y el grupo entendió que acá nadie elige entre el club y el laburo.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-primera-linea-veterano',
        family: 'plantel',
        title: 'El pilar de treinta y siete',
        text: 'Sigue siendo el único con certificación de primera línea que tiene oficio. Y ya no llega a los sesenta minutos.',
        weight: 8,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'exprimirlo',
                label: 'Que juegue todo lo que aguante',
                hint: 'El scrum se sostiene. El cuerpo pasa factura.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: 1, injuryRisk: 0.06 },
                        resultText:
                            'Juega los ochenta cada sábado y el scrum es del club. Cada lunes le duele algo distinto.',
                    },
                ],
            },
            {
                id: 'que-forme',
                label: 'Ponerlo a formar al que viene atrás',
                hint: 'El scrum se resiente ahora. Queda uno certificado para después.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -1, certificaPrimeraLinea: true, cohesion: 3 },
                        resultText:
                            'Juega cuarenta minutos y los otros cuarenta los pasa al lado del pibe. En junio el pibe sacó la certificación.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-refuerzo-del-vecino',
        family: 'plantel',
        title: 'Se acercó uno del club de al lado',
        text: 'Se peleó con el entrenador de enfrente y quiere jugar acá. Es bueno, y es del clásico.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'sumarlo',
                label: 'Sumarlo',
                hint: 'El equipo mejora. El clásico se pone áspero.',
                outcomes: [
                    {
                        weight: 70,
                        effect: { jugador: { delta: 5, target: 'peor' }, hinchada: -4, cohesion: -2 },
                        resultText:
                            'Se sumó y rinde. En la tribuna del clásico le van a cantar todo el partido, y él lo sabe.',
                    },
                    {
                        weight: 30,
                        effect: { jugador: { delta: 5, target: 'peor' }, hinchada: -8, presion: 5 },
                        resultText:
                            'Se sumó y el barrio lo tomó peor de lo que pensabas. Dos socios se dieron de baja por carta.',
                    },
                ],
            },
            {
                id: 'no-abrirle-la-puerta',
                label: 'No abrirle la puerta',
                hint: 'El club queda por encima. El equipo queda igual.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { hinchada: 4, reputacion: 1 },
                        resultText:
                            'Le dijiste que hable primero con su club. Terminó quedándose allá y en el barrio te lo reconocieron.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-el-que-cuelga-los-botines',
        family: 'plantel',
        title: 'El que cuelga los botines',
        text: 'Trece temporadas en primera. Avisó que esta es la última y todavía es titular.',
        weight: 7,
        repeatable: true,
        cooldown: 5,
        requires: { minSeason: 3 },
        options: [
            {
                id: 'que-siga-jugando',
                label: 'Que la juegue entera',
                hint: 'Se despide en la cancha. El que venía atrás espera un año más.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cohesion: 6, hinchada: 4, rating: -1 },
                        resultText:
                            'Jugó las dieciocho fechas. En la última lo despidieron de pie y el club entero se quedó al tercer tiempo.',
                    },
                ],
            },
            {
                id: 'que-sea-entrenador',
                label: 'Ofrecerle empezar a entrenar al M19',
                hint: 'El club gana un formador. Perdés un titular ya.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { estructura: 5, jugador: { delta: 3, target: 'joven', potencial: 4 }, cohesion: 3 },
                        resultText:
                            'Colgó los botines en marzo y agarró el M19. En tres meses se le nota la mano a la categoría.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-doble-turno',
        family: 'plantel',
        title: 'Doble turno de pretemporada',
        text: 'Se puede empezar la pretemporada un mes antes y con doble turno. El plantel es amateur y labura de otra cosa.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'exigir',
                label: 'Exigirlo',
                hint: 'Llegan mejor. Alguno se rompe y alguno se va.',
                outcomes: [
                    {
                        weight: 60,
                        effect: { rating: 2, injuryRisk: 0.05, cohesion: -3 },
                        resultText:
                            'Llegaron a marzo mejor que nadie en la categoría. Tres no bancaron el ritmo y dejaron de venir.',
                    },
                    {
                        weight: 40,
                        effect: { rating: 1, injuryRisk: 0.08, cohesion: -6 },
                        resultText:
                            'Llegaron fuertes y fundidos. En abril ya había dos con desgarros y el vestuario protestando por lo bajo.',
                    },
                ],
            },
            {
                id: 'proponerlo',
                label: 'Proponerlo y que venga el que pueda',
                hint: 'Nadie se enoja. Llegan a medias.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: 1, cohesion: 3 },
                        resultText:
                            'Vinieron doce de veintiséis. Los que vinieron llegaron bien y los que no, entendieron que nadie los juzgó.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-el-crack-a-europa',
        family: 'plantel',
        title: 'Lo llaman de Europa',
        text: 'Un club francés de segunda división lo quiere a prueba tres meses. Es tu mejor jugador y tiene veinticuatro años.',
        weight: 7,
        repeatable: true,
        cooldown: 5,
        requires: { minLevel: 2, maxLevel: 3, minSeason: 2 },
        options: [
            {
                id: 'que-vaya',
                label: 'Que vaya',
                hint: 'Lo perdés y no cobrás nada. Es su vida, no la tuya.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { pierdeMejor: true, reputacion: 4, hinchada: 5, cohesion: 3 },
                        resultText:
                            'Se fue en junio. El club no vio un peso —en rugby no se cobra por nadie— y en el barrio lo siguen por internet todos los domingos.',
                    },
                ],
            },
            {
                id: 'que-termine-el-torneo',
                label: 'Pedirle que termine el torneo',
                hint: 'Lo tenés hasta octubre. Puede irse igual, y peor.',
                outcomes: [
                    {
                        weight: 50,
                        effect: { rating: 1, cohesion: 4, flags: { seVaEnDiciembre: 1 } },
                        resultText:
                            'Se quedó hasta la última fecha. Dijo que se iba a ir, pero no antes de terminar lo que empezó.',
                    },
                    {
                        weight: 50,
                        effect: { pierdeMejor: true, cohesion: -5, presion: 4 },
                        resultText:
                            'El club francés no esperó y él tampoco. Se fue a mitad de torneo y el plantel se enteró por las redes.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-el-refuerzo-que-no-rinde',
        family: 'plantel',
        title: 'El refuerzo no rinde',
        text: 'Vino con antecedentes y lleva seis fechas por debajo de lo que se esperaba. En el vestuario ya lo miran.',
        weight: 8,
        repeatable: true,
        cooldown: 3,
        requires: { minSeason: 2 },
        options: [
            {
                id: 'bancarlo',
                label: 'Bancarlo de titular',
                hint: 'Si se acomoda, ganás. Si no, perdiste media temporada.',
                outcomes: [
                    {
                        weight: 50,
                        effect: { jugador: { delta: 5, target: 'peor' }, cohesion: 4 },
                        resultText:
                            'Se acomodó en la fecha nueve y de ahí no salió más. El vestuario aprendió que acá al que se le banca, se le banca.',
                    },
                    {
                        weight: 50,
                        effect: { rating: -1, cohesion: -5, presion: 6 },
                        resultText: 'No levantó nunca. La media temporada que le diste se la cobró el equipo en la tabla.',
                    },
                ],
            },
            {
                id: 'al-banco',
                label: 'Mandarlo al banco',
                hint: 'El equipo se ordena. Lo perdés a él.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: 1, cohesion: -3 },
                        resultText: 'Salió del equipo y el equipo funcionó mejor. Él dejó de venir a entrenar los jueves.',
                    },
                ],
            },
        ],
    },
    {
        id: 'pla-descenso-y-fuga',
        family: 'plantel',
        title: 'Después del descenso',
        text: 'Bajaron de categoría y el teléfono no para: cuatro del plantel tienen ofertas de clubes que se quedaron arriba.',
        weight: 12,
        repeatable: true,
        cooldown: 2,
        requires: { requiresRelegation: true },
        options: [
            {
                id: 'retenerlos',
                label: 'Pelear por retenerlos a todos',
                hint: 'Gastás la caja y tu crédito. No hay garantía.',
                outcomes: [
                    {
                        weight: 55,
                        effect: { cajaPct: -0.25, cohesion: 8, rating: 2 },
                        resultText:
                            'Se quedaron tres de los cuatro. El club puso plata en lo único que importaba y el plantel entendió el mensaje.',
                    },
                    {
                        weight: 45,
                        effect: { cajaPct: -0.25, pierdeMejor: true, cohesion: -4, presion: 6 },
                        resultText:
                            'Se fueron igual. Gastaste la caja y el crédito, y el plantel de la categoría nueva es el que quedó.',
                    },
                ],
            },
            {
                id: 'reconstruir',
                label: 'Dejarlos ir y armar con los pibes',
                hint: 'Este año se sufre. En dos hay equipo propio.',
                outcomes: [
                    {
                        weight: 100,
                        effect: {
                            pierdeMejor: true,
                            subeDelM19: true,
                            rating: -2,
                            estructura: 4,
                            cohesion: 5,
                            jugador: { delta: 2, target: 'joven', potencial: 5 },
                        },
                        resultText:
                            'Se fueron y subieron cinco del M19. La categoría va a costar y el club se armó una base que es suya.',
                    },
                ],
            },
        ],
    },
];
