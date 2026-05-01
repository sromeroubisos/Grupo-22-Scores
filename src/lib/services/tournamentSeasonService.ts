type DbClient = any;

export type TournamentSeasonStatus = 'draft' | 'active' | 'completed' | 'archived';

export type CreateTournamentSeasonInput = {
    seasonCode: string;
    name?: string | null;
    displayName?: string | null;
    status?: TournamentSeasonStatus | string | null;
    startDate?: string | null;
    endDate?: string | null;
    format?: string | null;
    ruleset?: Record<string, unknown> | null;
    settings?: Record<string, unknown> | null;
};

export type CopyTournamentSeasonInput = CreateTournamentSeasonInput & {
    sourceSeasonId: string;
    copyConfiguration?: boolean;
    copyEntries?: boolean;
    copyRosters?: boolean;
    copyRosterMemberships?: boolean;
};

export type CreateSeasonEntryInput = {
    clubId: string;
    teamId?: string | null;
    groupId?: string | null;
    zone?: string | null;
    category?: string | null;
    status?: string | null;
    seed?: number | null;
    notes?: string | null;
    settings?: Record<string, unknown> | null;
    createRoster?: boolean;
};

export type CreateSeasonRosterInput = {
    clubId: string;
    teamId?: string | null;
    teamSeasonEntryId?: string | null;
    name?: string | null;
    rosterType?: string | null;
    status?: string | null;
    settings?: Record<string, unknown> | null;
};

export type AddPlayerToRosterInput = {
    playerId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    joinedAt?: string | null;
    leftAt?: string | null;
    status?: string | null;
    jerseyNumber?: number | null;
    position?: string | null;
    role?: string | null;
    notes?: string | null;
    eligibility?: Record<string, unknown> | null;
};

const VALID_SEASON_STATUSES = new Set<TournamentSeasonStatus>(['draft', 'active', 'completed', 'archived']);
const LOCKED_SEASON_STATUSES = new Set<TournamentSeasonStatus>(['completed', 'archived']);
const DUPLICATE_ERROR_CODES = new Set(['23505']);

function cleanText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeSeasonStatus(value: unknown): TournamentSeasonStatus {
    const raw = cleanText(value)?.toLowerCase();
    return VALID_SEASON_STATUSES.has(raw as TournamentSeasonStatus) ? raw as TournamentSeasonStatus : 'draft';
}

function normalizeMembershipStatus(value: unknown) {
    const raw = cleanText(value)?.toLowerCase();
    const allowed = new Set(['active', 'inactive', 'transferred', 'released', 'suspended', 'guest', 'historical', 'injured']);
    return raw && allowed.has(raw) ? raw : 'active';
}

function isDuplicateError(error: unknown) {
    return Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && DUPLICATE_ERROR_CODES.has(String((error as { code?: unknown }).code)),
    );
}

function asDateOnly(value: string | null | undefined) {
    const text = cleanText(value);
    return text ? text.slice(0, 10) : null;
}

async function fetchTournament(db: DbClient, tournamentId: string) {
    const { data, error } = await db
        .from('tournaments')
        .select('id, name, display_name, season_id, format, ruleset, current_season_id')
        .eq('id', tournamentId)
        .maybeSingle();

    if (error) throw new Error(error.message || 'No se pudo cargar el torneo.');
    if (!data) throw new Error('Torneo no encontrado.');
    return data;
}

async function fetchSeason(db: DbClient, seasonId: string) {
    const { data, error } = await db
        .from('tournament_seasons')
        .select('*')
        .eq('id', seasonId)
        .maybeSingle();

    if (error) throw new Error(error.message || 'No se pudo cargar la temporada.');
    if (!data) throw new Error('Temporada no encontrada.');
    return data;
}

async function assertEditableSeason(db: DbClient, seasonId: string) {
    const season = await fetchSeason(db, seasonId);
    if (LOCKED_SEASON_STATUSES.has(season.status)) {
        throw new Error('La temporada esta finalizada o archivada y no se puede editar sin reabrirla.');
    }
    return season;
}

async function setTournamentCurrentSeason(db: DbClient, tournamentId: string, seasonId: string | null) {
    const { error } = await db
        .from('tournaments')
        .update({ current_season_id: seasonId })
        .eq('id', tournamentId);
    if (error) throw new Error(error.message || 'No se pudo actualizar la temporada actual del torneo.');
}

