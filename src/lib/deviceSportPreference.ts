// Deporte favorito guardado EN EL DISPOSITIVO, sin cuenta.
//
// Es la memoria del visitante anónimo: la primera vez que entra a la home se
// le pregunta qué deporte quiere ver primero y la respuesta queda acá. Cuando
// después se registra, el onboarding la precarga para no preguntar dos veces.
//
// Prioridad al elegir el deporte activo (SportContext):
//   ?sport= en la URL  >  favorito de la cuenta  >  este archivo  >  default.
//
// Todo va en una sola clave y envuelto en try/catch: modo privado y cuota
// llena son escenarios reales, y el sitio tiene que funcionar igual sin esto.

import { getSportById } from '@/lib/data/sports';
import type { SportId } from '@/lib/types';

export const DEVICE_SPORT_KEY = 'g22:device-sport';

interface DeviceSportRecord {
    /** Deporte elegido. Ausente si el visitante cerró la invitación sin elegir. */
    sportId?: string;
    /** true si cerró la invitación sin elegir: no se vuelve a preguntar. */
    dismissed?: boolean;
    /** Epoch ms de la última escritura. Informativo. */
    updatedAt?: number;
}

function canUseLocal(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read(): DeviceSportRecord {
    if (!canUseLocal()) return {};
    try {
        const raw = window.localStorage.getItem(DEVICE_SPORT_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return {};
        return parsed as DeviceSportRecord;
    } catch {
        return {};
    }
}

function write(record: DeviceSportRecord): void {
    if (!canUseLocal()) return;
    try {
        window.localStorage.setItem(
            DEVICE_SPORT_KEY,
            JSON.stringify({ ...record, updatedAt: Date.now() }),
        );
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): la elección vive en memoria.
    }
}

/**
 * Deporte guardado en el dispositivo, validado contra el catálogo. Devuelve
 * null si no hay nada, si el id ya no existe o si el deporte está apagado.
 */
export function getDeviceSportId(): SportId | null {
    const { sportId } = read();
    if (!sportId) return null;
    const sport = getSportById(sportId as SportId);
    if (!sport || sport.isActive === false || sport.groupKey) return null;
    return sport.id;
}

export function setDeviceSportId(sportId: SportId): void {
    write({ ...read(), sportId, dismissed: false });
}

/** El visitante cerró la invitación sin elegir. No se insiste. */
export function dismissDeviceSportPrompt(): void {
    write({ ...read(), dismissed: true });
}

/**
 * ¿Corresponde invitar a elegir deporte? Solo si el dispositivo no tiene ni
 * una elección ni un descarte previo. Quien ya respondió, de cualquier forma,
 * no vuelve a ver la pregunta.
 */
export function shouldPromptForDeviceSport(): boolean {
    if (!canUseLocal()) return false;
    const record = read();
    if (record.dismissed) return false;
    if (getDeviceSportId()) return false;
    return true;
}
