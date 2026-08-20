// El empate es una opción real: en rugby y en fútbol un partido puede terminar
// igualado, y sin esa tercera opción la votación obliga a elegir un ganador que
// el votante no cree. Se suma a las dos que ya existían sin romperlas: los
// votos guardados siguen siendo 'home' o 'away'.
export type MatchVoteChoice = 'home' | 'draw' | 'away';

export const MATCH_VOTE_CHOICES: readonly MatchVoteChoice[] = ['home', 'draw', 'away'];

export function isMatchVoteChoice(value: unknown): value is MatchVoteChoice {
    return value === 'home' || value === 'draw' || value === 'away';
}

export type MatchVoteSummary = {
    matchId: string;
    totalVotes: number;
    homeVotes: number;
    drawVotes: number;
    awayVotes: number;
    homePercentage: number;
    drawPercentage: number;
    awayPercentage: number;
    userChoice: MatchVoteChoice | null;
};

export function createEmptyMatchVoteSummary(matchId: string): MatchVoteSummary {
    return {
        matchId,
        totalVotes: 0,
        homeVotes: 0,
        drawVotes: 0,
        awayVotes: 0,
        homePercentage: 0,
        drawPercentage: 0,
        awayPercentage: 0,
        userChoice: null,
    };
}
