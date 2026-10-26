'use client';

/**
 * El gestor de torneo en mobile.
 *
 * Cuatro secciones en la barra de abajo —Panel, Fases, Clubes y Torneo— y tres
 * pantallas que se apilan encima: la fase, el alta de fase y su edicion. La
 * cabecera del torneo queda arriba, siempre a la vista.
 *
 * TRES DECISIONES QUE CONVIENE SABER
 *
 * 1. **Las secciones van abajo.** Arriba quedaban empujadas por la cabecera,
 *    fuera del alcance comodo del pulgar en un telefono grande. Cuatro destinos
 *    entran holgados en el limite practico de cinco.
 *
 * 2. **Un solo fetch.** Todo sale de `/api/tournaments/[id]/fixture`, que ya
 *    devuelve el arbol entero (fases -> fechas -> partidos) mas los
 *    participantes. Aparte se piden solo la tabla de posiciones y el plantel de
 *    la fase abierta, porque salen de otras tablas y solo cuando hacen falta.
 *
 * 3. **La vista vive en la URL, y se escribe con `history.pushState` nativo.**
 *    No `router.push`: en el gestor eso vuelve a correr el server component de
 *    la ruta y se pierde el estado de la pantalla. El boton atras del telefono
 *    funciona porque cada pantalla es una entrada de historial de verdad.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    ExternalLink,
    Home,
    Layers,
    MoreVertical,
    RefreshCw,
    Trophy,
    Users,
} from 'lucide-react';
import type { Database } from '@/lib/database.types';
import { getSportDisplayName } from '@/lib/clubDerivatives';
import { PanelView } from './PanelView';
import { PhasesView } from './PhasesView';
import { NewPhaseView } from './NewPhaseView';
import { PhaseView, type PhaseSegment } from './PhaseView';
import { CompetitorsView } from './CompetitorsView';
import { TournamentIdentityView } from './TournamentIdentityView';
import { Sheet, type MobileFixture, type MobileMatch } from './shared';
import './mobile-manager.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

type View = 'panel' | 'fases' | 'competidores' | 'torneo' | 'fase' | 'fase-nueva' | 'fase-editar';

type Route = {
    view: View;
    phaseId: string | null;
    segment: PhaseSegment;
    /* La fecha abierta en el Calendario. Va en la URL por el mismo motivo que
       la vista: sin esto, un F5 parado en la fecha 14 volvia a la 1 y habia que
       tocar trece veces la flecha para recuperar el lugar. */
    roundId: string | null;
};

const PRIMARY_TABS: { view: View; label: string; Icon: typeof Home }[] = [
    { view: 'panel', label: 'Panel', Icon: Home },
    { view: 'fases', label: 'Fases', Icon: Layers },
    { view: 'competidores', label: 'Equipos', Icon: Users },
    { view: 'torneo', label: 'Torneo', Icon: Trophy },
];

const VIEWS = new Set<View>([
    'panel', 'fases', 'competidores', 'torneo', 'fase', 'fase-nueva', 'fase-editar',
]);

const SEGMENTS = new Set<PhaseSegment>(['tabla', 'calendario', 'plantel']);

/** Las pantallas de fase que dejan encendida la pestana Fases. */
const PHASE_VIEWS = new Set<View>(['fase', 'fase-nueva', 'fase-editar']);

function routeFromSearch(search: string): Route {
    const params = new URLSearchParams(search);
    const rawView = params.get('v');
    const view = rawView && VIEWS.has(rawView as View) ? (rawView as View) : 'panel';
    const rawSegment = params.get('seg');
    const segment: PhaseSegment = rawSegment && SEGMENTS.has(rawSegment as PhaseSegment)
        ? (rawSegment as PhaseSegment)
        : 'tabla';
    return {
        view,
        phaseId: params.get('phase'),
        segment,
        roundId: params.get('fecha'),
    };
}

