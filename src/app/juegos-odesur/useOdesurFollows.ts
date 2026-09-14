'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Lo que sigue quien mira los Juegos: delegaciones (países) y deportes.
 *
 * Vive en el dispositivo y no en la cuenta: se sigue sin iniciar sesión, que
 * es como entra la mayoría a mirar unos Juegos, y la tabla de seguidos del
 * sitio es de torneos y clubes (un país o "la natación" no son ninguna de las
 * dos). Los torneos de equipo de los Juegos sí se siguen con la cuenta, desde
 * su deporte, con el mismo botón que cualquier torneo.
 *
 * `useSyncExternalStore` con una foto vacía en el servidor: la primera
 * pintura no sabe qué sigue nadie, y la hidratación no se rompe por eso.
 */

const STORAGE_KEY = 'g22:odesur:siguiendo';
const CHANGE_EVENT = 'g22:odesur:siguiendo';

type Follows = { orgs: string[]; sports: string[] };

const EMPTY: Follows = { orgs: [], sports: [] };

let cachedRaw: string | null = null;
let cachedValue: Follows = EMPTY;
/** Lo último escrito cuando localStorage no deja guardar: vale mientras la página siga abierta. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY) ?? memoryRaw;
    } catch {
        // Sin acceso a localStorage (modo privado, bloqueado): queda lo de la sesión.
        return memoryRaw;
    }
}

function parse(raw: string | null): Follows {
    if (!raw) return EMPTY;
    try {
        const value = JSON.parse(raw) as Partial<Follows>;
        const clean = (list: unknown) => (
            Array.isArray(list)
                ? [...new Set(list.filter((item): item is string => typeof item === 'string' && /^[A-Z0-9]{3}$/.test(item)))].sort()
                : []
        );
        return { orgs: clean(value.orgs), sports: clean(value.sports) };
    } catch {
        return EMPTY;
    }
}

function getSnapshot(): Follows {
    const raw = readRaw();
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = parse(raw);
    }
    return cachedValue;
}

function getServerSnapshot(): Follows {
    return EMPTY;
}

function subscribe(onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) onChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(CHANGE_EVENT, onChange);
    };
}

function write(next: Follows) {
    const raw = JSON.stringify({ v: 1, ...next });
    memoryRaw = raw;
    try {
        window.localStorage.setItem(STORAGE_KEY, raw);
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): el cambio vale
        // mientras la página siga abierta.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

function toggled(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value].sort();
}

export function useOdesurFollows() {
    const follows = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const orgs = useMemo(() => new Set(follows.orgs), [follows.orgs]);
    const sports = useMemo(() => new Set(follows.sports), [follows.sports]);

    const toggleOrg = useCallback((code: string) => {
        const current = getSnapshot();
        write({ ...current, orgs: toggled(current.orgs, code) });
    }, []);

    const toggleSport = useCallback((code: string) => {
        const current = getSnapshot();
        write({ ...current, sports: toggled(current.sports, code) });
    }, []);

    /** Si una unidad toca algo de lo que se sigue: su deporte o alguno de sus países. */
    const isFollowed = useCallback((discipline: string, unitOrgs: string[]) => (
        sports.has(discipline) || unitOrgs.some((code) => orgs.has(code))
    ), [orgs, sports]);

    return {
        orgs,
        sports,
        count: follows.orgs.length + follows.sports.length,
        toggleOrg,
        toggleSport,
        isFollowed,
    };
}

export type OdesurFollows = ReturnType<typeof useOdesurFollows>;
