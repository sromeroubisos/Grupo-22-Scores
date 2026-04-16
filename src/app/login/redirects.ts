export function sanitizeReturnTo(raw: string | null, roleIntent?: string | null): string {
    if (!raw) {
        if (roleIntent === 'super_admin') return '/admin/super'
        return '/'
    }

    if (raw.startsWith('/') && !raw.startsWith('//')) {
        return raw
    }

    return '/'
}
