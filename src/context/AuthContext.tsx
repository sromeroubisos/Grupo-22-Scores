'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
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
    const isMounted = useRef(true);

    const fetchAndSetUser = async (sbUser: SupabaseUser) => {
        try {
            // Fetch profile from 'users' table
            const { data: profile, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', sbUser.id)
                .single();

            if (!isMounted.current) return;

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
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) return;
            console.error('Error fetching user profile:', err);
        }
    };

    useEffect(() => {
        isMounted.current = true;

        // Initial session check
        const initAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;

                if (isMounted.current) {
                    if (session) {
                        await fetchAndSetUser(session.user);
                    } else {
                        setUser(null);
                    }
                }
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('abort')) return;
                console.error('Error initializing auth:', err);
            } finally {
                if (isMounted.current) {
                    setIsLoading(false);
                }
            }
        };

        initAuth();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted.current) return;

            if (session?.user) {
                await fetchAndSetUser(session.user);
            } else {
                setUser(null);
                localStorage.removeItem('g22_user');
            }
            setIsLoading(false);
        });

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
        };
    }, []);

    const login = (role: UserRole = 'fan') => {
        // Redirect to login page
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            if (isMounted.current) {
                setUser(null);
                localStorage.removeItem('g22_user');
            }
        } catch (error) {
            console.error('Error logging out:', error);
        }
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
