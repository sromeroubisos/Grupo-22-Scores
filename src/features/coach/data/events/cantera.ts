// El M19 y la cantera: la única fuente real de jugadores.
//
// En el rugby de clubes argentino no hay fichajes. Lo que hay es un M19 que
// sube, y de eso depende el club dentro de cinco años. Formar cuesta hoy y se
// cobra tarde, y esa es la tensión de toda la familia.

import type { CoachEvent } from '../../types/event.ts';

export const CANTERA_EVENTS: readonly CoachEvent[] = [
    {
        id: 'can-subir-tres-del-m19',
        family: 'cantera',
        title: 'Subir tres del M19',
        text: 'La subcomisión pide subir tres pibes a primera. No es un plan deportivo: no hay plata para el micro y con ellos se llena el plantel.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'subirlos',
                label: 'Subirlos',
                hint: 'La temporada se hace cuesta arriba. En dos años son titulares.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { subeDelM19: true, rating: -2, jugador: { delta: 1, target: 'joven', potencial: 4 }, cajaFijo: 1_800_000 },
                        resultText:
                            'Subieron los tres. Van a comer varios sábados y en dos temporadas ninguno se acuerda de que fue una decisión de tesorería.',
                    },
                ],
            },
            {
                id: 'subir-uno',
                label: 'Subir solo al que está listo',
                hint: 'Menos riesgo deportivo. La caja no se alivia.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { jugador: { delta: 2, target: 'joven', potencial: 3 } },
                        resultText:
                            'Subió el octavo del M19, que ya era mejor que dos de primera. Los otros dos siguen un año más abajo.',
                    },
                ],
            },
            {
                id: 'ninguno',
                label: 'Que no suba ninguno',
                hint: 'La primera queda intacta. La subcomisión se lo anota.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { presion: 6, estructura: -2 },
                        resultText:
                            'Se sostuvo el plantel de primera y el M19 terminó el año jugando con quince justos. En la subcomisión quedó anotado.',
                    },
                ],
            },
        ],
    },
    {
        id: 'can-entrenador-de-m19',
        family: 'cantera',
        title: 'El entrenador del M19',
        text: 'Se va el que llevaba el M19 hace ocho años. Está el papá de un jugador, que tiene toda la voluntad, y está un profe que cobra.',
        weight: 9,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'el-papa',
                label: 'El papá de un jugador',
                hint: 'No cuesta un peso. Y no sabe mucho más que los chicos.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cohesion: 3, hinchada: 3 },
                        resultText:
                            'Agarró con todas las ganas del mundo. Los chicos entrenan y se divierten, y no aprenden mucho más que eso.',
                    },
                ],
            },
            {
                id: 'el-profe',
                label: 'Contratar al profe',
                hint: 'Cuesta todos los meses. Se nota en tres años.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.15, estructura: 7, jugador: { delta: 2, target: 'joven', potencial: 6 } },
                        resultText:
                            'Entró el profe y el M19 empezó a entrenar como un plantel. Los que suban dentro de tres años van a ser otros.',
                    },
                ],
            },
        ],
    },
    {
        id: 'can-la-escuelita',
        family: 'cantera',
        title: 'La escuelita del sábado',
        text: 'Hay treinta pibes de siete a doce años que vienen los sábados a la mañana. Ocupan la cancha, ocupan gente y no dejan un peso.',
        weight: 8,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'agrandarla',
                label: 'Agrandarla y salir a buscar más',
                hint: 'Cuesta ahora y trae socios. Los jugadores llegan en diez años.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.12, socios: 70, hinchada: 8, estructura: 4 },
                        resultText:
                            'Fueron a las escuelas del barrio y volvieron con setenta familias. Ninguno de esos chicos va a jugar en primera antes de 2036.',
                    },
                ],
            },
            {
                id: 'dejarla-como-esta',
                label: 'Dejarla como está',
                hint: 'No cuesta nada. Tampoco crece nada.',
                outcomes: [
                    {
                        weight: 100,
                        effect: {},
                        resultText: 'Siguió igual: treinta pibes, dos papás de turno y una pelota por cada cinco.',
                    },
                ],
            },
        ],
    },
    {
        id: 'can-el-pibe-que-se-va-al-grande',
        family: 'cantera',
        title: 'Se llevan al mejor del M19',
        text: 'Un club grande de la capital vio al apertura del M19 en un seleccionado juvenil y lo quiere ya. Tiene diecisiete años.',
        weight: 9,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'ponerle-condiciones',
                label: 'Pedir que termine el juvenil acá',
                hint: 'Lo tenés un año más. Después se va igual.',
                outcomes: [
                    {
                        weight: 60,
                        effect: { jugador: { delta: 3, target: 'joven', potencial: 5 }, cohesion: 3 },
                        resultText:
                            'La familia aceptó. Termina el M19 en el club, sube a primera en octubre y recién ahí se va.',
                    },
                    {
                        weight: 40,
                        effect: { presion: 3, reputacion: -1 },
                        resultText:
                            'Se fue igual en marzo. Quedó la sensación de que el club le puso trabas a un pibe de diecisiete.',
                    },
                ],
            },
            {
                id: 'que-vaya-ya',
                label: 'Abrirle la puerta de una',
                hint: 'Lo perdés. El club queda como el lugar que forma y suelta.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { reputacion: 3, hinchada: 3, estructura: 2 },
                        resultText:
                            'Se fue con la bendición del club. En dos años hay tres pibes más de la zona pidiendo entrenar acá.',
                    },
                ],
            },
        ],
    },
    {
        id: 'can-certificacion-primera-linea',
        family: 'cantera',
        title: 'El curso de primera línea',
        text: 'La unión abre el curso de certificación de primera línea. Son cuatro fines de semana y hay que mandar a alguien.',
        weight: 10,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'mandar-dos',
                label: 'Mandar a dos del M19',
                hint: 'Cuesta el fin de semana y el viaje. Nunca más te quedás sin scrum.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: -1_400_000, certificaPrimeraLinea: true, estructura: 3 },
                        resultText:
                            'Volvieron con el papel. El club tiene dos primeras líneas certificadas más y el banco dejó de ser una ruleta.',
                    },
                ],
            },
            {
                id: 'no-mandar',
                label: 'No mandar a nadie este año',
                hint: 'Se ahorra el viaje. Seguís con los certificados que tenés.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaFijo: 400_000, injuryRisk: 0.02 },
                        resultText:
                            'Nadie fue al curso. Si se lesiona un pilar en una fecha lejos, el scrum del club es una plegaria.',
                    },
                ],
            },
        ],
    },
    {
        id: 'can-fusion-de-juveniles',
        family: 'cantera',
        title: 'Fusionar los juveniles con el club vecino',
        text: 'Ni ellos ni ustedes juntan quince en M17. La unión propone presentar una categoría en conjunto.',
        weight: 7,
        repeatable: true,
        cooldown: 6,
        requires: { maxLevel: 5 },
        options: [
            {
                id: 'fusionar',
                label: 'Fusionar',
                hint: 'Los chicos juegan. La camiseta deja de ser una sola.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { estructura: 5, hinchada: -4, jugador: { delta: 1, target: 'joven', potencial: 3 } },
                        resultText:
                            'Salieron a la cancha con una camiseta mitad y mitad. Los chicos juegan todos los sábados y a los socios viejos les cuesta mirarlo.',
                    },
                ],
            },
            {
                id: 'presentar-solos',
                label: 'Presentar la categoría solos',
                hint: 'La camiseta es la del club. Van a perder casi todos los partidos.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { hinchada: 4, estructura: -3, presion: 2 },
                        resultText:
                            'Salieron con trece y jugaron igual. Perdieron todo el año y no le prestaron la camiseta a nadie.',
                    },
                ],
            },
        ],
    },
];
