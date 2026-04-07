'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import ExportImage from '@/components/ExportImage';
import MobileSectionTabs from '@/components/MobileSectionTabs';
import {
    buildRankingExportRows,
    formatRankingRating,
    getRankingClubName,
    getRankingClubShortName,
    getRankingDelta,
    getRankingPreviousRating,
    getRankingPositionLabel,
    paginateRankingEntries,
    RANKING_EXPORT_COLUMN_LABELS,
    normalizeRankingPositionLabels,
    type RankingPositionLabel,
} from '@/lib/rankings/rankingTable';

type SportSurface = {
    accent: string;
    glow: string;
    plate: string;
    label: string;
    spotlight: string;
    selectorMeta: string;
};

type PublicRankingSummary = {
    id: string;
    name: string;
    sport?: string | null;
    season: string;
    results_season?: number | null;
    scope?: string | null;
    description?: string | null;
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
    club_id: string;
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
    label: 'Deporte',
    spotlight: 'Vista publica conectada al ranking guardado, en un layout compacto y editorial.',
    selectorMeta: 'Catalogo activo',
};

const PUBLIC_RANKING_PAGE_SIZE = 20;

const SPORT_SURFACES: Record<string, SportSurface> = {
    rugby: {
        accent: '#00ff88',
        glow: 'rgba(0, 255, 136, 0.15)',
        plate: 'rgba(0, 255, 136, 0.12)',
        label: 'Rugby',
        spotlight: 'Analisis algoritimico de rendimiento por clubes, listo para consulta publica.',
        selectorMeta: 'Union / 7s',
    },
    football: {
        accent: '#2f7df6',
        glow: 'rgba(47, 125, 246, 0.16)',
        plate: 'rgba(47, 125, 246, 0.12)',
        label: 'Futbol',
        spotlight: 'Ranking publico guardado por deporte, temporada y resultados cargados.',
        selectorMeta: 'Profesional',
    },
    basketball: {
        accent: '#ff8a00',
        glow: 'rgba(255, 138, 0, 0.16)',
        plate: 'rgba(255, 138, 0, 0.12)',
        label: 'Basquet',
        spotlight: 'Lectura tecnica para ver lideres, tabla y variaciones del ranking activo.',
        selectorMeta: 'Liga nacional',
    },
    tennis: {
        accent: '#c4a500',
        glow: 'rgba(196, 165, 0, 0.16)',
        plate: 'rgba(196, 165, 0, 0.12)',
        label: 'Tenis',
        spotlight: 'Vista publica preparada para mostrar versiones guardadas del ranking.',
        selectorMeta: 'Circuito',
    },
    hockey: {
        accent: '#00a9c7',
        glow: 'rgba(0, 169, 199, 0.16)',
        plate: 'rgba(0, 169, 199, 0.12)',
        label: 'Hockey',
        spotlight: 'Panel editorial compacto con foco en tabla, top y estado del ranking.',
        selectorMeta: 'Metropolitano',
    },
    volleyball: {
        accent: '#ff5d73',
        glow: 'rgba(255, 93, 115, 0.16)',
        plate: 'rgba(255, 93, 115, 0.12)',
        label: 'Voley',
        spotlight: 'La publicacion del ranking queda resuelta en una sola vista de consulta rapida.',
        selectorMeta: 'Aclav',
    },
    'american-football': {
        accent: '#d18b00',
        glow: 'rgba(209, 139, 0, 0.16)',
        plate: 'rgba(209, 139, 0, 0.12)',
        label: 'Futbol americano',
        spotlight: 'La vista publica se adapta al deporte activo sin perder densidad util.',
        selectorMeta: 'Tackle / flag',
    },
};

function getSportSurface(sportId: string) {
    return SPORT_SURFACES[sportId] ?? DEFAULT_SURFACE;
}

function buildRankingsHref(sportId: string, rankingId?: string | null) {
    const params = new URLSearchParams({ sport: sportId });
    if (rankingId) params.set('ranking', rankingId);
    return `/rankings?${params.toString()}`;
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
        return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
        return value;
    }
}

function getPositionChange(current: number | null | undefined, previous: number | null | undefined) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
        return null;
    }

    const delta = Number(previous) - Number(current);

    if (delta > 0) {
        return {
            label: `+${delta}`,
            className: 'up' as const,
        };
    }

    if (delta < 0) {
        return {
            label: `${delta}`,
            className: 'down' as const,
        };
    }

    return {
        label: '0',
        className: 'same' as const,
    };
}

