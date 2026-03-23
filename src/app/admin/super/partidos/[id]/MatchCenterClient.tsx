'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Save, Share2, ChevronLeft, Layout, Users, Clock,
    BarChart2, Shield, Settings, ImageIcon, Plus, RefreshCw, X, Edit3, Video, FileText, Search, AlertTriangle, CheckCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
    APP_TIMEZONE,
    combineLocalDateTimeToUtcIso,
    formatDateInTimeZone,
    toInputDateInTimeZone,
    toInputTimeInTimeZone,
} from '@/lib/timezone';
import './match-center.css';

/* ─────────────────── TYPES ─────────────────── */
interface ClubInfo {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
}
interface TournamentInfo { id: string; name: string; }

interface MatchEvent {
    id: string;
    minute: number;
    type: string;
    team: 'home' | 'away' | null;
    playerName: string;
    detail: string;
}

function toDateTimeLocalInput(value: string | Date | null | undefined) {
    const date = toInputDateInTimeZone(value, APP_TIMEZONE);
    const time = toInputTimeInTimeZone(value, APP_TIMEZONE);
    return date && time ? `${date}T${time}` : '';
}

interface MatchLineups {
    home: LineupPlayer[];
    away: LineupPlayer[];
}
interface LineupPlayer {
    id?: string;
    number: number;
    name: string;
    position?: string;
    role?: string;
    isCaptain?: boolean;
}

interface MatchScore {
    home: number;
    away: number;
    homeTries?: number;
    awayTries?: number;
    notes?: string;
}

interface MatchClock {
    minute?: number;
    period?: string;
    running?: boolean;
}

export interface MatchRow {
    id: string;
    tournament_id: string | null;
    round_id: string | null;
    date_time: string | null;
    venue: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    status: string;
    score: MatchScore;
    clock: MatchClock;
    events: MatchEvent[] | null;
    lineups: MatchLineups | null;
    broadcast_url?: string | null;
    stream_url?: string | null;
    replay_url?: string | null;
    created_at: string;
    updated_at: string;
    homeClub?: ClubInfo | null;
    awayClub?: ClubInfo | null;
    tournament?: TournamentInfo | null;
    // Points per match
    home_base_points:       number | null;
    away_base_points:       number | null;
    home_bonus_points:      number | null;
    away_bonus_points:      number | null;
    points_autocalculated:  boolean | null;
    points_override_reason: string | null;
}

export interface MatchPoints {
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
}

interface MatchCenterClientProps {
    initialMatch: MatchRow;
    matchId: string;
    onClose?: () => void;
}

/* ─────────────────── TABS ─────────────────── */
const TABS = [
    { id: 'resumen', label: 'Resumen', icon: Layout },
    { id: 'alineaciones', label: 'Alineaciones', icon: Users },
    { id: 'eventos', label: 'Eventos', icon: Clock },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart2 },
    { id: 'contenido', label: 'Contenido', icon: ImageIcon },
    { id: 'oficiales', label: 'Oficiales', icon: Users },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
];

/* ─────────────────── HELPERS ─────────────────── */
function statusLabel(s: string): string {
    switch (s) {
        case 'final': return 'FINAL';
        case 'live': return 'EN VIVO';
        case 'scheduled': return 'PROGRAMADO';
        case 'postponed': return 'APLAZADO';
        case 'cancelled': return 'CANCELADO';
        default: return s.toUpperCase();
    }
}

function statusColor(s: string): string {
    switch (s) {
        case 'final': return '#888';
        case 'live': return '#ef4444';
        case 'scheduled': return 'var(--accent)';
        default: return '#f59e0b';
    }
}

function teamTag(evTeam: string | null, match: MatchRow): string {
    if (!evTeam) return '';
    return evTeam === 'home' ? '[L]' : '[V]';
}

function eventTypeLabel(t: string): string {
    const map: Record<string, string> = {
        try: 'TRY', conversion: 'CONV', penalty_goal: 'PENAL', drop_goal: 'DROP',
        yellow_card: 'AMARILLA', red_card: 'ROJA', substitution: 'CAMBIO',
        start_period: 'INICIO', end_period: 'FIN', penalty: 'PENAL',
    };
    return map[t] || t.toUpperCase();
}

function eventTypeColor(t: string): string {
    if (t === 'try') return 'var(--accent)';
    if (t === 'yellow_card') return '#eab308';
    if (t === 'red_card') return '#ef4444';
    return '#fff';
}

function countTries(events: MatchEvent[], team: 'home' | 'away'): number {
    return events.filter(e => e.type === 'try' && e.team === team).length;
}

/* ─── POINTS HELPERS ─── */
interface PointsRules {
    win: number;
    draw: number;
    loss: number;
    offensiveThreshold: number | null;
    defensiveMargin: number | null;
}

async function fetchPhaseRules(matchId: string, roundId: string | null): Promise<PointsRules> {
    const defaults: PointsRules = { win: 4, draw: 2, loss: 0, offensiveThreshold: 4, defensiveMargin: 7 };
    if (!roundId) return defaults;
    try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: round } = await supabase
            .from('tournament_rounds')
            .select('phase_id')
            .eq('id', roundId)
            .single();
        if (!round?.phase_id) return defaults;
        const { data: phase } = await supabase
            .from('tournament_phases')
            .select('settings')
            .eq('id', round.phase_id)
            .single();
        const settings = phase?.settings as any;
        return {
            win:  settings?.points?.win  ?? defaults.win,
            draw: settings?.points?.draw ?? defaults.draw,
            loss: settings?.points?.loss ?? defaults.loss,
            offensiveThreshold: settings?.bonus?.offensive?.tries ?? settings?.bonus?.offensive?.threshold ?? defaults.offensiveThreshold,
            defensiveMargin:    settings?.bonus?.defensive?.margin ?? defaults.defensiveMargin,
        };
    } catch {
        return defaults;
    }
}