async function makeSeasonActiveIfNeeded(db: DbClient, tournamentId: string, seasonId: string, status: TournamentSeasonStatus) {
    if (status !== 'active') return;

    const { error: clearError } = await db
        .from('tournament_seasons')
        .update({ is_active: false })
        .eq('tournament_id', tournamentId)
        .neq('id', seasonId);
    if (clearError) throw new Error(clearError.message || 'No se pudo desactivar la temporada anterior.');

    const { error: activateError } = await db
        .from('tournament_seasons')
        .update({ is_active: true, status: 'active' })
        .eq('id', seasonId);
    if (activateError) throw new Error(activateError.message || 'No se pudo activar la temporada.');

    await setTournamentCurrentSeason(db, tournamentId, seasonId);
}

export async function listTournamentSeasons(db: DbClient, tournamentId: string) {
    const { data: seasons, error } = await db
        .from('tournament_seasons')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('season_code', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message || 'No se pudieron cargar las temporadas.');

    const seasonRows = seasons ?? [];
    const seasonIds = seasonRows.map((season: any) => season.id).filter(Boolean);
    if (seasonIds.length === 0) return [];

    const [{ data: entries }, { data: rosters }] = await Promise.all([
        db.from('team_season_entries').select('season_id').in('season_id', seasonIds),
        db.from('season_rosters').select('season_id').in('season_id', seasonIds),
    ]);

    const entryCounts = new Map<string, number>();
    const rosterCounts = new Map<string, number>();
    for (const entry of entries ?? []) {
        entryCounts.set(entry.season_id, (entryCounts.get(entry.season_id) ?? 0) + 1);
    }
    for (const roster of rosters ?? []) {
        rosterCounts.set(roster.season_id, (rosterCounts.get(roster.season_id) ?? 0) + 1);
    }

    return seasonRows.map((season: any) => ({
        ...season,
        entries_count: entryCounts.get(season.id) ?? 0,
        rosters_count: rosterCounts.get(season.id) ?? 0,
    }));
}

export async function createTournamentSeason(
    db: DbClient,
    tournamentId: string,
    input: CreateTournamentSeasonInput,
    actorUserId?: string | null,
) {
    const tournament = await fetchTournament(db, tournamentId);
    const seasonCode = cleanText(input.seasonCode);
    if (!seasonCode) throw new Error('seasonCode es requerido.');

    const status = normalizeSeasonStatus(input.status);
    const displayName = cleanText(input.displayName) || cleanText(input.name) || `${tournament.display_name || tournament.name} ${seasonCode}`;
    const name = cleanText(input.name) || displayName;

    if (status === 'active') {
        await db
            .from('tournament_seasons')
            .update({ is_active: false })
            .eq('tournament_id', tournamentId);
    }

    const payload = {
        tournament_id: tournamentId,
        legacy_tournament_id: tournamentId,
        season_code: seasonCode,
        name,
        display_name: displayName,
        status,
        is_active: status === 'active',
        start_date: asDateOnly(input.startDate),
        end_date: asDateOnly(input.endDate),
        format: cleanText(input.format) ?? tournament.format ?? null,
        ruleset: input.ruleset ?? tournament.ruleset ?? {},
        settings: input.settings ?? {},
        created_by_user_id: actorUserId ?? null,
    };

    const { data, error } = await db
        .from('tournament_seasons')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        if (isDuplicateError(error)) {
            throw new Error('Ya existe una temporada con ese codigo para este torneo.');
        }
        throw new Error(error.message || 'No se pudo crear la temporada.');
    }

    await makeSeasonActiveIfNeeded(db, tournamentId, data.id, status);
    if (!tournament.current_season_id && status !== 'active') {
        await setTournamentCurrentSeason(db, tournamentId, data.id);
    }

    return data;
}

