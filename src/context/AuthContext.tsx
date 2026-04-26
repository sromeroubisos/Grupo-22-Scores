'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { User as SupabaseUser, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { normalizeRole, type AppUserRole, type MembershipLike } from '@/lib/auth/roles';
import { clearFavoritesCache } from '@/lib/favoritesCache';
import { clearFavoritesLocalCache } from '@/lib/favorites/fetchFavorites';
import {
    getOnboardingMetadataStatus,
    getOnboardingStorageStatus,
    setOnboardingStorageStatus,
} from '@/lib/onboardingStatus';
import {
    ensureOnboardingStatus,
    getOnboardingStatus,
} from '@/lib/services/preferencesService';
import { clearSupabaseBrowserSession, createClient } from '@/lib/supabase/client';
import { logPerf, measureAsync, nowMs, warnIfDuplicateWindow } from '@/lib/perf/measure';

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

const isSupabaseNetworkError = (err: unknown) => {
    if (!(err instanceof Error)) {
        return false;
    }

    return (
        err.message.includes('Failed to fetch') ||
        err.message.includes('NetworkError') ||
        err.message.includes('Load failed')
    );
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);
    const isMounted = useRef(true);
    const authProviderStartedAt = useRef(nowMs());
    const activeProfileFetchRef = useRef<{ userId: string; startedAt: number } | null>(null);

    const trackAuthDuplicate = useCallback((step: string, metadata: Record<string, unknown> = {}) => {
        return warnIfDuplicateWindow(
            `auth:${step}`,
            ['AUTH'],
            {
                step,
                ...metadata,
            },
            'client',
            {
                windowMs: 2000,
                warnAfterCount: 2,
            },
        );
    }, []);

    const resolveFallbackOnboarding = useCallback((sbUser: SupabaseUser) => {
        const metadataStatus = getOnboardingMetadataStatus(sbUser.user_metadata);
        const storageStatus = getOnboardingStorageStatus(sbUser.id);

        return {
            completed: metadataStatus.completed || storageStatus.completed,
            skipped: metadataStatus.skipped || storageStatus.skipped,
        };
    }, []);

    const rehydrateMissingOnboardingStatus = useCallback((userId: string) => {
        ensureOnboardingStatus(supabase, userId).catch(() => { });
    }, [supabase]);

    const fetchAndSetUser = useCallback(async (sbUser: SupabaseUser) => {
        const activeFetch = activeProfileFetchRef.current;
        const currentTime = nowMs();
        if (activeFetch?.userId === sbUser.id && currentTime - activeFetch.startedAt < 5000) {
            return;
        }

        activeProfileFetchRef.current = { userId: sbUser.id, startedAt: currentTime };
        trackAuthDuplicate('restoreUser', { userId: sbUser.id });
        console.log('[AuthContext] fetchAndSetUser start for:', sbUser.email);
        const fallbackOnboarding = resolveFallbackOnboarding(sbUser);

        try {
            const { data: profile, error: profileError } = await measureAsync(
                'restore_user_profile',
                async () => supabase
                    .from('users')
                    .select('id, name, email, role, avatar_url')
                    .eq('id', sbUser.id)
                    .maybeSingle(),
                {
                    runtime: 'client',
                    tags: ['AUTH'],
                    metadata: {
                        step: 'restoreUserProfile',
                        userId: sbUser.id,
                    },
                    describeResult: (result) => ({
                        success: !result.error,
                        hasProfile: Boolean(result.data),
                    }),
                },
            );

            if (!isMounted.current) return;

            if (profileError && profileError.code !== 'PGRST116') {
                console.warn('[AuthContext] Profile fetch error:', profileError.message);
            }

            if (profile) {
                console.log('[AuthContext] Profile found in DB');
                const onboarding = await measureAsync(
                    'restore_user_dependencies',
                    async () => getOnboardingStatus(supabase, sbUser.id),
                    {
                        runtime: 'client',
                        tags: ['AUTH'],
                        metadata: {
                            step: 'restoreUserDependencies',
                            userId: sbUser.id,
                        },
                    },
                );

                if (!isMounted.current) return;

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
                    memberships: [],
                    onboardingCompleted,
                };

                console.log('[AuthContext] Setting user with profile:', finalUser.email, 'role:', finalUser.role, 'onboardingCompleted:', onboardingCompleted);
                setUser(finalUser);
            } else {
                const { getReservedAdminRole } = await import('@/lib/types/user');
                const fallbackRole = getReservedAdminRole(sbUser.email) ?? 'fan';

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
    }, [rehydrateMissingOnboardingStatus, resolveFallbackOnboarding, supabase, trackAuthDuplicate]);

    useEffect(() => {
        isMounted.current = true;
        logPerf(
            ['AUTH'],
            {
                step: 'provider_mount',
                duration: `${(nowMs() - authProviderStartedAt.current).toFixed(1)}ms`,
            },
            'client',
        );

        const initAuth = async () => {
            try {
                trackAuthDuplicate('getSession', { source: 'initAuth' });
                const { data: { session }, error } = await measureAsync(
                    'getSession',
                    async () => supabase.auth.getSession(),
                    {
                        runtime: 'client',
                        tags: ['AUTH'],
                        metadata: {
                            step: 'getSession',
                            source: 'initAuth',
                        },
                        describeResult: (result) => ({
                            success: !result.error,
                            hasSession: Boolean(result.data?.session),
                        }),
                    },
                );
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
                if (isSupabaseNetworkError(err)) {
                    console.warn('[AuthContext] initAuth network failure, keeping existing local session state');
                    if (isMounted.current) {
                        setIsLoading(false);
                    }
                    return;
                }
                if (isMounted.current) setIsLoading(false);
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            warnIfDuplicateWindow(
                `auth:event:${event}`,
                ['AUTH'],
                {
                    step: 'onAuthStateChange',
                    event,
                },
                'client',
                {
                    windowMs: 2000,
                    warnAfterCount: 2,
                },
            );
            logPerf(
                ['AUTH'],
                {
                    step: 'onAuthStateChange',
                    event,
                    hasSession: Boolean(session),
                },
                'client',
            );
            console.log('[AuthContext] onAuthStateChange event:', event, 'Has session:', !!session);
            if (!isMounted.current) return;

            try {
                if ((event as string) === 'INITIAL_SESSION') {
                    return;
                }

                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    if (session?.user) {
                        console.log('[AuthContext] Event result: fetching user for event:', event);
                        fetchAndSetUser(session.user).catch((backgroundError: unknown) => {
                            console.error('[AuthContext] Background fetchAndSetUser failed:', backgroundError);
                        });
                    } else {
                        console.warn('[AuthContext] SIGNED_IN event received but no user present in session');
                        setUser(null);
                        setIsLoading(false);
                    }
                } else if (event === 'TOKEN_REFRESHED') {
                    // Token refresh keeps the same user identity; refetching the
                    // profile/onboarding state on every refresh tick is wasteful
                    // and amplifies refresh storms. Just keep the existing
                    // local user state in sync with the new session.
                    if (!session?.user) {
                        return;
                    }
                    setUser((prev) => {
                        if (!prev) return prev;
                        if (prev.id !== session.user.id) return prev;
                        const nextAvatar = session.user.user_metadata?.avatar_url ?? prev.avatarUrl;
                        if (prev.avatarUrl === nextAvatar) return prev;
                        return { ...prev, avatarUrl: nextAvatar };
                    });
                } else if (event === 'SIGNED_OUT') {
                    console.log('[AuthContext] Event result: signing out');
                    setUser(null);
                    setIsLoading(false);
                    localStorage.removeItem('g22_user');
                }

                if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    clearFavoritesCache(`Auth event: ${event}`);
                    clearFavoritesLocalCache();
                }
            } catch (err) {
                console.error('[AuthContext] Error handling auth state change:', err);
            }
        });

        void measureAsync(
            'initAuth',
            async () => initAuth(),
            {
                runtime: 'client',
                tags: ['AUTH'],
                metadata: {
                    step: 'initAuth',
                },
            },
        );

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
        };
    }, [fetchAndSetUser, supabase, trackAuthDuplicate]);

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
            clearFavoritesLocalCache();
        } catch (error) {
            console.error('Error logging out:', error);
            clearSupabaseBrowserSession();
        }
    };

    const refreshOnboardingStatus = async () => {
        if (!user) return;
        try {
            const response = await measureAsync(
                'refresh_onboarding_status',
                async () => fetch('/api/onboarding/preferences?mode=status', {
                    cache: 'no-store',
                    credentials: 'same-origin',
                }),
                {
                    runtime: 'client',
                    tags: ['AUTH'],
                    metadata: {
                        step: 'refreshOnboardingStatus',
                        userId: user.id,
                    },
                },
            );

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
