// Vistas recortadas de la partida: lo que la pantalla recibe en lugar del mundo.
//
// El mundo pesa ~25 MB (17.000 jugadores, 5.000 partidos) y no puede cruzar al hilo principal
// ni vivir ahí. La pantalla solo dibuja un club: su plantel, sus partidos, la tabla de su liga y
// los clubes y jugadores que se nombran. Estas funciones arman ESE recorte con la forma de una
// partida (`ManagerGame` con un `World` reducido), así los tableros y las consultas de
// `queries.ts` funcionan igual sobre el recorte que sobre el mundo entero.
import type { ID, Match, Player, World } from '../types/index.ts';
import { playersOfClub } from '../engine/indexes.ts';
import type { PlayView, ChooseView } from '../worker/protocol.ts';
import { fixturesOf, leagueChoices, seasonView, type ManagerGame } from './game.ts';
import { clubStrength } from './queries.ts';

/** Ids de jugadores que nombra un partido jugado (titulares, goleadores, estadísticas). */
function playersNamedBy(match: Match | null): Set<ID> {
    const ids = new Set<ID>();
    const r = match?.result;
    if (!r) return ids;
    for (const list of [r.homeStarterIds, r.awayStarterIds, r.homeTryScorers, r.awayTryScorers]) {
        for (const id of list ?? []) ids.add(id);
    }
    for (const s of r.playerStats ?? []) ids.add(s.playerId);
    return ids;
}

/** La vista de juego: el club del entrenador, su temporada y todo lo que se nombra. */
export function buildPlayView(game: ManagerGame): PlayView {
    const clubId = game.managerClubId;
    if (!clubId) throw new Error('buildPlayView: la partida no tiene club elegido.');
    const world = game.world;
    const view = seasonView(game);

    const fixtures = fixturesOf(world, clubId);
    const matches: Match[] = [...fixtures];
    if (view.lastMatch && !matches.some((m) => m.id === view.lastMatch!.id)) matches.push(view.lastMatch);

    const clubIds = new Set<ID>([clubId, ...(view.league?.clubIds ?? [])]);
    for (const m of matches) {
        clubIds.add(m.homeClubId);
        clubIds.add(m.awayClubId);
    }
    const competitionIds = new Set<ID>(matches.map((m) => m.competitionId));
    if (view.league) competitionIds.add(view.league.id);

    const named = playersNamedBy(view.lastMatch);
    const players: Player[] = playersOfClub(world.players, clubId);
    const have = new Set(players.map((p) => p.id));
    if (named.size > 0) {
        for (const p of world.players) if (named.has(p.id) && !have.has(p.id)) players.push(p);
    }

    const slim: World = {
        id: world.id,
        version: world.version,
        engineSchemaVersion: world.engineSchemaVersion,
        currentDate: world.currentDate,
        seasonYear: world.seasonYear,
        settings: world.settings,
        countries: [],
        competitions: world.competitions.filter((c) => competitionIds.has(c.id)),
        clubs: world.clubs.filter((c) => clubIds.has(c.id)),
        players,
        staff: [],
        contracts: [],
        matches,
        tactics: world.tactics[clubId] ? { [clubId]: world.tactics[clubId] } : {},
        training: {},
        boardExpectations: {},
    };

    return {
        game: { seed: game.seed, entropy: 0, world: slim, managerClubId: clubId, manager: game.manager },
        view,
        strength: clubStrength(world, clubId),
    };
}

/** La vista de la pantalla de elegir club: todas las ligas y la fuerza de cada club. */
export function buildChooseView(game: ManagerGame): ChooseView {
    const choices = leagueChoices(game.world);
    const strengths: Record<ID, number> = {};
    for (const { clubs } of choices) {
        for (const club of clubs) strengths[club.id] = clubStrength(game.world, club.id);
    }
    return { choices, strengths };
}
