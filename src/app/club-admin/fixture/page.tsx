
'use client';

import { useMemo, useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

type MatchStatus = 'scheduled' | 'live' | 'final' | 'suspended' | 'cancelled';
type MatchOrigin = 'official' | 'provisional' | 'club';
type MatchType = 'official' | 'provisional' | 'friendly' | 'internal' | 'training' | 'exhibition';

type LinkStatus = 'unlinked' | 'linked' | 'replaced';

interface MatchRow {
    id: number;
    date: string;
    time: string;
    home: string;
    away: string;
    division: string;
    venue: string;
    status: MatchStatus;
    scoreH: number;
    scoreA: number;
    origin: MatchOrigin;
    competition: string;
    round: string;
    linkStatus?: LinkStatus;
}

const mockOfficialMatches: MatchRow[] = [
    { id: 1, date: '2026-02-15', time: '15:30', home: 'SIC', away: 'CASI', division: 'Primera', venue: 'Sede SIC', status: 'scheduled', scoreH: 0, scoreA: 0, origin: 'official', competition: 'URBA Top 12', round: 'Fecha 3', linkStatus: 'linked' },
    { id: 2, date: '2026-02-15', time: '14:00', home: 'SIC', away: 'CASI', division: 'Reserva', venue: 'Sede SIC', status: 'scheduled', scoreH: 0, scoreA: 0, origin: 'official', competition: 'URBA Top 12', round: 'Fecha 3', linkStatus: 'linked' },
    { id: 3, date: '2026-02-15', time: '12:30', home: 'SIC', away: 'CASI', division: 'M19', venue: 'Sede SIC', status: 'scheduled', scoreH: 0, scoreA: 0, origin: 'official', competition: 'URBA Top 12', round: 'Fecha 3', linkStatus: 'linked' },
    { id: 4, date: '2026-02-08', time: '15:30', home: 'HINDU', away: 'SIC', division: 'Primera', venue: 'Don Torcuato', status: 'final', scoreH: 17, scoreA: 24, origin: 'official', competition: 'URBA Top 12', round: 'Fecha 2', linkStatus: 'linked' },
];

const mockProvisionalMatches: MatchRow[] = [
    { id: 80, date: '2026-02-20', time: '19:00', home: 'SIC', away: 'Club Libre', division: 'Primera', venue: 'Sede SIC', status: 'scheduled', scoreH: 0, scoreA: 0, origin: 'provisional', competition: 'A definir por federacion', round: 'Provisorio', linkStatus: 'unlinked' },
];

const mockClubMatches: MatchRow[] = [
    { id: 101, date: '2026-02-21', time: '11:00', home: 'SIC', away: 'Club Libre', division: 'Primera', venue: 'Sede SIC', status: 'scheduled', scoreH: 0, scoreA: 0, origin: 'club', competition: 'Amistoso', round: 'Pretemporada' },
    { id: 102, date: '2026-02-18', time: '20:00', home: 'SIC', away: 'Entrenamiento Interno', division: 'M19', venue: 'Sede SIC', status: 'scheduled', scoreH: 0, scoreA: 0, origin: 'club', competition: 'Interno', round: 'Entrenamiento' },
];

const statusLabels: Record<MatchStatus, { label: string; cls: string }> = {
    scheduled: { label: 'Programado', cls: 'badgeInfo' },
    live: { label: 'En vivo', cls: 'badgeDanger' },
    final: { label: 'Finalizado', cls: 'badgeNeutral' },
    suspended: { label: 'Suspendido', cls: 'badgeWarning' },
    cancelled: { label: 'Cancelado', cls: 'badgeDanger' },
};

const originLabels: Record<MatchOrigin, { label: string; cls: string }> = {
    official: { label: 'OFICIAL', cls: 'badgeInfo' },
    provisional: { label: 'PROVISORIO', cls: 'badgeWarning' },
    club: { label: 'CLUB', cls: 'badgeNeutral' },
};

const typeLabels: Record<MatchType, { label: string; badge: string }> = {
    official: { label: 'Oficial (Club)', badge: 'badgeInfo' },
    provisional: { label: 'Provisorio', badge: 'badgeWarning' },
    friendly: { label: 'Amistoso', badge: 'badgeNeutral' },
    internal: { label: 'Interno', badge: 'badgeNeutral' },
    training: { label: 'Entrenamiento', badge: 'badgeNeutral' },
    exhibition: { label: 'Exhibicion', badge: 'badgeNeutral' },
};

interface CreateMatchForm {
    division: string;
    season: string;
    type: MatchType;
    homeClub: string;
    awayClub: string;
    date: string;
    time: string;
    venue: string;
    homeAway: 'Local' | 'Visitante';
    format: string;
    regulation: string;
    duration: string;
    notes: string;
}
const clubName = 'San Isidro Club';
const MOCK_PLAYERS = [
    { id: 1, name: 'Santiago Arata', position: 'Medio scrum', division: 'Primera' },
    { id: 2, name: 'Tomás Etcheverry', position: 'Apertura', division: 'Primera' },
    { id: 3, name: 'Bruno Ledesma', position: 'Centro', division: 'Primera' },
    { id: 4, name: 'Facundo Rivas', position: 'Wing', division: 'Primera' },
    { id: 5, name: 'Nicolás Díaz', position: 'Pilar', division: 'Reserva' },
    { id: 6, name: 'Gonzalo Pérez', position: 'Hooker', division: 'Reserva' },
    { id: 7, name: 'Matías Fuentes', position: 'Segunda línea', division: 'Reserva' },
    { id: 8, name: 'Alejo Suárez', position: 'Tercera línea', division: 'M19' },
    { id: 9, name: 'Ignacio Duarte', position: 'Fullback', division: 'M19' },
    { id: 10, name: 'Franco Medina', position: 'Centro', division: 'M19' },
];

export default function ClubFixturePage() {
    const federationLinked = true;
    const tournamentsLoaded = false;
    const allowProvisional = federationLinked && !tournamentsLoaded;

    const [tab, setTab] = useState<MatchOrigin>('official');
    const [filter, setFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [competitionFilter, setCompetitionFilter] = useState<string>('all');
    const [clubMatches, setClubMatches] = useState<MatchRow[]>(mockClubMatches);
    const [provisionalMatches, setProvisionalMatches] = useState<MatchRow[]>(mockProvisionalMatches);

    const [showCreate, setShowCreate] = useState(false);
    const [actionModal, setActionModal] = useState<{ open: boolean; mode: 'view' | 'convocar' | 'comunicar'; match: MatchRow | null }>({ open: false, mode: 'view', match: null });
    const [convocationModal, setConvocationModal] = useState<{ open: boolean; match: MatchRow | null }>({ open: false, match: null });
    const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
    const [convocationNotice, setConvocationNotice] = useState<string | null>(null);
    const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
    const [createContext, setCreateContext] = useState<MatchOrigin>('club');
    const [formStep, setFormStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [form, setForm] = useState<CreateMatchForm>({
        division: 'Primera',
        season: '2026',
        type: 'friendly',
        homeClub: clubName,
        awayClub: '',
        date: '',
        time: '',
        venue: '',
        homeAway: 'Local',
        format: '15',
        regulation: federationLinked ? 'Heredado por federacion' : '',
        duration: '40',
        notes: '',
    });

    const competitions = useMemo(() => {
        return Array.from(new Set(mockOfficialMatches.map((m) => m.competition)));
    }, []);

    const baseMatches = tab === 'official'
        ? (allowProvisional ? [...mockOfficialMatches, ...provisionalMatches] : mockOfficialMatches)
        : clubMatches;

    const filtered = baseMatches.filter((m) => {
        const matchDiv = filter === 'all' || m.division === filter;
        const matchStatus = statusFilter === 'all' || m.status === statusFilter;
        const matchCompetition = tab === 'club' || competitionFilter === 'all' || m.competition === competitionFilter;
        return matchDiv && matchStatus && matchCompetition;
    });

    const openCreate = (context: MatchOrigin) => {
        const provisionalFlow = federationLinked && !tournamentsLoaded && context === 'official';
        const defaultType: MatchType = provisionalFlow ? 'provisional' : federationLinked ? 'friendly' : 'official';
        setCreateContext(context);
        setEditingMatchId(null);
        setFormStep(1);
        setForm({
            division: 'Primera',
            season: '2026',
            type: defaultType,
            homeClub: clubName,
            awayClub: '',
            date: '',
            time: '',
            venue: '',
            homeAway: 'Local',
            format: '15',
            regulation: federationLinked ? 'Heredado por federacion' : '',
            duration: '40',
            notes: '',
        });
        setShowCreate(true);
    };

    const updateField = (field: keyof CreateMatchForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const isClubTeam = (team: string) => team === clubName || team === 'SIC';

    const guessTypeFromMatch = (match: MatchRow): MatchType => {
        if (match.origin === 'provisional') return 'provisional';
        const label = match.competition.toLowerCase();
        if (label.includes('amistoso')) return 'friendly';
        if (label.includes('interno')) return 'internal';
        if (label.includes('entrenamiento')) return 'training';
        if (label.includes('exhibicion')) return 'exhibition';
        if (label.includes('oficial')) return 'official';
        return 'friendly';
    };

    const openAction = (mode: 'view' | 'convocar' | 'comunicar', match: MatchRow) => {
        setActionModal({ open: true, mode, match });
    };

    const closeAction = () => {
        setActionModal({ open: false, mode: 'view', match: null });
    };

    const openConvocation = (match: MatchRow) => {
        setSelectedPlayers([]);
        setConvocationModal({ open: true, match });
        setActionModal({ open: false, mode: 'view', match: null });
    };

    const getPlayersForDivision = (division?: string) => {
        if (!division) return MOCK_PLAYERS;
        return MOCK_PLAYERS.filter((player) => player.division.toLowerCase() === division.toLowerCase());
    };

    const togglePlayer = (id: number) => {
        setSelectedPlayers((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    };

    const toggleAllPlayers = (availablePlayers: typeof MOCK_PLAYERS) => {
        setSelectedPlayers((prev) => (prev.length === availablePlayers.length ? [] : availablePlayers.map((p) => p.id)));
    };

    const handleSendConvocation = () => {
        if (!convocationModal.match) return;
        const count = selectedPlayers.length;
        const matchLabel = `${convocationModal.match.home} vs ${convocationModal.match.away}`;
        const when = `${convocationModal.match.date} ${convocationModal.match.time}`;
        setConvocationNotice(`Convocatoria enviada a ${count} jugadores para ${matchLabel} (${when}).`);
        setConvocationModal({ open: false, match: null });
    };

    const startEdit = (match: MatchRow) => {
        const inferredType = guessTypeFromMatch(match);
        const homeIsClub = isClubTeam(match.home);
        setCreateContext(match.origin === 'provisional' ? 'official' : 'club');
        setEditingMatchId(match.id);
        setFormStep(1);
        setForm({
            division: match.division,
            season: '2026',
            type: inferredType,
            homeClub: clubName,
            awayClub: homeIsClub ? match.away : match.home,
            date: match.date,
            time: match.time,
            venue: match.venue,
            homeAway: homeIsClub ? 'Local' : 'Visitante',
            format: form.format,
            regulation: form.regulation,
            duration: form.duration,
            notes: form.notes,
        });
        setShowCreate(true);
    };

    const handleDelete = (match: MatchRow) => {
        if (!confirm('Eliminar partido del club?')) return;
        if (match.origin === 'provisional') {
            setProvisionalMatches((prev) => prev.filter((m) => m.id !== match.id));
            return;
        }
        if (match.origin === 'club') {
            setClubMatches((prev) => prev.filter((m) => m.id !== match.id));
        }
    };

    const handleCreate = () => {
        const id = editingMatchId ?? Date.now();
        const origin: MatchOrigin = form.type === 'provisional' ? 'provisional' : 'club';
        const newMatch: MatchRow = {
            id,
            date: form.date || '2026-02-28',
            time: form.time || '15:30',
            home: form.homeAway === 'Local' ? clubName : form.awayClub || 'Rival externo',
            away: form.homeAway === 'Local' ? (form.awayClub || 'Rival externo') : clubName,
            division: form.division,
            venue: form.venue || 'Sede a definir',
            status: 'scheduled',
            scoreH: 0,
            scoreA: 0,
            origin,
            competition: form.type === 'provisional' ? 'A definir por federacion' : typeLabels[form.type].label,
            round: form.type === 'provisional' ? 'Provisorio' : 'Club',
            linkStatus: form.type === 'provisional' ? 'unlinked' : undefined,
        };

        if (editingMatchId) {
            if (origin === 'provisional') {
                setProvisionalMatches((prev) => prev.map((m) => (m.id === id ? newMatch : m)));
                setTab('official');
            } else {
                setClubMatches((prev) => prev.map((m) => (m.id === id ? newMatch : m)));
                setTab('club');
            }
        } else if (form.type === 'provisional') {
            setProvisionalMatches((prev) => [newMatch, ...prev]);
            setTab('official');
        } else {
            setClubMatches((prev) => [newMatch, ...prev]);
            setTab('club');
        }
        setShowCreate(false);
        setEditingMatchId(null);
    };

    const typeOptions: MatchType[] = (() => {
        if (createContext === 'official') {
            return ['provisional'];
        }
        if (federationLinked) {
            return ['friendly', 'internal', 'training', 'exhibition'];
        }
        return ['official', 'friendly', 'internal', 'training', 'exhibition'];
    })();

    return (
        <SectionShell
            title="Partidos / Fixture"
            subtitle="Oficiales heredados y partidos propios del club."
            actions={
                <>
                    {tab === 'official' && allowProvisional && (
                        <button className={styles.btn} type="button" onClick={() => openCreate('official')}>
                            Crear provisorio
                        </button>
                    )}
                    {tab === 'club' && (
                        <button className={styles.btn} type="button" onClick={() => openCreate('club')}>
                            Crear partido
                        </button>
                    )}
                </>
            }
        >
            <div className={styles.callout} style={{ marginBottom: 16 }}>
                <span className={styles.calloutTitle}>Vinculacion federativa</span>
                <p>Federacion vinculada: <strong>{federationLinked ? 'Si' : 'No'}</strong> {'\u00B7'} Torneos cargados: <strong>{tournamentsLoaded ? 'Si' : 'No'}</strong></p>
                <p>Si el fixture oficial aparece, los partidos provisorios se vinculan o reemplazan automaticamente.</p>
            </div>

            <div className={styles.tabs} style={{ marginBottom: 16 }}>
                {(['official', 'club'] as MatchOrigin[]).map((t) => (
                    <button
                        key={t}
                        className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                        onClick={() => {
                            setTab(t);
                            setCompetitionFilter('all');
                        }}
                        type="button"
                    >
                        {t === 'official' ? 'Oficiales' : 'Amistosos'}
                    </button>
                ))}
            </div>

            {tab === 'official' && (
                <div className={styles.callout} style={{ marginBottom: 16 }}>
                    <span className={styles.calloutTitle}>Partidos oficiales</span>
                    <p>El club no crea ni edita partidos oficiales. Solo puede vincular, convocar y comunicar.</p>
                </div>
            )}

            <div className={styles.tabs}>
                {['all', 'Primera', 'Reserva', 'M19'].map((t) => (
                    <button key={t} className={`${styles.tab} ${filter === t ? styles.tabActive : ''}`} onClick={() => setFilter(t)} type="button">
                        {t === 'all' ? 'Todas' : t}
                    </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {tab === 'official' && (
                        <button
                            className={`${styles.tab} ${competitionFilter === 'all' ? styles.tabActive : ''}`}
                            onClick={() => setCompetitionFilter('all')}
                            type="button"
                        >
                            Todas las competencias
                        </button>
                    )}
                    {tab === 'official' && competitions.map((comp) => (
                        <button
                            key={comp}
                            className={`${styles.tab} ${competitionFilter === comp ? styles.tabActive : ''}`}
                            onClick={() => setCompetitionFilter(comp)}
                            type="button"
                        >
                            {comp}
                        </button>
                    ))}
                    {['all', 'scheduled', 'final'].map((s) => (
                        <button key={s} className={`${styles.tab} ${statusFilter === s ? styles.tabActive : ''}`} onClick={() => setStatusFilter(s)} type="button">
                            {s === 'all' ? 'Todos' : s === 'scheduled' ? 'Proximos' : 'Jugados'}
                        </button>
                    ))}
                </div>
            </div>
            {convocationNotice && (
                <div className={styles.callout} style={{ marginBottom: 16 }}>
                    <span className={styles.calloutTitle}>Convocatoria enviada</span>
                    <p>{convocationNotice}</p>
                </div>
            )}
            <div className={styles.glassCard}>
                <div className={styles.tableScroll}>
                    <table className={styles.table}>
                        <thead>
                            <tr><th>Fecha</th><th>Hora</th><th>Partido</th><th>Origen</th><th>Competencia</th><th>Division</th><th>Sede</th><th>Resultado</th><th>Estado</th><th>Acciones</th></tr>
                        </thead>
                        <tbody>
                            {filtered.map((m) => (
                                <tr key={m.id}>
                                    <td className={styles.mono}>{m.date}</td>
                                    <td className={styles.mono}>{m.time}</td>
                                    <td style={{ fontWeight: 600 }}>
                                        <span style={{ color: m.home === clubName || m.home === 'SIC' ? 'var(--color-accent)' : undefined }}>{m.home}</span>
                                        {' vs '}
                                        <span style={{ color: m.away === clubName || m.away === 'SIC' ? 'var(--color-accent)' : undefined }}>{m.away}</span>
                                    </td>
                                    <td>
                                        <span className={`${styles.badge} ${styles[originLabels[m.origin].cls as keyof typeof styles] || ''}`}>
                                            {originLabels[m.origin].label}
                                        </span>
                                    </td>
                                    <td>{m.competition}</td>
                                    <td><span className={`${styles.badge} ${styles.badgeInfo}`}>{m.division}</span></td>
                                    <td>{m.venue}</td>
                                    <td className={styles.mono} style={{ fontWeight: 700 }}>{m.status === 'final' ? `${m.scoreH} - ${m.scoreA}` : '-'}</td>
                                    <td><span className={`${styles.badge} ${styles[statusLabels[m.status].cls as keyof typeof styles] || ''}`}>{statusLabels[m.status].label}</span></td>
                                    <td>
                                        <div className={styles.listItemActions}>
                                            {m.origin === 'official' ? (
                                                <>
                                                    <button className={styles.btnSmall} type="button" onClick={() => openAction('view', m)}>Ver</button>
                                                    <button className={styles.btnSmall} type="button" onClick={() => openAction('convocar', m)}>Convocar</button>
                                                    <button className={styles.btnSmall} type="button" onClick={() => openAction('comunicar', m)}>Comunicar</button>
                                                </>
                                            ) : m.origin === 'provisional' ? (
                                                <>
                                                    <button className={styles.btnSmall} type="button" onClick={() => startEdit(m)}>Editar</button>
                                                    <button className={styles.btnSmall} type="button" onClick={() => openAction('convocar', m)}>Convocar</button>
                                                    <button className={styles.btnSmall} type="button" onClick={() => openAction('comunicar', m)}>Comunicar</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className={styles.btnSmall} type="button" onClick={() => startEdit(m)}>Editar</button>
                                                    <button className={`${styles.btnSmall} ${styles.btnDanger}`} type="button" onClick={() => handleDelete(m)}>Eliminar</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length === 0 && <div className={styles.emptyPlaceholder}><p>No hay partidos para mostrar</p></div>}
            </div>
                        {actionModal.open && actionModal.match && (
                <div className={styles.modalOverlay} onClick={closeAction}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>
                                    {actionModal.mode === 'view' && 'Detalle del partido'}
                                    {actionModal.mode === 'convocar' && 'Convocar plantel'}
                                    {actionModal.mode === 'comunicar' && 'Comunicar partido'}
                                </h2>
                                <p className={styles.cardMeta}>Acciones del club segun el origen del partido.</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={closeAction}>Cerrar</button>
                        </div>

                        <div className={styles.sectionCard}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                <span className={`${styles.badge} ${styles[originLabels[actionModal.match.origin].cls as keyof typeof styles] || ''}`}>
                                    {originLabels[actionModal.match.origin].label}
                                </span>
                                <span className={`${styles.badge} ${styles.badgeInfo}`}>{actionModal.match.division}</span>
                                <span className={`${styles.badge} ${styles.badgeNeutral}`}>{actionModal.match.competition}</span>
                            </div>
                            <p style={{ fontWeight: 600 }}>{actionModal.match.home} vs {actionModal.match.away}</p>
                            <p className={styles.cardMeta}>{actionModal.match.date} · {actionModal.match.time} · {actionModal.match.venue}</p>
                            {actionModal.match.origin === 'provisional' && (
                                <div className={styles.callout} style={{ marginTop: 12 }}>
                                    <span className={styles.calloutTitle}>Partido provisorio</span>
                                    <p>Se vinculara al fixture oficial cuando la federacion publique el torneo.</p>
                                </div>
                            )}
                        </div>

                        {actionModal.mode === 'convocar' && (
                            <div className={styles.callout}>
                                <span className={styles.calloutTitle}>Convocatoria</span>
                                <p>Selecciona jugadores del plantel y envia confirmacion.</p>
                            </div>
                        )}

                        {actionModal.mode === 'comunicar' && (
                            <div className={styles.callout}>
                                <span className={styles.calloutTitle}>Comunicacion</span>
                                <p>Genera una noticia o post con el partido.</p>
                            </div>
                        )}

                        <div className={styles.detailActions}>
                            <button className={styles.btnGhost} type="button" onClick={closeAction}>Cerrar</button>
                            {actionModal.mode === 'view' && (
                                <button className={styles.btn} type="button" onClick={closeAction}>Ver detalle</button>
                            )}
                            {actionModal.mode === 'convocar' && (
                                <button className={styles.btn} type="button" onClick={() => openConvocation(actionModal.match!)}>Abrir convocatoria</button>
                            )}
                            {actionModal.mode === 'comunicar' && (
                                <button className={styles.btn} type="button" onClick={closeAction}>Crear comunicado</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {convocationModal.open && convocationModal.match && (
                <div className={styles.modalOverlay} onClick={() => setConvocationModal({ open: false, match: null })}>
                    <div className={styles.modalCard} style={{ width: '720px' }} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>Convocar plantel</h2>
                                <p className={styles.cardMeta}>{convocationModal.match.home} vs {convocationModal.match.away} · {convocationModal.match.date} · {convocationModal.match.time}</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => setConvocationModal({ open: false, match: null })}>Cerrar</button>
                        </div>

                        <div className={styles.callout} style={{ marginBottom: 16 }}>
                            <span className={styles.calloutTitle}>Seleccion de plantel</span>
                            <p>Selecciona jugadores y envia confirmacion al plantel correspondiente.</p>
                        </div>

                        {(() => {
                            const availablePlayers = getPlayersForDivision(convocationModal.match?.division);
                            const hasPlayers = availablePlayers.length > 0;
                            const selectedCount = selectedPlayers.filter((id) => availablePlayers.some((p) => p.id === id)).length;
                            return (
                                <>
                                    <div className={styles.convocationToolbar}>
                                    <label className={styles.checkboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={hasPlayers && selectedCount === availablePlayers.length}
                                            onChange={() => toggleAllPlayers(availablePlayers)}
                                            disabled={!hasPlayers}
                                        />
                                        <span>Seleccionar todos</span>
                                    </label>
                                    <span className={styles.cardMeta}>{selectedCount} seleccionados</span>
                                </div>

                                    {hasPlayers ? (
                                        <ul className={styles.convocationList}>
                                            {availablePlayers.map((player) => (
                                                <li key={player.id} className={styles.convocationItem}>
                                                    <label className={styles.checkboxRow}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPlayers.includes(player.id)}
                                                            onChange={() => togglePlayer(player.id)}
                                                        />
                                                        <span className={styles.convocationName}>{player.name}</span>
                                                    </label>
                                                    <span className={styles.convocationMeta}>{player.position} · {player.division}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className={styles.emptyPlaceholder}>
                                            <p>No hay jugadores cargados para esta division.</p>
                                        </div>
                                    )}

                                    <div className={styles.modalFooter}>
                                        <button className={styles.btnGhost} type="button" onClick={() => setConvocationModal({ open: false, match: null })}>
                                            Cancelar
                                        </button>
                                        <button className={styles.btn} type="button" disabled={selectedCount === 0} onClick={handleSendConvocation}>
                                            Enviar convocatoria
                                        </button>
                                    </div>
                                </>
                            );
                        })()}

                    </div>
                </div>
            )}
{showCreate && (
                <div className={styles.modalOverlay} onClick={() => { setShowCreate(false); setEditingMatchId(null); }}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>{editingMatchId ? 'Editar partido' : 'Crear partido'}</h2>
                                <p className={styles.cardMeta}>Formulario adaptativo segun vinculacion federativa.</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => { setShowCreate(false); setEditingMatchId(null); }}>Cerrar</button>
                        </div>

                        <div className={styles.steps}>
                            {([1, 2, 3, 4, 5] as const).map((step) => (
                                <button
                                    key={step}
                                    type="button"
                                    className={`${styles.stepButton} ${formStep === step ? styles.stepButtonActive : ''}`}
                                    onClick={() => setFormStep(step)}
                                >
                                    <span className={styles.stepIndex}>{step}</span>
                                    <span className={styles.stepLabel}>
                                        {step === 1 && 'Contexto'}
                                        {step === 2 && 'Participantes'}
                                        {step === 3 && 'Agenda'}
                                        {step === 4 && 'Configuracion'}
                                        {step === 5 && 'Confirmacion'}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {formStep === 1 && (
                            <div>
                                <p className={styles.stepHint}>Define si es oficial, provisorio o amistoso segun el nivel de autoridad.</p>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Division</label>
                                        <select className={styles.formInput} value={form.division} onChange={(e) => updateField('division', e.target.value)}>
                                            {['Primera', 'Reserva', 'M19'].map((d) => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Temporada</label>
                                        <select className={styles.formInput} value={form.season} onChange={(e) => updateField('season', e.target.value)}>
                                            {['2026', '2027'].map((s) => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                        <label className={styles.formLabel}>Tipo de partido</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {typeOptions.map((opt) => (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    className={`${styles.chip} ${form.type === opt ? styles.chipActive : ''}`}
                                                    onClick={() => updateField('type', opt)}
                                                >
                                                    {typeLabels[opt].label}
                                                </button>
                                            ))}
                                        </div>
                                        {createContext === 'official' && allowProvisional && (
                                            <span className={styles.helpText}>Este partido se crea como provisorio y puede ser vinculado o reemplazado por la federacion.</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {formStep === 2 && (
                            <div>
                                <p className={styles.stepHint}>Participantes del partido. El club se autocompleta.</p>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Club</label>
                                        <input className={styles.formInput} value={form.homeClub} readOnly />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Rival</label>
                                        <input className={styles.formInput} value={form.awayClub} onChange={(e) => updateField('awayClub', e.target.value)} placeholder="Nombre del rival" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {formStep === 3 && (
                            <div>
                                <p className={styles.stepHint}>Agenda del encuentro: fecha, hora, sede y condicion.</p>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Fecha</label>
                                        <input className={styles.formInput} type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Hora</label>
                                        <input className={styles.formInput} type="time" value={form.time} onChange={(e) => updateField('time', e.target.value)} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Sede</label>
                                        <input className={styles.formInput} value={form.venue} onChange={(e) => updateField('venue', e.target.value)} placeholder="Sede o direccion" />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Condicion</label>
                                        <select className={styles.formInput} value={form.homeAway} onChange={(e) => updateField('homeAway', e.target.value)}>
                                            <option value="Local">Local</option>
                                            <option value="Visitante">Visitante</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {formStep === 4 && (
                            <div>
                                <p className={styles.stepHint}>Configuracion deportiva. Se hereda si hay federacion vinculada.</p>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Formato</label>
                                        <input className={styles.formInput} value={form.format} onChange={(e) => updateField('format', e.target.value)} disabled={federationLinked} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Reglamento</label>
                                        <input className={styles.formInput} value={form.regulation} onChange={(e) => updateField('regulation', e.target.value)} disabled={federationLinked} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Duracion por tiempo (min)</label>
                                        <input className={styles.formInput} value={form.duration} onChange={(e) => updateField('duration', e.target.value)} disabled={federationLinked} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Notas</label>
                                        <input className={styles.formInput} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Opcional" />
                                    </div>
                                </div>
                                {federationLinked && (
                                    <div className={styles.callout}>
                                        <span className={styles.calloutTitle}>Campos bloqueados</span>
                                        <p>El reglamento y formato se heredan por la federacion y se mantienen en solo lectura.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {formStep === 5 && (
                            <div>
                                <p className={styles.stepHint}>Resumen final del partido.</p>
                                <div className={styles.sectionCard}>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                        <span className={`${styles.badge} ${styles[typeLabels[form.type].badge as keyof typeof styles] || ''}`}>{typeLabels[form.type].label}</span>
                                        <span className={`${styles.badge} ${styles.badgeInfo}`}>{form.division}</span>
                                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>{form.season}</span>
                                    </div>
                                    <p style={{ fontWeight: 600 }}>{form.homeClub} vs {form.awayClub || 'Rival externo'}</p>
                                    <p className={styles.cardMeta}>{form.date || 'Fecha a definir'} {'\u00B7'} {form.time || 'Hora a definir'} {'\u00B7'} {form.venue || 'Sede a definir'}</p>
                                    {form.type === 'provisional' && (
                                        <div className={styles.callout} style={{ marginTop: 12 }}>
                                            <span className={styles.calloutTitle}>Partido provisorio</span>
                                            <p>Se vinculara al fixture oficial cuando la federacion publique el torneo.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className={styles.detailActions} style={{ marginTop: 24 }}>
                            <button
                                className={styles.btnGhost}
                                type="button"
                                disabled={formStep === 1}
                                onClick={() => setFormStep((prev) => (prev > 1 ? (prev - 1) as 1 | 2 | 3 | 4 | 5 : prev))}
                            >
                                Anterior
                            </button>
                            {formStep < 5 ? (
                                <button className={styles.btn} type="button" onClick={() => setFormStep((prev) => (prev + 1) as 1 | 2 | 3 | 4 | 5)}>
                                    Siguiente
                                </button>
                            ) : (
                                <button className={styles.btn} type="button" onClick={handleCreate}>
                                    Confirmar y crear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </SectionShell>
    );
}





















