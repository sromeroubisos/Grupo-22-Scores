/*
 * Edición de clubes del catálogo (Mis clubes): nombre, sigla, camiseta y planteles.
 *
 * Los clubes viven en objetos de módulo (AR_CLUBS, CLUBS) que leen todos los
 * modos (torneos, carrera, amistoso). Para que un cambio se vea en todos lados
 * se pisan esos objetos en el lugar, y se guarda una copia de fábrica para poder
 * restaurar. Lo editado se guarda en el navegador de quien lo edita.
 */

import { AR_CLUBS } from './arClubs';
import { CLUBS } from './clubs';
import type { Kit, Look } from './sprites';
import type { SevenTeam } from './teams';

const KEY = 'g22-seven-club-edits';

export interface ClubEdit {
    name: string;
    short: string;
    kit: Kit;
    players: Look[];
}

/** Todos los clubes editables: los de Argentina y del mundo, y los de las ligas profesionales. */
export const EDITABLE_CLUBS: SevenTeam[] = [...AR_CLUBS, ...CLUBS];
const BY_ID: Record<string, SevenTeam> = Object.fromEntries(EDITABLE_CLUBS.map((c) => [c.id, c]));

/** Cómo salió de fábrica cada club que se tocó (para "Restaurar"). */
const FACTORY: Record<string, ClubEdit> = {};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const flagOf = (kit: Kit) => `kit:${kit.shirt}:${kit.shirt2}:${kit.pattern}`;

function put(team: SevenTeam, edit: ClubEdit) {
    FACTORY[team.id] ??= clone({ name: team.name, short: team.short, kit: team.kit, players: team.players });
    team.name = edit.name;
    team.short = edit.short;
    team.kit = clone(edit.kit);
    team.players = clone(edit.players);
    // Las banderitas de los clubes son los colores de la camiseta: se actualizan con ella.
    if (team.flag?.startsWith('kit:')) team.flag = flagOf(team.kit);
}

/** Lo editado antes, desde el navegador. Sin acceso al almacenamiento, vale solo la visita. */
export function readClubEdits(): Record<string, ClubEdit> {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, ClubEdit>) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeClubEdits(edits: Record<string, ClubEdit>) {
    try {
        localStorage.setItem(KEY, JSON.stringify(edits));
    } catch {
        // Sin localStorage (modo privado, cuota): el cambio vale hasta cerrar la pestaña.
    }
}

let applied = false;
/** Aplica lo guardado a los clubes del catálogo, una sola vez por visita. */
export function applyStoredClubEdits() {
    if (applied) return;
    applied = true;
    const edits = readClubEdits();
    for (const [id, edit] of Object.entries(edits)) {
        const team = BY_ID[id];
        if (team && edit?.name && edit.kit && Array.isArray(edit.players) && edit.players.length === 7) put(team, edit);
    }
}

/** Guarda la edición de un club y la aplica al catálogo ya mismo. */
export function saveClubEdit(id: string, edit: ClubEdit) {
    const team = BY_ID[id];
    if (!team) return;
    put(team, edit);
    writeClubEdits({ ...readClubEdits(), [id]: clone(edit) });
}

/** Vuelve un club a como salió de fábrica. */
export function resetClubEdit(id: string) {
    const team = BY_ID[id];
    const factory = FACTORY[id];
    const edits = readClubEdits();
    delete edits[id];
    writeClubEdits(edits);
    if (team && factory) put(team, factory);
}

/** ¿Este club fue editado? */
export const isClubEdited = (id: string) => id in readClubEdits();
