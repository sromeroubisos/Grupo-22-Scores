import { createAdminClient } from '@/lib/supabase/admin';
import { APP_TIMEZONE, ensureUtcDateTimeString } from '@/lib/timezone';
import type {
    AttendanceState,
    PlanBlock,
    PlanBlockType,
    TrainingEntry,
    TrainingEvaluation,
    TrainingPlayer,
    TrainingStatus,
    TrainingType,
} from './trainings';

type ClubTrainingRow = {
    id: string;
    club_id: string;
    source_key: string | null;
    source_kind: string | null;
    source_match_id: string | null;
    division_id: string | null;
    title: string | null;
    scheduled_at: string | null;
    duration_minutes: number | null;
    training_type: string | null;
    status: string | null;
    location: string | null;
    objective: string | null;
    source_label: string | null;
    convocados: number | null;
    staff_names: unknown;
    players_snapshot: unknown;
    attendance: unknown;
    plan_blocks: unknown;
    evaluation: unknown;
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);
const TRAINING_TYPES = new Set<TrainingType>(['campo', 'gimnasio', 'video', 'recuperacion']);
const TRAINING_STATUSES = new Set<TrainingStatus>(['planificado', 'en_curso', 'finalizado', 'sin_evaluar']);
const ATTENDANCE_STATES = new Set<AttendanceState>(['confirmado', 'ausente', 'dudoso']);
const PLAN_BLOCK_TYPES = new Set<PlanBlockType>(['warmup', 'tecnico', 'tactico', 'fisico', 'cierre']);
const SELECT_COLUMNS = [
    'id',
    'club_id',
    'source_key',
    'source_kind',
    'source_match_id',
    'division_id',
    'title',
    'scheduled_at',
    'duration_minutes',
    'training_type',
    'status',
    'location',
    'objective',
    'source_label',
    'convocados',
    'staff_names',
    'players_snapshot',
    'attendance',
    'plan_blocks',
    'evaluation',
].join(', ');

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

export function isMissingClubTrainingsTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function normalizeText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNullableText(value: unknown) {
    const normalized = normalizeText(value);
    return normalized.length > 0 ? normalized : null;
}

function normalizeInteger(
    value: unknown,
    fallback: number,
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numeric)));
}

function parsePersistedTrainingType(value: unknown): TrainingType | null {
    const normalized = normalizeText(value);
    return TRAINING_TYPES.has(normalized as TrainingType)
        ? normalized as TrainingType
        : null;
}

function parsePersistedTrainingStatus(value: unknown): TrainingStatus | null {
    const normalized = normalizeText(value);
    return TRAINING_STATUSES.has(normalized as TrainingStatus)
        ? normalized as TrainingStatus
        : null;
}

function normalizeStaffNames(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }

    return value
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .slice(0, 8);
}

function normalizePlayersSnapshot(value: unknown): TrainingPlayer[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return [];
        }

        const row = entry as Record<string, unknown>;
        const id = normalizeText(row.id);
        const name = normalizeText(row.name);
        if (!id || !name) {
            return [];
        }

        return [{
            id,
            name,
            pos: normalizeText(row.pos),
            divisionId: normalizeNullableText(row.divisionId),
            divisionName: normalizeNullableText(row.divisionName),
        }];
    });
}

function normalizeAttendance(value: unknown): Record<string, AttendanceState> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, state]) => typeof state === 'string' && ATTENDANCE_STATES.has(state as AttendanceState))
        .map(([playerId, state]) => [playerId, state as AttendanceState]);

    return Object.fromEntries(entries);
}

function normalizePlanBlocks(value: unknown): PlanBlock[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return [];
        }

        const row = entry as Record<string, unknown>;
        const id = normalizeText(row.id);
        const type = normalizeText(row.type);
        if (!id || !PLAN_BLOCK_TYPES.has(type as PlanBlockType)) {
            return [];
        }

        return [{
            id,
            type: type as PlanBlockType,
            title: normalizeText(row.title),
            duration: normalizeInteger(row.duration, 0, 0, 240),
            notes: normalizeText(row.notes),
            intensity: normalizeNullableText(row.intensity) ?? undefined,
        }];
    });
}

