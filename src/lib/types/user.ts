// User types for G22 Scores

export type UserRole = 'fan' | 'user' | 'super_admin' | 'operator' | 'club_admin' | 'admin_general';

export type EntityType = 'league' | 'club' | 'tournament' | 'team' | 'player';

export interface User {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    role: UserRole;
    country: string | null;
    favorite_sport: string | null;
    created_at: string;
    last_login_at: string;
    updated_at: string;
}

export interface Favorite {
    id: string;
    user_id: string;
    entity_type: EntityType;
    entity_id: string;
    created_at: string;
}

export interface UserProfile {
    user: User;
    favorites_count: number;
}

// Super Admin constant
export const SUPER_ADMIN_EMAIL = 'superadmin@g22scores.com';

// Helper to check if email is super admin
export function isSuperAdminEmail(email: string): boolean {
    return email === SUPER_ADMIN_EMAIL;
}

// Helper to check if user is super admin
export function isSuperAdmin(user: User | null): boolean {
    return user?.role === 'super_admin' || user?.role === 'admin_general';
}

// Helper to check if user can access admin panel
export function canAccessAdminPanel(user: User | null): boolean {
    return isSuperAdmin(user) || user?.role === 'operator' || user?.role === 'club_admin';
}
