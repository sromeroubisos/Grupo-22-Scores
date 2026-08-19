/**
 * Mantiene tournament_relations (previous_season) para que el selector de temporadas
 * en la ficha pública agrupe todas las ediciones sin SQL manual.
 */

type AnyDb = {
    from: (t: string) => any;
};

const SEASON_LINK_TYPES = ['previous_season', 'next_season'];
const TOURNAMENT_SEASON_SELECT =
    'id, tournament_id, legacy_tournament_id, copied_from_season_id, season_code, name, display_name, status, is_active, start_date, end_date, created_at, champion_club_id, settings';

export type TournamentSeasonFamilyRow = {
    id: string;
    tournament_id: string;
    legacy_tournament_id?: string | null;
    copied_from_season_id?: string | null;
    season_code: string | null;
    name: string | null;
    display_name: string | null;
    status: string | null;
    is_active: boolean | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
    champion_club_id?: string | null;
    settings?: Record<string, unknown> | null;
};

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

function addId(into: Set<string>, value: unknown): boolean {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || into.has(id)) return false;
    into.add(id);
    return true;
}

function mergeSeasonRows(into: Map<string, TournamentSeasonFamilyRow>, rows: unknown): boolean {
    if (!Array.isArray(rows)) return false;
    let grew = false;
    for (const row of rows as TournamentSeasonFamilyRow[]) {
        if (!row?.id || into.has(row.id)) continue;
        into.set(row.id, row);
        grew = true;
    }
    return grew;
}

async function getSeasonRowsBy(
    db: AnyDb,
    column: 'id' | 'tournament_id' | 'legacy_tournament_id' | 'copied_from_season_id',
    ids: Set<string>,
): Promise<TournamentSeasonFamilyRow[]> {
    if (ids.size === 0) return [];
    const query = db
        .from('tournament_seasons')
        .select(TOURNAMENT_SEASON_SELECT);

    const { data, error } = column === 'id'
        ? await query.in('id', Array.from(ids))
        : await query.in(column, Array.from(ids));
    if (error || !Array.isArray(data)) return [];
    return data as TournamentSeasonFamilyRow[];
}

/**
 * Returns every internal tournament_seasons row that belongs to the same season family:
 * same tournament_id, same legacy_tournament_id, or any transitive copied_from_season_id chain.
 */
export async function collectTournamentSeasonFamilyRows(
    db: AnyDb,
    tournamentIds: Set<string>,
    requestedSeasonId?: string | null,
): Promise<TournamentSeasonFamilyRow[]> {
    const ownerIds = new Set<string>(Array.from(tournamentIds).filter(Boolean));
    const knownSeasonIds = new Set<string>();
    const requested = typeof requestedSeasonId === 'string' ? requestedSeasonId.trim() : '';
    if (requested) knownSeasonIds.add(requested);

    const rowsById = new Map<string, TournamentSeasonFamilyRow>();
    let grew = true;
    while (grew) {
        grew = false;
        const [byTournament, byLegacyTournament, byKnownId, byCopiedFrom] = await Promise.all([
            getSeasonRowsBy(db, 'tournament_id', ownerIds),
            getSeasonRowsBy(db, 'legacy_tournament_id', ownerIds),
            getSeasonRowsBy(db, 'id', knownSeasonIds),
            getSeasonRowsBy(db, 'copied_from_season_id', knownSeasonIds),
        ]);

        grew = mergeSeasonRows(rowsById, byTournament) || grew;
        grew = mergeSeasonRows(rowsById, byLegacyTournament) || grew;
        grew = mergeSeasonRows(rowsById, byKnownId) || grew;
        grew = mergeSeasonRows(rowsById, byCopiedFrom) || grew;

        for (const row of rowsById.values()) {
            grew = addId(ownerIds, row.tournament_id) || grew;
            grew = addId(ownerIds, row.legacy_tournament_id) || grew;
            grew = addId(knownSeasonIds, row.id) || grew;
            grew = addId(knownSeasonIds, row.copied_from_season_id) || grew;
        }
    }

    return Array.from(rowsById.values()).sort((left, right) => {
        const leftCode = String(left.season_code || '');
        const rightCode = String(right.season_code || '');
        const leftYear = Number.parseInt(leftCode, 10);
        const rightYear = Number.parseInt(rightCode, 10);
        if (Number.isFinite(leftYear) && Number.isFinite(rightYear) && leftYear !== rightYear) {
            return rightYear - leftYear;
        }
        return rightCode.localeCompare(leftCode, 'es') || String(right.created_at || '').localeCompare(String(left.created_at || ''));
    });
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
