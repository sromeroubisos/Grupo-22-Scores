// Salida 22 Awards y Corner Corto Awards: dónde se guarda lo que hace la gente.
//
// Cinco tablas de la migración 20261027120000_create_awards.sql, todas con RLS
// cerrada: se leen y escriben solo con service_role desde /api/awards. Sin las
// tablas no hay premios: la página le dice a quien administra qué migración
// falta, y al hincha no le muestra nada.

import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import {
    FINALISTS_PER_CATEGORY,
    XI_SIZE,
    acceptsNominations,
    isAwardStage,
    isSeniorCategory,
    isVotableKind,
    type AwardCategory,
    type AwardEditionConfig,
    type AwardStage,
} from '@/lib/awards/config';
import { pickFinalists, rankCandidates, votePercentages, type NominationRow } from '@/lib/awards/finalists';

const PAGE = 1000;

export const AWARDS_MIGRATION = '20261027120000_create_awards.sql';
export const AWARDS_UNAVAILABLE = `Los premios todavía no están habilitados: falta correr la migración ${AWARDS_MIGRATION}.`;

export class AwardsUnavailableError extends Error {
    constructor() {
        super(AWARDS_UNAVAILABLE);
        this.name = 'AwardsUnavailableError';
    }
}

/** Una regla del juego (etapa equivocada, votación cerrada...): se contesta con su propio estado HTTP. */
export class AwardsRuleError extends Error {
    readonly status: number;
    constructor(message: string, status = 409) {
        super(message);
        this.name = 'AwardsRuleError';
        this.status = status;
    }
}

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function fail(scope: string, error: unknown, table: string): never {
    if (isMissingTableError(error as never, table)) throw new AwardsUnavailableError();
    console.error(`[awards] ${scope} failed:`, error);
    throw new Error('No se pudo acceder a los premios.');
}

