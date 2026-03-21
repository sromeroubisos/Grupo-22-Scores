export const TOURNAMENT_RELATION_TYPE_LABELS = {
    previous_season: 'Temporada anterior',
    next_season: 'Temporada siguiente',
    international_tournament: 'Torneo internacional',
    promotion_relegation: 'Ascenso / Descenso',
    qualification: 'Clasificacion',
    previous_stage: 'Etapa previa',
    next_stage: 'Etapa siguiente',
    feeder_tournament: 'Torneo alimentador',
    parent_competition: 'Competencia superior',
    child_competition: 'Competencia derivada',
    parallel_competition: 'Competencia paralela',
    regional_pathway: 'Camino regional',
} as const;

export type TournamentRelationType = keyof typeof TOURNAMENT_RELATION_TYPE_LABELS;

export const TOURNAMENT_RELATION_DIRECTION_LABELS = {
    upward: 'Ascendente',
    downward: 'Descendente',
    bidirectional: 'Bidireccional',
    outgoing: 'Saliente',
    incoming: 'Entrante',
    reference: 'Referencia',
} as const;

export type TournamentRelationDirection = keyof typeof TOURNAMENT_RELATION_DIRECTION_LABELS;

export const TOURNAMENT_RELATION_STATUS_LABELS = {
    active: 'Activo',
    inactive: 'Inactivo',
    draft: 'Borrador',
    archived: 'Archivado',
} as const;

export type TournamentRelationStatus = keyof typeof TOURNAMENT_RELATION_STATUS_LABELS;

export const TOURNAMENT_RELATION_TYPE_OPTIONS = Object.entries(TOURNAMENT_RELATION_TYPE_LABELS).map(([value, label]) => ({
    value: value as TournamentRelationType,
    label,
}));

export const TOURNAMENT_RELATION_DIRECTION_OPTIONS = Object.entries(TOURNAMENT_RELATION_DIRECTION_LABELS).map(([value, label]) => ({
    value: value as TournamentRelationDirection,
    label,
}));

export const TOURNAMENT_RELATION_STATUS_OPTIONS = Object.entries(TOURNAMENT_RELATION_STATUS_LABELS).map(([value, label]) => ({
    value: value as TournamentRelationStatus,
    label,
}));

export function getTournamentRelationTypeLabel(value: string | null | undefined) {
    if (!value) return 'Relacion';
    return TOURNAMENT_RELATION_TYPE_LABELS[value as TournamentRelationType] ?? value;
}

export function getTournamentRelationDirectionLabel(value: string | null | undefined) {
    if (!value) return 'Sin direccion';
    return TOURNAMENT_RELATION_DIRECTION_LABELS[value as TournamentRelationDirection] ?? value;
}

export function getTournamentRelationStatusLabel(value: string | null | undefined) {
    if (!value) return 'Activo';
    return TOURNAMENT_RELATION_STATUS_LABELS[value as TournamentRelationStatus] ?? value;
}

export function getTournamentRelationDirectionBadgeClass(value: string | null | undefined) {
    switch (value) {
        case 'outgoing':
            return 'bg-cyan-500/12 text-cyan-100 border-cyan-400/20';
        case 'incoming':
            return 'bg-indigo-500/12 text-indigo-100 border-indigo-400/20';
        case 'bidirectional':
            return 'bg-violet-500/12 text-violet-100 border-violet-400/20';
        case 'upward':
            return 'bg-emerald-500/12 text-emerald-100 border-emerald-400/20';
        case 'downward':
            return 'bg-amber-500/12 text-amber-100 border-amber-400/20';
        case 'reference':
            return 'bg-slate-500/12 text-slate-100 border-slate-400/20';
        default:
            return 'bg-white/5 text-white/75 border-white/10';
    }
}

export function getTournamentRelationStatusBadgeClass(value: string | null | undefined) {
    switch (value) {
        case 'active':
            return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20';
        case 'inactive':
            return 'bg-zinc-500/15 text-zinc-200 border-zinc-400/20';
        case 'draft':
            return 'bg-amber-500/15 text-amber-200 border-amber-400/20';
        case 'archived':
            return 'bg-rose-500/15 text-rose-200 border-rose-400/20';
        default:
            return 'bg-white/5 text-white/80 border-white/10';
    }
}

export function getTournamentRelationTypeBadgeClass(value: string | null | undefined) {
    switch (value) {
        case 'international_tournament':
            return 'bg-sky-500/15 text-sky-200 border-sky-400/20';
        case 'previous_season':
        case 'next_season':
            return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20';
        case 'promotion_relegation':
            return 'bg-amber-500/15 text-amber-200 border-amber-400/20';
        case 'qualification':
            return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20';
        case 'previous_stage':
        case 'next_stage':
            return 'bg-violet-500/15 text-violet-200 border-violet-400/20';
        case 'parent_competition':
        case 'child_competition':
            return 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20';
        case 'parallel_competition':
            return 'bg-cyan-500/15 text-cyan-200 border-cyan-400/20';
        case 'regional_pathway':
            return 'bg-rose-500/15 text-rose-200 border-rose-400/20';
        default:
            return 'bg-white/5 text-white/80 border-white/10';
    }
}
