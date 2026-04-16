import { createClient } from '@/lib/supabase/client';

export type ExportDesignPreviewMode = 'soft' | 'contrast' | 'poster';
export type ExportDesignTypographySlot = 'display' | 'body' | 'mono' | 'editorial' | 'score';
export type ExportDesignTypographyContextId =
    | 'global'
    | 'matchClassicSchedule'
    | 'matchClassicResult'
    | 'matchEditorialSchedule'
    | 'matchEditorialResult'
    | 'dailyMatches'
    | 'standings'
    | 'playerStats'
    | 'playoffBracket'
    | 'lineups';

export type ExportDesignElementDimensionContextId = Exclude<ExportDesignTypographyContextId, 'global'>;
export type ExportDesignElementDimensionItemId = 'title' | 'tournamentLogo' | 'teamLogo' | 'teamName' | 'score' | 'rowHeight';

export type ExportDesignTypographyItem = {
    id: string;
    role: string;
    family: string;
    weight: string;
    usage: string;
    previewText: string;
    slot?: ExportDesignTypographySlot;
    isCustom?: boolean;
};

export type ExportDesignTypographyContext = {
    id: ExportDesignTypographyContextId;
    label: string;
    description: string;
    items: ExportDesignTypographyItem[];
};

export type ExportDesignPaletteItem = {
    id: string;
    label: string;
    value: string;
    note: string;
};

export type ExportDesignStyleRuleItem = {
    id: string;
    label: string;
    value: string;
};

export type ExportDesignElementDimensionItem = {
    id: ExportDesignElementDimensionItemId;
    label: string;
    width: number;
    offsetY: number;
    note: string;
};

export type ExportDesignElementDimensionContext = {
    id: ExportDesignElementDimensionContextId;
    label: string;
    description: string;
    items: ExportDesignElementDimensionItem[];
};

export type ExportDesignCustomizationState = {
    typography: ExportDesignTypographyItem[];
    typographyContexts: ExportDesignTypographyContext[];
    elementDimensionContexts: ExportDesignElementDimensionContext[];
    palette: ExportDesignPaletteItem[];
    styleRules: ExportDesignStyleRuleItem[];
    previewAccent: string;
    previewSurface: string;
    previewGradientFrom: string;
    previewGradientTo: string;
    previewMode: ExportDesignPreviewMode;
};

export const EXPORT_DESIGN_CUSTOMIZATION_STORAGE_KEY = 'g22-export-design-customizations-v1';
export const EXPORT_DESIGN_CUSTOMIZATION_PRESET_TYPE = 'design_customization';
export const EXPORT_DESIGN_CUSTOMIZATION_EVENT = 'g22:export-design-customization-change';

type SupabaseBrowserClient = ReturnType<typeof createClient>;
type ExportDesignCustomizationStorageMode = 'local' | 'cloud';
type PersistedExportDesignCustomizationRow = {
    id: string;
    payload: unknown;
    updated_at?: string;
};

type TypographyContextDefinition = {
    id: ExportDesignTypographyContextId;
    label: string;
    description: string;
    items: Array<{
        id: string;
        role: string;
        usage: string;
        previewText: string;
        slot: ExportDesignTypographySlot;
    }>;
};

type ElementDimensionContextDefinition = {
    id: ExportDesignElementDimensionContextId;
    label: string;
    description: string;
    items: ExportDesignElementDimensionItem[];
};

