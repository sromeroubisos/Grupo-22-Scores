const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
const DEFAULT_PUBLIC_ORIGINS = ['https://g22scores.com', 'https://www.g22scores.com'];

function firstHeaderValue(value: string | null | undefined): string | null {
    const first = value?.split(',')[0]?.trim();
    return first || null;
}

function ensureUrlLike(value: string): string {
    if (/^https?:\/\//i.test(value)) return value;
    const scheme = value.startsWith('localhost') || value.startsWith('127.') || value.startsWith('[::1]')
        ? 'http'
        : 'https';
    return `${scheme}://${value.replace(/^\/+/, '')}`;
}

function normalizeHost(value: string | null | undefined): string | null {
    const raw = firstHeaderValue(value);
    if (!raw) return null;

    try {
        if (/^https?:\/\//i.test(raw)) {
            return new URL(raw).host.toLowerCase();
        }

        const hostCandidate = raw === '::1' ? '[::1]' : raw.replace(/^\/+/, '');
        return new URL(`http://${hostCandidate}`).host.toLowerCase();
    } catch {
        return null;
    }
}

function normalizeOrigin(value: string | null | undefined): string | null {
    const raw = firstHeaderValue(value);
    if (!raw) return null;

    try {
        const parsed = new URL(ensureUrlLike(raw));
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return `${parsed.protocol}//${parsed.host.toLowerCase()}`;
    } catch {
        return null;
    }
}

function getUrlHost(value: string | null | undefined): string | null {
    if (!value) return null;

    try {
        return new URL(value).host.toLowerCase();
    } catch {
        return null;
    }
}

function getUrlProtocol(value: string | null | undefined): 'http' | 'https' | null {
    if (!value) return null;

    try {
        const protocol = new URL(value).protocol.replace(':', '');
        return protocol === 'http' || protocol === 'https' ? protocol : null;
    } catch {
        return null;
    }
}

function splitHost(host: string): { hostname: string; port: string } | null {
    try {
        const parsed = new URL(`http://${host}`);
        return {
            hostname: parsed.hostname.toLowerCase(),
            port: parsed.port,
        };
    } catch {
        return null;
    }
}

function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isLocalHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname);
    return LOCAL_HOSTNAMES.has(hostname) || LOCAL_HOSTNAMES.has(normalized);
}

function getConfiguredOrigins(): string[] {
    const envValues = [
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.NEXT_PUBLIC_BASE_URL,
        process.env.SITE_URL,
        process.env.AUTH_ALLOWED_ORIGINS,
        process.env.NEXT_PUBLIC_AUTH_ALLOWED_ORIGINS,
    ];

    const origins = new Set<string>();

    envValues.forEach((value) => {
        value?.split(',').forEach((entry) => {
            const origin = normalizeOrigin(entry.trim());
            if (origin) origins.add(origin);
        });
    });

    DEFAULT_PUBLIC_ORIGINS.forEach((origin) => origins.add(origin));
    return [...origins];
}

function getTrustedHostnames(): Set<string> {
    const hostnames = new Set<string>();

    getConfiguredOrigins().forEach((origin) => {
        const host = splitHost(getUrlHost(origin) || '');
        if (host) hostnames.add(normalizeHostname(host.hostname));
    });

    return hostnames;
}

function isTrustedAppHost(host: string): boolean {
    const parts = splitHost(host);
    if (!parts) return false;
    const hostname = normalizeHostname(parts.hostname);

    return isLocalHostname(parts.hostname) || getTrustedHostnames().has(hostname);
}

function isLocalHost(host: string): boolean {
    const parts = splitHost(host);
    return Boolean(parts && isLocalHostname(parts.hostname));
}

function areEquivalentHosts(left: string, right: string): boolean {
    if (left === right) return true;

    const leftParts = splitHost(left);
    const rightParts = splitHost(right);
    if (!leftParts || !rightParts) return false;
    if (leftParts.port !== rightParts.port) return false;

    return isLocalHostname(leftParts.hostname) && isLocalHostname(rightParts.hostname);
}

function areEquivalentOrigins(left: string, right: string): boolean {
    if (left === right) return true;

    try {
        const leftUrl = new URL(left);
        const rightUrl = new URL(right);
        if (leftUrl.protocol !== rightUrl.protocol) return false;
        return areEquivalentHosts(leftUrl.host.toLowerCase(), rightUrl.host.toLowerCase());
    } catch {
        return false;
    }
}

function getRequestHostCandidates(request: Request): string[] {
    return [
        normalizeHost(request.headers.get('x-forwarded-host')),
        normalizeHost(request.headers.get('host')),
        getUrlHost(request.url),
    ].filter((host): host is string => Boolean(host));
}

export function getTrustedRequestHost(request: Request): string | null {
    return getRequestHostCandidates(request).find(isTrustedAppHost) || null;
}