/** Lee una tabla de la edición de a 1000 filas (PostgREST corta ahí). */
async function readAll(
    table: string,
    edition: string,
    columns: string,
    extra?: (query: any) => any,
): Promise<Row[]> {
    const admin = createAdminClient();
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
        let query: any = admin.from(table).select(columns).eq('edition', edition);
        if (extra) query = extra(query);
        const { data, error } = await query.order('created_at', { ascending: true }).range(from, from + PAGE - 1);
        if (error) fail(`read ${table}`, error, table);
        const rows = (data ?? []) as Row[];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

// ── Edición ───────────────────────────────────────────────────────────────

export interface AwardEditionState {
    slug: string;
    season: number;
    stage: AwardStage;
    nominationsCloseAt: string | null;
    votingCloseAt: string | null;
}

export async function getEditionState(config: AwardEditionConfig): Promise<AwardEditionState> {
    const { data, error } = await createAdminClient()
        .from('award_editions')
        .select('slug, season, stage, nominations_close_at, voting_close_at')
        .eq('slug', config.slug)
        .maybeSingle();
    if (error) fail('edition read', error, 'award_editions');
    const row = (data ?? null) as Row | null;
    if (!row) {
        // La migración siembra las dos ediciones; si falta la fila se crea.
        const season = new Date().getFullYear();
        const { error: insertError } = await createAdminClient()
            .from('award_editions')
            .upsert({ slug: config.slug, season }, { onConflict: 'slug' });
        if (insertError) fail('edition create', insertError, 'award_editions');
        return { slug: config.slug, season, stage: 'postulaciones', nominationsCloseAt: null, votingCloseAt: null };
    }
    return {
        slug: config.slug,
        season: count(row.season) || new Date().getFullYear(),
        stage: isAwardStage(row.stage) ? row.stage : 'postulaciones',
        nominationsCloseAt: text(row.nominations_close_at),
        votingCloseAt: text(row.voting_close_at),
    };
}

export async function updateEdition(
    slug: string,
    patch: { stage?: AwardStage; nominationsCloseAt?: string | null; votingCloseAt?: string | null },
): Promise<void> {
    const update: Row = { updated_at: new Date().toISOString() };
    if (patch.stage) update.stage = patch.stage;
    if (patch.nominationsCloseAt !== undefined) update.nominations_close_at = patch.nominationsCloseAt;
    if (patch.votingCloseAt !== undefined) update.voting_close_at = patch.votingCloseAt;
    const { error } = await createAdminClient().from('award_editions').update(update).eq('slug', slug);
    if (error) fail('edition update', error, 'award_editions');
}

// ── Postulaciones ─────────────────────────────────────────────────────────

export interface NewNomination {
    edition: string;
    category: string;
    userId: string;
    subjectKey: string;
    subjectName: string;
    personId: string | null;
    clubId: string | null;
    clubName: string | null;
    note: string;
}

/** false = ese usuario ya había postulado a esa persona en esa categoría. */
export async function addNomination(input: NewNomination): Promise<boolean> {
    const { error } = await createAdminClient().from('award_nominations').insert({
        edition: input.edition,
        category: input.category,
        user_id: input.userId,
        subject_key: input.subjectKey,
        subject_name: input.subjectName,
        person_id: input.personId,
        club_id: input.clubId,
        club_name: input.clubName,
        note: input.note,
    });
    if (error) {
        if ((error as { code?: string }).code === '23505') return false;
        fail('nomination insert', error, 'award_nominations');
    }
    return true;
}

/** Cuántas postulaciones hizo esa persona en la categoría (el tope evita que una sola persona inunde). */
export async function countUserNominations(edition: string, category: string, userId: string): Promise<number> {
    const { count: total, error } = await createAdminClient()
        .from('award_nominations')
        .select('id', { count: 'exact', head: true })
        .eq('edition', edition)
        .eq('category', category)
        .eq('user_id', userId);
    if (error) fail('nomination count', error, 'award_nominations');
    return total ?? 0;
}

async function listUserNominations(edition: string, userId: string): Promise<Record<string, string[]>> {
    const rows = await readAll('award_nominations', edition, 'category, subject_name, user_id, created_at', (q) => q.eq('user_id', userId));
    const out: Record<string, string[]> = {};
    for (const row of rows) {
        const category = text(row.category);
        const name = text(row.subject_name);
        if (!category || !name) continue;
        (out[category] ??= []).push(name);
    }
    return out;
}

function toNominationRow(row: Row): NominationRow | null {
    const userId = text(row.user_id);
    const subjectKey = text(row.subject_key);
    const subjectName = text(row.subject_name);
    if (!userId || !subjectKey || !subjectName) return null;
    return {
        userId,
        subjectKey,
        subjectName,
        personId: text(row.person_id),
        clubId: text(row.club_id),
        clubName: text(row.club_name),
        status: text(row.status) ?? 'pending',
        createdAt: text(row.created_at) ?? '',
        note: text(row.note) ?? '',
    };
}

async function readNominationRows(edition: string): Promise<Map<string, NominationRow[]>> {
    const rows = await readAll('award_nominations', edition, 'category, user_id, subject_key, subject_name, person_id, club_id, club_name, status, note, created_at');
    const byCategory = new Map<string, NominationRow[]>();
    for (const row of rows) {
        const category = text(row.category);
        const parsed = toNominationRow(row);
        if (!category || !parsed) continue;
        const list = byCategory.get(category) ?? [];
        list.push(parsed);
        byCategory.set(category, list);
    }
    return byCategory;
}

// ── Jugadas de los pibes ──────────────────────────────────────────────────

export interface NewPlay {
    edition: string;
    userId: string | null;
    url: string;
    title: string;
    clubId: string | null;
    clubName: string | null;
    ageGroup: string;
    description: string;
    consent: boolean;
    via: 'link' | 'email';
}

export async function addPlay(input: NewPlay): Promise<void> {
    const { error } = await createAdminClient().from('award_plays').insert({
        edition: input.edition,
        user_id: input.userId,
        url: input.url,
        title: input.title,
        club_id: input.clubId,
        club_name: input.clubName,
        age_group: input.ageGroup,
        description: input.description,
        consent: input.consent,
        via: input.via,
        // Una jugada cargada por un editor (llegó por mail) ya está revisada.
        status: input.via === 'email' ? 'approved' : 'pending',
    });
    if (error) fail('play insert', error, 'award_plays');
}

export interface PlayView {
    id: string;
    url: string;
    title: string;
    clubName: string | null;
    ageGroup: string;
    description: string;
    via: string;
    status: string;
    createdAt: string;
}

export async function listPlays(edition: string): Promise<PlayView[]> {
    const rows = await readAll('award_plays', edition, 'id, url, title, club_name, age_group, description, via, status, created_at');
    return rows.flatMap((row) => {
        const id = text(row.id);
        const url = text(row.url);
        if (!id || !url) return [];
        return [{
            id,
            url,
            title: text(row.title) ?? '',
            clubName: text(row.club_name),
            ageGroup: text(row.age_group) ?? '',
            description: text(row.description) ?? '',
            via: text(row.via) ?? 'link',
            status: text(row.status) ?? 'pending',
            createdAt: text(row.created_at) ?? '',
        }];
    });
}

export async function moderatePlay(edition: string, playId: string, status: 'approved' | 'rejected' | 'pending'): Promise<void> {
    const { error } = await createAdminClient().from('award_plays').update({ status }).eq('edition', edition).eq('id', playId);
    if (error) fail('play moderate', error, 'award_plays');
}

// ── Revisión del comité ───────────────────────────────────────────────────

export interface CandidateAdminView {
    subjectKey: string;
    subjectName: string;
    clubName: string | null;
    support: number;
    notes: string[];
}

export interface AdminCategoryView {
    category: string;
    candidates: CandidateAdminView[];
    rejected: CandidateAdminView[];
}

export interface AdminOverview {
    categories: AdminCategoryView[];
    plays: PlayView[];
}

export async function getAdminOverview(config: AwardEditionConfig): Promise<AdminOverview> {
    const [byCategory, plays] = await Promise.all([readNominationRows(config.slug), listPlays(config.slug)]);
    const view = (c: ReturnType<typeof rankCandidates>[number]): CandidateAdminView => ({
        subjectKey: c.subjectKey,
        subjectName: c.subjectName,
        clubName: c.clubName,
        support: c.support,
        notes: c.notes,
    });
    const categories: AdminCategoryView[] = config.categories
        .filter((category) => acceptsNominations(category.kind))
        .map((category) => {
            const rows = byCategory.get(category.slug) ?? [];
            const rejectedRows = rows.filter((row) => row.status === 'rejected').map((row) => ({ ...row, status: 'pending' }));
            return {
                category: category.slug,
                candidates: rankCandidates(rows).map(view),
                rejected: rankCandidates(rejectedRows).map(view),
            };
        });
    return { categories, plays };
}

export async function moderateNomination(
    edition: string,
    category: string,
    subjectKey: string,
    status: 'pending' | 'rejected',
): Promise<void> {
    const { error } = await createAdminClient()
        .from('award_nominations')
        .update({ status })
        .eq('edition', edition)
        .eq('category', category)
        .eq('subject_key', subjectKey);
    if (error) fail('nomination moderate', error, 'award_nominations');
}

// ── La terna ──────────────────────────────────────────────────────────────

/**
 * Cierra las postulaciones y fija la terna: los más postulados de cada
 * categoría y las jugadas aprobadas. Solo desde la etapa de postulaciones;
 * reemplaza una terna anterior (sin votos todavía) y abre la votación.
 */
export async function buildFinalistsAndOpenVoting(config: AwardEditionConfig): Promise<{ created: number; empty: string[] }> {
    const state = await getEditionState(config);
    if (state.stage !== 'postulaciones') {
        throw new AwardsRuleError('La terna solo se arma mientras las postulaciones están abiertas.');
    }
    const admin = createAdminClient();
    const [byCategory, plays] = await Promise.all([readNominationRows(config.slug), listPlays(config.slug)]);

    const records: Row[] = [];
    const empty: string[] = [];
    for (const category of config.categories) {
        // Lo editorial lo carga un editor y sobrevive a la terna.
        if (category.kind === 'editorial') continue;
        if (category.kind === 'xi') {
            // Equipo ideal: los once más postulados, y solo si hay cobertura (once candidatos).
            const ranked = rankCandidates(byCategory.get(category.slug) ?? []);
            if (ranked.length < XI_SIZE) {
                empty.push(category.slug);
                continue;
            }
            ranked.slice(0, XI_SIZE).forEach((candidate, index) => {
                records.push({
                    edition: config.slug,
                    category: category.slug,
                    rank: index + 1,
                    subject_key: candidate.subjectKey,
                    subject_name: candidate.subjectName,
                    person_id: candidate.personId,
                    club_id: candidate.clubId,
                    club_name: candidate.clubName,
                    support: candidate.support,
                });
            });
            continue;
        }
        if (category.kind === 'play') {
            const approved = plays.filter((play) => play.status === 'approved').slice(0, FINALISTS_PER_CATEGORY + 3);
            if (approved.length === 0) empty.push(category.slug);
            approved.forEach((play, index) => {
                records.push({
                    edition: config.slug,
                    category: category.slug,
                    rank: index + 1,
                    subject_key: `play:${play.id}`,
                    subject_name: play.title || `Jugada de ${play.clubName ?? 'los pibes'}`,
                    club_name: play.clubName,
                    support: 0,
                    play_id: play.id,
                    play_url: play.url,
                });
            });
            continue;
        }
        const picked = pickFinalists(byCategory.get(category.slug) ?? [], FINALISTS_PER_CATEGORY);
        if (picked.length === 0) empty.push(category.slug);
        picked.forEach((candidate, index) => {
            records.push({
                edition: config.slug,
                category: category.slug,
                rank: index + 1,
                subject_key: candidate.subjectKey,
                subject_name: candidate.subjectName,
                person_id: candidate.personId,
                club_id: candidate.clubId,
                club_name: candidate.clubName,
                support: candidate.support,
            });
        });
    }

    const rebuilt = config.categories.filter((category) => category.kind !== 'editorial').map((category) => category.slug);
    const { error: deleteError } = await admin.from('award_finalists').delete().eq('edition', config.slug).in('category', rebuilt);
    if (deleteError) fail('finalists reset', deleteError, 'award_finalists');
    if (records.length > 0) {
        const { error: insertError } = await admin.from('award_finalists').insert(records);
        if (insertError) fail('finalists insert', insertError, 'award_finalists');
    }
    await updateEdition(config.slug, { stage: 'votacion' });
    return { created: records.length, empty };
}

// ── Votación ──────────────────────────────────────────────────────────────

export interface FinalistView {
    id: string;
    category: string;
    rank: number;
    name: string;
    clubId: string | null;
    clubName: string | null;
    logoUrl: string | null;
    playUrl: string | null;
    support: number;
    /** Nuestra lectura (categorías editoriales). */
    note: string;
    /** Solo en resultados. */
    votes?: number;
    percent?: number;
}

function toFinalist(row: Row): FinalistView | null {
    const id = text(row.id);
    const category = text(row.category);
    const name = text(row.subject_name);
    if (!id || !category || !name) return null;
    const clubId = text(row.club_id);
    const clubName = text(row.club_name);
    return {
        id,
        category,
        rank: count(row.rank),
        name,
        clubId,
        clubName,
        // El escudo siempre por el proxy: clubs.logo_url puede ser un base64 de 200 KB.
        logoUrl: clubId ? buildTeamLogoProxyUrl({ key: clubId, name: clubName ?? name }) : null,
        playUrl: text(row.play_url),
        support: count(row.support),
        note: text(row.note) ?? '',
    };
}

async function readFinalists(edition: string): Promise<FinalistView[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('award_finalists')
        .select('id, category, rank, subject_name, club_id, club_name, play_url, support, note')
        .eq('edition', edition)
        .order('rank', { ascending: true })
        .limit(PAGE);
    if (error) fail('finalists read', error, 'award_finalists');
    return ((data ?? []) as Row[]).map(toFinalist).filter((f): f is FinalistView => Boolean(f));
}

async function readVoteCounts(edition: string): Promise<Map<string, number>> {
    const admin = createAdminClient();
    const out = new Map<string, number>();
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
            .from('award_votes')
            .select('finalist_id, user_id')
            .eq('edition', edition)
            .order('user_id')
            .order('category')
            .range(from, from + PAGE - 1);
        if (error) fail('votes read', error, 'award_votes');
        const rows = (data ?? []) as Row[];
        for (const row of rows) {
            const finalistId = text(row.finalist_id);
            if (finalistId) out.set(finalistId, (out.get(finalistId) ?? 0) + 1);
        }
        if (rows.length < PAGE) break;
    }
    return out;
}

