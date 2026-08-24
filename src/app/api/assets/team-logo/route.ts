import { lookup } from 'node:dns/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getReadClient } from '@/lib/supabase/read';
import {
    findExternalTeamLogoOverride,
    mergeExternalTeamLogoOverrideRecords,
} from '@/lib/server/externalTeamLogoOverrides';
import { getExternalTournamentOverride } from '@/lib/server/externalTournamentOverrides';
import { getPlayerDetails, getTeamDetails } from '@/lib/services/flashscore';
import { isUuid } from '@/lib/utils/postgrest';

const LOGO_DIR = path.join(process.cwd(), 'public', 'logos', 'clubs');
const EXTENSIONS = ['.png', '.svg', '.webp', '.jpg', '.jpeg', '.avif'];
// Versioned URLs (carry a `v` cache-busting token) are immutable: the token changes when the
// logo changes, so we can cache hard. Non-versioned URLs refresh quickly in the browser so an
// updated logo shows up without waiting a day, while the CDN keeps a long copy to protect quota.
const PROXY_CACHE_CONTROL_VERSIONED = 'public, max-age=604800, s-maxage=604800, immutable';
const PROXY_CACHE_CONTROL_VOLATILE = 'public, max-age=300, s-maxage=604800, stale-while-revalidate=86400';

function resolveProxyCacheControl(url: URL): string {
    return url.searchParams.has('v')
        ? PROXY_CACHE_CONTROL_VERSIONED
        : PROXY_CACHE_CONTROL_VOLATILE;
}

// El `fallback` de la query lo escribe cualquiera en la barra de direcciones, y esta ruta
// hace el fetch desde el servidor: sin control, `?fallback=http://169.254.169.254/...`
// convierte al proxy en un telescopio hacia la red interna de Vercel. No usamos lista
// blanca de hosts a proposito — los logos cargados a mano (overrides, clubs.logo_url)
// pueden vivir en cualquier dominio publico y tienen que seguir andando. Lo que se
// bloquea es el DESTINO: loopback, link-local, rangos privados y puertos raros.
function isPrivateIpv4(address: string): boolean {
    const parts = address.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }

    const [first, second] = parts;
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;          // metadata de la nube
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && (second === 0 || second === 168)) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;  // CGNAT
    if (first === 198 && (second === 18 || second === 19)) return true;
    if (first >= 224) return true;                              // multicast / reservados
    return false;
}

function isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase().split('%')[0];
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;   // unique local
    if (normalized.startsWith('fe80')) return true;                                 // link local

    const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
}

async function isPublicHttpUrl(rawUrl: string): Promise<boolean> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return false;

    const hostname = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
    if (!hostname) return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;

    try {
        // Resolver el nombre es lo que atrapa el caso feo: un dominio publico que apunta
        // a una IP privada. Chequear el texto del host no alcanza.
        const addresses = await lookup(hostname, { all: true });
        if (addresses.length === 0) return false;

        return addresses.every(({ address, family }) => (
            family === 6 ? !isPrivateIpv6(address) : !isPrivateIpv4(address)
        ));
    } catch {
        return false;
    }
}

function buildBlockedSourceResponse() {
    return new NextResponse(null, {
        status: 400,
        headers: {
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
        },
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

function buildFallbackLogoResponse(teamName: string, key: string, url: URL) {
    const initials = getFallbackInitials(teamName, key);
    const title = teamName || key || 'Club';
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
            'Cache-Control': resolveProxyCacheControl(url),
            'Access-Control-Allow-Origin': '*',
        },
    });
}

