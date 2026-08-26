import { redirect } from 'next/navigation';

type EditarNoticiaPageProps = {
    params: Promise<{
        id: string;
    }>;
};

// El editor vive ahora en /admin/noticias. Los links viejos siguen andando.
export default async function EditarNoticiaLegacyPage({ params }: EditarNoticiaPageProps) {
    const { id } = await params;
    redirect(`/admin/noticias/editar/${encodeURIComponent(id)}`);
}
