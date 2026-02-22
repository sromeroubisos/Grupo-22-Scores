'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function ClubEditor({ data }: { data: ClubRow }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const [formState, setFormState] = useState({
        name: data.name || '',
        city: data.city || '',
        union_id: data.union_id || '',
        logo_url: data.logo_url || ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDirty, setIsDirty] = useState(false);

    useLeaveConfirm(isDirty);

    const updateField = (key: string, value: string) => {
        setFormState(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const newErrors: Record<string, string> = {};
        if (formState.union_id && !UUID_REGEX.test(formState.union_id)) {
            newErrors.union_id = 'Debe ser un UUID válido';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSaving(true);
        setMessage('');

        const updates = {
            name: formState.name,
            city: formState.city || null,
            union_id: formState.union_id || null,
            logo_url: formState.logo_url || null,
        };

        try {
            await updateEntity('club', data.id, updates);
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
                <h2 className="text-xl font-semibold text-foreground">Editar Club</h2>
                {isDirty && <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 rounded-full font-medium">Unsaved changes</span>}
            </div>

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
                        value={formState.name}
                        onChange={e => updateField('name', e.target.value)}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Ciudad</label>
                    <input
                        type="text"
                        value={formState.city}
                        onChange={e => updateField('city', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Union ID</label>
                    <input
                        type="text"
                        value={formState.union_id}
                        onChange={e => updateField('union_id', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue font-mono text-sm"
                        placeholder="UUID (e.g. 123e4567-e89b-12d3...)"
                    />
                    {errors.union_id && <p className="text-xs font-medium text-red-500 mt-1">{errors.union_id}</p>}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Logo URL</label>
                    <input
                        type="url"
                        value={formState.logo_url}
                        onChange={e => updateField('logo_url', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
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