async function findLogoFile(key: string): Promise<string | null> {
    const candidates = new Set<string>();
    addCandidate(candidates, key);

    for (const candidate of candidates) {
        for (const extension of EXTENSIONS) {
            const filename = `${candidate}${extension}`;
            const filePath = path.join(LOGO_DIR, filename);

            try {
                await access(filePath);
                return `/logos/clubs/${filename}`;
            } catch {
                // Try next candidate.
            }
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

async function findCachedLogo(key: string, teamUrl: string, teamName: string, entity: string, sport: string | null): Promise<string | null> {
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

// Muchos escudos estan guardados a 600-1080 px y se pintan en chips de 18-42 px:
// un ranking de 20 filas bajaba 2,6 MB para dibujar miniaturas. `w` es opcional,
// asi que ningun llamador existente cambia de comportamiento; el ancho entra en
// la URL, o sea que tambien diferencia la entrada de cache del navegador y el CDN.
const MAX_PROXY_WIDTH = 512;

function parseRequestedWidth(url: URL): number {
    const raw = Number(url.searchParams.get('w'));
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Topeado para que nadie use el endpoint como redimensionador generico.
    return Math.min(MAX_PROXY_WIDTH, Math.round(raw));
}

type ProxyImagePayload = { payload: Uint8Array<ArrayBuffer>; contentType: string };

async function downscaleImage(
    payload: Buffer<ArrayBuffer>,
    contentType: string,
    width: number,
): Promise<ProxyImagePayload> {
    if (!width) return { payload, contentType };
    // Un SVG ya escala solo: rasterizarlo lo empeoraria.
    if (contentType.includes('svg')) return { payload, contentType };

    try {
        const image = sharp(payload);
        const meta = await image.metadata();
        if (!meta.width || meta.width <= width) return { payload, contentType };

        const resized = await image
            // `inside` conserva la proporcion: hay escudos que no son cuadrados.
            .resize(width, width, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();

        return { payload: new Uint8Array(resized), contentType: 'image/png' };
    } catch {
        // Formato que sharp no puede leer: mejor el original que ninguna imagen.
        return { payload, contentType };
    }
}

async function buildImageResponse(source: string, url: URL) {
    const normalizedSource = normalizeSourceUrl(source);
    const cacheControl = resolveProxyCacheControl(url);
    const requestedWidth = parseRequestedWidth(url);

    if (normalizedSource.startsWith('data:')) {
        const commaIndex = normalizedSource.indexOf(',');
        if (commaIndex === -1) {
            return NextResponse.json({ ok: false, error: 'invalid data url' }, { status: 400 });
        }

        const header = normalizedSource.slice(5, commaIndex);
        const body = normalizedSource.slice(commaIndex + 1);
        const mimeType = header.split(';')[0] || 'application/octet-stream';
        const isBase64 = header.includes(';base64');
        const rawPayload = isBase64 ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf-8');
        const { payload, contentType } = await downscaleImage(rawPayload, mimeType, requestedWidth);

        return new NextResponse(payload, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': cacheControl,
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    if (normalizedSource.startsWith('http://') || normalizedSource.startsWith('https://')) {
        if (!(await isPublicHttpUrl(normalizedSource))) {
            return buildBlockedSourceResponse();
        }

        try {
            // Fetch the image server-side to bypass potential CORS/hotlinking issues
            const imgResponse = await fetch(normalizedSource, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.flashscore.com/',
                },
                next: { revalidate: 86400 }, // Cache on Vercel/Next for a day
            });

            if (imgResponse.ok) {
                const upstreamType = imgResponse.headers.get('Content-Type') || 'image/png';
                const buffer = await imgResponse.arrayBuffer();
                const { payload, contentType } = await downscaleImage(
                    Buffer.from(buffer),
                    upstreamType,
                    requestedWidth,
                );

                return new NextResponse(payload, {
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': cacheControl,
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
        } catch (error) {
            console.error(`[LogoProxy] Failed to fetch ${normalizedSource}:`, error);
        }
    }

    const target = normalizedSource.startsWith('http://') || normalizedSource.startsWith('https://')
        ? new URL(normalizedSource)
        : new URL(normalizedSource, url.origin);

    return new NextResponse(null, {
        status: 307,
        headers: {
            Location: target.toString(),
            'Cache-Control': cacheControl,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key')?.trim() || '';
    const fallback = url.searchParams.get('fallback')?.trim() || '';
    const teamUrl = url.searchParams.get('team_url')?.trim() || '';
    const teamName = url.searchParams.get('name')?.trim() || '';
    const entity = url.searchParams.get('entity')?.trim().toLowerCase() || '';
    const sport = normalizeSportHint(url.searchParams.get('sport'));
    const noFallback = url.searchParams.get('noFallback') === '1';

    if (!key) {
        return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });
    }

    const localLogo = await findLogoFile(key);
    if (localLogo) {
        return buildImageResponse(localLogo, url);
    }

    const cachedLogo = await findCachedLogo(key, teamUrl, teamName, entity, sport);
    if (cachedLogo) {
        return buildImageResponse(cachedLogo, url);
    }

    if (fallback) {
        return buildImageResponse(fallback, url);
    }

    // `noFallback`: quien pregunta prefiere NO recibir imagen antes que recibir una con
    // iniciales. Lo pide el export, donde la imagen se publica (ver getTournamentLogoImageSource).
    if (noFallback) {
        return new NextResponse(null, {
            status: 404,
            headers: {
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    return buildFallbackLogoResponse(teamName, key, url);
}
