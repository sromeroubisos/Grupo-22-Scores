import ProdeLobby from '@/components/prode/ProdeLobby';
import { createClient } from '@/lib/supabase/server';
import { listPublicProdeCompetitions, listPublicProdeUserTotals, listUserPrivateLeagues } from '@/lib/server/prodeCompetitions';

export default async function ProdePage() {
    // El recálculo de scoreboards lo hace el cron /api/cron/prode-scoring fuera del
    // render. Acá solo leemos datos ya persistidos para que el lobby sea liviano y
    // no dispare escrituras/llamadas externas en cada visita.
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
