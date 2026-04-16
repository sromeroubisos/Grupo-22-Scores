import ExportsCatalogPage from './ExportsCatalogPage';
import { getAdminExportDesigns } from '@/lib/exports/admin';

export default async function SuperExportsPage() {
    const designs = await getAdminExportDesigns();

    return <ExportsCatalogPage designs={designs} />;
}
