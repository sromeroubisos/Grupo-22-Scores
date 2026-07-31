'use client';

import { useSyncExternalStore } from 'react';
import { LOCAL_AWARD_LOGOS, LOCAL_CLUB_LOGOS, LOCAL_COMPETITION_LOGOS } from '@/features/career/data/logo-manifest.generated';

/**
 * QUÉ CLUBES Y TORNEOS TIENEN LOGO PROPIO.
 *
 * Dos fuentes que se suman:
 *
 *   · el MANIFIESTO COMPILADO, que se genera en `prebuild` y es lo único que
 *     existe en producción;
 *   · en desarrollo, lo que hay EN DISCO ahora mismo (`/api/carrera/logos`),
 *     para que un PNG recién soltado aparezca con sólo refrescar, sin correr
 *     ningún script.
 *
 * Es un store módulo-nivel y no un contexto a propósito: lo consultan decenas de
 * `ClubBadge` por pantalla y ninguno necesita re-renderizar a los demás. La
 * consulta al disco se hace UNA sola vez por carga, la primera vez que alguien
 * pregunta, y de ahí en más todos leen el mismo `Set`.
 */
let clubs: ReadonlySet<string> = LOCAL_CLUB_LOGOS;
let competitions: ReadonlySet<string> = LOCAL_COMPETITION_LOGOS;
let awards: ReadonlySet<string> = LOCAL_AWARD_LOGOS;
let version = 0;
let asked = false;

const listeners = new Set<() => void>();

function emit(): void {
    version++;
    for (const l of listeners) l();
}

/** Pregunta al disco una única vez. En producción la ruta devuelve vacío. */
function askOnce(): void {
    if (asked || typeof window === 'undefined') return;
    asked = true;
    fetch('/api/carrera/logos')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { clubs?: string[]; competitions?: string[]; awards?: string[] } | null) => {
            if (!data) return;
            const nextClubs = new Set([...clubs, ...(data.clubs ?? [])]);
            const nextComps = new Set([...competitions, ...(data.competitions ?? [])]);
            const nextAwards = new Set([...awards, ...(data.awards ?? [])]);
            // Sólo se avisa si de verdad apareció algo nuevo: sin esto, cada
            // carga dispara un re-render de toda la pantalla para nada.
            if (nextClubs.size === clubs.size && nextComps.size === competitions.size && nextAwards.size === awards.size) return;
            clubs = nextClubs;
            competitions = nextComps;
            awards = nextAwards;
            emit();
        })
        .catch(() => {
            // Sin la ruta (o sin red) queda el manifiesto compilado, que es
            // exactamente el comportamiento de producción. No es un error.
        });
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    askOnce();
    return () => { listeners.delete(listener); };
}

const getSnapshot = (): number => version;
/** En el servidor el snapshot es estable: sólo el manifiesto compilado. */
const getServerSnapshot = (): number => 0;

/** ¿Este club tiene un logo cargado a mano? Reacciona si aparece uno nuevo. */
export function useHasLocalClubLogo(clubId: string): boolean {
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return clubs.has(clubId);
}

/** Igual, para torneos. */
export function useHasLocalCompetitionLogo(competitionId: string): boolean {
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return competitions.has(competitionId);
}

/** Y para los premios individuales (`public/premios/<id>.png`). */
export function useHasLocalAwardLogo(awardId: string | null): boolean {
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return awardId !== null && awards.has(awardId);
}
