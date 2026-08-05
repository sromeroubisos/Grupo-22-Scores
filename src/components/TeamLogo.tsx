'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { isTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import styles from './TeamLogo.module.css';

type LogoSource = Record<string, unknown> | null | undefined;

type TeamLogoProps = {
    name: string;
    logoUrl?: string | null;
    teamId?: string | number | null;
    shortName?: string | null;
    source?: LogoSource;
    sources?: LogoSource[];
    className?: string;
    imgClassName?: string;
    fallbackClassName?: string;
    style?: CSSProperties;
    size?: number;
    radius?: 'round' | 'square';
    title?: string;
    disableLookup?: boolean;
};

function joinClasses(...values: Array<string | undefined | null | false>) {
    return values.filter(Boolean).join(' ');
}

function getInitials(name: string, shortName?: string | null) {
    const preferred = (shortName || '').trim();
    if (preferred) {
        return preferred.slice(0, 2).toUpperCase();
    }

    const cleaned = name.trim();
    if (!cleaned) return '?';

    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return parts
        .slice(0, 2)
        .map((part) => part[0] || '')
        .join('')
        .toUpperCase();
}

function buildLookupUrl(key: string, name: string) {
    const params = new URLSearchParams();
    params.set('key', key);
    if (name.trim()) params.set('name', name.trim());
    return `/api/assets/team-logo?${params.toString()}`;
}

export default function TeamLogo({
    name,
    logoUrl,
    teamId,
    shortName,
    source,
    sources = [],
    className,
    imgClassName,
    fallbackClassName,
    style,
    size,
    radius = 'square',
    title,
    disableLookup = false,
}: TeamLogoProps) {
    const seedSource = useMemo<LogoSource>(() => ({
        id: teamId ?? undefined,
        name,
        short_name: shortName ?? undefined,
        logo_url: logoUrl ?? undefined,
        logo: logoUrl ?? undefined,
    }), [logoUrl, name, shortName, teamId]);

    const resolvedLogo = useMemo(
        () => resolveTeamLogo(seedSource, source, ...sources),
        [seedSource, source, sources],
    );

    const lookupKey = useMemo(() => {
        const candidates = [
            teamId,
            source && typeof source.id !== 'undefined' ? source.id : null,
            shortName,
            name,
        ];

        for (const candidate of candidates) {
            if (candidate === null || candidate === undefined) continue;
            const normalized = String(candidate).trim();
            if (normalized) return normalized;
        }

        return '';
    }, [name, shortName, source, teamId]);

    const lookupUrl = useMemo(() => {
        if (disableLookup) return '';
        if (!lookupKey && !name.trim()) return '';
        return buildLookupUrl(lookupKey || name.trim(), name);
    }, [disableLookup, lookupKey, name]);

    const [failedSources, setFailedSources] = useState<string[]>([]);
    const [retryToken, setRetryToken] = useState(0);
    const candidateSources = useMemo(
        () => [resolvedLogo, lookupUrl].filter((value): value is string => Boolean(value)),
        [lookupUrl, resolvedLogo],
    );
    const currentSrc = candidateSources.find((value) => !failedSources.includes(value)) || '';

    // El proxy sabe redimensionar: pedirle el escudo al tamano en que se pinta
    // (x2 por pantallas densas) evita bajar un PNG de 1080 px para un chip de 28.
    // Ojo: `currentSrc` sigue siendo la clave de `failedSources`, asi que el ancho
    // va solo en el src del <img> y no rompe el descarte de fuentes caidas.
    const imageSrc = useMemo(() => {
        if (!currentSrc) return '';
        const retrySuffix = retryToken ? `&retry=${retryToken}` : '';
        if (typeof size !== 'number' || !isTeamLogoProxyUrl(currentSrc)) {
            return `${currentSrc}${retrySuffix}`;
        }
        return `${currentSrc}${currentSrc.includes('?') ? '&' : '?'}w=${Math.round(size * 2)}${retrySuffix}`;
    }, [currentSrc, retryToken, size]);

    // Un pico de carga no puede dejar el escudo en iniciales para siempre: antes,
    // el primer error marcaba la fuente como caida y no se reintentaba nunca.
    const handleError = useCallback(() => {
        if (retryToken < 1) {
            setRetryToken(retryToken + 1);
            return;
        }

        // Ya reintentamos: recien ahora damos la fuente por caida y pasamos a la
        // siguiente candidata (con el contador en cero, para que ella tambien
        // tenga su reintento).
        setRetryToken(0);
        setFailedSources((sources) => (
            sources.includes(currentSrc) ? sources : [...sources, currentSrc]
        ));
    }, [currentSrc, retryToken]);

    const initials = useMemo(() => getInitials(name, shortName), [name, shortName]);
    const mergedStyle: CSSProperties = {
        ...(typeof size === 'number' ? { width: size, height: size } : null),
        ...style,
    };

    return (
        <span
            className={joinClasses(styles.root, styles[radius], className)}
            style={mergedStyle}
            title={title || name}
            aria-hidden={false}
        >
            {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={imageSrc}
                    alt={title || name}
                    className={joinClasses(styles.image, imgClassName)}
                    loading="lazy"
                    decoding="async"
                    onError={handleError}
                />
            ) : (
                <span className={joinClasses(styles.fallback, fallbackClassName)}>
                    {initials}
                </span>
            )}
        </span>
    );
}
