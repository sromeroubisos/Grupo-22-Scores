// Qué pestañas se dibujan en /matches/[id].
//
// La regla vieja miraba el PROVEEDOR y devolvía una lista fija: un partido
// programado y uno terminado del mismo torneo recibían la misma barra de ocho,
// y seis llegaban vacías. Acá se resuelve por CAPACIDAD — qué puede ofrecer
// esta fuente, para este deporte, con este partido, en este estado.
//
// Tres estados y cada uno se dibuja distinto:
//   ready   → hay dato ahora
//   pending → la fuente lo publica, todavía no llegó (se dibuja con la promesa)
//   oculta  → la fuente no lo tiene nunca, o no puede tenerlo en este estado.
//             No se dibuja. Sale por `hidden` con el motivo, que sirve para
//             depurar sin tener que adivinar por qué falta una pestaña.
//
// Módulo puro: sin React, sin DOM, sin fetch. Se puede correr en un test de Node.

export type MatchTabId =
    | 'previa'
    | 'summary'
    | 'timeline'
    | 'lineups'
    | 'players'
    | 'stats'
    | 'h2h'
    | 'standings'
    | 'commentary'
    | 'videos';

export type MatchTabState = 'ready' | 'pending';

export type MatchProvider =
    | 'local'
    | 'flashscore'
    | 'rugby-api-sports'
    | 'espn-american-football'
    | 'espn-soccer'
    | 'fih'
    | 'fisu';

export type MatchStatusKind = 'scheduled' | 'live' | 'final';

export interface MatchTabCounts {
    events: number;
    lineups: number;
    players: number;
    stats: number;
    h2h: number;
    standings: number;
    commentary: number;
    /** Links de video cargados a mano (highlights, partido completo, clips). */
    videos: number;
}

export interface MatchTab {
    id: MatchTabId;
    /** Rótulo de escritorio. */
    label: string;
    /** Rótulo de teléfono: un nombre corto propio, NO una versión truncada. */
    shortLabel: string;
    state: MatchTabState;
    /** Qué falta y cuándo llega. Solo en `pending`. */
    hint?: string;
}

export interface HiddenTab {
    id: MatchTabId;
    label: string;
    reason: string;
}

export interface ResolvedMatchTabs {
    tabs: MatchTab[];
    hidden: HiddenTab[];
    defaultTab: MatchTabId;
}

// En 390 px el rótulo largo no entra sin cortarse, y cortarlo con puntos
// suspensivos es el defecto viejo con otra cara. Cada pestaña tiene un nombre
// corto propio, elegido para que se lea entero.
const LABELS: Record<MatchTabId, { label: string; shortLabel: string }> = {
    previa: { label: 'Previa', shortLabel: 'Previa' },
    summary: { label: 'Resumen', shortLabel: 'Resumen' },
    timeline: { label: 'Cronología', shortLabel: 'Minuto' },
    lineups: { label: 'Alineaciones', shortLabel: 'Plantel' },
    players: { label: 'Jugadores', shortLabel: 'Planilla' },
    stats: { label: 'Estadísticas', shortLabel: 'Datos' },
    h2h: { label: 'H2H', shortLabel: 'H2H' },
    standings: { label: 'Clasificación', shortLabel: 'Tabla' },
    commentary: { label: 'Comentarios', shortLabel: 'Relato' },
    videos: { label: 'Highlights', shortLabel: 'Videos' },
};

// Lo que cada fuente puede publicar ALGUNA vez. Si un id no está acá, la
// pestaña no se dibuja jamás para esa fuente: no es que esté vacía, es que la
// integración no la trae. Sale de la matriz relevada sobre los conectores.
//
// `videos` está en todas: los links los cargamos nosotros, no vienen del
// proveedor, así que un partido de FlashScore los puede tener igual que uno
// de un torneo local.
const SUPPORTED: Record<MatchProvider, readonly MatchTabId[]> = {
    local: ['previa', 'summary', 'videos', 'timeline', 'lineups', 'players', 'stats', 'h2h', 'standings', 'commentary'],
    flashscore: ['previa', 'summary', 'videos', 'timeline', 'lineups', 'players', 'stats', 'h2h', 'standings', 'commentary'],
    'rugby-api-sports': ['previa', 'summary', 'videos', 'lineups', 'h2h', 'standings'],
    'espn-american-football': ['previa', 'summary', 'videos', 'lineups', 'h2h', 'standings'],
    'espn-soccer': ['previa', 'summary', 'videos', 'timeline', 'lineups', 'stats', 'h2h', 'standings'],
    fih: ['previa', 'summary', 'videos', 'timeline', 'lineups', 'players', 'stats', 'h2h', 'standings'],
    // La FISU publica el cronograma, el marcador por tiempo, el plantel de doce
    // y la tabla del grupo. Nada de cronología ni planilla individual: la
    // pestaña vacía sería una promesa que la fuente no cumple.
    fisu: ['previa', 'summary', 'videos', 'lineups', 'standings'],
};