export async function copyTournamentSeason(
    db: DbClient,
    tournamentId: string,
    input: CopyTournamentSeasonInput,
    actorUserId?: string | null,
) {
    const source = await fetchSeason(db, input.sourceSeasonId);
    if (source.tournament_id !== tournamentId) {
        throw new Error('La temporada base no pertenece al torneo seleccionado.');
    }

    const copyConfiguration = input.copyConfiguration !== false;
    const copyEntries = input.copyEntries !== false;
    const copyRosters = input.copyRosters === true || input.copyRosterMemberships === true;
    const copyRosterMemberships = input.copyRosterMemberships === true;

    const season = await createTournamentSeason(db, tournamentId, {
        ...input,
        status: input.status ?? 'draft',
        format: copyConfiguration ? source.format : input.format,
        ruleset: copyConfiguration ? source.ruleset : input.ruleset,
        settings: {
            ...(copyConfiguration ? source.settings ?? {} : input.settings ?? {}),
            copied_from_season_id: source.id,
            copied_at: new Date().toISOString(),
        },
    }, actorUserId);

    const { error: sourceUpdateError } = await db
        .from('tournament_seasons')
        .update({ copied_from_season_id: source.id })
        .eq('id', season.id);
    if (sourceUpdateError) throw new Error(sourceUpdateError.message || 'No se pudo registrar el origen de copia.');

    const entryIdBySourceId = new Map<string, string>();

    if (copyEntries) {
        const { data: sourceEntries, error: entriesError } = await db
            .from('team_season_entries')
            .select('*')
            .eq('season_id', source.id)
            .order('seed', { ascending: true, nullsFirst: false });
        if (entriesError) throw new Error(entriesError.message || 'No se pudieron cargar los participantes base.');

        const entryRows = (sourceEntries ?? []).map((entry: any) => ({
            season_id: season.id,
            tournament_id: tournamentId,
            club_id: entry.club_id,
            team_id: entry.team_id,
            source_participant_id: null,
            group_id: null,
            zone: entry.zone,
            category: entry.category,
            status: entry.status === 'archived' ? 'inactive' : entry.status,
            seed: entry.seed,
            notes: entry.notes,
            settings: {
                ...(entry.settings ?? {}),
                copied_from_entry_id: entry.id,
            },
        }));

        if (entryRows.length > 0) {
            const { data: insertedEntries, error: insertEntriesError } = await db
                .from('team_season_entries')
                .insert(entryRows)
                .select('id, settings, season_id, tournament_id, club_id, team_id, group_id, status, seed, notes, category');
            if (insertEntriesError) throw new Error(insertEntriesError.message || 'No se pudieron copiar los participantes.');

            for (const inserted of insertedEntries ?? []) {
                const sourceEntryId = inserted.settings?.copied_from_entry_id;
                if (sourceEntryId) entryIdBySourceId.set(sourceEntryId, inserted.id);
            }

            await Promise.all((insertedEntries ?? []).map(async (entry: any) => {
                const { data: club } = await db
                    .from('clubs')
                    .select('name, short_name')
                    .eq('id', entry.club_id)
                    .maybeSingle();
                const participantStatus = entry.status === 'archived' ? 'inactive' : entry.status;
                const { data: participant, error: participantError } = await db
                    .from('tournament_participants')
                    .insert({
                        tournament_id: tournamentId,
                        season_id: season.id,
                        season_entry_id: entry.id,
                        club_id: entry.club_id,
                        team_id: entry.team_id,
                        group_id: null,
                        name: club?.name ?? entry.category ?? null,
                        type: 'club',
                        status: participantStatus || 'active',
                        seed: entry.seed,
                        short_code: club?.short_name ?? null,
                        notes: entry.notes,
                    })
                    .select('id')
                    .single();

                if (!participantError && participant?.id) {
                    await db
                        .from('team_season_entries')
                        .update({ source_participant_id: participant.id })
                        .eq('id', entry.id);
                } else if (participantError && !isDuplicateError(participantError)) {
                    throw new Error(participantError.message || 'No se pudo crear el participante copiado.');
                }
            }));
        }
    }

    const rosterIdBySourceId = new Map<string, string>();

    if (copyRosters) {
        const { data: sourceRosters, error: rostersError } = await db
            .from('season_rosters')
            .select('*')
            .eq('season_id', source.id)
            .order('created_at', { ascending: true });
        if (rostersError) throw new Error(rostersError.message || 'No se pudieron cargar los planteles base.');

        const rosterRows = (sourceRosters ?? []).map((roster: any) => ({
            season_id: season.id,
            tournament_id: tournamentId,
            team_season_entry_id: roster.team_season_entry_id
                ? entryIdBySourceId.get(roster.team_season_entry_id) ?? null
                : null,
            club_id: roster.club_id,
            team_id: roster.team_id,
            name: String(roster.name || 'Plantel').replace(String(source.season_code), String(season.season_code)),
            roster_type: roster.roster_type || 'official',
            status: 'draft',
            copied_from_roster_id: roster.id,
            settings: {
                ...(roster.settings ?? {}),
                copied_from_roster_id: roster.id,
            },
        }));

        if (rosterRows.length > 0) {
            const { data: insertedRosters, error: insertRostersError } = await db
                .from('season_rosters')
                .insert(rosterRows)
                .select('id, copied_from_roster_id');
            if (insertRostersError) throw new Error(insertRostersError.message || 'No se pudieron copiar los planteles.');

            for (const inserted of insertedRosters ?? []) {
                if (inserted.copied_from_roster_id) rosterIdBySourceId.set(inserted.copied_from_roster_id, inserted.id);
            }
        }
    } else if (copyEntries) {
        await ensureRostersForSeasonEntries(db, season.id);
    }

    if (copyRosterMemberships && rosterIdBySourceId.size > 0) {
        const sourceRosterIds = Array.from(rosterIdBySourceId.keys());
        const { data: memberships, error: membershipsError } = await db
            .from('roster_memberships')
            .select('*')
            .in('roster_id', sourceRosterIds);
        if (membershipsError) throw new Error(membershipsError.message || 'No se pudieron cargar los jugadores base.');

        const joinedAt = asDateOnly(input.startDate) ?? new Date().toISOString().slice(0, 10);
        const membershipRows = (memberships ?? []).flatMap((membership: any) => {
            const rosterId = rosterIdBySourceId.get(membership.roster_id);
            if (!rosterId) return [];
            return [{
                roster_id: rosterId,
                season_id: season.id,
                tournament_id: tournamentId,
                club_id: membership.club_id,
                team_id: membership.team_id,
                player_id: membership.player_id,
                joined_at: joinedAt,
                left_at: null,
                status: membership.status === 'released' ? 'inactive' : membership.status,
                jersey_number: membership.jersey_number,
                position: membership.position,
                role: membership.role,
                notes: membership.notes,
                eligibility: membership.eligibility ?? {},
                is_continuity: true,
                copied_from_membership_id: membership.id,
            }];
        });

        if (membershipRows.length > 0) {
            const { error: insertMembershipsError } = await db
                .from('roster_memberships')
                .insert(membershipRows);
            if (insertMembershipsError) throw new Error(insertMembershipsError.message || 'No se pudieron copiar los jugadores del plantel.');
        }
    }

    return {
        season,
        copied: {
            entries: entryIdBySourceId.size,
            rosters: rosterIdBySourceId.size,
            rosterMemberships: copyRosterMemberships ? true : false,
        },
    };
}

