const HIRE_CTA_ENABLED_PREFIX = 'g22_hire_cta_enabled';
const HIRE_CTA_SEEN_PREFIX = 'g22_hire_cta_seen';

export type HireCtaPreference = {
    enabled: boolean;
    seen: boolean;
};

function canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getKey(prefix: string, userId: string): string {
    return `${prefix}:${userId}`;
}

function readBoolean(key: string): boolean {
    if (!canUseStorage()) return false;
    return window.localStorage.getItem(key) === 'true';
}

function writeBoolean(key: string, value: boolean): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(key, value ? 'true' : 'false');
}

export function getHireCtaPreference(userId: string): HireCtaPreference {
    return {
        enabled: readBoolean(getKey(HIRE_CTA_ENABLED_PREFIX, userId)),
        seen: readBoolean(getKey(HIRE_CTA_SEEN_PREFIX, userId)),
    };
}

export function shouldShowHireCtaForUser(userId: string): boolean {
    const preference = getHireCtaPreference(userId);
    return preference.enabled && !preference.seen;
}

export function enableHireCtaOnce(userId: string): HireCtaPreference {
    writeBoolean(getKey(HIRE_CTA_ENABLED_PREFIX, userId), true);
    writeBoolean(getKey(HIRE_CTA_SEEN_PREFIX, userId), false);
    return getHireCtaPreference(userId);
}

export function disableHireCta(userId: string): HireCtaPreference {
    writeBoolean(getKey(HIRE_CTA_ENABLED_PREFIX, userId), false);
    return getHireCtaPreference(userId);
}

export function markHireCtaSeen(userId: string): HireCtaPreference {
    writeBoolean(getKey(HIRE_CTA_SEEN_PREFIX, userId), true);
    return getHireCtaPreference(userId);
}