async function readMyVotes(edition: string, userId: string): Promise<Record<string, string>> {
    const { data, error } = await createAdminClient()
        .from('award_votes')
        .select('category, finalist_id')
        .eq('edition', edition)
        .eq('user_id', userId);
    if (error) fail('my votes read', error, 'award_votes');
    const out: Record<string, string> = {};
    for (const row of (data ?? []) as Row[]) {
        const category = text(row.category);
        const finalistId = text(row.finalist_id);
        if (category && finalistId) out[category] = finalistId;
    }
    return out;
}

/** Un voto por persona y categoría; volver a votar lo cambia. Solo en la etapa de votación. */
export async function castVote(config: AwardEditionConfig, category: AwardCategory, userId: string, finalistId: string): Promise<void> {
    if (!isVotableKind(category.kind)) throw new AwardsRuleError('Esa categoría no se vota.', 400);
    const state = await getEditionState(config);
    if (state.stage !== 'votacion') throw new AwardsRuleError('La votación no está abierta.');
    if (state.votingCloseAt && Date.parse(state.votingCloseAt) <= Date.now()) {
        throw new AwardsRuleError('La votación ya cerró.');
    }
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('award_finalists')
        .select('id')
        .eq('id', finalistId)
        .eq('edition', config.slug)
        .eq('category', category.slug)
        .maybeSingle();
    if (error) fail('finalist check', error, 'award_finalists');
    if (!data) throw new AwardsRuleError('Ese candidato no está en la terna.', 400);

    const { error: voteError } = await admin.from('award_votes').upsert({
        edition: config.slug,
        category: category.slug,
        user_id: userId,
        finalist_id: finalistId,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'edition,category,user_id' });
    if (voteError) fail('vote upsert', voteError, 'award_votes');
}

