import type { TennisMatchStatus } from '@/types/tennis';

/**
 * El estado del partido, en castellano.
 *
 * El proveedor manda códigos ("NS", "FT") y rótulos en inglés ("3rd set").
 * Vive acá y no en cada pantalla para que la lista y la ficha nunca digan
 * cosas distintas del mismo partido.
 */

const SETS: Record<string, string> = {
    '1st set': '1er set',
    '2nd set': '2do set',
    '3rd set': '3er set',
    '4th set': '4to set',
    '5th set': '5to set',
};

export function etiquetaDeEstado(statusLabel: string, status: TennisMatchStatus): string {
    const traducido = SETS[statusLabel];
    if (traducido) return traducido;

    switch (statusLabel) {
        case 'FT':
            return 'Finalizado';
        case 'NS':
            return 'No empezó';
        case 'POST':
            return 'Postergado';
        case 'CANC':
            return 'Cancelado';
        case 'Retired':
            return 'Abandono';
        case 'Walkover':
            return 'W.O.';
        case 'Suspended':
            return 'Suspendido';
        default:
            break;
    }

    // Un rótulo que no conocemos se muestra tal cual antes que inventarlo: es
    // preferible un "Retired" en inglés que un estado que no es el real.
    if (statusLabel) return statusLabel;

    if (status === 'final') return 'Finalizado';
    if (status === 'live') return 'En vivo';
    return '';
}

/**
 * La superficie, en castellano de tenis.
 *
 * El proveedor la manda con el techo pegado ("Hardcourt indoor"), y eso en
 * castellano se dice aparte: la cancha es de cemento, y encima es bajo techo.
 */
const SUPERFICIES: Record<string, string> = {
    hardcourt: 'Cemento',
    'hard court': 'Cemento',
    hard: 'Cemento',
    clay: 'Polvo de ladrillo',
    'red clay': 'Polvo de ladrillo',
    grass: 'Césped',
    carpet: 'Alfombra',
};

export function etiquetaDeSuperficie(surface: string | null): string | null {
    if (!surface) return null;
    const limpio = surface.trim().toLowerCase();
    const techo = limpio.endsWith(' indoor') ? ' (bajo techo)' : limpio.endsWith(' outdoor') ? '' : '';
    const base = limpio.replace(/\s+(indoor|outdoor)$/, '');
    const traducida = SUPERFICIES[base];
    // Una superficie que no conocemos se muestra tal cual: es preferible leer
    // "Acrylic" que perder el dato o inventarle un nombre en castellano.
    return traducida ? `${traducida}${techo}` : surface;
}

/**
 * La instancia del cuadro.
 *
 * Se traduce con el nombre que usa la crónica, no con el literal: un
 * "Round of 16" es octavos de final, y nadie lo llama "ronda de 16".
 */
const RONDAS: Record<string, string> = {
    final: 'Final',
    semifinal: 'Semifinal',
    semifinals: 'Semifinal',
    quarterfinal: 'Cuartos de final',
    quarterfinals: 'Cuartos de final',
    'round of 16': 'Octavos de final',
    'round of 32': '3ª ronda',
    'round of 64': '2ª ronda',
    'round of 128': '1ª ronda',
    'round robin': 'Fase de grupos',
    qualification: 'Clasificación',
    // Sigue el patrón de sus hermanas ("Clasificación · 1ª ronda") en vez de
    // "Última ronda de la clasificación", que no entra en un encabezado.
    'qualification final': 'Clasificación · última ronda',
    'qualifying final': 'Clasificación · última ronda',
};

/**
 * ESPN numera las rondas ("Round 1", "Qualifying 2nd Round") en vez de
 * nombrarlas por tamaño. "Round 4" es octavos en un cuadro de 128 y cuartos en
 * uno de 32, así que el número se conserva tal cual: es lo único que no miente.
 */
function rondaNumerada(round: string): string | null {
    const numerada = /^round (\d+)$/i.exec(round);
    if (numerada) return `${numerada[1]}ª ronda`;
    const clasificacion = /^qualif(?:ication|ying) (?:round )?(\d+)(?:st|nd|rd|th)?(?: round)?$/i.exec(round);
    if (clasificacion) return `Clasificación · ${clasificacion[1]}ª ronda`;
    return null;
}

export function etiquetaDeRonda(round: string | null): string | null {
    if (!round) return null;
    const traducida = RONDAS[round.trim().toLowerCase()];
    if (traducida) return traducida;
    return rondaNumerada(round.trim()) ?? round;
}

