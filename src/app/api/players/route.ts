import { getPlayerDetails, getPlayerCareer } from '@/lib/services/flashscore';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawPlayerId = searchParams.get('player_id') || '';

    if (!rawPlayerId) {
        return Response.json({ ok: false, error: 'player_id is required' }, { status: 400 });
    }

    const playerId = rawPlayerId.trim();
    const playerUrl = searchParams.get('player_url') || `/player/p/${playerId}/`;

    try {
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