// Las fuentes que publican el plantel poco antes del inicio. Para el resto,
// una alineación que no llegó antes del partido no llega nunca.
const PUBLISHES_LINEUPS_BEFORE_KICKOFF: readonly MatchProvider[] = [
    'local', 'flashscore', 'espn-soccer', 'rugby-api-sports', 'espn-american-football', 'fih', 'fisu',
];

// Lo que un administrador carga a mano. El resto se deriva de los eventos, asi
// que abrir su pestana vacia no le da ninguna accion.
// Los videos entran acá aunque no pasen por el editor: se pegan en la misma
// pestaña, y la pestaña vacía es justamente donde se pegan.
const MANUALLY_LOADABLE: readonly MatchTabId[] = ['lineups', 'stats', 'videos'];

const ORDER: readonly MatchTabId[] = [
    'previa', 'summary', 'videos', 'timeline', 'lineups', 'players', 'stats', 'h2h', 'standings', 'commentary',
];

export interface ResolveMatchTabsInput {
    provider: MatchProvider;
    status: MatchStatusKind;
    counts: Partial<MatchTabCounts>;
    /**
     * Quien puede editar el partido ve TODAS las secciones, incluso vacías.
     *
     * Esconder lo que no tiene datos es la regla para el hincha: una pestaña
     * vacía es una promesa incumplida. Para quien administra es al revés — la
     * pestaña vacía es la puerta por donde entra el dato. Y vale incluso en un
     * partido de API: los planteles se cargan a mano y quedan asociados al
     * club igual, así que el catálogo del proveedor no lo limita.
     */
    canManage?: boolean;
}

