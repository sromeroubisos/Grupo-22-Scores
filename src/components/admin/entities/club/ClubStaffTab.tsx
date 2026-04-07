'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Search, Plus, Trash2, User, AlertCircle } from 'lucide-react';
import { fetchPeopleByClub, deletePersonFromClub, PersonWithRole } from '@/lib/services/personService';
import { PersonManagementModal } from './PersonManagementModal';
import './flash-club-ui.css';

const STAFF_ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    staff: 'Staff',
    head_coach: 'Entrenador principal',
    assistant_coach: 'Entrenador asistente',
    physical_trainer: 'Preparador fisico',
    physio: 'Kinesiologo',
    doctor: 'Medico',
    manager: 'Manager',
    video_analyst: 'Analista de video',
};

function isStaffRole(role?: string | null) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized !== '' && normalized !== 'player' && normalized !== 'jugador';
}

function formatStaffRole(role?: string | null) {
    const normalized = String(role || '').trim().toLowerCase();
    return STAFF_ROLE_LABELS[normalized] || normalized.replace(/_/g, ' ') || 'Staff';
}

export function ClubStaffTab({ clubId }: { clubId: string }) {
    const [people, setPeople] = useState<PersonWithRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await fetchPeopleByClub(clubId);
            setPeople(data.filter((person) => isStaffRole(person.role)));
        } catch (nextError) {
            setPeople([]);
            setError(nextError instanceof Error ? nextError.message : 'No se pudo cargar el staff del club.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void loadData(); }, [loadData]);

    const handleRemove = async (personId: string, name: string) => {
        if (!confirm(`¿Eliminar a ${name} del staff?`)) return;
        const res = await deletePersonFromClub(clubId, personId);
        if (res.success) {
            setPeople(prev => prev.filter(p => p.id !== personId));
        } else {
            alert('Error: ' + res.error);
        }
    };

    const filteredRows = useMemo(() => {
        const term = search.toLowerCase();
        return people.filter(p =>
            `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
            p.position?.toLowerCase().includes(term) ||
            formatStaffRole(p.role).toLowerCase().includes(term)
        );
    }, [people, search]);

    const roleCounts = useMemo(() => {
        return people.reduce<Record<string, number>>((acc, person) => {
            const label = formatStaffRole(person.role);
            acc[label] = (acc[label] || 0) + 1;
            return acc;
        }, {});
    }, [people]);

    return (
        <div className="squads-wrap">
            {/* Page Header */}
            <header className="page-head">
                <div>
                    <h1>Cuerpo Técnico y Staff</h1>
                    <p className="muted">Personal administrativo y técnico del club</p>
                </div>
            </header>

            {/* Main Panel */}
            <section className="panel">
                {/* Panel Top Bar */}
                <div className="panel-top">
                    <div className="panel-title">
                        <h2>Staff</h2>
                        <span className="chip-count">{people.length}</span>
                    </div>

                    <div className="panel-actions">
                        <div className="relative search-wrapper">
                            <Search className="search-icon" />
                            <input
                                type="text"
                                className="search"
                                placeholder="Buscar por nombre o rol..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="btn btn-primary"
                        >
                            <Plus className="w-4 h-4" />
                            Añadir staff
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="m-4 p-4 rounded border border-red-500/30 bg-red-500/10 text-red-200 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                {!loading && people.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pt-4">
                        {Object.entries(roleCounts).map(([role, count]) => (
                            <span key={role} className="chip chip-draft">
                                {role}: {count}
                            </span>
                        ))}
                    </div>
                )}

                {/* Staff Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                    {!loading && filteredRows.map((p) => (
                        <div key={p.id} className="card group hover:border-amber-500/30 transition-all">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {p.photo_url ? (
                                        <img src={p.photo_url} alt={p.first_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-6 h-6 text-neutral-600" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-black text-white uppercase truncate">
                                        {p.first_name} {p.last_name}
                                    </h3>
                                    <p className="text-[10px] text-amber-500 font-mono font-black uppercase tracking-widest">
                                        {p.position || formatStaffRole(p.role)}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-6">
                                <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/50 rounded-lg">
                                    <span className="text-[9px] text-neutral-500 font-bold uppercase">Estado</span>
                                    <span className="text-[9px] text-green-500 font-black uppercase">{p.status || 'active'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/50 rounded-lg">
                                    <span className="text-[9px] text-neutral-500 font-bold uppercase">Rol</span>
                                    <span className="text-[9px] text-neutral-300 font-mono">{formatStaffRole(p.role)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/50 rounded-lg">
                                    <span className="text-[9px] text-neutral-500 font-bold uppercase">Documento</span>
                                    <span className="text-[9px] text-neutral-300 font-mono">{p.id_number || '-'}</span>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => handleRemove(p.id, `${p.first_name} ${p.last_name}`)}
                                    className="btn btn-danger !w-10 !h-10 !p-0 justify-center"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {loading && [1, 2, 3].map(i => (
                        <div key={i} className="card animate-pulse h-[220px] bg-neutral-900/50 border-neutral-800" />
                    ))}
                </div>

                {/* Empty State */}
                {!loading && filteredRows.length === 0 && (
                    <div className="empty-state">
                        <User className="empty-icon" />
                        <p className="empty-text">
                            {search ? 'No se encontró staff' : 'Aún no hay staff registrado'}
                        </p>
                        {!search && (
                            <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
                                <Plus className="w-4 h-4" />
                                Añadir primer staff
                            </button>
                        )}
                    </div>
                )}
            </section>

            <PersonManagementModal
                clubId={clubId}
                divisions={[]}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={loadData}
                initialMode="staff"
            />
        </div>
    );
}
