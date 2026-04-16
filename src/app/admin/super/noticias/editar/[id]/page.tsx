import { redirect } from 'next/navigation';

import { canManageNewsServer } from '@/lib/auth/newsAccess';
import NewsEditorClient from '../../NewsEditorClient';

type EditarNoticiaPageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function EditarNoticiaPage({ params }: EditarNoticiaPageProps) {
    if (!(await canManageNewsServer())) {
        redirect('/noticias');
    }

    const { id } = await params;

    return <NewsEditorClient newsId={id} />;
}
