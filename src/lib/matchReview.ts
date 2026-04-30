export const MATCH_REVIEW_STATUS = {
  approved: 'approved',
  pending: 'pending',
  rejected: 'rejected',
} as const;

export type MatchReviewStatus =
  typeof MATCH_REVIEW_STATUS[keyof typeof MATCH_REVIEW_STATUS];

export function isPendingMatchReviewStatus(value: unknown) {
  return value === MATCH_REVIEW_STATUS.pending;
}

export function isRejectedMatchReviewStatus(value: unknown) {
  return value === MATCH_REVIEW_STATUS.rejected;
}

export function isMatchVisibleToPublic(match: {
  is_visible?: boolean | null;
  review_status?: string | null;
} | null | undefined) {
  if (!match) return false;
  if (match.is_visible === false) return false;
  if (isPendingMatchReviewStatus(match.review_status)) return false;
  if (isRejectedMatchReviewStatus(match.review_status)) return false;
  return true;
}