/**
 * Nuestra lectura de un premio de afuera (los mejores del mundo): un solo
 * ganador por categoría, con el comentario. Reemplaza el anterior; no se vota.
 */
export async function setEditorialPick(
    config: AwardEditionConfig,
    category: AwardCategory,
    pick: { name: string; detail: string; note: string },
): Promise<void> {
    if (category.kind !== 'editorial') throw new AwardsRuleError('Esa categoría no es editorial.', 400);
    const admin = createAdminClient();
    const { error: deleteError } = await admin.from('award_finalists').delete().eq('edition', config.slug).eq('category', category.slug);
    if (deleteError) fail('editorial reset', deleteError, 'award_finalists');
    const { error } = await admin.from('award_finalists').insert({
        edition: config.slug,
        category: category.slug,
        rank: 1,
        subject_key: `ed:${category.slug}`,
        subject_name: pick.name,
        club_name: pick.detail || null,
        note: pick.note,
        support: 0,
    });
    if (error) fail('editorial insert', error, 'award_finalists');
}

// ── Lo que ve la página ───────────────────────────────────────────────────

export interface ClubTally {
    clubId: string | null;
    clubName: string;
    logoUrl: string | null;
    votes: number;
}

export interface AwardsPublicState {
    available: true;
    edition: AwardEditionState;
    finalists: FinalistView[];
    myVotes: Record<string, string>;
    myNominations: Record<string, string[]>;
    clubTally: ClubTally[];
    totalVotes: number;
}

