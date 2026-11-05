import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getReadClient } from '@/lib/supabase/read';
import {
    findExternalTeamLogoOverride,
    mergeExternalTeamLogoOverrideRecords,
} from '@/lib/server/externalTeamLogoOverrides';
import { getExternalTournamentOverride } from '@/lib/server/externalTournamentOverrides';
import { getPlayerDetails, getTeamDetails } from '@/lib/services/flashscore';
import { getRugbyPassTournamentBranding } from '@/lib/services/rugbyPass';
import { parseRugbyPassTournamentId } from '@/lib/services/rugbyPassTournamentBundle';
import { isUuid } from '@/lib/utils/postgrest';
import { darkCrestSource } from '@/lib/exports/crestVariants';
import { safeFetchBuffer, SafeFetchError } from '@/lib/server/safeFetch';
import { TEAM_LOGO_SOURCE_REVALIDATE_SECONDS, TEAM_LOGO_SOURCE_TAG } from '@/lib/server/teamLogoSourceCache';

const LOGO_DIR = path.join(process.cwd(), 'public', 'logos', 'clubs');
const EXTENSIONS = ['.png', '.svg', '.webp', '.jpg', '.jpeg', '.avif'];
// Versioned URLs (carry a `v` cache-busting token) are immutable: the token changes when the
// logo changes, so we can cache hard. Non-versioned URLs refresh quickly in the browser so an
// updated logo shows up without waiting a day, while the CDN keeps a long copy to protect quota.
const PROXY_CACHE_CONTROL_VERSIONED = 'public, max-age=604800, s-maxage=604800, immutable';
const PROXY_CACHE_CONTROL_VOLATILE = 'public, max-age=300, s-maxage=604800, stale-while-revalidate=86400';
// La key con la que el export (buildProxyUrl en ExportImage.tsx) pide un escudo externo
// via `fallback`. No nombra a ningun club: es una etiqueta, no una busqueda.
const EXPORT_IMAGE_PROXY_KEY = 'export-image';

// `trustVersion` es la letra chica de "immutable": el token `v` vale una semana
// de cache sin revalidar SOLO si describe la imagen que se esta sirviendo. No la
// describe cuando el escudo es HEREDADO del club madre (el `v` es el
// `updated_at` de la categoria, que no se mueve si cambia el escudo de la madre)
// ni cuando lo que sale es el SVG de iniciales (no hay imagen que versionar).
// Congelar cualquiera de esos dos por siete dias es como se pego el escudo de
// "Tala Rugby Club Intermedia" en iniciales.
function resolveProxyCacheControl(url: URL, trustVersion = true): string {
    return trustVersion && url.searchParams.has('v')
        ? PROXY_CACHE_CONTROL_VERSIONED
        : PROXY_CACHE_CONTROL_VOLATILE;
}

// El `fallback` de la query lo escribe cualquiera en la barra de direcciones, y esta ruta
// hace el fetch desde el servidor: sin control, `?fallback=http://169.254.169.254/...`
// convierte al proxy en un telescopio hacia la red interna de Vercel. El control vive
// en `safeFetch` (destino validado al conectar y en cada redirect, tiempo y bytes con
// tope). Lo que queda aca es lo que vuelve: esta ruta es del MISMO origen que el sitio,
// asi que cualquier cosa que no sea una imagen verificada —un `text/html`, un SVG con
// <script>— seria XSS en g22. Por eso nunca se reenvia el tipo que declara el origen.
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
// ~5000x5000. El default de sharp (268 Mpx) deja que un PNG chiquito que declara
// 50000x50000 se coma la memoria de la funcion al decodificarse.
const LIMIT_INPUT_PIXELS = 25_000_000;
// Lado con el que se rasteriza un SVG cuando nadie pidio ancho (el export): alcanza
// para la placa mas grande sin volver el PNG un ladrillo.
const SVG_RASTER_WIDTH = 512;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
// Lo unico local que se sirve o se redirige: un archivo de imagen bajo public/.
const LOCAL_IMAGE_PATH = /^\/(?!\/)[A-Za-z0-9._\-/]+\.(?:png|jpe?g|webp|gif|avif|svg)$/i;

// `team_url` termina en el proveedor (getTeamDetails pide a RapidAPI con nuestra
// key): solo pasa si tiene la forma de un path de FlashScore, `/team/<slug>/<id>/`.
const FLASHSCORE_ENTITY_PATH = /^(?:https:\/\/(?:www\.)?flashscore\.[a-z.]{2,12})?\/(?:team|player)\/[a-z0-9_-]{1,80}\/[A-Za-z0-9]{4,16}\/?$/i;

function sanitizeTeamUrl(raw: string): string {
    return FLASHSCORE_ENTITY_PATH.test(raw) ? raw : '';
}

