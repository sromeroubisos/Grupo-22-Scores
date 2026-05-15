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
            const { data: person, error: personError } = await supabase
                .from('people')
                .select('id, full_name, name, photo_url, avatar_url, birth_date, position, height, weight, club_id')
                .eq('id', playerId)
                .maybeSingle();

            if (personError) {
                return Response.json(
                    { ok: false, error: 'Failed to load local player data', details: personError.message },
                    { status: 500 }
                );
            }

            if (person) {
                const [clubRes, squadRes] = await Promise.all([
                    person.club_id
                        ? supabase
                            .from('clubs')
                            .select('id, name, logo_url')
                            .eq('id', person.club_id)
                            .maybeSingle()
                        : Promise.resolve({ data: null, error: null }),
                    supabase
                        .from('squad_members')
                        .select('jersey_number')
                        .eq('person_id', playerId)
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                ]);

                return Response.json({
                    ok: true,
                    details: {
                        id: person.id,
                        name: person.full_name || person.name || 'Jugador',
                        image_path: person.photo_url || person.avatar_url || '',
                        birth_date: person.birth_date,
                        position: person.position || '',
                        height: person.height,
                        weight: person.weight,
                        jersey_number: squadRes.data?.jersey_number ?? null,
                        team: clubRes.data
                            ? {
                                id: clubRes.data.id,
                                name: clubRes.data.name,
                                logo_url: clubRes.data.logo_url || '',
                            }
                            : null,
                    },
                    career: []
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

        return Response.json({
            ok: true,
            details,
            career: Array.isArray(career) ? career : (career ? [career] : [])
        });
    } catch (e: any) {
        console.error('Players API error', e);
        return Response.json(
            { ok: false, error: 'Failed to load player data', details: e.message || String(e) },
            { status: 500 }
        );
    }
}
