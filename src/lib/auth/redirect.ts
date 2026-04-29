export function sanitizeNext(raw: string | null): string {
    if (!raw) return '/'
    // Block open redirects: no protocol-like prefixes, no @, no double slashes
    if (
        !raw.startsWith('/') ||
        raw.startsWith('//') ||
        raw.includes('@') ||
        raw.includes('\\') ||
        /^(https?|javascript|data|file|ftp):/i.test(raw)
    ) {
        return '/'
    }
    // Prevent redirect loops back to auth pages
    const lower = raw.toLowerCase()
    if (
        lower === '/login' ||
        lower.startsWith('/login?') ||
        lower === '/register' ||
        lower.startsWith('/register?') ||
        lower.startsWith('/auth/')
    ) {
        return '/'
    }
    return raw
}
