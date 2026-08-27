/**
 * EL MISMO PARTIDO, DOS VECES, PORQUE SON DOS FUENTES.
 *
 * Argentina-Australia del 29/8 salía dos veces en la portada: una desde rugbyarchive
 * ("Puma Trophy", 12:00, id `ra-761228`) y otra desde el proveedor vivo
 * ("Friendly International", 19:00, id `trgyZr5s`). Es el mismo partido: el archivo
 * anuncia el fixture con una hora de relleno y el proveedor tiene la de verdad.
 *
 * Gana la fila del proveedor vivo, que es la que trae la hora real, el id navegable
 * y la que se va a llenar de marcador cuando el partido empiece.
 *
 * Que la condición sea "una de cada fuente" no es un detalle de implementación:
 * rugbyarchive carga ida y vuelta con la MISMA fecha cuando el original no la
 * precisa, así que dos filas de archivo el mismo día contra el mismo rival son dos
 * partidos REALES y tienen que sobrevivir las dos.
 */

export function isArchiveMatchId(value: unknown): boolean {
    return String(value ?? '').toLowerCase().startsWith('ra-');
}

type FeedMatchLike = {
    id?: unknown;
    dateTime?: unknown;
    homeTeam?: { name?: unknown } | null;
    awayTeam?: { name?: unknown } | null;
};

export function buildFeedMatchIdentity(match: FeedMatchLike | null | undefined): string | null {
    const dt = new Date(String(match?.dateTime ?? ''));
    if (Number.isNaN(dt.getTime())) return null;

    const names = [match?.homeTeam?.name, match?.awayTeam?.name]
        .map((n) => String(n || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ''))
        .filter(Boolean);
    if (names.length < 2) return null;

    // Insensible a la orientación: cada fuente decide por su cuenta quién es local.
    return `${dt.toISOString().slice(0, 10)}|${names.slice().sort().join('|')}`;
}

export function dedupeCrossSourceMatches<T extends FeedMatchLike>(matches: T[]): T[] {
    const indicePorIdentidad = new Map<string, number>();
    const salida: T[] = [];

    for (const match of matches) {
        const identidad = buildFeedMatchIdentity(match);
        if (!identidad) {
            salida.push(match);
            continue;
        }

        const i = indicePorIdentidad.get(identidad);
        if (i === undefined) {
            indicePorIdentidad.set(identidad, salida.length);
            salida.push(match);
            continue;
        }

        const guardadoEsArchivo = isArchiveMatchId(salida[i]?.id);
        const nuevoEsArchivo = isArchiveMatchId(match.id);

        // Dos del archivo, o dos del proveedor vivo: no hay nada que plegar.
        if (guardadoEsArchivo === nuevoEsArchivo) {
            salida.push(match);
            continue;
        }

        // Uno de cada fuente: se queda el del vivo.
        if (guardadoEsArchivo) salida[i] = match;
    }

    return salida;
}
