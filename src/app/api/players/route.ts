import { getPlayerDetails, getPlayerCareer } from '@/lib/services/flashscore';
import {
    getSofaScorePlayerBundle,
    isSofaScoreServiceConfigured,
    SOFASCORE_PLAYER_PREFIX,
} from '@/lib/services/sofascore';
import {
    getEspnFootballPlayerBundle,
    parseEspnFootballPlayerId,
} from '@/lib/services/espnFootball';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getLocalPlayerProfile } from '@/lib/services/localPlayerProfile';
import {
    getRugbyPassPlayerBundle,
    parseRugbyPassPlayerSlug,
} from '@/lib/services/rugbyPassProfiles';

function isUuidLike(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSofaScorePlayerId(value: string): boolean {
    const v = value.trim().toLowerCase();
    if (!v.startsWith(SOFASCORE_PLAYER_PREFIX)) return false;
    return /^\d+$/.test(v.slice(SOFASCORE_PLAYER_PREFIX.length));
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawPlayerId = searchParams.get('player_id') || '';
    const leagueHint = searchParams.get('league') || '';

    if (!rawPlayerId) {
        return Response.json({ ok: false, error: 'player_id is required' }, { status: 400 });
    }

    const playerId = rawPlayerId.trim();
    const playerUrl = searchParams.get('player_url') || `/player/p/${playerId}/`;

    try {
        // RugbyPass: `rp-player-pablo-matera`. Va ANTES que el camino de
        // FlashScore, que para un id asi arma `/player/p/rp-player-.../` y
        // contesta cualquier cosa menos este jugador.
        const rugbyPassPlayerSlug = parseRugbyPassPlayerSlug(playerId);
        if (rugbyPassPlayerSlug) {
            // El cliente va para leer los puntajes por partido de
            // `external_match_player_ratings`. Sin él la ficha sale igual, con
            // la columna de puntaje vacía.
            const bundle = await getRugbyPassPlayerBundle(rugbyPassPlayerSlug, createAdminClient());
            if (!bundle) {
                return Response.json({ ok: false, error: 'Player not found' }, { status: 404 });
            }
            return Response.json({
                ok: true,
                source: 'rugbypass',
                details: bundle.details,
                career: bundle.career,
                // Los otros proveedores no las mandan y la pantalla las lee
                // vacias: es una pestana de menos, no una pantalla rota.
                seasons: bundle.seasons,
                matches: bundle.matches,
            });
        }

        const espnFootballPlayer = parseEspnFootballPlayerId(playerId);
        if (espnFootballPlayer) {
            const bundle = await getEspnFootballPlayerBundle(
                espnFootballPlayer.playerId,
                espnFootballPlayer.leagueSlug || leagueHint || null,
            );
            if (!bundle) {
                return Response.json({ ok: false, error: 'Player not found' }, { status: 404 });
            }
            return Response.json({ ok: true, details: bundle.details, career: bundle.career });
        }

        if (isSofaScorePlayerId(playerId) && isSofaScoreServiceConfigured()) {
            const bundle = await getSofaScorePlayerBundle(playerId) as {
                details?: { DATA?: unknown } | null;
                career?: { DATA?: unknown } | null;
            } | null;

            if (!bundle) {
                return Response.json({ ok: false, error: 'Player not found' }, { status: 404 });
            }

            const details = bundle.details?.DATA ?? null;
            const careerRaw = bundle.career?.DATA;
            const career = Array.isArray(careerRaw) ? careerRaw : (careerRaw ? [careerRaw] : []);

            return Response.json({ ok: true, details, career });
        }

        if (isUuidLike(playerId)) {
            const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
                ? createAdminClient()
                : await createClient();

            // La ficha local sale de los PARTIDOS, no de las columnas de
            // `people`: de 1528 jugadores solo 144 tienen posicion cargada y 38
            // fecha de nacimiento, pero 350 tienen eventos. Ver
            // `localPlayerProfile.ts`.
            const profile = await getLocalPlayerProfile(supabase, playerId);

            if (profile) {
                return Response.json({
                    ok: true,
                    source: 'local',
                    details: {
                        id: profile.id,
                        name: profile.name,
                        image_path: profile.photo || '',
                        birth_date: profile.birthDate,
                        position: profile.position || '',
                        height: profile.height,
                        weight: profile.weight,
                        jersey_number: profile.number,
                        // El escudo va por el proxy (`/api/assets/team-logo`),
                        // no crudo: `clubs.logo_url` guarda PNG en base64 de
                        // hasta 200 KB y los metia enteros en esta respuesta.
                        team: profile.club
                            ? { id: profile.club.id, name: profile.club.name, short_name: profile.club.shortName }
                            : null,
                    },
                    career: [],
                    profile,
                });
            }
        }

        const settled = await Promise.allSettled([
            getPlayerDetails(playerUrl),
            getPlayerCareer(playerUrl)
        ]);

        const normalize = (res: PromiseSettledResult<any>) => {
            if (res.status !== 'fulfilled' || !res.value) return null;
            const v = res.value;
            return v?.DATA || v?.data || v;
        };

        const details = normalize(settled[0]);
        const career = normalize(settled[1]);
        const trayectoria = Array.isArray(career) ? career : (career ? [career] : []);

        // NI FICHA NI TRAYECTORIA ES UN 404, NO UN `ok: true` VACIO.
        //
        // Este es el ultimo escalon, el de FlashScore, y le llega todo lo que
        // los de arriba no reconocieron. A un id sin prefijo —`tommaso-
        // menoncello` en vez de `rp-player-tommaso-menoncello`— contestaba
        // `{ok: true, details: null}`, y con eso la pantalla dibujaba una ficha
        // con el slug de titulo y "El proveedor no publica datos personales":
        // parecia un jugador sin datos y era un id mal armado. Un error que no
        // llega a la pantalla se busca durante horas en el lugar equivocado.
        if (!details && trayectoria.length === 0) {
            return Response.json({ ok: false, error: 'Player not found' }, { status: 404 });
        }

        return Response.json({ ok: true, details, career: trayectoria });
    } catch (e: any) {
        console.error('Players API error', e);
        return Response.json(
            { ok: false, error: 'Failed to load player data', details: e.message || String(e) },
            { status: 500 }
        );
    }
}
