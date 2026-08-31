export type RankingTableClub = {
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
} | null | undefined;

export type RankingTableEntryLike = {
    current_position?: number | null;
    current_rating?: number | string | null;
    initial_rating?: number | string | null;
    previous_rating?: number | string | null;
    source_name: string;
    source_region?: string | null;
    source_previous_position?: number | null;
    clubs?: RankingTableClub;
};

export const RANKING_POSITION_LABEL_TONES = ['info', 'success', 'warning', 'danger', 'neutral'] as const;

export type RankingPositionLabelTone = typeof RANKING_POSITION_LABEL_TONES[number];

const RANKING_POSITION_LABEL_TONE_COLORS: Record<RankingPositionLabelTone, string> = {
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    neutral: '#71717a',
};

export type RankingPositionLabel = {
    position: number;
    label: string;
    tone: RankingPositionLabelTone;
    color: string;
};

function isRankingPositionLabelTone(value: unknown): value is RankingPositionLabelTone {
    return RANKING_POSITION_LABEL_TONES.includes(value as RankingPositionLabelTone);
}

function normalizeHexColor(value: string) {
    const text = value.trim();
    const shortHexMatch = text.match(/^#([0-9a-f]{3})$/i);
    if (shortHexMatch) {
        return `#${shortHexMatch[1].split('').map((char) => `${char}${char}`).join('')}`.toLowerCase();
    }

    if (/^#[0-9a-f]{6}$/i.test(text)) {
        return text.toLowerCase();
    }

    return null;
}

function normalizeRgbColor(value: string) {
    const match = value.trim().match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (!match) return null;

    const channels = match.slice(1).map((channel) => Number(channel));
    if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
        return null;
    }

    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeRankingPositionLabelColor(value: unknown, tone: RankingPositionLabelTone = 'info') {
    const text = String(value ?? '').trim();
    return normalizeHexColor(text) ?? normalizeRgbColor(text) ?? RANKING_POSITION_LABEL_TONE_COLORS[tone];
}

export function normalizeRankingPositionLabels(value: unknown): RankingPositionLabel[] {
    if (!Array.isArray(value)) return [];

    const labelMap = new Map<number, RankingPositionLabel>();

    value.forEach((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;

        const source = item as Record<string, unknown>;
        const position = Number(source.position);
        const label = String(source.label ?? '').trim();
        const tone = isRankingPositionLabelTone(source.tone) ? source.tone : 'info';
        const color = normalizeRankingPositionLabelColor(source.color, tone);

        if (!Number.isInteger(position) || position < 1 || !label) return;

        labelMap.set(position, {
            position,
            label: label.slice(0, 40),
            tone,
            color,
        });
    });

    return Array.from(labelMap.values()).sort((left, right) => left.position - right.position);
}

export function getRankingPositionLabel(
    labels: RankingPositionLabel[],
    position: number | null | undefined,
) {
    const numericPosition = Number(position);
    if (!Number.isInteger(numericPosition) || numericPosition < 1) return null;
    return labels.find((label) => label.position === numericPosition) ?? null;
}

export function formatRankingRating(value: number | string | null | undefined) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return numeric.toFixed(2);
}

export function getRankingDelta(
    current: number | string | null | undefined,
    initial: number | string | null | undefined,
) {
    const currentValue = Number(current);
    const initialValue = Number(initial);

    if (!Number.isFinite(currentValue) || !Number.isFinite(initialValue)) {
        return {
            value: 0,
            label: '-',
            tone: 'neutral' as const,
        };
    }

    const delta = Number((currentValue - initialValue).toFixed(2));

    if (delta > 0) {
        return { value: delta, label: `+${delta.toFixed(2)}`, tone: 'positive' as const };
    }

    if (delta < 0) {
        return { value: delta, label: delta.toFixed(2), tone: 'negative' as const };
    }

    return { value: delta, label: '0.00', tone: 'neutral' as const };
}

export function getRankingClubName(entry: RankingTableEntryLike) {
    return entry.clubs?.name || entry.source_name;
}

export function getRankingClubShortName(entry: RankingTableEntryLike) {
    return entry.clubs?.short_name || entry.clubs?.name || entry.source_name;
}

export function getRankingPreviousRating(entry: RankingTableEntryLike) {
    const previousValue = Number(entry.previous_rating);
    if (Number.isFinite(previousValue)) return previousValue;

    const initialValue = Number(entry.initial_rating);
    if (Number.isFinite(initialValue)) return initialValue;

    return null;
}

export function getRankingPositionChange(
    current: number | null | undefined,
    previous: number | null | undefined,
) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
        return null;
    }

    const delta = Number(previous) - Number(current);

    if (delta > 0) {
        return { value: delta, label: `+${delta}`, tone: 'positive' as const };
    }

    if (delta < 0) {
        return { value: delta, label: String(delta), tone: 'negative' as const };
    }

    return { value: delta, label: '0', tone: 'neutral' as const };
}

export function paginateRankingEntries<T>(entries: T[], page: number, pageSize: number) {
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;

    return {
        page: safePage,
        totalPages,
        pageSize,
        start,
        items: entries.slice(start, start + pageSize),
    };
}

function formatRankingExportLegendPosition(position: number) {
    return `#${String(position).padStart(2, '0')}`;
}

