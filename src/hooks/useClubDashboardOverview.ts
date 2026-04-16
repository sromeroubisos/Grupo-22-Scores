'use client';

import { useEffect, useState } from 'react';
import {
    EMPTY_CLUB_DASHBOARD_OVERVIEW,
    type ClubDashboardOverview,
} from '@/lib/club-admin/dashboard-types';

interface RouteResponse<T> {
    ok?: boolean;
    data?: T;
    error?: string;
}

export function useClubDashboardOverview(clubId?: string | null) {
    const [data, setData] = useState<ClubDashboardOverview>(EMPTY_CLUB_DASHBOARD_OVERVIEW);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!clubId) {
            setData(EMPTY_CLUB_DASHBOARD_OVERVIEW);
            setError(null);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        let active = true;

        const load = async () => {
            setLoading(true);
            setError(null);
            setData(EMPTY_CLUB_DASHBOARD_OVERVIEW);

            try {
                const response = await fetch(`/api/club-admin/dashboard?club=${encodeURIComponent(clubId)}`, {
                    cache: 'no-store',
                    credentials: 'same-origin',
                    signal: controller.signal,
                });

                const payload = await response.json() as RouteResponse<ClubDashboardOverview>;

                if (!response.ok || !payload.data) {
                    throw new Error(payload.error || 'No se pudo cargar el dashboard del club');
                }

                if (active) {
                    setData(payload.data);
                }
            } catch (err) {
                if (!active || controller.signal.aborted) return;
                setData(EMPTY_CLUB_DASHBOARD_OVERVIEW);
                setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard del club');
            } finally {
                if (active) setLoading(false);
            }
        };

        void load();

        return () => {
            active = false;
            controller.abort();
        };
    }, [clubId]);

    return { data, loading, error };
}
