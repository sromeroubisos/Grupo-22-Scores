// User types for G22 Scores

import { Database } from "../database.types";
import type { AppUserRole } from "@/lib/auth/roles";

export type UserRole =
    | AppUserRole
    | 'admin'
    | 'operator'
    | 'club_admin'
    | 'admin_general'
    | 'admin_club'
    | 'fan'
    | 'familia_club'
    | 'user'
    | 'super_admin';

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
export const AUTHORIZED_SUPER_ADMIN_EMAILS = [SUPER_ADMIN_EMAIL] as const;
export const AUTHORIZED_ADMIN_GENERAL_EMAILS = ['sromeroubisos@gmail.com'] as const;

// Helper to check if email is super admin
export function isSuperAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const lowerEmail = email.toLowerCase();
    return AUTHORIZED_SUPER_ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === lowerEmail);
}

export function isAdminGeneralEmail(email?: string | null): boolean {
    if (!email) return false;
    const lowerEmail = email.toLowerCase();
    return AUTHORIZED_ADMIN_GENERAL_EMAILS.some(adminEmail => adminEmail.toLowerCase() === lowerEmail);
}

export function getReservedAdminRole(email?: string | null): 'super_admin' | 'admin_general' | null {
    if (isSuperAdminEmail(email)) return 'super_admin';
    if (isAdminGeneralEmail(email)) return 'admin_general';
    return null;
}

// Helper to check if user is super admin
export function isSuperAdmin(user: User | null): boolean {
    return user?.role === 'super_admin';
}

export function isGlobalAdmin(user: User | null): boolean {
    return user?.role === 'super_admin' || user?.role === 'admin_general';
}

// Helper to check if user can access admin panel
export function canAccessAdminPanel(user: User | null): boolean {
    return Boolean(isGlobalAdmin(user));
}
