'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import styles from '../../tournament-admin.module.css';
import RosterPlantelEditor from '../RosterPlantelEditor';

type RosterHeader = {
    club?: { id: string; name: string } | null;
    team?: { id: string; name: string; category: string | null } | null;
    memberships?: { status: string | null }[];
};

export default function RosterEditorPage() {
    const params = useParams<{ rosterId: string }>();
    const search = useSearchParams();
    const rosterId = params?.rosterId ?? '';
    const tournamentId = search?.get('tournamentId') ?? '';

    const [roster, setRoster] = useState<RosterHeader | null>(null);
    const activeCount = (roster?.memberships ?? []).filter((m) => m.status === 'active').length;

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <p className={styles.eyebrow}>Inscripción en el torneo</p>
                    <h1 className={styles.pageTitle}>
                        {roster?.team?.name || roster?.club?.name || 'Plantel'}
                    </h1>
                    <p className={styles.pageSubtitle}>
                        {roster?.club?.name}
                        {roster?.team?.category ? ` · ${roster.team.category}` : ''} · {activeCount} jugadores activos
                    </p>
                </div>
                <Link className={styles.btnGhost} href="/admin/torneo/clubes">← Volver a clubes</Link>
            </div>

            {!tournamentId ? (
                <div className={styles.card} style={{ borderColor: 'var(--status-error)' }}>
                    Falta el torneo (volvé a la lista de clubes).
                </div>
            ) : (
                <RosterPlantelEditor
                    rosterId={rosterId}
                    tournamentId={tournamentId}
                    onRosterLoaded={(r) => setRoster(r)}
                />
            )}
        </div>
    );
}
