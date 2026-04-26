'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { NotificationsApiResponse, UserNotification } from '@/lib/notifications/types';

type NotificationsState = {
    notifications: UserNotification[];
    unreadCount: number;
    loading: boolean;
    error: string | null;
    schemaReady: boolean;
};

type UseNotificationsOptions = {
    limit?: number;
    pollMs?: number;
};

const initialState: NotificationsState = {
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    schemaReady: true,
};

function applyReadState(
    notifications: UserNotification[],
    ids: string[],
    readAt: string | null,
) {
    const idsSet = new Set(ids);
    return notifications.map((notification) => (
        idsSet.has(notification.id)
            ? { ...notification, read_at: readAt }
            : notification
    ));
}

export function useNotifications(options: UseNotificationsOptions = {}) {
    const { user } = useAuth();
    const { limit = 20, pollMs = 60000 } = options;
    const [state, setState] = useState<NotificationsState>(initialState);

    const refresh = useCallback(async () => {
        if (!user?.id) {
            setState(initialState);
            return;
        }

        setState((current) => ({ ...current, loading: true, error: null }));

        try {
            const response = await fetch(`/api/notifications?limit=${encodeURIComponent(String(limit))}`, {
                cache: 'no-store',
                credentials: 'same-origin',
            });

            if (response.status === 401) {
                setState(initialState);
                return;
            }

            const payload = await response.json().catch(() => null) as Partial<NotificationsApiResponse> & { error?: string } | null;

            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudieron cargar las notificaciones.');
            }

            setState({
                notifications: payload?.notifications ?? [],
                unreadCount: payload?.unreadCount ?? 0,
                loading: false,
                error: null,
                schemaReady: payload?.schemaReady !== false,
            });
        } catch (error) {
            setState((current) => ({
                ...current,
                loading: false,
                error: error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones.',
            }));
        }
    }, [limit, user?.id]);

    useEffect(() => {
        void refresh();

        if (!user?.id) return;

        const handleFocus = () => {
            void refresh();
        };
        window.addEventListener('focus', handleFocus);

        const intervalId = pollMs > 0
            ? window.setInterval(() => {
                void refresh();
            }, pollMs)
            : null;

        return () => {
            window.removeEventListener('focus', handleFocus);
            if (intervalId !== null) {
                window.clearInterval(intervalId);
            }
        };
    }, [pollMs, refresh, user?.id]);

    const markRead = useCallback(async (ids: string[], read = true) => {
        const cleanIds = ids.map((id) => id.trim()).filter(Boolean);
        if (!user?.id || cleanIds.length === 0) return;

        const readAt = read ? new Date().toISOString() : null;
        setState((current) => ({
            ...current,
            notifications: applyReadState(current.notifications, cleanIds, readAt),
            unreadCount: (() => {
                const idsSet = new Set(cleanIds);
                const affectedUnread = current.notifications.filter((item) => idsSet.has(item.id) && !item.read_at).length;
                const affectedRead = current.notifications.filter((item) => idsSet.has(item.id) && item.read_at).length;

                return read
                    ? Math.max(0, current.unreadCount - affectedUnread)
                    : current.unreadCount + affectedRead;
            })(),
        }));

        const response = await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ ids: cleanIds, read }),
        });

        if (!response.ok) {
            await refresh();
            return;
        }

        void refresh();
    }, [refresh, user?.id]);

    const markAllRead = useCallback(async () => {
        if (!user?.id || state.unreadCount === 0) return;

        const readAt = new Date().toISOString();
        setState((current) => ({
            ...current,
            notifications: current.notifications.map((notification) => (
                notification.read_at ? notification : { ...notification, read_at: readAt }
            )),
            unreadCount: 0,
        }));

        const response = await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ all: true, read: true }),
        });

        if (!response.ok) {
            await refresh();
            return;
        }

        void refresh();
    }, [refresh, state.unreadCount, user?.id]);

    return {
        ...state,
        refresh,
        markRead,
        markAllRead,
    };
}
