import 'server-only';
// Lo mínimo que necesita el <head> de una ficha pública: nombre, contexto y si
// existe. Antes torneo, partido y club salían con el título de la portada y un
// id inexistente contestaba 200, así que Google veía cientos de copias de la
// home y cada error como página buena.
//
// Una consulta chica por ficha, aparte de la carga pesada de la página. Lo que
// no existe sale con noindex (ver `missingMetadata` en sectionMeta.ts: un 404
// de verdad no se puede mandar mientras el layout raíz tenga su <Suspense>).

import { cache } from 'react';

import { getReadClient } from '@/lib/supabase/read';
import { APP_TIMEZONE } from '@/lib/timezone';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

/** El auditor de SEO avisa desde 156 caracteres: se corta en la palabra. */
export function clipDescription(text: string, max = 155): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,.;:·-]+$/, '')}…`;
}

export { openGraphFor } from './sectionMeta';

/** `value` null con `missing` true: la base contestó y no está (404). Con
 * `missing` false no se pudo saber (error de red) y no se inventa un 404. */
type Lookup<T> = { value: T | null; missing: boolean };

// --- Torneo ------------------------------------------------------------------

export type TournamentSeo = {
    id: string;
    slug: string | null;
    name: string;
    sport: string | null;
    country: string | null;
    logoUrl: string | null;
};

type TournamentRow = {
    id: string;
    slug: string | null;
    name: string | null;
    display_name: string | null;
    sport_name: string | null;
    sport: string | null;
    country_name: string | null;
    country: string | null;
    logo_url: string | null;
    is_visible: boolean | null;
};

/**
 * Un torneo de la base por UUID o slug. `definitive` dice si la ausencia es un
 * 404 de verdad (la base contestó y no está) o si no se pudo saber (error de
 * red): en ese caso la página sigue por su camino y no se inventa un 404.
 */
export const loadTournamentSeo = cache(async (id: string): Promise<Lookup<TournamentSeo>> => {
    try {
        const supabase = await getReadClient();
        const column = isUuid(id) ? 'id' : 'slug';
        const { data: row, error } = await supabase
            .from('tournaments')
            .select('id, slug, name, display_name, sport_name, sport, country_name, country, logo_url, is_visible')
            .eq(column, id)
            .limit(1)
            .maybeSingle();
        if (error) return { value: null, missing: false };
        const data = row as TournamentRow | null;
        if (!data || data.is_visible === false) return { value: null, missing: true };
        return {
            missing: false,
            value: {
                id: data.id,
                slug: data.slug,
                name: (data.display_name || data.name || '').trim() || 'Torneo',
                sport: data.sport_name || data.sport,
                country: data.country_name || data.country,
                logoUrl: data.logo_url,
            },
        };
    } catch {
        return { value: null, missing: false };
    }
});

// --- Club --------------------------------------------------------------------

export type ClubSeo = {
    id: string;
    hidden: boolean;
    name: string;
    city: string | null;
    country: string | null;
    sport: string | null;
    logoUrl: string | null;
};

type ClubRow = {
    id: string;
    name: string | null;
    city: string | null;
    country: string | null;
    sport: string | null;
    logo_url: string | null;
    is_visible: boolean | null;
    visibility: string | null;
};

export const loadClubSeo = cache(async (id: string): Promise<Lookup<ClubSeo>> => {
    try {
        const supabase = await getReadClient();
        // El id de un club es texto ('getxo-rugby'), no un UUID; algunos se
        // enlazan por slug. Primero el id, después el slug.
        const byColumn = (column: 'id' | 'slug') => supabase
            .from('clubs')
            .select('id, name, city, country, sport, logo_url, is_visible, visibility')
            .eq(column, id)
            .limit(1)
            .maybeSingle();
        let { data: row, error } = await byColumn('id');
        if (!error && !row) ({ data: row, error } = await byColumn('slug'));
        if (error) return { value: null, missing: false };
        const data = row as ClubRow | null;
        if (!data) return { value: null, missing: true };
        return {
            missing: false,
            value: {
                id: data.id,
                // Oculto no es inexistente: las categorías de un club son clubes
                // ocultos y el gestor las enlaza. Se sirven, pero sin indexar.
                hidden: data.is_visible === false || data.visibility === 'hidden',
                name: (data.name || '').trim() || 'Club',
                city: data.city,
                country: data.country,
                sport: data.sport,
                logoUrl: data.logo_url,
            },
        };
    } catch {
        return { value: null, missing: false };
    }
});

// --- Partido -----------------------------------------------------------------

export type MatchSeo = {
    id: string;
    hidden: boolean;
    home: string;
    away: string;
    tournament: string | null;
    dateLabel: string | null;
    isoDate: string | null;
    status: string | null;
    homeScore: number | null;
    awayScore: number | null;
    venue: string | null;
};

type NameRef = { name: string | null; display_name?: string | null } | null;

type MatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: { home?: number | null; away?: number | null } | null;
    venue: string | null;
    is_visible: boolean | null;
    home_source_label: string | null;
    away_source_label: string | null;
    home: NameRef | NameRef[];
    away: NameRef | NameRef[];
    tournament: NameRef | NameRef[];
};

function one(ref: NameRef | NameRef[]): NameRef {
    return Array.isArray(ref) ? ref[0] ?? null : ref;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});

export const loadMatchSeo = cache(async (id: string): Promise<Lookup<MatchSeo>> => {
    // Los partidos de proveedor (FlashScore, ESPN…) no tienen fila: su ficha
    // se arma en el cliente y no hay nada que consultar acá.
    if (!isUuid(id)) return { value: null, missing: false };
    try {
        const supabase = await getReadClient();
        const { data: row, error } = await supabase
            .from('matches')
            .select(
                'id, date_time, status, score, venue, is_visible, home_source_label, away_source_label, '
                + 'home:clubs!matches_home_club_id_fkey(name), away:clubs!matches_away_club_id_fkey(name), '
                + 'tournament:tournaments!matches_tournament_id_fkey(name, display_name)',
            )
            .eq('id', id)
            .limit(1)
            .maybeSingle();
        if (error) return { value: null, missing: false };
        const data = row as MatchRow | null;
        if (!data) return { value: null, missing: true };

        const tournament = one(data.tournament);
        const homeScore = typeof data.score?.home === 'number' ? data.score.home : null;
        const awayScore = typeof data.score?.away === 'number' ? data.score.away : null;
        const date = data.date_time ? new Date(data.date_time) : null;
        return {
            missing: false,
            value: {
                id: data.id,
                hidden: data.is_visible === false,
                home: one(data.home)?.name?.trim() || data.home_source_label || 'Local',
                away: one(data.away)?.name?.trim() || data.away_source_label || 'Visitante',
                tournament: (tournament?.display_name || tournament?.name || '').trim() || null,
                dateLabel: date && !Number.isNaN(date.getTime()) ? DATE_FORMAT.format(date) : null,
                isoDate: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
                status: data.status,
                homeScore,
                awayScore,
                venue: data.venue?.trim() || null,
            },
        };
    } catch {
        return { value: null, missing: false };
    }
});

/** El marcador solo cuenta si el partido terminó y no es el 0-0 de "sin cargar". */
export function finalScore(match: MatchSeo): string | null {
    if (match.status !== 'final' || match.homeScore === null || match.awayScore === null) return null;
    if (match.homeScore === 0 && match.awayScore === 0) return null;
    return `${match.homeScore}-${match.awayScore}`;
}
