'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/mock-db';
import AdminBreadcrumbs from '@/app/admin/components/AdminBreadcrumbs';

// Sport-specific events configuration
const SPORT_EVENTS = {
    rugby: [
        { id: 'try', label: 'Try', points: 5, icon: '🏉' },
        { id: 'conversion', label: 'Conversión', points: 2, icon: '🎯' },
        { id: 'penalty', label: 'Penal', points: 3, icon: '⚡' },
        { id: 'drop', label: 'Drop', points: 3, icon: '🦵' },
        { id: 'yellow_card', label: 'Tarjeta Amarilla', points: 0, icon: '🟨' },
        { id: 'red_card', label: 'Tarjeta Roja', points: 0, icon: '🟥' },
        { id: 'substitution', label: 'Cambio', points: 0, icon: '🔄' },
    ],
    football: [
        { id: 'goal', label: 'Gol', points: 1, icon: '⚽' },
        { id: 'penalty', label: 'Penal', points: 1, icon: '🎯' },
        { id: 'own_goal', label: 'Autogol', points: 1, icon: '🔄' },
        { id: 'yellow_card', label: 'Tarjeta Amarilla', points: 0, icon: '🟨' },
        { id: 'red_card', label: 'Tarjeta Roja', points: 0, icon: '🟥' },
        { id: 'substitution', label: 'Cambio', points: 0, icon: '🔄' },
    ],
    hockey: [
        { id: 'goal', label: 'Gol', points: 1, icon: '🏑' },
        { id: 'penalty_stroke', label: 'Penal Stroke', points: 1, icon: '🎯' },
        { id: 'penalty_corner', label: 'Penal Corner', points: 0, icon: '📐' },
        { id: 'green_card', label: 'Tarjeta Verde', points: 0, icon: '🟩' },
        { id: 'yellow_card', label: 'Tarjeta Amarilla', points: 0, icon: '🟨' },
        { id: 'red_card', label: 'Tarjeta Roja', points: 0, icon: '🟥' },
        { id: 'substitution', label: 'Cambio', points: 0, icon: '🔄' },
    ],
};

