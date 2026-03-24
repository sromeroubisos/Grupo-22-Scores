export type MatchVoteChoice = 'home' | 'away';

export type MatchVoteSummary = {
    matchId: string;
    totalVotes: number;
    homeVotes: number;
    awayVotes: number;
    homePercentage: number;
    awayPercentage: number;
    userChoice: MatchVoteChoice | null;
};

export function createEmptyMatchVoteSummary(matchId: string): MatchVoteSummary {
    return {
        matchId,
        totalVotes: 0,
        homeVotes: 0,
        awayVotes: 0,
        homePercentage: 0,
        awayPercentage: 0,
        userChoice: null,
    };
}
