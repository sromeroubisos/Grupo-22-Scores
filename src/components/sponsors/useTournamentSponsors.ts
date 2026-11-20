'use client';

/**
 * Los sponsors de un torneo, UNA sola vez por página.
 *
 * Resumen, Resultados, Fixture y la pestaña Sponsors dibujan bandas distintas
 * con los mismos datos: se pide a /api/sponsors una vez y se reparte por nivel.
 *
 * Los tres niveles salen de `tier` sin tocar la base:
 *   principal  -> main sponsors (arriba, en Resumen / Resultados / Fixture)
 *   secundario -> medios (en el cambio de día)
 *   null       -> relleno (sólo en la pestaña Sponsors)
 */

import { useEffect, useMemo, useState } from 'react';

import type { PublicSponsor } from '@/lib/sponsors/formats';

export interface TournamentSponsorTiers {
    main: PublicSponsor[];
    medios: PublicSponsor[];
    relleno: PublicSponsor[];
    all: PublicSponsor[];
    /** Hay jerarquía cargada: el torneo usa bandas y pestaña, no la vitrina plana. */
    hasTiers: boolean;
}

const EMPTY: TournamentSponsorTiers = { main: [], medios: [], relleno: [], all: [], hasTiers: false };

export function splitSponsorTiers(sponsors: PublicSponsor[]): TournamentSponsorTiers {
    if (sponsors.length === 0) return EMPTY;
    const main = sponsors.filter((s) => s.tier === 'principal');
    const medios = sponsors.filter((s) => s.tier === 'secundario');
    const relleno = sponsors.filter((s) => s.tier == null);
    return { main, medios, relleno, all: sponsors, hasTiers: main.length + medios.length > 0 };
}

export function useTournamentSponsors(ownerId: string | null | undefined): TournamentSponsorTiers {
    const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);

    useEffect(() => {
        if (!ownerId) {
            setSponsors([]);
            return;
        }
        const controller = new AbortController();
        const params = new URLSearchParams({ ownerType: 'tournament', ownerId });
        fetch(`/api/sponsors?${params.toString()}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: { data?: PublicSponsor[] } | null) => {
                setSponsors(Array.isArray(payload?.data) ? payload.data : []);
            })
            .catch(() => {
                // Sin sponsors la página sigue igual: no es lo que vino a ver.
            });
        return () => controller.abort();
    }, [ownerId]);

    return useMemo(() => splitSponsorTiers(sponsors), [sponsors]);
}
