'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { EntitySelect, EntityOption } from '../fields/EntitySelect';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';

type MatchRow = Database['public']['Tables']['matches']['Row'];

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const fetchClubs = async (q: string, limit: number): Promise<EntityOption[]> => {
    const res = await fetch(`/api/catalog/clubs?search=${encodeURIComponent(q)}&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data;
};

export function MatchEditor({ data }: { data: MatchRow }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    // Format default datetime for input type="datetime-local"
    let defaultDateTime = '';
    if (data.date_time) {
        try {
            const d = new Date(data.date_time);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            defaultDateTime = d.toISOString().slice(0, 16);
        } catch (e) { }
    }

    const [formState, setFormState] = useState({
        date_time: defaultDateTime,
        home_club_id: data.home_club_id || null,
        away_club_id: data.away_club_id || null,
        venue: data.venue || '',
        status: data.status || 'scheduled'
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDirty, setIsDirty] = useState(false);

    useLeaveConfirm(isDirty);

    const updateField = (key: string, value: any) => {
        setFormState(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
        if (errors[key]) {
            setErrors(prev => ({ ...prev, [key]: '' }));
        }
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        // Validate
        const newErrors: Record<string, string> = {};
        if (formState.home_club_id && !UUID_REGEX.test(formState.home_club_id)) {
            newErrors.home_club_id = 'Debe ser un UUID válido';
        }
        if (formState.away_club_id && !UUID_REGEX.test(formState.away_club_id)) {
            newErrors.away_club_id = 'Debe ser un UUID válido';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSaving(true);
        setMessage('');

        const updates = {
            date_time: formState.date_time ? new Date(formState.date_time).toISOString() : data.date_time,
            home_club_id: formState.home_club_id || null,
            away_club_id: formState.away_club_id || null,
            venue: formState.venue,
            status: formState.status,
        };

        try {
            await updateEntity('match', data.id, updates);
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
                <h2 className="text-xl font-semibold text-foreground">Editar Partido</h2>
                {isDirty && <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 rounded-full font-medium">Unsaved changes</span>}
            </div>

            {message && (
                <div className={`p-4 rounded-lg text-sm font-medium ${message.startsWith('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Fecha y Hora</label>
                    <input
                        type="datetime-local"
                        value={formState.date_time}
                        onChange={(e) => updateField('date_time', e.target.value)}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <EntitySelect
                    label="Club Local (home_club_id)"
                    value={formState.home_club_id}
                    onChange={(val) => updateField('home_club_id', val)}
                    fetcher={fetchClubs}
                    placeholder="Buscar club local..."
                    allowNull
                    error={errors.home_club_id}
                />

                <EntitySelect
                    label="Club Visitante (away_club_id)"
                    value={formState.away_club_id}
                    onChange={(val) => updateField('away_club_id', val)}
                    fetcher={fetchClubs}
                    placeholder="Buscar club visitante..."
                    allowNull
                    error={errors.away_club_id}
                />

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Estadio / Sede</label>
                    <input
                        type="text"
                        value={formState.venue}
                        onChange={(e) => updateField('venue', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Estado</label>
                    <select
                        value={formState.status}
                        onChange={(e) => updateField('status', e.target.value)}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    >
                        <option value="scheduled">Scheduled</option>
                        <option value="live">Live</option>
                        <option value="final">Final</option>
                        <option value="postponed">Postponed</option>
                        <option value="suspended">Suspended</option>
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
