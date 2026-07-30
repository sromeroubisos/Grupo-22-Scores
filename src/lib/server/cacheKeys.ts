import 'server-only';

// Source of truth for server response-cache namespaces. Bump these when the
// response shape changes and keep invalidation modules importing from here.
export const MATCHES_RESPONSE_CACHE_PREFIX = 'matches-response:v10';
export const PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX = 'public-tournaments-response:v8';
export const HOME_MANUAL_TOURNAMENTS_CACHE_PREFIX = 'home-manual-tournaments:v1';

// Transitional cleanup only: these namespaces existed before the shared source
// of truth and may still be present in long-lived dev/server processes.
export const LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES = [
    'matches-response:v5',
    'matches-response:v3',
] as const;

export const LEGACY_PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIXES = [
    'public-tournaments-response:v3',
] as const;
