/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@/lib/supabase/server';
import {
    getTournamentRelationDirectionLabel,
    getTournamentRelationStatusLabel,
    getTournamentRelationTypeLabel,
} from '@/lib/tournamentRelations';

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>;

export type TournamentInternalRelationKind = 'matches' | 'phases' | 'groups' | 'rounds' | 'participants';

export interface TournamentInternalRelationItem {
    id: string;
    title: string;
    subtitle?: string;
    meta?: string;
    href: string;
}

export interface TournamentInternalRelationGroup {
    id: TournamentInternalRelationKind;
    label: string;
    count: number;
    emptyText: string;
    items: TournamentInternalRelationItem[];
}

export interface TournamentLinkedRelationItem {
    id: string;
    linkedTournamentId: string;
    linkedTournamentName: string;
    season: string | null;
    sport: string | null;
    relationType: string;
    relationTypeLabel: string;
    relationDirection: string | null;
    relationDirectionLabel: string;
    relationStatus: string;
    relationStatusLabel: string;
    relationSide: 'source' | 'target';
    relationSideLabel: string;
    description: string | null;
    href: string;
}

export interface TournamentLinkedRelationsResult {
    available: boolean;
    items: TournamentLinkedRelationItem[];
    notes: string[];
}

export interface TournamentRelatedTabData {
    internalGroups: TournamentInternalRelationGroup[];
    linked: TournamentLinkedRelationsResult;
    notes: string[];
}

const INTERNAL_LIMIT = 6;

