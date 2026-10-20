// Torneos cargados a mano (gestor) que la portada y el onboarding listan junto a
// los del catálogo estático.
//
// Un solo pedido compartido: la portada, el selector de ligas del onboarding y
// cualquier pantalla que lo necesite reusan la misma promesa en vez de repetir
// el fetch y el mapeo. Vive 5 minutos (lo mismo que el Cache-Control del
// endpoint); si falla no se guarda, para que el próximo intento reintente.

import { resolveCountryId } from '@/lib/data/countries';
import type { Tournament } from '@/lib/types';
import { resolveTournamentAudience } from '@/lib/utils/tournamentAudience';

interface ManualTournamentApiItem {
    id: string;
    name: string;
    display_name?: string | null;
    sport_id?: string | null;
    country?: string | null;
    country_id?: string | null;
    priority?: number | null;
    logo_url?: string | null;
    category?: string | null;
    season_id?: string | number | null;
    is_visible?: boolean | null;
    age_grade?: string | null;
    format?: Tournament['format'] | null;
    subcategory?: string | null;
    gender?: string | null;
    union_id?: string | null;
    /** 'regional' | 'nacional' | null (de una unión). Solo lo usa el onboarding para ordenar. */
    scope?: string | null;
}

function mapManualTournament(t: ManualTournamentApiItem): Tournament {
    return {
        id: t.id,
        name: t.display_name || t.name,
        nameEs: t.display_name || t.name,
        url: `/tournaments/${t.id}`,
        type: 'local',
        sportId: t.sport_id as Tournament['sportId'],
        countryId: resolveCountryId(t.country_id, t.country),
        priority: typeof t.priority === 'number' ? t.priority : 0,
        logoUrl: t.logo_url,
        categories: t.category ? [t.category.toLowerCase()] : [],
        // Escalar y no lista de un elemento: ver el mismo mapeo en /tournaments.
        seasonId: t.season_id ? String(t.season_id) : null,
        subcategory: t.subcategory ?? null,
        gender: t.gender ?? null,
        unionId: t.union_id ?? null,
        isVisible: t.is_visible,
        isWomen: t.category?.toLowerCase() === 'women',
        isYouth: resolveTournamentAudience({ ageGrade: t.age_grade, category: t.category }) === 'juveniles',
        ageGroup: t.age_grade,
        format: t.format,
    };
}

const TTL_MS = 5 * 60 * 1000;

let cached: { at: number; promise: Promise<ManualTournamentApiItem[]> } | null = null;

function loadRaw(): Promise<ManualTournamentApiItem[]> {
    if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;

    const promise = fetch('/api/home/manual-tournaments', { cache: 'default' })
        .then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
            return Array.isArray(payload.data) ? payload.data as ManualTournamentApiItem[] : [];
        })
        .catch((error) => {
            if (cached?.promise === promise) cached = null;
            throw error;
        });

    cached = { at: Date.now(), promise };
    return promise;
}

export function loadManualTournaments(): Promise<Tournament[]> {
    return loadRaw().then((items) => items.map(mapManualTournament));
}

/** Alcance de cada torneo de la base (id → 'regional' | 'nacional' | null), de la misma respuesta cacheada. */
export function loadManualScopes(): Promise<Map<string, string | null>> {
    return loadRaw().then((items) => new Map(items.map((item) => [item.id, item.scope ?? null])));
}
