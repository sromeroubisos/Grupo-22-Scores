
import { Sport } from '@/lib/types';
import { differenceInMinutes } from 'date-fns';

/**
 * Calculates the current match minute or status (e.g., "HT", "FT") based on the start time and sport rules.
 * This is a "Virtual Clock" estimation used when the API does not provide live clock data.
 * 
 * @param startTimeISO - The ISO string of the match start time.
 * @param sport - The sport configuration object containing match rules.
 * @param status - The current match status from the API (to override if 'finished' or 'scheduled').
 * @returns A string representing the current minute (e.g., "32'") or period status (e.g., "HT", "FT").
 */
export function calculateVirtualMatchTime(startTimeISO: string | null | undefined, sport: Sport, status: string): string {
    if (!startTimeISO || status === 'scheduled') return '';
    if (status === 'finished' || status === 'final') return 'FT';

    const now = new Date();
    const start = new Date(startTimeISO);
    let minutesElapsed = differenceInMinutes(now, start);

    // Default rules
    const rules = sport.matchRules || {
        periods: 2,
        periodDurationMinutes: 45,
        breakDurationMinutes: 15,
    };

    const periods = rules.periods || 2;
    const periodDuration = rules.periodDurationMinutes || 45;
    const halfTimeBreak = rules.breakDurationMinutes || 15;
    const hasShootout = rules.hasShootout;
    const shortBreak = 2; // Default short break for Q1-Q2 / Q3-Q4 (Field Hockey, Basketball, etc.)

    // --- RUGBY / FOOTBALL (2 Halves) ---
    if (periods === 2) {
        // 1st Half
        if (minutesElapsed <= periodDuration) {
            // Cap at 40+ or 45+
            return `${minutesElapsed}'`;
        }

        // Halftime
        if (minutesElapsed <= periodDuration + halfTimeBreak) {
            return 'HT';
        }

        // 2nd Half
        // Calculated as: Fixed 1st half length + Time elapsed in 2nd half
        const secondHalfElapsed = minutesElapsed - (periodDuration + halfTimeBreak);
        const totalMinutes = periodDuration + secondHalfElapsed;

        // If it goes WAY beyond normal time (e.g. 50 mins into 2nd half), it might be finished just hasn't updated status yet.
        // But let's show the time anyway.
        return `${totalMinutes}'`;
    }

    // --- 4 QUARTER SPORTS (Basketball, Hockey, American Football) ---
    if (periods === 4) {
        // US Sports (NBA, NFL) typically count DOWN.
        // International (FIBA, Field Hockey) typically count DOWN too on the scoreboard, but users might expect "Q3 12'" (elapsed).
        // Let's stick to "QX MM'" format to be safe.
        // Or "Q2" if we can't be precise about the minute.

        let current = minutesElapsed;

        // Q1
        if (current <= periodDuration) return `Q1 ${current}'`;
        current -= periodDuration;

        // Break Q1-Q2
        if (current <= shortBreak) return 'End Q1';
        current -= shortBreak;

        // Q2
        if (current <= periodDuration) return `Q2 ${current}'`;
        current -= periodDuration;

        // Halftime (Long Break)
        if (current <= halfTimeBreak) return 'HT';
        current -= halfTimeBreak;

        // Q3
        if (current <= periodDuration) return `Q3 ${current}'`;
        current -= periodDuration;

        // Break Q3-Q4
        if (current <= shortBreak) return 'End Q3';
        current -= shortBreak;

        // Q4
        if (current <= periodDuration) return `Q4 ${current}'`;
        current -= periodDuration;

        // End of Regulation
        if (!hasShootout) {
            // Could be OT
            return 'OT';
        } else {
            // Field Hockey: Shootouts directly
            return 'SO';
        }
    }

    // Fallback
    return `${minutesElapsed}'`;
}
