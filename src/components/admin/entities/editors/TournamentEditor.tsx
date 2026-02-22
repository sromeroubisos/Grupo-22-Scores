'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function TournamentEditor({ data }: { data: TournamentRow }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [formState, setFormState] = useState({
        name: data.name || '',
        season_id: data.season_id || '',
        region: data.region || '',
        status: data.status || 'draft'
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDirty, setIsDirty] = useState(false);

    useLeaveConfirm(isDirty);

    const updateField = (key: string, value: any) => {
        setFormState(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const newErrors: Record<string, string> = {};
        if (formState.season_id && !UUID_REGEX.test(formState.season_id)) {
            newErrors.season_id = 'Debe ser un UUID válido';
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSaving(true);
        setMessage('');

        const updates = {
            name: formState.name,
            season_id: formState.season_id || null,
            region: formState.region || null,
            status: formState.status,
        };

        try {
            await updateEntity('tournament', data.id, updates);
            setMessage('Guardado exitosamente.');
            setIsDirty(false);
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
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-foreground">Editar Torneo</h2>
                {isDirty && <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 rounded-full font-medium">Unsaved changes</span>}
            </div>

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
                        value={formState.name}
                        onChange={e => updateField('name', e.target.value)}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Temporada (Season)</label>
                    <input
                        type="text"
                        value={formState.season_id}
                        onChange={e => updateField('season_id', e.target.value)}
                        placeholder="Dejar vacío si no aplica..."
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue font-mono text-sm"
                    />
                    {errors.season_id && <p className="text-xs font-medium text-red-500 mt-1">{errors.season_id}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Región</label>
                    <input
                        type="text"
                        value={formState.region}
                        onChange={e => updateField('region', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Estado</label>
                    <select
                        value={formState.status}
                        onChange={e => updateField('status', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-divider gap-3">
                <button
                    type="submit"
                    disabled={isSaving || !isDirty}
                    className="px-6 py-2 bg-accent-blue text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>
        </form>
    );
}
