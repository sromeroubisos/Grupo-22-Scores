'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    AlertCircle,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Layers3,
    RefreshCw,
    Shield,
    Sparkles,
    Trophy,
} from 'lucide-react';
import styles from './page.module.css';
import { useSport } from '@/context/SportContext';
import { useAuth } from '@/context/AuthContext';
import type { Sport } from '@/lib/types';
import MobileSectionTabs from '@/components/MobileSectionTabs';
import TeamLogo from '@/components/TeamLogo';
import {
    buildRankingExportRows,
    formatRankingRating,
    getRankingClubName,
    getRankingClubShortName,
    getRankingDelta,
    getRankingPreviousRating,
    getRankingPositionChange,
    getRankingPositionLabel,
    paginateRankingEntries,
    RANKING_EXPORT_COLUMN_LABELS,
    WORLD_RUGBY_EXPORT_COLUMN_LABELS,
    getRankingMovementHighlight,
    type RankingMovementHighlight,
    normalizeRankingPositionLabels,
    type RankingPositionLabel,
} from '@/lib/rankings/rankingTable';
import dynamic from 'next/dynamic';

// El export es la pieza mas pesada que carga esta pagina y solo hace falta cuando
// alguien aprieta el boton. Diferido, deja de viajar en la primera carga: en el
// telefono eso es codigo que no se baja, no se parsea y no se compila.
const ExportImage = dynamic(() => import('@/components/ExportImage'), { ssr: false });


// El nombre del deporte NO vive aca: sale del catalogo (`nameEs`). Este mapa es
// solo la piel visual, y por eso su default es aceptable — un acento generico se
// banca, un deporte titulado "Deporte" no. Antes `field-hockey` y `motorsport`
// caian al default y aparecian los dos como "Deporte / Catalogo activo".
type SportSurface = {
    accent: string;
    glow: string;
    plate: string;
    selectorMeta: string;
};

/**
 * Que se esta rankeando. Los rankings de clubes los calcula esta casa; el de
 * selecciones lo publica World Rugby y entra por `publicRankings.ts`. La
 * pantalla no necesita saber nada mas de esa diferencia que como nombrar a lo
 * que esta listando.
 */
type RankingEntity = 'club' | 'seleccion';

type RankingNouns = {
    /** Encabezado de la columna del nombre. */
    entidad: string;
    /** Como se cuenta en plural: "114 uniones". */
    plural: string;
    /** El plural ya concordado: el genero no se puede deducir de la palabra. */
    publicados: string;
    /** Encabezado de la columna de procedencia. */
    procedencia: string;
    /** Encabezado de la columna del puntaje. */
    puntaje: string;
    /** Titulo por omision del afiche exportado. */
    tituloExport: string;
};

const RANKING_NOUNS: Record<RankingEntity, RankingNouns> = {
    club: {
        entidad: 'Club',
        plural: 'clubes',
        publicados: 'Clubes publicados',
        procedencia: 'Region',
        puntaje: 'OVR Rating',
        tituloExport: 'Ranking de Clubes',
    },
    // "Union" y no "Seleccion": es el rotulo que usa el propio World Rugby, y es
    // el correcto para los que no son paises (Chinese Taipei, Hong Kong China).
    seleccion: {
        entidad: 'Union',
        plural: 'uniones',
        publicados: 'Uniones publicadas',
        procedencia: 'Continente',
        puntaje: 'Puntos WR',
        tituloExport: 'Ranking de World Rugby',
    },
};

function getRankingNouns(entity?: RankingEntity | null): RankingNouns {
    return RANKING_NOUNS[entity ?? 'club'] ?? RANKING_NOUNS.club;
}

function getMovementHighlightStyle(movement: RankingMovementHighlight): CSSProperties {
    return {
        '--movement-color': movement.color,
        // El piso de 0,35 es para que un salto de un solo lugar igual se vea: por
        // debajo de eso el tinte no se distingue del fondo.
        '--movement-strength': String(0.35 + movement.strength * 0.65),
    } as CSSProperties;
}

type PublicRankingSummary = {
    id: string;
    name: string;
    sport?: string | null;
    season: string;
    results_season?: number | null;
    scope?: string | null;
    description?: string | null;
    entity?: RankingEntity | null;
    // Que semana esta mostrando y desde cuando hay historico. Solo los rankings
    // importados los traen; con los dos se dibuja el selector de semana.
    snapshot_date?: string | null;
    history_from?: string | null;
    stale_from_match_id?: string | null;
    stale_reason?: string | null;
    initial_imported_at?: string | null;
    backfill_completed_at?: string | null;
    last_incremental_match_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    metadata?: Record<string, unknown> | null;
};

type PublicRankingEntry = {
    id: string;
    // Null en el ranking de selecciones: una union no es una fila de `clubs`.
    club_id: string | null;
    source_name: string;
    source_region?: string | null;
    current_position?: number | null;
    source_previous_position?: number | null;
    current_rating?: number | string | null;
    previous_rating?: number | string | null;
    initial_rating?: number | string | null;
    clubs?: {
        name?: string | null;
        short_name?: string | null;
        logo_url?: string | null;
    } | null;
};