export function resolveMatchTabs({ provider, status, counts, canManage = false }: ResolveMatchTabsInput): ResolvedMatchTabs {
    const n = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const c: MatchTabCounts = {
        events: n(counts.events),
        lineups: n(counts.lineups),
        players: n(counts.players),
        stats: n(counts.stats),
        h2h: n(counts.h2h),
        standings: n(counts.standings),
        commentary: n(counts.commentary),
        videos: n(counts.videos),
    };

    // Con permiso de edición manda el catálogo local, que es todo lo que el
    // producto sabe mostrar, no lo que este proveedor publica.
    const supported = new Set(canManage ? SUPPORTED.local : (SUPPORTED[provider] ?? SUPPORTED.local));
    const tabs: MatchTab[] = [];
    const hidden: HiddenTab[] = [];

    const hide = (id: MatchTabId, reason: string) => {
        hidden.push({ id, label: LABELS[id].label, reason });
    };
    const show = (id: MatchTabId, state: MatchTabState, hint?: string) => {
        tabs.push({ id, ...LABELS[id], state, ...(hint ? { hint } : {}) });
    };

    for (const id of ORDER) {
        if (!supported.has(id)) {
            hide(id, 'La fuente no publica este dato.');
            continue;
        }

        // Para quien administra se abren las secciones que SE CARGAN a mano,
        // aunque esten vacias: son la puerta por donde entra el dato, y valen
        // incluso en un partido de API porque el plantel se asocia al club
        // igual. Cronologia, planilla y relato quedan afuera: no se cargan
        // directamente, se derivan de los eventos. Una pestana vacia que no
        // lleva a ningun lado es ruido tambien para el administrador.
        if (canManage && MANUALLY_LOADABLE.includes(id)) {
            const has = id === 'lineups' ? c.lineups > 0 : id === 'videos' ? c.videos > 0 : c.stats > 0;
            if (has) show(id, 'ready');
            else if (id === 'videos') show(id, 'pending', 'Sin videos todavía. Podés pegar el link de YouTube acá mismo.');
            else show(id, 'pending', 'Sin datos cargados todavía. Podés cargarlos desde el editor.');
            continue;
        }

        switch (id) {
            // La antesala solo existe antes del pitazo, y solo si hay algo
            // concreto que contar: historial o tabla. Sin eso es una pestaña
            // vacía con otro nombre.
            case 'previa': {
                if (status !== 'scheduled') { hide(id, 'El partido ya empezó.'); break; }
                if (c.h2h > 0 || c.standings > 0) show(id, 'ready');
                else hide(id, 'Sin historial ni tabla para anticipar nada.');
                break;
            }

            case 'summary': {
                if (status === 'scheduled') { hide(id, 'No se jugó: no hay nada que resumir.'); break; }
                if (c.events > 0 || c.stats > 0) show(id, 'ready');
                else hide(id, 'La fuente no entregó eventos ni estadísticas.');
                break;
            }

            case 'timeline': {
                if (c.events > 0) { show(id, 'ready'); break; }
                if (status === 'live') { show(id, 'pending', 'Todavía no pasó nada para registrar.'); break; }
                hide(id, status === 'scheduled' ? 'No hay eventos hasta el pitazo.' : 'La fuente no entregó eventos.');
                break;
            }

            case 'lineups': {
                if (c.lineups > 0) { show(id, 'ready'); break; }
                if (status !== 'final' && PUBLISHES_LINEUPS_BEFORE_KICKOFF.includes(provider)) {
                    show(id, 'pending', 'Los planteles se confirman cerca del inicio.');
                    break;
                }
                hide(id, 'Sin planteles cargados.');
                break;
            }

            case 'players': {
                if (c.players > 0) show(id, 'ready');
                else hide(id, status === 'scheduled' ? 'No se jugó: no hay planilla.' : 'Sin planilla individual.');
                break;
            }

            case 'stats': {
                if (c.stats > 0) show(id, 'ready');
                else hide(id, status === 'scheduled' ? 'No se jugó: no hay estadísticas.' : 'Sin estadísticas cargadas.');
                break;
            }

            case 'h2h': {
                if (c.h2h > 0) show(id, 'ready');
                else hide(id, 'Sin enfrentamientos previos entre estos clubes.');
                break;
            }

            case 'standings': {
                if (c.standings > 0) show(id, 'ready');
                else hide(id, 'El torneo no tiene tabla publicada.');
                break;
            }

            // Los videos son nuestros, no del proveedor, y valen en cualquier
            // estado: un partido programado puede tener el de ida, y uno en
            // vivo la transmisión que alguien subió.
            case 'videos': {
                if (c.videos > 0) show(id, 'ready');
                else hide(id, 'Sin videos cargados.');
                break;
            }

            case 'commentary': {
                if (c.commentary > 0) { show(id, 'ready'); break; }
                if (status === 'live') { show(id, 'pending', 'El relato arranca cuando haya con qué.'); break; }
                hide(id, 'Esta competencia no tiene relato cargado.');
                break;
            }
        }
    }

    // Piso: la barra nunca queda vacía.
    //
    // Un partido cargado a mano —resultado y nada más, que en los torneos
    // locales es lo normal— hace que ninguna sección califique, y sin esto la
    // página se quedaba sin una sola pestaña. Una pestaña honesta que dice que
    // no hay datos no es lo mismo que ocho que prometen y no cumplen.
    if (tabs.length === 0) {
        const floor: MatchTabId = status === 'scheduled' ? 'previa' : 'summary';
        tabs.push({ ...LABELS[floor], id: floor, state: 'ready' });
        const i = hidden.findIndex((h) => h.id === floor);
        if (i >= 0) hidden.splice(i, 1);
    }

    return { tabs, hidden, defaultTab: pickDefaultTab(tabs, status) };
}

// El estado del partido manda la pestaña de entrada: antes del pitazo lo que
// importa es la antesala, en vivo lo único que se mueve es la cronología, y
// terminado el resumen ya tiene números de verdad.
function pickDefaultTab(tabs: MatchTab[], status: MatchStatusKind): MatchTabId {
    const has = (id: MatchTabId) => tabs.some((t) => t.id === id && t.state === 'ready');
    const preference: MatchTabId[] =
        status === 'scheduled' ? ['previa', 'standings', 'h2h', 'lineups']
        : status === 'live' ? ['timeline', 'summary', 'stats']
        : ['summary', 'timeline', 'stats', 'players'];

    for (const id of preference) if (has(id)) return id;
    return tabs[0]?.id ?? 'summary';
}

/** Normaliza el estado crudo del partido a las tres formas que le importan a la barra. */
export function toMatchStatusKind(status: string | null | undefined): MatchStatusKind {
    const s = String(status ?? '').trim().toLowerCase();
    if (s === 'live' || s === 'inplay' || s === 'in_play') return 'live';
    if (s === 'final' || s === 'finished' || s === 'ft' || s === 'ended') return 'final';
    return 'scheduled';
}
