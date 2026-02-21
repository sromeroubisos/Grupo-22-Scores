'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

export function ClubEditor({ data }: { data: ClubRow }) {
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
            city: formData.get('city') as string,
            union_id: formData.get('union_id') as string,
            logo_url: formData.get('logo_url') as string,
        };

        try {
            await updateEntity('club', data.id, updates);
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
            <h2 className="text-xl font-semibold mb-4 text-foreground">Editar Club</h2>

            {message && (
                <div className={`p-4 rounded-lg text-sm font-medium ${message.startsWith('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Nombre del Club</label>
                    <input
                        type="text"
                        name="name"
                        defaultValue={data.name || ''}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Ciudad</label>
                    <input
                        type="text"
                        name="city"
                        defaultValue={data.city || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Union ID</label>
                    <input
                        type="text"
                        name="union_id"
                        defaultValue={data.union_id || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue font-mono text-sm"
                        placeholder="ej: uar, urba..."
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Logo URL</label>
                    <input
                        type="url"
                        name="logo_url"
                        defaultValue={data.logo_url || ''}
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
