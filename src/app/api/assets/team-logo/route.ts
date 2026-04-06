import { access } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { findExternalTeamLogoOverride } from '@/lib/server/externalTeamLogoOverrides';
import { getTeamDetails } from '@/lib/services/flashscore';

const LOGO_DIR = path.join(process.cwd(), 'public', 'logos', 'clubs');
const EXTENSIONS = ['.png', '.svg', '.webp', '.jpg', '.jpeg', '.avif'];

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

function extractIdFromTeamUrl(value: string): string | null {
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
    if (segments[0].toLowerCase() !== 'team') return null;

    const candidate = segments[segments.length - 1];
    if (!candidate || !/^[a-z0-9]+$/i.test(candidate)) return null;

    return candidate;
}

function addCandidate(candidates: Set<string>, value: string) {
    const extractedFromUrl = extractIdFromTeamUrl(value);
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

    const storedOverride = await findExternalTeamLogoOverride(key, teamUrl, teamName, ...candidates);
    if (storedOverride?.logo_url) {
        return storedOverride.logo_url;
    }

    try {
        const readClient = await getReadClient();
        const idCandidates = candidates.filter((candidate) => /^[a-z0-9-]+$/i.test(candidate));
        if (idCandidates.length > 0) {
            const { data } = await (readClient as any)
                .from('external_teams')
                .select('id, logo_url')
                .in('id', idCandidates);

            const byId = new Map<string, string>();
            for (const row of data || []) {
                if (row?.id && row?.logo_url) {
                    byId.set(String(row.id), String(row.logo_url));
                }
            }

            for (const candidate of candidates) {
                const logo = byId.get(candidate);
                if (logo) return logo;
            }
        }

        if (teamUrl) {
            const { data } = await (readClient as any)
                .from('external_teams')
                .select('logo_url')
                .eq('team_url', teamUrl)
                .maybeSingle();

            if (data?.logo_url) {
                return String(data.logo_url);
            }
        }

        if (teamName) {
            const { data: byName } = await (readClient as any)
                .from('external_teams')
                .select('logo_url')
                .eq('name', teamName)
                .maybeSingle();

            if (byName?.logo_url) {
                return String(byName.logo_url);
            }

            const { data: byShortName } = await (readClient as any)
                .from('external_teams')
                .select('logo_url')
                .eq('short_name', teamName)
                .maybeSingle();

            if (byShortName?.logo_url) {
                return String(byShortName.logo_url);
            }
        }
    } catch {
        // Ignore missing table/schema issues and fall back to the original logo.
    }

    if (teamUrl) {
        try {
            const details = await getTeamDetails(teamUrl);
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

function buildImageResponse(source: string, url: URL) {
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
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }

    const target = normalizedSource.startsWith('http://') || normalizedSource.startsWith('https://')
        ? new URL(normalizedSource)
        : new URL(normalizedSource, url.origin);

    return NextResponse.redirect(target);
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

    return NextResponse.json({ ok: false, error: 'logo not found' }, { status: 404 });
}
