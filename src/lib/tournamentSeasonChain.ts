/**
 * Mantiene tournament_relations (previous_season) para que el selector de temporadas
 * en la ficha pública agrupe todas las ediciones sin SQL manual.
 */

type AnyDb = {
    from: (t: string) => {
        select: (...args: unknown[]) => any;
        upsert: (...args: unknown[]) => any;
    };
};

const SEASON_LINK_TYPES = ['previous_season', 'next_season'];

function isActiveRelStatus(status: string | null | undefined): boolean {
    const s = status ?? 'active';
    return s !== 'inactive' && s !== 'archived';
}

export function parseYearFromTournamentRow(row: {
    season_id?: string | null;
    slug?: string | null;
    display_name?: string | null;
    name?: string | null;
}): number {
    const sid = row.season_id != null ? String(row.season_id).trim() : '';
    const y = parseInt(sid, 10);
    if (Number.isFinite(y) && y >= 1900 && y <= 2100) return y;
    const slug = row.slug != null ? String(row.slug).trim() : '';
    const sm = slug.match(/-(\d{4})$/);
    if (sm) {
        const yy = parseInt(sm[1], 10);
        if (Number.isFinite(yy) && yy >= 1900 && yy <= 2100) return yy;
    }
    const text = `${row.display_name || ''} ${row.name || ''}`;
    const m = text.match(/\b(19|20)\d{2}\b/);
    if (m) {
        const yy = parseInt(m[0], 10);
        if (Number.isFinite(yy) && yy >= 1900 && yy <= 2100) return yy;
    }
    return 0;
}

/** "torneo-arg-2026" -> "torneo-arg" */
export function parseSlugSeasonBase(slug: string | null | undefined): string | null {
    if (!slug) return null;
    const m = String(slug).trim().match(/^(.*)-(\d{4})$/);
    return m ? m[1] : null;
}

/**
 * Añade al set todos los torneos con slug `base-AAAA` (mismo deporte/país que el ancla).
 * Usado en la API pública de temporadas cuando aún no hay tournament_relations.
 */
export async function mergeSlugSeasonFamilyIntoSet(
    db: AnyDb,
    anchor: {
        id: string;
        slug?: string | null;
        sport_id?: string | null;
        country_id?: string | null;
    },
    into: Set<string>,
): Promise<void> {
    const base = parseSlugSeasonBase(anchor.slug);
    if (!base) return;

    let query = db.from('tournaments').select('id, slug').like('slug', `${base}-%`);

    if (anchor.sport_id != null && String(anchor.sport_id).trim()) {
        query = query.eq('sport_id', String(anchor.sport_id).trim());
    }
    if (anchor.country_id != null && String(anchor.country_id).trim()) {
        query = query.eq('country_id', String(anchor.country_id).trim());
    }

    const { data: candidates, error } = await query;
    if (error || !candidates?.length) return;

    for (const c of candidates as Array<{ id?: unknown; slug?: unknown }>) {
        const slug = String(c.slug ?? '');
        if (parseSlugSeasonBase(slug) !== base) continue;
        const tid = String(c.id ?? '');
        if (tid) into.add(tid);
    }
}

/** Igual que mergeSlugSeasonFamilyIntoSet pero sin sport/country (ediciones viejas a veces tienen null distinto). */
export async function mergeSlugSeasonFamilyIntoSetLoose(
    db: AnyDb,
    anchor: { slug?: string | null },
    into: Set<string>,
): Promise<void> {
    const base = parseSlugSeasonBase(anchor.slug);
    if (!base) return;

    const { data: candidates, error } = await db.from('tournaments').select('id, slug').like('slug', `${base}-%`);
    if (error || !candidates?.length) return;

    for (const c of candidates as Array<{ id?: unknown; slug?: unknown }>) {
        const slug = String(c.slug ?? '');
        if (parseSlugSeasonBase(slug) !== base) continue;
        const tid = String(c.id ?? '');
        if (tid) into.add(tid);
    }
}

