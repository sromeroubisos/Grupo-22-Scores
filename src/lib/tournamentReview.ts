export const TOURNAMENT_REVIEW_STATUS = {
    approved: 'approved',
    pendingLink: 'pending_link',
    linked: 'linked',
    rejected: 'rejected',
} as const;

export type TournamentReviewStatus =
    typeof TOURNAMENT_REVIEW_STATUS[keyof typeof TOURNAMENT_REVIEW_STATUS];

export function isPendingClubTournamentStatus(value: unknown) {
    return value === TOURNAMENT_REVIEW_STATUS.pendingLink;
}

export function isPublicTournamentStatus(value: unknown) {
    const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return status === 'active' || status === 'published';
}

function isHiddenTournamentStatus(value: unknown) {
    const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return status === 'archived' || status === 'deleted';
}

export function isTournamentVisibleToPublic(tournament: {
    status?: string | null;
    is_visible?: boolean | null;
    review_status?: string | null;
} | null | undefined) {
    if (!tournament) return false;
    if (tournament.is_visible === false) return false;
    if (isPendingClubTournamentStatus(tournament.review_status)) return false;
    if (tournament.review_status === TOURNAMENT_REVIEW_STATUS.rejected) return false;
    if (isHiddenTournamentStatus(tournament.status)) return false;
    if (tournament.is_visible === true) return true;
    return isPublicTournamentStatus(tournament.status);
}