const BASE_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    // El navegador no adivina: si el tipo dice image/png, se trata como imagen.
    'X-Content-Type-Options': 'nosniff',
} as const;

// Una respuesta que no es imagen no lleva cuerpo: nada que un navegador pueda
// interpretar como documento.
function buildEmptyResponse(status: number) {
    return new NextResponse(null, {
        status,
        headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store' },
    });
}

function normalizeSourceUrl(source: string): string {
    const trimmed = source.trim();
    if (!trimmed) return trimmed;

    if (trimmed.startsWith('//')) {
        return `https:${trimmed}`;
    }

    if (trimmed.startsWith('/res/')) {
        return `https://static.flashscore.com${trimmed}`;
    }

    return trimmed;
}

function extractIdFromEntityUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let pathname = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            pathname = new URL(trimmed).pathname;
        } catch {
            pathname = trimmed;
        }
    }

    const segments = pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length < 2) return null;
    const entityType = segments[0].toLowerCase();
    if (entityType !== 'team' && entityType !== 'player') return null;

    const candidate = segments[segments.length - 1];
    if (!candidate || !/^[a-z0-9]+$/i.test(candidate)) return null;

    return candidate;
}

function addCandidate(candidates: Set<string>, value: string) {
    const extractedFromUrl = extractIdFromEntityUrl(value);
    const raw = (extractedFromUrl || value).trim();
    if (!raw) return;

    const normalized = raw.toLowerCase();
    candidates.add(raw);
    candidates.add(normalized);

    if (normalized.startsWith('fs-team-')) {
        const stripped = raw.slice(8);
        const strippedLower = normalized.slice(8);
        if (stripped) {
            candidates.add(stripped);
            candidates.add(strippedLower);
            candidates.add(`fs-${stripped}`);
            candidates.add(`fs-${strippedLower}`);
        }
        return;
    }

    if (normalized.startsWith('fs-')) {
        const stripped = raw.slice(3);
        const strippedLower = normalized.slice(3);
        if (stripped) {
            candidates.add(stripped);
            candidates.add(strippedLower);
            candidates.add(`fs-team-${stripped}`);
            candidates.add(`fs-team-${strippedLower}`);
        }
        return;
    }

    if (normalized.startsWith('ras-team-')) {
        const stripped = raw.slice(9);
        const strippedLower = normalized.slice(9);
        if (stripped) {
            candidates.add(stripped);
            candidates.add(strippedLower);
        }
        return;
    }

    if (normalized.startsWith('espn-team-')) {
        const stripped = raw.slice(10);
        const strippedLower = normalized.slice(10);
        if (stripped) {
            candidates.add(stripped);
            candidates.add(strippedLower);
        }
        return;
    }

    candidates.add(`fs-team-${raw}`);
    candidates.add(`fs-team-${normalized}`);
    candidates.add(`fs-${raw}`);
    candidates.add(`fs-${normalized}`);
    candidates.add(`ras-team-${raw}`);
    candidates.add(`ras-team-${normalized}`);
    candidates.add(`espn-team-${raw}`);
    candidates.add(`espn-team-${normalized}`);
}

function firstNonEmptyString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

function hasExternalCandidatePrefix(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return (
        normalized.startsWith('fs-team-') ||
        normalized.startsWith('fs-') ||
        normalized.startsWith('ras-team-') ||
        normalized.startsWith('espn-team-')
    );
}

function inferSportFromKey(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith('espn-soccer-team-')) return 'football';
    if (normalized.startsWith('espn-team-')) return 'american-football';
    if (normalized.startsWith('espn-racing-team-')) return 'motorsport';
    if (normalized.startsWith('ras-team-')) return 'rugby';
    return null;
}

function normalizeSportHint(value: string | null | undefined): string | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'soccer') return 'football';
    if (normalized === 'rugby-union' || normalized === 'rugby-sevens') return 'rugby';
    return normalized;
}

function extractTeamDetailsLogo(details: any): string {
    return normalizeSourceUrl(firstNonEmptyString(
        details?.image_path,
        details?.small_image_path,
        details?.logo,
        details?.logo_url,
        details?.team?.image_path,
        details?.team?.small_image_path,
        details?.team?.logo,
        details?.team?.logo_url,
    ));
}

function normalizeLabel(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim();
}

function getFallbackInitials(teamName: string, key: string): string {
    const normalized = normalizeLabel(teamName || key);
    if (!normalized) return 'CL';

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'CL';
}

