// Preferencias del visitante GUARDADAS EN EL DISPOSITIVO: deporte, competiciones
// y clubes que eligió en el onboarding (o con la estrella) sin tener cuenta.
//
// Es la memoria del anónimo. Cuando inicia sesión, `favoritesStore` sube lo que
// falte a su cuenta y deja acá solo el deporte y la marca de "ya configuró".
//
// Una sola clave, todo en try/catch: modo privado y cuota llena son escenarios
// reales y el sitio tiene que funcionar igual sin esto (queda en memoria).

import { setDeviceSportId } from '@/lib/deviceSportPreference';
import type { SportId } from '@/lib/types';

export const LOCAL_PREFS_KEY = 'g22:prefs:v1';
const LOCAL_PREFS_EVENT = 'g22:prefs-changed';

export interface PrefItem {
    id: string;
    name: string;
    logo?: string | null;
    sportId?: string | null;
}

export interface LocalPreferences {
    sportIds: string[];
    leagues: PrefItem[];
    clubs: PrefItem[];
    /** Epoch ms en que terminó (o salteó) el onboarding. null = nunca. */
    completedAt: number | null;
    skipped: boolean;
}

export const EMPTY_LOCAL_PREFERENCES: LocalPreferences = Object.freeze({
    sportIds: [],
    leagues: [],
    clubs: [],
    completedAt: null,
    skipped: false,
}) as LocalPreferences;

// useSyncExternalStore exige una referencia estable mientras el dato no cambie:
// se reusa el objeto parseado mientras el string crudo sea el mismo.
let cachedRaw: string | null | undefined;
let cachedValue: LocalPreferences = EMPTY_LOCAL_PREFERENCES;
// Respaldo en memoria cuando localStorage no deja escribir.
let memoryFallback: LocalPreferences | null = null;

function canUseLocal(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function toItems(value: unknown): PrefItem[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const items: PrefItem[] = [];
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null) continue;
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({
            id,
            name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : id,
            logo: typeof record.logo === 'string' && record.logo ? record.logo : null,
            sportId: typeof record.sportId === 'string' && record.sportId ? record.sportId : null,
        });
    }
    return items;
}

function parse(raw: string): LocalPreferences {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return EMPTY_LOCAL_PREFERENCES;
        const record = parsed as Record<string, unknown>;
        return {
            sportIds: Array.isArray(record.sportIds)
                ? record.sportIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
                : [],
            leagues: toItems(record.leagues),
            clubs: toItems(record.clubs),
            completedAt: typeof record.completedAt === 'number' ? record.completedAt : null,
            skipped: record.skipped === true,
        };
    } catch {
        return EMPTY_LOCAL_PREFERENCES;
    }
}

export function readLocalPreferences(): LocalPreferences {
    if (!canUseLocal()) return memoryFallback ?? EMPTY_LOCAL_PREFERENCES;
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(LOCAL_PREFS_KEY);
    } catch {
        return memoryFallback ?? EMPTY_LOCAL_PREFERENCES;
    }
    if (raw === null) return memoryFallback ?? EMPTY_LOCAL_PREFERENCES;
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = parse(raw);
    }
    return cachedValue;
}

export function writeLocalPreferences(patch: Partial<LocalPreferences>): LocalPreferences {
    const next: LocalPreferences = { ...readLocalPreferences(), ...patch };
    memoryFallback = next;
    if (canUseLocal()) {
        try {
            window.localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(next));
        } catch {
            // Sin acceso a localStorage (modo privado, cuota): la elección vive en memoria.
        }
        window.dispatchEvent(new Event(LOCAL_PREFS_EVENT));
    }
    // El resto del sitio (SportContext) arranca leyendo el deporte del dispositivo.
    if (patch.sportIds?.[0]) setDeviceSportId(patch.sportIds[0] as SportId);
    return next;
}

export function subscribeLocalPreferences(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === LOCAL_PREFS_KEY) onChange();
    };
    window.addEventListener(LOCAL_PREFS_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(LOCAL_PREFS_EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}

/** ¿El visitante ya pasó por el onboarding (o lo salteó) en este dispositivo? */
export function hasCompletedLocalOnboarding(prefs: LocalPreferences = readLocalPreferences()): boolean {
    return prefs.completedAt !== null;
}

export function toggleLocalItem(kind: 'leagues' | 'clubs', item: PrefItem, forceIsFavorite?: boolean): boolean {
    const current = readLocalPreferences()[kind];
    const exists = current.some((entry) => entry.id === item.id);
    const shouldFollow = typeof forceIsFavorite === 'boolean' ? forceIsFavorite : !exists;
    const next = shouldFollow
        ? [item, ...current.filter((entry) => entry.id !== item.id)]
        : current.filter((entry) => entry.id !== item.id);
    writeLocalPreferences({ [kind]: next } as Partial<LocalPreferences>);
    return shouldFollow;
}
