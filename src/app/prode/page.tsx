import ProdeLobby from '@/components/prode/ProdeLobby';
import { createClient } from '@/lib/supabase/server';
import { listPublicProdeCompetitions, listPublicProdeUserTotals, listUserPrivateLeagues } from '@/lib/server/prodeCompetitions';
import { refreshStoredProdeScoreboards } from '@/lib/server/prodeScoring';

export default async function ProdePage() {
    const supabase = await createClient();
    const [, sessionResult] = await Promise.all([
        refreshStoredProdeScoreboards(),
        supabase.auth.getSession(),
    ]);
    const {
        data: { session },
    } = sessionResult;
    const [
        { schemaReady: competitionsReady, data: competitions },
        { schemaReady: totalsReady, data: totals },
        { schemaReady: privateLeaguesReady, data: privateLeagues },
    ] = await Promise.all([
        listPublicProdeCompetitions(),
        listPublicProdeUserTotals(),
        session?.user?.id ? listUserPrivateLeagues(session.user.id) : Promise.resolve({ schemaReady: true, data: [] }),
    ]);

    return (
        <ProdeLobby
            competitions={competitions}
            totals={totals}
            privateLeagues={privateLeagues}
            schemaReady={competitionsReady && totalsReady && privateLeaguesReady}
        />
    );
}