// `name` y `key` vienen de la query: sin escapar, `name="><script>...` cerraba el
// atributo y metia codigo en un SVG servido desde nuestro origen.
function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildFallbackLogoResponse(teamName: string, key: string, url: URL) {
    const initials = escapeXml(getFallbackInitials(teamName, key));
    const title = escapeXml((teamName || key || 'Club').slice(0, 120));
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${title}">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#25364a" />
                    <stop offset="100%" stop-color="#101820" />
                </linearGradient>
            </defs>
            <rect x="10" y="8" width="76" height="80" rx="22" fill="url(#bg)" stroke="#d7e4f2" stroke-opacity="0.35" stroke-width="4" />
            <path d="M48 20c12 0 22 7 22 7v22c0 15-11 24-22 28-11-4-22-13-22-28V27s10-7 22-7Z" fill="#182634" stroke="#eef5ff" stroke-opacity="0.55" stroke-width="2.5" />
            <text x="48" y="56" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#ffffff">${initials}</text>
        </svg>
    `.trim();

    return new NextResponse(svg, {
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            // Nunca inmutable: las iniciales son la respuesta de "todavia no hay
            // escudo", y cachearlas una semana sobrevive a que el escudo aparezca.
            'Cache-Control': resolveProxyCacheControl(url, false),
            ...BASE_HEADERS,
        },
    });
}

// La carpeta se lista una vez por instancia: antes cada pedido probaba ~16
// candidatos x 6 extensiones con un `access()` cada uno, casi todos fallidos.
// Los archivos de public/ no cambian dentro de un deploy.
let logoDirListing: Promise<Set<string>> | null = null;

function listLogoDir(): Promise<Set<string>> {
    logoDirListing ??= readdir(LOGO_DIR)
        .then((names) => new Set(names))
        .catch(() => new Set<string>());
    return logoDirListing;
}

async function findLogoFile(key: string): Promise<string | null> {
    const candidates = new Set<string>();
    addCandidate(candidates, key);
    const files = await listLogoDir();
    if (files.size === 0) return null;

    for (const candidate of candidates) {
        for (const extension of EXTENSIONS) {
            const filename = `${candidate}${extension}`;
            if (files.has(filename)) return `/logos/clubs/${filename}`;
        }
    }

    return null;
}

async function findExternalTournamentLogo(candidates: string[], tournamentName: string): Promise<string | null> {
    for (const candidate of candidates) {
        const override = await getExternalTournamentOverride(candidate).catch(() => null);
        if (override?.logo_url) {
            return override.logo_url;
        }
    }

    if (tournamentName) {
        const override = await getExternalTournamentOverride(tournamentName).catch(() => null);
        if (override?.logo_url) {
            return override.logo_url;
        }
    }

    return null;
}

/**
 * El logo de una competicion de RugbyPass (`rp-comp-208`).
 *
 * No vive en ninguna tabla: RugbyPass lo publica en su grilla de torneos y el
 * catalogo queda en memoria seis horas. Por eso lo resuelve el proxy y no el
 * feed — `external_match_cache` guarda `tournament_id` y `tournament_name` y
 * nada mas, y meter el logo en cada fila serian megas de la misma URL repetida
 * en la portada. Con esta puerta alcanza con que la placa sepa el id del torneo:
 * lo dibujan igual el export de la ficha, el de la fecha y cualquiera que venga.
 */
async function findRugbyPassTournamentLogo(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
        const competitionId = parseRugbyPassTournamentId(candidate);
        if (competitionId === null) continue;

        const { logo } = await getRugbyPassTournamentBranding(competitionId);
        if (logo) return logo;
    }

    return null;
}

/** Lo que el proxy aprendio sobre el escudo mientras lo buscaba. */
type LogoOrigin = { inherited: boolean };

async function findCachedLogo(key: string, teamUrl: string, teamName: string, entity: string, sport: string | null, origin?: LogoOrigin): Promise<string | null> {
    const candidateSet = new Set<string>();
    addCandidate(candidateSet, key);
    if (teamUrl) addCandidate(candidateSet, teamUrl);
    if (teamName) addCandidate(candidateSet, teamName);
    const candidates = Array.from(candidateSet);
    const isTournamentLookup = entity === 'tournament';
    const effectiveSport = sport || inferSportFromKey(key);
    let databaseRecord: Record<string, unknown> | null = null;

    try {
        const readClient = await getReadClient();
        const clubIdCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate) && !hasExternalCandidatePrefix(candidate));
        const allowClubNameLookup = !teamUrl && !candidates.some((candidate) => hasExternalCandidatePrefix(candidate));

        if (!isTournamentLookup && clubIdCandidates.length > 0) {
            let byIdQuery = (readClient as any)
                .from('clubs')
                .select('id, name, short_name, sport, sport_id, logo_url')
                .in('id', clubIdCandidates);
            if (effectiveSport) byIdQuery = byIdQuery.eq('sport', effectiveSport);
            const { data } = await byIdQuery;

            const byId = new Map<string, Record<string, unknown>>();
            for (const row of data || []) {
                if (row?.id) {
                    byId.set(String(row.id), row);
                }
            }

            for (const candidate of candidates) {
                const record = byId.get(candidate);
                if (record?.logo_url) {
                    return String(record.logo_url);
                }
            }

            let bySlugQuery = (readClient as any)
                .from('clubs')
                .select('id, name, short_name, slug, sport, sport_id, logo_url')
                .in('slug', clubIdCandidates);
            if (effectiveSport) bySlugQuery = bySlugQuery.eq('sport', effectiveSport);
            const { data: bySlug } = await bySlugQuery;

            const slugMap = new Map<string, Record<string, unknown>>();
            for (const row of bySlug || []) {
                if (typeof row?.slug === 'string' && row.slug.trim()) {
                    slugMap.set(String(row.slug), row);
                }
            }

            for (const candidate of candidates) {
                const record = slugMap.get(candidate);
                if (record?.logo_url) {
                    return String(record.logo_url);
                }
            }

            // El club existe pero no tiene escudo propio. Antes de caer en las
            // iniciales, se sube al club madre: "Tala Rugby Club Intermedia" es
            // una filial de "Tala Rugby Club" y le corresponde SU escudo. Una
            // categoría casi nunca carga logo aparte —es el mismo club—, así que
            // sin esta caída media grilla de la jornada se dibuja con iniciales,
            // y la regla del proyecto es escudo real siempre.
            //
            // Va después de id y slug —el escudo propio, si existe, manda— y
            // antes de la búsqueda por nombre, para que el escudo de la madre le
            // gane a una coincidencia de nombre con otro club.
            const resolvedClubIds: string[] = [];
            for (const candidate of candidates) {
                const record = byId.get(candidate) || slugMap.get(candidate);
                const resolvedId = record?.id ? String(record.id) : null;
                if (resolvedId && !resolvedClubIds.includes(resolvedId)) {
                    resolvedClubIds.push(resolvedId);
                }
            }

            if (resolvedClubIds.length > 0) {
                const { data: derivatives } = await (readClient as any)
                    .from('club_derivatives')
                    .select('base_club_id, derived_club_id')
                    .in('derived_club_id', resolvedClubIds);

                const baseByDerived = new Map<string, string>();
                for (const row of derivatives || []) {
                    if (row?.derived_club_id && row?.base_club_id) {
                        baseByDerived.set(String(row.derived_club_id), String(row.base_club_id));
                    }
                }

                const baseIds = Array.from(new Set(baseByDerived.values()));
                if (baseIds.length > 0) {
                    const { data: baseRows } = await (readClient as any)
                        .from('clubs')
                        .select('id, logo_url')
                        .in('id', baseIds);

                    const logoByBase = new Map<string, string>();
                    for (const row of baseRows || []) {
                        if (row?.id && row?.logo_url) {
                            logoByBase.set(String(row.id), String(row.logo_url));
                        }
                    }

                    for (const resolvedId of resolvedClubIds) {
                        const baseId = baseByDerived.get(resolvedId);
                        const inherited = baseId ? logoByBase.get(baseId) : null;
                        if (inherited) {
                            // El `v` que mando el llamador es el `updated_at` de la
                            // categoria, no el de este escudo: no alcanza para
                            // servirlo como inmutable.
                            if (origin) origin.inherited = true;
                            return inherited;
                        }
                    }
                }
            }
        }

        if (!isTournamentLookup && allowClubNameLookup && teamName) {
            let byNameQuery = (readClient as any)
                .from('clubs')
                .select('id, name, short_name, sport, sport_id, logo_url')
                .eq('name', teamName);
            if (effectiveSport) byNameQuery = byNameQuery.eq('sport', effectiveSport);
            const { data: byName } = await byNameQuery.maybeSingle();

            if (byName?.logo_url) {
                return String(byName.logo_url);
            }

            let byShortNameQuery = (readClient as any)
                .from('clubs')
                .select('id, name, short_name, sport, sport_id, logo_url')
                .eq('short_name', teamName);
            if (effectiveSport) byShortNameQuery = byShortNameQuery.eq('sport', effectiveSport);
            const { data: byShortName } = await byShortNameQuery.maybeSingle();

            if (byShortName?.logo_url) {
                return String(byShortName.logo_url);
            }
        }

        const tournamentCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate) && !hasExternalCandidatePrefix(candidate));
        if (tournamentCandidates.length > 0) {
            // `tournaments.id` is a uuid column: only probe it with candidates that are real
            // UUIDs. External FlashScore/ESPN identifiers (base62 slugs, team/tournament names)
            // are handled by the slug/name lookups below — sending them to `.in('id', ...)`
            // triggers Postgres 22P02 (invalid input syntax for type uuid).
            const tournamentIdCandidates = tournamentCandidates.filter(isUuid);
            let tournamentsById: unknown[] | null = null;

            if (tournamentIdCandidates.length > 0) {
                const tournamentsByIdResult = await (readClient as any)
                    .from('tournaments')
                    .select('id, name, display_name, slug, logo_url, banner_url')
                    .in('id', tournamentIdCandidates);
                tournamentsById = tournamentsByIdResult.data;

                if (tournamentsByIdResult.error) {
                    const fallback = await (readClient as any)
                        .from('tournaments')
                        .select('id, name, display_name, slug, logo_url')
                        .in('id', tournamentIdCandidates);
                    tournamentsById = fallback.data;
                }
            }

            const tournamentIdMap = new Map<string, Record<string, unknown>>();
            for (const row of (tournamentsById as Record<string, unknown>[]) || []) {
                if (row?.id) {
                    tournamentIdMap.set(String(row.id), row);
                }
            }

            for (const candidate of candidates) {
                const record = tournamentIdMap.get(candidate);
                const logoUrl = record?.logo_url || record?.banner_url;
                if (logoUrl) {
                    return String(logoUrl);
                }
            }

            const tournamentsBySlugResult = await (readClient as any)
                .from('tournaments')
                .select('id, name, display_name, slug, logo_url, banner_url')
                .in('slug', tournamentCandidates);
            let tournamentsBySlug = tournamentsBySlugResult.data;

            if (tournamentsBySlugResult.error) {
                const fallback = await (readClient as any)
                    .from('tournaments')
                    .select('id, name, display_name, slug, logo_url')
                    .in('slug', tournamentCandidates);
                tournamentsBySlug = fallback.data;
            }

            const tournamentSlugMap = new Map<string, Record<string, unknown>>();
            for (const row of tournamentsBySlug || []) {
                if (typeof row?.slug === 'string' && row.slug.trim()) {
                    tournamentSlugMap.set(String(row.slug), row);
                }
            }

            for (const candidate of candidates) {
                const record = tournamentSlugMap.get(candidate);
                const logoUrl = record?.logo_url || record?.banner_url;
                if (logoUrl) {
                    return String(logoUrl);
                }
            }

            if (isTournamentLookup && teamName) {
                const { data: byName } = await (readClient as any)
                    .from('tournaments')
                    .select('id, name, display_name, logo_url, banner_url')
                    .eq('name', teamName)
                    .limit(1);

                let record = Array.isArray(byName) ? byName[0] : null;
                if (!record) {
                    const { data: byDisplayName } = await (readClient as any)
                        .from('tournaments')
                        .select('id, name, display_name, logo_url, banner_url')
                        .eq('display_name', teamName)
                        .limit(1);

                    record = Array.isArray(byDisplayName) ? byDisplayName[0] : null;
                }
                const logoUrl = record?.logo_url || record?.banner_url;
                if (logoUrl) {
                    return String(logoUrl);
                }
            }
        }

        if (isTournamentLookup) {
            const externalTournamentLogo = await findExternalTournamentLogo(candidates, teamName);
            if (externalTournamentLogo) {
                return externalTournamentLogo;
            }

            // Despues del override a proposito: una correccion cargada a mano le
            // gana al catalogo del proveedor.
            const rugbyPassLogo = await findRugbyPassTournamentLogo(candidates);
            if (rugbyPassLogo) {
                return rugbyPassLogo;
            }

            return null;
        }

        const idCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate));
        if (idCandidates.length > 0) {
            let byIdQuery = (readClient as any)
                .from('external_teams')
                .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                .in('id', idCandidates);
            if (effectiveSport) byIdQuery = byIdQuery.eq('sport', effectiveSport);
            const { data } = await byIdQuery;

            const byId = new Map<string, Record<string, unknown>>();
            for (const row of data || []) {
                if (row?.id) {
                    byId.set(String(row.id), row);
                }
            }

            for (const candidate of candidates) {
                const record = byId.get(candidate);
                if (record) {
                    databaseRecord = record;
                    break;
                }
            }
        }

        if (!databaseRecord && teamUrl) {
            let teamUrlQuery = (readClient as any)
                .from('external_teams')
                .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                .eq('team_url', teamUrl);
            if (effectiveSport) teamUrlQuery = teamUrlQuery.eq('sport', effectiveSport);
            const { data } = await teamUrlQuery.maybeSingle();

            if (data) {
                databaseRecord = data;
            }
        }

        if (!databaseRecord && teamName) {
            let byNameQuery = (readClient as any)
                .from('external_teams')
                .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                .eq('name', teamName);
            if (effectiveSport) byNameQuery = byNameQuery.eq('sport', effectiveSport);
            const { data: byName } = await byNameQuery.maybeSingle();

            if (byName) {
                databaseRecord = byName;
            }

            if (!databaseRecord) {
                let byShortNameQuery = (readClient as any)
                    .from('external_teams')
                    .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                    .eq('short_name', teamName);
                if (effectiveSport) byShortNameQuery = byShortNameQuery.eq('sport', effectiveSport);
                const { data: byShortName } = await byShortNameQuery.maybeSingle();

                if (byShortName) {
                    databaseRecord = byShortName;
                }
            }
        }
    } catch {
        // Ignore missing table/schema issues and fall back to the original logo.
    }

    if (isTournamentLookup) {
        const externalTournamentLogo = await findExternalTournamentLogo(candidates, teamName);
        if (externalTournamentLogo) {
            return externalTournamentLogo;
        }

        return null;
    }

    const storedOverride = await findExternalTeamLogoOverride(key, teamUrl, teamName, ...candidates);
    const mergedOverride = mergeExternalTeamLogoOverrideRecords(databaseRecord as any, storedOverride);
    if (mergedOverride?.logo_url) {
        return mergedOverride.logo_url;
    }

    if (teamUrl) {
        try {
            const details = teamUrl.includes('/player/')
                ? await getPlayerDetails(teamUrl)
                : await getTeamDetails(teamUrl);
            const liveLogo = extractTeamDetailsLogo(details);
            if (liveLogo) {
                return liveLogo;
            }
        } catch {
            // Ignore upstream lookup failures and let the route fall through.
        }
    }

    return null;
}

type ResolvedLogoSource = { source: string; inherited: boolean };

// "No hay escudo" no se guarda: puede ser un corte de la base (la cascada se
// traga los errores) y congelar las iniciales seis horas seria peor que pagar
// la busqueda otra vez. Tirar dentro de unstable_cache es lo que evita guardarlo.
class LogoSourceNotFound extends Error {}

const findCachedLogoAcrossDeploys = unstable_cache(
    async (key: string, teamUrl: string, teamName: string, entity: string, sport: string | null): Promise<ResolvedLogoSource> => {
        const origin: LogoOrigin = { inherited: false };
        const source = await findCachedLogo(key, teamUrl, teamName, entity, sport, origin);
        if (!source) throw new LogoSourceNotFound();
        return { source, inherited: origin.inherited };
    },
    ['team-logo-source-v1'],
    { revalidate: TEAM_LOGO_SOURCE_REVALIDATE_SECONDS, tags: [TEAM_LOGO_SOURCE_TAG] },
);

async function resolveLogoSource(
    key: string,
    teamUrl: string,
    teamName: string,
    entity: string,
    sport: string | null,
): Promise<ResolvedLogoSource | null> {
    try {
        return await findCachedLogoAcrossDeploys(key, teamUrl, teamName, entity, sport);
    } catch (error) {
        if (error instanceof LogoSourceNotFound) return null;
        // El cache mismo fallo (una entrada demasiado grande, el store caido): sin cache.
        const origin: LogoOrigin = { inherited: false };
        const source = await findCachedLogo(key, teamUrl, teamName, entity, sport, origin);
        return source ? { source, inherited: origin.inherited } : null;
    }
}

// Muchos escudos estan guardados a 600-1080 px y se pintan en chips de 18-42 px:
// un ranking de 20 filas bajaba 2,6 MB para dibujar miniaturas. El ancho entra en
// la URL, o sea que tambien diferencia la entrada de cache del navegador y el CDN.
const MAX_PROXY_WIDTH = 512;

// El ancho dejo de ser opcional de hecho. Pedir `w` alcanzaba mientras el unico que
// lo pidiera fuera `TeamLogo`, pero unas treinta pantallas dibujan el escudo con un
// `<img src={club.logo_url}>` pelado y no pasan por ahi. La peor es el catalogo de
// clubes: ~500 escudos en el DOM sin virtualizar, cada uno servido a su resolucion
// original. Medido con scroll hasta el fondo, el bitmap trepaba de 20 MB a 280 MB
// con el heap JS clavado en 19 MB — de ahi el "Out of Memory" del navegador SIN un
// solo error en consola, porque la memoria de una imagen decodificada no es heap y
// no la ve el recolector.
//
// El tope va aca y no en cada llamador porque es lo unico que los cubre a todos de
// una, y porque es el lugar honesto: nadie que consuma este endpoint dibuja un
// escudo grande. El mayor que pinta la UI publica mide 63 px, asi que 320 le deja
// aire hasta a una pantalla 3x y igual baja un escudo de 1200 px de 5,5 MB a 0,4 MB.
const DEFAULT_PROXY_WIDTH = 320;

function parseRequestedWidth(url: URL): number {
    const raw = Number(url.searchParams.get('w'));
    if (!Number.isFinite(raw) || raw <= 0) {
        // `fallback` es la unica puerta por la que entra algo que no es un escudo: el
        // export la usa para traerse cualquier imagen externa, incluida una foto de
        // fondo a sangre. Esa no se toca; el que quiera achicarla que pida `w`.
        return url.searchParams.has('fallback') ? 0 : DEFAULT_PROXY_WIDTH;
    }
    // Topeado para que nadie use el endpoint como redimensionador generico.
    return Math.min(MAX_PROXY_WIDTH, Math.round(raw));
}

type ProxyImagePayload = { payload: Uint8Array<ArrayBuffer>; contentType: string };

const RASTER_CONTENT_TYPES: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
};

// Un data: URL solo entra si DICE ser una de estas. Igual se verifica el contenido:
// la etiqueta la escribe quien arma la URL.
const ALLOWED_DATA_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

/**
 * Bytes de origen desconocido → una imagen que se puede servir, o null.
 *
 * El tipo sale de lo que sharp LEE en el contenido, nunca de lo que declara el
 * origen ni el data: URL. Un SVG ajeno se rasteriza a PNG: como SVG viaja con
 * su <script> y sus handlers, y servido desde g22 correria con nuestras cookies.
 * Lo que sharp no sabe leer se rechaza: antes "mejor el original que ninguna
 * imagen" era justo la puerta por la que pasaba un HTML.
 */
async function toSafeImage(input: Buffer, width: number): Promise<ProxyImagePayload | null> {
    if (input.length === 0 || input.length > MAX_SOURCE_BYTES) return null;

    try {
        const meta = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();

        if (meta.format === 'svg') {
            const target = Math.min(width || SVG_RASTER_WIDTH, MAX_PROXY_WIDTH);
            // A 72 dpi un SVG de 24 px se rasteriza a 24 px y despues se estira:
            // la densidad se sube para que el render ya salga del tamano final.
            const intrinsic = meta.width && meta.width > 0 ? meta.width : target;
            const density = Math.max(72, Math.min(1200, Math.ceil((72 * target) / intrinsic)));
            const png = await sharp(input, { density, limitInputPixels: LIMIT_INPUT_PIXELS })
                .resize(target, target, { fit: 'inside' })
                .png()
                .toBuffer();
            return { payload: new Uint8Array(png), contentType: 'image/png' };
        }

        let contentType = RASTER_CONTENT_TYPES[meta.format ?? ''];
        // AVIF llega como `heif` con compresion av1; un HEIC (hevc) no lo dibuja ningun navegador.
        if (!contentType && meta.format === 'heif' && meta.compression === 'av1') contentType = 'image/avif';
        if (!contentType) return null;

        if (width && meta.width && meta.width > width) {
            const resized = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS })
                // `inside` conserva la proporcion: hay escudos que no son cuadrados.
                .resize(width, width, { fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
            return { payload: new Uint8Array(resized), contentType: 'image/png' };
        }

        return { payload: new Uint8Array(input), contentType };
    } catch {
        return null;
    }
}

function decodeDataUrl(source: string): Buffer | null {
    const commaIndex = source.indexOf(',');
    if (commaIndex === -1) return null;

    const header = source.slice(5, commaIndex).toLowerCase();
    const mimeType = header.split(';')[0].trim();
    if (!ALLOWED_DATA_MIME.has(mimeType)) return null;

    const body = source.slice(commaIndex + 1);
    // Tope antes de decodificar: base64 infla 4/3, el doble deja aire de sobra.
    if (body.length > MAX_SOURCE_BYTES * 2) return null;

    try {
        return header.includes(';base64')
            ? Buffer.from(body, 'base64')
            : Buffer.from(decodeURIComponent(body), 'utf-8');
    } catch {
        return null;
    }
}

function toLocalImagePath(source: string): string | null {
    const pathname = source.split(/[?#]/)[0];
    let decoded: string;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    if (!LOCAL_IMAGE_PATH.test(decoded)) return null;
    if (decoded.split('/').some((segment) => segment === '..' || segment === '.')) return null;
    return decoded;
}

async function readLocalImage(localPath: string): Promise<Buffer | null> {
    const filePath = path.resolve(PUBLIC_DIR, `.${localPath}`);
    // Defensa extra contra traversal: el archivo tiene que quedar adentro de public/.
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return null;

    try {
        const buffer = await readFile(filePath);
        return buffer.length <= MAX_SOURCE_BYTES ? buffer : null;
    } catch {
        // En Vercel public/ puede no estar en el bundle de la funcion: lo sirve el CDN.
        return null;
    }
}

async function fetchRemoteImage(source: string): Promise<Buffer | null> {
    try {
        // Sin el data cache de Next (`next.revalidate`) a proposito: la respuesta de esta
        // ruta ya sale con s-maxage de una semana, el CDN es el que guarda la copia.
        const { status, body } = await safeFetchBuffer(source, {
            timeoutMs: FETCH_TIMEOUT_MS,
            maxBytes: MAX_SOURCE_BYTES,
            maxRedirects: 3,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.flashscore.com/',
                'Accept': 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
            },
        });
        return status >= 200 && status < 300 ? body : null;
    } catch (error) {
        // Un destino vedado es alguien probando la puerta, no una falla para el log.
        if (!(error instanceof SafeFetchError) || error.code !== 'blocked_destination') {
            console.error(`[LogoProxy] Failed to fetch ${source}:`, error instanceof Error ? error.message : error);
        }
        return null;
    }
}

/**
 * La imagen de `source` lista para servir, o null si no se pudo conseguir una
 * imagen verificada. Nunca redirige afuera: el 307 al `fallback` convertia a
 * g22 en un open redirect (`?key=x&fallback=https://phishing`). El unico
 * redirect que queda es al MISMO origen, a un archivo de imagen de public/,
 * para cuando la funcion no lo tiene en disco.
 */
async function buildImageResponse(source: string, url: URL, trustVersion = true): Promise<NextResponse | null> {
    // `variant=dark`: el export pinta sobre fondo oscuro y pide la tinta clara de los
    // escudos que la tienen (Tala). Se aplica ACÁ, sobre el escudo ya resuelto, porque
    // el cliente sólo ve la URL del proxy y no sabe a qué `/clubs/x.png` termina.
    const wantsDark = url.searchParams.get('variant') === 'dark';
    const normalizedSource = normalizeSourceUrl(wantsDark ? darkCrestSource(source) : source);
    const cacheControl = resolveProxyCacheControl(url, trustVersion);
    const requestedWidth = parseRequestedWidth(url);

    let bytes: Buffer | null = null;
    let localPath: string | null = null;

    if (normalizedSource.startsWith('data:')) {
        bytes = decodeDataUrl(normalizedSource);
    } else if (/^https?:\/\//i.test(normalizedSource)) {
        bytes = await fetchRemoteImage(normalizedSource);
    } else if (normalizedSource.startsWith('/')) {
        localPath = toLocalImagePath(normalizedSource);
        if (localPath) bytes = await readLocalImage(localPath);
    }

    if (bytes) {
        const image = await toSafeImage(bytes, requestedWidth);
        if (!image) return null;

        return new NextResponse(image.payload, {
            headers: {
                'Content-Type': image.contentType,
                'Cache-Control': cacheControl,
                ...BASE_HEADERS,
            },
        });
    }

    if (localPath) {
        const target = new URL(localPath, url.origin);
        if (target.origin !== url.origin) return null;

        return new NextResponse(null, {
            status: 307,
            headers: {
                Location: target.pathname,
                'Cache-Control': cacheControl,
                ...BASE_HEADERS,
            },
        });
    }

    return null;
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key')?.trim() || '';
    const fallback = url.searchParams.get('fallback')?.trim() || '';
    const teamUrl = sanitizeTeamUrl(url.searchParams.get('team_url')?.trim() || '');
    const teamName = url.searchParams.get('name')?.trim() || '';
    const entity = url.searchParams.get('entity')?.trim().toLowerCase() || '';
    const sport = normalizeSportHint(url.searchParams.get('sport'));
    const noFallback = url.searchParams.get('noFallback') === '1';

    if (!key) {
        return buildEmptyResponse(400);
    }

    // Buscar `export-image` como si fuera un club costaba seis `access()` a disco y una
    // cascada de consultas a clubs/external_teams —cada una un viaje cross-region— antes
    // de llegar al fallback, por cada escudo y por cada pasada del preview.
    // Si falla, 404 y no iniciales: el export pide por aca fotos de fondo, y un "EX"
    // dibujado en su lugar seria peor que el hueco (ExportImage prueba la directa).
    if (key === EXPORT_IMAGE_PROXY_KEY && fallback) {
        return (await buildImageResponse(fallback, url)) ?? buildEmptyResponse(404);
    }

    // Cada fuente que no da una imagen verificada cae a la siguiente, en vez de
    // cortar la cascada: un logo_url roto no deberia tapar al `fallback`.
    const localLogo = await findLogoFile(key);
    if (localLogo) {
        const response = await buildImageResponse(localLogo, url);
        if (response) return response;
    }

    const resolved = await resolveLogoSource(key, teamUrl, teamName, entity, sport);
    if (resolved) {
        const response = await buildImageResponse(resolved.source, url, !resolved.inherited);
        if (response) return response;
    }

    if (fallback) {
        const response = await buildImageResponse(fallback, url);
        if (response) return response;
    }

    // `noFallback`: quien pregunta prefiere NO recibir imagen antes que recibir una con
    // iniciales. Lo pide el export, donde la imagen se publica (ver getTournamentLogoImageSource).
    if (noFallback) {
        return buildEmptyResponse(404);
    }

    return buildFallbackLogoResponse(teamName, key, url);
}
