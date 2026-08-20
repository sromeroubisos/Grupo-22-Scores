'use client';

import useSWR, { useSWRConfig, type SWRConfiguration } from 'swr';

export class ClubAdminFetchError extends Error {
    constructor(public status: number, message: string, public payload?: unknown) {
        super(message);
        this.name = 'ClubAdminFetchError';
    }
}

const defaultFetcher = async (url: string) => {
    const res = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        let payload: unknown;
        try {
            payload = await res.json();
        } catch {
            payload = await res.text().catch(() => undefined);
        }
        throw new ClubAdminFetchError(res.status, `HTTP ${res.status} ${res.statusText}`, payload);
    }
    return res.json();
};

const baseConfig: SWRConfiguration = {
    revalidateOnFocus: false,
    revalidateIfStale: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
    errorRetryCount: 2,
    errorRetryInterval: 1500,
    shouldRetryOnError: (err) => {
        if (err instanceof ClubAdminFetchError) {
            return err.status >= 500;
        }
        return true;
    },
};

export type UseClubAdminQueryOptions<T> = {
    fallbackData?: T;
    revalidateOnFocus?: boolean;
    refreshInterval?: number;
    enabled?: boolean;
    dedupingInterval?: number;
};

export function useClubAdminQuery<T = unknown>(
    endpoint: string | null | undefined,
    options: UseClubAdminQueryOptions<T> = {}
) {
    const enabled = options.enabled ?? true;
    const key = enabled && endpoint ? endpoint : null;

    const swr = useSWR<T, ClubAdminFetchError>(key, defaultFetcher, {
        ...baseConfig,
        revalidateOnFocus: options.revalidateOnFocus ?? baseConfig.revalidateOnFocus,
        refreshInterval: options.refreshInterval,
        fallbackData: options.fallbackData,
        dedupingInterval: options.dedupingInterval ?? baseConfig.dedupingInterval,
    });

    return {
        data: swr.data,
        error: swr.error,
        isLoading: swr.isLoading,
        isValidating: swr.isValidating,
        mutate: swr.mutate,
    };
}

export function useClubAdminMutator() {
    const { mutate } = useSWRConfig();

    return {
        invalidate(endpointOrPattern: string | RegExp) {
            if (endpointOrPattern instanceof RegExp) {
                return mutate(
                    (key) => typeof key === 'string' && endpointOrPattern.test(key),
                    undefined,
                    { revalidate: true }
                );
            }
            return mutate(endpointOrPattern);
        },
        invalidatePrefix(prefix: string) {
            return mutate(
                (key) => typeof key === 'string' && key.startsWith(prefix),
                undefined,
                { revalidate: true }
            );
        },
        invalidateAllClubAdmin() {
            return mutate(
                (key) => typeof key === 'string' && key.startsWith('/api/club-admin/'),
                undefined,
                { revalidate: true }
            );
        },
    };
}

export function buildClubAdminEndpoint(
    path: string,
    params: Record<string, string | number | boolean | null | undefined>
): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined || value === '') continue;
        searchParams.append(key, String(value));
    }
    const qs = searchParams.toString();
    return qs ? `${path}?${qs}` : path;
}