export type AwardsPublicResult = AwardsPublicState | { available: false; migration: string };

/**
 * El estado de una edición para quien la mira. Durante la votación NO se
 * muestran los conteos (nadie vota arrastrado por el resultado parcial);
 * en resultados sí, con porcentajes y el pulso por club.
 */
export async function getPublicState(config: AwardEditionConfig, userId: string | null): Promise<AwardsPublicResult> {
    try {
        const edition = await getEditionState(config);
        const [storedFinalists, myNominations, myVotes] = await Promise.all([
            edition.stage === 'postulaciones' ? Promise.resolve([] as FinalistView[]) : readFinalists(config.slug),
            userId ? listUserNominations(config.slug, userId) : Promise.resolve({} as Record<string, string[]>),
            userId && edition.stage !== 'postulaciones' ? readMyVotes(config.slug, userId) : Promise.resolve({} as Record<string, string>),
        ]);

        // El resultado de las postulaciones lo ve solo quien administra (por /admin). A quien vota
        // no le llega ni cuántas postulaciones tuvo cada candidato ni el orden de la terna, que
        // salía de ese ranking: se ordena por nombre y se borra el apoyo.
        const finalists = [...storedFinalists]
            .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id))
            .map((finalist, index) => ({ ...finalist, rank: index + 1, support: 0 }));

        let clubTally: ClubTally[] = [];
        let totalVotes = 0;
        let shown = finalists;
        if (edition.stage === 'resultados') {
            const counts = await readVoteCounts(config.slug);
            const byCategory = new Map<string, FinalistView[]>();
            for (const finalist of finalists) {
                const list = byCategory.get(finalist.category) ?? [];
                list.push(finalist);
                byCategory.set(finalist.category, list);
            }
            const withVotes: FinalistView[] = [];
            for (const list of byCategory.values()) {
                const percents = votePercentages(list.map((f) => counts.get(f.id) ?? 0));
                list.forEach((f, i) => withVotes.push({ ...f, votes: counts.get(f.id) ?? 0, percent: percents[i] }));
            }
            shown = withVotes.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.rank - b.rank);
            totalVotes = [...counts.values()].reduce((sum, n) => sum + n, 0);

            const clubs = new Map<string, ClubTally>();
            for (const f of shown) {
                if (!f.clubName || !f.votes) continue;
                const key = f.clubId ?? f.clubName;
                const entry = clubs.get(key) ?? { clubId: f.clubId, clubName: f.clubName, logoUrl: f.logoUrl, votes: 0 };
                entry.votes += f.votes;
                clubs.set(key, entry);
            }
            clubTally = [...clubs.values()].sort((a, b) => b.votes - a.votes || a.clubName.localeCompare(b.clubName)).slice(0, 8);
        }

        return { available: true, edition, finalists: shown, myVotes, myNominations, clubTally, totalVotes };
    } catch (error) {
        if (error instanceof AwardsUnavailableError) return { available: false, migration: AWARDS_MIGRATION };
        throw error;
    }
}

