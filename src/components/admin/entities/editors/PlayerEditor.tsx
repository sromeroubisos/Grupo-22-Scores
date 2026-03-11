'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEntity, updateEntity } from '@/app/admin/entities/actions';
import { EntitySelect, EntityOption } from '../fields/EntitySelect';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { useAdminConsole } from '@/app/admin/AdminContext';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const fetchClubs = async (q: string, limit: number): Promise<EntityOption[]> => {
    const res = await fetch(`/api/catalog/clubs?search=${encodeURIComponent(q)}&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data;
};

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

export function PlayerEditor({ data, id }: { data: PlayerData; id: string }) {
    const isCreate = id === 'new';
    const router = useRouter();
    const { refresh } = useAdminConsole();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const [formState, setFormState] = useState({
        name: data.name || data.displayName || '',
        club_id: data.club_id || data.teamId || '',
        position: data.position || '',
        nationality: data.nationality || ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDirty, setIsDirty] = useState(false);

    useLeaveConfirm(isDirty);

    const updateField = (key: string, value: string | null) => {
        setFormState(prev => ({ ...prev, [key]: value || '' }));
        setIsDirty(true);
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const newErrors: Record<string, string> = {};
        // Club IDs are TEXT (slugs/uuids both allowed in backend), removing client-side UUID enforcement.
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSaving(true);
        setMessage('');

        const updates = {
            name: formState.name,
            club_id: formState.club_id || null,
            position: formState.position,
            nationality: formState.nationality,
        };

        try {
            if (isCreate) {
                const result = await createEntity('player', updates);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[CREATE_RESULT]', { type: 'player', id: result.id });
                }
                setMessage('Jugador creado exitosamente.');
                setIsDirty(false);
                refresh();
                router.replace(`/admin/entities/${result.id}/manage`);
            } else {
                await updateEntity('player', id, updates);
                setMessage('Guardado exitosamente.');
                setIsDirty(false);
                refresh();
                router.refresh();
            }
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
                <h2 className="text-xl font-semibold text-foreground">
                    {isCreate ? 'Crear Nuevo Jugador' : 'Editar Jugador'}
                </h2>
                {isDirty && <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 rounded-full font-medium">Unsaved changes</span>}
            </div>

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
                        value={formState.name}
                        onChange={e => updateField('name', e.target.value)}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <EntitySelect
                    label="Club (ID)"
                    value={formState.club_id}
                    onChange={(val) => updateField('club_id', val)}
                    fetcher={fetchClubs}
                    placeholder="Buscar club..."
                    allowNull
                    error={errors.club_id}
                />

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Posición</label>
                    <input
                        type="text"
                        value={formState.position}
                        onChange={e => updateField('position', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Nacionalidad</label>
                    <input
                        type="text"
                        value={formState.nationality}
                        onChange={e => updateField('nationality', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-divider gap-3">
                <button
                    type="submit"
                    disabled={isSaving || (!isCreate && !isDirty)}
                    className="px-6 py-2 bg-accent-blue text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                    {isSaving ? 'Guardando...' : (isCreate ? 'Crear Jugador' : 'Guardar Cambios')}
                </button>
            </div>
        </form>
    );
}
