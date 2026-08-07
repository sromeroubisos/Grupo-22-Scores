/**
 * ¿La tabla publicada dice lo mismo que la tabla que el operador está viendo?
 *
 * La consola de Operación calcula la tabla EN VIVO en cada request, así que lo
 * que se muestra casi siempre está bien. Lo que puede estar mal es lo que quedó
 * GUARDADO —que es lo que lee el hincha, el sembrado de playoff y el arrastre de
 * puntos— porque sólo se reescribe cuando alguien aprieta Recalcular.
 *
 * Cargar un resultado y no recalcular deja las dos versiones distintas sin que
 * nada lo diga. Este módulo es la comparación, y es puro a propósito: entra lo
 * publicado y lo vivo, sale un veredicto. Sin red, sin fechas, sin Supabase.
 */

export type PublishedRow = {
    club_id?: string | null;
    position?: number | null;
    points?: number | string | null;
};

export type LiveRow = {
    teamId?: string | null;
    position?: number | null;
    total_points?: number | string | null;
    team?: { name?: string | null } | null;
};

export type DriftState = 'sin_publicar' | 'al_dia' | 'desfasada';

export type DriftDiff = {
    teamId: string;
    teamName: string | null;
    /** Qué cambió. `ausente` = está en vivo y no en lo publicado; `sobrante` al revés. */
    kind: 'posicion' | 'puntos' | 'ausente' | 'sobrante';
    published: { position: number | null; points: number | null } | null;
    live: { position: number | null; points: number | null } | null;
};

export type DriftResult = {
    state: DriftState;
    diffs: DriftDiff[];
};

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeId(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * Compara la tabla guardada contra la calculada en vivo.
 *
 * Sólo mira posición y puntos: son las dos cifras por las que alguien toma una
 * decisión (quién clasifica, quién desciende). Una diferencia en tries o en
 * forma no cambia nada de lo que se lee de la tabla, y meterla acá sólo haría
 * que el indicador gritara todo el tiempo hasta que nadie lo mire.
 */
export function comparePublishedVsLive(
    published: PublishedRow[] | null | undefined,
    live: LiveRow[] | null | undefined,
): DriftResult {
    const publishedRows = Array.isArray(published) ? published : [];
    const liveRows = Array.isArray(live) ? live : [];

    if (publishedRows.length === 0) {
        // Sin filas guardadas no hay nada que comparar. Ojo: tampoco hay nada
        // publicado, que es una advertencia distinta y más fuerte que un
        // desfasaje — salvo que la tabla en vivo también esté vacía (todavía no
        // se jugó nada), donde no hay nada que decir.
        return { state: liveRows.length === 0 ? 'al_dia' : 'sin_publicar', diffs: [] };
    }

    const publishedById = new Map<string, PublishedRow>();
    for (const row of publishedRows) {
        const id = normalizeId(row.club_id);
        if (id) publishedById.set(id, row);
    }

    const diffs: DriftDiff[] = [];
    const seen = new Set<string>();

    for (const row of liveRows) {
        const id = normalizeId(row.teamId);
        if (!id) continue;
        seen.add(id);

        const teamName = row.team?.name ?? null;
        const livePosition = toNumberOrNull(row.position);
        const livePoints = toNumberOrNull(row.total_points);
        const saved = publishedById.get(id);

        if (!saved) {
            diffs.push({
                teamId: id,
                teamName,
                kind: 'ausente',
                published: null,
                live: { position: livePosition, points: livePoints },
            });
            continue;
        }

        const savedPosition = toNumberOrNull(saved.position);
        const savedPoints = toNumberOrNull(saved.points);

        if (savedPoints !== livePoints) {
            diffs.push({
                teamId: id,
                teamName,
                kind: 'puntos',
                published: { position: savedPosition, points: savedPoints },
                live: { position: livePosition, points: livePoints },
            });
        } else if (savedPosition !== livePosition) {
            diffs.push({
                teamId: id,
                teamName,
                kind: 'posicion',
                published: { position: savedPosition, points: savedPoints },
                live: { position: livePosition, points: livePoints },
            });
        }
    }

    for (const [id, row] of publishedById) {
        if (seen.has(id)) continue;
        diffs.push({
            teamId: id,
            teamName: null,
            kind: 'sobrante',
            published: { position: toNumberOrNull(row.position), points: toNumberOrNull(row.points) },
            live: null,
        });
    }

    return { state: diffs.length === 0 ? 'al_dia' : 'desfasada', diffs };
}

/** Los primeros nombres que difieren, para el `title` del indicador. */
export function describeDrift(diffs: DriftDiff[], limit = 3): string {
    if (diffs.length === 0) return '';

    const names = diffs
        .slice(0, limit)
        .map((diff) => diff.teamName || diff.teamId)
        .join(', ');

    const rest = diffs.length - Math.min(limit, diffs.length);
    return rest > 0 ? `${names} y ${rest} más` : names;
}
