const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

function firstHeaderValue(value: string | null): string | null {
    const first = value?.split(',')[0]?.trim();
    return first || null;
}

function normalizeHost(value: string | null | undefined): string | null {
    const raw = firstHeaderValue(value ?? null);
    if (!raw) return null;

    try {
        if (/^https?:\/\//i.test(raw)) {
            return new URL(raw).host.toLowerCase();
        }

        return new URL(`http://${raw.replace(/^\/+/, '')}`).host.toLowerCase();
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

function areEquivalentHosts(left: string, right: string): boolean {
    if (left === right) return true;

    const leftParts = splitHost(left);
    const rightParts = splitHost(right);
    if (!leftParts || !rightParts) return false;
    if (leftParts.port !== rightParts.port) return false;

    return LOCAL_HOSTNAMES.has(leftParts.hostname) && LOCAL_HOSTNAMES.has(rightParts.hostname);
}

function getAllowedHosts(request: Request): string[] {
    const hosts = new Set<string>();

    [
        normalizeHost(request.headers.get('x-forwarded-host')),
        normalizeHost(request.headers.get('host')),
        getUrlHost(request.url),
    ].forEach((host) => {
        if (host) hosts.add(host);
    });

    return [...hosts];
}

export function isSameOriginRequest(request: Request): boolean {
    const origin = request.headers.get('origin');
    if (!origin) return true;

    let originHost: string | null = null;
    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        originHost = parsed.host.toLowerCase();
    } catch {
        return false;
    }

    return getAllowedHosts(request).some((host) => areEquivalentHosts(originHost!, host));
}

export function getRequestOrigin(request: Request): string {
    const host =
        normalizeHost(request.headers.get('x-forwarded-host')) ||
        normalizeHost(request.headers.get('host')) ||
        getUrlHost(request.url) ||
        getUrlHost(process.env.NEXT_PUBLIC_SITE_URL) ||
        'localhost:3000';

    const forwardedProtocol = firstHeaderValue(request.headers.get('x-forwarded-proto'));
    const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
        ? forwardedProtocol
        : new URL(request.url).protocol.replace(':', '') || 'https';

    return `${protocol}://${host}`;
}
