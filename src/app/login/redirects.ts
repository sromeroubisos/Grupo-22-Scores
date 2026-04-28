export function sanitizeReturnTo(raw: string | null, roleIntent?: string | null): string {
    if (!raw) {
        if (roleIntent === 'super_admin') return '/admin/super';
        if (roleIntent === 'admin_club' || roleIntent === 'familia_club') return '/club-admin';
        return '/';
    }

    // Prevent open redirects
    if (
        !raw.startsWith('/') ||
        raw.startsWith('//') ||
        raw.includes('@') ||
        raw.includes('\\') ||
        /^(https?|javascript|data|file|ftp):/i.test(raw)
    ) {
        return '/';
    }

    // Prevent auth loops
    const lower = raw.toLowerCase();
    if (
        lower === '/login' ||
        lower.startsWith('/login?') ||
        lower === '/register' ||
        lower.startsWith('/register?') ||
        lower.startsWith('/auth/')
    ) {
        return '/';
    }

    return raw;
}
