'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Bell,
    Camera,
    ChevronRight,
    CirclePlus,
    ClipboardPenLine,
    Globe,
    Heart,
    LoaderCircle,
    Lock,
    LogOut,
    Send,
    Trophy,
    User,
    Users,
} from 'lucide-react';

import { useFavorites } from '@/hooks/useFavorites';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { getActiveSports } from '@/lib/data/sports';
import { getRoleLabel } from '@/lib/auth/roles';
import {
    disableHireCta,
    enableHireCtaOnce,
    getHireCtaPreference,
    type HireCtaPreference,
} from '@/lib/hireCtaPreferences';
import { useAuth } from '@/context/AuthContext';
import ProdeLobby from '@/components/prode/ProdeLobby';
import type { ProdePrivateLeagueSummary, PublicProdeCompetition, PublicProdeUserTotal } from '@/lib/prode/types';

import styles from './profile.module.css';

type MainTab = 'prode' | 'perfil';
type ProfileActionKind = 'collaborator' | 'tournament';

type FormStatus =
    | { type: 'idle' }
    | { type: 'submitting'; message: string }
    | { type: 'success'; message: string; mailtoUrl?: string }
    | { type: 'error'; message: string };

type RequestApiResponse = {
    ok: true;
    delivery: 'mailto' | 'webhook';
    recipient: string;
    message: string;
    mailtoUrl?: string;
};

type CollaboratorRequestPayload = {
    kind: 'collaborator';
    fullName: string;
    email: string;
    city: string;
    sport: string;
    experience: string;
    availability: string;
};

type TournamentRequestPayload = {
    kind: 'tournament';
    fullName: string;
    email: string;
    tournamentName: string;
    sport: string;
    location: string;
    season: string;
    website: string;
    notes: string;
};

interface ProfileStats {
    sports: number;
    following: number;
}

interface ProfileUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    avatarUrl?: string | null;
}

function resolveMainTab(value: string | null): MainTab {
    if (value === 'prode' || value === 'perfil') {
        return value;
    }

    return 'perfil';
}

async function sendProfileRequest(
    payload: CollaboratorRequestPayload | TournamentRequestPayload
): Promise<RequestApiResponse> {
    const response = await fetch('/api/profile/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.error || 'No se pudo preparar tu solicitud.');
    }

    return data as RequestApiResponse;
}

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const { favoriteSportIds } = useUserPreferences();
    const { favorites } = useFavorites();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<MainTab>('perfil');
    const [activeRequestForm, setActiveRequestForm] = useState<ProfileActionKind | null>(null);

    useEffect(() => {
        setActiveTab(resolveMainTab(searchParams.get('tab')));
    }, [searchParams]);

    const stats: ProfileStats = {
        sports: favoriteSportIds.length,
        following: favorites.length,
    };

    const topTabs: { key: MainTab; label: string }[] = [
        { key: 'prode', label: 'Prode' },
        { key: 'perfil', label: 'Perfil' },
    ];

    return (
        <div className={styles.page}>
            <div className={`${styles.container} ${activeTab === 'prode' ? styles.containerWide : ''}`}>
                <nav className={styles.tabsContainer} aria-label="Secciones del perfil">
                    {topTabs.map(({ key, label }) => (
                        <button
                            key={key}
                            className={`${styles.tab} ${activeTab === key ? styles.active : ''}`}
                            onClick={() => setActiveTab(key)}
                        >
                            {label}
                        </button>
                    ))}
                </nav>

                {activeTab === 'prode' && (
                    <ProdePanel viewerId={user?.id ?? null} />
                )}

                {activeTab === 'perfil' && (
                    <div className={styles.profileStack}>
                        <ProfileHeader user={user} stats={stats} />
                        <ProfileActionHub
                            user={user}
                            activeRequestForm={activeRequestForm}
                            onSelectForm={(kind) => setActiveRequestForm(current => current === kind ? null : kind)}
                            onCloseForm={() => setActiveRequestForm(null)}
                        />
                        <SettingsPanel logout={logout} />
                    </div>
                )}
            </div>
        </div>
    );
}

