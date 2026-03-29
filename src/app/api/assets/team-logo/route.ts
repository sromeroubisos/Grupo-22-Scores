import { access } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { getExternalTeamLogoOverride } from '@/lib/server/externalTeamLogoOverrides';

const LOGO_DIR = path.join(process.cwd(), 'public', 'logos', 'clubs');
const EXTENSIONS = ['.png', '.svg', '.webp', '.jpg', '.jpeg', '.avif'];

function addCandidate(candidates: Set<string>, value: string) {
    const raw = value.trim();
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

    candidates.add(`fs-team-${raw}`);
    candidates.add(`fs-team-${normalized}`);
    candidates.add(`fs-${raw}`);
    candidates.add(`fs-${normalized}`);
    candidates.add(`ras-team-${raw}`);
    candidates.add(`ras-team-${normalized}`);
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

async function findCachedLogo(key: string): Promise<string | null> {
    const candidateSet = new Set<string>();
    addCandidate(candidateSet, key);
    const candidates = Array.from(candidateSet);

    for (const candidate of candidates) {
        const storedOverride = await getExternalTeamLogoOverride(candidate);
        if (storedOverride?.logo_url) {
            return storedOverride.logo_url;
        }
    }

    try {
        const readClient = await getReadClient();
        const { data } = await (readClient as any)
            .from('external_teams')
            .select('id, logo_url')
            .in('id', candidates);

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
    } catch {
        // Ignore missing table/schema issues and fall back to the original logo.
    }

    return null;
}

function buildImageResponse(source: string, url: URL) {
    if (source.startsWith('data:')) {
        const commaIndex = source.indexOf(',');
        if (commaIndex === -1) {
            return NextResponse.json({ ok: false, error: 'invalid data url' }, { status: 400 });
        }

        const header = source.slice(5, commaIndex);
        const body = source.slice(commaIndex + 1);
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

    const target = source.startsWith('http://') || source.startsWith('https://')
        ? new URL(source)
        : new URL(source, url.origin);

    return NextResponse.redirect(target);
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key')?.trim() || '';
    const fallback = url.searchParams.get('fallback')?.trim() || '';

    if (!key) {
        return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });
    }

    const localLogo = await findLogoFile(key);
    if (localLogo) {
        return buildImageResponse(localLogo, url);
    }

    const cachedLogo = await findCachedLogo(key);
    if (cachedLogo) {
        return buildImageResponse(cachedLogo, url);
    }

    if (fallback) {
        return buildImageResponse(fallback, url);
    }

    return NextResponse.json({ ok: false, error: 'logo not found' }, { status: 404 });
}
