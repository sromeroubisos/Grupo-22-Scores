import { sanitizeNext } from '@/lib/auth/redirect';

// La validación del destino vive en UN lugar (`sanitizeNext`): con dos copias,
// la que no se arregló era la puerta del open redirect. Acá solo se suma el
// destino por defecto según el rol que se eligió al entrar.
export function sanitizeReturnTo(raw: string | null, roleIntent?: string | null): string {
    if (!raw) {
        if (roleIntent === 'super_admin') return '/admin/super';
        if (roleIntent === 'admin_torneo' || roleIntent === 'gestor_torneos') return '/admin/torneo';
        if (roleIntent === 'admin_club' || roleIntent === 'familia_club') return '/club-admin';
        return '/';
    }

    return sanitizeNext(raw);
}
