import { redirect } from 'next/navigation';
import ProdeWorldCupScreen from '@/components/prode/ProdeWorldCupScreen';
import { createClient } from '@/lib/supabase/server';
import { getProdeWorldCupScreenData } from '@/lib/server/prodeWorldCupScreenData';

export default async function ProdeMundialPage() {
    const supabase = await createClient();
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    const data = await getProdeWorldCupScreenData(authUser?.id ?? null);

    // Si todavía no hay un prode del Mundial publicado, mandamos al lobby a elegir.
    if (!data) {
        redirect('/prode');
    }

    return <ProdeWorldCupScreen mode="page" {...data} />;
}