/**
 * La misma instancia, para un botón.
 *
 * El nombre largo no entra en un selector de siete rondas: "Cuartos de final"
 * ocupa el doble que la tarjeta que abre. La versión corta es la que se dice en
 * la cancha —octavos son "8vos"— y no una abreviatura inventada.
 */
const RONDAS_CORTAS: Record<string, string> = {
    final: 'Final',
    semifinal: 'Semis',
    semifinals: 'Semis',
    quarterfinal: '4tos',
    quarterfinals: '4tos',
    'round of 16': '8vos',
    'round of 32': '3ª',
    'round of 64': '2ª',
    'round of 128': '1ª',
    'round robin': 'Grupos',
    qualification: 'Clasif.',
    'qualification final': 'Q final',
    'qualifying final': 'Q final',
};

export function etiquetaCortaDeRonda(round: string | null): string | null {
    if (!round) return null;
    const limpio = round.trim().toLowerCase();
    const corta = RONDAS_CORTAS[limpio];
    if (corta) return corta;
    const numerada = /^round (\d+)$/i.exec(limpio);
    if (numerada) return `${numerada[1]}ª`;
    const clasificacion = /^qualif(?:ication|ying) (?:round )?(\d+)(?:st|nd|rd|th)?(?: round)?$/i.exec(limpio);
    if (clasificacion) return `Q${clasificacion[1]}`;
    // Sin forma corta conocida se cae a la larga antes que a un recorte ciego:
    // partir por caracteres deja rótulos como "Round of 1…" que no dicen nada.
    return etiquetaDeRonda(round);
}

/** El período de la planilla: el partido entero o un set. */
const PERIODOS: Record<string, string> = {
    ALL: 'Partido',
    '1ST': '1er set',
    '2ND': '2do set',
    '3RD': '3er set',
    '4TH': '4to set',
    '5TH': '5to set',
};

export function etiquetaDePeriodo(period: string): string {
    return PERIODOS[period] ?? period;
}

/** El bloque de la planilla. */
const GRUPOS: Record<string, string> = {
    Service: 'Saque',
    Points: 'Puntos',
    Games: 'Games',
    Winners: 'Winners',
    Errors: 'Errores',
    'Unforced errors': 'Errores no forzados',
    Return: 'Resto',
    Miscellaneous: 'Varios',
};

export function etiquetaDeGrupo(groupName: string): string {
    return GRUPOS[groupName] ?? groupName;
}

/**
 * La fila de la planilla.
 *
 * Se traduce por el NOMBRE en inglés y no por la `key` del proveedor: la key
 * `serviceGamesTotal` viene en dos bloques distintos ("Service games played" y
 * "Return games played"), así que traducir por key diría "games al saque" en la
 * planilla del resto. Los nombres, en cambio, no se pisan entre bloques: los
 * genéricos ("Forehand", "Total") ya vienen desambiguados por el título del
 * bloque que tienen arriba.
 */
const ESTADISTICAS: Record<string, string> = {
    Aces: 'Aces',
    'Double faults': 'Dobles faltas',
    'First serve': 'Primer saque',
    'Second serve': 'Segundo saque',
    'First serve points': 'Puntos con el primero',
    'Second serve points': 'Puntos con el segundo',
    'Service games played': 'Games al saque',
    'Service games won': 'Games al saque ganados',
    'Break points saved': 'Break points salvados',
    'Break points converted': 'Breaks convertidos',
    'First serve return points': 'Resto al primer saque',
    'Second serve return points': 'Resto al segundo saque',
    'Return games played': 'Games al resto',
    'Service points won': 'Puntos ganados al saque',
    'Receiver points won': 'Puntos ganados al resto',
    'Max points in a row': 'Racha de puntos',
    'Max games in a row': 'Racha de games',
    Total: 'Total',
    'Total won': 'Ganados',
    Tiebreaks: 'Tie-breaks',
    Forehand: 'Derecha',
    Backhand: 'Revés',
    Volley: 'Volea',
    Groundstroke: 'De fondo',
    Lob: 'Globo',
    'Drop shot': 'Drop',
    Overhead: 'Smash',
    'Overhead stroke': 'Smash',
    Return: 'De resto',
};

export function etiquetaDeEstadistica(name: string): string {
    return ESTADISTICAS[name] ?? name;
}
