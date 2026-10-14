// Lesiones y disciplina.
//
// EL PROTOCOLO DE CONMOCIÓN NO SE BANALIZA. Puede haber una opción de esconder
// el golpe, porque en las canchas pasa, pero las consecuencias tienen que ser
// serias y estar del lado del riesgo real. No es una decisión pícara y no puede
// salir barata.

import type { CoachEvent } from '../../types/event.ts';

export const LESIONES_EVENTS: readonly CoachEvent[] = [
    {
        id: 'les-protocolo-de-conmocion',
        family: 'lesiones',
        title: 'El golpe en la cabeza',
        text: 'Tu segunda línea salió groggy en el primer tiempo y volvió al vestuario mareado. El médico del club no está: se fue a las tres. Faltan dos fechas para la definición.',
        weight: 10,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'aplicar-protocolo',
                label: 'Aplicar el protocolo completo',
                hint: 'Se pierde las tres semanas de reposo. Es lo que hay que hacer.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -2, cohesion: 4, reputacion: 2 },
                        resultText:
                            'Veintiún días afuera, control médico y vuelta gradual. Se perdió la definición y el plantel entero vio dónde está el límite del club.',
                    },
                ],
            },
            {
                id: 'que-lo-vea-el-medico',
                label: 'Frenarlo hasta que lo vea un médico',
                hint: 'No juega el sábado. Puede volver antes si está bien.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -1, cohesion: 2 },
                        resultText:
                            'No jugó hasta que un neurólogo lo autorizó. Volvió a la tercera fecha y volvió entero.',
                    },
                ],
            },
            {
                id: 'no-anotarlo',
                label: 'No anotarlo en la planilla',
                hint: 'Juega el sábado. Si vuelve a golpearse, no es un partido lo que se pierde.',
                outcomes: [
                    {
                        weight: 45,
                        effect: { rating: 1, presion: 4, cohesion: -6 },
                        resultText:
                            'Jugó y no pasó nada. En el vestuario nadie dijo una palabra, y todos entendieron qué clase de club es este.',
                    },
                    {
                        weight: 55,
                        effect: {
                            pierdeMejor: true,
                            rating: -3,
                            cohesion: -12,
                            reputacion: -8,
                            presion: 16,
                            hinchada: -8,
                        },
                        resultText:
                            'Se llevó otro golpe a los veinte minutos y salió en ambulancia. Seis meses sin jugar, sumario de la unión, y una charla con la familia que nadie en el club se va a olvidar.',
                    },
                ],
            },
        ],
    },
    {
        id: 'les-pilar-suspendido',
        family: 'lesiones',
        title: 'El pilar suspendido',
        text: 'Dos fechas por el codazo. Y el suplente no tiene la certificación de primera línea.',
        weight: 11,
        repeatable: true,
        cooldown: 3,
        options: [
            {
                id: 'jugar-con-lo-que-hay',
                label: 'Jugar con lo que hay',
                hint: 'Riesgo de scrums simulados en las dos fechas.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -1, injuryRisk: 0.05 },
                        resultText:
                            'Salieron con un tercera línea de pilar. Si el árbitro pide certificación, el scrum es simulado y se pierde el arma del pack.',
                    },
                ],
            },
            {
                id: 'subir-al-del-m19',
                label: 'Subir al del M19',
                hint: 'El pibe debuta. Este año va a sufrir.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { subeDelM19: true, rating: -1, jugador: { delta: 1, target: 'joven', potencial: 4 } },
                        resultText:
                            'Debutó un pibe de diecinueve en el scrum de primera. La pasó mal dos fechas y arrancó una carrera.',
                    },
                ],
            },
            {
                id: 'apelar',
                label: 'Apelar la sanción',
                hint: 'Puede levantarse. Si no, la unión te mira distinto.',
                outcomes: [
                    {
                        weight: 40,
                        effect: { cajaFijo: -600_000 },
                        resultText: 'Se levantó la sanción con el video. Juega el sábado como si nada hubiera pasado.',
                    },
                    {
                        weight: 60,
                        effect: { cajaFijo: -600_000, reputacion: -2, rating: -1 },
                        resultText:
                            'Quedó firme y encima con costas. En el tribunal de la unión anotaron quién apeló un codazo que se veía desde la tribuna.',
                    },
                ],
            },
        ],
    },
    {
        id: 'les-kinesiologo',
        family: 'lesiones',
        title: 'El kinesiólogo',
        text: 'Hace tres años que el kinesiólogo viene gratis los jueves porque es hincha. Consiguió un laburo en serio y ya no puede.',
        weight: 9,
        repeatable: true,
        cooldown: 5,
        options: [
            {
                id: 'contratar',
                label: 'Contratar a uno',
                hint: 'Sale todos los meses. Se recupera medio plantel.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { cajaPct: -0.16, injuryRisk: -0.03, estructura: 5, rating: 1 },
                        resultText:
                            'Viene martes y jueves y cobra. Los desgarros se recuperan en tres semanas y no en dos meses.',
                    },
                ],
            },
            {
                id: 'que-se-arreglen',
                label: 'Que cada uno se arregle por su cuenta',
                hint: 'No cuesta un peso. Las lesiones se estiran.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { injuryRisk: 0.05, cohesion: -3 },
                        resultText:
                            'Cada uno paga su kinesiólogo si puede. Los que no pueden, juegan tocados y se rompen de nuevo.',
                    },
                ],
            },
        ],
    },
    {
        id: 'les-el-que-juega-tocado',
        family: 'lesiones',
        title: 'El que quiere jugar tocado',
        text: 'Tiene el isquiotibial sensible desde hace dos semanas y pide jugar la semifinal. Dice que aguanta.',
        weight: 9,
        repeatable: true,
        cooldown: 3,
        requires: { minSeason: 2 },
        options: [
            {
                id: 'que-juegue',
                label: 'Que juegue',
                hint: 'Es tu mejor jugador. Puede durar veinte minutos.',
                outcomes: [
                    {
                        weight: 45,
                        effect: { rating: 2, cohesion: 3 },
                        resultText: 'Aguantó los ochenta y fue el mejor de la cancha. El lunes casi no podía caminar.',
                    },
                    {
                        weight: 55,
                        effect: { rating: -2, injuryRisk: 0.07, cohesion: -3 },
                        resultText:
                            'Se rompió a los veintidós minutos. Se hizo el cambio temprano y el equipo jugó el resto descolocado.',
                    },
                ],
            },
            {
                id: 'que-no-juegue',
                label: 'Que no juegue',
                hint: 'Perdés al mejor. Lo tenés entero para lo que viene.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -1, cohesion: 2 },
                        resultText:
                            'Miró el partido de traje. Se recuperó del todo y llegó entero a lo que quedaba de temporada.',
                    },
                ],
            },
        ],
    },
    {
        id: 'les-tarjeta-roja-del-capitan',
        family: 'lesiones',
        title: 'La roja del capitán',
        text: 'Se fue expulsado por un tackle alto en la última fecha. El tribunal de la unión pide un descargo por escrito.',
        weight: 8,
        repeatable: true,
        cooldown: 4,
        options: [
            {
                id: 'asumirlo',
                label: 'Reconocerlo y aceptar la sanción',
                hint: 'Se pierde tres fechas. El club queda bien parado.',
                outcomes: [
                    {
                        weight: 100,
                        effect: { rating: -2, reputacion: 3, cohesion: 3 },
                        resultText:
                            'Escribió el descargo asumiendo el tackle. Tres fechas de suspensión y un tribunal que anotó que este club no discute la seguridad.',
                    },
                ],
            },
            {
                id: 'pelearla',
                label: 'Pelearla con el video',
                hint: 'Podés bajar la sanción. O que te la suban.',
                outcomes: [
                    {
                        weight: 45,
                        effect: { rating: -1 },
                        resultText: 'El video mostró que el rival se agachó. Una fecha en lugar de tres.',
                    },
                    {
                        weight: 55,
                        effect: { rating: -3, reputacion: -3, presion: 5 },
                        resultText:
                            'El tribunal miró el mismo video y vio otra cosa. Cinco fechas, y en la unión quedó la idea de que acá se defiende lo indefendible.',
                    },
                ],
            },
        ],
    },
];
