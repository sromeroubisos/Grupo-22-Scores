'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User as SupabaseUser, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { normalizeRole, type AppUserRole, type MembershipLike } from '@/lib/auth/roles';
import { clearFavoritesCache } from '@/lib/favoritesCache';

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
    login: (role?: AppUserRole, returnTo?: string) => void;
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
        console.log('[AuthContext] fetchAndSetUser start for:', sbUser.email);
        try {
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('*')
                .eq('id', sbUser.id)
                .single();

            if (!isMounted.current) return;

            if (profileError && profileError.code !== 'PGRST116') {
                console.warn('[AuthContext] Profile fetch error:', profileError.message);
            }

            if (profile) {
                console.log('[AuthContext] Profile found in DB');
                const { data: membershipsData, error: membershipError } = await supabase
                    .from('memberships')
                    .select('scope_type, scope_id, role')
                    .eq('user_id', sbUser.id);

                if (membershipError) {
                    console.warn('[AuthContext] Memberships fetch error:', membershipError.message);
                }

                if (!isMounted.current) return;

                const memberships: MembershipLike[] = (membershipsData || []).map((m: any) => ({
                    scopeType: m.scope_type,
                    scopeId: m.scope_id,
                    role: m.role,
                }));

                const finalUser = {
                    id: profile.id,
                    name: profile.name || sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: profile.email || sbUser.email || '',
                    role: normalizeRole(profile.role),
                    avatarUrl: profile.avatar_url || sbUser.user_metadata?.avatar_url,
                    memberships,
                };
                console.log('[AuthContext] Setting user with profile:', finalUser.email, 'role:', finalUser.role);
                setUser(finalUser);
            } else {
                const { isSuperAdminEmail } = await import('@/lib/types/user');
                const fallbackRole = isSuperAdminEmail(sbUser.email) ? 'super_admin' : 'fan';

                console.log('[AuthContext] No profile in DB, using fallback metadata with role:', fallbackRole);
                // Fallback to auth metadata si el perfil no existe todavía
                setUser({
                    id: sbUser.id,
                    name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: sbUser.email || '',
                    role: fallbackRole,
                    avatarUrl: sbUser.user_metadata?.avatar_url,
                });
            }
        } catch (err: any) {
            if (isAbortError(err)) return;
            console.error('[AuthContext] Error fetching user profile:', err);
            // On error, still set fallback user so they are "authenticated"
            setUser({
                id: sbUser.id,
                name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                email: sbUser.email || '',
                role: 'fan',
                avatarUrl: sbUser.user_metadata?.avatar_url,
            });
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
            }
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
                        console.log('[AuthContext] initAuth: Session found');
                        await fetchAndSetUser(session.user);
                    } else {
                        console.log('[AuthContext] initAuth: No session');
                        setUser(null);
                        setIsLoading(false);
                    }
                }
            } catch (err: any) {
                if (isAbortError(err)) return;
                console.error('[AuthContext] initAuth error:', err);
                if (isMounted.current) setIsLoading(false);
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            console.log('[AuthContext] onAuthStateChange event:', event, 'Has session:', !!session);
            if (!isMounted.current) return;

            try {
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || (event as string) === 'INITIAL_SESSION') {
                    if (session?.user) {
                        console.log('[AuthContext] Event result: fetching user for event:', event);
                        // Do NOT await here, to prevent deadlocks in the Supabase client internal lock
                        fetchAndSetUser(session.user).catch(err => {
                            console.error('[AuthContext] Background fetchAndSetUser failed:', err);
                        });
                    } else if (event !== 'INITIAL_SESSION') {
                        // If we get SIGNED_IN but no session/user, that's an error state
                        console.warn('[AuthContext] SIGNED_IN event received but no user present in session');
                        setUser(null);
                        setIsLoading(false);
                    }
                } else if (event === 'SIGNED_OUT') {
                    console.log('[AuthContext] Event result: signing out');
                    setUser(null);
                    setIsLoading(false);
                    localStorage.removeItem('g22_user');
                }

                // Defensively clear favorites cache on sign out/in/update
                if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    clearFavoritesCache(`Auth event: ${event}`);
                }
            } catch (err) {
                console.error('[AuthContext] Error handling auth state change:', err);
            }
        });

        // Initialize last to ensure listener is ready
        initAuth();

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
        };
    }, []);

    const login = (role: AppUserRole = 'fan', returnTo?: string) => {
        // Redirect to the real login page, preserving returnTo so EmailLoginForm
        // can router.replace() back after authentication.
        if (typeof window !== 'undefined') {
            const url = new URL('/login', window.location.origin);
            if (returnTo) {
                // Encode so ?type=... inside returnTo survives as a single param
                url.searchParams.set('returnTo', returnTo);
            }
            // Use location.replace (not href) to avoid adding to back-stack
            window.location.replace(url.toString());
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
