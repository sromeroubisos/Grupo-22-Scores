import { redirect } from 'next/navigation';

/** Link viejo: la ficha de un club en el super admin es el gestor unificado. */
export default async function SuperadminClubPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/admin/entities/${encodeURIComponent(id)}/manage?type=club`);
}
