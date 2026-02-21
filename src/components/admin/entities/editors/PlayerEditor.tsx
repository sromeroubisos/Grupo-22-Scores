'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';

export interface PlayerData {
    id: string;
    name?: string;
    displayName?: string;
    club_id?: string;
    teamId?: string;
    position?: string;
    nationality?: string;
    [key: string]: unknown;
}

export function PlayerEditor({ data }: { data: PlayerData }) {
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
            club_id: formData.get('club_id') as string,
            position: formData.get('position') as string,
            nationality: formData.get('nationality') as string,
        };

        try {
            await updateEntity('player', data.id, updates);
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
            <h2 className="text-xl font-semibold mb-4 text-foreground">Editar Jugador</h2>

            {message && (
                <div className={`p-4 rounded-lg text-sm font-medium ${message.startsWith('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Nombre</label>
                    <input
                        type="text"
                        name="name"
                        defaultValue={data.name || data.displayName || ''}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Club (ID)</label>
                    <input
                        type="text"
                        name="club_id"
                        defaultValue={data.club_id || data.teamId || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue font-mono text-sm"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Posición</label>
                    <input
                        type="text"
                        name="position"
                        defaultValue={data.position || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Nacionalidad</label>
                    <input
                        type="text"
                        name="nationality"
                        defaultValue={data.nationality || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
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