function calcPointsFromResult(
    score: { home: number; away: number },
    events: MatchEvent[],
    rules: PointsRules,
): { homeBase: number; awayBase: number; homeBonus: number; awayBonus: number } {
    let homeBase = 0, awayBase = 0, homeBonus = 0, awayBonus = 0;
    if (score.home > score.away) {
        homeBase = rules.win;
        awayBase = rules.loss;
    } else if (score.home < score.away) {
        homeBase = rules.loss;
        awayBase = rules.win;
    } else {
        homeBase = rules.draw;
        awayBase = rules.draw;
    }
    // Offensive bonus
    if (rules.offensiveThreshold !== null) {
        const homeTries = countTries(events, 'home');
        const awayTries = countTries(events, 'away');
        if (homeTries >= rules.offensiveThreshold) homeBonus += 1;
        if (awayTries >= rules.offensiveThreshold) awayBonus += 1;
    }
    // Defensive bonus (only for the losing team)
    if (rules.defensiveMargin !== null) {
        if (score.home < score.away && (score.away - score.home) <= rules.defensiveMargin) homeBonus += 1;
        if (score.away < score.home && (score.home - score.away) <= rules.defensiveMargin) awayBonus += 1;
    }
    return { homeBase, awayBase, homeBonus, awayBonus };
}