export async function createSeasonEntry(db: DbClient, seasonId: string, input: CreateSeasonEntryInput) {
    const season = await assertEditableSeason(db, seasonId);
    const clubId = cleanText(input.clubId);
    if (!clubId) throw new Error('clubId es requerido.');

    const payload = {
        season_id: season.id,
        tournament_id: season.tournament_id,
        club_id: clubId,
        team_id: cleanText(input.teamId),
        group_id: cleanText(input.groupId),
        zone: cleanText(input.zone),
        category: cleanText(input.category),
        status: cleanText(input.status) || 'active',
        seed: typeof input.seed === 'number' ? input.seed : null,
        notes: cleanText(input.notes),
        settings: input.settings ?? {},
    };

    const { data, error } = await db
        .from('team_season_entries')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        if (isDuplicateError(error)) throw new Error('Ese club/equipo ya participa en esta temporada.');
        throw new Error(error.message || 'No se pudo agregar el participante.');
    }

    if (input.createRoster !== false) {
        await createSeasonRoster(db, season.id, {
            clubId,
            teamId: payload.team_id,
            teamSeasonEntryId: data.id,
            name: `${data.category || 'Plantel'} ${season.season_code}`.trim(),
            status: 'draft',
        });
    }

    const { data: club } = await db
        .from('clubs')
        .select('name, short_name')
        .eq('id', clubId)
        .maybeSingle();
    const participantPayload = {
        tournament_id: season.tournament_id,
        season_id: season.id,
        season_entry_id: data.id,
        club_id: clubId,
        team_id: payload.team_id,
        group_id: payload.group_id,
        name: club?.name ?? payload.category ?? null,
        type: 'club',
        status: payload.status === 'archived' ? 'inactive' : payload.status,
        seed: payload.seed,
        short_code: club?.short_name ?? null,
        notes: payload.notes,
    };

    let participantId: string | null = null;
    const { data: participant, error: participantError } = await db
        .from('tournament_participants')
        .insert(participantPayload)
        .select('id')
        .single();

    if (!participantError && participant?.id) {
        participantId = participant.id;
    } else if (participantError && isDuplicateError(participantError)) {
        let existingParticipantQuery = db
            .from('tournament_participants')
            .select('id')
            .eq('season_id', season.id)
            .eq('club_id', clubId);

        existingParticipantQuery = payload.team_id
            ? existingParticipantQuery.eq('team_id', payload.team_id)
            : existingParticipantQuery.is('team_id', null);

        const { data: existingParticipant } = await existingParticipantQuery.maybeSingle();
        participantId = existingParticipant?.id ?? null;
    } else if (participantError) {
        throw new Error(participantError.message || 'No se pudo crear el participante de la temporada.');
    }

    if (participantId) {
        await db
            .from('team_season_entries')
            .update({ source_participant_id: participantId })
            .eq('id', data.id);
        await db
            .from('tournament_participants')
            .update({ season_entry_id: data.id })
            .eq('id', participantId);
    }

    return data;
}

