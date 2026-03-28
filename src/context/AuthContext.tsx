'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { User as SupabaseUser, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { normalizeRole, type AppUserRole, type MembershipLike } from '@/lib/auth/roles';
import { clearFavoritesCache } from '@/lib/favoritesCache';
import {
    getOnboardingMetadataStatus,
    getOnboardingStorageStatus,
    setOnboardingStorageStatus,
} from '@/lib/onboardingStatus';
import {
    completeOnboarding,
    getOnboardingStatus,
} from '@/lib/services/preferencesService';
import { createClient } from '@/lib/supabase/client';

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
    onboardingCompleted: boolean | null;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (role?: AppUserRole, returnTo?: string) => void;
    logout: () => void;
    refreshOnboardingStatus: () => Promise<void>;
}

type MembershipRow = {
    scope_type: MembershipLike['scopeType'];
    scope_id: MembershipLike['scopeId'];
    role: MembershipLike['role'];
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isAbortError = (err: unknown) => {
    if (!(err instanceof Error)) {
        return false;
    }

    return (
        err.name === 'AbortError' ||
        err.message.includes('abort') ||
        err.message.includes('signal is aborted')
    );
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();
    const isMounted = useRef(true);

    const resolveFallbackOnboarding = useCallback((sbUser: SupabaseUser) => {
        const metadataStatus = getOnboardingMetadataStatus(sbUser.user_metadata);
        const storageStatus = getOnboardingStorageStatus(sbUser.id);

        return {
            completed: metadataStatus.completed || storageStatus.completed,
            skipped: metadataStatus.skipped || storageStatus.skipped,
        };
    }, []);

    const rehydrateMissingOnboardingStatus = useCallback((userId: string) => {
        completeOnboarding(supabase, userId, { skipped: true }).catch(() => { });
    }, [supabase]);

    const fetchAndSetUser = useCallback(async (sbUser: SupabaseUser) => {
        console.log('[AuthContext] fetchAndSetUser start for:', sbUser.email);
        const fallbackOnboarding = resolveFallbackOnboarding(sbUser);

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
                const [membershipsResult, onboarding] = await Promise.all([
                    supabase
                        .from('memberships')
                        .select('scope_type, scope_id, role')
                        .eq('user_id', sbUser.id),
                    getOnboardingStatus(supabase, sbUser.id),
                ]);

                if (membershipsResult.error) {
                    console.warn('[AuthContext] Memberships fetch error:', membershipsResult.error.message);
                }

                if (!isMounted.current) return;

                const membershipRows = (membershipsResult.data || []) as MembershipRow[];
                const memberships: MembershipLike[] = membershipRows.map((membership) => ({
                    scopeType: membership.scope_type,
                    scopeId: membership.scope_id,
                    role: membership.role,
                }));

                let onboardingCompleted = false;
                let onboardingSkipped = false;

                if (onboarding) {
                    onboardingCompleted = onboarding.preferences_onboarding_completed || onboarding.skipped;
                    onboardingSkipped = !!onboarding.skipped;
                } else if (fallbackOnboarding.completed) {
                    onboardingCompleted = true;
                    onboardingSkipped = fallbackOnboarding.skipped;
                    rehydrateMissingOnboardingStatus(sbUser.id);
                } else {
                    // First session: keep showing the onboarding once, but leave a DB row behind.
                    onboardingCompleted = false;
                    rehydrateMissingOnboardingStatus(sbUser.id);
                }

                if (onboardingCompleted) {
                    setOnboardingStorageStatus(sbUser.id, { skipped: onboardingSkipped });
                }

                const finalUser = {
                    id: profile.id,
                    name: profile.name || sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: profile.email || sbUser.email || '',
                    role: normalizeRole(profile.role),
                    avatarUrl: profile.avatar_url || sbUser.user_metadata?.avatar_url,
                    memberships,
                    onboardingCompleted,
                };

                console.log('[AuthContext] Setting user with profile:', finalUser.email, 'role:', finalUser.role, 'onboardingCompleted:', onboardingCompleted);
                setUser(finalUser);
            } else {
                const { isSuperAdminEmail } = await import('@/lib/types/user');
                const fallbackRole = isSuperAdminEmail(sbUser.email) ? 'super_admin' : 'fan';

                if (fallbackOnboarding.completed) {
                    setOnboardingStorageStatus(sbUser.id, { skipped: fallbackOnboarding.skipped });
                }

                fetch('/api/auth/sync-user', {
                    method: 'POST',
                    credentials: 'same-origin',
                }).catch((syncError: unknown) => {
                    console.warn('[AuthContext] sync-user failed after missing profile:', syncError);
                });

                console.log('[AuthContext] No profile in DB, using fallback metadata with role:', fallbackRole);
                setUser({
                    id: sbUser.id,
                    name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                    email: sbUser.email || '',
                    role: fallbackRole,
                    avatarUrl: sbUser.user_metadata?.avatar_url,
                    onboardingCompleted: fallbackOnboarding.completed,
                });
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error('[AuthContext] Error fetching user profile:', err);
            setUser({
                id: sbUser.id,
                name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
                email: sbUser.email || '',
                role: 'fan',
                avatarUrl: sbUser.user_metadata?.avatar_url,
                onboardingCompleted: true,
            });
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
            }
        }
    }, [rehydrateMissingOnboardingStatus, resolveFallbackOnboarding, supabase]);

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
            } catch (err: unknown) {
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
                        fetchAndSetUser(session.user).catch((backgroundError: unknown) => {
                            console.error('[AuthContext] Background fetchAndSetUser failed:', backgroundError);
                        });
                    } else if (event !== 'INITIAL_SESSION') {
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

                if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    clearFavoritesCache(`Auth event: ${event}`);
                }
            } catch (err) {
                console.error('[AuthContext] Error handling auth state change:', err);
            }
        });

        initAuth();

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
        };
    }, [fetchAndSetUser, supabase]);

    const login = (_role: AppUserRole = 'fan', returnTo?: string) => {
        void _role;
        if (typeof window !== 'undefined') {
            const url = new URL('/login', window.location.origin);
            if (returnTo) {
                url.searchParams.set('returnTo', returnTo);
            }
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

    const refreshOnboardingStatus = async () => {
        if (!user) return;
        try {
            const response = await fetch('/api/onboarding/preferences?mode=status', {
                cache: 'no-store',
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error(`Status request failed: ${response.status}`);
            }

            const data = await response.json() as { onboardingCompleted?: boolean };
            const storageStatus = getOnboardingStorageStatus(user.id);
            const onboardingCompleted = !!data.onboardingCompleted || storageStatus.completed;

            if (onboardingCompleted) {
                setOnboardingStorageStatus(user.id, { skipped: storageStatus.skipped });
            }

            if (isMounted.current) {
                setUser(prev => prev ? { ...prev, onboardingCompleted } : null);
            }
        } catch (err) {
            console.error('[AuthContext] refreshOnboardingStatus error:', err);
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            logout,
            refreshOnboardingStatus,
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
