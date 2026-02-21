import { resolveEntity, EntityType } from '@/lib/services/entityResolver';
import { EntityHeader } from '@/components/admin/entities/EntityHeader';
import { TournamentEditor } from '@/components/admin/entities/editors/TournamentEditor';
import { ClubEditor } from '@/components/admin/entities/editors/ClubEditor';
import { MatchEditor } from '@/components/admin/entities/editors/MatchEditor';
import { PlayerEditor, PlayerData } from '@/components/admin/entities/editors/PlayerEditor';
import { Database } from '@/lib/database.types';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type ClubRow = Database['public']['Tables']['clubs']['Row'];
type MatchRow = Database['public']['Tables']['matches']['Row'];

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
            <EntityHeader entity={result} />

            <section className="bg-surface border border-divider rounded-xl p-6 shadow-sm">
                {entityType === 'tournament' && <TournamentEditor data={result.data as TournamentRow} />}
                {entityType === 'club' && <ClubEditor data={result.data as ClubRow} />}
                {entityType === 'match' && <MatchEditor data={result.data as MatchRow} />}
                {entityType === 'player' && <PlayerEditor data={result.data as PlayerData} />}
            </section>
        </div>
    );
}
