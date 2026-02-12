'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/mock-db';
import PhaseCreator, { Team, PhaseConfiguration } from '@/app/admin/components/PhaseCreator';
import '@/app/admin/styles/admin-custom.css';

export default function FasesPage() {
    const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
    const [phaseConfigs, setPhaseConfigs] = useState<Record<number, PhaseConfiguration>>({});
    const [notifications, setNotifications] = useState<{ id: number, message: string, type: 'success' | 'error' | 'info' }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tournamentTeams, setTournamentTeams] = useState<Team[]>([]);

    const params = useParams();
    const tournamentId = params?.id as string;

    React.useEffect(() => {
        async function fetchData() {
            setIsLoading(true);
            try {
                // 1. Fetch Configs
                const configRes = await fetch(`/api/admin/tournaments/${tournamentId}/phases`);
                const configData = await configRes.json();
                if (configData.ok && configData.configs) {
                    const configsMap: Record<number, PhaseConfiguration> = {};
                    configData.configs.forEach((c: any) => {
                        configsMap[parseInt(c.id)] = c;
                    });
                    setPhaseConfigs(configsMap);
                }

                // 2. Fetch Teams
                let teams: Team[] = [];
                const localTournament = db.tournaments.find(t => t.id === tournamentId || t.slug === tournamentId);

                if (localTournament) {
                    teams = db.clubs
                        .filter(c => c.unionId === localTournament.unionId)
                        .map(c => ({
                            id: c.id,
                            name: c.name,
                            short: c.shortName,
                            color: c.primaryColor || '#334155'
                        }));
                } else {
                    // Try external API
                    const apiRes = await fetch(`/api/tournaments?id=${tournamentId}`);
                    const apiData = await apiRes.json();

                    if (apiData.ok) {
                        let allStandingsRows: any[] = [];
                        const rawStandings = apiData.standings || [];

                        if (rawStandings.length > 0) {
                            if (rawStandings[0]?.rows) {
                                // Grouped standings
                                rawStandings.forEach((g: any) => allStandingsRows.push(...(g.rows || [])));
                            } else {
                                allStandingsRows = rawStandings;
                            }
                        }

                        // Fallback to results/fixtures if no standings
                        if (allStandingsRows.length === 0) {
                            const seen = new Set();
                            [...(apiData.results || []), ...(apiData.fixtures || [])].forEach(m => {
                                [m.home_team, m.away_team].forEach(t => {
                                    if (t && !seen.has(t.id || t.name)) {
                                        seen.add(t.id || t.name);
                                        allStandingsRows.push({ team: t });
                                    }
                                });
                            });
                        }

                        teams = allStandingsRows.map((item: any) => {
                            const team = item.team || item.participant || item;
                            const name = team.name || item.name || 'Desconocido';
                            return {
                                id: team.id || team.team_id || team.participant_id || name,
                                name: name,
                                short: name.substring(0, 3).toUpperCase(),
                                color: '#3b82f6'
                            };
                        });
                    }
                }
                setTournamentTeams(teams);

            } catch (err) {
                console.error('Error fetching data:', err);
                addNotification('Error al cargar datos', 'error');
            } finally {
                setIsLoading(false);
            }
        }
        if (tournamentId) fetchData();
    }, [tournamentId]);

    const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
    };

    const savePhase = async (config: PhaseConfiguration, phaseIndex: number, isDraft: boolean) => {
        try {
            const res = await fetch(`/api/admin/tournaments/${tournamentId}/phases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, phaseIndex, isDraft })
            });
            const data = await res.json();
            if (data.ok) {
                setPhaseConfigs(prev => ({
                    ...prev,
                    [phaseIndex]: data.phaseConfig
                }));
                setEditingPhaseId(null);
                addNotification(isDraft ? 'Borrador guardado' : 'Fase publicada correctamente', 'success');
            } else {
                addNotification('Error al guardar', 'error');
            }
        } catch (err) {
            console.error('Error saving phase:', err);
            addNotification('Error de conexión', 'error');
        }
    };

    if (isLoading) {
        return <div className="pageHeader"><p>Cargando fases...</p></div>;
    }

    if (editingPhaseId !== null) {
        return (
            <PhaseCreator
                phaseIndex={editingPhaseId}
                totalPhases={3}
                teams={tournamentTeams}
                initialConfig={phaseConfigs[editingPhaseId]}
                onPrev={() => setEditingPhaseId(null)}
                onNext={(config: PhaseConfiguration) => savePhase(config, editingPhaseId, false)}
                onSaveDraft={(config: PhaseConfiguration) => savePhase(config, editingPhaseId, true)}
            />
        );
    }

    return (
        <div style={{ padding: '0' }}>
            {/* Notifications */}
            {notifications.length > 0 && (
                <div style={{
                    position: 'fixed',
                    top: '80px',
                    right: '24px',
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    {notifications.map(notif => (
                        <div
                            key={notif.id}
                            style={{
                                padding: '12px 18px',
                                borderRadius: '10px',
                                background: notif.type === 'success'
                                    ? 'rgba(34,197,94,.15)'
                                    : notif.type === 'error'
                                        ? 'rgba(239,68,68,.15)'
                                        : 'rgba(59,130,246,.15)',
                                border: '1px solid ' + (notif.type === 'success'
                                    ? 'rgba(34,197,94,.3)'
                                    : notif.type === 'error'
                                        ? 'rgba(239,68,68,.3)'
                                        : 'rgba(59,130,246,.3)'),
                                color: 'white',
                                fontSize: '14px',
                                fontWeight: 600,
                                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                                backdropFilter: 'blur(10px)'
                            }}
                        >
                            {notif.message}
                        </div>
                    ))}
                </div>
            )}

            {/* Header de página (NO sticky) */}
            <div className="pageHeader">
                <div>
                    <h1 style={{
                        fontSize: '28px',
                        fontWeight: 800,
                        color: 'rgba(255,255,255,.92)',
                        marginBottom: '6px',
                        letterSpacing: '-0.02em'
                    }}>
                        Estructura de Fases
                    </h1>
                    <p style={{
                        color: 'rgba(255,255,255,.55)',
                        fontSize: '14px',
                        margin: 0
                    }}>
                        Configura las fases y formato del torneo
                    </p>
                </div>
            </div>

            {/* Fases Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                {/* Fase 1 */}
                <div className="g22Block">
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 900,
                            letterSpacing: '.1em',
                            textTransform: 'uppercase',
                            background: 'rgba(34,197,94,.12)',
                            border: '1px solid rgba(34,197,94,.25)',
                            color: 'rgba(255,255,255,.9)',
                            marginBottom: '14px'
                        }}>
                            FASE 1
                        </div>
                        <h3 style={{
                            marginBottom: '6px',
                            fontSize: '20px',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,.92)'
                        }}>
                            Fase de Grupos
                        </h3>
                        <p style={{
                            color: 'rgba(255,255,255,.55)',
                            fontSize: '14px',
                            marginBottom: '18px',
                            fontWeight: 500
                        }}>
                            Round Robin - Ida y Vuelta
                        </p>
                        <div style={{
                            fontFamily: 'ui-monospace, monospace',
                            color: '#22C55E',
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '.05em'
                        }}>
                            10 EQUIPOS | 18 FECHAS
                        </div>
                        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
                            <button
                                className="adminBtn"
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={() => setEditingPhaseId(1)}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11"></path>
                                    <path d="M13.5 2.5a2.121 2.121 0 0 1 3 3L10 12l-4 1 1-4 6.5-6.5z"></path>
                                </svg>
                                Configurar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Fase 2 */}
                <div className="g22Block">
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 900,
                            letterSpacing: '.1em',
                            textTransform: 'uppercase',
                            background: 'rgba(34,197,94,.12)',
                            border: '1px solid rgba(34,197,94,.25)',
                            color: 'rgba(255,255,255,.9)',
                            marginBottom: '14px'
                        }}>
                            FASE 2
                        </div>
                        <h3 style={{
                            marginBottom: '6px',
                            fontSize: '20px',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,.92)'
                        }}>
                            Playoffs
                        </h3>
                        <p style={{
                            color: 'rgba(255,255,255,.55)',
                            fontSize: '14px',
                            marginBottom: '18px',
                            fontWeight: 500
                        }}>
                            Eliminación Directa
                        </p>
                        <div style={{
                            fontFamily: 'ui-monospace, monospace',
                            color: '#22C55E',
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '.05em'
                        }}>
                            4 EQUIPOS | SEMI Y FINAL
                        </div>
                        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
                            <button
                                className="adminBtn"
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={() => setEditingPhaseId(2)}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11"></path>
                                    <path d="M13.5 2.5a2.121 2.121 0 0 1 3 3L10 12l-4 1 1-4 6.5-6.5z"></path>
                                </svg>
                                Configurar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Crear nueva fase */}
                <div className="g22Block" style={{
                    border: '1px dashed rgba(255,255,255,.15)',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '240px'
                }}>
                    <button
                        className="adminBtn adminBtn--ghost"
                        onClick={() => setEditingPhaseId(3)}
                        style={{ gap: '8px' }}
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14"></path>
                        </svg>
                        Crear nueva fase
                    </button>
                </div>
            </div>

            {/* Reglas de Clasificación */}
            <div className="g22Block">
                <div className="g22BlockHeader">
                    <h3 className="g22Title">Reglas de Clasificación</h3>
                </div>
                <div style={{ padding: '0 18px 24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                        <div>
                            <h4 style={{
                                fontSize: '12px',
                                marginBottom: '16px',
                                textTransform: 'uppercase',
                                color: 'rgba(255,255,255,.55)',
                                fontWeight: 900,
                                letterSpacing: '.1em'
                            }}>
                                Puntos por Resultado
                            </h4>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {[
                                    { label: 'Victoria', val: 4 },
                                    { label: 'Empate', val: 2 },
                                    { label: 'Bonus (4+ tries)', val: 1 },
                                    { label: 'Bonus Defensivo (< 7 pts)', val: 1 }
                                ].map(r => (
                                    <div key={r.label} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 14px',
                                        background: 'rgba(255,255,255,.02)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,.06)'
                                    }}>
                                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{r.label}</span>
                                        <input
                                            type="number"
                                            defaultValue={r.val}
                                            style={{
                                                fontFamily: 'ui-monospace, monospace',
                                                background: 'rgba(0,0,0,.3)',
                                                border: '1px solid rgba(255,255,255,.08)',
                                                color: '#22C55E',
                                                padding: '6px 10px',
                                                width: '70px',
                                                textAlign: 'center',
                                                borderRadius: '6px',
                                                fontSize: '14px',
                                                fontWeight: 700
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 style={{
                                fontSize: '12px',
                                marginBottom: '16px',
                                textTransform: 'uppercase',
                                color: 'rgba(255,255,255,.55)',
                                fontWeight: 900,
                                letterSpacing: '.1em'
                            }}>
                                Criterios de Desempate
                            </h4>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {[
                                    '1. Mayor cantidad de victorias',
                                    '2. Resultado entre sí (Diferencia de puntos)',
                                    '3. Diferencia de puntos general',
                                    '4. Mayor cantidad de tries marcados'
                                ].map(criterion => (
                                    <div key={criterion} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '12px 14px',
                                        background: 'rgba(255,255,255,.03)',
                                        border: '1px solid rgba(255,255,255,.06)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'grab'
                                    }}>
                                        {criterion}
                                        <span style={{ opacity: 0.4, fontSize: '16px' }}>⠿</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
