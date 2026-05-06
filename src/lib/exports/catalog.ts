export type ExportTemplateId =
    | 'standings'
    | 'dailyMatches'
    | 'matchStats'
    | 'playerStats'
    | 'playoffBracket'
    | 'lineups'
    | 'teamOfWeek';

export type ExportPresetType = 'editorial' | 'gradient';

export type ExportCatalogFormat = {
    id: ExportTemplateId;
    name: string;
    description: string;
    outputLabel: string;
};

export type ExportCatalogDimension = {
    id: string;
    name: string;
    width: number;
    height: number;
    usage: string;
};

export type ExportCatalogTypography = {
    id: string;
    role: string;
    family: string;
    weight: string;
    usage: string;
};

export type ExportCatalogPalette = {
    id: string;
    name: string;
    description: string;
    bg: string;
    accent: string;
};

export type ExportCatalogStyleRule = {
    id: string;
    label: string;
    value: string;
};

export type ExportCatalogLayoutPreset = {
    id: string;
    label: string;
    description: string;
};

export type ExportCatalogGradientPreset = {
    id: string;
    name: string;
    gradientLeftColor: string;
    gradientRightColor: string;
};

export const EXPORT_TEMPLATE_CATALOG: ExportCatalogFormat[] = [
    {
        id: 'standings',
        name: 'Tabla de posiciones',
        description: 'Exporta standings en tabla corrida o por grupos desde el motor real de ExportImage.',
        outputLabel: 'Standings',
    },
    {
        id: 'dailyMatches',
        name: 'Fixture / proximos partidos',
        description: 'Genera agenda de partidos con horario, estado y branding del torneo.',
        outputLabel: 'Agenda',
    },
    {
        id: 'matchStats',
        name: 'Resultado y estadisticas de partido',
        description: 'Usa el layout clasico o editorial 4:5 para marcador, contexto y estadisticas.',
        outputLabel: 'Match stats',
    },
    {
        id: 'playerStats',
        name: 'Estadisticas de jugador',
        description: 'Ficha individual para rendimiento de jugador con metricas destacadas.',
        outputLabel: 'Player stats',
    },
    {
        id: 'playoffBracket',
        name: 'Bracket / playoff',
        description: 'Cuadro eliminatorio para cruces, rondas y series finales.',
        outputLabel: 'Bracket',
    },
    {
        id: 'lineups',
        name: 'Alineaciones',
        description: 'Export de formaciones de local, visitante o ambos equipos en una sola pieza.',
        outputLabel: 'Lineups',
    },
    {
        id: 'teamOfWeek',
        name: 'Equipo de la semana',
        description: 'Afiche tipo Starting XV con 15 seleccionados, reemplazos y escudo del equipo por jugador.',
        outputLabel: 'Team of the week',
    },
];

export const EXPORT_OUTPUT_FORMATS: ExportCatalogDimension[] = [
    { id: '1080x1350', name: 'Post', width: 1080, height: 1350, usage: 'Formato feed 4:5 activo en el motor actual' },
    { id: '1080x1920', name: 'Story', width: 1080, height: 1920, usage: 'Formato vertical full-screen activo en el motor actual' },
];

export const EXPORT_TYPOGRAPHY_CATALOG: ExportCatalogTypography[] = [
    {
        id: 'dharma-gothic',
        role: 'Titulos y scores',
        family: 'G22 Dharma Gothic',
        weight: '800',
        usage: 'Tipografia de alto impacto usada en scoreboards, hero editorial y titulares.',
    },
    {
        id: 'bebas-neue',
        role: 'Titular condensado',
        family: 'Bebas Neue',
        weight: '400',
        usage: 'Alternativa de afiche para familias editoriales como Momentum y Poster V3.',
    },
    {
        id: 'outfit',
        role: 'Texto de interfaz',
        family: 'Outfit',
        weight: '300-900',
        usage: 'Base de labels, subtitulos, cuerpo y bloques informativos del export.',
    },
    {
        id: 'inter',
        role: 'Texto editorial',
        family: 'Inter',
        weight: '300-900',
        usage: 'Alternativa mas neutra para cuerpo, labels y piezas con tono mas periodistico.',
    },
    {
        id: 'jetbrains-mono',
        role: 'Metadata y chips',
        family: 'JetBrains Mono',
        weight: '400-800',
        usage: 'Chips, tags, labels de tiempo y metadata operativa.',
    },
    {
        id: 'tangerine',
        role: 'Firma decorativa',
        family: 'Tangerine',
        weight: '400-700',
        usage: 'Script ornamental para firmas, cierres o piezas especiales de alto contraste.',
    },
    {
        id: 'inconsolata',
        role: 'Mono editorial',
        family: 'Inconsolata',
        weight: '200-900',
        usage: 'Mono con mas personalidad para datos, placas tecnicas y overlays informativos.',
    },
    {
        id: 'cantarell',
        role: 'Sans humanista',
        family: 'Cantarell',
        weight: '400-700',
        usage: 'Alternativa calida para labels, subtitulos y cuerpo con tono mas humano.',
    },
    {
        id: 'roboto-mono',
        role: 'Mono precisa',
        family: 'Roboto Mono',
        weight: '400-700',
        usage: 'Ideal para horarios, resultados parciales y modulos de estadisticas compactas.',
    },
    {
        id: 'rancho',
        role: 'Display expresiva',
        family: 'Rancho',
        weight: '400',
        usage: 'Display gestual para posters, titulares especiales y piezas con mas caracter.',
    },
];