export async function createSeasonRoster(db: DbClient, seasonId: string, input: CreateSeasonRosterInput) {
    const season = await assertEditableSeason(db, seasonId);
    const clubId = cleanText(input.clubId);
    if (!clubId) throw new Error('clubId es requerido.');

    const rosterType = cleanText(input.rosterType) || 'official';
    const name = cleanText(input.name) || `Plantel ${season.season_code}`;
    const payload = {
        season_id: season.id,
        tournament_id: season.tournament_id,
        team_season_entry_id: cleanText(input.teamSeasonEntryId),
        club_id: clubId,
        team_id: cleanText(input.teamId),
        name,
        roster_type: rosterType,
        status: cleanText(input.status) || 'draft',
        settings: input.settings ?? {},
    };

    const { data, error } = await db
        .from('season_rosters')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        if (isDuplicateError(error)) throw new Error('Ya existe un plantel de ese tipo para este club/equipo en la temporada.');
        throw new Error(error.message || 'No se pudo crear el plantel.');
    }

    return data;
}

export async function ensureRostersForSeasonEntries(db: DbClient, seasonId: string) {
    const season = await fetchSeason(db, seasonId);
    const { data: entries, error } = await db
        .from('team_season_entries')
        .select('id, club_id, team_id, category')
        .eq('season_id', seasonId);
    if (error) throw new Error(error.message || 'No se pudieron cargar los participantes.');

    const { data: existingRosters } = await db
        .from('season_rosters')
        .select('team_season_entry_id')
        .eq('season_id', seasonId);
    const existingEntryIds = new Set((existingRosters ?? []).map((roster: any) => roster.team_season_entry_id).filter(Boolean));

    const rows = (entries ?? []).filter((entry: any) => !existingEntryIds.has(entry.id)).map((entry: any) => ({
        season_id: season.id,
        tournament_id: season.tournament_id,
        team_season_entry_id: entry.id,
        club_id: entry.club_id,
        team_id: entry.team_id,
        name: `${entry.category || 'Plantel'} ${season.season_code}`.trim(),
        roster_type: 'official',
        status: 'draft',
        settings: { source: 'ensure_rosters_for_entries' },
    }));

    if (rows.length === 0) return [];

    const { data, error: insertError } = await db
        .from('season_rosters')
        .insert(rows)
        .select('*');

    if (insertError && !isDuplicateError(insertError)) {
        throw new Error(insertError.message || 'No se pudieron crear los planteles.');
    }

    return data ?? [];
}

