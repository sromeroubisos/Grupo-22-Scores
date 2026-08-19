'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PlayerWithDetails, SquadMetrics, RUGBY_POSITIONS } from '@/lib/types/squad';
import { AvailablePlayersColumn } from './AvailablePlayersColumn';
import { SquadRosterColumn } from './SquadRosterColumn';
import { PlayerDetailColumn } from './PlayerDetailColumn';
import { ArrowLeft, Clock, Download, Settings, Save } from 'lucide-react';
import '@/components/admin/entities/squad/squad-obsidian.css';

interface SquadManagementShellProps {
    clubId: string;
    squadId: string;
    clubData: any;
    squadData: any;
}

export function SquadManagementShell({ clubId, squadId, clubData, squadData }: SquadManagementShellProps) {
    const router = useRouter();
    const [availablePlayers, setAvailablePlayers] = useState<PlayerWithDetails[]>([]);
    const [squadPlayers, setSquadPlayers] = useState<PlayerWithDetails[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithDetails | null>(null);
    const [metrics, setMetrics] = useState<SquadMetrics>({
        total: 0,
        forwards: 0,
        backs: 0,
        avgAge: 0,
        avgWeight: 0,
        injured: 0,
        suspended: 0,
        available: 0,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadPlayers();
    }, [clubId, squadId]);

    useEffect(() => {
        calculateMetrics();
    }, [squadPlayers]);

    async function loadPlayers() {
        setLoading(true);
        const supabase = createClient();

        try {
            // Los jugadores vienen por ruta de servidor, no por consulta directa:
            // `people` tiene DNI, fecha de nacimiento, mail y teléfono, y la clave
            // del navegador ya no puede leer esas columnas
            // (20260804170000_people_column_privileges.sql). La ruta verifica que
            // el usuario administre el club y recién ahí devuelve el dato.
            const playersRes = await fetch(`/api/club-admin/squad-players?club=${encodeURIComponent(clubId)}`);
            const playersPayload = await playersRes.json().catch(() => null);

            if (!playersRes.ok || !playersPayload?.ok) {
                throw new Error(playersPayload?.error || 'No se pudieron cargar los jugadores');
            }

            const allPlayers = playersPayload.players as any[];

            // Cargar jugadores que ya están en el plantel
            const { data: squadMembers, error: squadError } = await supabase
                .from('squad_members')
                .select('*')
                .eq('division_id', squadId)
                .order('order');

            if (squadError) throw squadError;

            // Mapear jugadores
            const squadPlayerIds = new Set(squadMembers?.map(sm => sm.person_id) || []);

            const mapped: PlayerWithDetails[] = (allPlayers || []).map(p => ({
                id: p.id,
                name: p.name || 'Sin nombre',
                photo_url: p.photo_url,
                birth_date: p.birth_date,
                height: p.height,
                weight: p.weight,
                position: p.position || 'Sin posición',
                position_secondary: p.position_secondary,
                status: p.status || 'active',
            }));

            // Separar disponibles vs en plantel
            const inSquad: PlayerWithDetails[] = [];
            const available: PlayerWithDetails[] = [];

            mapped.forEach(player => {
                const squadMember = squadMembers?.find(sm => sm.person_id === player.id);
                if (squadMember) {
                    inSquad.push({
                        ...player,
                        squad_player_id: squadMember.id,
                        jersey_number: squadMember.jersey_number,
                        role: squadMember.role || 'suplente',
                        squad_status: squadMember.status || 'disponible',
                        order: squadMember.order || 0,
                        notes: squadMember.notes,
                    });
                } else {
                    available.push(player);
                }
            });

            setSquadPlayers(inSquad.sort((a, b) => (a.order || 0) - (b.order || 0)));
            setAvailablePlayers(available);

            // Seleccionar el primer jugador del plantel si existe
            if (inSquad.length > 0 && !selectedPlayer) {
                setSelectedPlayer(inSquad[0]);
            }
        } catch (error) {
            console.error('Error loading players:', error);
        } finally {
            setLoading(false);
        }
    }

    function calculateMetrics() {
        const total = squadPlayers.length;
        const forwards = squadPlayers.filter(p => {
            const pos = RUGBY_POSITIONS.find(rp => rp.name === p.position);
            return pos?.category === 'forwards';
        }).length;
        const backs = total - forwards;

        const avgAge = squadPlayers.length > 0
            ? squadPlayers.reduce((sum, p) => {
                if (!p.birth_date) return sum;
                const age = new Date().getFullYear() - new Date(p.birth_date).getFullYear();
                return sum + age;
            }, 0) / squadPlayers.length
            : 0;

        const avgWeight = squadPlayers.length > 0
            ? squadPlayers.reduce((sum, p) => sum + (p.weight || 0), 0) / squadPlayers.length
            : 0;

        const injured = squadPlayers.filter(p => p.squad_status === 'lesionado').length;
        const suspended = squadPlayers.filter(p => p.squad_status === 'suspendido').length;
        const available = squadPlayers.filter(p => p.squad_status === 'disponible').length;

        setMetrics({
            total,
            forwards,
            backs,
            avgAge: Math.round(avgAge * 10) / 10,
            avgWeight: Math.round(avgWeight),
            injured,
            suspended,
            available,
        });
    }

    async function addToSquad(player: PlayerWithDetails) {
        const supabase = createClient();

        try {
            const { data, error } = await supabase
                .from('squad_members')
                .insert({
                    division_id: squadId,
                    person_id: player.id,
                    position: player.position,
                    role: 'suplente',
                    status: 'disponible',
                    order: squadPlayers.length,
                })
                .select()
                .single();

            if (error) throw error;

            // Actualizar estado local
            const newSquadPlayer: PlayerWithDetails = {
                ...player,
                squad_player_id: data.id,
                jersey_number: null,
                role: 'suplente',
                squad_status: 'disponible',
                order: squadPlayers.length,
                notes: null,
            };

            setSquadPlayers([...squadPlayers, newSquadPlayer]);
            setAvailablePlayers(availablePlayers.filter(p => p.id !== player.id));
            setSelectedPlayer(newSquadPlayer);
        } catch (error) {
            console.error('Error adding player:', error);
            alert('Error al agregar jugador al plantel');
        }
    }

    async function removeFromSquad(player: PlayerWithDetails) {
        if (!player.squad_player_id) return;

        const supabase = createClient();

        try {
            const { error } = await supabase
                .from('squad_members')
                .delete()
                .eq('id', player.squad_player_id);

            if (error) throw error;

            // Actualizar estado local
            setSquadPlayers(squadPlayers.filter(p => p.id !== player.id));
            setAvailablePlayers([...availablePlayers, player]);
            if (selectedPlayer?.id === player.id) {
                setSelectedPlayer(null);
            }
        } catch (error) {
            console.error('Error removing player:', error);
            alert('Error al remover jugador del plantel');
        }
    }

    async function updateSquadPlayer(playerId: string, updates: Partial<PlayerWithDetails>) {
        const player = squadPlayers.find(p => p.id === playerId);
        if (!player?.squad_player_id) return;

        const supabase = createClient();

        try {
            const { error } = await supabase
                .from('squad_members')
                .update({
                    jersey_number: updates.jersey_number,
                    role: updates.role,
                    status: updates.squad_status,
                    notes: updates.notes,
                })
                .eq('id', player.squad_player_id);

            if (error) throw error;

            // Actualizar estado local
            const updated = squadPlayers.map(p =>
                p.id === playerId ? { ...p, ...updates } : p
            );
            setSquadPlayers(updated);

            if (selectedPlayer?.id === playerId) {
                setSelectedPlayer({ ...selectedPlayer, ...updates });
            }
        } catch (error) {
            console.error('Error updating player:', error);
            alert('Error al actualizar jugador');
        }
    }

    async function handlePublish() {
        setSaving(true);
        try {
            // Aquí puedes agregar lógica adicional para "publicar"
            alert('Plantel publicado correctamente');
        } catch (error) {
            console.error('Error publishing:', error);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="obsidian-app-container">
            <div className="noise"></div>

            {/* Header */}
            <header className="contextual-nav">
                <div className="header-title-area">
                    <div className="breadcrumb">
                        <button onClick={() => router.back()} className="inline-flex items-center gap-2 hover:text-[var(--accent-pulse)] transition-colors">
                            <ArrowLeft className="w-3 h-3" />
                            {clubData.name}
                        </button>
                        <span className="mx-2">›</span>
                        Equipos
                        <span className="mx-2">›</span>
                        Plantel
                    </div>
                    <h1>{squadData.name || 'Plantel'}</h1>
                    <p>{squadData.category || 'División'} · Temporada {squadData.season || new Date().getFullYear()} · {clubData.name}</p>
                </div>
                <div className="header-actions">
                    <button className="btn">
                        <Clock className="w-4 h-4" />
                        Historial
                    </button>
                    <button className="btn">
                        <Download className="w-4 h-4" />
                        Exportar
                    </button>
                    <button className="btn btn-primary" onClick={handlePublish} disabled={saving}>
                        <Save className="w-4 h-4" />
                        {saving ? 'Guardando...' : 'Publicar Plantel'}
                    </button>
                    <button className="btn" style={{ padding: '10px' }}>
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Metrics Bar */}
            <section className="metrics-bar">
                <div className="metric-item">
                    <span className="metric-label">Jugadores</span>
                    <span className="metric-value">{metrics.total} / 40</span>
                </div>
                <div className="metric-item">
                    <span className="metric-label">Forwards</span>
                    <span className="metric-value" style={{ color: 'var(--forward-color)' }}>{metrics.forwards}</span>
                </div>
                <div className="metric-item">
                    <span className="metric-label">Backs</span>
                    <span className="metric-value" style={{ color: 'var(--back-color)' }}>{metrics.backs}</span>
                </div>
                <div className="metric-item">
                    <span className="metric-label">Prom. Edad</span>
                    <span className="metric-value">{metrics.avgAge}</span>
                </div>
                <div className="metric-item">
                    <span className="metric-label">Prom. Peso</span>
                    <span className="metric-value">{metrics.avgWeight}kg</span>
                </div>
                <div className="metric-item">
                    <span className="metric-label">Bajas</span>
                    <span className="metric-value" style={{ color: 'var(--status-injured)' }}>
                        {metrics.injured + metrics.suspended}
                    </span>
                </div>
            </section>

            {/* Main Grid */}
            <main className="main-grid">
                <AvailablePlayersColumn
                    players={availablePlayers}
                    onAddPlayer={addToSquad}
                    squadPlayerIds={new Set(squadPlayers.map(p => p.id))}
                />

                <SquadRosterColumn
                    players={squadPlayers}
                    onSelectPlayer={setSelectedPlayer}
                    onRemovePlayer={removeFromSquad}
                    selectedPlayerId={selectedPlayer?.id || null}
                />

                <PlayerDetailColumn
                    player={selectedPlayer}
                    onUpdate={updateSquadPlayer}
                />
            </main>
        </div>
    );
}
