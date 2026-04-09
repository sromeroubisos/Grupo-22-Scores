import ProdeLobby from '@/components/prode/ProdeLobby';
import { createClient } from '@/lib/supabase/server';
import { listPublicProdeCompetitions, listPublicProdeUserTotals, listUserPrivateLeagues } from '@/lib/server/prodeCompetitions';

export default async function ProdePage() {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();
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
