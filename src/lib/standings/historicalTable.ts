/**
 * Tabla histórica de un torneo: la suma, temporada por temporada, de lo que
 * dice la tabla de cada una.
 *
 * Los puntos se suman como quedaron en su año. Si en 1995 la victoria valía 2 y
 * hoy vale 4, cada temporada aporta lo que aportó entonces: la histórica no
 * recalcula el pasado con el reglamento de hoy. Por eso esto recibe tablas ya
 * armadas y no partidos — quién arma la tabla de cada temporada (la oficial
 * cargada, o la que sale de los resultados) lo decide el servidor.
 *
 * Solo fase regular: los cruces de playoff no tienen tabla y no suman.
 */

export type SeasonTableRow = {
    clubId: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    scored: number;
    conceded: number;
    bonus: number;
    points: number;
};

export type SeasonTable = {
    /** Identifica la temporada: un club que juega dos fases de la misma
     *  temporada cuenta UNA temporada jugada. */
    seasonKey: string;
    rows: SeasonTableRow[];
};

export type HistoricalRow = SeasonTableRow & {
    position: number;
    seasons: number;
};

const NUMERIC_FIELDS = ['played', 'won', 'drawn', 'lost', 'scored', 'conceded', 'bonus', 'points'] as const;

function finite(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/**
 * Orden: puntos, victorias, diferencia, tantos a favor. Los empates totales se
 * resuelven por id para que la tabla no baile entre una carga y otra.
 */
export function buildHistoricalTable(tables: SeasonTable[]): HistoricalRow[] {
    const totals = new Map<string, SeasonTableRow & { seasonKeys: Set<string> }>();

    for (const table of tables) {
        for (const row of table.rows) {
            const clubId = String(row.clubId ?? '').trim();
            if (!clubId) continue;
            // Una fila sin partidos es un inscripto que no jugó esa fase.
            if (finite(row.played) <= 0) continue;

            let total = totals.get(clubId);
            if (!total) {
                total = {
                    clubId,
                    played: 0,
                    won: 0,
                    drawn: 0,
                    lost: 0,
                    scored: 0,
                    conceded: 0,
                    bonus: 0,
                    points: 0,
                    seasonKeys: new Set<string>(),
                };
                totals.set(clubId, total);
            }
            for (const field of NUMERIC_FIELDS) total[field] += finite(row[field]);
            total.seasonKeys.add(table.seasonKey);
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
        .map(({ seasonKeys, ...row }, index) => ({
            ...row,
            seasons: seasonKeys.size,
            position: index + 1,
        }));
}

/**
 * Lo propio de una fase que arrastra puntos: la fila guardada ya trae sumada la
 * fase de origen, y la de origen también entra en la histórica. Sin restar, la
 * primera fase se contaría dos veces.
 */
export function withoutCarriedOver(rows: SeasonTableRow[], sourceRows: SeasonTableRow[]): SeasonTableRow[] {
    const sourceByClub = new Map(sourceRows.map((row) => [row.clubId, row]));
    return rows.map((row) => {
        const source = sourceByClub.get(row.clubId);
        if (!source) return row;
        const own = { ...row };
        for (const field of NUMERIC_FIELDS) own[field] = Math.max(0, finite(row[field]) - finite(source[field]));
        return own;
    });
}
