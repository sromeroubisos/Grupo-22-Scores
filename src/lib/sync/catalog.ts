import { db, ExternalClub, ExternalPlayer, ExternalTournament } from '@/lib/mock-db';

function safeText(value?: string) {
    if (!value) return '';
    return String(value).trim();
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 80);
}

function ensureFsPrefix(id?: string) {
    if (!id) return undefined;
    return id.startsWith('fs-') ? id : `fs-${id}`;
}

function ensureTeamPrefix(id?: string) {
    if (!id) return undefined;
    return id.startsWith('fs-team-') ? id : `fs-team-${id}`;
}

function pickTournamentName(details: any) {
    return (
        details?.name ||
        details?.tournament?.name ||
        details?.tournament_name ||
        details?.league_name ||
        details?.competition?.name ||
        ''
    );
}

function pickTournamentLogo(details: any) {
    return (
        details?.image_path ||
        details?.logo ||
        details?.logo_path ||
        details?.tournament_logo ||
        details?.tournament_image_path ||
        ''
    );
}

function pickCountry(details: any) {
    return details?.country?.name || details?.country || details?.country_name || '';
}

function nowIso() {
    return new Date().toISOString();
}

export function persistFromExternalMatches(matches: any[], sport: string) {
    const updatedAt = nowIso();
    matches.forEach(match => {
        const tournamentId = ensureFsPrefix(match.tournamentId || match.leagueId || match.league_id || match.tournament_id);
        const tournamentName = safeText(match.leagueName || match.league_name || match.tournamentName || 'Liga');
        const countryName = safeText(match.countryName || match.country_name);

        if (tournamentId && tournamentName) {
            const payload: ExternalTournament = {
                id: tournamentId,
                name: tournamentName,
                sport: sport || 'unknown',
                country: countryName || undefined,
                seasonId: match.seasonId || undefined,
                source: 'API',
                provider: 'flashscore',
                updatedAt,
                logoUrl: match.tournamentLogo || match.tournament_logo || undefined
            };
            db.upsertExternalTournament(payload);
        }

        const homeId = ensureTeamPrefix(match.homeTeamId || match.home_team_id || match.home_team?.team_id);
        const awayId = ensureTeamPrefix(match.awayTeamId || match.away_team_id || match.away_team?.team_id);
        const homeName = safeText(match.homeTeamName || match.home_team_name || match.home_team?.name);
        const awayName = safeText(match.awayTeamName || match.away_team_name || match.away_team?.name);

        if (homeId && homeName) {
            const payload: ExternalClub = {
                id: homeId,
                name: homeName,
                country: countryName || undefined,
                logoUrl: match.homeTeamLogo || match.home_team?.image_path || match.home_team?.logo || undefined,
                sports: [sport || 'unknown'],
                source: 'API',
                provider: 'flashscore',
                updatedAt
            };
            db.upsertExternalClub(payload);
        }

        if (awayId && awayName) {
            const payload: ExternalClub = {
                id: awayId,
                name: awayName,
                country: countryName || undefined,
                logoUrl: match.awayTeamLogo || match.away_team?.image_path || match.away_team?.logo || undefined,
                sports: [sport || 'unknown'],
                source: 'API',
                provider: 'flashscore',
                updatedAt
            };
            db.upsertExternalClub(payload);
        }
    });
}

function extractTeamsFromRows(rows: any[]) {
    const teams: { id?: string; name?: string; logo?: string }[] = [];
    rows.forEach(row => {
        const team = row.team || row.participant || row;
        const name = safeText(team?.name || row.name || row.team_name);
        const rawId = team?.id || team?.team_id || row.team_id;
        const id = rawId ? ensureTeamPrefix(String(rawId)) : undefined;
        const logo = team?.logo || team?.image_path || team?.small_image_path || row.logo || row.team_logo;
        if (name) {
            teams.push({ id, name, logo });
        }
    });
    return teams;
}

