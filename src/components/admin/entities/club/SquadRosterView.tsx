'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    ChevronLeft,
    Search,
    Download,
    Plus,
    Trash2,
    User,
    Calendar,
    Fingerprint,
    Trophy,
    ExternalLink,
    Filter,
    Zap
} from 'lucide-react';
import { fetchPeopleByDivision, deletePersonFromClub, PersonWithRole, addPersonToClub } from '@/lib/services/personService';
import { Division } from '@/lib/services/divisionService';
import { PersonManagementModal } from './PersonManagementModal';
import { CSVImportModal } from './CSVImportModal';
import { MOCK_PLAYERS, generateMockBirthDate } from '@/lib/utils/mockPlayers';
import { clsx } from 'clsx';

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
    const [loadingMock, setLoadingMock] = useState(false);

    const loadPlayers = useCallback(async () => {
        setLoading(true);
        const data = await fetchPeopleByDivision(clubId, division.id);
        setPlayers(data.filter(p => p.role === 'player'));
        setLoading(false);
    }, [clubId, division.id]);

    useEffect(() => {
        loadPlayers();
    }, [loadPlayers]);

    const handleRemovePlayer = async (personId: string, name: string) => {
        if (!confirm(`¿Eliminar a ${name} de este plantel?`)) return;
        const res = await deletePersonFromClub(clubId, personId, division.id);
        if (res.success) {
            setPlayers(prev => prev.filter(p => p.id !== personId));
        } else {
            alert('Error al eliminar: ' + res.error);
        }
    };

    const handleLoadMockData = async () => {
        if (!confirm(`¿Cargar ${MOCK_PLAYERS.length} jugadores de prueba en ${division.name}?`)) return;

        setLoadingMock(true);
        let successCount = 0;
        let errorCount = 0;

        for (const player of MOCK_PLAYERS) {
            const res = await addPersonToClub(clubId, {
                first_name: player.first_name,
                last_name: player.last_name,
                birth_date: generateMockBirthDate(),
                position: player.position,
                weight: player.weight,
                height: player.height,
                role: 'player',
                division_id: division.id,
                status: 'active'
            });

            if (res.success) {
                successCount++;
            } else {
                errorCount++;
            }
        }

        setLoadingMock(false);
        alert(`Carga completada:\n✓ ${successCount} jugadores agregados\n${errorCount > 0 ? `✗ ${errorCount} errores` : ''}`);
        loadPlayers();
    };

    const filteredPlayers = players.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        p.position?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="squads-wrap">
            {/* Header Section */}
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
                            Actualizado hace unos instantes • {players.length} JUGADORES REGISTRADOS
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        className="btn gap-2 !bg-amber-500/10 !border-amber-500/30 hover:!border-amber-500 !text-amber-500"
                        onClick={handleLoadMockData}
                        disabled={loadingMock}
                    >
                        <Zap className="w-4 h-4" />
                        {loadingMock ? 'Cargando...' : 'Mock Data'}
                    </button>
                    <button className="btn gap-2" onClick={() => setIsCSVModalOpen(true)}>
                        <Download className="w-4 h-4" />
                        Importar Excel
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="btn btn-primary gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Añadir a Planilla
                    </button>
                </div>
            </header>

            {/* Main Panel */}
            <section className="panel">
                {/* Search Bar */}
                <div className="p-4 border-b border-neutral-800 bg-neutral-900/30 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1 search-wrapper">
                        <Search className="search-icon" />
                        <input
                            type="text"
                            placeholder="Filtrar por nombre o posición..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="search"
                        />
                    </div>
                    <button className="btn gap-2 text-neutral-500">
                        <Filter className="w-4 h-4" />
                        Filtros Avanzados
                    </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800">
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Jugador</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Documento</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">F. Nacimiento</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-neutral-500 uppercase tracking-widest">Posición</th>
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
                                        <p className="text-[14px] font-black uppercase tracking-[0.3em] opacity-30">Planilla Vacía</p>
                                    </td>
                                </tr>
                            ) : filteredPlayers.map((p) => (
                                <tr key={p.id} className="hover:bg-neutral-800/20 transition-colors group">
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {p.photo_url ? (
                                                    <img src={p.photo_url} alt={p.first_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-4 h-4 text-neutral-600" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-sm font-black text-white uppercase">
                                                    {p.first_name} {p.last_name}
                                                </div>
                                                <div className="text-[9px] text-neutral-600 font-mono">#{p.id.slice(0, 8)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-xs font-mono text-neutral-400">
                                        {p.id_number || <span className="text-neutral-700">-</span>}
                                    </td>
                                    <td className="px-4 py-4 text-xs font-mono text-neutral-400">
                                        {p.birth_date ? new Date(p.birth_date).toLocaleDateString() : <span className="text-neutral-700">-</span>}
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className={clsx(
                                            "chip",
                                            p.position ? "chip-ok" : "chip-draft"
                                        )}>
                                            {p.position || 'SIN CARGO'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="chip chip-ok">
                                            BORRADOR
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 hover:bg-neutral-700 rounded transition-colors border border-neutral-800">
                                                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                                            </button>
                                            <button
                                                onClick={() => handleRemovePlayer(p.id, `${p.first_name} ${p.last_name}`)}
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
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={loadPlayers}
                lockDivisionId={division.id}
                initialMode="player"
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