// Origins built from the request's OWN resolved host (x-forwarded-host >
// host > url). Used purely for the same-origin (CSRF) check: a request whose
// Origin equals the host actually serving it is same-origin by definition,
// regardless of whether that host is in the static trusted allowlist. This
// is what lets login work on preview/staging deploys (Vercel preview URLs,
// new domains) without weakening CSRF protection — a cross-site attacker's
// Origin still will not equal the victim host.
function getRequestSelfOrigins(request: Request): string[] {
    return getRequestHostCandidates(request).map(
        (host) => `${getProtocolForHost(request, host)}://${host}`,
    );
}

export function getAuthCookieHost(request: Request): string {
    const configuredHosts = [
        getUrlHost(process.env.NEXT_PUBLIC_SITE_URL),
        getUrlHost(process.env.NEXT_PUBLIC_BASE_URL),
        getUrlHost(process.env.SITE_URL),
    ].filter((host): host is string => Boolean(host));
    const configuredHost = configuredHosts.find((host) => (
        process.env.NODE_ENV !== 'production' || !isLocalHost(host)
    )) || (process.env.NODE_ENV !== 'production' ? configuredHosts[0] : null);

    return (
        getTrustedRequestHost(request) ||
        // On preview/staging (host not in the trusted allowlist) prefer the
        // request's REAL host over the static configured host. Otherwise the
        // auth cookie is scoped to g22scores.com (Domain=.g22scores.com) and
        // the browser rejects it on a *.vercel.app preview, so login never
        // persists. A non-g22scores host yields a host-only cookie
        // (getSupabaseSharedCookieDomain → undefined), which is correct.
        // Prod (g22scores.com) and localhost are already trusted hosts, so
        // this branch never changes their behaviour.
        getRequestHostCandidates(request)[0] ||
        configuredHost ||
        getUrlHost(DEFAULT_PUBLIC_ORIGINS[0]) ||
        getUrlHost(request.url) ||
        'localhost:3000'
    );
}

function getProtocolForHost(request: Request, host: string): 'http' | 'https' {
    const parts = splitHost(host);
    if (parts && !isLocalHostname(parts.hostname)) {
        return 'https';
    }

    const forwardedProtocol = firstHeaderValue(request.headers.get('x-forwarded-proto'));
    if (forwardedProtocol === 'http' || forwardedProtocol === 'https') {
        return forwardedProtocol;
    }

    return getUrlProtocol(request.url) || 'http';
}

export function getAllowedRequestOrigins(request: Request): string[] {
    const origins = new Set(getConfiguredOrigins());
    const trustedHost = getTrustedRequestHost(request);

    if (trustedHost) {
        origins.add(`${getProtocolForHost(request, trustedHost)}://${trustedHost}`);
    }

    return [...origins];
}

export function isSameOriginRequest(request: Request): boolean {
    // Configured/trusted origins PLUS the request's own resolved origin. The
    // latter makes a request that genuinely originates from the host serving
    // it pass on any deploy domain (preview/staging), while a cross-site
    // attacker's Origin still fails to match the serving host.
    const candidateOrigins = [
        ...new Set([
            ...getAllowedRequestOrigins(request),
            ...getRequestSelfOrigins(request),
        ]),
    ];
    const origin = normalizeOrigin(request.headers.get('origin'));

    if (origin) {
        return candidateOrigins.some((allowedOrigin) => areEquivalentOrigins(origin, allowedOrigin));
    }

    const refererOrigin = normalizeOrigin(request.headers.get('referer'));
    if (refererOrigin) {
        return candidateOrigins.some((allowedOrigin) => areEquivalentOrigins(refererOrigin, allowedOrigin));
    }

    const secFetchSite = request.headers.get('sec-fetch-site');
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        return false;
    }

    // Older browsers/privacy modes can omit Origin/Referer on same-origin POSTs.
    // Only allow that fallback when the target request itself resolves to a known app host.
    return Boolean(getTrustedRequestHost(request));
}

export function getRequestOrigin(request: Request): string {
    const host = getAuthCookieHost(request);
    return `${getProtocolForHost(request, host)}://${host}`;
}

export function getRequestOriginDebugInfo(request: Request) {
    return {
        origin: request.headers.get('origin'),
        refererOrigin: normalizeOrigin(request.headers.get('referer')),
        secFetchSite: request.headers.get('sec-fetch-site'),
        host: firstHeaderValue(request.headers.get('host')),
        forwardedHost: firstHeaderValue(request.headers.get('x-forwarded-host')),
        forwardedProto: firstHeaderValue(request.headers.get('x-forwarded-proto')),
        requestUrlHost: getUrlHost(request.url),
        trustedHost: getTrustedRequestHost(request),
        cookieHost: getAuthCookieHost(request),
        requestOrigin: getRequestOrigin(request),
        allowedOrigins: getAllowedRequestOrigins(request),
    };
}
