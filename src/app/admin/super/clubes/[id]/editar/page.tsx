import { redirect } from 'next/navigation';

/** Link viejo: la edición de un club es el gestor unificado. */
export default async function EditClubRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/admin/entities/${encodeURIComponent(id)}/manage?type=club`);
}
