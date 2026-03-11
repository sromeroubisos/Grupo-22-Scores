'use client';

import { useEffect, useState, useMemo } from 'react';
import { Search, Plus, Trash2, User, Shield } from 'lucide-react';
import { fetchPeopleByClub, deletePersonFromClub, PersonWithRole } from '@/lib/services/personService';
import { PersonManagementModal } from './PersonManagementModal';
import './flash-club-ui.css';

export function ClubStaffTab({ clubId }: { clubId: string }) {
    const [people, setPeople] = useState<PersonWithRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const data = await fetchPeopleByClub(clubId);
        setPeople(data.filter(p => p.role === 'staff' || p.role === 'admin'));
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [clubId]);

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
            p.position?.toLowerCase().includes(term)
        );
    }, [people, search]);

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
                                        {p.position || 'STAFF'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-6">
                                <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/50 rounded-lg">
                                    <span className="text-[9px] text-neutral-500 font-bold uppercase">Estado</span>
                                    <span className="text-[9px] text-green-500 font-black uppercase">Activo</span>
                                </div>
                                <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/50 rounded-lg">
                                    <span className="text-[9px] text-neutral-500 font-bold uppercase">ID Doc</span>
                                    <span className="text-[9px] text-neutral-300 font-mono">{p.id_number || '-'}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button className="btn flex-1 !h-10 text-[10px] gap-2" onClick={() => alert('Próximamente')}>
                                    <Shield className="w-3.5 h-3.5 opacity-40" />
                                    Permisos
                                </button>
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
