/**
 * Tabla de planteles: la suma, club por club, de los puntos que cada categoría
 * de una misma agrupación (Top 10 + Intermedia + Preintermedia A y B, por
 * ejemplo) le da a su club.
 *
 * Recibe tablas ya armadas — quién las arma (la oficial cargada o la que sale
 * de los partidos) lo decide el servidor, igual que en la histórica.
 *
 * Reglas:
 *   · Un club entra si figura en al menos una categoría, y suma SOLO de las
 *     que figura. No estar en una categoría no es "cero puntos": esa
 *     categoría no existe en su cuenta (`categories` lo refleja).
 *   · Los puntos son los de la tabla de cada categoría, no sus posiciones.
 *   · `weight` (1 por defecto) permite que una categoría valga más o menos.
 *   · Orden: puntos, victorias, diferencia, tantos a favor, id.
 */

export type SquadCategoryRow = {
    clubId: string;
    played: number;
    won: number;
    scored: number;
    conceded: number;
    points: number;
};

export type SquadCategoryTable = {
    categoryId: string;
    weight?: number;
    rows: SquadCategoryRow[];
};

export type SquadRow = {
    clubId: string;
    position: number;
    points: number;
    played: number;
    won: number;
    scored: number;
    conceded: number;
    /** Puntos por categoría (ya ponderados), solo las que juega. */
    categories: Record<string, number>;
};

function finite(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function buildSquadTable(tables: SquadCategoryTable[]): SquadRow[] {
    const totals = new Map<string, Omit<SquadRow, 'position'>>();

    for (const table of tables) {
        const weight = table.weight === undefined ? 1 : finite(table.weight);
        // Un club repetido dentro de la misma categoría (dos fases) se suma una vez por fila,
        // pero cuenta una sola categoría.
        for (const row of table.rows) {
            const clubId = String(row.clubId ?? '').trim();
            if (!clubId) continue;
            let total = totals.get(clubId);
            if (!total) {
                total = { clubId, points: 0, played: 0, won: 0, scored: 0, conceded: 0, categories: {} };
                totals.set(clubId, total);
            }
            const points = finite(row.points) * weight;
            total.points += points;
            total.played += finite(row.played);
            total.won += finite(row.won);
            total.scored += finite(row.scored);
            total.conceded += finite(row.conceded);
            total.categories[table.categoryId] = (total.categories[table.categoryId] ?? 0) + points;
        }
    }

    return [...totals.values()]
        .sort((a, b) =>
            b.points - a.points ||
            b.won - a.won ||
            (b.scored - b.conceded) - (a.scored - a.conceded) ||
            b.scored - a.scored ||
            a.clubId.localeCompare(b.clubId),
        )
        .map((row, index) => ({ ...row, position: index + 1 }));
}
