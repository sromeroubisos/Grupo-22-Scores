export interface OnboardingFallbackStatus {
    completed: boolean
    skipped: boolean
}

const ONBOARDING_COMPLETED_KEY = 'preferences_onboarding_completed'
const ONBOARDING_SKIPPED_KEY = 'preferences_onboarding_skipped'
const ONBOARDING_STORAGE_PREFIX = 'g22:onboarding:'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function getOnboardingMetadataStatus(metadata: unknown): OnboardingFallbackStatus {
    if (!isRecord(metadata)) {
        return { completed: false, skipped: false }
    }

    const skipped = metadata[ONBOARDING_SKIPPED_KEY] === true
    const completed = metadata[ONBOARDING_COMPLETED_KEY] === true || skipped

    return { completed, skipped }
}

export function buildOnboardingMetadata(
    metadata: unknown,
    options: { skipped: boolean }
): Record<string, unknown> {
    const base = isRecord(metadata) ? metadata : {}

    return {
        ...base,
        [ONBOARDING_COMPLETED_KEY]: true,
        [ONBOARDING_SKIPPED_KEY]: options.skipped,
    }
}

function getOnboardingStorageKey(userId: string) {
    return `${ONBOARDING_STORAGE_PREFIX}${userId}`
}

export function getOnboardingStorageStatus(userId: string | null | undefined): OnboardingFallbackStatus {
    if (!userId || typeof window === 'undefined') {
        return { completed: false, skipped: false }
    }

    try {
        const raw = window.localStorage.getItem(getOnboardingStorageKey(userId))

        if (!raw) {
            return { completed: false, skipped: false }
        }

        const parsed: unknown = JSON.parse(raw)

        if (isRecord(parsed)) {
            const skipped = parsed.skipped === true
            const completed = parsed.completed === true || skipped
            return { completed, skipped }
        }
    } catch {
        // Ignore storage parsing errors and fall back to the DB/auth state.
    }

    return { completed: false, skipped: false }
}

export function setOnboardingStorageStatus(
    userId: string | null | undefined,
    options: { skipped: boolean }
) {
    if (!userId || typeof window === 'undefined') {
        return
    }

    try {
        window.localStorage.setItem(
            getOnboardingStorageKey(userId),
            JSON.stringify({
                completed: true,
                skipped: options.skipped,
            })
        )
    } catch {
        // Ignore storage write failures.
    }
}