function normalizeEvaluation(value: unknown, defaultDuration: number): TrainingEvaluation | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const row = value as Record<string, unknown>;
    const rpe = Number(row.rpe);
    const durationReal = Number(row.durationReal);
    const loadTotal = Number(row.loadTotal);
    const energy = Number(row.energy);
    const fatigue = Number(row.fatigue);

    if (
        !Number.isFinite(rpe)
        || !Number.isFinite(durationReal)
        || !Number.isFinite(loadTotal)
        || !Number.isFinite(energy)
        || !Number.isFinite(fatigue)
    ) {
        return undefined;
    }

    return {
        rpe: normalizeInteger(rpe, 0, 0, 10),
        durationReal: normalizeInteger(durationReal, defaultDuration, 1, 600),
        loadTotal: normalizeInteger(loadTotal, 0, 0, 100000),
        notes: normalizeText(row.notes),
        energy: normalizeInteger(energy, 0, 0, 10),
        fatigue: normalizeInteger(fatigue, 0, 0, 10),
        injuries: normalizeText(row.injuries),
    };
}

function mapRowToTrainingEntry(row: ClubTrainingRow): TrainingEntry {
    const players = normalizePlayersSnapshot(row.players_snapshot);
    const duration = normalizeInteger(row.duration_minutes, 0, 0, 600);
    const attendance = normalizeAttendance(row.attendance);
    const planBlocks = normalizePlanBlocks(row.plan_blocks);
    const sourceKey = normalizeNullableText(row.source_key);
    const scheduledAt = ensureUtcDateTimeString(row.scheduled_at, APP_TIMEZONE);
    const title = normalizeText(row.title);
    const type = parsePersistedTrainingType(row.training_type);
    const status = parsePersistedTrainingStatus(row.status);
    const location = normalizeText(row.location);

    if (!scheduledAt) {
        throw new Error(`El entrenamiento ${row.id} no tiene una fecha valida en club_trainings.`);
    }

    if (!title) {
        throw new Error(`El entrenamiento ${row.id} no tiene titulo real en club_trainings.`);
    }

    if (!type) {
        throw new Error(`El entrenamiento ${row.id} tiene un training_type invalido en club_trainings.`);
    }

    if (!status) {
        throw new Error(`El entrenamiento ${row.id} tiene un status invalido en club_trainings.`);
    }

    if (!location) {
        throw new Error(`El entrenamiento ${row.id} no tiene ubicacion real en club_trainings.`);
    }

    if (duration <= 0) {
        throw new Error(`El entrenamiento ${row.id} no tiene una duracion valida en club_trainings.`);
    }

    return {
        id: sourceKey || row.id,
        persistedId: row.id,
        sourceKey,
        sourceKind: normalizeNullableText(row.source_kind),
        divisionId: normalizeNullableText(row.division_id),
        title,
        date: scheduledAt,
        duration,
        type,
        location,
        status,
        objective: normalizeText(row.objective),
        staff: normalizeStaffNames(row.staff_names),
        convocados: normalizeInteger(row.convocados, players.length, 0, 200),
        players,
        sourceLabel: normalizeNullableText(row.source_label),
        sourceMatchId: normalizeNullableText(row.source_match_id),
        plan: planBlocks.length > 0 ? { blocks: planBlocks } : undefined,
        evaluation: normalizeEvaluation(row.evaluation, duration),
        attendance: Object.keys(attendance).length > 0 ? attendance : undefined,
    };
}

