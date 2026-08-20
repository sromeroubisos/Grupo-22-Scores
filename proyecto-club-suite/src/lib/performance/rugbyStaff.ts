export type RugbyPerformanceScope = 'match_global' | 'club_private';
export type RugbyPerformanceContext = 'match' | 'training' | 'gym' | 'review';
export type RugbyFieldType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface RugbyFieldDefinition {
    key: string;
    label: string;
    type: RugbyFieldType;
    options?: string[];
    required?: boolean;
}

export interface RugbyPerformanceModule {
    key: string;
    label: string;
    shortLabel: string;
    scope: RugbyPerformanceScope;
    contextOptions: RugbyPerformanceContext[];
    description: string;
    fields: RugbyFieldDefinition[];
}

export interface RugbyPerformanceRecord {
    id: string;
    clubId: string;
    moduleKey: string;
    scope: RugbyPerformanceScope;
    context: RugbyPerformanceContext;
    matchId: string | null;
    trainingId: string | null;
    playerId: string | null;
    playerName: string;
    eventDate: string;
    payload: Record<string, string | number | boolean | null>;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface RugbyTaxonomyItem {
    id: string;
    moduleKey: string;
    eventKey: string;
    label: string;
    description: string;
    enabled: boolean;
    config: Record<string, unknown>;
}

export interface RugbyPerformanceInsights {
    totalRows: number;
    matchRows: number;
    privateRows: number;
    kickEffectiveness: number | null;
    kickToLineSuccess: number | null;
    scrumEffectiveness: number | null;
    lineEffectiveness: number | null;
    penalties: number;
    triesFor: number;
    triesAgainst: number;
    powerplayDiff: number;
    topKicker: string | null;
    alerts: Array<{
        id: string;
        level: 'ok' | 'warning' | 'danger';
        title: string;
        detail: string;
        suggestedBlock: string;
    }>;
}

const COMMON_ZONES = [
    '22 propia',
    'Salida propia',
    'Zona media',
    'Campo rival',
    '22 rival',
    '5m rival',
];

const PLAYER_PROFILE_OPTIONS = ['derecha', 'izquierda', 'ambos'];

const FIELD = {
    date: { key: 'date', label: 'Fecha', type: 'date' as const, required: true },
    notes: { key: 'notes', label: 'Notas', type: 'textarea' as const },
    zone: { key: 'zone', label: 'Zona', type: 'select' as const, options: COMMON_ZONES },
    rival: { key: 'rival', label: 'Rival', type: 'text' as const },
};

export const RUGBY_PERFORMANCE_MODULES: RugbyPerformanceModule[] = [
    {
        key: 'kicks',
        label: 'Patadas',
        shortLabel: 'Patadas',
        scope: 'match_global',
        contextOptions: ['match', 'training'],
        description: 'Registro de patadas en partido y entrenamiento con efectividad por jugador, zona y tipo.',
        fields: [
            FIELD.date,
            { key: 'kickType', label: 'Tipo de patada', type: 'select', required: true, options: ['a los palos', 'al line', 'despeje', 'grubber', 'box kick', 'restart', 'conversion', 'penal', 'drop'] },
            FIELD.zone,
            { key: 'result', label: 'Resultado', type: 'select', required: true, options: ['efectiva', 'no efectiva'] },
            { key: 'lineResult', label: 'Patada al line', type: 'select', options: ['no aplica', 'salio afuera', 'quedo adentro', 'ganamos metros', 'no ganamos metros', 'error'] },
            { key: 'distance', label: 'Distancia estimada', type: 'number' },
            { key: 'profile', label: 'Perfil', type: 'select', options: PLAYER_PROFILE_OPTIONS },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'scrums',
        label: 'Scrum',
        shortLabel: 'Scrum',
        scope: 'match_global',
        contextOptions: ['match', 'training'],
        description: 'Lectura de scrums propios y rivales con falencias tecnicas y resultado de pelota.',
        fields: [
            FIELD.date,
            { key: 'feedTeam', label: 'Entrada', type: 'select', required: true, options: ['equipo propio', 'rival'] },
            FIELD.zone,
            { key: 'result', label: 'Resultado', type: 'select', required: true, options: ['ganado', 'perdido', 'penal a favor', 'penal en contra', 'pelota sucia', 'pelota limpia', 'colapsado', 'girado'] },
            { key: 'players', label: 'Jugadores involucrados', type: 'text' },
            { key: 'weakness', label: 'Falencia principal', type: 'select', options: ['empuje', 'altura', 'entrada', 'angulo', 'timing', 'hookeo', 'estabilidad', 'coordinacion primera linea', 'coordinacion segunda/tercera linea', 'penal tecnico'] },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'lines',
        label: 'Line',
        shortLabel: 'Line',
        scope: 'match_global',
        contextOptions: ['match', 'training'],
        description: 'Seguimiento de lines propios/rivales, lanzador, saltador, llamada y causa de error.',
        fields: [
            FIELD.date,
            FIELD.zone,
            { key: 'thrower', label: 'Lanzador', type: 'text' },
            { key: 'jumper', label: 'Saltador', type: 'text' },
            { key: 'call', label: 'Jugada llamada', type: 'text' },
            { key: 'result', label: 'Resultado', type: 'select', required: true, options: ['ganado limpio', 'ganado sucio', 'perdido', 'robo', 'penal', 'knock-on', 'mala ejecucion'] },
            { key: 'cause', label: 'Causa exito/error', type: 'select', options: ['lanzamiento', 'timing', 'levantadores', 'lectura rival', 'mala comunicacion', 'mala llamada', 'presion rival'] },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'penalties',
        label: 'Penales y causas',
        shortLabel: 'Penales',
        scope: 'match_global',
        contextOptions: ['match'],
        description: 'Registro de penal, causa, consecuencia y si fue tecnico o disciplina.',
        fields: [
            FIELD.date,
            { key: 'minute', label: 'Minuto', type: 'number' },
            { key: 'committingTeam', label: 'Equipo que comete', type: 'select', required: true, options: ['equipo propio', 'rival'] },
            FIELD.zone,
            { key: 'cause', label: 'Causa', type: 'select', required: true, options: ['offside', 'no liberar', 'no soltar tackler', 'scrum', 'line', 'maul', 'ruck', 'tackle alto', 'ingreso lateral', 'manos en el ruck', 'derrumbe', 'antijuego', 'disciplina', 'otra'] },
            { key: 'consequence', label: 'Consecuencia', type: 'select', options: ['puntos recibidos', 'perdida territorial', 'line rival', 'scrum rival', 'tarjeta', 'sin consecuencia'] },
            { key: 'type', label: 'Tipo', type: 'select', options: ['tecnico', 'disciplina'] },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'tries',
        label: 'Tries y origen',
        shortLabel: 'Tries',
        scope: 'match_global',
        contextOptions: ['match'],
        description: 'Origen de tries a favor/en contra y eventos cercanos previos.',
        fields: [
            FIELD.date,
            { key: 'tryType', label: 'Try', type: 'select', required: true, options: ['a favor', 'en contra'] },
            { key: 'scorer', label: 'Jugador que apoya', type: 'text' },
            { key: 'originZone', label: 'Zona de origen', type: 'select', options: COMMON_ZONES },
            { key: 'previousPhase', label: 'Fase previa', type: 'select', options: ['scrum', 'line', 'penal rapido', 'recuperacion', 'kick return', 'turnover', 'ataque organizado', 'maul', 'error rival'] },
            { key: 'phaseCount', label: 'Fases previas', type: 'number' },
            { key: 'nearEvents', label: 'Eventos cercanos', type: 'text' },
            { key: 'playName', label: 'Jugada asociada', type: 'text' },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'powerplay',
        label: 'Powerplay',
        shortLabel: 'Powerplay',
        scope: 'match_global',
        contextOptions: ['match'],
        description: 'Superioridad o inferioridad numerica por amarillas y rojas con diferencial de puntos.',
        fields: [
            FIELD.date,
            { key: 'cardMinute', label: 'Minuto tarjeta', type: 'number' },
            { key: 'sanctionedTeam', label: 'Equipo sancionado', type: 'select', required: true, options: ['equipo propio', 'rival'] },
            { key: 'sanctionedPlayer', label: 'Jugador sancionado', type: 'text' },
            { key: 'cardType', label: 'Tipo', type: 'select', options: ['amarilla', 'roja'] },
            { key: 'duration', label: 'Duracion', type: 'number' },
            { key: 'pointsFor', label: 'Puntos anotados', type: 'number' },
            { key: 'pointsAgainst', label: 'Puntos recibidos', type: 'number' },
            { key: 'events', label: 'Tries/penales/conversiones', type: 'text' },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'plays',
        label: 'Jugadas del club',
        shortLabel: 'Jugadas',
        scope: 'club_private',
        contextOptions: ['match', 'training', 'review'],
        description: 'Biblioteca privada de jugadas y medicion de efectividad por zona, rival y causa.',
        fields: [
            FIELD.date,
            { key: 'playName', label: 'Nombre', type: 'text', required: true },
            { key: 'playType', label: 'Tipo', type: 'select', options: ['line', 'scrum', 'ataque', 'salida', 'defensa', 'maul', 'backs', 'forwards'] },
            { key: 'objective', label: 'Objetivo', type: 'text' },
            { key: 'idealZone', label: 'Zona ideal', type: 'select', options: COMMON_ZONES },
            { key: 'players', label: 'Jugadores involucrados', type: 'text' },
            { key: 'result', label: 'Resultado', type: 'select', options: ['efectiva', 'no efectiva'] },
            { key: 'successCause', label: 'Causa de exito', type: 'text' },
            { key: 'errorCause', label: 'Causa de error', type: 'text' },
            FIELD.rival,
            FIELD.notes,
        ],
    },
    {
        key: 'gym',
        label: 'Gimnasio',
        shortLabel: 'Gym',
        scope: 'club_private',
        contextOptions: ['gym', 'training'],
        description: 'Carga fisica por jugador: ejercicio, peso, repeticiones, series, RPE y molestias.',
        fields: [
            FIELD.date,
            { key: 'exercise', label: 'Ejercicio', type: 'select', required: true, options: ['sentadilla', 'peso muerto', 'press banca', 'press militar', 'dominadas', 'remo', 'hip thrust', 'cargadas', 'sprint', 'test de velocidad', 'test de resistencia', 'saltos'] },
            { key: 'weight', label: 'Peso levantado', type: 'number' },
            { key: 'reps', label: 'Repeticiones', type: 'number' },
            { key: 'sets', label: 'Series', type: 'number' },
            { key: 'rpe', label: 'RPE', type: 'number' },
            { key: 'injury', label: 'Molestia/lesion', type: 'text' },
            FIELD.notes,
        ],
    },
    {
        key: 'gps',
        label: 'Velocidad, metros y GPS manual',
        shortLabel: 'GPS manual',
        scope: 'club_private',
        contextOptions: ['match', 'training'],
        description: 'Registro manual de carga externa: velocidad, metros, sprints y aceleraciones.',
        fields: [
            FIELD.date,
            { key: 'maxSpeed', label: 'Velocidad maxima', type: 'number' },
            { key: 'meters', label: 'Metros recorridos', type: 'number' },
            { key: 'sprints', label: 'Sprints', type: 'number' },
            { key: 'accelerations', label: 'Aceleraciones', type: 'number' },
            { key: 'minutesPlayed', label: 'Minutos', type: 'number' },
            FIELD.notes,
        ],
    },
    {
        key: 'training_plan',
        label: 'Planificacion de entrenamientos',
        shortLabel: 'Planificacion',
        scope: 'club_private',
        contextOptions: ['training', 'review'],
        description: 'Planificado vs realizado, asistencia, errores detectados y conclusiones para el proximo entrenamiento.',
        fields: [
            FIELD.date,
            { key: 'category', label: 'Categoria', type: 'text' },
            { key: 'objective', label: 'Objetivo', type: 'text' },
            { key: 'blocks', label: 'Bloques', type: 'text' },
            { key: 'duration', label: 'Duracion', type: 'number' },
            { key: 'calledPlayers', label: 'Convocados', type: 'text' },
            { key: 'responsibleStaff', label: 'Staff responsable', type: 'text' },
            { key: 'attendance', label: 'Asistencia', type: 'number' },
            { key: 'detectedErrors', label: 'Errores detectados', type: 'text' },
            { key: 'nextConclusion', label: 'Conclusion siguiente', type: 'textarea' },
        ],
    },
];

export const MATCH_GLOBAL_MODULE_KEYS = RUGBY_PERFORMANCE_MODULES
    .filter((module) => module.scope === 'match_global')
    .map((module) => module.key);

export const CLUB_PRIVATE_MODULE_KEYS = RUGBY_PERFORMANCE_MODULES
    .filter((module) => module.scope === 'club_private')
    .map((module) => module.key);

export function getPerformanceModule(moduleKey: string) {
    return RUGBY_PERFORMANCE_MODULES.find((module) => module.key === moduleKey) ?? RUGBY_PERFORMANCE_MODULES[0];
}

export function isMatchGlobalModule(moduleKey: string) {
    return getPerformanceModule(moduleKey).scope === 'match_global';
}

export function createEmptyPerformanceRecord(
    clubId: string,
    moduleKey: string,
    options?: { playerId?: string | null; playerName?: string | null }
): RugbyPerformanceRecord {
    const performanceModule = getPerformanceModule(moduleKey);
    const today = new Date().toISOString().slice(0, 10);
    const payload = Object.fromEntries(
        performanceModule.fields.map((field) => [
            field.key,
            field.key === 'date'
                ? today
                : field.type === 'number'
                    ? 0
                    : field.options?.[0] ?? '',
        ])
    ) as Record<string, string | number | boolean | null>;

    return {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}`,
        clubId,
        moduleKey,
        scope: performanceModule.scope,
        context: performanceModule.contextOptions[0],
        matchId: null,
        trainingId: null,
        playerId: options?.playerId ?? null,
        playerName: options?.playerName ?? '',
        eventDate: today,
        payload,
    };
}

export const DEFAULT_RUGBY_TAXONOMY: RugbyTaxonomyItem[] = RUGBY_PERFORMANCE_MODULES
    .filter((module) => module.scope === 'match_global')
    .map((module, index) => ({
        id: `default-${module.key}`,
        moduleKey: module.key,
        eventKey: module.key,
        label: module.label,
        description: module.description,
        enabled: true,
        config: {
            fields: module.fields.map((field) => field.key),
            order: index + 1,
            clubAdminAvailable: true,
            superAdminAvailable: true,
        },
    }));

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function numeric(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part: number, total: number) {
    if (!total) return null;
    return Math.round((part / total) * 100);
}

function isPositiveResult(value: unknown) {
    const normalized = normalizeText(value);
    return [
        'efectiva',
        'ganado',
        'ganado limpio',
        'ganado sucio',
        'pelota limpia',
        'penal a favor',
        'salio afuera',
        'ganamos metros',
    ].includes(normalized);
}

export function calculateRugbyPerformanceInsights(rows: RugbyPerformanceRecord[]): RugbyPerformanceInsights {
    const kicks = rows.filter((row) => row.moduleKey === 'kicks');
    const scrums = rows.filter((row) => row.moduleKey === 'scrums');
    const lines = rows.filter((row) => row.moduleKey === 'lines');
    const penalties = rows.filter((row) => row.moduleKey === 'penalties');
    const tries = rows.filter((row) => row.moduleKey === 'tries');
    const powerplay = rows.filter((row) => row.moduleKey === 'powerplay');
    const plays = rows.filter((row) => row.moduleKey === 'plays');

    const kickEffective = kicks.filter((row) => isPositiveResult(row.payload.result)).length;
    const kickToLine = kicks.filter((row) => normalizeText(row.payload.kickType) === 'al line');
    const kickToLineSuccess = kickToLine.filter((row) => ['salio afuera', 'ganamos metros'].includes(normalizeText(row.payload.lineResult))).length;
    const scrumEffective = scrums.filter((row) => isPositiveResult(row.payload.result)).length;
    const lineEffective = lines.filter((row) => isPositiveResult(row.payload.result)).length;
    const triesFor = tries.filter((row) => normalizeText(row.payload.tryType) === 'a favor').length;
    const triesAgainst = tries.filter((row) => normalizeText(row.payload.tryType) === 'en contra').length;
    const powerplayDiff = powerplay.reduce((sum, row) => (
        sum + numeric(row.payload.pointsFor) - numeric(row.payload.pointsAgainst)
    ), 0);

    const kickerScores = new Map<string, { total: number; ok: number }>();
    kicks.forEach((row) => {
        const name = row.playerName || 'Sin jugador';
        const current = kickerScores.get(name) ?? { total: 0, ok: 0 };
        current.total += 1;
        if (isPositiveResult(row.payload.result)) current.ok += 1;
        kickerScores.set(name, current);
    });

    const topKicker = Array.from(kickerScores.entries())
        .filter(([, value]) => value.total >= 2)
        .sort((left, right) => (right[1].ok / right[1].total) - (left[1].ok / left[1].total))[0]?.[0] ?? null;

    const ownOffside = penalties.filter((row) => (
        normalizeText(row.payload.committingTeam) === 'equipo propio'
        && normalizeText(row.payload.cause) === 'offside'
    )).length;
    const lineThrowLosses = lines.filter((row) => (
        ['perdido', 'mala ejecucion', 'knock-on'].includes(normalizeText(row.payload.result))
        && normalizeText(row.payload.cause) === 'lanzamiento'
    )).length;
    const midLineKickFailures = kickToLine.filter((row) => (
        normalizeText(row.payload.zone) === 'zona media'
        && ['quedo adentro', 'no ganamos metros', 'error'].includes(normalizeText(row.payload.lineResult))
    )).length;
    const repeatedPlayFailures = plays.filter((row) => normalizeText(row.payload.result) === 'no efectiva').length;

    const alerts: RugbyPerformanceInsights['alerts'] = [];

    if (ownOffside >= 3) {
        alerts.push({
            id: 'offside',
            level: 'danger',
            title: 'Penales por offside',
            detail: `${ownOffside} penales propios por offside cargados.`,
            suggestedBlock: 'Defensa: linea, timing de subida y comunicacion del 10/15.',
        });
    }

    if (lineThrowLosses >= 2) {
        alerts.push({
            id: 'line-throw',
            level: 'warning',
            title: 'Line con problema de lanzamiento',
            detail: `${lineThrowLosses} lines perdidos por lanzamiento.`,
            suggestedBlock: 'Line: rutina de lanzador, timing y levantadores.',
        });
    }

    if (midLineKickFailures >= 2) {
        alerts.push({
            id: 'line-kick',
            level: 'warning',
            title: 'Patadas al line desde zona media',
            detail: `${midLineKickFailures} patadas quedaron adentro o sin metros ganados.`,
            suggestedBlock: 'Patadas: perfil, distancia y decision en zona media.',
        });
    }

    if (repeatedPlayFailures >= 3) {
        alerts.push({
            id: 'plays-review',
            level: 'danger',
            title: 'Jugadas internas para revision',
            detail: `${repeatedPlayFailures} usos no efectivos en la biblioteca privada.`,
            suggestedBlock: 'Revision tactica: simplificar llamada y definir disparadores.',
        });
    }

    if (alerts.length === 0) {
        alerts.push({
            id: 'ok',
            level: 'ok',
            title: 'Sin alertas criticas',
            detail: 'Los eventos cargados no superan umbrales de riesgo.',
            suggestedBlock: 'Mantener seguimiento por zona, jugador y contexto.',
        });
    }

    return {
        totalRows: rows.length,
        matchRows: rows.filter((row) => row.scope === 'match_global').length,
        privateRows: rows.filter((row) => row.scope === 'club_private').length,
        kickEffectiveness: percent(kickEffective, kicks.length),
        kickToLineSuccess: percent(kickToLineSuccess, kickToLine.length),
        scrumEffectiveness: percent(scrumEffective, scrums.length),
        lineEffectiveness: percent(lineEffective, lines.length),
        penalties: penalties.length,
        triesFor,
        triesAgainst,
        powerplayDiff,
        topKicker,
        alerts,
    };
}