/* ─────────────────── CLIENT COMPONENT ─────────────────── */
export default function MatchCenterClient({ initialMatch, matchId, onClose }: MatchCenterClientProps) {
    const router = useRouter();
    const supabase = createClient();

    const [match, setMatch] = useState<MatchRow>(initialMatch);
    const [activeTab, setActiveTab] = useState('resumen');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    // Editable state for events & lineups (local mirrors of DB JSONB)
    const [localEvents, setLocalEvents] = useState<MatchEvent[]>(Array.isArray(initialMatch.events) ? initialMatch.events : []);
    const [localLineups, setLocalLineups] = useState<MatchLineups>(initialMatch.lineups || { home: [], away: [] });

    // Editable state for per-match points
    const [localPoints, setLocalPoints] = useState<MatchPoints>({
        home_base_points:       initialMatch.home_base_points      ?? null,
        away_base_points:       initialMatch.away_base_points      ?? null,
        home_bonus_points:      initialMatch.home_bonus_points      ?? 0,
        away_bonus_points:      initialMatch.away_bonus_points      ?? 0,
        points_autocalculated:  initialMatch.points_autocalculated  ?? true,
        points_override_reason: initialMatch.points_override_reason ?? '',
    });
    const [savingPoints, setSavingPoints] = useState(false);

    /* ─── REFRESH (for after saves / config changes) ─── */
    const fetchMatch = useCallback(async () => {
        try {
            const { data, error: fetchErr } = await supabase
                .from('matches')
                .select(`
                    *,
                    homeClub:home_club_id (id, name, short_name, logo_url, primary_color),
                    awayClub:away_club_id (id, name, short_name, logo_url, primary_color),
                    tournament:tournament_id (id, name)
                `)
                .eq('id', matchId)
                .single();

            if (fetchErr) throw fetchErr;
            const m = data as unknown as MatchRow;
            setMatch(m);
            setLocalEvents(Array.isArray(m.events) ? m.events : []);
            setLocalLineups(m.lineups || { home: [], away: [] });
        } catch (err: unknown) {
            console.error('Error refreshing match:', err);
        }
    }, [matchId, supabase]);

    /* ─── POINTS: RECALCULATE & SAVE ─── */
    const handleRecalculate = useCallback(async () => {
        const currentScore = match.score || { home: 0, away: 0 };
        const rules = await fetchPhaseRules(matchId, match.round_id);
        const pts = calcPointsFromResult(currentScore, localEvents, rules);
        setLocalPoints(prev => ({
            ...prev,
            home_base_points:      pts.homeBase,
            away_base_points:      pts.awayBase,
            home_bonus_points:     pts.homeBonus,
            away_bonus_points:     pts.awayBonus,
            points_autocalculated: true,
        }));
    }, [match, matchId, localEvents]);

    const handleSavePoints = useCallback(async () => {
        setSavingPoints(true);
        try {
            await supabase.from('matches').update({
                home_base_points:       localPoints.home_base_points ?? 0,
                away_base_points:       localPoints.away_base_points ?? 0,
                home_bonus_points:      localPoints.home_bonus_points ?? 0,
                away_bonus_points:      localPoints.away_bonus_points ?? 0,
                points_autocalculated:  localPoints.points_autocalculated ?? true,
                points_override_reason: localPoints.points_override_reason || null,
            }).eq('id', matchId);
            await fetchMatch();
        } finally {
            setSavingPoints(false);
        }
    }, [supabase, matchId, localPoints, fetchMatch]);

    // On mount: if no saved points and match is already final, auto-fill
    useEffect(() => {
        if (initialMatch.home_base_points === null && initialMatch.status === 'final') {
            handleRecalculate();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reactive: recalculate whenever score/status/events change, only while in auto mode
    useEffect(() => {
        // Read auto flag at effect-run time (intentionally not in deps to avoid loops)
        if (!localPoints.points_autocalculated) return;
        handleRecalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [match.score, match.status, localEvents]);

    /* ─── REALTIME (live matches) ─── */
    useEffect(() => {
        if (match?.status !== 'live') return;
        const channel = supabase
            .channel(`match-${matchId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'matches',
                filter: `id=eq.${matchId}`,
            }, (payload) => {
                const updated = payload.new as Record<string, unknown>;
                setMatch(prev => ({ ...prev, ...updated } as unknown as MatchRow));
                if (Array.isArray(updated.events)) setLocalEvents(updated.events as MatchEvent[]);
                if (updated.lineups) setLocalLineups(updated.lineups as MatchLineups);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [match?.status, matchId, supabase]);

    /* ─── SAVE ─── */
    const handleSave = async () => {
        if (!match) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            console.log('[MatchCenter] Saving via API — events:', localEvents.length, 'lineups home:', localLineups.home.length, 'away:', localLineups.away.length);

            const res = await fetch(`/api/matches/${matchId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    events: localEvents,
                    lineups: localLineups,
                }),
            });

            const result = await res.json();
            console.log('[MatchCenter] Save result:', res.status, result);

            if (!res.ok) {
                setSaveMsg({ type: 'err', text: `Error ${res.status}: ${result.error || 'Error desconocido'}` });
                return;
            }

            await fetchMatch();
            setSaveMsg({ type: 'ok', text: '✓ Guardado correctamente' });
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (err: any) {
            console.error('[MatchCenter] Save error:', err);
            setSaveMsg({ type: 'err', text: `Error de red: ${err?.message || err}` });
        } finally {
            setSaving(false);
        }
    };

    /* ─── DERIVED DATA (all computed, zero hardcode) ─── */
    const score = match.score || { home: 0, away: 0 };
    const events = localEvents;
    const lineups = localLineups;

    const homeName = match.homeClub?.short_name || match.homeClub?.name || 'Local';
    const awayName = match.awayClub?.short_name || match.awayClub?.name || 'Visitante';
    const homeLogo = match.homeClub?.logo_url || null;
    const awayLogo = match.awayClub?.logo_url || null;
    const watchUrl = match.broadcast_url || match.stream_url || null;

    const formattedDate = match.date_time
        ? formatDateInTimeZone(match.date_time, 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' }, APP_TIMEZONE)
        : 'Sin fecha';

    // Parcials: derive from events by minute
    const ptEvents = events.filter(e => (e.type === 'try' || e.type === 'conversion' || e.type === 'penalty_goal' || e.type === 'drop_goal') && e.minute <= 40);
    const stEvents = events.filter(e => (e.type === 'try' || e.type === 'conversion' || e.type === 'penalty_goal' || e.type === 'drop_goal') && e.minute > 40);

    function calcPeriodScore(periodEvents: MatchEvent[]): { home: number; away: number } {
        let h = 0, a = 0;
        periodEvents.forEach(e => {
            let pts = 0;
            if (e.type === 'try') pts = 5;
            else if (e.type === 'conversion') pts = 2;
            else if (e.type === 'penalty_goal' || e.type === 'penalty') pts = 3;
            else if (e.type === 'drop_goal') pts = 3;
            if (e.team === 'home') h += pts;
            else if (e.team === 'away') a += pts;
        });
        return { home: h, away: a };
    }
    const ptScore = calcPeriodScore(ptEvents);
    const stScore = calcPeriodScore(stEvents);

    // Winner
    const winner = score.home > score.away ? 'LOCAL' : score.away > score.home ? 'VISITANTE' : score.home === score.away && score.home === 0 ? '—' : 'EMPATE';

    // Bonus ofensivo (4+ tries)
    const homeTriesCount = countTries(events, 'home');
    const awayTriesCount = countTries(events, 'away');
    const homeBonusOff = homeTriesCount >= 4;
    const awayBonusOff = awayTriesCount >= 4;
    const bonusOffText = homeBonusOff && awayBonusOff
        ? `${homeName} & ${awayName}`
        : homeBonusOff ? `${homeName} (${homeTriesCount} tries)` : awayBonusOff ? `${awayName} (${awayTriesCount} tries)` : 'No';

    // Bonus defensivo (lose by ≤7)
    const diff = Math.abs(score.home - score.away);
    const loser = score.home < score.away ? 'home' : score.home > score.away ? 'away' : null;
    const bonusDefText = loser && diff <= 7
        ? `${loser === 'home' ? homeName : awayName} (pierde por ${diff})`
        : 'No';

    // Metrics from events
    const totalEvents = events.length;

    // Recent events (last 8, descending by minute)
    const recentEvents = [...events].sort((a, b) => b.minute - a.minute).slice(0, 8);


    /* ─────────────────── RENDER ─────────────────── */
    return (
        <main className="match-center-container">
            {/* ═══════════ 1. HEADER ═══════════ */}
            <header className="match-center-header">
                <div className="header-left">
                    <button onClick={() => onClose ? onClose() : router.back()} className="mc-btn mc-btn-outline" style={{ border: 'none' }}>
                        <ChevronLeft size={16} /> Volver
                    </button>
                </div>

                <div className="header-identity-wrapper">
                    <div className="match-main-line">
                        <div className="team-entry local">
                            <span className="team-name-primary">{homeName}</span>
                            <div className="team-logo-mini">
                                {homeLogo ? <img src={homeLogo} alt={homeName} /> : <Shield size={32} color="#555" />}
                            </div>
                        </div>
                        <div className="score-center">
                            <span className="score-val">{score.home}</span>
                            <span className="score-sep">—</span>
                            <span className="score-val">{score.away}</span>
                        </div>
                        <div className="team-entry away">
                            <div className="team-logo-mini">
                                {awayLogo ? <img src={awayLogo} alt={awayName} /> : <Shield size={32} color="#555" />}
                            </div>
                            <span className="team-name-primary">{awayName}</span>
                        </div>
                    </div>
                    <div className="match-meta-line" style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
                        <div className="status-indicator" style={{ borderColor: statusColor(match.status), color: statusColor(match.status), background: `${statusColor(match.status)}15` }}>
                            {match.status === 'live' && match.clock?.minute ? `${match.clock.minute}'` : ''} {statusLabel(match.status)}
                        </div>
                        <div className="context-info">
                            {match.tournament?.name || 'Amistoso'} · {formattedDate} · {match.venue || 'Sin estadio'}
                        </div>
                    </div>
                </div>

                <div className="header-actions">
                    <button className="mc-btn" onClick={handleSave} disabled={saving}>
                        {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                        <span className="btn-label">Guardar</span>
                    </button>
                    <button className="mc-btn mc-btn-primary">
                        <Share2 size={16} /> <span className="btn-label">Publicar</span>
                    </button>
                    {saveMsg && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: 8,
                            padding: '10px 16px',
                            borderRadius: 8,
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            background: saveMsg.type === 'ok' ? '#052e16' : '#450a0a',
                            color: saveMsg.type === 'ok' ? '#4ade80' : '#fca5a5',
                            border: `1px solid ${saveMsg.type === 'ok' ? '#166534' : '#991b1b'}`,
                            boxShadow: '0 4px 12px rgba(0,0,0,.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            {saveMsg.type === 'ok' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                            {saveMsg.text}
                        </div>
                    )}
                </div>
            </header>

            {/* ═══════════ 2. TABS ═══════════ */}
            <nav className="match-tabs-nav">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={16} className="tab-icon" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>

            {/* ═══════════ 3. CONTENT ═══════════ */}
            <section className="match-content-grid">

                {/* ── TAB: RESUMEN ── */}
                {activeTab === 'resumen' && (
                    <div className="mc-grid-2" style={{ gap: 32 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {/* Resultado Extendido */}
                            <article className="mc-partition">
                                <div className="mc-card-header"><h4>Resultado Extendido</h4></div>
                                <div className="mc-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Parciales</div>
                                        <div style={{ fontWeight: 800 }}>PT: {ptScore.home} - {ptScore.away}</div>
                                        <div style={{ fontWeight: 800, color: '#888' }}>ST: {stScore.home} - {stScore.away}</div>
                                    </div>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Ganador</div>
                                        <div style={{ fontWeight: 800, color: winner === 'EMPATE' || winner === '—' ? '#666' : 'var(--accent)' }}>{winner}</div>
                                    </div>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Bonus Ofensivo</div>
                                        <div style={{ fontWeight: 800, color: homeBonusOff || awayBonusOff ? 'var(--accent)' : '#666' }}>{bonusOffText}</div>
                                    </div>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Bonus Defensivo</div>
                                        <div style={{ fontWeight: 800, color: bonusDefText !== 'No' ? '#f59e0b' : '#666' }}>{bonusDefText}</div>
                                    </div>
                                </div>
                            </article>

                            {/* Métricas derivadas de eventos */}
                            <article className="mc-partition">
                                <div className="mc-card-header"><h4>Métricas Clave</h4></div>
                                <div className="mc-card-body">
                                    {totalEvents === 0 ? (
                                        <p className="empty-msg">No hay eventos registrados aún. Carga eventos en la pestaña &quot;Eventos&quot;.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                            {(() => {
                                                const metrics = [
                                                    { label: 'Tries', h: homeTriesCount, a: awayTriesCount },
                                                    { label: 'Conversiones', h: events.filter(e => e.type === 'conversion' && e.team === 'home').length, a: events.filter(e => e.type === 'conversion' && e.team === 'away').length },
                                                    { label: 'Penales', h: events.filter(e => (e.type === 'penalty_goal' || e.type === 'penalty') && e.team === 'home').length, a: events.filter(e => (e.type === 'penalty_goal' || e.type === 'penalty') && e.team === 'away').length },
                                                    { label: 'Tarjetas Amarillas', h: events.filter(e => e.type === 'yellow_card' && e.team === 'home').length, a: events.filter(e => e.type === 'yellow_card' && e.team === 'away').length },
                                                    { label: 'Tarjetas Rojas', h: events.filter(e => e.type === 'red_card' && e.team === 'home').length, a: events.filter(e => e.type === 'red_card' && e.team === 'away').length },
                                                    { label: 'Cambios', h: events.filter(e => e.type === 'substitution' && e.team === 'home').length, a: events.filter(e => e.type === 'substitution' && e.team === 'away').length },
                                                ];
                                                return metrics.filter(m => m.h > 0 || m.a > 0).map(stat => {
                                                    const total = stat.h + stat.a || 1;
                                                    const hPct = (stat.h / total) * 100;
                                                    return (
                                                        <div key={stat.label}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 900, marginBottom: 8, textTransform: 'uppercase' }}>
                                                                <span>{stat.h}</span>
                                                                <span style={{ color: '#666' }}>{stat.label}</span>
                                                                <span>{stat.a}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4, height: 6, background: '#111', borderRadius: 3 }}>
                                                                <div style={{ width: hPct + '%', background: 'var(--accent)', borderRadius: 3, transition: 'width .3s' }}></div>
                                                                <div style={{ width: (100 - hPct) + '%', background: '#333', borderRadius: 3, transition: 'width .3s' }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </article>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {/* Últimos Eventos */}
                            <article className="mc-partition" style={{ flex: 1 }}>
                                <div className="mc-card-header">
                                    <h4>Últimos Eventos</h4>
                                    {events.length > 0 && (
                                        <button onClick={() => setActiveTab('eventos')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}>VER TODOS</button>
                                    )}
                                </div>
                                <div className="mc-card-body">
                                    {recentEvents.length === 0 ? (
                                        <p className="empty-msg">Sin eventos registrados.</p>
                                    ) : (
                                        <div className="event-timeline" style={{ paddingLeft: 16 }}>
                                            {recentEvents.map((ev, i) => (
                                                <div key={ev.id || i} className="event-entry" style={{ padding: '8px 12px', marginBottom: 8, background: 'transparent', border: 'none' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 900, color: eventTypeColor(ev.type), width: 40 }}>{ev.minute}&apos;</div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                                        {eventTypeLabel(ev.type)}{' '}
                                                        <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: 8 }}>
                                                            {teamTag(ev.team, match)} {ev.playerName}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </article>

                            {/* Accesos */}
                            <article className="mc-partition">
                                <div className="mc-card-header"><h4>Accesos</h4></div>
                                <div className="mc-card-body" style={{ display: 'flex', gap: 16 }}>
                                    <button
                                        className="mc-btn mc-btn-outline"
                                        style={{ flex: 1, padding: 16, justifyContent: 'center', opacity: watchUrl ? 1 : 0.4 }}
                                        disabled={!watchUrl}
                                        onClick={() => watchUrl && window.open(watchUrl, '_blank')}
                                    >
                                        <Video size={16} /> Transmisión
                                    </button>
                                    <button
                                        className="mc-btn mc-btn-outline"
                                        style={{ flex: 1, padding: 16, justifyContent: 'center', opacity: match.replay_url ? 1 : 0.4 }}
                                        disabled={!match.replay_url}
                                        onClick={() => match.replay_url && window.open(match.replay_url, '_blank')}
                                    >
                                        <Search size={16} /> Replay
                                    </button>
                                </div>
                            </article>
                        </div>
                    </div>
                )}

                {/* ── TAB: ALINEACIONES ── */}
                {activeTab === 'alineaciones' && (
                    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                        {lineups.home.length === 0 && lineups.away.length === 0 ? (
                            <article className="mc-partition">
                                <div className="mc-card-body">
                                    <p className="empty-msg">No hay alineaciones cargadas. Agrega jugadores para cada equipo.</p>
                                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16 }}>
                                        <button className="mc-btn mc-btn-primary" onClick={() => {
                                            const defaultLineup: LineupPlayer[] = Array(23).fill(null).map((_, i) => ({
                                                number: i + 1, name: '', position: '', role: i < 15 ? 'starter' : 'substitute'
                                            }));
                                            setLocalLineups({ home: [...defaultLineup], away: [...defaultLineup] });
                                        }}>
                                            <Plus size={14} /> Generar plantilla 23 jugadores
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                                {(['home', 'away'] as const).map(team => {
                                    const club = team === 'home' ? match.homeClub : match.awayClub;
                                    const players = lineups[team];
                                    const starters = players.filter(p => p.role === 'starter' || (!p.role && p.number <= 15));
                                    const subs = players.filter(p => p.role === 'substitute' || (!p.role && p.number > 15));

                                    return (
                                        <article key={team} className="mc-partition" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                                {club?.logo_url && <img src={club.logo_url} alt={club.name} width={24} style={{ objectFit: 'contain' }} />}
                                                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0 }}>{club?.name || (team === 'home' ? 'Local' : 'Visitante')}</h3>
                                            </div>
                                            <div style={{ background: '#111', borderRadius: 8, border: '1px solid #222', overflow: 'hidden' }}>
                                                <div style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    TITULARES ({starters.length})
                                                </div>
                                                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {starters.map((p, idx) => (
                                                        <div key={idx} className="player-row">
                                                            <span className="player-number">{p.number}</span>
                                                            <input
                                                                type="text"
                                                                value={p.name}
                                                                placeholder="Nombre jugador"
                                                                className="inline-input"
                                                                onChange={(e) => {
                                                                    const updated = [...lineups[team]];
                                                                    const realIdx = updated.findIndex(x => x.number === p.number);
                                                                    if (realIdx >= 0) updated[realIdx] = { ...updated[realIdx], name: e.target.value };
                                                                    setLocalLineups({ ...lineups, [team]: updated });
                                                                }}
                                                            />
                                                            {p.isCaptain && <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '2px 6px' }}>C</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    SUPLENTES ({subs.length})
                                                </div>
                                                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {subs.map((p, idx) => (
                                                        <div key={idx} className="player-row">
                                                            <span className="player-number" style={{ borderColor: '#555', color: '#555' }}>{p.number}</span>
                                                            <input
                                                                type="text"
                                                                value={p.name}
                                                                placeholder="Nombre suplente"
                                                                className="inline-input"
                                                                style={{ color: '#ccc' }}
                                                                onChange={(e) => {
                                                                    const updated = [...lineups[team]];
                                                                    const realIdx = updated.findIndex(x => x.number === p.number);
                                                                    if (realIdx >= 0) updated[realIdx] = { ...updated[realIdx], name: e.target.value };
                                                                    setLocalLineups({ ...lineups, [team]: updated });
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: EVENTOS ── */}
                {activeTab === 'eventos' && (
                    <article className="mc-partition" style={{ maxWidth: 900, margin: '0 auto' }}>
                        <div className="mc-card-header">
                            <h4>Timeline de Eventos ({events.length})</h4>
                            <button className="mc-btn mc-btn-primary" onClick={() => {
                                const newEvent: MatchEvent = {
                                    id: crypto.randomUUID(),
                                    minute: 0,
                                    type: 'try',
                                    team: 'home',
                                    playerName: '',
                                    detail: '',
                                };
                                setLocalEvents([...localEvents, newEvent]);
                            }}>
                                <Plus size={14} /> Evento
                            </button>
                        </div>
                        <div className="mc-card-body" style={{ padding: 0 }}>
                            {events.length === 0 ? (
                                <p className="empty-msg">Sin eventos. Haz clic en &quot;+ Evento&quot; para agregar.</p>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '70px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.7rem', fontWeight: 800, color: '#666', borderBottom: '1px solid #222' }}>
                                        <div>MIN</div><div>TIPO</div><div>EQUIPO</div><div>JUGADOR / DETALLE</div><div style={{ textAlign: 'right' }}>ACCIÓN</div>
                                    </div>
                                    {[...events].sort((a, b) => a.minute - b.minute).map((ev, i) => (
                                        <div key={ev.id || i} style={{ display: 'grid', gridTemplateColumns: '70px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.85rem', borderBottom: '1px solid #222', alignItems: 'center' }}>
                                            <div>
                                                <input
                                                    type="number" value={ev.minute} min={0} max={100}
                                                    style={{ width: 50, background: '#222', border: 'none', color: 'var(--accent)', fontWeight: 900, padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => {
                                                        const updated = [...localEvents];
                                                        updated[i] = { ...updated[i], minute: parseInt(e.target.value) || 0 };
                                                        setLocalEvents(updated);
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={ev.type}
                                                    style={{ background: '#222', border: 'none', color: '#fff', fontSize: '0.8rem', padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => {
                                                        const updated = [...localEvents];
                                                        updated[i] = { ...updated[i], type: e.target.value };
                                                        setLocalEvents(updated);
                                                    }}
                                                >
                                                    <option value="try">Try</option>
                                                    <option value="conversion">Conversión</option>
                                                    <option value="penalty_goal">Penal</option>
                                                    <option value="drop_goal">Drop Goal</option>
                                                    <option value="yellow_card">Amarilla</option>
                                                    <option value="red_card">Roja</option>
                                                    <option value="substitution">Cambio</option>
                                                    <option value="start_period">Inicio Periodo</option>
                                                    <option value="end_period">Fin Periodo</option>
                                                </select>
                                            </div>
                                            <div>
                                                <select
                                                    value={ev.team || ''}
                                                    style={{ background: '#222', border: 'none', color: '#fff', fontSize: '0.8rem', padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => {
                                                        const updated = [...localEvents];
                                                        updated[i] = { ...updated[i], team: (e.target.value || null) as 'home' | 'away' | null };
                                                        setLocalEvents(updated);
                                                    }}
                                                >
                                                    <option value="">—</option>
                                                    <option value="home">{homeName}</option>
                                                    <option value="away">{awayName}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <input
                                                    type="text" value={ev.playerName} placeholder="Nombre del jugador"
                                                    className="inline-input" style={{ fontSize: '0.85rem' }}
                                                    onChange={(e) => {
                                                        const updated = [...localEvents];
                                                        updated[i] = { ...updated[i], playerName: e.target.value };
                                                        setLocalEvents(updated);
                                                    }}
                                                />
                                            </div>
                                            <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                <button className="mc-btn mc-btn-outline" style={{ padding: 6, color: '#ef4444', border: '1px solid #333' }} onClick={() => {
                                                    setLocalEvents(localEvents.filter((_, idx) => idx !== i));
                                                }}>
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </article>
                )}

                {/* ── TAB: ESTADÍSTICAS ── */}
                {activeTab === 'estadisticas' && (
                    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                        {events.length === 0 ? (
                            <article className="mc-partition">
                                <div className="mc-card-body">
                                    <p className="empty-msg">Las estadísticas se generan automáticamente a partir de los eventos. Carga eventos primero.</p>
                                </div>
                            </article>
                        ) : (
                            <article className="mc-partition" style={{ background: '#111' }}>
                                <div className="mc-card-header"><h4>Comparativo por Equipo</h4></div>
                                <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {[
                                        { label: 'Tries', h: homeTriesCount, a: awayTriesCount },
                                        { label: 'Conversiones', h: events.filter(e => e.type === 'conversion' && e.team === 'home').length, a: events.filter(e => e.type === 'conversion' && e.team === 'away').length },
                                        { label: 'Penales (gol)', h: events.filter(e => (e.type === 'penalty_goal' || e.type === 'penalty') && e.team === 'home').length, a: events.filter(e => (e.type === 'penalty_goal' || e.type === 'penalty') && e.team === 'away').length },
                                        { label: 'Drop Goals', h: events.filter(e => e.type === 'drop_goal' && e.team === 'home').length, a: events.filter(e => e.type === 'drop_goal' && e.team === 'away').length },
                                        { label: 'Tarjetas Amarillas', h: events.filter(e => e.type === 'yellow_card' && e.team === 'home').length, a: events.filter(e => e.type === 'yellow_card' && e.team === 'away').length },
                                        { label: 'Tarjetas Rojas', h: events.filter(e => e.type === 'red_card' && e.team === 'home').length, a: events.filter(e => e.type === 'red_card' && e.team === 'away').length },
                                        { label: 'Cambios', h: events.filter(e => e.type === 'substitution' && e.team === 'home').length, a: events.filter(e => e.type === 'substitution' && e.team === 'away').length },
                                    ].filter(s => s.h > 0 || s.a > 0).map(stat => {
                                        const total = stat.h + stat.a || 1;
                                        const hPct = (stat.h / total) * 100;
                                        return (
                                            <div key={stat.label} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 200px 1fr 60px', alignItems: 'center', gap: 16 }}>
                                                <div style={{ textAlign: 'right', fontWeight: 900, fontSize: '1.2rem' }}>{stat.h}</div>
                                                <div style={{ height: 8, background: '#222', borderRadius: 4, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' }}>
                                                    <div style={{ width: hPct + '%', background: 'var(--accent)', transition: 'width .3s' }}></div>
                                                </div>
                                                <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>{stat.label}</div>
                                                <div style={{ height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
                                                    <div style={{ width: (100 - hPct) + '%', background: '#555', transition: 'width .3s' }}></div>
                                                </div>
                                                <div style={{ textAlign: 'left', fontWeight: 900, fontSize: '1.2rem' }}>{stat.a}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Score breakdown */}
                                <div className="mc-card-body" style={{ borderTop: '1px solid #222', paddingTop: 24 }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', color: '#888', marginBottom: 16 }}>Desglose de Puntos</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        {(['home', 'away'] as const).map(team => {
                                            const tries = countTries(events, team) * 5;
                                            const convs = events.filter(e => e.type === 'conversion' && e.team === team).length * 2;
                                            const pens = events.filter(e => (e.type === 'penalty_goal' || e.type === 'penalty') && e.team === team).length * 3;
                                            const drops = events.filter(e => e.type === 'drop_goal' && e.team === team).length * 3;
                                            const total = tries + convs + pens + drops;
                                            const clubName = team === 'home' ? homeName : awayName;
                                            return (
                                                <div key={team} style={{ padding: 16, background: '#1a1a1a', borderRadius: 8 }}>
                                                    <div style={{ fontWeight: 900, marginBottom: 12, fontSize: '0.85rem' }}>{clubName}</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Tries ({countTries(events, team)}×5)</span><span style={{ fontWeight: 800 }}>{tries}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Conversiones (×2)</span><span style={{ fontWeight: 800 }}>{convs}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Penales (×3)</span><span style={{ fontWeight: 800 }}>{pens}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Drop Goals (×3)</span><span style={{ fontWeight: 800 }}>{drops}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: 6, marginTop: 4 }}><span style={{ fontWeight: 900 }}>TOTAL</span><span style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '1.1rem' }}>{total}</span></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </article>
                        )}
                    </div>
                )}

                {/* ── TAB: CONTENIDO ── */}
                {activeTab === 'contenido' && (
                    <article className="mc-partition" style={{ maxWidth: 800, margin: '0 auto', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <div className="mc-grid-2">
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Transmisión en Vivo (URL)</label>
                                <input
                                    type="text"
                                    defaultValue={watchUrl || ''}
                                    placeholder="https://youtube.com/..."
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 12, color: '#fff', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Replay Completo (URL)</label>
                                <input
                                    type="text"
                                    defaultValue={match.replay_url || ''}
                                    placeholder="https://youtube.com/..."
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 12, color: '#fff', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222', gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Crónica del Partido</label>
                                <textarea
                                    placeholder="Redactar la crónica oficial..."
                                    rows={6}
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 16, color: '#fff', borderRadius: 4, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', minHeight: 120 }}>
                                <div style={{ textAlign: 'center', color: '#666' }}>
                                    <ImageIcon size={32} style={{ margin: '0 auto 12px' }} />
                                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Subir Galería de Fotos / Highlights</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Arrastra y suelta aquí</div>
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* ── TAB: OFICIALES ── */}
                {activeTab === 'oficiales' && (
                    <article className="mc-partition" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <div className="mc-card-header"><h4>Autoridades del Partido</h4></div>
                        <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {['Árbitro Principal', 'Asistente 1 (AR1)', 'Asistente 2 (AR2)', 'TMO', 'Médico Jefe', 'Comisionado Deportivo'].map(role => (
                                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <label style={{ width: 200, fontSize: '0.8rem', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>{role}</label>
                                    <input
                                        type="text"
                                        placeholder="Nombre del oficial"
                                        style={{ flex: 1, background: '#111', border: '1px solid #333', padding: '10px 14px', color: '#fff', borderRadius: 4, outline: 'none' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </article>
                )}

                {/* ── TAB: CONFIGURACIÓN ── */}
                {activeTab === 'configuracion' && (
                    <article className="mc-partition" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <div className="mc-card-header"><h4>Parámetros del Partido</h4></div>
                        <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div className="form-group">
                                <label>Estado Actual</label>
                                <select
                                    defaultValue={match.status}
                                    style={{ borderRadius: 4 }}
                                    onChange={async (e) => {
                                        await supabase.from('matches').update({ status: e.target.value }).eq('id', matchId);
                                        fetchMatch();
                                    }}
                                >
                                    <option value="scheduled">Programado</option>
                                    <option value="live">En Vivo</option>
                                    <option value="final">Finalizado</option>
                                    <option value="postponed">Aplazado</option>
                                    <option value="cancelled">Cancelado</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Marcador Local</label>
                                <input
                                    type="number"
                                    defaultValue={score.home}
                                    min={0}
                                    style={{ borderRadius: 4 }}
                                    onBlur={async (e) => {
                                        const newScore = { ...score, home: parseInt(e.target.value) || 0 };
                                        await supabase.from('matches').update({ score: newScore as any }).eq('id', matchId);
                                        fetchMatch();
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Marcador Visitante</label>
                                <input
                                    type="number"
                                    defaultValue={score.away}
                                    min={0}
                                    style={{ borderRadius: 4 }}
                                    onBlur={async (e) => {
                                        const newScore = { ...score, away: parseInt(e.target.value) || 0 };
                                        await supabase.from('matches').update({ score: newScore as any }).eq('id', matchId);
                                        fetchMatch();
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Estadio / Venue</label>
                                <input
                                    type="text"
                                    defaultValue={match.venue || ''}
                                    style={{ borderRadius: 4 }}
                                    onBlur={async (e) => {
                                        await supabase.from('matches').update({ venue: e.target.value }).eq('id', matchId);
                                        fetchMatch();
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    defaultValue={toDateTimeLocalInput(match.date_time)}
                                    style={{ borderRadius: 4 }}
                                    onBlur={async (e) => {
                                        if (e.target.value) {
                                            const [date, time] = e.target.value.split('T');
                                            const nextDateTime = combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
                                            if (!nextDateTime) return;
                                            await supabase.from('matches').update({ date_time: nextDateTime }).eq('id', matchId);
                                            fetchMatch();
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* ── PUNTOS DEL PARTIDO ── */}
                        <div style={{ marginTop: 32, borderTop: '1px solid #222', paddingTop: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <h4 style={{ margin: 0 }}>Puntos del Partido</h4>
                                <span style={{
                                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                                    background: localPoints.points_autocalculated ? 'rgba(0,163,101,0.2)' : 'rgba(245,158,11,0.2)',
                                    color: localPoints.points_autocalculated ? 'var(--accent)' : '#f59e0b',
                                    border: `1px solid ${localPoints.points_autocalculated ? 'var(--accent)' : '#f59e0b'}`,
                                }}>
                                    {localPoints.points_autocalculated ? 'Autocalculado' : 'Editado manualmente'}
                                </span>
                            </div>
                            <p style={{ fontSize: 13, color: '#888', marginBottom: 20, marginTop: 0 }}>
                                Los puntos base se completan automáticamente según las reglas del partido. Podés agregar bonus o penalizaciones manuales.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Puntos base local</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={localPoints.home_base_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseInt(e.target.value) || 0);
                                            setLocalPoints(prev => ({ ...prev, home_base_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Puntos base visitante</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={localPoints.away_base_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseInt(e.target.value) || 0);
                                            setLocalPoints(prev => ({ ...prev, away_base_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Bonus / modificador local</label>
                                    <input
                                        type="number"
                                        value={localPoints.home_bonus_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value) || 0;
                                            setLocalPoints(prev => ({ ...prev, home_bonus_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                    <small style={{ color: '#666', fontSize: 11 }}>Permite sumar o restar puntos manualmente.</small>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Bonus / modificador visitante</label>
                                    <input
                                        type="number"
                                        value={localPoints.away_bonus_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value) || 0;
                                            setLocalPoints(prev => ({ ...prev, away_bonus_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                    <small style={{ color: '#666', fontSize: 11 }}>Permite sumar o restar puntos manualmente.</small>
                                </div>
                            </div>

                            {/* Totals (read-only) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                {[
                                    { label: 'Total local', value: (localPoints.home_base_points ?? 0) + (localPoints.home_bonus_points ?? 0) },
                                    { label: 'Total visitante', value: (localPoints.away_base_points ?? 0) + (localPoints.away_bonus_points ?? 0) },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ background: '#111', borderRadius: 4, padding: '10px 14px' }}>
                                        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
                                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Override reason */}
                            {!localPoints.points_autocalculated && (
                                <div className="form-group">
                                    <label>Motivo de ajuste (opcional)</label>
                                    <textarea
                                        rows={2}
                                        value={localPoints.points_override_reason ?? ''}
                                        placeholder="Ej: Sanción disciplinaria, corrección de resultado..."
                                        style={{ borderRadius: 4, resize: 'vertical' }}
                                        onChange={(e) => setLocalPoints(prev => ({ ...prev, points_override_reason: e.target.value }))}
                                    />
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={handleRecalculate}
                                    style={{
                                        background: 'transparent', border: '1px solid #333', color: '#aaa',
                                        borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                                    }}
                                >
                                    Recalcular automáticamente
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSavePoints}
                                    disabled={savingPoints}
                                    style={{
                                        background: 'var(--accent)', border: 'none', color: '#000',
                                        borderRadius: 4, padding: '8px 20px', cursor: savingPoints ? 'not-allowed' : 'pointer',
                                        fontWeight: 700, fontSize: 13, opacity: savingPoints ? 0.6 : 1,
                                    }}
                                >
                                    {savingPoints ? 'Guardando...' : 'Guardar puntos'}
                                </button>
                            </div>
                        </div>
                    </article>
                )}

            </section>
        </main>
    );
}
