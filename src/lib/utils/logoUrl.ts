import { getAllCountries } from '@/lib/data/countries';
import { normalizeText, normalizeUrl } from './normalize';

const FLATICON_HOST_REGEX = /(^|\.)flaticon\./i;

type ParsedMarkup = {
    extractedUrl: string | null;
    title: string;
    text: string;
};

type FlagCountryCandidate = {
    assetCode: string;
    keys: string[];
};

function slugifyComparable(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function extractMarkupAttribute(markup: string, attribute: 'href' | 'src' | 'title'): string | null {
    const quotedMatch = markup.match(new RegExp(`${attribute}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
    if (quotedMatch?.[2]) {
        return quotedMatch[2].trim();
    }

    const unquotedMatch = markup.match(new RegExp(`${attribute}\\s*=\\s*([^\\s>]+)`, 'i'));
    return unquotedMatch?.[1]?.trim() || null;
}

function stripMarkup(value: string): string {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMarkup(value: string): ParsedMarkup {
    if (!/[<>]/.test(value)) {
        return { extractedUrl: null, title: '', text: '' };
    }

    return {
        extractedUrl: extractMarkupAttribute(value, 'src') || extractMarkupAttribute(value, 'href'),
        title: extractMarkupAttribute(value, 'title') || '',
        text: stripMarkup(value),
    };
}

function getFlagAssetCode(countryId: string, countryCode?: string | null): string | null {
    const normalizedId = countryId.trim().toLowerCase();

    if (normalizedId === 'england') return 'gb-eng';
    if (normalizedId === 'scotland') return 'gb-sct';
    if (normalizedId === 'wales') return 'gb-wls';

    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode.trim())) {
        return null;
    }

    return countryCode.trim().toLowerCase();
}

const FLAG_COUNTRY_CANDIDATES: FlagCountryCandidate[] = getAllCountries()
    .map((country) => {
        const assetCode = getFlagAssetCode(country.id, country.code);
        if (!assetCode) {
            return null;
        }

        const keys = Array.from(
            new Set(
                [country.id, country.name, country.nameEs, country.code]
                    .map((value) => normalizeText(value))
                    .filter((value): value is string => Boolean(value))
                    .map(slugifyComparable)
                    .filter(Boolean),
            ),
        );

        if (keys.length === 0) {
            return null;
        }

        return {
            assetCode,
            keys,
        };
    })
    .filter((candidate): candidate is FlagCountryCandidate => candidate !== null)
    .sort((left, right) => {
        const leftSize = Math.max(...left.keys.map((key) => key.length));
        const rightSize = Math.max(...right.keys.map((key) => key.length));
        return rightSize - leftSize;
    });

function isCountryKeyMatch(candidate: string, key: string): boolean {
    return (
        candidate === key ||
        candidate.startsWith(`${key}-`) ||
        candidate.endsWith(`-${key}`) ||
        candidate.includes(`-${key}-`)
    );
}

function resolveFlaticonCountryFlagUrl(...values: Array<string | null | undefined>): string | null {
    const nonEmptyValues = values
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value));

    if (!nonEmptyValues.some((value) => FLATICON_HOST_REGEX.test(value))) {
        return null;
    }

    for (const value of nonEmptyValues) {
        const candidate = slugifyComparable(value);
        if (!candidate) continue;

        for (const country of FLAG_COUNTRY_CANDIDATES) {
            if (country.keys.some((key) => isCountryKeyMatch(candidate, key))) {
                return `https://flagcdn.com/w160/${country.assetCode}.png`;
            }
        }
    }

    return null;
}

export function normalizeLogoUrl(value: unknown): string | null {
    const raw = normalizeText(value);
    if (!raw) return null;

    const trimmed = raw.trim();
    if (trimmed.startsWith('<svg')) {
        return trimmed;
    }

    const parsedMarkup = parseMarkup(trimmed);
    const extractedUrl = parsedMarkup.extractedUrl || trimmed;
    const flaticonCountryFlag = resolveFlaticonCountryFlagUrl(
        trimmed,
        extractedUrl,
        parsedMarkup.title,
        parsedMarkup.text,
    );

    if (flaticonCountryFlag) {
        return flaticonCountryFlag;
    }

    return normalizeUrl(extractedUrl);
}

export function resolveLogoPreviewSrc(value: unknown): string | null {
    const normalized = normalizeLogoUrl(value);
    if (!normalized) return null;

    if (normalized.trim().startsWith('<svg')) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized.trim())}`;
    }

    return normalized;
}
