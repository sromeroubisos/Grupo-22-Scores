import { redirect } from 'next/navigation';

import { canManageNewsServer } from '@/lib/auth/newsAccess';
import NewsEditorClient from '../NewsEditorClient';

export default async function NuevaNoticiaPage() {
    if (!(await canManageNewsServer())) {
        redirect('/noticias');
    }

    return <NewsEditorClient />;
}