export const EXPORT_DESIGN_TYPOGRAPHY_CONTEXTS: TypographyContextDefinition[] = [
    {
        id: 'global',
        label: 'Base global',
        description: 'Fallback general del diseno para cuando un export no tiene una regla propia.',
        items: [
            { id: 'global-display', role: 'Titulos globales', usage: 'Titulos principales del sistema.', previewText: 'Titular principal', slot: 'display' },
            { id: 'global-body', role: 'Texto global', usage: 'Texto general y descripciones.', previewText: 'Texto informativo', slot: 'body' },
            { id: 'global-mono', role: 'Metadata global', usage: 'Horas, chips y metadata tecnica.', previewText: '21:45 UTC-3', slot: 'mono' },
            { id: 'global-editorial', role: 'Titular editorial global', usage: 'Bloques editoriales y cierres visuales.', previewText: 'Editorial', slot: 'editorial' },
            { id: 'global-score', role: 'Scores globales', usage: 'Marcadores y numeros de alto impacto.', previewText: '3 - 1', slot: 'score' },
        ],
    },
    {
        id: 'matchClassicSchedule',
        label: 'Horario clasico',
        description: 'Configura la pieza clasica de partido cuando muestra programacion.',
        items: [
            { id: 'match-classic-schedule-display', role: 'Equipos y titulo', usage: 'Nombres de equipos y encabezados del layout clasico.', previewText: 'Club A vs Club B', slot: 'display' },
            { id: 'match-classic-schedule-mono', role: 'Horario', usage: 'Hora y datos operativos del partido programado.', previewText: '21:45', slot: 'mono' },
            { id: 'match-classic-schedule-body', role: 'Texto de apoyo', usage: 'Competencia, estadio y contexto.', previewText: 'Fecha 5 · Estadio Central', slot: 'body' },
        ],
    },
    {
        id: 'matchClassicResult',
        label: 'Resultado clasico',
        description: 'Configura el layout clasico del resultado con score y estadisticas.',
        items: [
            { id: 'match-classic-result-display', role: 'Equipos', usage: 'Nombres de equipos en la version clasica.', previewText: 'Club A / Club B', slot: 'display' },
            { id: 'match-classic-result-score', role: 'Marcador', usage: 'Numeros del resultado principal.', previewText: '3 - 1', slot: 'score' },
            { id: 'match-classic-result-body', role: 'Stats y labels', usage: 'Etiquetas y descripciones de estadisticas.', previewText: 'Posesion · Remates', slot: 'body' },
            { id: 'match-classic-result-mono', role: 'Metadata', usage: 'Chips y texto tecnico del partido.', previewText: 'FT · 90:00', slot: 'mono' },
        ],
    },
    {
        id: 'matchEditorialSchedule',
        label: 'Horario editorial',
        description: 'Configura la version editorial 4:5 para partidos programados.',
        items: [
            { id: 'match-editorial-schedule-editorial', role: 'Titular editorial', usage: 'Bloque protagonista del horario editorial.', previewText: 'Match time', slot: 'editorial' },
            { id: 'match-editorial-schedule-mono', role: 'Hora y fecha', usage: 'Hora exacta y metadata de agenda.', previewText: '21:45 · Hoy', slot: 'mono' },
            { id: 'match-editorial-schedule-body', role: 'Soporte editorial', usage: 'Contexto, competencia y detalles secundarios.', previewText: 'Semifinal · Estadio Central', slot: 'body' },
            { id: 'match-editorial-schedule-score', role: 'Hero numerico', usage: 'Numeracion o cifras de alto impacto si se usan.', previewText: '21:45', slot: 'score' },
        ],
    },
    {
        id: 'matchEditorialResult',
        label: 'Resultado editorial',
        description: 'Configura el poster editorial 4:5 para resultado final.',
        items: [
            { id: 'match-editorial-result-editorial', role: 'Hero editorial', usage: 'Titular principal del afiche.', previewText: 'Full time', slot: 'editorial' },
            { id: 'match-editorial-result-score', role: 'Marcador hero', usage: 'Numeros centrales del resultado.', previewText: '3 - 1', slot: 'score' },
            { id: 'match-editorial-result-body', role: 'Equipos y soporte', usage: 'Nombres y contexto secundario.', previewText: 'Club A · Club B', slot: 'body' },
            { id: 'match-editorial-result-mono', role: 'Metadata editorial', usage: 'Sublineas, status y detalles tecnicos.', previewText: 'Final · Fecha 5', slot: 'mono' },
        ],
    },
    {
        id: 'dailyMatches',
        label: 'Fixture / agenda',
        description: 'Configura la tipografia de proximos partidos y agenda diaria.',
        items: [
            { id: 'daily-matches-score', role: 'Titulo agenda', usage: 'Titular principal de la agenda.', previewText: 'Fixtures', slot: 'score' },
            { id: 'daily-matches-display', role: 'Equipos', usage: 'Nombres de cruces en la agenda.', previewText: 'Club A vs Club B', slot: 'display' },
            { id: 'daily-matches-mono', role: 'Horarios y metadata', usage: 'Hora, ronda y datos operativos.', previewText: '21:45 · Cancha 1', slot: 'mono' },
            { id: 'daily-matches-body', role: 'Texto auxiliar', usage: 'Subtitulos y lineas secundarias.', previewText: 'Fecha 5 · Zona A', slot: 'body' },
        ],
    },
    {
        id: 'standings',
        label: 'Tabla de posiciones',
        description: 'Configura titulos, filas y numerica de standings.',
        items: [
            { id: 'standings-score', role: 'Titulo tabla', usage: 'Encabezado principal de la tabla.', previewText: 'Clasificacion', slot: 'score' },
            { id: 'standings-body', role: 'Equipos y filas', usage: 'Texto de equipos y columnas.', previewText: 'Club A', slot: 'body' },
            { id: 'standings-mono', role: 'Metadata tabla', usage: 'Etiquetas de columnas y subtitulos.', previewText: 'PJ · DG · PTS', slot: 'mono' },
            { id: 'standings-editorial', role: 'Acento editorial', usage: 'Titulos complementarios o grupos.', previewText: 'Zona A', slot: 'editorial' },
        ],
    },
    {
        id: 'playerStats',
        label: 'Estadisticas de jugador',
        description: 'Configura la pieza individual de rendimiento del jugador.',
        items: [
            { id: 'player-stats-display', role: 'Nombre jugador', usage: 'Nombre principal del jugador.', previewText: 'Juan Perez', slot: 'display' },
            { id: 'player-stats-score', role: 'Metricas destacadas', usage: 'Cifras protagonistas de la ficha.', previewText: '24', slot: 'score' },
            { id: 'player-stats-body', role: 'Labels de metricas', usage: 'Nombres de estadisticas y texto auxiliar.', previewText: 'Puntos · Rebotes', slot: 'body' },
            { id: 'player-stats-mono', role: 'Metadata tecnica', usage: 'Minutos, dorsal y datos de soporte.', previewText: '32 MIN', slot: 'mono' },
        ],
    },
    {
        id: 'playoffBracket',
        label: 'Playoff / bracket',
        description: 'Configura cruces, rondas y marcadores del cuadro eliminatorio.',
        items: [
            { id: 'playoff-score', role: 'Titulo playoff', usage: 'Titulo del cuadro y rondas destacadas.', previewText: 'Playoff', slot: 'score' },
            { id: 'playoff-body', role: 'Equipos del cruce', usage: 'Texto de participantes y series.', previewText: 'Club A', slot: 'body' },
            { id: 'playoff-mono', role: 'Rondas y metadata', usage: 'Nombre de ronda y datos complementarios.', previewText: 'Semifinal', slot: 'mono' },
            { id: 'playoff-editorial', role: 'Acento editorial', usage: 'Titulos o overlays especiales del bracket.', previewText: 'Road to final', slot: 'editorial' },
        ],
    },
    {
        id: 'lineups',
        label: 'Alineaciones',
        description: 'Configura la formacion de equipos y bancos de suplentes.',
        items: [
            { id: 'lineups-score', role: 'Titulo alineacion', usage: 'Titulo principal de la pieza de formaciones.', previewText: 'Formacion', slot: 'score' },
            { id: 'lineups-body', role: 'Nombres de jugadores', usage: 'Jugadores titulares y suplentes.', previewText: 'Juan Perez', slot: 'body' },
            { id: 'lineups-mono', role: 'Metadata de lista', usage: 'Dorsales, posiciones y subtitulos.', previewText: '10 · Apertura', slot: 'mono' },
            { id: 'lineups-display', role: 'Nombre de equipo', usage: 'Nombre del equipo en la pieza.', previewText: 'Club A', slot: 'display' },
        ],
    },
];

