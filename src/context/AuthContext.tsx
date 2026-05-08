'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { User as SupabaseUser, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { canUseRestrictedContentActions, normalizeRole, type AppUserRole, type MembershipLike } from '@/lib/auth/roles';
import { clearFavoritesCache } from '@/lib/favoritesCache';
import { clearFavoritesLocalCache } from '@/lib/favorites/fetchFavorites';
import { logRefreshFlow } from '@/lib/debug/refreshFlow';
import {
    getOnboardingMetadataStatus,
    getOnboardingStorageStatus,
    setOnboardingStorageStatus,
} from '@/lib/onboardingStatus';
import {
    ensureOnboardingStatus,
    getOnboardingStatus,
} from '@/lib/services/preferencesService';
import { isAuthRateLimitError } from '@/lib/auth/errors';
import { clearSupabaseBrowserSession, createClient } from '@/lib/supabase/client';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { logPerf, measureAsync, nowMs, warnIfDuplicateWindow } from '@/lib/perf/measure';
import { getReservedAdminRole } from '@/lib/types/user';

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
const AUTH_LOCAL_USER_KEY = 'g22_user';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readCachedAuthUser(): User | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(AUTH_LOCAL_USER_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed)) return null;
        if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') return null;

        const name = typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name
            : parsed.email.split('@')[0] || 'Usuario';
        const onboardingCompleted =
            typeof parsed.onboardingCompleted === 'boolean'
                ? parsed.onboardingCompleted
                : null;

        const cachedRole = normalizeRole(typeof parsed.role === 'string' ? parsed.role : null);

        return {
            id: parsed.id,
            name,
            email: parsed.email,
            role: canUseRestrictedContentActions(cachedRole) ? 'fan' : cachedRole,
            avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
            unionId: typeof parsed.unionId === 'string' ? parsed.unionId : undefined,
            tournamentId: typeof parsed.tournamentId === 'string' ? parsed.tournamentId : undefined,
            clubId: typeof parsed.clubId === 'string' ? parsed.clubId : undefined,
            memberships: Array.isArray(parsed.memberships) ? (parsed.memberships as MembershipLike[]) : undefined,
            onboardingCompleted,
        };
    } catch {
        return null;
    }
}

function writeCachedAuthUser(user: User | null) {
    if (typeof window === 'undefined') return;

    try {
        if (!user) {
            window.localStorage.removeItem(AUTH_LOCAL_USER_KEY);
            return;
        }

        window.localStorage.setItem(AUTH_LOCAL_USER_KEY, JSON.stringify(user));
    } catch {
        // Local persistence is best-effort only; Supabase cookies remain the source of truth.
    }
}

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

    const maybeStatus = (err as { status?: unknown }).status;
    const status = typeof maybeStatus === 'number' ? maybeStatus : null;
    const message = err.message.toLowerCase();

    return (
        err.name === 'AuthRetryableFetchError' ||
        status === 0 ||
        (typeof status === 'number' && status >= 500) ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('load failed') ||
        message.includes('timeout') ||
        message.includes('context canceled') ||
        message.includes('temporarily unavailable')
    );
};

function isAuthEntryPath(pathname: string | null): boolean {
    if (!pathname) return false;
    return (
        pathname === '/login' ||
        pathname === '/register' ||
        pathname.startsWith('/auth/')
    );
}

