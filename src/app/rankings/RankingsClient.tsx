'use client';

import { Suspense, useEffect, useMemo, useState, useTransition } from 'react';
import type { CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Layers3,
    Minus,
    RefreshCw,
    Search,
    TrendingDown,
    TrendingUp,
    X,
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
import { formatRankingWeekLabel } from '@/lib/rankings/rankingWeek';
import dynamic from 'next/dynamic';

// El export es la pieza mas pesada que carga esta pagina y solo hace falta cuando
// alguien aprieta el boton. Diferido, deja de viajar en la primera carga.
const ExportImage = dynamic(() => import('@/components/ExportImage'), { ssr: false });

/**
 * La pantalla publica del ranking, pensada para el hincha y no para el panel.
 *
 * Lo que habia antes mezclaba el vocabulario de administracion ("publicado",
 * "rankings guardados", "ultima corrida", "OVR rating", "delta") con una
 * jerarquia al reves: una cabecera que describia el ranking elegido, DESPUES el
 * selector de deporte y de ranking, DESPUES cinco tarjetas que repetian las
 * cinco primeras filas, y al final la tabla. Cada fila traia tres numeros
 * (anterior, delta, puntaje) y en el telefono iban sin rotulo.
 *
 * Ahora la pagina responde, en orden, las preguntas que trae el que entra:
 *
 *   1. Que estoy viendo — el nombre del ranking, una frase que dice como se
 *      calcula y cuando se actualizo.
 *   2. Que paso esta semana — quienes subieron y quienes bajaron.
 *   3. Donde esta mi club — buscador, y una tabla con UN numero (los puntos) y
 *      UN movimiento (los puestos que subio o bajo), con la variacion de puntos
 *      como dato secundario.
 *
 * Los controles (deporte, ranking, semana, busqueda) van juntos y arriba de la
 * tabla, que es lo que modifican. La pagina no pinta su propio fondo: usa los
 * tokens del sitio y anda en claro y en oscuro.
 */

type RankingEntity = 'club' | 'seleccion';

type RankingNouns = {
    /** Encabezado de la columna del nombre. */
    entidad: string;
    /** Como se cuenta en plural: "114 uniones". */
    plural: string;
    /** Encabezado de la columna de procedencia. */
    procedencia: string;
    /** Encabezado de la columna del puntaje. */
    puntaje: string;
    /** Titulo por omision del afiche exportado. */
    tituloExport: string;
    /** Que busca el buscador. */
    buscar: string;
    /** Como se explica el puntaje, en una frase. */
    comoSeCalcula: string;
};

const RANKING_NOUNS: Record<RankingEntity, RankingNouns> = {
    club: {
        entidad: 'Club',
        plural: 'clubes',
        procedencia: 'Region',
        puntaje: 'Puntos',
        tituloExport: 'Ranking de Clubes',
        buscar: 'Buscar un club',
        comoSeCalcula: 'Cada partido mueve puntos del que pierde al que gana, mas cuanto mas parejo era el cruce o mas amplio el margen. Se actualiza los martes con los resultados del fin de semana.',
    },
    // "Union" y no "Seleccion": es el rotulo que usa el propio World Rugby, y es
    // el correcto para los que no son paises (Chinese Taipei, Hong Kong China).
    seleccion: {
        entidad: 'Union',
        plural: 'uniones',
        procedencia: 'Continente',
        puntaje: 'Puntos',
        tituloExport: 'Ranking de World Rugby',
        buscar: 'Buscar una union',
        comoSeCalcula: 'El ranking oficial de World Rugby. Se publica los lunes con los tests del fin de semana ya computados.',
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
    // Solo el ranking de clubes: el martes contra el que se miden las flechas.
    movement_baseline_week?: string | null;
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

const PUBLIC_RANKING_PAGE_SIZE = 20;
const MOVERS_LIMIT = 3;

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

/**
 * Cambia la URL sin pasar por el router de Next.
 *
 * `router.replace` con otros search params vuelve a pedir la pagina al
 * servidor —y esta pagina consulta la base para sembrar la tabla—, asi que
 * cada toque en una pestania esperaba 400 a 800 ms sin ninguna respuesta
 * visual, y en el telefono mas. Con el historial nativo el cambio es
 * inmediato: `useSearchParams` lo refleja igual (Next lo escucha desde 14.1) y
 * los datos ya llegan por los fetch del cliente. Mismo criterio que el gestor
 * de torneos: pushState nativo, nunca router.push para estado de UI.
 */
function replaceUrl(href: string) {
    if (typeof window === 'undefined') return;
    // El estado va en `null` a proposito: si se le pasa el `history.state` que
    // ya tiene (con las marcas internas de Next), el parche del router lo toma
    // como una navegacion propia y NO sincroniza `useSearchParams`. Medido: la
    // URL cambiaba y la pestania seguia sin marcarse.
    window.history.replaceState(null, '', href);
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

/** "8 de septiembre" desde un instante ISO, en hora argentina. */
function formatDayLabel(value: string | null | undefined) {
    if (!value) return null;
    try {
        return new Intl.DateTimeFormat('es-AR', {
            day: 'numeric',
            month: 'long',
            timeZone: 'America/Argentina/Buenos_Aires',
        }).format(new Date(value));
    } catch {
        return null;
    }
}

/** Sin tildes ni mayusculas: "Cordoba" encuentra "Córdoba" y al reves. */
function foldText(value: string | null | undefined) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function getPositionLabelStyle(label: Pick<RankingPositionLabel, 'color'>) {
    return {
        '--position-label-color': label.color,
    } as CSSProperties;
}

function formatLegendPosition(position: number) {
    return `#${String(position).padStart(2, '0')}`;
}

/**
 * La flecha de puesto de una fila: cuantos lugares subio o bajo respecto de la
 * semana anterior. Con puesto previo igual al actual devuelve el "=" mudo; sin
 * puesto previo (club nuevo, primera semana) no devuelve nada.
 */
function MovementChip({ current, previous }: { current: number | null | undefined; previous: number | null | undefined }) {
    if (!Number.isFinite(Number(current)) || previous === null || previous === undefined) return null;

    const change = getRankingPositionChange(current, previous);

    if (!change) {
        return (
            <span className={`${styles.move} ${styles.moveSame}`} aria-label="Mismo puesto que la semana anterior">
                <Minus size={12} aria-hidden="true" />
            </span>
        );
    }

    const places = Math.abs(change.value);
    const sube = change.tone === 'positive';

    return (
        <span
            className={`${styles.move} ${sube ? styles.moveUp : styles.moveDown}`}
            aria-label={`${sube ? 'Sube' : 'Baja'} ${places} ${places === 1 ? 'puesto' : 'puestos'}`}
        >
            {sube ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
            {places}
        </span>
    );
}

function RankingsPageFallback() {
    return (
        <div className={styles.page}>
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
    const searchParams = useSearchParams();
    const { selectedSport, activeSports, setSelectedSport } = useSport();
    const { isLoading: authLoading } = useAuth();
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
    const [busqueda, setBusqueda] = useState('');
    // La pastilla responde al toque en el acto; el resto (URL, contexto, tabla)
    // va en una transicion. Sin esto la pastilla se marcaba recien cuando toda
    // la pagina terminaba de volver a dibujarse, 200 ms despues del toque.
    const [, startTransition] = useTransition();
    const [pendingSportId, setPendingSportId] = useState<string | null>(null);
    const [pendingRankingId, setPendingRankingId] = useState<string | null>(null);

    const sportParam = searchParams.get('sport');
    const rankingParam = searchParams.get('ranking');
    // Una fecha con otra forma se ignora: la escribe cualquiera en la barra.
    const fechaParam = (searchParams.get('fecha') ?? '').trim();
    const selectedDate = ISO_DATE_REGEX.test(fechaParam) ? fechaParam : '';

    useEffect(() => {
        if (!sportParam) return;
        // Con un toque pendiente, una URL que todavia dice el deporte anterior es
        // solo un rezago: sincronizarla pisaba el toque (dos pestanias seguidas
        // dejaban la URL en un deporte, la pastilla en otro y el titulo en un
        // tercero). El efecto queda para la carga inicial y para una URL ajena.
        if (pendingSportId && sportParam !== pendingSportId) return;

        const nextSport = activeSports.find((sport) => sport.id === sportParam);
        if (!nextSport || nextSport.id === selectedSport.id) return;

        setSelectedSport(nextSport);
    }, [activeSports, pendingSportId, selectedSport.id, setSelectedSport, sportParam]);

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
                replaceUrl(buildRankingsHref(selectedSport.id));
            }
            return;
        }

        if (!rankingParam || !rankingList.some((ranking) => ranking.id === rankingParam)) {
            replaceUrl(buildRankingsHref(selectedSport.id, rankingList[0].id, selectedDate));
        }
    }, [rankingList, rankingParam, selectedDate, selectedSport.id]);

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
    const esSeleccion = selectedRanking?.entity === 'seleccion';
    // El subrayado por movimiento es exclusivo del ranking de World Rugby.
    const subrayaMovimiento = esSeleccion;
    const nouns = getRankingNouns(selectedRanking?.entity);
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

    // Mientras llega la tabla nueva se sigue mostrando la anterior, atenuada.
    // Desmontarla y poner "Cargando" hacia que la pagina se achicara y el pie
    // saltara en cada toque; con el contenido viejo en pantalla la altura no se
    // mueve y el cambio es un fundido, no un salto.
    const shownDetail = activeRankingDetail ?? (loadingDetail ? rankingDetail : null);
    const refrescando = loadingList || loadingDetail;
    const entries = useMemo(() => shownDetail?.entries ?? [], [shownDetail?.entries]);
    const hasEntries = entries.length > 0;
    // Los encabezados de la tabla describen lo que hay EN la tabla, que durante
    // el fundido todavia es el ranking anterior; la cabecera de la pagina ya
    // habla del nuevo.
    const nounsTabla = getRankingNouns(shownDetail?.ranking.entity ?? selectedRanking?.entity);

    // Que pastilla se pinta como activa: la que se acaba de tocar, hasta que el
    // estado real la alcance.
    const activeSportId = pendingSportId ?? selectedSport.id;
    const activeRankingId = pendingRankingId ?? selectedRankingId;
    useEffect(() => {
        if (pendingSportId && pendingSportId === selectedSport.id) setPendingSportId(null);
    }, [pendingSportId, selectedSport.id]);
    useEffect(() => {
        if (pendingRankingId && pendingRankingId === selectedRankingId) setPendingRankingId(null);
    }, [pendingRankingId, selectedRankingId]);

    // El buscador filtra en memoria: son 158 filas, no hace falta ir al servidor.
    // El puesto se conserva (es el del ranking, no el del resultado de busqueda).
    const busquedaPlegada = foldText(busqueda);
    const entradasFiltradas = useMemo(() => {
        if (!busquedaPlegada) return entries;
        return entries.filter((entry) => (
            foldText(getRankingClubName(entry)).includes(busquedaPlegada)
            || foldText(entry.clubs?.short_name).includes(busquedaPlegada)
            || foldText(entry.source_region).includes(busquedaPlegada)
        ));
    }, [busquedaPlegada, entries]);

    // Quienes subieron y quienes bajaron mas puestos esta semana. Empata por
    // puntos ganados. Si nadie tiene puesto previo (ranking recien importado) la
    // seccion no tiene nada que decir y no se dibuja.
    const movimientos = useMemo(() => {
        const conPrevio = entries.filter((entry) => (
            entry.source_previous_position !== null && entry.source_previous_position !== undefined
        ));
        const movidos = conPrevio
            .map((entry) => ({
                entry,
                puestos: Number(entry.source_previous_position) - Number(entry.current_position ?? 0),
                puntos: getRankingDelta(entry.current_rating, getRankingPreviousRating(entry)).value,
            }))
            .filter((item) => Number.isFinite(item.puestos) && item.puestos !== 0);

        return {
            hayReferencia: conPrevio.length > 0,
            suben: movidos
                .filter((item) => item.puestos > 0)
                .sort((a, b) => b.puestos - a.puestos || b.puntos - a.puntos)
                .slice(0, MOVERS_LIMIT),
            bajan: movidos
                .filter((item) => item.puestos < 0)
                .sort((a, b) => a.puestos - b.puestos || a.puntos - b.puntos)
                .slice(0, MOVERS_LIMIT),
        };
    }, [entries]);

    const tablePage = tablePageState.rankingId === selectedRankingId ? tablePageState.page : 1;
    const paginatedEntries = useMemo(
        () => paginateRankingEntries(entradasFiltradas, tablePage, PUBLIC_RANKING_PAGE_SIZE),
        [entradasFiltradas, tablePage],
    );
    const visibleEntries = paginatedEntries.items;
    const rankingExportRows = useMemo(
        () => buildRankingExportRows(entries, rankingPositionLabels, {
            movementHighlight: subrayaMovimiento,
        }),
        [entries, rankingPositionLabels, subrayaMovimiento],
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
    // `authLoading` es false. Con `montado` el primer render del cliente es
    // identico al del servidor y la seccion entra recien en el segundo.
    const [montado, setMontado] = useState(false);
    useEffect(() => { setMontado(true); }, []);
    const canExportPublicRanking = montado && !authLoading;

    // La foto que se esta mirando y los dos bordes del historico. `semanaTope` es
    // la vigente: no hay ranking despues del ultimo publicado.
    const historyFrom = rankingDelCatalogo?.history_from ?? selectedRanking?.history_from ?? '';
    const semanaTope = rankingDelCatalogo?.snapshot_date ?? selectedRanking?.snapshot_date ?? '';
    const semanaMostrada = selectedDate || semanaTope;
    const tieneHistorico = Boolean(historyFrom && semanaTope);
    const enLaSemanaVigente = !selectedDate || semanaMostrada >= semanaTope;

    // Las dos fechas que le importan al lector: cuando se actualizo la tabla y
    // contra que semana se miden las flechas.
    const actualizadoEl = esSeleccion
        ? formatDayLabel(semanaMostrada ? `${semanaMostrada}T12:00:00Z` : null)
        : formatDayLabel(selectedRanking?.backfill_completed_at || selectedRanking?.updated_at);
    const semanaDeReferencia = esSeleccion
        ? null
        : formatRankingWeekLabel(selectedRanking?.movement_baseline_week);

    const irASemana = (fecha: string) => {
        if (!tieneHistorico) return;
        const destino = clampIsoDate(fecha, historyFrom, semanaTope);
        // Volver a la vigente es sacar la fecha de la URL, no fijar la de hoy:
        // asi la pagina sigue mostrando la ultima aunque pase una semana.
        replaceUrl(buildRankingsHref(selectedSport.id, selectedRankingId, destino >= semanaTope ? '' : destino));
    };

    // La URL se escribe en el acto y fuera de la transicion: el router de Next ya
    // procesa el replaceState como transicion propia, y anidarla dentro de otra
    // desordenaba dos toques seguidos. Lo que va en transicion es el estado
    // pesado (el contexto de deporte y, con el, la tabla).
    const handleSportChange = (sport: Sport) => {
        setPendingSportId(sport.id);
        setBusqueda('');
        replaceUrl(buildRankingsHref(sport.id));
        startTransition(() => {
            if (sport.id !== selectedSport.id) {
                setSelectedSport(sport);
            }
        });
    };

    const handleRankingChange = (rankingId: string) => {
        setPendingRankingId(rankingId);
        setBusqueda('');
        replaceUrl(buildRankingsHref(selectedSport.id, rankingId, selectedDate));
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

    const handleBusqueda = (valor: string) => {
        setBusqueda(valor);
        // Buscar te lleva a la primera pagina del resultado, sin scroll: el foco
        // esta en el campo y moverle la pantalla al que escribe es una agresion.
        setTablePageState({ rankingId: selectedRankingId, page: 1 });
    };

    const titulo = selectedRanking?.name || `Rankings de ${sportLabel}`;
    const totalLabel = hasEntries ? `${entries.length} ${nouns.plural}` : null;

    return (
        <div className={styles.page}>
            <div className="container">
                <MobileSectionTabs
                    activeTab="rankings"
                    rankingsHref={buildRankingsHref(selectedSport.id, selectedRankingId || undefined)}
                />

                {/* 1. Que estoy viendo */}
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        <h1 className={styles.title}>{titulo}</h1>
                        {/* La descripcion del ranking de clubes la escribe el panel y
                            dice de que ranking se trata; la de World Rugby la genera
                            el servidor y ya cuenta lo mismo que la frase fija, asi
                            que ahi va solo la frase. */}
                        <p className={styles.lead}>
                            {!esSeleccion && selectedRanking?.description?.trim()
                                ? `${selectedRanking.description.trim().replace(/[.!?]$/, '')}. `
                                : ''}
                            {nouns.comoSeCalcula}
                        </p>
                        <ul className={styles.meta} aria-label="Datos del ranking">
                            {totalLabel ? <li>{totalLabel}</li> : null}
                            {actualizadoEl ? <li>Actualizado el {actualizadoEl}</li> : null}
                            {semanaDeReferencia ? <li>Flechas respecto del {semanaDeReferencia}</li> : null}
                            {esSeleccion ? <li>Flechas respecto de la publicacion anterior</li> : null}
                        </ul>
                    </div>
                    {/* El afiche se arma con la tabla que se esta mirando: mientras
                        llega la nueva, el boton espera. */}
                    {hasEntries && canExportPublicRanking && !refrescando ? (
                        <div className={styles.headerActions}>
                            <ExportImage
                                className={styles.exportAction}
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
                    ) : null}
                </header>

                {/* Los controles, juntos y arriba de lo que controlan */}
                <div className={styles.toolbar}>
                    <div className={styles.tabs} role="group" aria-label="Deporte">
                        {activeSports.map((sport) => {
                            const isActive = sport.id === activeSportId;
                            return (
                                <button
                                    key={sport.id}
                                    type="button"
                                    className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                                    onClick={() => handleSportChange(sport)}
                                    aria-pressed={isActive}
                                >
                                    {getSportLabel(sport)}
                                </button>
                            );
                        })}
                    </div>

                    {/* Con un solo ranking en el deporte no hay nada que elegir. La
                        fila no se esconde mientras se recarga la lista: desaparecer
                        y volver era uno de los saltos. */}
                    {rankingList.length > 1 ? (
                        <div className={styles.tabs} role="group" aria-label="Ranking">
                            {rankingList.map((ranking) => {
                                const isActive = ranking.id === activeRankingId;
                                return (
                                    <button
                                        key={ranking.id}
                                        type="button"
                                        className={`${styles.tab} ${styles.tabSecondary} ${isActive ? styles.tabActive : ''}`}
                                        onClick={() => handleRankingChange(ranking.id)}
                                        aria-pressed={isActive}
                                    >
                                        {ranking.name}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}

                    {hasEntries || tieneHistorico ? (
                        <div className={styles.toolbarRow}>
                            {hasEntries ? (
                                <div className={styles.search}>
                                    <label htmlFor="buscar-ranking" className={styles.srOnly}>{nouns.buscar}</label>
                                    <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                                    <input
                                        id="buscar-ranking"
                                        type="search"
                                        className={styles.searchInput}
                                        placeholder={nouns.buscar}
                                        value={busqueda}
                                        onChange={(event) => handleBusqueda(event.target.value)}
                                        autoComplete="off"
                                    />
                                    {busqueda ? (
                                        <button
                                            type="button"
                                            className={styles.searchClear}
                                            onClick={() => handleBusqueda('')}
                                            aria-label="Borrar la busqueda"
                                        >
                                            <X size={14} />
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}

                            {/* Solo los rankings con fotos semanales tienen pasado que
                                mirar. El de clubes guarda un estado, no una serie. */}
                            {tieneHistorico ? (
                                <div className={styles.weekPicker}>
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
                                    {!enLaSemanaVigente ? (
                                        <button
                                            type="button"
                                            className={styles.weekPickerReset}
                                            onClick={() => irASemana(semanaTope)}
                                        >
                                            Volver al vigente
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {publicError && !loadingDetail ? (
                    <div className={styles.errorState} role="alert">
                        <AlertCircle size={16} />
                        <span>{publicError}</span>
                    </div>
                ) : null}

                {/* El motivo del "en revision" ya viaja en la API; sin pintarlo, el
                    lector no sabe por que la tabla puede estar atrasada. */}
                {selectedRanking?.stale_from_match_id ? (
                    <div className={styles.staleNote}>
                        <AlertCircle size={16} />
                        <span>
                            {selectedRanking.stale_reason
                                || 'Este ranking espera una actualizacion, asi que puede no reflejar los ultimos resultados.'}
                        </span>
                    </div>
                ) : null}

                {/* "Cargando" solo cuando no hay NADA que mostrar (primera visita a un
                    deporte). Si hay una tabla anterior, se queda atenuada abajo. */}
                {refrescando && !shownDetail ? (
                    <div className={styles.inlineState}>
                        <RefreshCw size={16} className={styles.spin} />
                        <span>Cargando la tabla...</span>
                    </div>
                ) : null}

                <div
                    className={`${styles.content} ${refrescando ? styles.contentStale : ''}`}
                    aria-busy={refrescando}
                >
                {/* 2. Que paso esta semana */}
                {hasEntries && movimientos.hayReferencia ? (
                    <section className={styles.movers} aria-labelledby="movimientos-titulo">
                        <h2 id="movimientos-titulo" className={styles.sectionTitle}>Movimientos de la semana</h2>
                        {movimientos.suben.length || movimientos.bajan.length ? (
                            <div key={shownDetail?.ranking.id} className={`${styles.moversGrid} ${styles.fadeIn}`}>
                                {[
                                    { titulo: 'Subieron', vacio: 'Nadie subio de puesto.', items: movimientos.suben, tono: styles.moverUp },
                                    { titulo: 'Bajaron', vacio: 'Nadie bajo de puesto.', items: movimientos.bajan, tono: styles.moverDown },
                                ].map((grupo) => (
                                    <div key={grupo.titulo} className={`${styles.moverCard} ${grupo.tono}`}>
                                        <h3 className={styles.moverTitle}>{grupo.titulo}</h3>
                                        {grupo.items.length ? (
                                            <ol className={styles.moverList}>
                                                {grupo.items.map(({ entry, puntos }) => (
                                                    <li key={entry.id} className={styles.moverRow}>
                                                        <TeamLogo
                                                            name={getRankingClubName(entry)}
                                                            shortName={getRankingClubShortName(entry)}
                                                            teamId={entry.club_id}
                                                            logoUrl={entry.clubs?.logo_url}
                                                            className={styles.moverLogo}
                                                            size={28}
                                                        />
                                                        <span className={styles.moverName}>
                                                            <strong>{getRankingClubName(entry)}</strong>
                                                            <span>
                                                                Puesto {entry.current_position}
                                                                {puntos !== 0 ? ` · ${puntos > 0 ? '+' : ''}${puntos.toFixed(2)} pts` : ''}
                                                            </span>
                                                        </span>
                                                        <MovementChip
                                                            current={entry.current_position}
                                                            previous={entry.source_previous_position}
                                                        />
                                                    </li>
                                                ))}
                                            </ol>
                                        ) : (
                                            <p className={styles.moverEmpty}>{grupo.vacio}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.moverEmpty}>
                                Sin cambios de puesto respecto de la semana anterior.
                            </p>
                        )}
                    </section>
                ) : null}

                {/* 3. Donde esta mi club */}
                <section className={styles.tableSection} id="tabla-ranking" aria-labelledby="tabla-titulo">
                    <div className={styles.tableHead}>
                        <h2 id="tabla-titulo" className={styles.sectionTitle}>
                            {busquedaPlegada
                                ? `${entradasFiltradas.length} ${entradasFiltradas.length === 1 ? 'resultado' : 'resultados'} para "${busqueda.trim()}"`
                                : 'Tabla completa'}
                        </h2>
                        {hasEntries && !busquedaPlegada ? (
                            <span className={styles.tableMeta}>
                                {paginatedEntries.start + 1}–{paginatedEntries.start + visibleEntries.length} de {entries.length}
                            </span>
                        ) : null}
                    </div>

                    {hasEntries && visibleEntries.length ? (
                        <>
                            {/* La clave cambia con el ranking y la pagina: cada tabla nueva
                                entra con un fundido corto en vez de aparecer de golpe. */}
                            <div
                                key={`${shownDetail?.ranking.id ?? ''}|${paginatedEntries.page}`}
                                className={`${styles.tableWrap} ${styles.fadeIn}`}
                            >
                                <table className={styles.table}>
                                    <caption className={styles.srOnly}>
                                        {shownDetail?.ranking.name ?? titulo}. {nounsTabla.puntaje} y movimiento de puesto de cada {nounsTabla.entidad.toLowerCase()}
                                        {semanaDeReferencia ? ` respecto del ${semanaDeReferencia}` : ''}.
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" className={styles.thPos}>Pos</th>
                                            <th scope="col">{nounsTabla.entidad}</th>
                                            <th scope="col" className={styles.thRegion}>{nounsTabla.procedencia}</th>
                                            <th scope="col" className={styles.thNum}>{nounsTabla.puntaje}</th>
                                            <th scope="col" className={styles.thNum}>
                                                <abbr title="Puntos ganados o perdidos desde la semana anterior">Var.</abbr>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleEntries.map((entry, index) => {
                                            const previousRating = getRankingPreviousRating(entry);
                                            const delta = getRankingDelta(entry.current_rating, previousRating);
                                            const clubName = getRankingClubName(entry);
                                            const position = entry.current_position || paginatedEntries.start + index + 1;
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
                                                    <td className={styles.posCell}>
                                                        <span className={styles.posNumber}>{position}</span>
                                                        <MovementChip
                                                            current={entry.current_position}
                                                            previous={entry.source_previous_position}
                                                        />
                                                    </td>
                                                    <td className={styles.clubCell}>
                                                        <TeamLogo
                                                            name={clubName}
                                                            shortName={getRankingClubShortName(entry)}
                                                            teamId={entry.club_id}
                                                            logoUrl={entry.clubs?.logo_url}
                                                            className={styles.clubLogo}
                                                            fallbackClassName={styles.clubLogoFallbackText}
                                                            size={32}
                                                            title={`Escudo de ${clubName}`}
                                                        />
                                                        <span className={styles.clubCopy}>
                                                            <strong>{clubName}</strong>
                                                            <span className={styles.clubRegionMobile}>
                                                                {entry.source_region || getRankingClubShortName(entry)}
                                                            </span>
                                                        </span>
                                                    </td>
                                                    <td className={styles.regionCell}>{entry.source_region || '-'}</td>
                                                    <td className={styles.pointsCell}>
                                                        {formatRankingRating(entry.current_rating)}
                                                    </td>
                                                    <td
                                                        className={`${styles.varCell} ${
                                                            delta.tone === 'positive'
                                                                ? styles.varPositive
                                                                : delta.tone === 'negative'
                                                                    ? styles.varNegative
                                                                    : styles.varNeutral
                                                        }`}
                                                    >
                                                        {delta.tone === 'neutral' ? '0.00' : delta.label}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {rankingLegendItems.length ? (
                                <div className={styles.legend} aria-label="Leyenda de puestos">
                                    {rankingLegendItems.map((item) => (
                                        <div
                                            key={`${item.rangeLabel}-${item.label}-${item.color}`}
                                            className={styles.legendItem}
                                            style={getPositionLabelStyle(item)}
                                        >
                                            <span className={styles.legendSwatch} />
                                            <strong>{item.rangeLabel}</strong>
                                            <span>{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {paginatedEntries.totalPages > 1 ? (
                                <nav className={styles.pagination} aria-label="Paginas de la tabla">
                                    <button
                                        type="button"
                                        className={styles.paginationBtn}
                                        onClick={() => setTablePage(Math.max(1, paginatedEntries.page - 1))}
                                        disabled={paginatedEntries.page <= 1}
                                    >
                                        <ChevronLeft size={16} />
                                        Anterior
                                    </button>
                                    <span className={styles.paginationPage}>
                                        {paginatedEntries.page} de {paginatedEntries.totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.paginationBtn}
                                        onClick={() => setTablePage(Math.min(paginatedEntries.totalPages, paginatedEntries.page + 1))}
                                        disabled={paginatedEntries.page >= paginatedEntries.totalPages}
                                    >
                                        Siguiente
                                        <ChevronRight size={16} />
                                    </button>
                                </nav>
                            ) : null}
                        </>
                    ) : hasEntries ? (
                        <div className={styles.inlineState}>
                            <Search size={16} />
                            <span>Ningun {nouns.entidad.toLowerCase()} coincide con &ldquo;{busqueda.trim()}&rdquo;.</span>
                            <button type="button" className={styles.linkBtn} onClick={() => handleBusqueda('')}>
                                Ver todos
                            </button>
                        </div>
                    ) : !loadingList && !loadingDetail ? (
                        <div className={styles.inlineState}>
                            <Layers3 size={16} />
                            <span>
                                {rankingList.length
                                    ? `Este ranking todavia no tiene ${nouns.plural} publicados.`
                                    : `Todavia no hay un ranking publicado de ${sportLabel}.`}
                            </span>
                        </div>
                    ) : null}
                </section>
                </div>
            </div>
        </div>
    );
}