export const EXPORT_DESIGN_ELEMENT_DIMENSION_CONTEXTS: ElementDimensionContextDefinition[] = [
    {
        id: 'matchClassicSchedule',
        label: 'Horario clasico',
        description: 'Escala y posicion vertical del layout clasico para partido programado.',
        items: [
            { id: 'title', label: 'Titulo / hero', width: 118, offsetY: 0, note: 'Tamano proporcional del titular principal y ajuste vertical.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 323, offsetY: 0, note: 'Tamano proporcional del logo y control para mover el elemento en el eje Y.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 188, offsetY: 0, note: 'Tamano proporcional y eje Y de los escudos.' },
            { id: 'teamName', label: 'Nombre equipo', width: 34, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre del equipo dentro del cruce.' },
            { id: 'score', label: 'Centro / score', width: 212, offsetY: 0, note: 'Tamano proporcional y eje Y del bloque central numerico o VS.' },
            { id: 'rowHeight', label: 'Modulo principal', width: 304, offsetY: 0, note: 'Escala del bloque principal y desplazamiento vertical del modulo.' },
        ],
    },
    {
        id: 'matchClassicResult',
        label: 'Resultado clasico',
        description: 'Escala y posicion vertical del layout clasico para resultado final.',
        items: [
            { id: 'title', label: 'Titulo / torneo', width: 66, offsetY: 0, note: 'Tamano proporcional del encabezado y ajuste vertical.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 56, offsetY: 0, note: 'Tamano proporcional del logo y control para mover el elemento en el eje Y.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 154, offsetY: 0, note: 'Tamano proporcional y eje Y del escudo dentro de la placa.' },
            { id: 'teamName', label: 'Nombre equipo', width: 28, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre de cada equipo.' },
            { id: 'score', label: 'Marcador', width: 232, offsetY: 0, note: 'Tamano proporcional y eje Y del score principal.' },
            { id: 'rowHeight', label: 'Bloque central', width: 372, offsetY: 0, note: 'Escala de la placa central y desplazamiento vertical del bloque.' },
        ],
    },
    {
        id: 'matchEditorialSchedule',
        label: 'Horario editorial',
        description: 'Escala y posicion vertical del poster editorial de horario.',
        items: [
            { id: 'title', label: 'Titular editorial', width: 118, offsetY: 0, note: 'Tamano proporcional del titular principal y ajuste vertical.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 323, offsetY: 0, note: 'Tamano proporcional del logo y control para mover el elemento en el eje Y.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 188, offsetY: 0, note: 'Tamano proporcional y eje Y de logos dentro de tarjetas.' },
            { id: 'teamName', label: 'Nombre equipo', width: 34, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre del equipo en las tarjetas.' },
            { id: 'score', label: 'Centro / VS', width: 212, offsetY: 0, note: 'Tamano proporcional y eje Y del bloque central o cifra.' },
            { id: 'rowHeight', label: 'Tarjeta principal', width: 336, offsetY: 0, note: 'Escala de tarjetas del match-up y desplazamiento vertical del bloque.' },
        ],
    },
    {
        id: 'matchEditorialResult',
        label: 'Resultado editorial',
        description: 'Escala y posicion vertical del poster editorial de resultado.',
        items: [
            { id: 'title', label: 'Titulo editorial', width: 64, offsetY: 0, note: 'Tamano proporcional del titulo de competencia o cierre.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 110, offsetY: 0, note: 'Tamano proporcional del logo y control para mover el elemento en el eje Y.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 375, offsetY: 0, note: 'Tamano proporcional y eje Y de logos laterales del poster.' },
            { id: 'teamName', label: 'Nombre equipo', width: 32, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre del equipo en el poster.' },
            { id: 'score', label: 'Marcador', width: 210, offsetY: 0, note: 'Tamano proporcional y eje Y del score principal.' },
            { id: 'rowHeight', label: 'Overlay inferior', width: 100, offsetY: 0, note: 'Escala del overlay inferior y desplazamiento vertical del bloque.' },
        ],
    },
    {
        id: 'dailyMatches',
        label: 'Fixture / agenda',
        description: 'Escala y posicion vertical del listado de partidos.',
        items: [
            { id: 'title', label: 'Titulo fixture', width: 20, offsetY: 0, note: 'Tamano proporcional de la capsula superior y ajuste vertical.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 34, offsetY: 0, note: 'Tamano proporcional y eje Y del logo de torneo.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 58, offsetY: 0, note: 'Tamano proporcional y eje Y de escudos por fila.' },
            { id: 'teamName', label: 'Nombre equipo', width: 24, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre de cada equipo.' },
            { id: 'score', label: 'Hora / score', width: 38, offsetY: 0, note: 'Tamano proporcional y eje Y del bloque central por fila.' },
            { id: 'rowHeight', label: 'Fila de partido', width: 112, offsetY: 0, note: 'Escala de cada fila y desplazamiento vertical del listado.' },
        ],
    },
    {
        id: 'standings',
        label: 'Tabla de posiciones',
        description: 'Escala y posicion vertical del layout de standings.',
        items: [
            { id: 'title', label: 'Titulo tabla', width: 20, offsetY: 0, note: 'Tamano proporcional de la capsula superior y ajuste vertical.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 34, offsetY: 0, note: 'Tamano proporcional y eje Y del logo de torneo.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 40, offsetY: 0, note: 'Tamano proporcional y eje Y de escudos de equipos.' },
            { id: 'teamName', label: 'Nombre equipo', width: 26, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre en cada fila.' },
            { id: 'score', label: 'Puntos / metricas', width: 26, offsetY: 0, note: 'Tamano proporcional y eje Y de la numerica principal.' },
            { id: 'rowHeight', label: 'Fila de tabla', width: 30, offsetY: 0, note: 'Escala de cada fila y desplazamiento vertical del bloque.' },
        ],
    },
    {
        id: 'playerStats',
        label: 'Estadisticas de jugador',
        description: 'Escala y posicion vertical del afiche de jugador.',
        items: [
            { id: 'title', label: 'Nombre / titulo', width: 86, offsetY: 0, note: 'Tamano proporcional del titulo y nombre principal.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 58, offsetY: 0, note: 'Tamano proporcional y eje Y del logo de torneo.' },
            { id: 'teamLogo', label: 'Logo / foto', width: 120, offsetY: 0, note: 'Tamano proporcional y eje Y del avatar o escudo auxiliar.' },
            { id: 'teamName', label: 'Nombre secundario', width: 24, offsetY: 0, note: 'Tamano proporcional y eje Y de nombre de equipo o apoyo.' },
            { id: 'score', label: 'Metrica hero', width: 48, offsetY: 0, note: 'Tamano proporcional y eje Y de la estadistica protagonista.' },
            { id: 'rowHeight', label: 'Card de metricas', width: 160, offsetY: 0, note: 'Escala de tarjetas de metricas y desplazamiento vertical del bloque.' },
        ],
    },
    {
        id: 'playoffBracket',
        label: 'Playoff / bracket',
        description: 'Escala y posicion vertical del cuadro eliminatorio.',
        items: [
            { id: 'title', label: 'Titulo playoff', width: 102, offsetY: 0, note: 'Tamano proporcional del titulo principal.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 58, offsetY: 0, note: 'Tamano proporcional y eje Y del logo de torneo.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 28, offsetY: 0, note: 'Tamano proporcional y eje Y de escudos en cruces.' },
            { id: 'teamName', label: 'Nombre equipo', width: 14, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre del participante.' },
            { id: 'score', label: 'Score cruce', width: 26, offsetY: 0, note: 'Tamano proporcional y eje Y del score en cada match.' },
            { id: 'rowHeight', label: 'Tarjeta de cruce', width: 92, offsetY: 0, note: 'Escala de cada tarjeta y desplazamiento vertical del bloque.' },
        ],
    },
    {
        id: 'lineups',
        label: 'Alineaciones',
        description: 'Escala y posicion vertical de la pieza de formaciones.',
        items: [
            { id: 'title', label: 'Titulo alineacion', width: 92, offsetY: 0, note: 'Tamano proporcional del titulo principal.' },
            { id: 'tournamentLogo', label: 'Logo torneo', width: 54, offsetY: 0, note: 'Tamano proporcional y eje Y del logo de torneo.' },
            { id: 'teamLogo', label: 'Logo equipo', width: 52, offsetY: 0, note: 'Tamano proporcional y eje Y de logos de equipos.' },
            { id: 'teamName', label: 'Nombre equipo', width: 30, offsetY: 0, note: 'Tamano proporcional y eje Y del nombre del equipo.' },
            { id: 'score', label: 'Numeros / dorsales', width: 32, offsetY: 0, note: 'Tamano proporcional y eje Y de dorsales y cifras.' },
            { id: 'rowHeight', label: 'Fila de jugadores', width: 32, offsetY: 0, note: 'Escala de filas de jugadores y desplazamiento vertical del bloque.' },
        ],
    },
];

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function isExpectedExportCustomizationSyncFailure(error: unknown) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const normalizedMessage = message.toLowerCase();
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';

    return code === '42P01'
        || code === 'PGRST301'
        || code === '23514'
        || normalizedMessage.includes('failed to fetch')
        || normalizedMessage.includes('fetch failed')
        || normalizedMessage.includes('load failed')
        || normalizedMessage.includes('networkerror')
        || normalizedMessage.includes('network error')
        || normalizedMessage.includes('supabase_auth_unreachable')
        || normalizedMessage.includes('jwt')
        || normalizedMessage.includes('session')
        || normalizedMessage.includes('auth session missing')
        || normalizedMessage.includes('user_export_presets')
        || normalizedMessage.includes('preset_type');
}

function logUnexpectedExportCustomizationSyncFailure(label: string, error: unknown) {
    if (isExpectedExportCustomizationSyncFailure(error)) return;
    console.warn(label, error);
}

function dispatchExportDesignCustomizationChange(designSlug: string) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EXPORT_DESIGN_CUSTOMIZATION_EVENT, { detail: designSlug }));
}

function inferTypographySlot(item: Partial<ExportDesignTypographyItem>): ExportDesignTypographySlot {
    const normalizedId = String(item.id ?? '').toLowerCase();
    const normalizedRole = String(item.role ?? '').toLowerCase();

    if (
        normalizedId.includes('mono')
        || normalizedId.includes('jetbrains')
        || normalizedId.includes('roboto')
        || normalizedId.includes('inconsolata')
        || normalizedRole.includes('metadata')
        || normalizedRole.includes('chip')
        || normalizedRole.includes('horario')
    ) {
        return 'mono';
    }
    if (
        normalizedId.includes('score')
        || normalizedId.includes('dharma')
        || normalizedRole.includes('score')
        || normalizedRole.includes('marcador')
        || normalizedRole.includes('titulo')
    ) {
        return 'score';
    }
    if (
        normalizedId.includes('editorial')
        || normalizedId.includes('bebas')
        || normalizedId.includes('rancho')
        || normalizedId.includes('tangerine')
        || normalizedRole.includes('editorial')
        || normalizedRole.includes('titular')
        || normalizedRole.includes('firma')
    ) {
        return 'editorial';
    }
    if (
        normalizedRole.includes('interfaz')
        || normalizedRole.includes('texto')
        || normalizedRole.includes('humanista')
        || normalizedRole.includes('sans')
    ) {
        return 'body';
    }

    return 'display';
}

function normalizeTypographyItem(
    item: Partial<ExportDesignTypographyItem>,
    fallback: Partial<ExportDesignTypographyItem> = {}
): ExportDesignTypographyItem {
    const role = typeof item.role === 'string' && item.role.trim()
        ? item.role.trim()
        : typeof fallback.role === 'string' && fallback.role.trim()
            ? fallback.role.trim()
            : 'Tipografia';

    return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : String(fallback.id ?? `font-${Date.now()}`),
        role,
        family: typeof item.family === 'string' && item.family.trim() ? item.family.trim() : String(fallback.family ?? 'Outfit'),
        weight: typeof item.weight === 'string' && item.weight.trim() ? item.weight.trim() : String(fallback.weight ?? '700'),
        usage: typeof item.usage === 'string' ? item.usage : String(fallback.usage ?? ''),
        previewText: typeof item.previewText === 'string' && item.previewText.trim()
            ? item.previewText
            : String(fallback.previewText ?? role),
        slot: item.slot ?? fallback.slot ?? inferTypographySlot(item),
        isCustom: Boolean(item.isCustom ?? fallback.isCustom),
    };
}

function normalizeElementDimensionItem(
    item: Partial<ExportDesignElementDimensionItem>,
    fallback: Partial<ExportDesignElementDimensionItem> = {}
): ExportDesignElementDimensionItem {
    return {
        id: (item.id ?? fallback.id ?? 'title') as ExportDesignElementDimensionItemId,
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : String(fallback.label ?? 'Elemento'),
        width: typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Number(fallback.width ?? 0),
        offsetY: typeof item.offsetY === 'number' && Number.isFinite(item.offsetY) ? item.offsetY : Number(fallback.offsetY ?? 0),
        note: typeof item.note === 'string' ? item.note : String(fallback.note ?? ''),
    };
}

function buildDefaultTypographyContexts(typography: ExportDesignTypographyItem[]): ExportDesignTypographyContext[] {
    const slotFallbacks = new Map<ExportDesignTypographySlot, ExportDesignTypographyItem>();
    for (const item of typography) {
        const normalized = normalizeTypographyItem(item);
        if (!slotFallbacks.has(normalized.slot || 'display')) {
            slotFallbacks.set(normalized.slot || 'display', normalized);
        }
    }

    return EXPORT_DESIGN_TYPOGRAPHY_CONTEXTS.map((context) => ({
        id: context.id,
        label: context.label,
        description: context.description,
        items: context.items.map((itemDef) => {
            const slotFallback = slotFallbacks.get(itemDef.slot);
            return normalizeTypographyItem(
                {
                    id: itemDef.id,
                    role: itemDef.role,
                    usage: itemDef.usage,
                    previewText: itemDef.previewText,
                    slot: itemDef.slot,
                    family: slotFallback?.family,
                    weight: slotFallback?.weight,
                },
                {
                    id: itemDef.id,
                    role: itemDef.role,
                    usage: itemDef.usage,
                    previewText: itemDef.previewText,
                    slot: itemDef.slot,
                    family: 'Outfit',
                    weight: itemDef.slot === 'score' ? '800' : itemDef.slot === 'mono' ? '400-800' : '700',
                }
            );
        }),
    }));
}

function buildDefaultElementDimensionContexts(): ExportDesignElementDimensionContext[] {
    return EXPORT_DESIGN_ELEMENT_DIMENSION_CONTEXTS.map((context) => ({
        id: context.id,
        label: context.label,
        description: context.description,
        items: context.items.map((item) => normalizeElementDimensionItem(item, item)),
    }));
}

function migrateG22BaseScheduleContexts(state: ExportDesignCustomizationState): ExportDesignCustomizationState {
    const defaultContexts = buildDefaultTypographyContexts(state.typography);
    const defaultContextsById = new Map(defaultContexts.map((context) => [context.id, context] as const));
    const currentContextsById = new Map(state.typographyContexts.map((context) => [context.id, context] as const));
    const classicContext = defaultContextsById.get('matchClassicSchedule');
    const editorialContext = currentContextsById.get('matchEditorialSchedule');

    if (!classicContext || !editorialContext) {
        return state;
    }

    const editorialItemsBySlot = new Map(
        editorialContext.items
            .filter((item) => item.slot)
            .map((item) => [item.slot as ExportDesignTypographySlot, item] as const)
    );

    const migratedClassicItems = classicContext.items.map((item) => {
        const source = item.slot === 'display'
            ? editorialItemsBySlot.get('editorial') ?? editorialItemsBySlot.get('display') ?? editorialItemsBySlot.get('score')
            : item.slot
                ? editorialItemsBySlot.get(item.slot)
                : null;

        if (!source) {
            return item;
        }

        return normalizeTypographyItem(
            {
                ...item,
                family: source.family,
                weight: source.weight,
            },
            item
        );
    });

    return {
        ...state,
        typographyContexts: defaultContexts.map((defaultContext) => {
            if (defaultContext.id === 'matchClassicSchedule') {
                return {
                    ...defaultContext,
                    items: migratedClassicItems,
                };
            }

            if (defaultContext.id === 'matchEditorialSchedule') {
                return defaultContext;
            }

            return currentContextsById.get(defaultContext.id) ?? defaultContext;
        }),
    };
}

function applyExportDesignCustomizationMigrations(
    designSlug: string,
    state: ExportDesignCustomizationState | null
): ExportDesignCustomizationState | null {
    if (!state) return null;
    if (designSlug !== 'g22-base') return state;
    return migrateG22BaseScheduleContexts(state);
}

export function normalizeExportDesignCustomizationState(payload: unknown): ExportDesignCustomizationState | null {
    const record = asRecord(payload);
    const typography = Array.isArray(record.typography)
        ? record.typography.map((item) => normalizeTypographyItem(asRecord(item)))
        : null;
    const palette = Array.isArray(record.palette) ? record.palette as ExportDesignPaletteItem[] : null;
    const styleRules = Array.isArray(record.styleRules) ? record.styleRules as ExportDesignStyleRuleItem[] : null;
    const previewAccent = typeof record.previewAccent === 'string' ? record.previewAccent : null;
    const previewSurface = typeof record.previewSurface === 'string' ? record.previewSurface : null;
    const previewGradientFrom = typeof record.previewGradientFrom === 'string' ? record.previewGradientFrom : null;
    const previewGradientTo = typeof record.previewGradientTo === 'string' ? record.previewGradientTo : null;
    const previewMode = record.previewMode === 'contrast' || record.previewMode === 'poster' || record.previewMode === 'soft'
        ? record.previewMode
        : null;

    if (!typography || !palette || !styleRules || !previewAccent || !previewSurface || !previewGradientFrom || !previewGradientTo || !previewMode) {
        return null;
    }

    const rawContexts = Array.isArray(record.typographyContexts) ? record.typographyContexts : [];
    const contextsById = new Map(
        rawContexts
            .map((context) => {
                const parsedContext = asRecord(context);
                const contextId = parsedContext.id;
                const definition = EXPORT_DESIGN_TYPOGRAPHY_CONTEXTS.find((item) => item.id === contextId);
                if (!definition) return null;

                const rawItems = Array.isArray(parsedContext.items) ? parsedContext.items : [];
                const items = rawItems.map((item) => normalizeTypographyItem(asRecord(item)));
                return [
                    definition.id,
                    {
                        id: definition.id,
                        label: typeof parsedContext.label === 'string' && parsedContext.label.trim() ? parsedContext.label : definition.label,
                        description: typeof parsedContext.description === 'string' && parsedContext.description.trim()
                            ? parsedContext.description
                            : definition.description,
                        items,
                    } satisfies ExportDesignTypographyContext,
                ] as const;
            })
            .filter(Boolean) as ReadonlyArray<readonly [ExportDesignTypographyContextId, ExportDesignTypographyContext]>
    );

    const fallbackContexts = buildDefaultTypographyContexts(typography);
    const typographyContexts = fallbackContexts.map((fallbackContext) => {
        const savedContext = contextsById.get(fallbackContext.id);
        if (!savedContext) return fallbackContext;

        const fallbackItemsById = new Map(fallbackContext.items.map((item) => [item.id, item] as const));
        const savedItemsById = new Map(savedContext.items.map((item) => [item.id, item] as const));
        const items = fallbackContext.items.map((fallbackItem) => (
            normalizeTypographyItem(savedItemsById.get(fallbackItem.id) ?? fallbackItem, fallbackItem)
        ));

        savedContext.items.forEach((item) => {
            if (!fallbackItemsById.has(item.id)) {
                items.push(normalizeTypographyItem(item));
            }
        });

        return {
            ...fallbackContext,
            label: savedContext.label,
            description: savedContext.description,
            items,
        };
    });

    const rawElementContexts = Array.isArray(record.elementDimensionContexts) ? record.elementDimensionContexts : [];
    const elementContextById = new Map(
        rawElementContexts
            .map((context) => {
                const parsedContext = asRecord(context);
                const contextId = parsedContext.id;
                const definition = EXPORT_DESIGN_ELEMENT_DIMENSION_CONTEXTS.find((item) => item.id === contextId);
                if (!definition) return null;
                const items = Array.isArray(parsedContext.items)
                    ? parsedContext.items.map((item) => normalizeElementDimensionItem(asRecord(item)))
                    : [];
                return [
                    definition.id,
                    {
                        id: definition.id,
                        label: typeof parsedContext.label === 'string' && parsedContext.label.trim() ? parsedContext.label : definition.label,
                        description: typeof parsedContext.description === 'string' && parsedContext.description.trim()
                            ? parsedContext.description
                            : definition.description,
                        items,
                    } satisfies ExportDesignElementDimensionContext,
                ] as const;
            })
            .filter(Boolean) as ReadonlyArray<readonly [ExportDesignElementDimensionContextId, ExportDesignElementDimensionContext]>
    );

    const fallbackElementContexts = buildDefaultElementDimensionContexts();
    const elementDimensionContexts = fallbackElementContexts.map((fallbackContext) => {
        const savedContext = elementContextById.get(fallbackContext.id);
        if (!savedContext) return fallbackContext;

        const fallbackItemsById = new Map(fallbackContext.items.map((item) => [item.id, item] as const));
        const savedItemsById = new Map(savedContext.items.map((item) => [item.id, item] as const));
        const items = fallbackContext.items.map((fallbackItem) => (
            normalizeElementDimensionItem(savedItemsById.get(fallbackItem.id) ?? fallbackItem, fallbackItem)
        ));

        savedContext.items.forEach((item) => {
            if (!fallbackItemsById.has(item.id)) {
                items.push(normalizeElementDimensionItem(item));
            }
        });

        return {
            ...fallbackContext,
            label: savedContext.label,
            description: savedContext.description,
            items,
        };
    });

    return {
        typography,
        typographyContexts,
        elementDimensionContexts,
        palette,
        styleRules,
        previewAccent,
        previewSurface,
        previewGradientFrom,
        previewGradientTo,
        previewMode,
    };
}

export function readSavedExportDesignCustomization(designSlug: string): ExportDesignCustomizationState | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(EXPORT_DESIGN_CUSTOMIZATION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return applyExportDesignCustomizationMigrations(designSlug, normalizeExportDesignCustomizationState(parsed[designSlug]));
    } catch {
        return null;
    }
}

export function persistExportDesignCustomization(
    designSlug: string,
    state: ExportDesignCustomizationState,
    options?: { dispatchChangeEvent?: boolean }
) {
    if (typeof window === 'undefined') return;

    try {
        const raw = window.localStorage.getItem(EXPORT_DESIGN_CUSTOMIZATION_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) as Record<string, ExportDesignCustomizationState | undefined> : {};
        parsed[designSlug] = applyExportDesignCustomizationMigrations(designSlug, state) ?? state;
        window.localStorage.setItem(EXPORT_DESIGN_CUSTOMIZATION_STORAGE_KEY, JSON.stringify(parsed));
        if (options?.dispatchChangeEvent !== false) {
            dispatchExportDesignCustomizationChange(designSlug);
        }
    } catch {
        // Ignore persistence failures in readonly or private contexts.
    }
}

function normalizeCustomizationName(designSlug: string) {
    return designSlug.trim().toLowerCase();
}

function buildCustomizationRowId(userId: string, designSlug: string) {
    return `${EXPORT_DESIGN_CUSTOMIZATION_PRESET_TYPE}-${userId}-${normalizeCustomizationName(designSlug)}`;
}

function getAuthenticatedExportCustomizationUserId(supabase: SupabaseBrowserClient): Promise<string | null> {
    return supabase.auth.getUser().then(({ data, error }) => {
        if (error) {
            logUnexpectedExportCustomizationSyncFailure('Export customization auth read warning:', error);
            return null;
        }
        return data.user?.id ?? null;
    });
}

function mapPersistedCustomizationPayload(
    designSlug: string,
    payload: unknown
): ExportDesignCustomizationState | null {
    return applyExportDesignCustomizationMigrations(designSlug, normalizeExportDesignCustomizationState(payload));
}

async function readRemoteSavedExportDesignCustomization(
    supabase: SupabaseBrowserClient,
    userId: string,
    designSlug: string,
): Promise<ExportDesignCustomizationState | null> {
    const { data, error } = await supabase
        .from('user_export_presets')
        .select('id, payload, updated_at')
        .eq('user_id', userId)
        .eq('preset_type', EXPORT_DESIGN_CUSTOMIZATION_PRESET_TYPE)
        .eq('name_normalized', normalizeCustomizationName(designSlug))
        .order('updated_at', { ascending: false })
        .limit(1);

    if (error) {
        throw error;
    }

    const row = ((data ?? []) as PersistedExportDesignCustomizationRow[])[0];
    return row ? mapPersistedCustomizationPayload(designSlug, row.payload) : null;
}

async function persistRemoteExportDesignCustomization(
    supabase: SupabaseBrowserClient,
    userId: string,
    designSlug: string,
    state: ExportDesignCustomizationState,
): Promise<void> {
    const normalizedName = normalizeCustomizationName(designSlug);
    const migratedState = applyExportDesignCustomizationMigrations(designSlug, state) ?? state;

    const { error: deleteError } = await supabase
        .from('user_export_presets')
        .delete()
        .eq('user_id', userId)
        .eq('preset_type', EXPORT_DESIGN_CUSTOMIZATION_PRESET_TYPE)
        .eq('name_normalized', normalizedName);

    if (deleteError) {
        throw deleteError;
    }

    const { error: insertError } = await supabase
        .from('user_export_presets')
        .insert({
            id: buildCustomizationRowId(userId, designSlug),
            user_id: userId,
            preset_type: EXPORT_DESIGN_CUSTOMIZATION_PRESET_TYPE,
            name: `Customization ${designSlug}`,
            name_normalized: normalizedName,
            payload: migratedState,
        });

    if (insertError) {
        throw insertError;
    }
}

export async function hydrateSavedExportDesignCustomization(
    designSlug: string,
    supabase: SupabaseBrowserClient,
): Promise<{ state: ExportDesignCustomizationState | null; storageMode: ExportDesignCustomizationStorageMode }> {
    const localState = readSavedExportDesignCustomization(designSlug);
    const userId = await getAuthenticatedExportCustomizationUserId(supabase);

    if (!userId) {
        return { state: localState, storageMode: 'local' };
    }

    try {
        const remoteState = await readRemoteSavedExportDesignCustomization(supabase, userId, designSlug);
        if (remoteState) {
            persistExportDesignCustomization(designSlug, remoteState, { dispatchChangeEvent: false });
            return { state: remoteState, storageMode: 'cloud' };
        }
    } catch (error) {
        logUnexpectedExportCustomizationSyncFailure('Export customization hydration warning:', error);
    }

    return { state: localState, storageMode: 'local' };
}

export async function saveExportDesignCustomization(
    designSlug: string,
    state: ExportDesignCustomizationState,
    supabase: SupabaseBrowserClient,
): Promise<ExportDesignCustomizationStorageMode> {
    const migratedState = applyExportDesignCustomizationMigrations(designSlug, state) ?? state;
    persistExportDesignCustomization(designSlug, migratedState);
    const userId = await getAuthenticatedExportCustomizationUserId(supabase);

    if (!userId) {
        return 'local';
    }

    try {
        await persistRemoteExportDesignCustomization(supabase, userId, designSlug, migratedState);
        return 'cloud';
    } catch (error) {
        logUnexpectedExportCustomizationSyncFailure('Export customization save warning:', error);
        return 'local';
    }
}
