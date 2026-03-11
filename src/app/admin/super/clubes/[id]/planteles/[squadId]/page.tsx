'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SquadManagementShell } from '@/components/admin/entities/squad/SquadManagementShell';
import { createClient } from '@/lib/supabase/client';

export default function SquadManagementPage() {
    const params = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [squadData, setSquadData] = useState<any>(null);
    const [clubData, setClubData] = useState<any>(null);

    const id = params.id as string;
    const squadId = params.squadId as string;

    useEffect(() => {
        loadData();
    }, [id, squadId]);

    async function loadData() {
        setLoading(true);
        const supabase = createClient();

        try {
            // Cargar datos del club
            const { data: club, error: clubError } = await supabase
                .from('clubs')
                .select('*')
                .eq('id', id)
                .single();

            if (clubError) throw clubError;

            // Cargar datos de la división/plantel
            const { data: squad, error: squadError } = await supabase
                .from('club_divisions')
                .select('*')
                .eq('id', squadId)
                .single();

            if (squadError) throw squadError;

            setClubData(club);
            setSquadData(squad);
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Error al cargar los datos');
            router.back();
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--obsidian-deep)]">
                <div className="w-12 h-12 border-2 border-[var(--accent-pulse)]/20 border-t-[var(--accent-pulse)] rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!squadData || !clubData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--obsidian-deep)]">
                <p className="text-[var(--text-secondary)]">No se encontraron datos</p>
            </div>
        );
    }

    return (
        <SquadManagementShell
            clubId={id}
            squadId={squadId}
            clubData={clubData}
            squadData={squadData}
        />
    );
}