export default function MatchDashboard() {
    const params = useParams();
    const router = useRouter();
    const matchId = params?.id as string;
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const [match, setMatch] = useState<any>(null);
    const [currentTab, setCurrentTab] = useState<'prepartido' | 'alineaciones' | 'timeline' | 'puntos'>('timeline');
    const [isLive, setIsLive] = useState(false);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [gameTime, setGameTime] = useState(0); // in seconds
    const [currentPeriod, setCurrentPeriod] = useState('1T');
    const [showEventModal, setShowEventModal] = useState(false);
    const [showTeamChangeModal, setShowTeamChangeModal] = useState<'home' | 'away' | null>(null);
    const [showScoreEditModal, setShowScoreEditModal] = useState(false);
    const [showStatEditModal, setShowStatEditModal] = useState(false);
    const [showPlayerOptionsModal, setShowPlayerOptionsModal] = useState<'home' | 'away' | null>(null);
    const [showImportPlayerModal, setShowImportPlayerModal] = useState<'home' | 'away' | null>(null);
    const [showImportTemplateModal, setShowImportTemplateModal] = useState<'home' | 'away' | null>(null);
    const [showCreatePlayerModal, setShowCreatePlayerModal] = useState<'home' | 'away' | null>(null);
    const [showPeriodModal, setShowPeriodModal] = useState(false);

    const [homeScore, setHomeScore] = useState(0);
    const [awayScore, setAwayScore] = useState(0);
    const [events, setEvents] = useState<any[]>([]);
    const [homePlayers, setHomePlayers] = useState<any[]>([]);
    const [awayPlayers, setAwayPlayers] = useState<any[]>([]);
    const [stats, setStats] = useState([
        { id: 'possession', label: 'Posesión', home: 58, away: 42, unit: '%' },
        { id: 'shots', label: 'Remates', home: 14, away: 10, unit: '' },
        { id: 'passAccuracy', label: 'Precisión de Pases', home: 88, away: 81, unit: '%' }
    ]);

    // Tournament points
    const [points, setPoints] = useState({ home: 0, away: 0, homeBonus: 0, awayBonus: 0 });
    const [isPointsManual, setIsPointsManual] = useState(false);

    // Event modal state
    const [editingEventId, setEditingEventId] = useState<number | null>(null);
    const [eventData, setEventData] = useState({
        team: '',
        type: '',
        player: '',
        minute: Math.floor(gameTime / 60),
        detail: ''
    });

    // Mock data for importing
    const [availablePlayers] = useState([
        { id: 1, name: 'Juan Pérez', number: 10, position: 'Centro' },
        { id: 2, name: 'Carlos González', number: 15, position: 'Wing' },
        { id: 3, name: 'Miguel Rodríguez', number: 9, position: 'Medio Scrum' },
        { id: 4, name: 'Diego Martínez', number: 8, position: 'Octavo' },
    ]);

    const [availableTemplates] = useState([
        { id: 1, name: 'Equipo Titular Rugby 2024', playerCount: 15 },
        { id: 2, name: 'Equipo Reserva Rugby', playerCount: 8 },
        { id: 3, name: 'Formación Fútbol 4-3-3', playerCount: 11 },
    ]);

    useEffect(() => {
        const foundMatch = db.matches.find(m => m.id === matchId);
        if (foundMatch) {
            setMatch(foundMatch);
            setHomeScore(foundMatch.score.home);
            setAwayScore(foundMatch.score.away);
            setIsLive(foundMatch.liveEnabled);
            setGameTime(foundMatch.clock.seconds);
            setCurrentPeriod(foundMatch.clock.period);
            setIsTimerRunning(foundMatch.clock.running);
        }
    }, [matchId]);

    // Timer effect
    useEffect(() => {
        if (isTimerRunning) {
            timerRef.current = setInterval(() => {
                setGameTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isTimerRunning]);

    // Points calculation effect
    useEffect(() => {
        if (!match || isPointsManual) return;

        const tournament = db.tournaments?.find(t => t.id === match.tournamentId);
        let pHome = 0, pAway = 0, bHome = 0, bAway = 0;
        const sport = tournament?.sport?.toLowerCase() || 'rugby'; // Default to rugby if undefined
        const isRugby = sport.includes('rugby');

        if (homeScore > awayScore) {
            pHome = isRugby ? 4 : 3;
            pAway = 0;
        } else if (awayScore > homeScore) {
            pAway = isRugby ? 4 : 3;
            pHome = 0;
        } else {
            pHome = isRugby ? 2 : 1;
            pAway = isRugby ? 2 : 1;
        }

        if (isRugby) {
            // Offensive Bonus (4+ tries)
            const homeTries = events.filter(e => e.team === 'home' && e.type === 'try').length;
            const awayTries = events.filter(e => e.team === 'away' && e.type === 'try').length;
            if (homeTries >= 4) bHome += 1;
            if (awayTries >= 4) bAway += 1;

            // Defensive Bonus (Loss by 7 or less)
            const diff = Math.abs(homeScore - awayScore);
            if (homeScore < awayScore && diff <= 7) bHome += 1;
            if (awayScore < homeScore && diff <= 7) bAway += 1;
        }

        setPoints({ home: pHome, away: pAway, homeBonus: bHome, awayBonus: bAway });
    }, [homeScore, awayScore, events, match, isPointsManual]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleToggleLive = () => {
        setIsLive(!isLive);
    };

    const handleAddEvent = () => {
        const sportEvents = SPORT_EVENTS[match?.sport as keyof typeof SPORT_EVENTS] || SPORT_EVENTS.rugby;
        const eventType = sportEvents.find(e => e.id === eventData.type);

        if (eventType && eventType.points > 0) {
            if (eventData.team === 'home') {
                setHomeScore(prev => prev + eventType.points);
            } else {
                setAwayScore(prev => prev + eventType.points);
            }
        }

        const newEvent = {
            id: Date.now(),
            time: `${eventData.minute}'`,
            period: currentPeriod,
            type: eventData.type,
            team: eventData.team,
            player: eventData.player,
            description: eventType?.label || eventData.type,
            detail: eventData.detail || eventData.player
        };

        setEvents([newEvent, ...events]);
        setShowEventModal(false);
        setEventData({ team: '', type: '', player: '', minute: Math.floor(gameTime / 60), detail: '' });
    };

    const handleEditEvent = (event: any) => {
        const minVal = parseInt(event.time.replace("'", "")) || 0;
        setEditingEventId(event.id);
        setEventData({
            team: event.team,
            type: event.type,
            player: event.player,
            minute: minVal,
            detail: event.detail
        });
        setShowEventModal(true);
    };

    const handleUpdateEvent = () => {
        const sportEvents = SPORT_EVENTS[match?.sport as keyof typeof SPORT_EVENTS] || SPORT_EVENTS.rugby;
        let newHomeScore = homeScore;
        let newAwayScore = awayScore;

        const updatedEvents = events.map(ev => {
            if (ev.id === editingEventId) {
                // Remove old points
                const oldType = sportEvents.find(e => e.id === ev.type);
                if (oldType && oldType.points > 0) {
                    if (ev.team === 'home') newHomeScore = Math.max(0, newHomeScore - oldType.points);
                    else newAwayScore = Math.max(0, newAwayScore - oldType.points);
                }

                // Add new points
                const newType = sportEvents.find(e => e.id === eventData.type);
                if (newType && newType.points > 0) {
                    if (eventData.team === 'home') newHomeScore += newType.points;
                    else newAwayScore += newType.points;
                }

                return {
                    ...ev,
                    time: `${eventData.minute}'`,
                    type: eventData.type,
                    team: eventData.team,
                    player: eventData.player,
                    description: newType?.label || eventData.type,
                    detail: eventData.detail
                };
            }
            return ev;
        });

        setHomeScore(newHomeScore);
        setAwayScore(newAwayScore);
        setEvents(updatedEvents);
        setShowEventModal(false);
        setEditingEventId(null);
        setEventData({ team: '', type: '', player: '', minute: Math.floor(gameTime / 60), detail: '' });
    };

    const getPeriodsForSport = (sport: string) => {
        const s = sport?.toLowerCase() || '';
        if (s.includes('hockey') || s.includes('basket') || s.includes('nba')) {
            return ['1C', '2C', '3C', '4C', 'TE', 'PK'];
        }
        return ['1T', '2T', 'TE', 'GP', 'PK'];
    };

    const periodLabels: Record<string, string> = {
        '1T': 'Primer Tiempo',
        '2T': 'Segundo Tiempo',
        '1C': 'Primer Cuarto',
        '2C': 'Segundo Cuarto',
        '3C': 'Tercer Cuarto',
        '4C': 'Cuarto Cuarto',
        'TE': 'Tiempo Extra',
        'GP': 'Punto de Oro',
        'PK': 'Penales',
    };

    const handleAddPeriodEvent = (periodKey: string, action: 'start' | 'end') => {
        let label = periodLabels[periodKey] || periodKey;
        let icon = '▶️';

        if (periodKey === 'FT') {
            label = 'Final del Partido';
            icon = '🏁';
            setIsTimerRunning(false);
            setIsLive(false);
        } else if (action === 'end') {
            label = `Fin ${label}`;
            icon = '⏸️';
            setIsTimerRunning(false);
        } else {
            label = `Inicio ${label}`;
            icon = '▶️';
            setIsTimerRunning(true);
        }

        const newEvent = {
            id: Date.now(),
            time: `${Math.floor(gameTime / 60)}'`,
            period: periodKey === 'FT' ? currentPeriod : periodKey,
            type: 'period',
            team: null,
            description: label,
            detail: icon
        };

        setEvents([newEvent, ...events]);
        setShowPeriodModal(false);

        if (periodKey === 'FT') {
            setCurrentPeriod('FT');
        } else if (action === 'start') {
            setCurrentPeriod(periodKey);
        }
    };

    const handleDeleteEvent = (eventId: number) => {
        setEvents(events.filter(e => e.id !== eventId));
    };

    if (!match) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06090c' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>Cargando partido...</div>
            </div>
        );
    }

    const homeTeam = db.clubs?.find(c => c.id === match.homeClubId);
    const awayTeam = db.clubs?.find(c => c.id === match.awayClubId);
    const tournament = db.tournaments?.find(t => t.id === match.tournamentId);
    const sport = tournament?.sport || 'rugby';
    const sportEvents = SPORT_EVENTS[sport as keyof typeof SPORT_EVENTS] || SPORT_EVENTS.rugby;

    return (
        <>
            <style jsx global>{`
                :root {
                    --bg: #06090c;
                    --fg: rgba(255, 255, 255, .92);
                    --muted: rgba(255, 255, 255, .62);
                    --muted2: rgba(255, 255, 255, .40);
                    --border: rgba(255, 255, 255, .08);
                    --accent: #22c55e;
                    --accent-weak: rgba(34, 197, 94, .18);
                    --r-xl: 22px;
                    --r-md: 14px;
                    --blur: 18px;
                }

                .matchPage {
                    min-height: 100vh;
                    background: radial-gradient(1200px 700px at 50% -120px, rgba(34, 197, 94, .14), transparent 55%),
                                radial-gradient(900px 600px at 12% 10%, rgba(255, 255, 255, .07), transparent 60%),
                                var(--bg);
                    position: relative;
                }

                .matchPage::after {
                    content: "";
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    background: radial-gradient(120% 90% at 50% 25%, transparent 45%, rgba(0, 0, 0, .65) 100%);
                    z-index: 0;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 28px 24px 56px;
                    position: relative;
                    z-index: 1;
                }

                .hero {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 28px;
                    padding: 40px;
                    background: linear-gradient(180deg, rgba(255, 255, 255, .04), transparent);
                    border-radius: var(--r-xl);
                    border: 1px solid var(--border);
                    backdrop-filter: blur(var(--blur));
                    margin-bottom: 24px;
                }

                @media (max-width: 980px) {
                    .hero { flex-direction: column; text-align: center; padding: 32px 20px; gap: 24px; }
                }

                .teamSide {
                    flex: 1 1 0;
                    min-width: 0; /* CLAVE: permite truncar */
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }

                .teamSide.local { justify-content: flex-start; }
                .teamSide.visitor { justify-content: flex-end; }

                .scoreCenter {
                    flex: 0 0 280px; /* FIJO: nunca se rompe */
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                }

                @media (max-width: 980px) {
                    .teamSide { justify-content: center !important; }
                    .scoreCenter { flex-basis: auto; }
                }

                @media (max-width: 1200px) {
                    .scoreCenter { flex-basis: 240px; }
                    .teamName { font-size: 22px !important; }
                    .score { font-size: 72px !important; }
                }

                .teamLogoWrap {
                    position: relative;
                    width: 84px;
                    height: 84px;
                }

                .teamAvatar {
                    width: 84px;
                    height: 84px;
                    border-radius: 999px;
                    border: 1px solid rgba(255, 255, 255, .15);
                    background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));
                    box-shadow: inset 0 0 20px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 36px;
                }

                .btnEdit {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: #fff;
                    color: #000;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    transition: transform 0.2s;
                    z-index: 2;
                }
                .btnEdit:hover { transform: scale(1.15); }

                .teamName {
                    font-size: 28px;
                    font-weight: 800;
                    line-height: 1.1;
                    max-width: 280px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .visitor .teamName { text-align: right; }

                .badgeRole {
                    display: inline-flex;
                    padding: 5px 10px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, .05);
                    border: 1px solid var(--border);
                    color: var(--muted);
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: .12em;
                    text-transform: uppercase;
                }

                .teamMeta { color: var(--muted2); font-size: 13px; font-weight: 500; }

                .scoreNumbers {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 18px;
                    font-variant-numeric: tabular-nums;
                }

                .scoreNumbers .n {
                    font-family: 'JetBrains Mono', ui-monospace, monospace;
                    font-size: 88px;
                    font-weight: 900;
                    line-height: 1;
                }

                .scoreNumbers .sep {
                    opacity: 0.5;
                    font-size: 44px;
                    font-weight: 800;
                    line-height: 1;
                }

                @media (max-width: 1200px) {
                    .scoreNumbers .n { font-size: 72px; }
                    .scoreNumbers .sep { font-size: 36px; }
                }

                .timerPill {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 8px 20px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, .03);
                    border: 1px solid var(--border);
                }

                .timerText { font-family: monospace; font-size: 18px; font-weight: 700; color: var(--fg); }

                .chipLive {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    border-radius: 999px;
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                    font-weight: 850;
                    font-size: 11px;
                    letter-spacing: .1em;
                    text-transform: uppercase;
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }

                .btn {
                    cursor: pointer;
                    padding: 14px 24px;
                    border-radius: 14px;
                    border: 1px solid rgba(255, 255, 255, .1);
                    background: rgba(255, 255, 255, .05);
                    color: var(--fg);
                    font-weight: 800;
                    font-size: 14px;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .btn:hover {
                    border-color: var(--accent);
                    background: var(--accent-weak);
                    box-shadow: 0 0 20px rgba(34, 197, 94, .1);
                    transform: translateY(-1px);
                }

                .tabs {
                    margin: 32px 0;
                    display: flex;
                    justify-content: center;
                    gap: 48px;
                    border-bottom: 1px solid var(--border);
                }

                .tab {
                    position: relative;
                    padding: 12px 4px 16px;
                    font-weight: 750;
                    color: var(--muted2);
                    font-size: 13px;
                    letter-spacing: .08em;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: color 0.3s;
                }

                .tab:hover { color: var(--fg); }
                .tabActive { color: var(--fg); }
                .tabActive::after {
                    content: "";
                    position: absolute;
                    left: 0; right: 0; bottom: -1px;
                    height: 3px;
                    background: var(--accent);
                    border-radius: 99px 99px 0 0;
                    box-shadow: 0 -4px 12px rgba(34, 197, 94, .4);
                }

                .tabPanel { display: none; max-width: 1000px; margin: 0 auto; animation: fadeIn 0.4s; }
                .tabPanel.active { display: block; }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .card {
                    background: linear-gradient(180deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .02));
                    border: 1px solid var(--border);
                    border-radius: var(--r-xl);
                    backdrop-filter: blur(var(--blur));
                    padding: 32px;
                }

                .statRow {
                    display: grid;
                    grid-template-columns: 1fr 2fr 1fr;
                    align-items: center;
                    text-align: center;
                    padding: 20px 0;
                    border-bottom: 1px solid var(--border);
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .statRow:hover { background: rgba(255, 255, 255, .02); }

                .statVal { font-family: monospace; font-size: 18px; font-weight: 700; color: var(--accent); }
                .statLabel { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }

                .lineupGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
                
                .timeline {
                    position: relative;
                    padding-left: 32px;
                    margin-top: 32px;
                }
                .timeline::before {
                    content: "";
                    position: absolute;
                    left: 7px; top: 0; bottom: 0;
                    width: 2px;
                    background: var(--border);
                }

                .event {
                    position: relative;
                    margin-bottom: 32px;
                }

                .eventCircle {
                    position: absolute;
                    left: -32px;
                    width: 16px; height: 16px;
                    border-radius: 50%;
                    background: var(--bg);
                    border: 3px solid var(--accent);
                    z-index: 2;
                }

                .eventTime { font-family: monospace; font-weight: 800; color: var(--accent); margin-bottom: 4px; display: block;}

                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 44px;
                    height: 24px;
                }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .slider {
                    position: absolute;
                    cursor: pointer;
                    inset: 0;
                    background-color: rgba(255,255,255,0.1);
                    transition: .4s;
                    border-radius: 34px;
                    border: 1px solid var(--border);
                }
                .slider:before {
                    position: absolute;
                    content: "";
                    height: 16px; width: 16px;
                    left: 3px; bottom: 3px;
                    background-color: white;
                    transition: .4s;
                    border-radius: 50%;
                }
                input:checked + .slider { background-color: var(--accent-weak); border-color: var(--accent); }
                input:checked + .slider:before { transform: translateX(20px); background-color: var(--accent); }

                .modal {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 24px;
                }

                .modalContent {
                    background: linear-gradient(180deg, rgba(255, 255, 255, .08), rgba(255, 255, 255, .02));
                    border: 1px solid var(--border);
                    border-radius: var(--r-xl);
                    backdrop-filter: blur(20px);
                    padding: 32px;
                    max-width: 600px;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                }

                /* ===== G22 MODAL - Para Player Options ===== */
                .g22-modal {
                    width: min(640px, calc(100vw - 32px));
                    border-radius: 22px;
                    padding: 22px 22px 18px;
                    background: rgba(18, 18, 18, 0.72);
                    border: 1px solid rgba(255,255,255,.08);
                    box-shadow: 0 22px 80px rgba(0,0,0,.55);
                    backdrop-filter: blur(18px);
                }

                .g22-modal h2 {
                    margin: 0 0 6px;
                    font-size: 28px;
                    font-weight: 800;
                    line-height: 1.15;
                }

                .g22-modal .subtitle {
                    margin: 0 0 14px;
                    opacity: .72;
                    font-size: 14px;
                    line-height: 1.35;
                }

                /* OPTIONS LIST */
                .g22-modal .options {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 8px;
                }

                /* Cada opción: icono + textos (título y descripción) */
                .g22-modal .optionBtn {
                    width: 100%;
                    text-align: left;
                    border-radius: 16px;
                    padding: 14px 16px;
                    background: rgba(255,255,255,.04);
                    border: 1px solid rgba(255,255,255,.07);
                    display: grid;
                    grid-template-columns: 32px 1fr;
                    gap: 14px;
                    align-items: start;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: var(--fg);
                }

                .g22-modal .optionBtn:hover {
                    background: rgba(255,255,255,.08);
                    border-color: rgba(255,255,255,.12);
                    transform: translateY(-1px);
                }

                .g22-modal .optionIcon {
                    width: 32px;
                    height: 32px;
                    display: grid;
                    place-items: center;
                    font-size: 22px;
                    flex: 0 0 32px;
                }

                /* textos */
                .g22-modal .optionTitle {
                    font-size: 16px;
                    font-weight: 800;
                    line-height: 1.15;
                    margin: 0;
                }

                .g22-modal .optionDesc {
                    margin: 6px 0 0;
                    font-size: 13px;
                    line-height: 1.25;
                    opacity: .65;
                }

                /* Evita que spans inline se "pisen" */
                .g22-modal .optionText {
                    min-width: 0;
                }
                .g22-modal .optionText * {
                    display: block;
                }

                /* FOOTER ACTIONS */
                .g22-modal .footerActions {
                    display: flex;
                    gap: 10px;
                    margin-top: 18px;
                }

                .g22-modal .footerActions .btn {
                    flex: 1 1 0;
                    height: 44px;
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,.10);
                    background: rgba(255,255,255,.05);
                    font-weight: 800;
                    justify-content: center;
                }

                .formGroup {
                    margin-bottom: 20px;
                }

                .formGroup label {
                    display: block;
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--muted);
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 8px;
                }

                .formGroup input, .formGroup select {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    color: var(--fg);
                    font-size: 14px;
                }

                .formGroup input:focus, .formGroup select:focus {
                    outline: none;
                    border-color: var(--accent);
                    background: rgba(255, 255, 255, 0.08);
                }

                .backBtn {
                    position: absolute;
                    top: 28px;
                    left: 24px;
                    width: 40px;
                    height: 40px;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    background: rgba(255, 255, 255, .03);
                    color: var(--fg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.3s;
                    z-index: 10;
                }

                .backBtn:hover {
                    background: rgba(255, 255, 255, .08);
                    border-color: var(--accent);
                }

                .timerControls {
                    display: flex;
                    gap: 8px;
                }

                .timerBtn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                    background: rgba(255, 255, 255, .05);
                    color: var(--fg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .timerBtn:hover {
                    background: var(--accent-weak);
                    border-color: var(--accent);
                }

                /* CONTENEDOR del selector de tipos (la grilla de botones) */
                .eventTypeGrid,
                .g22-event-type-grid,
                [data-ui="event-type-grid"] {
                  display: grid;
                  grid-template-columns: repeat(3, minmax(160px, 1fr));
                  gap: 10px;
                  align-items: stretch;
                  max-height: none !important;
                  overflow: visible !important;
                }

                /* Responsive */
                @media (max-width: 900px) {
                  .eventTypeGrid,
                  .g22-event-type-grid,
                  [data-ui="event-type-grid"] {
                    grid-template-columns: repeat(2, minmax(160px, 1fr));
                  }
                }
                @media (max-width: 520px) {
                  .eventTypeGrid,
                  .g22-event-type-grid,
                  [data-ui="event-type-grid"] {
                    grid-template-columns: 1fr;
                  }
                }

                /* BOTÓN de tipo de evento */
                .eventTypeBtn,
                .g22-event-type-btn,
                [data-ui="event-type-btn"] {
                  height: 44px;
                  border-radius: 14px;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 10px;
                  padding: 0 14px;
                  min-width: 0;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  background: rgba(255,255,255,.04);
                  border: 1px solid rgba(255,255,255,.08);
                  color: var(--fg);
                  cursor: pointer;
                  transition: all 0.2s;
                  font-size: 13px;
                  font-weight: 700;
                }

                .eventTypeBtn svg, .eventTypeBtn img {
                  width: 16px;
                  height: 16px;
                  flex: 0 0 16px;
                }

                .eventTypeBtn:hover {
                    background: rgba(255,255,255,.08);
                    border-color: rgba(255,255,255,.15);
                }

                .eventTypeBtn.isActive,
                .g22-event-type-btn.isActive,
                [data-ui="event-type-btn"][aria-selected="true"] {
                  background: rgba(34, 197, 94, .22);
                  border-color: rgba(34, 197, 94, .55);
                  color: #fff;
                }

                .g22-modal-body,
                .modalBody,
                [data-ui="modal-body"] {
                  overflow: visible !important;
                  max-height: none !important;
                }
            `}</style>

            <div className="matchPage">
                <button className="backBtn" onClick={() => {
                    if (match?.tournamentId) {
                        router.push(`/admin/torneo/${match.tournamentId}`);
                    } else {
                        router.back();
                    }
                }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>

                <div className="container">
                    <AdminBreadcrumbs items={[
                        { label: 'Panel', href: '/admin' },
                        { label: 'Torneos', href: '/admin/torneos' },
                        { label: tournament?.name || 'Torneo', href: tournament?.id ? `/admin/torneo/${tournament.id}` : '#' },
                        { label: matchId }
                    ]} />

                    <header className="hero">
                        {/* EQUIPO LOCAL */}
                        <div className="teamSide local">
                            <div className="teamLogoWrap">
                                <div className="teamAvatar">{homeTeam?.logoUrl || '🏠'}</div>
                                <button className="btnEdit" onClick={() => setShowTeamChangeModal('home')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                    </svg>
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                                <span className="badgeRole">Anfitrión</span>
                                <h2 className="teamName">{homeTeam?.name || 'Local'}</h2>
                            </div>
                        </div>

                        {/* SCORE CENTER - FIJO */}
                        <div className="scoreCenter">
                            {isLive && (
                                <div className="chipLive">
                                    <span style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }} />
                                    En Vivo
                                </div>
                            )}
                            <div className="scoreNumbers" onClick={() => setShowScoreEditModal(true)} style={{ cursor: 'pointer' }}>
                                <span className="n">{homeScore}</span>
                                <span className="sep">:</span>
                                <span className="n">{awayScore}</span>
                            </div>
                            <div className="timerPill">
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>{currentPeriod}</span>
                                <span className="timerText">{formatTime(gameTime)}</span>
                                <div className="timerControls">
                                    <button className="timerBtn" onClick={() => setIsTimerRunning(!isTimerRunning)}>
                                        {isTimerRunning ? '⏸' : '▶️'}
                                    </button>
                                    <button className="timerBtn" onClick={() => setGameTime(0)} disabled={isTimerRunning}>
                                        ↺
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>
                                <span>EN VIVO</span>
                                <label className="toggle-switch">
                                    <input type="checkbox" checked={isLive} onChange={handleToggleLive} />
                                    <span className="slider" />
                                </label>
                            </div>
                        </div>

                        {/* EQUIPO VISITANTE */}
                        <div className="teamSide visitor">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', minWidth: 0 }}>
                                <span className="badgeRole">Visitante</span>
                                <h2 className="teamName">{awayTeam?.name || 'Visitante'}</h2>
                            </div>
                            <div className="teamLogoWrap">
                                <div className="teamAvatar">{awayTeam?.logoUrl || '⚽'}</div>
                                <button className="btnEdit" onClick={() => setShowTeamChangeModal('away')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </header>

                    <nav className="tabs">
                        <div className={`tab ${currentTab === 'prepartido' ? 'tabActive' : ''}`} onClick={() => setCurrentTab('prepartido')}>Pre-Partido</div>
                        <div className={`tab ${currentTab === 'alineaciones' ? 'tabActive' : ''}`} onClick={() => setCurrentTab('alineaciones')}>Alineaciones</div>
                        <div className={`tab ${currentTab === 'timeline' ? 'tabActive' : ''}`} onClick={() => setCurrentTab('timeline')}>Línea de Tiempo</div>
                        <div className={`tab ${currentTab === 'puntos' ? 'tabActive' : ''}`} onClick={() => setCurrentTab('puntos')}>Puntos</div>
                    </nav>

                    <main>
                        <div className={`tabPanel ${currentTab === 'prepartido' ? 'active' : ''}`}>
                            <div className="card">
                                <h3 style={{ marginBottom: '24px', fontWeight: 850, fontSize: '18px' }}>Estadísticas del Partido</h3>
                                <div onClick={() => setShowStatEditModal(true)} style={{ cursor: 'pointer' }}>
                                    {stats.map((stat, idx) => (
                                        <div key={stat.id} className="statRow" style={idx === stats.length - 1 ? { borderBottom: 'none' } : {}}>
                                            <span className="statVal">{stat.home}{stat.unit}</span>
                                            <span className="statLabel">{stat.label}</span>
                                            <span className="statVal">{stat.away}{stat.unit}</span>
                                        </div>
                                    ))}
                                </div>
                                <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--muted)' }}>
                                    Click para editar estadísticas
                                </p>
                            </div>
                        </div>

                        <div className={`tabPanel ${currentTab === 'alineaciones' ? 'active' : ''}`}>
                            <div className="card">
                                <div className="lineupGrid">
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                            <h4 style={{ fontWeight: 800 }}>{homeTeam?.name || 'Local'}</h4>
                                            <button className="btn" style={{ padding: '8px 16px', fontSize: '11px' }} onClick={() => setShowPlayerOptionsModal('home')}>
                                                ➕ JUGADOR
                                            </button>
                                        </div>
                                        {homePlayers.length === 0 ? (
                                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted2)', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                                                <p style={{ fontSize: '13px' }}>Sin jugadores asignados</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {homePlayers.map((player, idx) => (
                                                    <div key={idx} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>#{player.number} {player.name}</span>
                                                        <button onClick={() => setHomePlayers(homePlayers.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                            <h4 style={{ fontWeight: 800 }}>{awayTeam?.name || 'Visitante'}</h4>
                                            <button className="btn" style={{ padding: '8px 16px', fontSize: '11px' }} onClick={() => setShowPlayerOptionsModal('away')}>
                                                ➕ JUGADOR
                                            </button>
                                        </div>
                                        {awayPlayers.length === 0 ? (
                                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted2)', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                                                <p style={{ fontSize: '13px' }}>Sin jugadores asignados</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {awayPlayers.map((player, idx) => (
                                                    <div key={idx} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>#{player.number} {player.name}</span>
                                                        <button onClick={() => setAwayPlayers(awayPlayers.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`tabPanel ${currentTab === 'timeline' ? 'active' : ''}`}>
                            <div className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h3 style={{ fontWeight: 850, fontSize: '18px' }}>Sucesos del Partido</h3>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="btn" onClick={() => {
                                            setEditingEventId(null);
                                            setEventData({ team: '', type: '', player: '', minute: Math.floor(gameTime / 60), detail: '' });
                                            setShowEventModal(true);
                                        }}>
                                            ➕ EVENTO
                                        </button>
                                        <button className="btn" onClick={() => setShowPeriodModal(true)}>
                                            ⏱️ PERIODO
                                        </button>
                                    </div>
                                </div>

                                {events.length === 0 ? (
                                    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted2)', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                                        <p>No hay eventos registrados aún</p>
                                    </div>
                                ) : (
                                    <div className="timeline">
                                        {events.map(event => (
                                            <div key={event.id} className="event">
                                                <div className="eventCircle" style={{ borderColor: event.type.includes('card') ? '#ef4444' : event.type === 'goal' || event.type === 'try' ? '#fbbf24' : 'var(--accent)' }} />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <span className="eventTime">{event.time} {event.period && `(${event.period})`}</span>
                                                        <div style={{ fontWeight: 700, fontSize: '15px' }}>{event.description}</div>
                                                        <div style={{ color: 'var(--muted)', fontSize: '13px' }}>{event.detail}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handleEditEvent(event)}
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '8px',
                                                                color: 'var(--fg)',
                                                                padding: '6px 10px',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                fontWeight: 700,
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseOver={(e) => {
                                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                                e.currentTarget.style.borderColor = 'var(--fg)';
                                                            }}
                                                            onMouseOut={(e) => {
                                                                e.currentTarget.style.background = 'transparent';
                                                                e.currentTarget.style.borderColor = 'var(--border)';
                                                            }}
                                                        >
                                                            ✏️ Editar
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteEvent(event.id)}
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '8px',
                                                                color: '#ef4444',
                                                                padding: '6px 10px',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                fontWeight: 700,
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseOver={(e) => {
                                                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                                                e.currentTarget.style.borderColor = '#ef4444';
                                                            }}
                                                            onMouseOut={(e) => {
                                                                e.currentTarget.style.background = 'transparent';
                                                                e.currentTarget.style.borderColor = 'var(--border)';
                                                            }}
                                                        >
                                                            🗑️ Eliminar
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={`tabPanel ${currentTab === 'puntos' ? 'active' : ''}`}>
                            <div className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h3 style={{ fontWeight: 850, fontSize: '18px' }}>Puntos del Partido</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <input
                                            type="checkbox"
                                            id="manualMode"
                                            checked={isPointsManual}
                                            onChange={(e) => setIsPointsManual(e.target.checked)}
                                        />
                                        <label htmlFor="manualMode" style={{ cursor: 'pointer', fontWeight: 600 }}>Edición Manual</label>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                    {/* Home Points */}
                                    <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                                        <h4 style={{ marginBottom: '16px', fontWeight: 800, fontSize: '16px', color: 'var(--accent)' }}>{homeTeam?.name || 'Local'}</h4>
                                        <div className="formGroup">
                                            <label>Puntos Partido</label>
                                            <input
                                                type="number"
                                                value={points.home}
                                                disabled={!isPointsManual}
                                                onChange={(e) => setPoints({ ...points, home: parseInt(e.target.value) || 0 })}
                                                style={{ fontSize: '18px', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div className="formGroup">
                                            <label>Puntos Bonus</label>
                                            <input
                                                type="number"
                                                value={points.homeBonus}
                                                disabled={!isPointsManual}
                                                onChange={(e) => setPoints({ ...points, homeBonus: parseInt(e.target.value) || 0 })}
                                                style={{ fontSize: '18px', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600 }}>TOTAL</span>
                                            <span style={{ fontSize: '24px', fontWeight: 900 }}>{points.home + points.homeBonus}</span>
                                        </div>
                                    </div>

                                    {/* Away Points */}
                                    <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                                        <h4 style={{ marginBottom: '16px', fontWeight: 800, fontSize: '16px', color: 'var(--accent)' }}>{awayTeam?.name || 'Visitante'}</h4>
                                        <div className="formGroup">
                                            <label>Puntos Partido</label>
                                            <input
                                                type="number"
                                                value={points.away}
                                                disabled={!isPointsManual}
                                                onChange={(e) => setPoints({ ...points, away: parseInt(e.target.value) || 0 })}
                                                style={{ fontSize: '18px', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div className="formGroup">
                                            <label>Puntos Bonus</label>
                                            <input
                                                type="number"
                                                value={points.awayBonus}
                                                disabled={!isPointsManual}
                                                onChange={(e) => setPoints({ ...points, awayBonus: parseInt(e.target.value) || 0 })}
                                                style={{ fontSize: '18px', fontWeight: 700 }}
                                            />
                                        </div>
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600 }}>TOTAL</span>
                                            <span style={{ fontSize: '24px', fontWeight: 900 }}>{points.away + points.awayBonus}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    {/* Event Modal */}
                    {/* Event Modal */}
                    {
                        showEventModal && (
                            <div className="modal" onClick={() => setShowEventModal(false)}>
                                <div className="modalContent g22-modal-body" onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '8px', fontWeight: 800, fontSize: '20px' }}>{editingEventId ? 'Editar Evento' : 'Registrar Evento'}</h3>
                                    <p style={{ marginBottom: '24px', color: 'var(--muted)', fontSize: '14px' }}>Deporte: {sport}</p>

                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                                        <div className="formGroup">
                                            <label>Equipo</label>
                                            <select value={eventData.team} onChange={(e) => setEventData({ ...eventData, team: e.target.value })}>
                                                <option value="">Seleccionar equipo</option>
                                                <option value="home">{homeTeam?.name || 'Local'}</option>
                                                <option value="away">{awayTeam?.name || 'Visitante'}</option>
                                            </select>
                                        </div>
                                        <div className="formGroup">
                                            <label>Minuto</label>
                                            <input
                                                type="number"
                                                value={eventData.minute}
                                                onChange={(e) => setEventData({ ...eventData, minute: parseInt(e.target.value) || 0 })}
                                                min="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="formGroup">
                                        <label>Tipo de Evento</label>
                                        <div className="eventTypeGrid">
                                            {sportEvents.map(type => (
                                                <button
                                                    key={type.id}
                                                    onClick={() => setEventData({ ...eventData, type: type.id })}
                                                    className={`eventTypeBtn ${eventData.type === type.id ? 'isActive' : ''}`}
                                                >
                                                    {type.icon} {type.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="formGroup">
                                        <label>Jugador (opcional)</label>
                                        {eventData.team && (eventData.team === 'home' ? homePlayers : awayPlayers).length > 0 && (
                                            <select
                                                style={{ marginBottom: '8px' }}
                                                onChange={(e) => setEventData({ ...eventData, player: e.target.value })}
                                                value={(eventData.team === 'home' ? homePlayers : awayPlayers).some(p => `${p.name} (#${p.number})` === eventData.player) ? eventData.player : ''}
                                            >
                                                <option value="">-- Seleccionar de la lista --</option>
                                                {(eventData.team === 'home' ? homePlayers : awayPlayers).map((p, i) => (
                                                    <option key={i} value={`${p.name} (#${p.number})`}>
                                                        #{p.number} {p.name}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        <input
                                            type="text"
                                            placeholder="O escribir nombre manualmente"
                                            value={eventData.player}
                                            onChange={(e) => setEventData({ ...eventData, player: e.target.value })}
                                        />
                                    </div>

                                    <div className="formGroup">
                                        <label>Detalle (opcional)</label>
                                        <input type="text" placeholder="Descripción adicional" value={eventData.detail} onChange={(e) => setEventData({ ...eventData, detail: e.target.value })} />
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowEventModal(false)}>Cancelar</button>
                                        <button className="btn" style={{ flex: 1, background: 'var(--accent)', color: '#000', justifyContent: 'center' }} onClick={editingEventId ? handleUpdateEvent : handleAddEvent} disabled={!eventData.team || !eventData.type}>
                                            {editingEventId ? 'Guardar Cambios' : 'Agregar Evento'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {/* Score Edit Modal */}
                    {
                        showScoreEditModal && (
                            <div className="modal" onClick={() => setShowScoreEditModal(false)}>
                                <div className="modalContent" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Editar Marcador</h3>
                                    <div style={{ display: 'grid', gap: '20px' }}>
                                        <div className="formGroup">
                                            <label>{homeTeam?.name || 'Local'}</label>
                                            <input type="number" value={homeScore} onChange={(e) => setHomeScore(parseInt(e.target.value) || 0)} />
                                        </div>
                                        <div className="formGroup">
                                            <label>{awayTeam?.name || 'Visitante'}</label>
                                            <input type="number" value={awayScore} onChange={(e) => setAwayScore(parseInt(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '24px', background: 'var(--accent)', color: '#000' }} onClick={() => setShowScoreEditModal(false)}>
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    {/* Period Modal */}
                    {
                        showPeriodModal && (
                            <div className="modal" onClick={() => setShowPeriodModal(false)}>
                                <div className="modalContent" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Gestionar Periodos</h3>

                                    <div style={{ display: 'grid', gap: '16px' }}>
                                        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: '12px' }}>
                                                Periodo Actual: <span style={{ color: 'var(--accent)' }}>{currentPeriod}</span>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                <button
                                                    className="btn"
                                                    style={{ justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}
                                                    onClick={() => handleAddPeriodEvent(currentPeriod, 'end')}
                                                >
                                                    ⏸️ Finalizar {currentPeriod}
                                                </button>
                                                <button
                                                    className="btn"
                                                    style={{ justifyContent: 'center', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                                    onClick={() => handleAddPeriodEvent('FT', 'start')}
                                                >
                                                    🏁 Finalizar Partido
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: '12px' }}>
                                                Iniciar Nuevo Periodo
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                {getPeriodsForSport(sport).map(p => (
                                                    <button
                                                        key={p}
                                                        className="btn"
                                                        style={{
                                                            justifyContent: 'center',
                                                            opacity: currentPeriod === p ? 0.5 : 1,
                                                            borderColor: currentPeriod === p ? 'var(--accent)' : 'rgba(255,255,255,0.1)'
                                                        }}
                                                        onClick={() => handleAddPeriodEvent(p, 'start')}
                                                    >
                                                        ▶️ {periodLabels[p] || p}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '24px' }} onClick={() => setShowPeriodModal(false)}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    {/* Player Options Modal */}
                    {
                        showPlayerOptionsModal && (
                            <div className="modal" onClick={() => setShowPlayerOptionsModal(null)}>
                                <div className="g22-modal" onClick={(e) => e.stopPropagation()}>
                                    <h2>Agregar Jugadores</h2>
                                    <div className="subtitle">
                                        Selecciona cómo deseas agregar jugadores a {showPlayerOptionsModal === 'home' ? homeTeam?.name : awayTeam?.name}
                                    </div>

                                    <div className="options">
                                        <button
                                            className="optionBtn"
                                            onClick={() => {
                                                setShowImportPlayerModal(showPlayerOptionsModal);
                                                setShowPlayerOptionsModal(null);
                                            }}
                                        >
                                            <span className="optionIcon">👤</span>
                                            <span className="optionText">
                                                <span className="optionTitle">Importar Jugador</span>
                                                <span className="optionDesc">Seleccionar jugadores de la base de datos</span>
                                            </span>
                                        </button>

                                        <button
                                            className="optionBtn"
                                            onClick={() => {
                                                setShowImportTemplateModal(showPlayerOptionsModal);
                                                setShowPlayerOptionsModal(null);
                                            }}
                                        >
                                            <span className="optionIcon">📋</span>
                                            <span className="optionText">
                                                <span className="optionTitle">Importar Plantilla</span>
                                                <span className="optionDesc">Cargar una plantilla previamente guardada</span>
                                            </span>
                                        </button>

                                        <button
                                            className="optionBtn"
                                            onClick={() => {
                                                setShowCreatePlayerModal(showPlayerOptionsModal);
                                                setShowPlayerOptionsModal(null);
                                            }}
                                        >
                                            <span className="optionIcon">✏️</span>
                                            <span className="optionText">
                                                <span className="optionTitle">Crear Jugador</span>
                                                <span className="optionDesc">Crear un nuevo jugador manualmente</span>
                                            </span>
                                        </button>
                                    </div>

                                    <div className="footerActions">
                                        <button className="btn" onClick={() => setShowPlayerOptionsModal(null)}>
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {/* Import Player Modal */}
                    {
                        showImportPlayerModal && (
                            <div className="modal" onClick={() => setShowImportPlayerModal(null)}>
                                <div className="modalContent" onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Importar Jugador</h3>
                                    <div style={{ marginBottom: '20px' }}>
                                        <input
                                            type="text"
                                            placeholder="Buscar jugador..."
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                color: 'var(--fg)',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                                        {availablePlayers.map(player => (
                                            <button
                                                key={player.id}
                                                onClick={() => {
                                                    const newPlayer = { name: player.name, number: player.number, position: player.position };
                                                    if (showImportPlayerModal === 'home') setHomePlayers([...homePlayers, newPlayer]);
                                                    else setAwayPlayers([...awayPlayers, newPlayer]);
                                                    setShowImportPlayerModal(null);
                                                }}
                                                style={{
                                                    padding: '16px',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '12px',
                                                    color: 'var(--fg)',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>#{player.number} {player.name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{player.position}</div>
                                                </div>
                                                <div style={{ fontSize: '18px' }}>→</div>
                                            </button>
                                        ))}
                                    </div>
                                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '20px' }} onClick={() => setShowImportPlayerModal(null)}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    {/* Import Template Modal */}
                    {
                        showImportTemplateModal && (
                            <div className="modal" onClick={() => setShowImportTemplateModal(null)}>
                                <div className="modalContent" onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Importar Plantilla</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {availableTemplates.map(template => (
                                            <button
                                                key={template.id}
                                                onClick={() => {
                                                    // TODO: Implement template loading logic
                                                    console.log('Loading template:', template.name);
                                                    setShowImportTemplateModal(null);
                                                }}
                                                style={{
                                                    padding: '20px',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '12px',
                                                    color: 'var(--fg)',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 800, marginBottom: '6px' }}>{template.name}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{template.playerCount} jugadores</div>
                                                    </div>
                                                    <div style={{ fontSize: '24px' }}>📋</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '24px' }} onClick={() => setShowImportTemplateModal(null)}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    {/* Create Player Modal */}
                    {
                        showCreatePlayerModal && (
                            <div className="modal" onClick={() => setShowCreatePlayerModal(null)}>
                                <div className="modalContent" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Crear Jugador</h3>
                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        const formData = new FormData(e.target as HTMLFormElement);
                                        const player = {
                                            name: formData.get('name') as string,
                                            number: parseInt(formData.get('number') as string),
                                            position: formData.get('position') as string
                                        };
                                        if (showCreatePlayerModal === 'home') setHomePlayers([...homePlayers, player]);
                                        else setAwayPlayers([...awayPlayers, player]);
                                        setShowCreatePlayerModal(null);
                                    }}>
                                        <div className="formGroup">
                                            <label>Número</label>
                                            <input type="number" name="number" required />
                                        </div>
                                        <div className="formGroup">
                                            <label>Nombre</label>
                                            <input type="text" name="name" required />
                                        </div>
                                        <div className="formGroup">
                                            <label>Posición</label>
                                            <input type="text" name="position" placeholder="Ej: Centro, Wing, etc." />
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                            <button type="button" className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowCreatePlayerModal(null)}>Cancelar</button>
                                            <button type="submit" className="btn" style={{ flex: 1, background: 'var(--accent)', color: '#000', justifyContent: 'center' }}>Crear</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )
                    }

                    {/* Stats Edit Modal - Simplified placeholder */}
                    {/* Stats Edit Modal */}
                    {/* Stats Edit Modal */}
                    {
                        showStatEditModal && (
                            <div className="modal" onClick={() => setShowStatEditModal(false)}>
                                <div className="modalContent" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Editar Estadísticas</h3>

                                    <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '16px', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                                            <div>Estadística</div>
                                            <div style={{ textAlign: 'center' }}>{homeTeam?.name || 'Local'}</div>
                                            <div style={{ textAlign: 'center' }}>{awayTeam?.name || 'Visitante'}</div>
                                            <div></div>
                                        </div>

                                        {stats.map((stat, idx) => (
                                            <div key={stat.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                                                <input
                                                    type="text"
                                                    value={stat.label}
                                                    onChange={(e) => {
                                                        const newStats = [...stats];
                                                        newStats[idx].label = e.target.value;
                                                        setStats(newStats);
                                                    }}
                                                    style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--fg)' }}
                                                    placeholder="Nombre estadística"
                                                />
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        type="number"
                                                        value={stat.home}
                                                        onChange={(e) => {
                                                            const newStats = [...stats];
                                                            newStats[idx].home = parseFloat(e.target.value) || 0;
                                                            setStats(newStats);
                                                        }}
                                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--fg)', textAlign: 'center' }}
                                                    />
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        type="number"
                                                        value={stat.away}
                                                        onChange={(e) => {
                                                            const newStats = [...stats];
                                                            newStats[idx].away = parseFloat(e.target.value) || 0;
                                                            setStats(newStats);
                                                        }}
                                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--fg)', textAlign: 'center' }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => setStats(stats.filter((_, i) => i !== idx))}
                                                    style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}

                                        <button
                                            onClick={() => setStats([...stats, { id: `stat-${Date.now()}`, label: '', home: 0, away: 0, unit: '' }])}
                                            style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '12px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                                        >
                                            + Agregar Estadística
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowStatEditModal(false)}>Cerrar</button>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {/* Team Change Modal - Simplified placeholder */}
                    {
                        showTeamChangeModal && (
                            <div className="modal" onClick={() => setShowTeamChangeModal(null)}>
                                <div className="modalContent" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                                    <h3 style={{ marginBottom: '24px', fontWeight: 800 }}>Cambiar Equipo {showTeamChangeModal === 'home' ? 'Local' : 'Visitante'}</h3>
                                    <p style={{ color: 'var(--muted)', marginBottom: '20px' }}>Funcionalidad de cambio de equipo próximamente...</p>
                                    <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowTeamChangeModal(null)}>Cerrar</button>
                                </div>
                            </div>
                        )
                    }
                </div>
            </div>
        </>
    );
}
