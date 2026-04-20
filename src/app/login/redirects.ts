export function sanitizeReturnTo(raw: string | null, roleIntent?: string | null): string {
    if (!raw) {
        if (roleIntent === 'super_admin') return '/admin/super'
        if (roleIntent === 'admin_club' || roleIntent === 'familia_club') return '/club-admin'
        return '/'
    }

    if (raw.startsWith('/') && !raw.startsWith('//')) {
        return raw
    }

    return '/'
}
