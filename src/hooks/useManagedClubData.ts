'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClubFull, ClubUpdateInput } from '@/lib/types/clubs';

interface RouteResponse<T> {
    data?: T;
    error?: string;
}

export function useManagedClubData(clubId?: string | null) {
    const [club, setClub] = useState<ClubFull | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!clubId) {
            setClub(null);
            setError(null);
            setLoading(false);
            return null;
        }

        setLoading(true);
        setError(null);
        setClub(null);

        try {
            const response = await fetch(`/api/clubs/${clubId}/manage`, {
                cache: 'no-store',
                credentials: 'same-origin',
            });

            const payload = await response.json() as RouteResponse<ClubFull>;

            if (!response.ok || !payload.data) {
                const nextError = payload.error || 'No se pudo cargar el club';
                setError(nextError);
                setClub(null);
                return null;
            }

            setClub(payload.data);
            return payload.data;
        } catch (err) {
            const nextError = err instanceof Error ? err.message : 'No se pudo cargar el club';
            setError(nextError);
            setClub(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    const saveClub = useCallback(async (input: ClubUpdateInput) => {
        if (!clubId) {
            setError('No se encontró un club asociado al usuario.');
            return null;
        }

        setSaving(true);
        setError(null);

        try {
            const response = await fetch(`/api/clubs/${clubId}/manage`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify(input),
            });

            const payload = await response.json() as RouteResponse<ClubFull>;

            if (!response.ok || !payload.data) {
                const nextError = payload.error || 'No se pudo guardar el club';
                setError(nextError);
                return null;
            }

            setClub(payload.data);
            return payload.data;
        } catch (err) {
            const nextError = err instanceof Error ? err.message : 'No se pudo guardar el club';
            setError(nextError);
            return null;
        } finally {
            setSaving(false);
        }
    }, [clubId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return {
        clubId,
        club,
        loading,
        saving,
        error,
        reload,
        saveClub,
    };
}
