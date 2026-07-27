import type { GameEvent } from '../../types/event.ts';
import { CLUB_EVENTS } from './club.ts';
import { INJURY_EVENTS } from './injuries.ts';
import { NATIONAL_TEAM_EVENTS } from './national-team.ts';
import { PERSONAL_EVENTS } from './personal.ts';
import { TACTICAL_EVENTS } from './tactical.ts';
import { MEDIA_EVENTS } from './media.ts';
import { MILESTONE_EVENTS } from './milestones.ts';
import { ENVIRONMENT_EVENTS } from './environment-events.ts';

// Los eventos de selección SOLO aparecen si el jugador puede representar a una
// unión: se garantiza acá en vez de repetir el requisito en 21 definiciones.
const withEligibleUnion = NATIONAL_TEAM_EVENTS.map((e): GameEvent => ({
    ...e,
    requires: { ...e.requires, requiresEligibleUnion: true },
}));

export const ALL_EVENTS: GameEvent[] = [
    ...CLUB_EVENTS,
    ...INJURY_EVENTS,
    ...withEligibleUnion,
    ...PERSONAL_EVENTS,
    ...TACTICAL_EVENTS,
    ...MEDIA_EVENTS,
    ...MILESTONE_EVENTS,
    ...ENVIRONMENT_EVENTS,
];

const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

export function getEvent(id: string): GameEvent | undefined {
    return EVENT_BY_ID[id];
}

export const TRANSFER_EVENT_ID = 'club-transfer';