function searchFromRoute(route: Route): string {
    const params = new URLSearchParams();
    if (route.view !== 'panel') params.set('v', route.view);
    if (route.phaseId) params.set('phase', route.phaseId);
    if (route.view === 'fase' && route.segment !== 'tabla') params.set('seg', route.segment);
    /* `fecha` solo tiene sentido dentro del Calendario: en Tabla o Plantel
       ensuciaria la URL con un dato que ninguna de las dos lee. */
    if (route.view === 'fase' && route.segment === 'calendario' && route.roundId) {
        params.set('fecha', route.roundId);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
}

export function MobileTournamentManager({
    id,
    data,
    crestSrc,
    fullManagerHref,
}: {
    id: string;
    data: TournamentRow;
    crestSrc: string | null;
    fullManagerHref: string;
}) {
    const [route, setRoute] = useState<Route>({ view: 'panel', phaseId: null, segment: 'tabla', roundId: null });
    /* Espejo de `route` para que `go` pueda leer la ruta vigente sin meterse
       adentro del updater de `setRoute`. Ver el comentario de `go`. */
    const routeRef = useRef<Route>({ view: 'panel', phaseId: null, segment: 'tabla', roundId: null });
    const [fixture, setFixture] = useState<MobileFixture | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    /* Las acciones de la fase abierta. Comparten los tres puntos de la cabecera
       con las del torneo: adentro de una fase, ese boton abre las de la fase. */
    const [phaseActionsOpen, setPhaseActionsOpen] = useState(false);
    const [toast, setToast] = useState<{ tone: 'ok' | 'err'; message: string } | null>(null);
    const mainRef = useRef<HTMLElement>(null);

    /* La ruta se lee del navegador en el primer render del cliente y en cada
       `popstate`, que es como el boton atras del telefono llega hasta aca. */
    useEffect(() => {
        function adoptar(next: Route) {
            routeRef.current = next;
            setRoute(next);
        }
        adoptar(routeFromSearch(window.location.search));
        function onPop() {
            adoptar(routeFromSearch(window.location.search));
        }
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    /* El `history.pushState` va ACA AFUERA, no adentro del updater de
       `setRoute`. React ejecuta los updaters durante la fase de render, asi que
       tocar el historial ahi adentro lo movia en pleno render: el Router de
       Next escucha el historial, hacia su propio setState, y React avisaba
       "Cannot update a component (Router) while rendering a different
       component". En StrictMode ademas el updater corre dos veces, o sea dos
       entradas de historial por navegacion y un boton atras que hay que tocar
       dos veces. Los updaters tienen que ser puros; la ruta vigente sale de
       `routeRef`. */
    const go = useCallback((next: Partial<Route>, replace = false) => {
        const merged: Route = { ...routeRef.current, ...next };
        routeRef.current = merged;
        const url = `${window.location.pathname}${searchFromRoute(merged)}`;
        if (replace) window.history.replaceState({}, '', url);
        else window.history.pushState({}, '', url);
        setRoute(merged);
    }, []);

    const loadFixture = useCallback(async () => {
        try {
            const response = await fetch(`/api/tournaments/${id}/fixture`);
            if (!response.ok) throw new Error(String(response.status));
            const payload = (await response.json()) as MobileFixture;
            setFixture(payload);
            setLoadFailed(false);
        } catch {
            /* No se cae a un fixture vacio: un torneo con veinte fechas se veria
               igual que uno recien creado, y el gestor generaria el calendario
               de nuevo encima del que ya existe. */
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void loadFixture();
    }, [loadFixture]);

    /* Al cambiar de pantalla el foco vuelve arriba del contenido. Sin esto, el
       lector de pantalla se queda leyendo donde estaba la pantalla anterior. */
    useEffect(() => {
        mainRef.current?.focus?.();
        window.scrollTo({ top: 0 });
    }, [route.view, route.phaseId]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 3600);
        return () => window.clearTimeout(timer);
    }, [toast]);

    /* En su propio `useMemo`: un `?? []` en el render crea un array nuevo por
       vuelta y le cambia las dependencias a los hooks de abajo. */
    const phases = useMemo(() => fixture?.phases ?? [], [fixture]);
    const participants = useMemo(() => fixture?.participants ?? [], [fixture]);
    const activePhase = useMemo(
        () => phases.find((phase) => phase.id === route.phaseId) ?? null,
        [phases, route.phaseId],
    );

    /* La temporada se lee de `tournaments.season_id`, que es el TEXTO ("2026").
       NO de `fixture.tournamentSeason`: el route de fixture pone ahi el id de
       la temporada (un uuid), y la cabecera mostraba "Rugby · ccf40b21-…". */
    const rawSeason = (data as { season_id?: string | number | null }).season_id;
    const seasonLabel = rawSeason != null && String(rawSeason).trim() ? String(rawSeason).trim() : null;
    /* `current_season_id` no esta en database.types (el tipo generado va
       atrasado), de ahi el cast. Se le pasa al alta de participantes para que
       el route no tenga que resolver la temporada de nuevo. */
    const seasonId = (data as { current_season_id?: string | null }).current_season_id ?? null;
    const sportLabel = getSportDisplayName(data.sport_id) || 'Deporte';
    const title = data.display_name || data.name;

    const isSubView = PHASE_VIEWS.has(route.view);

    const headerTitle = route.view === 'fase'
        ? (activePhase?.name ?? 'Fase')
        : route.view === 'fase-nueva'
            ? 'Nueva fase'
            : route.view === 'fase-editar'
                ? (activePhase?.name ?? 'Editar fase')
                : title;
    const headerSub = isSubView ? title : `${sportLabel}${seasonLabel ? ` · ${seasonLabel}` : ''}`;

    const showToast = useCallback((tone: 'ok' | 'err', message: string) => {
        setToast({ tone, message });
    }, []);

    /* Un partido del Panel abre su fase en Calendario: es donde se carga. */
    const openMatch = useCallback((match: MobileMatch) => {
        const owner = phases.find((phase) =>
            phase.rounds.some((round) => round.matches.some((item) => item.id === match.id)),
        );
        if (!owner) return;
        /* Y abre la FECHA del partido, no la primera de la fase: desde el Panel
           el partido casi nunca esta en la fecha 1. */
        go({ view: 'fase', phaseId: owner.id, segment: 'calendario', roundId: match.roundId });
    }, [phases, go]);

    return (
        <div className="gtm">
            <div className="gtm-frame">
                <header className="gtm-head">
                    {isSubView ? (
                        <button
                            type="button"
                            className="gtm-icon-btn"
                            onClick={() => window.history.back()}
                            aria-label="Volver"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    ) : null}

                    <div className="gtm-head-id">
                        {!isSubView && crestSrc ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={crestSrc}
                                alt=""
                                className="gtm-head-crest"
                                width={34}
                                height={34}
                                decoding="async"
                            />
                        ) : null}
                        <div className="gtm-head-text">
                            <h1 className="gtm-head-title">{headerTitle}</h1>
                            <div className="gtm-head-sub">{headerSub}</div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="gtm-icon-btn"
                        onClick={() => {
                            if (route.view === 'fase' && activePhase) setPhaseActionsOpen(true);
                            else setMenuOpen(true);
                        }}
                        aria-label={route.view === 'fase' && activePhase
                            ? `Acciones de ${activePhase.name}`
                            : 'Más acciones'}
                    >
                        <MoreVertical size={20} />
                    </button>
                </header>

                <main className="gtm-main" ref={mainRef} tabIndex={-1}>
                    {loadFailed ? (
                        <div className="gtm-empty">
                            <div className="gtm-empty-title">No se pudo cargar el torneo</div>
                            <p className="gtm-empty-text">
                                El fixture no respondió. Puede ser la conexión o un problema del
                                servidor.
                            </p>
                            <button
                                type="button"
                                className="gtm-btn gtm-btn-primary"
                                style={{ marginTop: 6 }}
                                onClick={() => {
                                    setLoading(true);
                                    void loadFixture();
                                }}
                            >
                                <RefreshCw size={18} />
                                Reintentar
                            </button>
                        </div>
                    ) : route.view === 'panel' ? (
                        <PanelView
                            tournamentName={title}
                            sportLabel={sportLabel}
                            seasonLabel={seasonLabel}
                            status={data.status}
                            fixture={fixture}
                            loading={loading}
                            onGoToPhases={() => go({ view: 'fases', phaseId: null, roundId: null })}
                            onNewPhase={() => go({ view: 'fase-nueva', phaseId: null, roundId: null })}
                            onOpenMatch={openMatch}
                        />
                    ) : route.view === 'fases' ? (
                        <PhasesView
                            phases={phases}
                            loading={loading}
                            onOpenPhase={(phaseId) => go({ view: 'fase', phaseId, segment: 'tabla', roundId: null })}
                            onNewPhase={() => go({ view: 'fase-nueva', phaseId: null, roundId: null })}
                        />
                    ) : route.view === 'torneo' ? (
                        <TournamentIdentityView
                            id={id}
                            data={data}
                            crestSrc={crestSrc}
                            fullManagerHref={fullManagerHref}
                            onSaved={(message) => showToast('ok', message)}
                            onError={(message) => showToast('err', message)}
                        />
                    ) : route.view === 'fase-nueva' || route.view === 'fase-editar' ? (
                        <NewPhaseView
                            tournamentId={id}
                            sportId={data.sport_id}
                            tournamentRuleset={data.ruleset as Record<string, unknown> | null}
                            phaseCount={phases.length}
                            participantsCount={participants.length}
                            hasPreviousPhase={phases.length > 0}
                            editingPhase={route.view === 'fase-editar' ? activePhase : null}
                            onCancel={() => window.history.back()}
                            onCreated={async (message) => {
                                showToast('ok', message);
                                await loadFixture();
                                if (route.view === 'fase-editar' && route.phaseId) {
                                    go({ view: 'fase', segment: 'tabla' }, true);
                                } else {
                                    go({ view: 'fases', phaseId: null, roundId: null }, true);
                                }
                            }}
                            onError={(message) => showToast('err', message)}
                        />
                    ) : route.view === 'fase' ? (
                        activePhase ? (
                            <PhaseView
                                tournamentId={id}
                                phase={activePhase}
                                participants={participants}
                                segment={route.segment}
                                onSegment={(segment) => go({ segment }, true)}
                                roundId={route.roundId}
                                onRound={(roundId) => go({ roundId }, true)}
                                onReload={loadFixture}
                                onToast={showToast}
                                actionsOpen={phaseActionsOpen}
                                onActionsOpenChange={setPhaseActionsOpen}
                                onEditPhase={() => go({ view: 'fase-editar' })}
                                onPhaseGone={() => go({ view: 'fases', phaseId: null, roundId: null }, true)}
                            />
                        ) : loading ? (
                            <div className="gtm-skel" style={{ height: 220 }} aria-hidden="true" />
                        ) : (
                            <div className="gtm-empty">
                                <div className="gtm-empty-title">Esa fase ya no existe</div>
                                <p className="gtm-empty-text">
                                    Puede haberse borrado desde otra pantalla.
                                </p>
                                <button
                                    type="button"
                                    className="gtm-btn"
                                    style={{ marginTop: 6 }}
                                    onClick={() => go({ view: 'fases', phaseId: null, roundId: null }, true)}
                                >
                                    Ver las fases
                                </button>
                            </div>
                        )
                    ) : (
                        <CompetitorsView
                            tournamentId={id}
                            sportId={data.sport_id}
                            seasonId={seasonId}
                            participants={participants}
                            loading={loading}
                            fullManagerHref={fullManagerHref}
                            onChanged={loadFixture}
                            onToast={showToast}
                        />
                    )}
                </main>
            </div>

            {/* Mientras se crea o edita una fase la barra de secciones se va:
                su lugar lo ocupa la barra Cancelar / Guardar del formulario. Con
                las dos, un toque en "Panel" sacaba del formulario sin avisar. */}
            <nav
                className="gtm-nav"
                role="tablist"
                aria-label="Secciones del torneo"
                hidden={route.view === 'fase-nueva' || route.view === 'fase-editar'}
            >
                {PRIMARY_TABS.map((tab) => {
                    const selected = route.view === tab.view
                        || (tab.view === 'fases' && PHASE_VIEWS.has(route.view));
                    return (
                        <button
                            key={tab.view}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            className="gtm-nav-btn"
                            onClick={() => go({ view: tab.view, phaseId: null, roundId: null })}
                        >
                            <tab.Icon size={20} aria-hidden="true" />
                            <span className="gtm-nav-label">{tab.label}</span>
                        </button>
                    );
                })}
            </nav>

            {menuOpen ? (
                <Sheet title="Acciones" onClose={() => setMenuOpen(false)}>
                    <button
                        type="button"
                        className="gtm-sheet-item"
                        onClick={async () => {
                            setMenuOpen(false);
                            setLoading(true);
                            await loadFixture();
                            showToast('ok', 'Datos actualizados.');
                        }}
                    >
                        <RefreshCw size={20} />
                        Actualizar los datos
                    </button>
                    <a className="gtm-sheet-item" href={fullManagerHref}>
                        <ExternalLink size={20} />
                        Abrir el gestor completo
                    </a>
                    <span className="gtm-help">
                        El gestor completo tiene lo que esta pantalla no: importar fixture, editar
                        planteles de jugadores, estadísticas y publicación.
                    </span>
                </Sheet>
            ) : null}

            {toast ? (
                <div
                    className={`gtm-toast ${toast.tone === 'ok' ? 'gtm-toast-ok' : 'gtm-toast-err'}`}
                    role="status"
                    aria-live="polite"
                >
                    {toast.message}
                </div>
            ) : null}
        </div>
    );
}
