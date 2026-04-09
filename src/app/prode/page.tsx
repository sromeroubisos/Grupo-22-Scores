import ProdeLobby from '@/components/prode/ProdeLobby';
import { listPublicProdeCompetitions, listPublicProdeUserTotals } from '@/lib/server/prodeCompetitions';

export default async function ProdePage() {
    const [
        { schemaReady: competitionsReady, data: competitions },
        { schemaReady: totalsReady, data: totals },
    ] = await Promise.all([
        listPublicProdeCompetitions(),
        listPublicProdeUserTotals(),
    ]);

    return (
        <ProdeLobby
            competitions={competitions}
            totals={totals}
            schemaReady={competitionsReady && totalsReady}
        />
    );
}
