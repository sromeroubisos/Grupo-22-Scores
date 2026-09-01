/**
 * De que lado cae la chapa de una fila de estadistica de partido.
 *
 * Vive en `lib` y no dentro del componente para que se pueda testear: la regla
 * decide quien "gano" catorce metricas por deporte y equivocarse condecora al
 * peor equipo, asi que no puede depender de abrir el navegador. El componente
 * (`app/matches/[id]/TopStatsRows.tsx`) importa CSS modules, que fuera del
 * bundler no resuelven, y eso dejaba la regla sin cobertura posible.
 */

/**
 * Metricas donde gana el que tiene MENOS.
 *
 * La chapa marca al mejor, no al mas grande. Sin esta lista la pantalla
 * felicitaria al equipo con mas tarjetas rojas.
 *
 * Va por clave y no por etiqueta a proposito: la etiqueta cambia de deporte en
 * deporte ("Amarillas", "Yellow cards") y de proveedor en proveedor, la clave
 * la fija `matchStatsFromEvents.ts`.
 */
export const MENOS_ES_MEJOR = new Set([
    'yellowCards', 'redCards', 'blueCards', 'greenCards', 'twoMinSuspensions',
    'penaltiesCommitted', 'penaltyYards', 'fouls', 'injuries',
    'knockOns', 'forwardPasses', 'handlingErrors',
    'turnovers', 'turnoversLost', 'turnoversBadPass', 'turnoversOffensiveFoul',
    'turnoversOnDowns', 'turnoversPassivePlay', 'turnoversTechnicalFault',
    'fumbles', 'fumblesLost', 'interceptionsThrown', 'sacksTaken',
    'ownGoals', 'linesLost', 'rucksLost', 'maulsLost', 'scrumsLost',
    'shotsMissed', 'shotsOffTarget', 'conversionsMissed', 'dropGoalsMissed',
    'penaltyGoalsMissed', 'shootoutMissed',
    // Un tiro atajado o bloqueado se le carga AL QUE TIRO, no al que atajo
    // (`bumpTeamMetric(stats.shotsSaved, team)`), asi que en la fila del equipo
    // significa "cuantos le taparon". La atajada del arquero (`saves`) es otra
    // metrica y esa si va al que ataja: no entra en esta lista.
    'shotsSaved', 'shotsBlocked', 'sevenMetersSaved', 'penaltyStrokesSaved',
    'fieldGoalsBlocked',
]);

/**
 * Etiquetas de las metricas que llegan sin clave (planilla del proveedor).
 *
 * Es un respaldo, no la via principal: el proveedor manda `label` y nada mas,
 * asi que para esas filas la unica sena disponible es el texto. Se compara en
 * minusculas y sin acentos.
 */
const MENOS_ES_MEJOR_TEXTO = [
    'amarilla', 'roja', 'tarjeta', 'card', 'falta', 'foul',
    'perdida', 'error', 'penal cometido', 'offside', 'fuera de juego',
    // Un tiro que no entro: mas es peor. 'atajado' se deja AFUERA a proposito
    // —distinguirlo de "Atajadas" del arquero por la vocal final es demasiado
    // fragil—; por clave ya esta cubierto (`shotsSaved`), que es el camino de
    // los eventos propios. Acá abajo solo llega la planilla del proveedor.
    'tiros fuera', 'desviado', 'errado', 'fallado',
];

const sinAcentos = (texto: string) =>
    texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function menosEsMejor(metricKey: string | undefined, label: string) {
    if (metricKey) return MENOS_ES_MEJOR.has(metricKey);
    const plano = sinAcentos(label);
    return MENOS_ES_MEJOR_TEXTO.some((aguja) => plano.includes(aguja));
}

/**
 * Quien se lleva la chapa. Empate y falta de dato no la dan a nadie: una chapa
 * en un 0-0 diria que alguien gano algo que no paso.
 */
export function ladoGanador(
    home: number | null,
    away: number | null,
    metricKey: string | undefined,
    label: string,
): 'home' | 'away' | null {
    if (home === null || away === null) return null;
    if (home === away) return null;
    const invertido = menosEsMejor(metricKey, label);
    const local = invertido ? home < away : home > away;
    return local ? 'home' : 'away';
}
