import { resolveEntity, EntityType } from '@/lib/services/entityResolver';

interface ManagePageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ type?: string }>;
}

export default async function ManageEntityPage({ params, searchParams }: ManagePageProps) {
    const { id } = await params;
    const { type } = await searchParams;

    const result = await resolveEntity({
        id,
        type: type as EntityType | undefined
    });

    if (result.kind === 'not_found') {
        return (
            <div className="p-8 text-center bg-background min-h-[50vh] flex flex-col justify-center items-center">
                <h1 className="text-2xl font-bold mb-4">Entidad no encontrada</h1>
                <p className="text-system-secondary">No se encontró ninguna entidad con el ID o el Tipo seleccionado.</p>
            </div>
        );
    }

    if (result.kind === 'forbidden') {
        return (
            <div className="p-8 text-center bg-background min-h-[50vh] flex flex-col justify-center items-center">
                <h1 className="text-2xl font-bold text-red-500 mb-4">Sin permisos</h1>
                <p className="text-system-secondary">No tienes permiso para ver o editar esta entidad.</p>
            </div>
        );
    }

    if (result.kind === 'error') {
        return (
            <div className="p-8 text-center bg-background min-h-[50vh] flex flex-col justify-center items-center">
                <h1 className="text-2xl font-bold text-red-500 mb-4">Error cargando entidad</h1>
                <p className="text-system-secondary">{result.message}</p>
            </div>
        );
    }

    // ok
    const { entityType } = result;

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold capitalize">Manage {entityType}</h1>
                <p className="text-system-secondary mt-1">ID: {id}</p>
                <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-surface border border-divider">
                    Source: {result.source.toUpperCase()}
                </div>
            </header>

            <section className="bg-surface border border-divider rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-foreground">Editor Genérico (Stub)</h2>
                <div className="p-6 bg-background rounded-lg border border-divider border-dashed flex items-center justify-center">
                    <p className="text-system-secondary">
                        Aquí se renderizará el formulario de administración de <strong>{entityType}</strong>.
                    </p>
                </div>
            </section>
        </div>
    );
}
