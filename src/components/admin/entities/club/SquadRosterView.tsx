'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Calendar,
    ChevronLeft,
    Download,
    ExternalLink,
    Filter,
    Plus,
    Search,
    Trash2,
    User,
} from 'lucide-react';
import { clsx } from 'clsx';
import { fetchPeopleByDivision, deletePersonFromClub, PersonWithRole } from '@/lib/services/personService';
import { Division } from '@/lib/services/divisionService';
import { PersonManagementModal } from './PersonManagementModal';
import { CSVImportModal } from './CSVImportModal';

interface Props {
    clubId: string;
    division: Division;
    onBack: () => void;
}

export function SquadRosterView({ clubId, division, onBack }: Props) {
    const [players, setPlayers] = useState<PersonWithRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isCSVModalOpen, setIsCSVModalOpen] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<PersonWithRole | null>(null);

    const loadPlayers = useCallback(async () => {
        setLoading(true);
        const data = await fetchPeopleByDivision(clubId, division.id);
        setPlayers(data.filter((person) => person.role === 'player'));
        setLoading(false);
    }, [clubId, division.id]);

    useEffect(() => {
        // The roster must be loaded as soon as the selected division changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadPlayers();
    }, [loadPlayers]);

    const handleRemovePlayer = async (personId: string, name: string) => {
        if (!confirm(`Eliminar a ${name} de este plantel?`)) return;

        const res = await deletePersonFromClub(clubId, personId, division.id);
        if (res.success) {
            setPlayers((prev) => prev.filter((person) => person.id !== personId));
        } else {
            alert('Error al eliminar: ' + res.error);
        }
    };

    const filteredPlayers = players.filter((person) =>
        `${person.first_name} ${person.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        person.position?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="squads-wrap">
            <header className="page-head">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-neutral-800 rounded transition-all"
                    >
                        <ChevronLeft className="w-5 h-5 text-neutral-400" />
                    </button>
                    <div>
                        <h1 className="!mb-1">PLANILLA: {division.name}</h1>
                        <p className="muted flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            Actualizado hace unos instantes - {players.length} jugadores registrados
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="btn gap-2" onClick={() => setIsCSVModalOpen(true)}>
                        <Download className="w-4 h-4" />
                        Importar Excel
                    </button>
                    <button
                        onClick={() => {
                            setEditingPlayer(null);
                            setIsAddModalOpen(true);
                        }}
                        className="btn btn-primary gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Registrar jugador
                    </button>
                </div>
            </header>

            <section className="panel">
                <div className="p-4 border-b border-neutral-800 bg-neutral-900/30 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1 search-wrapper">
                        <Search className="search-icon" />
                        <input
                            type="text"
                            placeholder="Filtrar por nombre o posicion..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="search"
                        />
                    </div>
                    <button className="btn gap-2 text-neutral-500">
                        <Filter className="w-4 h-4" />
                        Filtros avanzados
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800">
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Jugador</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Documento</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">F. Nacimiento</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Posicion</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Estado</th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-neutral-500 uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center">
                                        <div className="animate-spin h-6 w-6 border-b-2 border-blue-500 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredPlayers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-32 text-center text-neutral-600 space-y-4">
                                        <User className="w-16 h-16 opacity-10 mx-auto" />
                                        <p className="text-[14px] font-black uppercase tracking-[0.3em] opacity-30">Planilla vacia</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingPlayer(null);
                                                setIsAddModalOpen(true);
                                            }}
                                            className="btn btn-primary gap-2 mx-auto"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Registrar primer jugador
                                        </button>
                                    </td>
                                </tr>
                            ) : filteredPlayers.map((person) => (
                                <tr key={person.id} className="hover:bg-neutral-800/20 transition-colors group">
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {person.photo_url ? (
                                                    <img src={person.photo_url} alt={person.first_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-4 h-4 text-neutral-600" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-sm font-black text-white uppercase">
                                                    {person.first_name} {person.last_name}
                                                </div>
                                                <div className="text-[9px] text-neutral-600 font-mono">#{person.id.slice(0, 8)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-xs font-mono text-neutral-400">
                                        {person.id_number || <span className="text-neutral-700">-</span>}
                                    </td>
                                    <td className="px-4 py-4 text-xs font-mono text-neutral-400">
                                        {person.birth_date ? new Date(person.birth_date).toLocaleDateString() : <span className="text-neutral-700">-</span>}
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className={clsx(
                                            'chip',
                                            person.position ? 'chip-ok' : 'chip-draft'
                                        )}>
                                            {person.position || 'SIN POSICION'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="chip chip-ok">
                                            {person.status || 'active'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingPlayer(person);
                                                    setIsAddModalOpen(true);
                                                }}
                                                className="p-2 hover:bg-neutral-700 rounded transition-colors border border-neutral-800"
                                                title="Editar jugador"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                                            </button>
                                            <button
                                                onClick={() => handleRemovePlayer(person.id, `${person.first_name} ${person.last_name}`)}
                                                className="p-2 hover:bg-red-500/10 hover:border-red-500/50 rounded transition-colors border border-neutral-800 group/trash"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 text-neutral-400 group-hover/trash:text-red-500" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <PersonManagementModal
                clubId={clubId}
                divisions={[division]}
                isOpen={isAddModalOpen}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setEditingPlayer(null);
                }}
                onSuccess={loadPlayers}
                lockDivisionId={division.id}
                initialMode="player"
                person={editingPlayer}
            />

            <CSVImportModal
                clubId={clubId}
                divisions={[division]}
                isOpen={isCSVModalOpen}
                onClose={() => setIsCSVModalOpen(false)}
                onSuccess={loadPlayers}
                fixedDivisionId={division.id}
            />
        </div>
    );
}
