'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';

type MatchRow = Database['public']['Tables']['matches']['Row'];

export function MatchEditor({ data }: { data: MatchRow }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSaving(true);
        setMessage('');

        const formData = new FormData(e.currentTarget);

        // Ensure datetime is properly formatted if needed
        const dateStr = formData.get('date_time') as string;
        const updates = {
            date_time: dateStr ? new Date(dateStr).toISOString() : data.date_time,
            home_club_id: formData.get('home_club_id') as string,
            away_club_id: formData.get('away_club_id') as string,
            venue: formData.get('venue') as string,
            status: formData.get('status') as string,
        };

        try {
            await updateEntity('match', data.id, updates);
            setMessage('Guardado exitosamente.');
            router.refresh();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setMessage('Error: ' + errorMessage);
        } finally {
            setIsSaving(false);
        }
    }

    // Format default datetime for input type="datetime-local"
    let defaultDateTime = '';
    if (data.date_time) {
        try {
            const d = new Date(data.date_time);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            defaultDateTime = d.toISOString().slice(0, 16);
        } catch (e) {
            // ignore parsing errors
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Editar Partido</h2>

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
                        name="date_time"
                        defaultValue={defaultDateTime}
                        required
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Club Local (ID)</label>
                    <input
                        type="text"
                        name="home_club_id"
                        defaultValue={data.home_club_id || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue font-mono text-sm"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Club Visitante (ID)</label>
                    <input
                        type="text"
                        name="away_club_id"
                        defaultValue={data.away_club_id || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue font-mono text-sm"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Estadio / Sede</label>
                    <input
                        type="text"
                        name="venue"
                        defaultValue={data.venue || ''}
                        className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-system-secondary">Estado</label>
                    <select
                        name="status"
                        defaultValue={data.status || 'scheduled'}
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