function formatDateTime(value: string | null | undefined) {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function isMissingTableError(error: any, tableName: string) {
    if (!error) return false;
    return error.code === '42P01' || String(error.message || '').toLowerCase().includes(tableName.toLowerCase());
}

function relationSideLabel(side: 'source' | 'target') {
    return side === 'source' ? 'Origen actual' : 'Destino actual';
}

async function fetchTournamentLinkedRelationsWithClient(
    supabase: SupabaseClientLike,
    tournamentId: string
): Promise<TournamentLinkedRelationsResult> {
    const { data: relationRows, error } = await (supabase as any)
        .from('tournament_relations')
        .select('id, source_tournament_id, target_tournament_id, relation_type, relation_direction, description, status')
        .or(`source_tournament_id.eq.${tournamentId},target_tournament_id.eq.${tournamentId}`)
        .order('created_at', { ascending: false });

    if (error) {
        if (isMissingTableError(error, 'tournament_relations')) {
            return {
                available: false,
                items: [],
                notes: ['La tabla tournament_relations todavia no existe en el esquema activo. Se dejo el tab preparado y la migracion incluida.'],
            };
        }

        return {
            available: false,
            items: [],
            notes: [`No se pudieron cargar los torneos vinculados: ${error.message}`],
        };
    }

    const rows = Array.isArray(relationRows) ? relationRows : [];
    if (rows.length === 0) {
        return { available: true, items: [], notes: [] };
    }

    const linkedIds = Array.from(new Set(
        rows
            .map((row: any) => row.source_tournament_id === tournamentId ? row.target_tournament_id : row.source_tournament_id)
            .filter(Boolean)
    ));

    const { data: tournamentsData, error: tournamentsError } = await supabase
        .from('tournaments')
        .select('id, name, display_name, sport_id, season_id, status')
        .in('id', linkedIds);

    if (tournamentsError) {
        return {
            available: true,
            items: [],
            notes: [`Se encontraron vinculos pero fallo la resolucion de torneos relacionados: ${tournamentsError.message}`],
        };
    }

    type LinkedTournamentLookup = {
        id: string;
        name: string;
        season: string | null;
        sport: string | null;
        status: string | null;
    };

    const tournamentMap = new Map<string, LinkedTournamentLookup>(
        (tournamentsData ?? []).map((row: any): [string, LinkedTournamentLookup] => [
            row.id,
            {
                id: row.id as string,
                name: (row.display_name || row.name) as string,
                season: row.season_id ? String(row.season_id) : null,
                sport: row.sport_id ? String(row.sport_id) : null,
                status: row.status ? String(row.status) : null,
            },
        ])
    );

    const items = rows.flatMap((row: any) => {
        const relationSide = row.source_tournament_id === tournamentId ? 'source' : 'target';
        const linkedTournamentId = relationSide === 'source' ? row.target_tournament_id : row.source_tournament_id;
        const linkedTournament = tournamentMap.get(linkedTournamentId);

        if (!linkedTournament) return [];

        return [{
            id: row.id as string,
            linkedTournamentId,
            linkedTournamentName: linkedTournament.name,
            season: linkedTournament.season,
            sport: linkedTournament.sport,
            relationType: row.relation_type as string,
            relationTypeLabel: getTournamentRelationTypeLabel(row.relation_type),
            relationDirection: row.relation_direction ? String(row.relation_direction) : null,
            relationDirectionLabel: getTournamentRelationDirectionLabel(row.relation_direction),
            relationStatus: row.status ? String(row.status) : 'active',
            relationStatusLabel: getTournamentRelationStatusLabel(row.status),
            relationSide,
            relationSideLabel: relationSideLabel(relationSide),
            description: row.description ? String(row.description) : null,
            href: `/admin/entities/${linkedTournamentId}/manage?type=tournament&from=tournament:${tournamentId}`,
        }] satisfies TournamentLinkedRelationItem[];
    });

    return { available: true, items, notes: [] };
}

export async function getTournamentLinkedRelations(
    tournamentId: string
): Promise<TournamentLinkedRelationsResult> {
    const supabase = await createClient();
    return fetchTournamentLinkedRelationsWithClient(supabase, tournamentId);
}

export async function getTournamentRelatedTabData(
    tournamentId: string
): Promise<TournamentRelatedTabData> {
    const supabase = await createClient();
    const notes: string[] = [];

    const matchesPromise = supabase
        .from('matches')
        .select(`
            id,
            date_time,
            status,
            home:clubs!matches_home_club_id_fkey(name),
            away:clubs!matches_away_club_id_fkey(name)
        `, { count: 'exact' })
        .eq('tournament_id', tournamentId)
        .order('date_time', { ascending: false })
        .limit(INTERNAL_LIMIT);

    const phasesPromise = supabase
        .from('tournament_phases')
        .select('id, name, phase_type, order_index, is_active')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true });

    // No `count: 'exact'` here: this query has no `.limit()`, so it already
    // returns every participant row. The downstream badge uses
    // `participantsRes.count ?? participants.length`, so `participants.length`
    // yields the identical number without making Postgres compute a redundant
    // COUNT(*) over the result set.
    const participantsPromise = (supabase as any)
        .from('tournament_participants')
        .select(`
            id,
            name,
            status,
            seed,
            club_id,
            clubs:club_id(id, name, short_name)
        `)
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false });

    const linkedPromise = fetchTournamentLinkedRelationsWithClient(supabase, tournamentId);

    const [matchesRes, phasesRes, participantsRes, linked] = await Promise.all([
        matchesPromise,
        phasesPromise,
        participantsPromise,
        linkedPromise,
    ]);

    const phases = phasesRes.data ?? [];
    if (phasesRes.error && !isMissingTableError(phasesRes.error, 'tournament_phases')) {
        notes.push(`No se pudieron cargar las fases: ${phasesRes.error.message}`);
    }

    const phaseIds = phases.map((phase: any) => phase.id);
    const phaseNameById = new Map(phases.map((phase: any) => [phase.id, phase.name]));

    let groups: any[] = [];
    let rounds: any[] = [];

    if (phaseIds.length > 0) {
        const [groupsRes, roundsRes] = await Promise.all([
            (supabase as any)
                .from('tournament_groups')
                .select('id, phase_id, name, order_index')
                .in('phase_id', phaseIds)
                .order('order_index', { ascending: true }),
            (supabase as any)
                .from('tournament_rounds')
                .select('id, phase_id, name, order_index, is_completed')
                .in('phase_id', phaseIds)
                .order('order_index', { ascending: true }),
        ]);

        if (groupsRes.error && !isMissingTableError(groupsRes.error, 'tournament_groups')) {
            notes.push(`No se pudieron cargar los grupos: ${groupsRes.error.message}`);
        } else {
            groups = groupsRes.data ?? [];
        }

        if (roundsRes.error && !isMissingTableError(roundsRes.error, 'tournament_rounds')) {
            notes.push(`No se pudieron cargar las rondas: ${roundsRes.error.message}`);
        } else {
            rounds = roundsRes.data ?? [];
        }
    }

    const matches = matchesRes.data ?? [];
    const participants = participantsRes.data ?? [];

    const internalGroups: TournamentInternalRelationGroup[] = [
        {
            id: 'matches',
            label: 'Partidos',
            count: matchesRes.count ?? matches.length,
            emptyText: 'Este torneo todavia no tiene partidos vinculados para mostrar.',
            items: matches.map((match: any) => ({
                id: match.id,
                title: `${match.home?.name ?? 'Local'} vs ${match.away?.name ?? 'Visitante'}`,
                subtitle: formatDateTime(match.date_time),
                meta: match.status ? String(match.status) : 'Pendiente',
                href: `/admin/super/partidos/${match.id}`,
            })),
        },
        {
            id: 'phases',
            label: 'Fases',
            count: phases.length,
            emptyText: 'Este torneo todavia no tiene fases cargadas.',
            items: phases.slice(0, INTERNAL_LIMIT).map((phase: any) => ({
                id: phase.id,
                title: phase.name,
                subtitle: phase.phase_type ?? 'fase',
                meta: phase.is_active ? 'Activa' : 'Inactiva',
                href: `/admin/entities/${tournamentId}/manage?type=tournament&tab=estructura`,
            })),
        },
        {
            id: 'groups',
            label: 'Grupos / Zonas',
            count: groups.length,
            emptyText: 'Este torneo todavia no tiene grupos o zonas vinculadas para mostrar.',
            items: groups.slice(0, INTERNAL_LIMIT).map((group: any) => ({
                id: group.id,
                title: group.name,
                subtitle: phaseNameById.get(group.phase_id) ? `Fase: ${phaseNameById.get(group.phase_id)}` : undefined,
                meta: 'Zona',
                href: `/admin/entities/${tournamentId}/manage?type=tournament&tab=estructura`,
            })),
        },
        {
            id: 'rounds',
            label: 'Fechas / Rondas',
            count: rounds.length,
            emptyText: 'Este torneo todavia no tiene fechas o rondas cargadas.',
            items: rounds.slice(0, INTERNAL_LIMIT).map((round: any) => ({
                id: round.id,
                title: round.name,
                subtitle: phaseNameById.get(round.phase_id) ? `Fase: ${phaseNameById.get(round.phase_id)}` : 'Sin fase',
                meta: round.is_completed ? 'Completa' : 'Pendiente',
                href: `/admin/entities/${tournamentId}/manage?type=tournament&tab=operacion`,
            })),
        },
        {
            id: 'participants',
            label: 'Participantes',
            count: participantsRes.count ?? participants.length,
            emptyText: 'Este torneo todavia no tiene participantes vinculados para mostrar.',
            items: participants.slice(0, INTERNAL_LIMIT).map((participant: any) => {
                const label = participant.clubs?.name || participant.name || 'Participante';
                const clubId = participant.clubs?.id || participant.club_id;

                return {
                    id: participant.id,
                    title: label,
                    subtitle: participant.seed ? `Seed ${participant.seed}` : 'Participante',
                    meta: participant.status ?? 'active',
                    href: clubId
                        ? `/admin/entities/${clubId}/manage?type=club&from=tournament:${tournamentId}`
                        : `/admin/entities/${tournamentId}/manage?type=tournament&tab=participantes`,
                };
            }),
        },
    ];

    if (participantsRes.error && !isMissingTableError(participantsRes.error, 'tournament_participants')) {
        notes.push(`No se pudieron cargar los participantes: ${participantsRes.error.message}`);
    }

    if (matchesRes.error) {
        notes.push(`No se pudieron cargar los partidos: ${matchesRes.error.message}`);
    }

    return {
        internalGroups,
        linked,
        notes: [...notes, ...linked.notes],
    };
}
