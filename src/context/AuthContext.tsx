'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';

type UserRole = 'fan' | 'jugador' | 'entrenador' | 'admin_general' | 'admin_union' | 'admin_torneo' | 'operador' | 'admin_club';

interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatarUrl?: string;
    unionId?: string;
    tournamentId?: string;
    clubId?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (role?: UserRole) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    const fetchAndSetUser = async (sbUser: SupabaseUser) => {
        try {
            // Fetch profile from 'users' table
            const { data: profile, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', sbUser.id)
                .single();

            if (profile) {
                // Map Supabase 'super_admin' to context 'admin_general' for compatibility
                const contextRole: UserRole = profile.role === 'super_admin' ? 'admin_general' : 'fan';

                setUser({
                    id: profile.id,
                    name: profile.name || sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: profile.email || sbUser.email || '',
                    role: contextRole,
                    avatarUrl: profile.avatar_url || sbUser.user_metadata?.avatar_url,
                });
            } else {
                // Fallback to auth metadata if profile can't be fetched
                setUser({
                    id: sbUser.id,
                    name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: sbUser.email || '',
                    role: 'fan',
                    avatarUrl: sbUser.user_metadata?.avatar_url,
                });
            }
        } catch (err) {
            console.error('Error fetching user profile:', err);
        }
    };

    useEffect(() => {
        // Initial session check
        const initAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await fetchAndSetUser(session.user);
            } else {
                setUser(null);
            }
            setIsLoading(false);
        };

        initAuth();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                await fetchAndSetUser(session.user);
            } else {
                setUser(null);
                localStorage.removeItem('g22_user');
            }
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const login = (role: UserRole = 'fan') => {
        // Redirect to login page
        window.location.href = '/login';
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        localStorage.removeItem('g22_user');
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
