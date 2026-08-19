import type { PublicProdeCompetition } from './types.ts';

/**
 * Estado y orden de las tarjetas del lobby del prode.
 *
 * Vive fuera del componente porque es la regla que decide QUÉ VE PRIMERO el que
 * entra a jugar, y eso se rompió en silencio una vez: con 38 competencias en la
 * base, las 5 jugables caían a las posiciones 34 a 38.
 */

// "Activa" tiene que querer decir "se puede jugar ahora". Se leía de `status`, que
// hoy vale 'active' en las 38 competencias — incluidas las 24 que no tienen un solo
// partido cargado. Con eso el chip no filtraba nada y el desempate del orden las
// empataba a todas. Lo que decide es el fixture: algo abierto o algo en juego.
export function isCompetitionActive(competition: PublicProdeCompetition) {
    return competition.stats.open > 0 || competition.stats.live > 0;
}

// Próxima es la que todavía no abrió pero ya tiene fecha. La rama vieja era
// inalcanzable: cortaba arriba por `isCompetitionActive`, verdadero en las 38, así
// que el chip "Próximas" devolvía siempre una lista vacía.
export function isCompetitionUpcoming(competition: PublicProdeCompetition) {
    if (isCompetitionActive(competition) || competition.status === 'finished') return false;

    const startsAt = competition.stats.nextLockAt || competition.startAt;
    if (!startsAt) return false;

    return new Date(startsAt).getTime() > Date.now();
}

export function compareLobbyCompetitions(left: PublicProdeCompetition, right: PublicProdeCompetition) {
    const leftFeatured = left.metadata?.featured === true ? 1 : 0;
    const rightFeatured = right.metadata?.featured === true ? 1 : 0;
    if (leftFeatured !== rightFeatured) return rightFeatured - leftFeatured;

    const leftActive = isCompetitionActive(left) ? 1 : 0;
    const rightActive = isCompetitionActive(right) ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;

    // Una competencia sin próximo cierre no tiene fecha con la que competir, y la
    // cadena vacía le ganaba el localeCompare a cualquier ISO: las 33 sin fixture
    // quedaban ARRIBA de las 5 jugables. Sin fecha va al final.
    const leftTime = left.stats.nextLockAt || left.startAt || '';
    const rightTime = right.stats.nextLockAt || right.startAt || '';
    if (!leftTime || !rightTime) {
        if (leftTime === rightTime) return 0;
        return leftTime ? -1 : 1;
    }

    return leftTime.localeCompare(rightTime);
}