function ProfileHeader({
    user,
    stats,
}: {
    user: ProfileUser | null | undefined;
    stats: ProfileStats;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <header className={styles.profileHeader}>
            <div
                className={styles.avatarContainer}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                aria-label="Cambiar foto de perfil"
            >
                {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="Avatar" className={styles.avatar} />
                ) : (
                    <div
                        className={styles.avatar}
                        style={{
                            background: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <User size={32} color="#aaa" />
                    </div>
                )}

                <div className={styles.avatarOverlay}>
                    <Camera size={24} />
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={() => alert('Funcionalidad de subida de imagen en desarrollo.')}
                />
            </div>

            <div className={styles.userInfo}>
                <h1 className={styles.userName}>{user?.name || 'Usuario'}</h1>
                <div className={styles.userHandle}>@{user?.email?.split('@')[0] || 'usuario'}</div>
                <div className={styles.userStatusPill}>
                    {user?.role ? getRoleLabel(user.role) : 'Usuario'}
                </div>
                <div className={styles.statsRow}>
                    <span className={styles.stat}><strong>{stats.sports}</strong> Deportes favoritos</span>
                    <span className={styles.stat}><strong>{stats.following}</strong> Siguiendo</span>
                </div>
            </div>

            <button
                className={styles.btnEditProfile}
                onClick={() => alert('Edicion de perfil proximamente.')}
            >
                Editar
            </button>
        </header>
    );
}

function ProfileActionHub({
    user,
    activeRequestForm,
    onSelectForm,
    onCloseForm,
}: {
    user: ProfileUser | null | undefined;
    activeRequestForm: ProfileActionKind | null;
    onSelectForm: (kind: ProfileActionKind) => void;
    onCloseForm: () => void;
}) {
    return (
        <section className={styles.actionHub}>
            <div className={styles.actionHubHeader}>
                <div className={styles.actionIntro}>
                    <p className={styles.actionEyebrow}>Acciones</p>
                    <h2 className={styles.actionTitle}>Postulate o sumanos un torneo</h2>
                    <p className={styles.actionDescription}>
                        Desde tu perfil ahora podes enviar dos tipos de solicitudes directo a
                        deportesgrupo@gmail.com.
                    </p>
                </div>

                <div className={styles.actionAside}>
                    <div className={styles.actionMailBadge}>
                        <span className={styles.actionMailLabel}>Destino</span>
                        <strong>deportesgrupo@gmail.com</strong>
                    </div>
                    <div className={styles.actionBadgeRow}>
                        <span className={styles.actionMiniBadge}>Desde tu perfil</span>
                        <span className={styles.actionMiniBadge}>Mail listo para enviar</span>
                    </div>
                    {activeRequestForm && (
                        <button className={styles.btnGhost} onClick={onCloseForm}>
                            Cerrar formulario
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.actionGrid}>
                <button
                    type="button"
                    className={`${styles.actionCard} ${activeRequestForm === 'collaborator' ? styles.actionCardActive : ''}`}
                    onClick={() => onSelectForm('collaborator')}
                >
                    <div className={styles.actionCardTop}>
                        <div className={styles.actionIconWrap}>
                            <Users size={22} />
                        </div>
                        <span className={styles.actionKicker}>Colaboradores</span>
                    </div>
                    <div className={styles.actionCopy}>
                        <span className={styles.actionCardTitle}>Aplicar a colaboradores de resultados</span>
                        <span className={styles.actionCardDesc}>
                            Postulate para ayudar con carga, seguimiento y cobertura de resultados.
                        </span>
                    </div>
                    <div className={styles.actionHighlights}>
                        <span className={styles.actionHighlight}>Cobertura</span>
                        <span className={styles.actionHighlight}>Carga de resultados</span>
                        <span className={styles.actionHighlight}>Seguimiento de torneos</span>
                    </div>
                    <div className={styles.actionFooter}>
                        <span className={styles.actionFooterText}>Completar solicitud</span>
                        <ChevronRight size={18} className={styles.actionChevron} />
                    </div>
                </button>

                <button
                    type="button"
                    className={`${styles.actionCard} ${activeRequestForm === 'tournament' ? styles.actionCardActive : ''}`}
                    onClick={() => onSelectForm('tournament')}
                >
                    <div className={styles.actionCardTop}>
                        <div className={styles.actionIconWrap}>
                            <CirclePlus size={22} />
                        </div>
                        <span className={styles.actionKicker}>Catalogo</span>
                    </div>
                    <div className={styles.actionCopy}>
                        <span className={styles.actionCardTitle}>Sumar un torneo especifico</span>
                        <span className={styles.actionCardDesc}>
                            Compartinos el torneo que queres ver en Grupo 22 y lo evaluamos.
                        </span>
                    </div>
                    <div className={styles.actionHighlights}>
                        <span className={styles.actionHighlight}>Nombre y edicion</span>
                        <span className={styles.actionHighlight}>Link oficial</span>
                        <span className={styles.actionHighlight}>Contexto del torneo</span>
                    </div>
                    <div className={styles.actionFooter}>
                        <span className={styles.actionFooterText}>Proponer torneo</span>
                        <ChevronRight size={18} className={styles.actionChevron} />
                    </div>
                </button>
            </div>

            {activeRequestForm === 'collaborator' && (
                <CollaboratorRequestForm
                    key={`collaborator-${user?.id ?? 'guest'}-${user?.email ?? ''}`}
                    user={user}
                    onCancel={onCloseForm}
                />
            )}

            {activeRequestForm === 'tournament' && (
                <TournamentRequestForm
                    key={`tournament-${user?.id ?? 'guest'}-${user?.email ?? ''}`}
                    user={user}
                    onCancel={onCloseForm}
                />
            )}
        </section>
    );
}

function CollaboratorRequestForm({
    user,
    onCancel,
}: {
    user: ProfileUser | null | undefined;
    onCancel: () => void;
}) {
    const [fullName, setFullName] = useState(() => user?.name || '');
    const [email, setEmail] = useState(() => user?.email || '');
    const [city, setCity] = useState('');
    const [sport, setSport] = useState('');
    const [experience, setExperience] = useState('');
    const [availability, setAvailability] = useState('');
    const [status, setStatus] = useState<FormStatus>({ type: 'idle' });

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus({ type: 'submitting', message: 'Preparando tu solicitud...' });

        try {
            const result = await sendProfileRequest({
                kind: 'collaborator',
                fullName,
                email,
                city,
                sport,
                experience,
                availability,
            });

            if (result.delivery === 'mailto' && result.mailtoUrl && typeof window !== 'undefined') {
                window.location.href = result.mailtoUrl;
            }

            setStatus({
                type: 'success',
                message: result.message,
                mailtoUrl: result.mailtoUrl,
            });
        } catch (error) {
            setStatus({
                type: 'error',
                message: error instanceof Error ? error.message : 'No se pudo enviar la solicitud.',
            });
        }
    };

    return (
        <form className={styles.formShell} onSubmit={handleSubmit}>
            <div className={styles.formHeader}>
                <div className={styles.formHeading}>
                    <p className={styles.formEyebrow}>Solicitud</p>
                    <h3 className={styles.formTitle}>Aplicar al equipo de colaboradores de resultados</h3>
                    <p className={styles.formLead}>
                        Ideal si ya seguis partidos, cubris resultados o queres aportar contexto competitivo.
                    </p>
                </div>
                <div className={styles.formHeroAside}>
                    <div className={styles.formHeroIcon}>
                        <ClipboardPenLine size={18} className={styles.formHeaderIcon} />
                    </div>
                    <div className={styles.formHeroCopy}>
                        <span className={styles.formHeroLabel}>Envio</span>
                        <strong>Mail preparado al instante</strong>
                    </div>
                </div>
            </div>

            <div className={styles.formCallouts}>
                <span className={styles.formCallout}>Respuesta manual</span>
                <span className={styles.formCallout}>Se abre tu cliente de correo</span>
                <span className={styles.formCallout}>Proceso en 2 minutos</span>
            </div>

            <div className={styles.fieldGrid}>
                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="collab-full-name">Nombre completo</label>
                    <input
                        id="collab-full-name"
                        className={styles.input}
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="collab-email">Email de contacto</label>
                    <input
                        id="collab-email"
                        type="email"
                        className={styles.input}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="collab-city">Ciudad o pais</label>
                    <input
                        id="collab-city"
                        className={styles.input}
                        placeholder="Ej: Rosario, Argentina"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="collab-sport">Deporte principal</label>
                    <input
                        id="collab-sport"
                        className={styles.input}
                        placeholder="Ej: Rugby"
                        value={sport}
                        onChange={(event) => setSport(event.target.value)}
                        required
                    />
                </div>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="collab-experience">Experiencia con resultados</label>
                <p className={styles.fieldHint}>
                    Conta competencias cubiertas, herramientas que uses o si ya hiciste seguimiento en vivo.
                </p>
                <textarea
                    id="collab-experience"
                    className={styles.textarea}
                    rows={4}
                    placeholder="Contanos si cubriste partidos, cargaste resultados o seguiste competencias."
                    value={experience}
                    onChange={(event) => setExperience(event.target.value)}
                    minLength={20}
                    required
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="collab-availability">Disponibilidad</label>
                <p className={styles.fieldHint}>
                    Aclara dias, horarios o franjas donde podrias colaborar con carga y control.
                </p>
                <textarea
                    id="collab-availability"
                    className={styles.textarea}
                    rows={3}
                    placeholder="Dias, horarios o torneos que podrias cubrir."
                    value={availability}
                    onChange={(event) => setAvailability(event.target.value)}
                    minLength={10}
                    required
                />
            </div>

            <FormStatusBanner status={status} />

            <div className={styles.formActions}>
                <button type="button" className={styles.btnGhost} onClick={onCancel}>
                    Cancelar
                </button>
                <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={status.type === 'submitting'}
                >
                    {status.type === 'submitting' ? (
                        <>
                            <LoaderCircle size={16} className={styles.spinningIcon} />
                            Preparando mail
                        </>
                    ) : (
                        <>
                            <Send size={16} />
                            Enviar solicitud
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}

function TournamentRequestForm({
    user,
    onCancel,
}: {
    user: ProfileUser | null | undefined;
    onCancel: () => void;
}) {
    const [fullName, setFullName] = useState(() => user?.name || '');
    const [email, setEmail] = useState(() => user?.email || '');
    const [tournamentName, setTournamentName] = useState('');
    const [sport, setSport] = useState('');
    const [location, setLocation] = useState('');
    const [season, setSeason] = useState('');
    const [website, setWebsite] = useState('');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<FormStatus>({ type: 'idle' });

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus({ type: 'submitting', message: 'Preparando tu solicitud...' });

        try {
            const result = await sendProfileRequest({
                kind: 'tournament',
                fullName,
                email,
                tournamentName,
                sport,
                location,
                season,
                website,
                notes,
            });

            if (result.delivery === 'mailto' && result.mailtoUrl && typeof window !== 'undefined') {
                window.location.href = result.mailtoUrl;
            }

            setStatus({
                type: 'success',
                message: result.message,
                mailtoUrl: result.mailtoUrl,
            });
        } catch (error) {
            setStatus({
                type: 'error',
                message: error instanceof Error ? error.message : 'No se pudo enviar la solicitud.',
            });
        }
    };

    return (
        <form className={styles.formShell} onSubmit={handleSubmit}>
            <div className={styles.formHeader}>
                <div className={styles.formHeading}>
                    <p className={styles.formEyebrow}>Solicitud</p>
                    <h3 className={styles.formTitle}>Sumar un torneo especifico</h3>
                    <p className={styles.formLead}>
                        Compartinos un torneo concreto con contexto suficiente para revisarlo e incorporarlo.
                    </p>
                </div>
                <div className={styles.formHeroAside}>
                    <div className={styles.formHeroIcon}>
                        <Trophy size={18} className={styles.formHeaderIcon} />
                    </div>
                    <div className={styles.formHeroCopy}>
                        <span className={styles.formHeroLabel}>Revision</span>
                        <strong>Pedido listo para evaluar</strong>
                    </div>
                </div>
            </div>

            <div className={styles.formCallouts}>
                <span className={styles.formCallout}>Nombre del torneo</span>
                <span className={styles.formCallout}>Contexto y alcance</span>
                <span className={styles.formCallout}>Referencia oficial opcional</span>
            </div>

            <div className={styles.fieldGrid}>
                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="tournament-full-name">Nombre completo</label>
                    <input
                        id="tournament-full-name"
                        className={styles.input}
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="tournament-email">Email de contacto</label>
                    <input
                        id="tournament-email"
                        type="email"
                        className={styles.input}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="tournament-name">Nombre del torneo</label>
                    <input
                        id="tournament-name"
                        className={styles.input}
                        placeholder="Ej: Torneo Regional del Litoral"
                        value={tournamentName}
                        onChange={(event) => setTournamentName(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="tournament-sport">Deporte</label>
                    <input
                        id="tournament-sport"
                        className={styles.input}
                        placeholder="Ej: Hockey"
                        value={sport}
                        onChange={(event) => setSport(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="tournament-location">Pais o region</label>
                    <input
                        id="tournament-location"
                        className={styles.input}
                        placeholder="Ej: Uruguay"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="tournament-season">Temporada o edicion</label>
                    <input
                        id="tournament-season"
                        className={styles.input}
                        placeholder="Ej: 2026"
                        value={season}
                        onChange={(event) => setSeason(event.target.value)}
                        required
                    />
                </div>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="tournament-website">Sitio oficial o link de referencia</label>
                <input
                    id="tournament-website"
                    type="url"
                    className={styles.input}
                    placeholder="https://..."
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="tournament-notes">Por que deberiamos sumarlo</label>
                <p className={styles.fieldHint}>
                    Suma equipos, region, audiencia o cualquier dato que ayude a priorizarlo.
                </p>
                <textarea
                    id="tournament-notes"
                    className={styles.textarea}
                    rows={4}
                    placeholder="Conta alcance, relevancia, equipos o cualquier detalle util."
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    minLength={20}
                    required
                />
            </div>

            <FormStatusBanner status={status} />

            <div className={styles.formActions}>
                <button type="button" className={styles.btnGhost} onClick={onCancel}>
                    Cancelar
                </button>
                <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={status.type === 'submitting'}
                >
                    {status.type === 'submitting' ? (
                        <>
                            <LoaderCircle size={16} className={styles.spinningIcon} />
                            Preparando mail
                        </>
                    ) : (
                        <>
                            <Send size={16} />
                            Enviar solicitud
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}

function FormStatusBanner({ status }: { status: FormStatus }) {
    if (status.type === 'idle') {
        return null;
    }

    const statusClassName = status.type === 'error'
        ? styles.statusError
        : status.type === 'success'
            ? styles.statusSuccess
            : styles.statusPending;

    return (
        <div className={`${styles.statusBanner} ${statusClassName}`}>
            <p>{status.message}</p>
            {status.type === 'success' && status.mailtoUrl && (
                <a href={status.mailtoUrl} className={styles.statusLink}>
                    Abrir correo manualmente
                </a>
            )}
        </div>
    );
}

function EmptySection({
    icon,
    title,
    message,
    action,
}: {
    icon: ReactNode;
    title?: string;
    message: string;
    action?: ReactNode;
}) {
    return (
        <div className={styles.emptySection}>
            {icon}
            {title && <h3 className={styles.emptySectionTitle}>{title}</h3>}
            <p className={styles.emptySectionMsg}>{message}</p>
            {action}
        </div>
    );
}

function ProdePanel({ viewerId }: { viewerId: string | null }) {
    const [competitions, setCompetitions] = useState<PublicProdeCompetition[]>([]);
    const [totals, setTotals] = useState<PublicProdeUserTotal[]>([]);
    const [privateLeagues, setPrivateLeagues] = useState<ProdePrivateLeagueSummary[]>([]);
    const [schemaReady, setSchemaReady] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);

            try {
                const [competitionsResponse, leaderboardResponse, privateLeaguesResponse] = await Promise.all([
                    fetch('/api/prode/competitions', { credentials: 'same-origin' }),
                    fetch('/api/prode/leaderboard', { credentials: 'same-origin' }),
                    fetch('/api/prode/private-leagues', { credentials: 'same-origin' }),
                ]);

                const competitionsJson = await competitionsResponse.json() as {
                    schemaReady?: boolean;
                    data?: PublicProdeCompetition[];
                    error?: string;
                };
                const leaderboardJson = await leaderboardResponse.json() as {
                    schemaReady?: boolean;
                    data?: PublicProdeUserTotal[];
                    error?: string;
                };
                const privateLeaguesJson = await privateLeaguesResponse.json() as {
                    schemaReady?: boolean;
                    data?: ProdePrivateLeagueSummary[];
                    error?: string;
                };

                if (!competitionsResponse.ok) {
                    throw new Error(competitionsJson.error || 'No se pudo cargar el hub de prode.');
                }

                if (!leaderboardResponse.ok) {
                    throw new Error(leaderboardJson.error || 'No se pudo cargar el ranking del prode.');
                }
                if (!privateLeaguesResponse.ok && privateLeaguesResponse.status !== 401) {
                    throw new Error(privateLeaguesJson.error || 'No se pudieron cargar tus ligas privadas.');
                }

                if (cancelled) return;

                setCompetitions(Array.isArray(competitionsJson.data) ? competitionsJson.data : []);
                setTotals(Array.isArray(leaderboardJson.data) ? leaderboardJson.data : []);
                setPrivateLeagues(Array.isArray(privateLeaguesJson.data) ? privateLeaguesJson.data : []);
                setSchemaReady(
                    Boolean(competitionsJson.schemaReady)
                    && Boolean(leaderboardJson.schemaReady)
                    && (privateLeaguesResponse.status === 401 || Boolean(privateLeaguesJson.schemaReady))
                );
            } catch (fetchError) {
                if (cancelled) return;
                setError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar el hub de prode.');
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className={styles.embeddedProdeShell}>
            {loading ? (
                <EmptySection
                    icon={<LoaderCircle size={40} color="var(--color-text-tertiary)" className={styles.spinLoader} />}
                    title="Cargando prode"
                    message="Estamos trayendo el hub para mostrarlo directo desde tu perfil."
                />
            ) : error ? (
                <EmptySection
                    icon={<Trophy size={40} color="var(--color-text-tertiary)" />}
                    title="No se pudo cargar"
                    message={error}
                    action={<Link href="/prode" className={styles.btnAccent}>Abrir prode</Link>}
                />
            ) : (
                <ProdeLobby
                    competitions={competitions}
                    totals={totals}
                    privateLeagues={privateLeagues}
                    viewerId={viewerId}
                    schemaReady={schemaReady}
                    embedded
                />
            )}
        </div>
    );
}

function SettingsPanel({ logout }: { logout: () => void }) {
    const router = useRouter();
    const { user } = useAuth();
    const { favoriteSportIds } = useUserPreferences();
    const allSports = getActiveSports();
    const favoriteSports = allSports.filter(sport => favoriteSportIds.includes(sport.id));
    const [hireCtaPreference, setHireCtaPreference] = useState<HireCtaPreference | null>(null);

    useEffect(() => {
        if (!user?.id) {
            setHireCtaPreference(null);
            return;
        }

        setHireCtaPreference(getHireCtaPreference(user.id));
    }, [user?.id]);

    const handleEnableHireCta = () => {
        if (!user?.id) return;
        setHireCtaPreference(enableHireCtaOnce(user.id));
    };

    const handleDisableHireCta = () => {
        if (!user?.id) return;
        setHireCtaPreference(disableHireCta(user.id));
    };

    const hireCtaStatus = !hireCtaPreference
        ? 'Disponible para usuarios con sesion.'
        : hireCtaPreference.enabled && !hireCtaPreference.seen
            ? 'Se va a mostrar una vez en el inicio.'
            : hireCtaPreference.seen
                ? 'Ya se mostro una vez en el inicio.'
                : 'No se esta mostrando en el inicio.';

    return (
        <section className={styles.settingsCard}>
            <h3 className={styles.sidebarSectionTitle}>Configuracion</h3>

            <div className={styles.preferenceGrid}>
                <div className={styles.preferenceCard}>
                    <div className={styles.preferenceHeader}>
                        <div className={styles.preferenceLabel}>
                            <Heart size={15} className={styles.preferenceIcon} />
                            <span>Preferencias deportivas</span>
                        </div>
                        <button
                            onClick={() => router.push('/onboarding/preferences?edit=true')}
                            className={styles.preferenceEditBtn}
                        >
                            Editar
                        </button>
                    </div>

                    {favoriteSports.length > 0 ? (
                        <div className={styles.preferenceChips}>
                            {favoriteSports.map(sport => (
                                <span key={sport.id} className={styles.preferenceChip}>
                                    {sport.icon} {sport.nameEs}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className={styles.preferenceEmptyText}>
                            Todavia no elegiste deportes favoritos.
                        </p>
                    )}
                </div>

                <div className={styles.preferenceCard}>
                    <div className={styles.preferenceHeader}>
                        <div className={styles.preferenceLabel}>
                            <Trophy size={15} className={styles.preferenceIcon} />
                            <span>Panel G22 Scores</span>
                        </div>
                        <button
                            type="button"
                            onClick={handleEnableHireCta}
                            className={styles.preferenceEditBtn}
                            disabled={!user?.id}
                        >
                            Mostrar una vez
                        </button>
                    </div>
                    <p className={styles.preferenceEmptyText}>
                        Controla el panel de contratacion de la home. Los invitados lo ven siempre.
                    </p>
                    <div className={styles.preferenceControlRow}>
                        <span className={styles.preferenceStatus}>{hireCtaStatus}</span>
                        {hireCtaPreference?.enabled && !hireCtaPreference.seen && (
                            <button
                                type="button"
                                className={styles.preferenceSecondaryBtn}
                                onClick={handleDisableHireCta}
                            >
                                No mostrar
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className={styles.settingsGrid}>
                <Link href="/favorites" className={`${styles.settingTile} ${styles.settingTileLink}`}>
                    <div className={styles.settingInfo}>
                        <h4>Siguiendo</h4>
                        <p>Clubes y torneos guardados</p>
                    </div>
                    <ChevronRight size={16} color="var(--color-text-tertiary)" />
                </Link>

                <div className={styles.settingTile}>
                    <div className={styles.settingInfo}>
                        <h4>Idioma</h4>
                        <p>Espanol (Argentina)</p>
                    </div>
                    <Globe size={16} color="var(--color-text-tertiary)" />
                </div>

                <div className={styles.settingTile}>
                    <div className={styles.settingInfo}>
                        <h4>Zona Horaria</h4>
                        <p>UTC-3 (Buenos Aires)</p>
                    </div>
                    <ChevronRight size={16} color="var(--color-text-tertiary)" />
                </div>

                <div className={styles.settingTile}>
                    <div className={styles.settingInfo}>
                        <h4>Notificaciones</h4>
                        <p>Resultados en vivo</p>
                    </div>
                    <Bell size={16} color="var(--color-text-tertiary)" />
                </div>

                <div className={styles.settingTile}>
                    <div className={styles.settingInfo}>
                        <h4>Privacidad</h4>
                        <p>Publico</p>
                    </div>
                    <Globe size={16} color="var(--color-text-tertiary)" />
                </div>

                <div className={styles.settingTile}>
                    <div className={styles.settingInfo}>
                        <h4>Cambiar contrasena</h4>
                        <p>Actualiza tus credenciales</p>
                    </div>
                    <Lock size={16} color="var(--color-text-tertiary)" />
                </div>
            </div>

            <div className={styles.settingsFooter}>
                <button className={styles.btnLogout} onClick={logout}>
                    <LogOut size={18} />
                    Cerrar sesion
                </button>

                <button
                    className={styles.btnDanger}
                    onClick={() => alert('Para eliminar tu cuenta, contacta a soporte.')}
                >
                    Eliminar cuenta
                </button>
            </div>
        </section>
    );
}