function buildOptimisticUser(sbUser: SupabaseUser, onboardingCompleted: boolean | null): User {
    const reservedRole = getReservedAdminRole(sbUser.email);
    return {
        id: sbUser.id,
        name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Usuario',
        email: sbUser.email || '',
        role: reservedRole ?? 'fan',
        avatarUrl: sbUser.user_metadata?.avatar_url,
        onboardingCompleted,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const skipAuthBootstrap = isAuthEntryPath(pathname);
    const initialCachedUser = skipAuthBootstrap ? null : readCachedAuthUser();
    const [user, setUser] = useState<User | null>(() => initialCachedUser);
    const [isLoading, setIsLoading] = useState(() => !initialCachedUser);
    const supabaseRef = useRef<LooseSupabaseClient | null>(null);
    const isMounted = useRef(true);
    const authProviderStartedAt = useRef(nowMs());
    const activeProfileFetchRef = useRef<{ userId: string; startedAt: number } | null>(null);
    const lastAuthEventRef = useRef<{ event: AuthChangeEvent | 'INIT'; userId: string | null }>({
        event: 'INIT',
        userId: initialCachedUser?.id ?? null,
    });
    const authBootstrapCompleteRef = useRef(false);

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

    const setPersistentUser = useCallback((
        value: User | null | ((prev: User | null) => User | null)
    ) => {
        setUser((prev) => {
            const next = typeof value === 'function' ? value(prev) : value;
            writeCachedAuthUser(next);
            return next;
        });
    }, []);

    const getSupabaseClient = useCallback(() => {
        if (!supabaseRef.current) {
            supabaseRef.current = createClient();
        }

        return supabaseRef.current;
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
        const supabase = getSupabaseClient();
        ensureOnboardingStatus(supabase, userId).catch(() => { });
    }, [getSupabaseClient]);

    const fetchAndSetUser = useCallback(async (sbUser: SupabaseUser) => {
        const activeFetch = activeProfileFetchRef.current;
        const currentTime = nowMs();
        if (activeFetch?.userId === sbUser.id && currentTime - activeFetch.startedAt < 5000) {
            return;
        }

        activeProfileFetchRef.current = { userId: sbUser.id, startedAt: currentTime };
        const supabase = getSupabaseClient();
        trackAuthDuplicate('restoreUser', { userId: sbUser.id });
        console.log('[AuthContext] fetchAndSetUser start for:', sbUser.email);
        const fallbackOnboarding = resolveFallbackOnboarding(sbUser);

        // Optimistic UI: surface the authenticated user immediately from the
        // session metadata so the UI flips out of the loading state without
        // waiting on the (potentially slow) `users` and onboarding queries.
        // The profile fetch below will refine name/role/avatar once it arrives.
        if (isMounted.current) {
            setPersistentUser((prev) => {
                if (prev && prev.id === sbUser.id) return prev;
                return buildOptimisticUser(
                    sbUser,
                    fallbackOnboarding.completed ? true : null,
                );
            });
            setIsLoading(false);
        }

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
                setPersistentUser(finalUser);
            } else {
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
                setPersistentUser({
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
            setPersistentUser({
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
    }, [getSupabaseClient, rehydrateMissingOnboardingStatus, resolveFallbackOnboarding, setPersistentUser, trackAuthDuplicate]);

    useEffect(() => {
        isMounted.current = true;

        if (skipAuthBootstrap) {
            activeProfileFetchRef.current = null;
            lastAuthEventRef.current = { event: 'INIT', userId: null };
            authBootstrapCompleteRef.current = true;
            setUser(null);
            setIsLoading(false);

            return () => {
                isMounted.current = false;
            };
        }

        authBootstrapCompleteRef.current = false;
        const supabase = getSupabaseClient();
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
                        lastAuthEventRef.current = { event: 'INITIAL_SESSION', userId: session.user.id };
                        await fetchAndSetUser(session.user);
                    } else {
                        console.log('[AuthContext] initAuth: No session');
                        lastAuthEventRef.current = { event: 'INITIAL_SESSION', userId: null };
                        setPersistentUser(null);
                        setIsLoading(false);
                    }
                }
            } catch (err: unknown) {
                if (isAbortError(err)) return;
                if (isSupabaseNetworkError(err) || isAuthRateLimitError(err)) {
                    console.warn('[AuthContext] initAuth skipped because Supabase Auth is temporarily unavailable');
                    if (isMounted.current) {
                        setIsLoading(false);
                    }
                    authBootstrapCompleteRef.current = true;
                    return;
                }
                console.error('[AuthContext] initAuth error:', err);
                if (isMounted.current) {
                    setPersistentUser(null);
                    setIsLoading(false);
                }
            } finally {
                authBootstrapCompleteRef.current = true;
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
            logRefreshFlow('auth_state_change', {
                event,
                hasSession: Boolean(session),
                hasUser: Boolean(session?.user),
                pathname,
            }, 'auth');
            if (!isMounted.current) return;

            try {
                if ((event as string) === 'INITIAL_SESSION') {
                    lastAuthEventRef.current = {
                        event,
                        userId: session?.user?.id ?? null,
                    };
                    return;
                }

                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    if (session?.user) {
                        const previousUserId = lastAuthEventRef.current.userId;
                        const isSameUser = previousUserId === session.user.id;
                        const shouldFetchProfile = event === 'USER_UPDATED' || !isSameUser;
                        const shouldRefreshServerData =
                            event === 'SIGNED_IN'
                            && authBootstrapCompleteRef.current
                            && !isSameUser;

                        if (shouldFetchProfile) {
                            console.log('[AuthContext] Event result: fetching user for event:', event);
                            fetchAndSetUser(session.user).catch((backgroundError: unknown) => {
                                console.error('[AuthContext] Background fetchAndSetUser failed:', backgroundError);
                            });
                        } else {
                            setPersistentUser((prev) => {
                                if (!prev || prev.id !== session.user.id) return prev;
                                const nextAvatar = session.user.user_metadata?.avatar_url ?? prev.avatarUrl;
                                if (prev.avatarUrl === nextAvatar) return prev;
                                return { ...prev, avatarUrl: nextAvatar };
                            });
                        }

                        // Refresh server-rendered data when the identity actually
                        // changes after the initial auth bootstrap. Supabase can
                        // emit SIGNED_IN while hydrating an existing browser
                        // session, and refreshing during that window creates an
                        // RSC refresh loop/flicker on desktop loads.
                        if (shouldRefreshServerData) {
                            logRefreshFlow('router_refresh_called', {
                                source: 'AuthContext',
                                reason: 'SIGNED_IN_post_bootstrap',
                                pathname,
                            }, 'route');
                            try { router.refresh(); } catch { /* router may be unavailable in tests */ }
                        }
                        lastAuthEventRef.current = { event, userId: session.user.id };
                    } else {
                        console.warn('[AuthContext] SIGNED_IN event received but no user present in session');
                        setPersistentUser(null);
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
                    setPersistentUser((prev) => {
                        if (!prev) return prev;
                        if (prev.id !== session.user.id) return prev;
                        const nextAvatar = session.user.user_metadata?.avatar_url ?? prev.avatarUrl;
                        if (prev.avatarUrl === nextAvatar) return prev;
                        return { ...prev, avatarUrl: nextAvatar };
                    });
                } else if (event === 'SIGNED_OUT') {
                    console.log('[AuthContext] Event result: signing out');
                    setPersistentUser(null);
                    setIsLoading(false);
                    lastAuthEventRef.current = { event, userId: null };
                    // Invalidate any server-rendered user-specific data so the UI
                    // reflects the signed-out state on the next paint.
                    logRefreshFlow('router_refresh_called', {
                        source: 'AuthContext',
                        reason: 'SIGNED_OUT',
                        pathname,
                    }, 'route');
                    try { router.refresh(); } catch { /* noop */ }
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
    }, [fetchAndSetUser, getSupabaseClient, router, setPersistentUser, skipAuthBootstrap, trackAuthDuplicate]);

    const login = (_role: AppUserRole = 'fan', returnTo?: string) => {
        void _role;
        if (typeof window !== 'undefined') {
            const url = new URL('/login', window.location.origin);
            if (returnTo) {
                url.searchParams.set('returnTo', returnTo);
            }
            logRefreshFlow('window_location_replace_called', {
                source: 'AuthContext',
                reason: 'login',
                pathname,
                targetPath: url.pathname,
            }, 'route');
            window.location.replace(url.toString());
        }
    };

    const logout = async () => {
        // Optimistic UI: clear local user state immediately so the header/menu
        // flips to signed-out without waiting on the Supabase round trip
        // (the auth `/logout` endpoint occasionally takes seconds on slow auth).
        if (isMounted.current) {
            setPersistentUser(null);
            setIsLoading(false);
        }
        clearFavoritesLocalCache();
        logRefreshFlow('router_refresh_called', {
            source: 'AuthContext',
            reason: 'logout',
            pathname,
        }, 'route');
        try { router.refresh(); } catch { /* noop */ }

        try {
            const supabase = getSupabaseClient();
            await supabase.auth.signOut();
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
                setPersistentUser(prev => prev ? { ...prev, onboardingCompleted } : null);
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