function getPositionLabelStyle(label: Pick<RankingPositionLabel, 'color'>) {
    return {
        '--position-label-color': label.color,
    } as CSSProperties;
}

function formatLegendPosition(position: number) {
    return `#${String(position).padStart(2, '0')}`;
}

export default function RankingsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { selectedSport, activeSports, setSelectedSport } = useSport();
    const { user } = useAuth();
    const [rankingList, setRankingList] = useState<PublicRankingSummary[]>([]);
    const [rankingDetail, setRankingDetail] = useState<PublicRankingDetail | null>(null);
    const [loadedSportId, setLoadedSportId] = useState('');
    const [loadedRankingId, setLoadedRankingId] = useState('');
    const [publicError, setPublicError] = useState<string | null>(null);
    const [tablePageState, setTablePageState] = useState({ rankingId: '', page: 1 });

    const sportParam = searchParams.get('sport');
    const rankingParam = searchParams.get('ranking');

    useEffect(() => {
        if (!sportParam) return;

        const nextSport = activeSports.find((sport) => sport.id === sportParam);
        if (!nextSport || nextSport.id === selectedSport.id) return;

        setSelectedSport(nextSport);
    }, [activeSports, selectedSport.id, setSelectedSport, sportParam]);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        fetch(`/api/rankings?sport=${encodeURIComponent(selectedSport.id)}`, {
            cache: 'no-store',
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
            router.replace(buildRankingsHref(selectedSport.id, rankingList[0].id), { scroll: false });
        }
    }, [rankingList, rankingParam, router, selectedSport.id]);

    useEffect(() => {
        if (!selectedRankingId) return;

        let cancelled = false;
        const controller = new AbortController();

        fetch(`/api/rankings/${encodeURIComponent(selectedRankingId)}`, {
            cache: 'no-store',
            signal: controller.signal,
        })
            .then(readJson)
            .then((payload) => {
                if (cancelled) return;
                setRankingDetail((payload?.data ?? null) as PublicRankingDetail | null);
                setPublicError(null);
                setLoadedRankingId(selectedRankingId);
            })
            .catch((error) => {
                if (cancelled || error?.name === 'AbortError') return;
                setPublicError(error instanceof Error ? error.message : 'No se pudo cargar la tabla publicada.');
                setLoadedRankingId(selectedRankingId);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [selectedRankingId]);

    const surface = getSportSurface(selectedSport.id);
    const activeRankingDetail = rankingDetail?.ranking.id === selectedRankingId ? rankingDetail : null;
    const loadingList = loadedSportId !== selectedSport.id;
    const loadingDetail = selectedRankingId ? loadedRankingId !== selectedRankingId : false;
    const selectedRanking = useMemo(
        () => rankingList.find((ranking) => ranking.id === selectedRankingId) ?? activeRankingDetail?.ranking ?? null,
        [activeRankingDetail?.ranking, rankingList, selectedRankingId],
    );
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
        () => buildRankingExportRows(activeRankingDetail?.entries ?? []),
        [activeRankingDetail?.entries],
    );
    const rankingExportSubtitle = selectedRanking?.description?.trim()
        || `Base ${selectedRanking?.season || '-'} / resultados ${selectedRanking?.results_season || '-'}`;
    const canExportPublicRanking = user?.role === 'super_admin' || user?.role === 'admin_general';

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
    const heroDescription = hasEntries
        ? `${selectedRanking?.name || 'Ranking activo'} ya esta publicado con ${activeRankingDetail?.entries.length ?? 0} clubes y base ${selectedRanking?.season || '-'}.`
        : 'Esta vista publica muestra el ranking guardado para el deporte activo. Cuando no aparece la tabla, es porque todavia no hay una version publicada.';
    const lastRun = formatDateTime(selectedRanking?.backfill_completed_at || selectedRanking?.updated_at);
    const summaryTitle = selectedRanking?.description || `Vista publica de ${surface.label}`;
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
        router.replace(buildRankingsHref(selectedSport.id, rankingId), { scroll: false });
    };

    const setTablePage = (page: number) => {
        setTablePageState({
            rankingId: selectedRankingId,
            page: Number.isFinite(page) ? page : 1,
        });
    };

    return (
        <main className={styles.page} style={pageStyle}>
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
                        <h1>Rankings de {surface.label}</h1>
                        <p>{heroDescription}</p>
                        <div className={styles.heroActions}>
                            {hasEntries ? (
                                <a href="#tabla-ranking" className={`${styles.btn} ${styles.btnPrimary}`}>
                                    Ver tabla
                                    <ArrowRight size={16} />
                                </a>
                            ) : (
                                <Link href="/clubs" className={`${styles.btn} ${styles.btnPrimary}`}>
                                    Ver clubes
                                    <ArrowRight size={16} />
                                </Link>
                            )}
                            <Link href="/clubs" className={`${styles.btn} ${styles.btnSecondary}`}>
                                Ver clubes
                            </Link>
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
                                <span className={styles.metricValue}>{surface.label}</span>
                                <span className={styles.metricLabel}>Deporte</span>
                            </div>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{rankingList.length}</span>
                                <span className={styles.metricLabel}>Rankings guardados</span>
                            </div>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{activeRankingDetail?.entries.length ?? 0}</span>
                                <span className={styles.metricLabel}>Clubes publicados</span>
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
                                    <h4>{sportSurface.label}</h4>
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
                            <span>No hay rankings publicados todavia para {surface.label}.</span>
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
                                        <div className={styles.rankName}>
                                            {entry.clubs?.short_name || entry.clubs?.name || entry.source_name}
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
                                    ? 'Este ranking todavia no tiene clubes publicados.'
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

                    {hasEntries ? (
                        <>
                            <div className={`${styles.techBorder} ${styles.tableContainer}`}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Pos</th>
                                            <th>Club</th>
                                            <th>Region</th>
                                            <th>Anterior</th>
                                            <th>Delta</th>
                                            <th>OVR Rating</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleEntries.map((entry, index) => {
                                            const previousRating = getRankingPreviousRating(entry);
                                            const delta = getRankingDelta(entry.current_rating, previousRating);
                                            const absoluteIndex = paginatedEntries.start + index + 1;
                                            const clubName = getRankingClubName(entry);
                                            const position = entry.current_position || absoluteIndex;
                                            const positionChange = getPositionChange(entry.current_position, entry.source_previous_position);
                                            const positionLabel = getRankingPositionLabel(rankingPositionLabels, position);

                                            return (
                                                <tr
                                                    key={entry.id}
                                                    className={positionLabel ? styles.positionLabeledRow : undefined}
                                                    style={positionLabel ? getPositionLabelStyle(positionLabel) : undefined}
                                                >
                                                    <td className={styles.posCell} data-label="Pos">
                                                        <span className={styles.posWrap}>
                                                            <span>#{String(position).padStart(2, '0')}</span>
                                                            {positionChange ? (
                                                                <span
                                                                    className={
                                                                        positionChange.className === 'up'
                                                                            ? styles.positionUp
                                                                            : positionChange.className === 'down'
                                                                                ? styles.positionDown
                                                                                : styles.positionSame
                                                                    }
                                                                >
                                                                    {positionChange.label}
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                    </td>
                                                    <td className={styles.clubCell} data-label="Club">
                                                        {entry.clubs?.logo_url ? (
                                                            <img
                                                                src={entry.clubs.logo_url}
                                                                alt={`Logo de ${clubName}`}
                                                                className={styles.clubLogo}
                                                            />
                                                        ) : (
                                                            <div className={styles.clubLogoPlaceholder} />
                                                        )}
                                                        <div className={styles.clubCopy}>
                                                            <strong>{clubName}</strong>
                                                            <span>{getRankingClubShortName(entry)}</span>
                                                            <span className={styles.clubMetaMobile}>{entry.source_region || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td data-label="Region">{entry.source_region || '-'}</td>
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
                                                    <td className={styles.ovrCell} data-label="OVR">
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
                                    ? `${rankingList.length} ranking${rankingList.length === 1 ? '' : 's'} cargado${rankingList.length === 1 ? '' : 's'} y ${activeRankingDetail?.entries.length ?? 0} clubes publicados.`
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
                                    title: selectedRanking?.name || 'Ranking de Clubes',
                                    subtitle: rankingExportSubtitle,
                                    rows: rankingExportRows,
                                    columnLabels: RANKING_EXPORT_COLUMN_LABELS,
                                    plainDiff: true,
                                }}
                            />
                        </div>
                    </div>
                </section>
            ) : null}
        </main>
    );
}
