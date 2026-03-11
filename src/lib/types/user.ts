// User types for G22 Scores

import { Database } from "../database.types";

export type UserRole = 'fan' | 'user' | 'super_admin' | 'operator' | 'club_admin' | 'admin_general';

export type EntityType = 'league' | 'club' | 'tournament' | 'team' | 'player';

export type DbUser = Database["public"]["Tables"]["users"]["Row"];

export interface User extends DbUser {
    country?: string | null;
    favorite_sport?: string | null;
    updated_at?: string | null;
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
const AUTHORIZED_SUPER_ADMINS = [SUPER_ADMIN_EMAIL, 'deportesgrupo@gmail.com', 'sromeroubisos@gmail.com'];

// Helper to check if email is super admin
export function isSuperAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const lowerEmail = email.toLowerCase();
    return AUTHORIZED_SUPER_ADMINS.some(adminEmail => adminEmail.toLowerCase() === lowerEmail);
}

// Helper to check if user is super admin
export function isSuperAdmin(user: User | null): boolean {
    return user?.role === 'super_admin' || user?.role === 'admin_general';
}

// Helper to check if user can access admin panel
export function canAccessAdminPanel(user: User | null): boolean {
    return isSuperAdmin(user) || user?.role === 'operator' || user?.role === 'club_admin';
}
