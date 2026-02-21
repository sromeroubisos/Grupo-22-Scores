'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

export function TournamentEditor({ data }: { data: TournamentRow }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSaving(true);
        setMessage('');

        const formData = new FormData(e.currentTarget);
        const updates = {
            name: formData.get('name') as string,
            season_id: formData.get('season_id') as string,
            region: formData.get('region') as string,
            status: formData.get('status') as string,
        };

        try {
            await updateEntity('tournament', data.id, updates);
            setMessage('Guardado exitosamente.');
            router.refresh();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setMessage('Error: ' + errorMessage);
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Editar Torneo</h2>

            {message && (
                <div className={`p-4 rounded-lg text-sm font-medium ${message.startsWith('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Nombre del Torneo</label>
                    <input
                        type="text"
                        name="name"
                        defaultValue={data.name || ''}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Temporada (Season)</label>
                    <input
                        type="text"
                        name="season_id"
                        defaultValue={data.season_id || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Región</label>
                    <input
                        type="text"
                        name="region"
                        defaultValue={data.region || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Estado</label>
                    <select
                        name="status"
                        defaultValue={data.status || 'draft'}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-divider">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-accent-blue text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>
        </form>
    );
}