export async function collectSeasonLinkedTournamentIds(db: AnyDb, startId: string): Promise<Set<string>> {
    const involved = new Set<string>([startId]);
    let grew = true;
    while (grew) {
        grew = false;
        const frontier = Array.from(involved);
        const [bySource, byTarget] = await Promise.all([
            db
                .from('tournament_relations')
                .select('source_tournament_id,target_tournament_id,status')
                .in('source_tournament_id', frontier)
                .in('relation_type', SEASON_LINK_TYPES),
            db
                .from('tournament_relations')
                .select('source_tournament_id,target_tournament_id,status')
                .in('target_tournament_id', frontier)
                .in('relation_type', SEASON_LINK_TYPES),
        ]);
        const batch = [...(bySource.data ?? []), ...(byTarget.data ?? [])];
        for (const rel of batch) {
            if (!isActiveRelStatus(rel.status)) continue;
            for (const tid of [rel.source_tournament_id, rel.target_tournament_id]) {
                if (tid && !involved.has(tid)) {
                    involved.add(tid);
                    grew = true;
                }
            }
        }
    }
    return involved;
}

export async function upsertPreviousSeasonEdge(db: AnyDb, olderTournamentId: string, newerTournamentId: string): Promise<void> {
    if (olderTournamentId === newerTournamentId) return;
    await db.from('tournament_relations').upsert(
        {
            source_tournament_id: olderTournamentId,
            target_tournament_id: newerTournamentId,
            relation_type: 'previous_season',
            relation_direction: 'reference',
            status: 'active',
            description: 'Auto: temporada anterior',
        },
        { onConflict: 'source_tournament_id,target_tournament_id,relation_type' },
    );
}

/**
 * Dentro del cluster conexo de temporadas, agrega aristas previous_season entre años consecutivos
 * (según season_id / sufijo de slug / año en nombre).
 */
export async function ensureChronologicalSeasonEdgesForCluster(db: AnyDb, startId: string): Promise<void> {
    const ids = Array.from(await collectSeasonLinkedTournamentIds(db, startId));
    if (ids.length < 2) return;

    const { data: rows, error } = await db
        .from('tournaments')
        .select('id, season_id, slug, display_name, name')
        .in('id', ids);
    if (error || !rows?.length) return;

    const scored = (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        year: parseYearFromTournamentRow({
            season_id: r.season_id as string | null,
            slug: r.slug as string | null,
            display_name: r.display_name as string | null,
            name: r.name as string | null,
        }),
    }));
    scored.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

    for (let i = 0; i < scored.length - 1; i += 1) {
        const older = scored[i];
        const newer = scored[i + 1];
        if (older.year <= 0 || newer.year <= 0) continue;
        if (older.year >= newer.year) continue;
        await upsertPreviousSeasonEdge(db, older.id, newer.id);
    }
}

/**
 * Si el slug termina en -YYYY, busca otra edición misma competencia (mismo prefijo, mismo deporte/país)
 * con año menor más cercano.
 */
export async function autoDetectPreviousSeasonTournamentId(
    db: AnyDb,
    newRow: {
        id: string;
        sport_id?: string | null;
        country_id?: string | null;
        slug?: string | null;
        season_id?: string | null;
        display_name?: string | null;
        name?: string | null;
    },
): Promise<string | null> {
    const newYear = parseYearFromTournamentRow(newRow);
    const base = parseSlugSeasonBase(newRow.slug);
    if (!base || newYear <= 0) return null;

    let query = db.from('tournaments').select('id, slug, season_id, display_name, name').neq('id', newRow.id);

    if (newRow.sport_id != null && String(newRow.sport_id).trim()) {
        query = query.eq('sport_id', String(newRow.sport_id).trim());
    }
    if (newRow.country_id != null && String(newRow.country_id).trim()) {
        query = query.eq('country_id', String(newRow.country_id).trim());
    }

    const { data: candidates, error } = await query;
    if (error || !candidates?.length) return null;

    const prefix = `${base}-`;
    let best: { id: string; year: number } | null = null;
    for (const c of candidates as Array<Record<string, unknown>>) {
        const slug = String(c.slug || '');
        if (!slug.startsWith(prefix)) continue;
        const y = parseYearFromTournamentRow({
            season_id: c.season_id as string | null,
            slug: c.slug as string | null,
            display_name: c.display_name as string | null,
            name: c.name as string | null,
        });
        if (y <= 0 || y >= newYear) continue;
        if (!best || y > best.year) best = { id: String(c.id), year: y };
    }
    return best?.id ?? null;
}
