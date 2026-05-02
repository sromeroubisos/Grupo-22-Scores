import { access } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import {
    findExternalTeamLogoOverride,
    mergeExternalTeamLogoOverrideRecords,
} from '@/lib/server/externalTeamLogoOverrides';
import { getPlayerDetails, getTeamDetails } from '@/lib/services/flashscore';

const LOGO_DIR = path.join(process.cwd(), 'public', 'logos', 'clubs');
const EXTENSIONS = ['.png', '.svg', '.webp', '.jpg', '.jpeg', '.avif'];
const PROXY_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';

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

function buildFallbackLogoResponse(teamName: string, key: string) {
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
            'Cache-Control': PROXY_CACHE_CONTROL,
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

async function findCachedLogo(key: string, teamUrl: string, teamName: string): Promise<string | null> {
    const candidateSet = new Set<string>();
    addCandidate(candidateSet, key);
    if (teamUrl) addCandidate(candidateSet, teamUrl);
    if (teamName) addCandidate(candidateSet, teamName);
    const candidates = Array.from(candidateSet);
    let databaseRecord: Record<string, unknown> | null = null;

    try {
        const readClient = await getReadClient();
        const clubIdCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate) && !hasExternalCandidatePrefix(candidate));
        const allowClubNameLookup = !teamUrl && !candidates.some((candidate) => hasExternalCandidatePrefix(candidate));

        if (clubIdCandidates.length > 0) {
            const { data } = await (readClient as any)
                .from('clubs')
                .select('id, name, short_name, logo_url')
                .in('id', clubIdCandidates);

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

            const { data: bySlug } = await (readClient as any)
                .from('clubs')
                .select('id, name, short_name, slug, logo_url')
                .in('slug', clubIdCandidates);

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
        }

        if (allowClubNameLookup && teamName) {
            const { data: byName } = await (readClient as any)
                .from('clubs')
                .select('id, name, short_name, logo_url')
                .eq('name', teamName)
                .maybeSingle();

            if (byName?.logo_url) {
                return String(byName.logo_url);
            }

            const { data: byShortName } = await (readClient as any)
                .from('clubs')
                .select('id, name, short_name, logo_url')
                .eq('short_name', teamName)
                .maybeSingle();

            if (byShortName?.logo_url) {
                return String(byShortName.logo_url);
            }
        }

        const tournamentCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate) && !hasExternalCandidatePrefix(candidate));
        if (tournamentCandidates.length > 0) {
            const tournamentsByIdResult = await (readClient as any)
                .from('tournaments')
                .select('id, name, display_name, slug, logo_url, banner_url')
                .in('id', tournamentCandidates);
            let tournamentsById = tournamentsByIdResult.data;

            if (tournamentsByIdResult.error) {
                const fallback = await (readClient as any)
                    .from('tournaments')
                    .select('id, name, display_name, slug, logo_url')
                    .in('id', tournamentCandidates);
                tournamentsById = fallback.data;
            }

            const tournamentIdMap = new Map<string, Record<string, unknown>>();
            for (const row of tournamentsById || []) {
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
        }

        const idCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate));
        if (idCandidates.length > 0) {
            const { data } = await (readClient as any)
                .from('external_teams')
                .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                .in('id', idCandidates);

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
            const { data } = await (readClient as any)
                .from('external_teams')
                .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                .eq('team_url', teamUrl)
                .maybeSingle();

            if (data) {
                databaseRecord = data;
            }
        }

        if (!databaseRecord && teamName) {
            const { data: byName } = await (readClient as any)
                .from('external_teams')
                .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                .eq('name', teamName)
                .maybeSingle();

            if (byName) {
                databaseRecord = byName;
            }

            if (!databaseRecord) {
                const { data: byShortName } = await (readClient as any)
                    .from('external_teams')
                    .select('id, name, short_name, logo_url, sport, country, team_url, updated_at')
                    .eq('short_name', teamName)
                    .maybeSingle();

                if (byShortName) {
                    databaseRecord = byShortName;
                }
            }
        }
    } catch {
        // Ignore missing table/schema issues and fall back to the original logo.
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

async function buildImageResponse(source: string, url: URL) {
    const normalizedSource = normalizeSourceUrl(source);

    if (normalizedSource.startsWith('data:')) {
        const commaIndex = normalizedSource.indexOf(',');
        if (commaIndex === -1) {
            return NextResponse.json({ ok: false, error: 'invalid data url' }, { status: 400 });
        }

        const header = normalizedSource.slice(5, commaIndex);
        const body = normalizedSource.slice(commaIndex + 1);
        const mimeType = header.split(';')[0] || 'application/octet-stream';
        const isBase64 = header.includes(';base64');
        const payload = isBase64 ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf-8');

        return new NextResponse(payload, {
            headers: {
                'Content-Type': mimeType,
                'Cache-Control': PROXY_CACHE_CONTROL,
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    if (normalizedSource.startsWith('http://') || normalizedSource.startsWith('https://')) {
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
                const contentType = imgResponse.headers.get('Content-Type') || 'image/png';
                const buffer = await imgResponse.arrayBuffer();

                return new NextResponse(Buffer.from(buffer), {
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': PROXY_CACHE_CONTROL,
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
            'Cache-Control': PROXY_CACHE_CONTROL,
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

    if (!key) {
        return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });
    }

    const localLogo = await findLogoFile(key);
    if (localLogo) {
        return buildImageResponse(localLogo, url);
    }

    const cachedLogo = await findCachedLogo(key, teamUrl, teamName);
    if (cachedLogo) {
        return buildImageResponse(cachedLogo, url);
    }

    if (fallback) {
        return buildImageResponse(fallback, url);
    }

    return buildFallbackLogoResponse(teamName, key);
}
