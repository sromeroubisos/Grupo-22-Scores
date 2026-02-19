'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User as SupabaseUser, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { normalizeRole, type AppUserRole, type MembershipLike } from '@/lib/auth/roles';

interface User {
    id: string;
    name: string;
    email: string;
    role: AppUserRole;
    avatarUrl?: string;
    unionId?: string;
    tournamentId?: string;
    clubId?: string;
    memberships?: MembershipLike[];
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (role?: AppUserRole) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isAbortError = (err: any) => {
    return (
        err?.name === 'AbortError' ||
        err?.message?.includes('abort') ||
        err?.message?.includes('signal is aborted')
    );
};

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
                const { data: membershipsData, error: membershipsError } = await supabase
                    .from('memberships')
                    .select('scope_type, scope_id, role')
                    .eq('user_id', sbUser.id);

                if (membershipsError && !isAbortError(membershipsError)) {
                    console.warn('Error fetching memberships:', membershipsError.message);
                }

                const memberships: MembershipLike[] = (membershipsData || []).map((membership: any) => ({
                    scopeType: membership.scope_type,
                    scopeId: membership.scope_id,
                    role: membership.role,
                }));

                const contextRole: AppUserRole = normalizeRole(profile.role);

                setUser({
                    id: profile.id,
                    name: profile.name || sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: profile.email || sbUser.email || '',
                    role: contextRole,
                    avatarUrl: profile.avatar_url || sbUser.user_metadata?.avatar_url,
                    memberships,
                });
            } else {
                // Fallback to auth metadata if profile can't be fetched
                setUser({
                    id: sbUser.id,
                    name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: sbUser.email || '',
                    role: 'fan',
                    avatarUrl: sbUser.user_metadata?.avatar_url,
                    memberships: [],
                });
            }
        } catch (err: any) {
            if (isAbortError(err)) return;
            console.error('Error fetching user profile:', err);
        }
    };

    useEffect(() => {
        isMounted.current = true;

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
                if (isAbortError(err)) return;
                console.error('Error initializing auth:', err);
            } finally {
                if (isMounted.current) {
                    setIsLoading(false);
                }
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
            if (!isMounted.current) return;

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                if (session?.user) {
                    await fetchAndSetUser(session.user);
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                localStorage.removeItem('g22_user');
            }
            setIsLoading(false);
        });

        // Initialize last to ensure listener is ready
        initAuth();

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
        };
    }, []);

    const login = (role: AppUserRole = 'fan') => {
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
