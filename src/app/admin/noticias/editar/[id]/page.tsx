import NewsEditorClient from '@/app/admin/super/noticias/NewsEditorClient';

type EditarNoticiaPageProps = {
    params: Promise<{
        id: string;
    }>;
};

// La guarda vive en el layout de /admin/noticias.
export default async function EditarNoticiaPage({ params }: EditarNoticiaPageProps) {
    const { id } = await params;
    return <NewsEditorClient newsId={id} />;
}