function mapTrainingToRow(clubId: string, training: TrainingEntry) {
    const players = normalizePlayersSnapshot(training.players ?? []);
    const duration = normalizeInteger(training.duration, 0, 0, 600);
    const scheduledAt = ensureUtcDateTimeString(training.date, APP_TIMEZONE);
    const title = normalizeText(training.title);
    const location = normalizeText(training.location);
    const objective = normalizeText(training.objective);
    const trainingType = parsePersistedTrainingType(training.type);
    const trainingStatus = parsePersistedTrainingStatus(training.status);

    if (!scheduledAt) {
        throw new Error('Fecha de entrenamiento invalida');
    }

    if (!title) {
        throw new Error('El entrenamiento necesita un titulo real.');
    }

    if (!location) {
        throw new Error('El entrenamiento necesita una sede real.');
    }

    if (!objective) {
        throw new Error('El entrenamiento necesita un objetivo real.');
    }

    if (duration <= 0) {
        throw new Error('El entrenamiento necesita una duracion valida.');
    }

    if (!trainingType) {
        throw new Error('El entrenamiento necesita un tipo valido.');
    }

    if (!trainingStatus) {
        throw new Error('El entrenamiento necesita un estado valido.');
    }

    return {
        club_id: clubId,
        source_key: normalizeNullableText(training.sourceKey),
        source_kind: normalizeNullableText(training.sourceKind) ?? (training.sourceKey ? 'calendar' : 'manual'),
        source_match_id: normalizeNullableText(training.sourceMatchId),
        division_id: normalizeNullableText(training.divisionId),
        title,
        scheduled_at: scheduledAt,
        duration_minutes: duration,
        training_type: trainingType,
        status: trainingStatus,
        location,
        objective,
        source_label: normalizeNullableText(training.sourceLabel),
        convocados: normalizeInteger(training.convocados, players.length, 0, 200),
        staff_names: normalizeStaffNames(training.staff),
        players_snapshot: players,
        attendance: normalizeAttendance(training.attendance),
        plan_blocks: normalizePlanBlocks(training.plan?.blocks ?? []),
        evaluation: normalizeEvaluation(training.evaluation, duration) ?? null,
    };
}

export async function getClubTrainings(clubId: string): Promise<TrainingEntry[]> {
    if (!clubId) {
        return [];
    }

    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('club_trainings')
        .select(SELECT_COLUMNS)
        .eq('club_id', clubId)
        .order('scheduled_at', { ascending: true });

    if (error) {
        throw error;
    }

    return ((data ?? []) as ClubTrainingRow[]).map(mapRowToTrainingEntry);
}

async function findPersistedTrainingIdBySourceKey(
    admin: any,
    clubId: string,
    sourceKey: string,
): Promise<string | null> {
    const { data, error } = await admin
        .from('club_trainings')
        .select('id')
        .eq('club_id', clubId)
        .eq('source_key', sourceKey)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return typeof data?.id === 'string' ? data.id : null;
}

export async function saveClubTraining(clubId: string, training: TrainingEntry): Promise<TrainingEntry> {
    if (!clubId) {
        throw new Error('clubId required');
    }

    const payload = mapTrainingToRow(clubId, training);
    const admin = createAdminClient() as any;

    let query: any;
    if (training.persistedId) {
        query = admin
            .from('club_trainings')
            .update(payload)
            .eq('id', training.persistedId)
            .eq('club_id', clubId);
    } else if (payload.source_key) {
        const persistedId = await findPersistedTrainingIdBySourceKey(admin, clubId, payload.source_key);
        query = persistedId
            ? admin
                .from('club_trainings')
                .update(payload)
                .eq('id', persistedId)
                .eq('club_id', clubId)
            : admin
                .from('club_trainings')
                .insert(payload);
    } else {
        query = admin
            .from('club_trainings')
            .insert(payload);
    }

    const { data, error } = await query
        .select(SELECT_COLUMNS)
        .single();

    if (error) {
        throw error;
    }

    return mapRowToTrainingEntry(data as ClubTrainingRow);
}

export async function deleteClubTraining(clubId: string, training: TrainingEntry): Promise<void> {
    if (!clubId) {
        throw new Error('clubId required');
    }

    const admin = createAdminClient() as any;

    if (training.sourceKey) {
        const payload = {
            ...mapTrainingToRow(clubId, training),
            source_kind: 'hidden',
        };

        const persistedId = training.persistedId
            || await findPersistedTrainingIdBySourceKey(admin, clubId, training.sourceKey);
        const { error } = persistedId
            ? await admin
                .from('club_trainings')
                .update(payload)
                .eq('id', persistedId)
                .eq('club_id', clubId)
            : await admin
                .from('club_trainings')
                .insert(payload);

        if (error) {
            throw error;
        }

        return;
    }

    if (training.persistedId) {
        const { error } = await admin
            .from('club_trainings')
            .delete()
            .eq('id', training.persistedId)
            .eq('club_id', clubId);

        if (error) {
            throw error;
        }
    }
}