type PublicRankingDetail = {
    ranking: PublicRankingSummary;
    entries: PublicRankingEntry[];
};

const DEFAULT_SURFACE: SportSurface = {
    accent: '#00ff88',
    glow: 'rgba(0, 255, 136, 0.15)',
    plate: 'rgba(0, 255, 136, 0.12)',
    selectorMeta: 'Catalogo activo',
};

const PUBLIC_RANKING_PAGE_SIZE = 20;

const SPORT_SURFACES: Record<string, SportSurface> = {
    rugby: {
        accent: '#00ff88',
        glow: 'rgba(0, 255, 136, 0.15)',
        plate: 'rgba(0, 255, 136, 0.12)',
        selectorMeta: 'Union / 7s',
    },
    football: {
        accent: '#2f7df6',
        glow: 'rgba(47, 125, 246, 0.16)',
        plate: 'rgba(47, 125, 246, 0.12)',
        selectorMeta: 'Profesional',
    },
    basketball: {
        accent: '#ff8a00',
        glow: 'rgba(255, 138, 0, 0.16)',
        plate: 'rgba(255, 138, 0, 0.12)',
        selectorMeta: 'Liga nacional',
    },
    tennis: {
        accent: '#c4a500',
        glow: 'rgba(196, 165, 0, 0.16)',
        plate: 'rgba(196, 165, 0, 0.12)',
        selectorMeta: 'Circuito',
    },
    hockey: {
        accent: '#00a9c7',
        glow: 'rgba(0, 169, 199, 0.16)',
        plate: 'rgba(0, 169, 199, 0.12)',
        selectorMeta: 'Metropolitano',
    },
    volleyball: {
        accent: '#ff5d73',
        glow: 'rgba(255, 93, 115, 0.16)',
        plate: 'rgba(255, 93, 115, 0.12)',
        selectorMeta: 'Aclav',
    },
    'american-football': {
        accent: '#d18b00',
        glow: 'rgba(209, 139, 0, 0.16)',
        plate: 'rgba(209, 139, 0, 0.12)',
        selectorMeta: 'Tackle / flag',
    },
};

function getSportSurface(sportId: string) {
    return SPORT_SURFACES[sportId] ?? DEFAULT_SURFACE;
}

function getSportLabel(sport: Sport) {
    return sport.nameEs || sport.name || sport.id;
}