function extractTeamsFromMatches(matches: any[]) {
    const teams: { id?: string; name?: string; logo?: string }[] = [];
    matches.forEach(match => {
        const homeName = safeText(match.home_team?.name || match.home_team_name || match.event_home_team);
        const awayName = safeText(match.away_team?.name || match.away_team_name || match.event_away_team);
        const homeId = match.home_team?.team_id ? ensureTeamPrefix(String(match.home_team.team_id)) : undefined;
        const awayId = match.away_team?.team_id ? ensureTeamPrefix(String(match.away_team.team_id)) : undefined;
        const homeLogo = match.home_team?.image_path || match.home_team?.small_image_path || match.home_team_logo;
        const awayLogo = match.away_team?.image_path || match.away_team?.small_image_path || match.away_team_logo;

        if (homeName) teams.push({ id: homeId, name: homeName, logo: homeLogo });
        if (awayName) teams.push({ id: awayId, name: awayName, logo: awayLogo });
    });
    return teams;
}

function extractPlayersFromTopScorers(players: any[]) {
    return players.map(player => {
        const name = safeText(player.player_name || player.name);
        const rawId = player.player_id || player.id;
        const id = rawId ? `fs-player-${rawId}` : `fs-player-${slugify(name || 'unknown')}`;
        const teamName = safeText(player.team_name || player.team?.name);
        const teamId = player.team_id ? ensureTeamPrefix(String(player.team_id)) : undefined;
        return {
            id,
            name,
            teamName: teamName || undefined,
            teamId: teamId || undefined
        };
    });
}

export function persistFromTournamentPayload(payload: {
    ids: { tournamentId?: string; seasonId?: string };
    sport: string;
    details?: any;
    standings?: any[];
    fixtures?: any[];
    results?: any[];
    topScorers?: any[];
}) {
    const updatedAt = nowIso();
    const tournamentName = safeText(pickTournamentName(payload.details));
    const tournamentId = ensureFsPrefix(payload.ids.tournamentId) || (tournamentName ? `fs-${slugify(tournamentName)}` : undefined);
    const countryName = safeText(pickCountry(payload.details));
    const logoUrl = pickTournamentLogo(payload.details) || undefined;

    if (tournamentId && tournamentName) {
        const tournament: ExternalTournament = {
            id: tournamentId,
            name: tournamentName,
            sport: payload.sport || 'unknown',
            country: countryName || undefined,
            seasonId: payload.ids.seasonId,
            source: 'API',
            provider: 'flashscore',
            updatedAt,
            logoUrl
        };
        db.upsertExternalTournament(tournament);
    }

    const standingsRows: any[] = [];
    if (Array.isArray(payload.standings)) {
        payload.standings.forEach((group: any) => {
            if (Array.isArray(group?.rows)) {
                standingsRows.push(...group.rows);
            } else {
                standingsRows.push(group);
            }
        });
    }

    const teams = [
        ...extractTeamsFromRows(standingsRows),
        ...extractTeamsFromMatches(payload.results || []),
        ...extractTeamsFromMatches(payload.fixtures || [])
    ];

    teams.forEach(team => {
        if (!team.name) return;
        const id = team.id || `fs-team-${slugify(team.name)}`;
        const club: ExternalClub = {
            id,
            name: team.name,
            country: countryName || undefined,
            logoUrl: team.logo || undefined,
            sports: [payload.sport || 'unknown'],
            source: 'API',
            provider: 'flashscore',
            updatedAt
        };
        db.upsertExternalClub(club);
    });

    if (payload.topScorers && payload.topScorers.length > 0) {
        const players = extractPlayersFromTopScorers(payload.topScorers);
        players.forEach(player => {
            if (!player.name) return;
            const payloadPlayer: ExternalPlayer = {
                id: player.id,
                name: player.name,
                teamId: player.teamId,
                teamName: player.teamName,
                country: countryName || undefined,
                sport: payload.sport || 'unknown',
                isIndividual: !player.teamId && !player.teamName,
                source: 'API',
                provider: 'flashscore',
                updatedAt
            };
            db.upsertExternalPlayer(payloadPlayer);
        });
    }
}
