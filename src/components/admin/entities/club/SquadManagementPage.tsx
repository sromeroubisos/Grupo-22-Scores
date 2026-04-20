'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SquadRosterView } from '@/components/admin/entities/club/SquadRosterView';
import { Division } from '@/lib/services/divisionService';
import { isClubBaseRosterId } from '@/lib/clubRoster';

type DivisionsResponse = {
    data?: Division[];
    error?: string;
    details?: unknown;
};

export function SquadManagementPage() {
    const params = useParams();
    const router = useRouter();
    const id = String(params.id || '');
    const squadId = String(params.squadId || '');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [squadData, setSquadData] = useState<Division | null>(null);

    const loadData = useCallback(async () => {
        if (!id || !squadId) return;

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(id)}/divisions`, {
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({})) as DivisionsResponse;

            if (!response.ok) {
                throw new Error(payload.error || 'No se pudieron cargar las divisiones del club.');
            }

            const divisions = Array.isArray(payload.data) ? payload.data : [];
            const nextSquad = divisions.find((division) =>
                division.id === squadId
                || division.management_id === squadId
                || division.legacy_division_id === squadId
            );

            if (!nextSquad && isClubBaseRosterId(squadId, id)) {
                setSquadData({
                    id: squadId,
                    club_id: id,
                    name: 'Plantel base del club',
                    season: String(new Date().getFullYear()),
                    status: 'active',
                    sport: 'Rugby',
                    gender: 'Masculino',
                    category: 'Plantel base',
                    players_count: 0,
                    staff_count: 0,
                });
                return;
            }

            if (!nextSquad) {
                throw new Error('No se encontro el plantel solicitado.');
            }

            setSquadData(nextSquad);
        } catch (nextError) {
            setSquadData(null);
            setError(nextError instanceof Error ? nextError.message : 'Error al cargar los datos del plantel.');
        } finally {
            setLoading(false);
        }
    }, [id, squadId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--obsidian-deep)]">
                <div className="w-12 h-12 border-2 border-[var(--accent-pulse)]/20 border-t-[var(--accent-pulse)] rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!squadData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-5 bg-[var(--obsidian-deep)] text-center px-6">
                <p className="text-[var(--text-secondary)]">{error || 'No se encontraron datos'}</p>
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-5 py-3 bg-[rgba(255,255,255,0.05)] border border-[var(--border)] text-[#e2e2e2] font-bold uppercase text-xs hover:bg-[rgba(255,255,255,0.08)] transition-all"
                >
                    Volver
                </button>
            </div>
        );
    }

    return (
        <SquadRosterView
            clubId={id}
            division={squadData}
            onBack={() => router.back()}
        />
    );
}