function buildRankingsHref(sportId: string, rankingId?: string | null, fecha?: string | null) {
    const params = new URLSearchParams({ sport: sportId });
    if (rankingId) params.set('ranking', rankingId);
    // La semana viaja en la URL para que una tabla del pasado se pueda compartir
    // y sobreviva a un F5. Sin fecha = la vigente.
    if (fecha) params.set('fecha', fecha);
    return `/rankings?${params.toString()}`;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Corre una fecha ISO N dias, sin pasar por el huso horario del que mira. */
function shiftIsoDate(iso: string, days: number): string {
    const [year, month, day] = iso.split('-').map(Number);
    const moved = new Date(Date.UTC(year, month - 1, day + days));
    return moved.toISOString().slice(0, 10);
}

function clampIsoDate(iso: string, min: string, max: string): string {
    if (min && iso < min) return min;
    if (max && iso > max) return max;
    return iso;
}

async function readJson(response: Response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo completar la operacion.');
    }
    return payload;
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return '-';
    try {
        // Zona horaria explicita: el backend guarda en UTC y sin esto la hora sale
        // en la del entorno que renderiza, que en el server no es la del lector.
        return new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function getPositionLabelStyle(label: Pick<RankingPositionLabel, 'color'>) {
    return {
        '--position-label-color': label.color,
    } as CSSProperties;
}

function formatLegendPosition(position: number) {
    return `#${String(position).padStart(2, '0')}`;
}

function RankingsPageFallback() {
    const pageStyle = {
        '--rankings-accent': DEFAULT_SURFACE.accent,
        '--rankings-glow': DEFAULT_SURFACE.glow,
        '--rankings-plate': DEFAULT_SURFACE.plate,
    } as CSSProperties;

    return (
        <div className={styles.page} style={pageStyle}>
            <div className="container">
                <div className={styles.inlineState}>
                    <RefreshCw size={16} className={styles.spin} />
                    <span>Cargando rankings...</span>
                </div>
            </div>
        </div>
    );
}

export type RankingsClientProps = {
    // Datos resueltos en el servidor para el `?sport=` y el `?ranking=` de la URL.
    // No son solo un atajo de carga: sembrar el estado hace que el HTML del primer
    // render ya traiga la tabla. Cuando los datos entraban por useEffect, el paso
    // de servidor renderizaba el estado vacio y un buscador no veia ni un club.
    initialSportId?: string;
    initialRankings?: PublicRankingSummary[];
    initialDetail?: PublicRankingDetail | null;
};

export default function RankingsClient(props: RankingsClientProps) {
    return (
        <Suspense fallback={<RankingsPageFallback />}>
            <RankingsPageContent {...props} />
        </Suspense>
    );
}

function RankingsPageContent({ initialSportId, initialRankings, initialDetail }: RankingsClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { selectedSport, activeSports, setSelectedSport } = useSport();
    const { user, isLoading: authLoading } = useAuth();
    const [rankingList, setRankingList] = useState<PublicRankingSummary[]>(initialRankings ?? []);
    const [rankingDetail, setRankingDetail] = useState<PublicRankingDetail | null>(initialDetail ?? null);
    // Marcar como ya cargado lo que vino del servidor evita que la primera pintura
    // muestre "Cargando" sobre datos que ya tenemos.
    const [loadedSportId, setLoadedSportId] = useState(initialRankings ? (initialSportId ?? '') : '');
    // La clave lleva la semana: cambiar de fecha sin cambiar de ranking tambien
    // es una carga nueva, y con solo el id la pantalla se creia al dia.
    const [loadedDetailKey, setLoadedDetailKey] = useState(
        initialDetail ? `${initialDetail.ranking.id}|${ISO_DATE_REGEX.test((searchParams.get('fecha') ?? '').trim()) ? (searchParams.get('fecha') ?? '').trim() : ''}` : '',
    );
    const [publicError, setPublicError] = useState<string | null>(null);
    const [tablePageState, setTablePageState] = useState({ rankingId: '', page: 1 });

    const sportParam = searchParams.get('sport');
    const rankingParam = searchParams.get('ranking');
    // Una fecha con otra forma se ignora: la escribe cualquiera en la barra.
    const fechaParam = (searchParams.get('fecha') ?? '').trim();
    const selectedDate = ISO_DATE_REGEX.test(fechaParam) ? fechaParam : '';

    useEffect(() => {
        if (!sportParam) return;

        const nextSport = activeSports.find((sport) => sport.id === sportParam);
        if (!nextSport || nextSport.id === selectedSport.id) return;

        setSelectedSport(nextSport);
    }, [activeSports, selectedSport.id, setSelectedSport, sportParam]);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        // Sin `no-store`: la ruta declara su propio Cache-Control y el ranking lo
        // recalcula el cron, no la visita.
        fetch(`/api/rankings?sport=${encodeURIComponent(selectedSport.id)}`, {
            signal: controller.signal,
        })
            .then(readJson)
            .then((payload) => {
                if (cancelled) return;
                setRankingList(Array.isArray(payload?.data) ? payload.data as PublicRankingSummary[] : []);
                setPublicError(null);
                setLoadedSportId(selectedSport.id);
            })
            .catch((error) => {
                if (cancelled || error?.name === 'AbortError') return;
                setPublicError(error instanceof Error ? error.message : 'No se pudieron cargar los rankings publicados.');
                setRankingList([]);
                setLoadedSportId(selectedSport.id);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [selectedSport.id]);

    const selectedRankingId = useMemo(() => {
        if (rankingParam && rankingList.some((ranking) => ranking.id === rankingParam)) return rankingParam;
        return rankingList[0]?.id ?? '';
    }, [rankingList, rankingParam]);

    useEffect(() => {
        if (!selectedSport.id) return;

        if (!rankingList.length) {
            if (rankingParam) {
                router.replace(buildRankingsHref(selectedSport.id), { scroll: false });
            }
            return;
        }

        if (!rankingParam || !rankingList.some((ranking) => ranking.id === rankingParam)) {
            router.replace(buildRankingsHref(selectedSport.id, rankingList[0].id, selectedDate), { scroll: false });
        }
    }, [rankingList, rankingParam, router, selectedDate, selectedSport.id]);

    const detailKey = selectedRankingId ? `${selectedRankingId}|${selectedDate}` : '';

    useEffect(() => {
        if (!selectedRankingId) return;
        if (detailKey === loadedDetailKey) return;

        let cancelled = false;
        const controller = new AbortController();
        const query = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : '';

        fetch(`/api/rankings/${encodeURIComponent(selectedRankingId)}${query}`, {
            signal: controller.signal,
        })
            .then(readJson)
            .then((payload) => {
                if (cancelled) return;
                setRankingDetail((payload?.data ?? null) as PublicRankingDetail | null);
                setPublicError(null);
                setLoadedDetailKey(detailKey);
            })
            .catch((error) => {
                if (cancelled || error?.name === 'AbortError') return;
                setPublicError(error instanceof Error ? error.message : 'No se pudo cargar la tabla publicada.');
                setLoadedDetailKey(detailKey);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
        // `loadedDetailKey` NO va en las dependencias: lo escribe este mismo
        // efecto, y ponerlo lo haria correr de nuevo apenas termina.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailKey, selectedDate, selectedRankingId]);

    const surface = getSportSurface(selectedSport.id);
    const sportLabel = getSportLabel(selectedSport);
    const activeRankingDetail = rankingDetail?.ranking.id === selectedRankingId ? rankingDetail : null;
    const loadingList = loadedSportId !== selectedSport.id;
    const loadingDetail = detailKey ? loadedDetailKey !== detailKey : false;
    // El del catalogo describe el ranking VIGENTE; el del detalle describe la foto
    // que se esta mirando. Cuando alguien pide una semana del pasado no son el
    // mismo: la leyenda decia "base 2026" abajo de la tabla del Mundial 2019.
    const rankingDelCatalogo = useMemo(
        () => rankingList.find((ranking) => ranking.id === selectedRankingId) ?? null,
        [rankingList, selectedRankingId],
    );
    // Para MOSTRAR manda la foto; mientras carga, lo del catalogo alcanza.
    const selectedRanking = activeRankingDetail?.ranking ?? rankingDelCatalogo;
    // El subrayado por movimiento es exclusivo del ranking de World Rugby.
    const subrayaMovimiento = selectedRanking?.entity === 'seleccion';
    const rankingPositionLabels = useMemo(
        () => normalizeRankingPositionLabels(activeRankingDetail?.ranking.metadata?.positionLabels ?? selectedRanking?.metadata?.positionLabels),
        [activeRankingDetail?.ranking.metadata?.positionLabels, selectedRanking?.metadata?.positionLabels],
    );
    const rankingLegendItems = useMemo(() => {
        const groups: Array<{ color: string; end: number; label: string; start: number }> = [];

        rankingPositionLabels.forEach((item) => {
            const last = groups[groups.length - 1];
            if (last && last.color === item.color && last.label === item.label && last.end + 1 === item.position) {
                last.end = item.position;
                return;
            }

            groups.push({
                color: item.color,
                end: item.position,
                label: item.label,
                start: item.position,
            });
        });

        return groups.map((item) => ({
            ...item,
            rangeLabel: item.start === item.end
                ? formatLegendPosition(item.start)
                : `${formatLegendPosition(item.start)}-${formatLegendPosition(item.end)}`,
        }));
    }, [rankingPositionLabels]);
    const topEntries = activeRankingDetail?.entries.slice(0, 5) ?? [];
    const topThree = topEntries.slice(0, 3);
    const hasEntries = topEntries.length > 0;
    const tablePage = tablePageState.rankingId === selectedRankingId ? tablePageState.page : 1;
    const paginatedEntries = useMemo(
        () => paginateRankingEntries(activeRankingDetail?.entries ?? [], tablePage, PUBLIC_RANKING_PAGE_SIZE),
        [activeRankingDetail?.entries, tablePage],
    );
    const visibleEntries = paginatedEntries.items;
    const rankingExportRows = useMemo(
        () => buildRankingExportRows(activeRankingDetail?.entries ?? [], rankingPositionLabels, {
            movementHighlight: subrayaMovimiento,
        }),
        [activeRankingDetail?.entries, rankingPositionLabels, subrayaMovimiento],
    );
    const rankingExportSubtitle = selectedRanking?.description?.trim()
        || `Base ${selectedRanking?.season || '-'} / resultados ${selectedRanking?.results_season || '-'}`;
    // El afiche del ranking lo baja cualquiera, invitado incluido: solo se espera
    // a que resuelva la sesion para no dibujar el boton y sacarlo un tick despues.
    //
    // `montado` no es decorativo: sin el, esta seccion rompia la hidratacion. El
    // servidor la omite (ahi la sesion siempre esta cargando), pero este arbol
    // cuelga de un <Suspense> —lo pide `useSearchParams`— asi que hidrata TARDE,
    // cuando el efecto de AuthContext ya resolvio la sesion desde el cache y
    // `authLoading` es false. React comparaba un HTML sin seccion contra un
    // cliente con seccion. Con `montado` el primer render del cliente es
    // identico al del servidor y la seccion entra recien en el segundo.
    const [montado, setMontado] = useState(false);
    useEffect(() => { setMontado(true); }, []);
    const canExportPublicRanking = montado && !authLoading;

    const rankingStatusLabel = loadingList || loadingDetail
        ? 'Cargando'
        : selectedRanking?.stale_from_match_id
            ? 'Revision'
            : hasEntries
                ? 'Publicado'
                : 'Sin datos';
    const rankingStatusTone = loadingList || loadingDetail
        ? styles.statusLoading
        : selectedRanking?.stale_from_match_id
            ? styles.statusWarning
            : hasEntries
                ? styles.statusPublished
                : styles.statusIdle;
    const nouns = getRankingNouns(selectedRanking?.entity);
    const heroDescription = hasEntries
        ? `${selectedRanking?.name || 'Ranking activo'} ya esta publicado con ${activeRankingDetail?.entries.length ?? 0} ${nouns.plural} y base ${selectedRanking?.season || '-'}.`
        : 'Esta vista publica muestra el ranking guardado para el deporte activo. Cuando no aparece la tabla, es porque todavia no hay una version publicada.';
    const lastRun = formatDateTime(selectedRanking?.backfill_completed_at || selectedRanking?.updated_at);
    const summaryTitle = selectedRanking?.description || `Vista publica de ${sportLabel}`;
    const readoutLabel = topEntries[0] ? getRankingClubShortName(topEntries[0]) : 'Sin lider publicado';
    const pageStyle = {
        '--rankings-accent': surface.accent,
        '--rankings-glow': surface.glow,
        '--rankings-plate': surface.plate,
    } as CSSProperties;

    const handleSportChange = (sport: Sport) => {
        if (sport.id !== selectedSport.id) {
            setSelectedSport(sport);
        }

        router.replace(buildRankingsHref(sport.id), { scroll: false });
    };

    const handleRankingChange = (rankingId: string) => {
        router.replace(buildRankingsHref(selectedSport.id, rankingId, selectedDate), { scroll: false });
    };

    // La foto que se esta mirando y los dos bordes del historico. `semanaTope` es
    // la vigente: no hay ranking despues del ultimo publicado.
    const historyFrom = rankingDelCatalogo?.history_from ?? selectedRanking?.history_from ?? '';
    const semanaTope = rankingDelCatalogo?.snapshot_date ?? selectedRanking?.snapshot_date ?? '';
    const semanaMostrada = selectedDate || semanaTope;
    const tieneHistorico = Boolean(historyFrom && semanaTope);
    const enLaSemanaVigente = !selectedDate || semanaMostrada >= semanaTope;

    const irASemana = (fecha: string) => {
        if (!tieneHistorico) return;
        const destino = clampIsoDate(fecha, historyFrom, semanaTope);
        router.replace(
            // Volver a la vigente es sacar la fecha de la URL, no fijar la de hoy:
            // asi la pagina sigue mostrando la ultima aunque pase una semana.
            buildRankingsHref(selectedSport.id, selectedRankingId, destino >= semanaTope ? '' : destino),
            { scroll: false },
        );
    };

    const setTablePage = (page: number) => {
        setTablePageState({
            rankingId: selectedRankingId,
            page: Number.isFinite(page) ? page : 1,
        });

        // Son 8 paginas: sin esto, cambiar de pagina te deja al pie mirando la
        // leyenda en vez del puesto #21.
        document.getElementById('tabla-ranking')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    };

    return (
        <div className={styles.page} style={pageStyle}>
            <header className="container">
                <MobileSectionTabs
                    activeTab="rankings"
                    rankingsHref={buildRankingsHref(selectedSport.id, selectedRankingId || undefined)}
                />
                <div className={styles.hero}>
                    <div className={styles.heroContent}>
                        <div className={styles.label}>
                            <span className={styles.labelDot} />
                            G22 Analytics Core
                        </div>
                        <h1>Rankings de {sportLabel}</h1>
                        <p>{heroDescription}</p>
                        <div className={styles.heroActions}>
                            {hasEntries ? (
                                <>
                                    <a href="#tabla-ranking" className={`${styles.btn} ${styles.btnPrimary}`}>
                                        Ver tabla
                                        <ArrowRight size={16} />
                                    </a>
                                    <Link href="/clubs" className={`${styles.btn} ${styles.btnSecondary}`}>
                                        Ver clubes
                                    </Link>
                                </>
                            ) : (
                                // Sin tabla no hay dos destinos que ofrecer: antes se
                                // repetia "Ver clubes" en los dos botones.
                                <Link href="/clubs" className={`${styles.btn} ${styles.btnPrimary}`}>
                                    Ver clubes
                                    <ArrowRight size={16} />
                                </Link>
                            )}
                        </div>
                    </div>

                    <aside className={`${styles.techBorder} ${styles.summaryCard}`}>
                        <div className={styles.summaryCardHeader}>
                            <div>
                                <span className={styles.summaryCardKicker}>{selectedRanking?.name || 'Sin ranking cargado'}</span>
                                <h2>{summaryTitle}</h2>
                            </div>
                            <span className={`${styles.statusBadge} ${rankingStatusTone}`}>{rankingStatusLabel}</span>
                        </div>

                        <div className={styles.summaryMetrics}>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{sportLabel}</span>
                                <span className={styles.metricLabel}>Deporte</span>
                            </div>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{rankingList.length}</span>
                                <span className={styles.metricLabel}>Rankings guardados</span>
                            </div>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{activeRankingDetail?.entries.length ?? 0}</span>
                                <span className={styles.metricLabel}>{nouns.publicados}</span>
                            </div>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{lastRun}</span>
                                <span className={styles.metricLabel}>Ultima corrida</span>
                            </div>
                        </div>

                        <div className={styles.topThree}>
                            <div className={styles.topThreeHeader}>
                                <span>Top 3</span>
                                <span>{selectedRanking?.season || '-'}</span>
                            </div>
                            {topThree.length ? (
                                <div className={styles.topThreeList}>
                                    {topThree.map((entry) => (
                                        <div key={entry.id} className={styles.topClub}>
                                            <TeamLogo
                                                name={getRankingClubName(entry)}
                                                shortName={getRankingClubShortName(entry)}
                                                teamId={entry.club_id}
                                                logoUrl={entry.clubs?.logo_url}
                                                className={styles.topClubLogo}
                                                size={28}
                                            />
                                            <span className={styles.topRank}>
                                                {String(entry.current_position || '-').padStart(2, '0')}
                                            </span>
                                            <span className={styles.topName}>
                                                {entry.clubs?.short_name || entry.clubs?.name || entry.source_name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={styles.topThreeEmpty}>
                                    Todavia no hay una tabla publicada para este deporte.
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </header>

            <div className="container">
                <section className={styles.sectionBlock}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Seleccionar deporte</h3>
                        <span className={styles.sectionMeta}>
                            {activeSports.length} deporte{activeSports.length === 1 ? '' : 's'} activo{activeSports.length === 1 ? '' : 's'}
                        </span>
                    </div>
                    <div className={styles.sportSelector}>
                        {activeSports.map((sport) => {
                            const isActive = sport.id === selectedSport.id;
                            const sportSurface = getSportSurface(sport.id);

                            return (
                                <button
                                    key={sport.id}
                                    type="button"
                                    className={`${styles.sportChip} ${isActive ? styles.sportChipActive : ''}`}
                                    onClick={() => handleSportChange(sport)}
                                    aria-pressed={isActive}
                                >
                                    <strong>{getSportLabel(sport)}</strong>
                                    <span>{sportSurface.selectorMeta}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className={styles.sectionBlock}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Rankings disponibles</h3>
                        <span className={styles.sectionMeta}>
                            {loadingList ? 'Cargando versiones' : `${rankingList.length} publicados`}
                        </span>
                    </div>

                    {loadingList ? (
                        <div className={styles.inlineState}>
                            <RefreshCw size={16} className={styles.spin} />
                            <span>Cargando rankings publicados...</span>
                        </div>
                    ) : rankingList.length ? (
                        <div className={styles.rankingSelector}>
                            {rankingList.map((ranking) => (
                                <button
                                    key={ranking.id}
                                    type="button"
                                    className={`${styles.rankingChip} ${ranking.id === selectedRankingId ? styles.rankingChipActive : ''}`}
                                    onClick={() => handleRankingChange(ranking.id)}
                                    aria-pressed={ranking.id === selectedRankingId}
                                >
                                    <div className={styles.rankingChipHead}>
                                        <strong>{ranking.name}</strong>
                                        <span>{ranking.stale_from_match_id ? 'Revision' : 'Publicado'}</span>
                                    </div>
                                    <small>
                                        Base {ranking.season} / resultados {ranking.results_season || '-'}
                                    </small>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.inlineState}>
                            <Shield size={16} />
                            <span>No hay rankings publicados todavia para {sportLabel}.</span>
                        </div>
                    )}
                </section>

                <section className={`${styles.sectionBlock} ${styles.leadersSection}`}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Lideres de division</h3>
                        <span className={styles.sectionMeta}>Top 5 publicado</span>
                    </div>

                    {publicError && !loadingDetail ? (
                        <div className={styles.errorState}>
                            <AlertCircle size={16} />
                            <span>{publicError}</span>
                        </div>
                    ) : null}

                    {loadingDetail && !activeRankingDetail ? (
                        <div className={styles.inlineState}>
                            <RefreshCw size={16} className={styles.spin} />
                            <span>Cargando tabla del ranking...</span>
                        </div>
                    ) : null}

                    {!loadingDetail && hasEntries ? (
                        <div className={styles.topGrid}>
                            {topEntries.map((entry, index) => {
                                const delta = getRankingDelta(entry.current_rating, getRankingPreviousRating(entry));
                                const position = entry.current_position || index + 1;

                                return (
                                    <article
                                        key={entry.id}
                                        className={styles.rankCard}
                                        data-rank={String(position)}
                                    >
                                        <div className={styles.rankBadge}>{position}</div>
                                        <div className={styles.rankHeader}>
                                            <TeamLogo
                                                name={getRankingClubName(entry)}
                                                shortName={getRankingClubShortName(entry)}
                                                teamId={entry.club_id}
                                                logoUrl={entry.clubs?.logo_url}
                                                className={styles.rankLogo}
                                                size={42}
                                            />
                                            <div className={styles.rankName}>
                                                {entry.clubs?.short_name || entry.clubs?.name || entry.source_name}
                                            </div>
                                        </div>
                                        <div className={styles.rankMeta}>
                                            {entry.source_region || selectedRanking?.scope || 'Sin region informada'}
                                        </div>
                                        <div className={styles.rankStats}>
                                            <span className={styles.rankOvr}>{formatRankingRating(entry.current_rating)}</span>
                                            <span
                                                className={
                                                    delta.tone === 'positive'
                                                        ? styles.deltaPositive
                                                        : delta.tone === 'negative'
                                                            ? styles.deltaNegative
                                                            : styles.deltaNeutral
                                                }
                                            >
                                                {delta.label}
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : !loadingDetail ? (
                        <div className={styles.inlineState}>
                            <Layers3 size={16} />
                            <span>
                                {rankingList.length
                                    ? `Este ranking todavia no tiene ${nouns.plural} publicad${nouns.publicados.endsWith('as') ? 'a' : 'o'}s.`
                                    : 'Cuando guardes un ranking en el panel, va a aparecer aca automaticamente.'}
                            </span>
                        </div>
                    ) : null}
                </section>
            </div>

            <div className="container">
                <section className={`${styles.sectionBlock} ${styles.tableSection}`} id="tabla-ranking">
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Tabla completa de posiciones</h3>
                    </div>

                    {/* Solo los rankings con fotos semanales tienen pasado que
                        mirar. El de clubes guarda un estado, no una serie. */}
                    {tieneHistorico ? (
                        <div className={styles.weekPicker}>
                            <span className={styles.weekPickerLabel}>Semana</span>
                            <button
                                type="button"
                                className={styles.weekPickerStep}
                                onClick={() => irASemana(shiftIsoDate(semanaMostrada, -7))}
                                disabled={semanaMostrada <= historyFrom}
                                aria-label="Semana anterior"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <input
                                type="date"
                                className={styles.weekPickerInput}
                                value={semanaMostrada}
                                min={historyFrom}
                                max={semanaTope}
                                onChange={(event) => irASemana(event.target.value)}
                                aria-label="Elegir la semana del ranking"
                            />
                            <button
                                type="button"
                                className={styles.weekPickerStep}
                                onClick={() => irASemana(shiftIsoDate(semanaMostrada, 7))}
                                disabled={enLaSemanaVigente}
                                aria-label="Semana siguiente"
                            >
                                <ChevronRight size={16} />
                            </button>
                            {enLaSemanaVigente ? (
                                <span className={styles.weekPickerNow}>Ranking vigente</span>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.weekPickerReset}
                                    onClick={() => irASemana(semanaTope)}
                                >
                                    Volver al vigente
                                </button>
                            )}
                        </div>
                    ) : null}

                    {/* El motivo del "Revision" ya viaja en la API; sin pintarlo, el
                        lector ve la chapa y no sabe de que. Va aca y no en la cabecera
                        porque la cabecera se esconde en mobile. */}
                    {selectedRanking?.stale_from_match_id ? (
                        <div className={styles.staleNote}>
                            <AlertCircle size={16} />
                            <span>
                                {selectedRanking.stale_reason
                                    || 'Este ranking espera un recalculo, asi que puede no reflejar los ultimos resultados.'}
                            </span>
                        </div>
                    ) : null}

                    {hasEntries ? (
                        <>
                            <div className={`${styles.techBorder} ${styles.tableContainer}`}>
                                <table className={styles.table}>
                                    <caption className={styles.tableCaption}>
                                        {selectedRanking?.name || nouns.tituloExport} — {activeRankingDetail?.entries.length ?? 0} {nouns.plural}, base {selectedRanking?.season || '-'}
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Pos</th>
                                            <th scope="col">{nouns.entidad}</th>
                                            <th scope="col">{nouns.procedencia}</th>
                                            <th scope="col">Anterior</th>
                                            <th scope="col">Delta</th>
                                            <th scope="col">{nouns.puntaje}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleEntries.map((entry, index) => {
                                            const previousRating = getRankingPreviousRating(entry);
                                            const delta = getRankingDelta(entry.current_rating, previousRating);
                                            const absoluteIndex = paginatedEntries.start + index + 1;
                                            const clubName = getRankingClubName(entry);
                                            const position = entry.current_position || absoluteIndex;
                                            const positionChange = getRankingPositionChange(entry.current_position, entry.source_previous_position);
                                            const positionLabel = getRankingPositionLabel(rankingPositionLabels, position);
                                            // La zona manda sobre el movimiento: si la fila ya tiene
                                            // color por ascenso o descenso, no se le encima un segundo.
                                            const movement = subrayaMovimiento && !positionLabel
                                                ? getRankingMovementHighlight(position, entry.source_previous_position)
                                                : null;

                                            return (
                                                <tr
                                                    key={entry.id}
                                                    className={
                                                        positionLabel
                                                            ? styles.positionLabeledRow
                                                            : movement
                                                                ? styles.movementRow
                                                                : undefined
                                                    }
                                                    style={
                                                        positionLabel
                                                            ? getPositionLabelStyle(positionLabel)
                                                            : movement
                                                                ? getMovementHighlightStyle(movement)
                                                                : undefined
                                                    }
                                                >
                                                    <td className={styles.posCell} data-label="Pos">
                                                        <span className={styles.posWrap}>
                                                            <span>#{String(position).padStart(2, '0')}</span>
                                                            {positionChange ? (
                                                                <span
                                                                    className={
                                                                        positionChange.tone === 'positive'
                                                                            ? styles.positionUp
                                                                            : styles.positionDown
                                                                    }
                                                                >
                                                                    {positionChange.label}
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                    </td>
                                                    <td className={styles.clubCell} data-label="Club">
                                                        <TeamLogo
                                                            name={clubName}
                                                            shortName={getRankingClubShortName(entry)}
                                                            teamId={entry.club_id}
                                                            logoUrl={entry.clubs?.logo_url}
                                                            className={styles.clubLogo}
                                                            fallbackClassName={styles.clubLogoFallbackText}
                                                            size={28}
                                                            title={`Logo de ${clubName}`}
                                                        />
                                                        <div className={styles.clubCopy}>
                                                            <strong>{clubName}</strong>
                                                            <span>{getRankingClubShortName(entry)}</span>
                                                            <span className={styles.clubMetaMobile}>{entry.source_region || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td data-label={nouns.procedencia}>{entry.source_region || '-'}</td>
                                                    <td data-label="Anterior">{formatRankingRating(previousRating)}</td>
                                                    <td
                                                        data-label="Delta"
                                                        className={
                                                            delta.tone === 'positive'
                                                                ? styles.deltaPositive
                                                                : delta.tone === 'negative'
                                                                    ? styles.deltaNegative
                                                                    : styles.deltaNeutral
                                                        }
                                                    >
                                                        {delta.label}
                                                    </td>
                                                    <td className={styles.ovrCell} data-label={nouns.puntaje}>
                                                        {formatRankingRating(entry.current_rating)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {rankingLegendItems.length ? (
                                <div className={styles.positionLegend} aria-label="Leyenda de puestos">
                                    <span className={styles.positionLegendTitle}>Leyenda</span>
                                    {rankingLegendItems.map((item) => (
                                        <div
                                            key={`${item.rangeLabel}-${item.label}-${item.color}`}
                                            className={styles.positionLegendItem}
                                            style={getPositionLabelStyle(item)}
                                        >
                                            <span className={styles.positionLegendSwatch} />
                                            <strong>{item.rangeLabel}</strong>
                                            <span>{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <div className={styles.paginationBar}>
                                <span className={styles.paginationMeta}>
                                    Mostrando {visibleEntries.length ? paginatedEntries.start + 1 : 0}-{paginatedEntries.start + visibleEntries.length} de {activeRankingDetail?.entries.length ?? 0}
                                </span>
                                <div className={styles.paginationControls}>
                                    <button
                                        type="button"
                                        className={styles.paginationBtn}
                                        onClick={() => setTablePage(Math.max(1, paginatedEntries.page - 1))}
                                        disabled={paginatedEntries.page <= 1}
                                    >
                                        <ChevronLeft size={14} />
                                        Anterior
                                    </button>
                                    <span className={styles.paginationPage}>
                                        Pagina {paginatedEntries.page} de {paginatedEntries.totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.paginationBtn}
                                        onClick={() => setTablePage(Math.min(paginatedEntries.totalPages, paginatedEntries.page + 1))}
                                        disabled={paginatedEntries.page >= paginatedEntries.totalPages}
                                    >
                                        Siguiente
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className={styles.inlineState}>
                            <Layers3 size={16} />
                            <span>No hay tabla publica disponible para este ranking.</span>
                        </div>
                    )}
                </section>
            </div>

            <section className={styles.readoutSection}>
                <div className="container">
                    <div className={styles.readoutRow}>
                        <div>
                            <span className={styles.sectionTitle}>Lectura rapida</span>
                            <p className={styles.readoutText}>
                                {rankingList.length
                                    ? `${rankingList.length} ranking${rankingList.length === 1 ? '' : 's'} cargado${rankingList.length === 1 ? '' : 's'} y ${activeRankingDetail?.entries.length ?? 0} ${nouns.publicados.toLowerCase()}.`
                                    : 'Sin rankings cargados para este deporte.'}
                            </p>
                        </div>
                        <div className={styles.readoutMeta}>
                            <div className={styles.readoutChip}>
                                <Trophy size={14} />
                                <span>{readoutLabel}</span>
                            </div>
                            <div className={styles.readoutChip}>
                                <Sparkles size={14} />
                                <span>{selectedRanking?.season || '-'}</span>
                            </div>
                            <div className={styles.readoutChip}>
                                <Shield size={14} />
                                <span>{rankingStatusLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {hasEntries && canExportPublicRanking ? (
                <section className={styles.exportSection}>
                    <div className="container">
                        <div className={styles.exportSectionInner}>
                            <ExportImage
                                className={styles.exportSectionAction}
                                template="standings"
                                filename={`ranking-${selectedRanking?.name || selectedSport.id}`}
                                data={{
                                    title: selectedRanking?.name || nouns.tituloExport,
                                    subtitle: rankingExportSubtitle,
                                    rows: rankingExportRows,
                                    columnLabels: subrayaMovimiento
                                        ? WORLD_RUGBY_EXPORT_COLUMN_LABELS
                                        : RANKING_EXPORT_COLUMN_LABELS,
                                    plainDiff: true,
                                    showPositionDelta: true,
                                    variant: 'rankingPoster',
                                }}
                            />
                        </div>
                    </div>
                </section>
            ) : null}
        </div>
    );
}