export const EXPORT_PALETTE_CATALOG: ExportCatalogPalette[] = [
    { id: 'g22-dark', name: 'G22 Dark', description: 'Carbono y verde marca', bg: '#0a0a0b', accent: '#00a365' },
    { id: 'g22-light', name: 'G22 Light', description: 'Claro con acento marca', bg: '#f8fafc', accent: '#00a365' },
    { id: 'rugby-navy', name: 'Rugby Navy', description: 'Azul profundo y cian', bg: '#0f172a', accent: '#38bdf8' },
    { id: 'crimson-night', name: 'Crimson Night', description: 'Grafito con rojo intenso', bg: '#111827', accent: '#ef4444' },
    { id: 'gold-ink', name: 'Gold Ink', description: 'Negro con dorado editorial', bg: '#161616', accent: '#eab308' },
    { id: 'silver-sky', name: 'Silver Sky', description: 'Blanco con azul limpio', bg: '#ffffff', accent: '#2563eb' },
];

export const EXPORT_EDITORIAL_LAYOUT_CATALOG: ExportCatalogLayoutPreset[] = [
    { id: 'balanced', label: 'Balanced', description: 'Bloque editorial equilibrado para resultado final' },
    { id: 'broadcast', label: 'Broadcast', description: 'Mas aire superior y bloque central compacto' },
    { id: 'hero', label: 'Hero', description: 'Version de alto dramatismo para final o partido destacado' },
];

export const EXPORT_DEFAULT_GRADIENT_PRESETS: ExportCatalogGradientPreset[] = [
    { id: 'app-signature', name: 'Signature', gradientLeftColor: '#df255c', gradientRightColor: '#00a365' },
    { id: 'app-broadcast', name: 'Broadcast', gradientLeftColor: '#1d4ed8', gradientRightColor: '#38bdf8' },
    { id: 'app-inferno', name: 'Inferno', gradientLeftColor: '#7f1d1d', gradientRightColor: '#ef4444' },
    { id: 'app-gold', name: 'Gold', gradientLeftColor: '#5b3b09', gradientRightColor: '#eab308' },
    { id: 'app-frost', name: 'Frost', gradientLeftColor: '#4338ca', gradientRightColor: '#7dd3fc' },
    { id: 'app-carbon', name: 'Carbon', gradientLeftColor: '#111827', gradientRightColor: '#22c55e' },
];

export const EXPORT_TIMEZONE_PRESET_COUNT = 39;

export const BASE_EXPORT_STYLE_RULES: ExportCatalogStyleRule[] = [
    {
        id: 'palettes',
        label: 'Paletas activas',
        value: `${EXPORT_PALETTE_CATALOG.length} paletas reales disponibles en el modal de exportacion`,
    },
    {
        id: 'editorial-layouts',
        label: 'Layouts editoriales',
        value: `${EXPORT_EDITORIAL_LAYOUT_CATALOG.length} presets de composicion para resultado 4:5`,
    },
    {
        id: 'gradient-presets',
        label: 'Gradientes base',
        value: `${EXPORT_DEFAULT_GRADIENT_PRESETS.length} presets base para reutilizar color y textura`,
    },
    {
        id: 'timezones',
        label: 'Timezones',
        value: `${EXPORT_TIMEZONE_PRESET_COUNT} presets horarios soportados por el motor actual`,
    },
    {
        id: 'cloud-sync',
        label: 'Sincronizacion',
        value: 'Los presets personales cloud se guardan en user_export_presets',
    },
];

export const BASE_EXPORT_GUIDELINES: string[] = [
    'Los exports se generan con el motor real ExportImage usado en rankings, resultados, fixtures, partidos y torneos.',
    'Las variantes personales sincronizadas hoy cubren presets editoriales y presets de gradientes.',
    'La estructura del catalogo soporta multiples disenos activos dentro del mismo motor de exportacion.',
];