// ── Buscadores para postular ──────────────────────────────────────────────

export interface ClubOption {
    id: string;
    name: string;
    city: string | null;
    logoUrl: string | null;
}

export interface PersonOption {
    id: string;
    name: string;
    clubId: string | null;
    clubName: string | null;
    /** El deporte del club del jugador, si tiene club. */
    sport: string | null;
}

/** Saca lo que rompe un filtro de PostgREST (comas, paréntesis, comodines). */
function cleanQuery(value: string): string {
    return value.replace(/[%_\\,()*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Filtro de PostgREST: club de plantel superior (sin categoría, o primera / mayores / femenino). */
const SENIOR_CLUB_FILTER = 'category.is.null,category.ilike.primera,category.ilike.mayores,category.ilike.femenino';

/**
 * Un jugador "debutó en primera" si figura en la formación de algún partido
 * de un club de plantel superior de esta edición. La formación de cada
 * partido lleva el id de la persona y se ata al club local o visitante, que
 * dice su categoría (M16, intermedia...; el de primera no lleva ninguna).
 * Puede ser menor de edad: lo que cuenta es haber jugado en primera.
 */
export async function hasDebutedInPrimera(config: AwardEditionConfig, personId: string): Promise<boolean> {
    const admin = createAdminClient();
    // `contains` por separado para local y visitante: un `or=()` de PostgREST se come las llaves del JSON.
    const [home, away] = await Promise.all([
        admin.from('matches').select('home_club_id').contains('lineups', { home: [{ id: personId }] }).limit(200),
        admin.from('matches').select('away_club_id').contains('lineups', { away: [{ id: personId }] }).limit(200),
    ]);
    if (home.error) throw home.error;
    if (away.error) throw away.error;
    const clubIds = new Set<string>();
    for (const row of (home.data ?? []) as Row[]) {
        const id = text(row.home_club_id);
        if (id) clubIds.add(id);
    }
    for (const row of (away.data ?? []) as Row[]) {
        const id = text(row.away_club_id);
        if (id) clubIds.add(id);
    }
    if (clubIds.size === 0) return false;
    const { data, error } = await admin.from('clubs').select('id, sport, category').in('id', [...clubIds]);
    if (error) throw error;
    return ((data ?? []) as Row[]).some((club) => {
        const sport = text(club.sport);
        return (!sport || config.sports.includes(sport)) && isSeniorCategory(text(club.category));
    });
}

export async function searchClubs(config: AwardEditionConfig, query: string, seniorOnly = false): Promise<ClubOption[]> {
    const q = cleanQuery(query);
    if (q.length < 2) return [];
    let request = createAdminClient()
        .from('clubs')
        .select('id, name, city')
        .in('sport', config.sports)
        .neq('is_visible', false)
        .ilike('name', `%${q}%`);
    // Postular a un equipo: solo plantel superior, no las categorías de juveniles.
    if (seniorOnly) request = request.or(SENIOR_CLUB_FILTER);
    const { data, error } = await request.order('name').limit(8);
    if (error) throw error;
    return ((data ?? []) as Row[]).flatMap((row) => {
        const id = text(row.id);
        const name = text(row.name);
        if (!id || !name) return [];
        return [{ id, name, city: text(row.city), logoUrl: buildTeamLogoProxyUrl({ key: id, name }) }];
    });
}

/** Jugadores de la base (people) cuyo club es de esta edición, o sin club asignado. */
export async function searchPeople(config: AwardEditionConfig, query: string): Promise<PersonOption[]> {
    const q = cleanQuery(query);
    if (q.length < 3) return [];
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('people')
        .select('id, full_name, name, club_id')
        .or(`full_name.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(30);
    if (error) throw error;
    const people = (data ?? []) as Row[];
    const clubIds = [...new Set(people.map((row) => text(row.club_id)).filter((id): id is string => Boolean(id)))];
    const clubs = new Map<string, { name: string; sport: string | null }>();
    if (clubIds.length > 0) {
        const { data: clubRows, error: clubError } = await admin.from('clubs').select('id, name, sport').in('id', clubIds);
        if (clubError) throw clubError;
        for (const club of (clubRows ?? []) as Row[]) {
            const id = text(club.id);
            if (id) clubs.set(id, { name: text(club.name) ?? '', sport: text(club.sport) });
        }
    }
    const candidates = people.flatMap((row) => {
        const id = text(row.id);
        const name = text(row.full_name) ?? text(row.name);
        if (!id || !name) return [];
        const clubId = text(row.club_id);
        const club = clubId ? clubs.get(clubId) : undefined;
        if (club && club.sport && !config.sports.includes(club.sport)) return [];
        // Rugby local: solo jugadores de la base con un club de esa edición.
        if (config.playersFromDb && !club) return [];
        return [{ id, name, clubId: club ? clubId : null, clubName: club?.name ?? null, sport: club?.sport ?? null }];
    }).slice(0, 12);
    if (!config.requireDebut) return candidates.slice(0, 8);
    // Solo se ofrece a quien ya debutó en primera (aunque sea menor de edad).
    const debuted = await Promise.all(candidates.map((person) => hasDebutedInPrimera(config, person.id).catch(() => false)));
    return candidates.filter((_, index) => debuted[index]).slice(0, 8);
}

export async function findClub(config: AwardEditionConfig, clubId: string, seniorOnly = false): Promise<ClubOption | null> {
    const { data, error } = await createAdminClient()
        .from('clubs')
        .select('id, name, city, sport, category')
        .eq('id', clubId)
        .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Row | null;
    const id = text(row?.id);
    const name = text(row?.name);
    const sport = text(row?.sport);
    if (!id || !name || (sport && !config.sports.includes(sport))) return null;
    if (seniorOnly && !isSeniorCategory(text(row?.category))) return null;
    return { id, name, city: text(row?.city), logoUrl: buildTeamLogoProxyUrl({ key: id, name }) };
}

export async function findPerson(personId: string): Promise<PersonOption | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from('people').select('id, full_name, name, club_id').eq('id', personId).maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Row | null;
    const id = text(row?.id);
    const name = text(row?.full_name) ?? text(row?.name);
    if (!id || !name) return null;
    const clubId = text(row?.club_id);
    let clubName: string | null = null;
    let sport: string | null = null;
    if (clubId) {
        const { data: club } = await admin.from('clubs').select('name, sport').eq('id', clubId).maybeSingle();
        clubName = text((club as Row | null)?.name);
        sport = text((club as Row | null)?.sport);
    }
    return { id, name, clubId, clubName, sport };
}
