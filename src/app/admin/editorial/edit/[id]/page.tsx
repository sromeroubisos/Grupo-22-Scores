import EditorialPage from '../../EditorialPage';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EditNewsPage({ params }: { params: { id: string } }) {
    const supabase = await createClient();
    const { data: news, error } = await supabase
        .from('news')
        .select('*')
        .eq('id', params.id)
        .single();

    if (error || !news) {
        notFound();
    }

    return <EditorialPage initialData={news} />;
}