export async function listSeasonRosters(db: DbClient, seasonId: string, includeMemberships = false) {
    const { data: rosters, error } = await db
        .from('season_rosters')
        .select('*, club:clubs(id, name, short_name, logo_url), team:club_teams(id, name, category, gender, sport)')
        .eq('season_id', seasonId)
        .order('name', { ascending: true });

    if (error) throw new Error(error.message || 'No se pudieron cargar los planteles.');
    if (!includeMemberships || !rosters?.length) return rosters ?? [];

    const rosterIds = rosters.map((roster: any) => roster.id);
    const { data: memberships, error: membershipError } = await db
        .from('roster_memberships')
        .select('*, player:people(id, first_name, last_name, full_name, name, photo_url, avatar_url, position)')
        .in('roster_id', rosterIds)
        .order('jersey_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

    if (membershipError) throw new Error(membershipError.message || 'No se pudieron cargar los jugadores.');

    const membershipsByRoster = new Map<string, any[]>();
    for (const membership of memberships ?? []) {
        membershipsByRoster.set(membership.roster_id, [
            ...(membershipsByRoster.get(membership.roster_id) ?? []),
            membership,
        ]);
    }

    return rosters.map((roster: any) => ({
        ...roster,
        memberships: membershipsByRoster.get(roster.id) ?? [],
    }));
}

async function ensurePlayer(db: DbClient, roster: any, input: AddPlayerToRosterInput) {
    const playerId = cleanText(input.playerId);
    if (playerId) return playerId;

    const firstName = cleanText(input.firstName);
    const lastName = cleanText(input.lastName);
    if (!firstName || !lastName) {
        throw new Error('playerId o nombre/apellido del jugador son requeridos.');
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const { data, error } = await db
        .from('people')
        .insert({
            club_id: roster.club_id,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            name: fullName,
            role: 'player',
            status: 'active',
        })
        .select('id')
        .single();

    if (error) throw new Error(error.message || 'No se pudo crear el jugador.');
    return data.id;
}

export async function addPlayerToSeasonRoster(db: DbClient, rosterId: string, input: AddPlayerToRosterInput) {
    const { data: roster, error: rosterError } = await db
        .from('season_rosters')
        .select('*, season:tournament_seasons(id, status, tournament_id)')
        .eq('id', rosterId)
        .maybeSingle();

    if (rosterError) throw new Error(rosterError.message || 'No se pudo cargar el plantel.');
    if (!roster) throw new Error('Plantel no encontrado.');

    const season = Array.isArray(roster.season) ? roster.season[0] : roster.season;
    if (season && LOCKED_SEASON_STATUSES.has(season.status)) {
        throw new Error('La temporada esta finalizada o archivada y no se puede editar sin reabrirla.');
    }

    const playerId = await ensurePlayer(db, roster, input);

    const { data: activeElsewhere } = await db
        .from('roster_memberships')
        .select('id, roster_id, club_id, team_id, status')
        .eq('season_id', roster.season_id)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .neq('roster_id', roster.id);

    const payload = {
        roster_id: roster.id,
        season_id: roster.season_id,
        tournament_id: roster.tournament_id,
        club_id: roster.club_id,
        team_id: roster.team_id,
        player_id: playerId,
        joined_at: asDateOnly(input.joinedAt) ?? new Date().toISOString().slice(0, 10),
        left_at: asDateOnly(input.leftAt),
        status: normalizeMembershipStatus(input.status),
        jersey_number: typeof input.jerseyNumber === 'number' ? input.jerseyNumber : null,
        position: cleanText(input.position),
        role: cleanText(input.role),
        notes: cleanText(input.notes),
        eligibility: input.eligibility ?? {},
    };

    const { data, error } = await db
        .from('roster_memberships')
        .insert(payload)
        .select('*, player:people(id, first_name, last_name, full_name, name, photo_url, avatar_url, position)')
        .single();

    if (error) {
        if (isDuplicateError(error)) {
            throw new Error('El jugador ya esta cargado en este plantel.');
        }
        throw new Error(error.message || 'No se pudo agregar el jugador al plantel.');
    }

    return {
        membership: data,
        warnings: (activeElsewhere ?? []).length > 0
            ? [{ code: 'player_active_elsewhere', memberships: activeElsewhere }]
            : [],
    };
}
