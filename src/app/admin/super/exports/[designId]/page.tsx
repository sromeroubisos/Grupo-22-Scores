import { notFound } from 'next/navigation';
import ExportDesignDetailPage from '../ExportDesignDetailPage';
import { getAdminExportDesigns } from '@/lib/exports/admin';

export default async function ExportDesignDetailRoute({
    params,
}: {
    params: Promise<{ designId: string }>;
}) {
    const { designId } = await params;
    const designs = await getAdminExportDesigns();
    const design = designs.find((item) => item.slug === designId) ?? null;

    if (!design) {
        notFound();
    }

    return <ExportDesignDetailPage design={design} />;
}
