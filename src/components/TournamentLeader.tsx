'use client';

import { useState, useEffect } from 'react';
import styles from '@/app/page.module.css';

interface TournamentLeaderProps {
    leagueId: string;
}

export default function TournamentLeader({ leagueId }: TournamentLeaderProps) {
    const [leader, setLeader] = useState<{ name: string, points: string | number } | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!leagueId || leagueId === 'unknown') return;

        async function fetchLeader() {
            setLoading(true);
            try {
                const res = await fetch(`/api/tournaments?id=${leagueId}`);
                if (!res.ok) throw new Error('Failed to fetch');

                const data = await res.json();
                if (data.ok && data.standings && Array.isArray(data.standings) && data.standings.length > 0) {
                    let rows = [];
                    if (data.standings[0]?.rows) {
                        rows = data.standings[0].rows;
                    } else {
                        rows = data.standings;
                    }

                    if (rows && rows.length > 0) {
                        const firstRow = rows[0];
                        const name = firstRow.team?.name || firstRow.participant?.name || firstRow.name || firstRow.team_name;
                        const points = firstRow.points_total || firstRow.points || 0;
                        if (name) {
                            setLeader({ name, points });
                        }
                    }
                }
            } catch (e) {
                // Silent fail
            } finally {
                setLoading(false);
            }
        }

        fetchLeader();
    }, [leagueId]);

    if (loading || !leader) return null;

    return (
        <div className={styles.leagueLeader}>
            <span className={styles.leaderLabel}>Lider:</span>
            <span className={styles.leaderName}>{leader.name}</span>
            <span className={styles.leaderPoints}>{leader.points} pts</span>
        </div>
    );
}