function buildRankingExportLegendLabels(labels: RankingPositionLabel[]) {
    const groups: Array<{ color: string; end: number; label: string; start: number }> = [];

    normalizeRankingPositionLabels(labels).forEach((item) => {
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

    const labelMap = new Map<number, string>();
    groups.forEach((group) => {
        const rangeLabel = group.start === group.end
            ? formatRankingExportLegendPosition(group.start)
            : `${formatRankingExportLegendPosition(group.start)}-${formatRankingExportLegendPosition(group.end)}`;

        for (let position = group.start; position <= group.end; position += 1) {
            labelMap.set(position, `${rangeLabel} ${group.label}`);
        }
    });

    return labelMap;
}

/**
 * Los tres colores del subrayado por movimiento del ranking de World Rugby.
 * Viven aca y no en la pantalla porque los usan DOS dibujos: la tabla en HTML y
 * el afiche en canvas. Duplicarlos era garantizar que un dia dejaran de ser el
 * mismo verde.
 */
export const RANKING_MOVEMENT_COLORS = {
    oro: '#e8b23a',
    sube: '#2fbf71',
    baja: '#e5484d',
} as const;

export type RankingMovementTone = keyof typeof RANKING_MOVEMENT_COLORS;

export type RankingMovementHighlight = {
    tone: RankingMovementTone;
    /** 0 a 1: cuanto tinte lleva la fila. */
    strength: number;
    color: string;
};

/**
 * Oro para el lider, verde para el que subio, rojo para el que bajo.
 *
 * SOLO se usa en el ranking de selecciones. En el de clubes la fila ya se pinta
 * por zona (ascenso, descenso, clasificacion) y dos sistemas de color sobre la
 * misma fila no se leen: se contradicen.
 *
 * La intensidad la da el tamanio del salto y no el puesto: en una tabla de 114
 * uniones, mover un lugar es ruido y mover cinco es noticia. Corta en cinco
 * porque arriba de eso el color satura igual y una union que aparece de la nada
 * apagaria a todas las demas.
 */
export function getRankingMovementHighlight(
    position: number | null | undefined,
    previousPosition: number | null | undefined,
): RankingMovementHighlight | null {
    if (!position) return null;

    // El lider va en oro lleve una semana o tres anios: lo que se destaca ahi es
    // el puesto, no el movimiento.
    if (position === 1) {
        return { tone: 'oro', strength: 1, color: RANKING_MOVEMENT_COLORS.oro };
    }

    if (!previousPosition) return null;

    const salto = previousPosition - position;
    if (salto === 0) return null;

    const tone: RankingMovementTone = salto > 0 ? 'sube' : 'baja';

    return {
        tone,
        strength: Math.min(Math.abs(salto), 5) / 5,
        color: RANKING_MOVEMENT_COLORS[tone],
    };
}

export type RankingExportOptions = {
    /**
     * Marcar cada fila con el color de su movimiento. Lo prende SOLO el ranking
     * de World Rugby; en el de clubes el color de la fila ya lo pone la zona.
     */
    movementHighlight?: boolean;
};

export function buildRankingExportRows(
    entries: RankingTableEntryLike[],
    positionLabels: RankingPositionLabel[] = [],
    options: RankingExportOptions = {},
) {
    const exportLegendLabels = buildRankingExportLegendLabels(positionLabels);

    return entries.map((entry, index) => {
        const previousRating = getRankingPreviousRating(entry);
        const delta = getRankingDelta(entry.current_rating, previousRating);
        const positionChange = getRankingPositionChange(entry.current_position, entry.source_previous_position);
        const position = entry.current_position || index + 1;
        const positionLabel = getRankingPositionLabel(positionLabels, position);

        return {
            pos: position,
            team: getRankingClubShortName(entry),
            teamLogo: entry.clubs?.logo_url || '',
            labelName: positionLabel ? exportLegendLabels.get(position) || positionLabel.label : undefined,
            zoneColor: positionLabel?.color,
            played: formatRankingRating(entry.current_rating),
            won: formatRankingRating(previousRating),
            lost: delta.label,
            diff: entry.source_region || '-',
            points: entry.source_previous_position ?? '-',
            pointsDeltaLabel: positionChange?.label || '',

            // Sin cambio de puesto, `getRankingPositionChange` devuelve null y el
            // export no dibuja ficha de variacion.
            pointsDeltaTone: positionChange?.tone ?? ('neutral' as const),
            // El afiche pinta la fila con este color. Va vacio salvo en World
            // Rugby: en el ranking de clubes manda `zoneColor`, que es la zona.
            ...(options.movementHighlight && !positionLabel
                ? (() => {
                    const movement = getRankingMovementHighlight(position, entry.source_previous_position);
                    return movement
                        ? { movementColor: movement.color, movementStrength: movement.strength }
                        : {};
                })()
                : {}),
        };
    });
}

export const RANKING_EXPORT_COLUMN_LABELS = {
    played: 'OVR',
    won: 'ANT',
    lost: 'DEL',
    diff: 'TR',
    points: 'VAR',
} as const;

/**
 * Las mismas columnas para el afiche del ranking de World Rugby. Cambian dos:
 * ahi no hay OVR sino los puntos que publica World Rugby, y la procedencia es
 * el continente de la union, no la region de un club.
 */
export const WORLD_RUGBY_EXPORT_COLUMN_LABELS = {
    ...RANKING_EXPORT_COLUMN_LABELS,
    played: 'PTS',
    diff: 'CONT',
} as const;
