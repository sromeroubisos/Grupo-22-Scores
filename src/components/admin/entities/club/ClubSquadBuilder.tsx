'use client';

import { useState, useEffect } from 'react';
import { Database } from '@/lib/database.types';
import { clsx } from 'clsx';
import { Search, ChevronLeft, Calendar, Download, Settings, Loader2, Plus, Users, X } from 'lucide-react';
import { fetchPeopleByClub, PersonWithRole } from '@/lib/services/personService';
import { saveSquadAndPlayers } from '@/lib/services/divisionService';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubSquadBuilderProps {
    clubId: string;
    clubData?: ClubRow;
    onBack: () => void;
}

export function ClubSquadBuilder({ clubId, clubData, onBack }: ClubSquadBuilderProps) {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [squadName, setSquadName] = useState('Primera División');
    const [availablePlayers, setAvailablePlayers] = useState<PersonWithRole[]>([]);
    const [squadPlayers, setSquadPlayers] = useState<PersonWithRole[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState<PersonWithRole | null>(null);

    useEffect(() => {
        const loadPlayers = async () => {
            setLoading(true);
            const data = await fetchPeopleByClub(clubId);
            // We just care about players that are active or similar
            const players = data.filter(p => p.role?.toUpperCase() === 'PLAYER');
            setAvailablePlayers(players);
            setLoading(false);
        };
        loadPlayers();
    }, [clubId]);

    const handleAddPlayer = (player: PersonWithRole) => {
        if (!squadPlayers.find(p => p.id === player.id)) {
            setSquadPlayers([...squadPlayers, player]);
        }
    };

    const handleRemovePlayer = (playerId: string) => {
        setSquadPlayers(squadPlayers.filter(p => p.id !== playerId));
        if (selectedPlayer?.id === playerId) {
            setSelectedPlayer(null);
        }
    };

    const handleSaveSquad = async () => {
        if (!squadName.trim()) {
            alert("Por favor, ingrese un nombre para el plantel.");
            return;
        }
        setIsSaving(true);
        const playerIds = squadPlayers.map(p => p.id);
        const result = await saveSquadAndPlayers(clubId, squadName, playerIds);
        setIsSaving(false);

        if (result.success) {
            // Regresamos a la pestaña de planteles
            onBack();
        } else {
            console.error(result.error);
            alert("Ocurrió un error al guardar el plantel.");
        }
    };

    const getInitials = (firstName: string, lastName: string) => {
        let text = '';
        if (firstName) text += firstName[0];
        if (lastName) text += lastName[0];
        return text.toUpperCase() || 'P';
    };

    const filteredAvailable = availablePlayers.filter(p => !squadPlayers.find(sp => sp.id === p.id)).filter(p =>
        (p.full_name || p.first_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.position || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20 relative">
            <div className="fixed inset-0 pointer-events-none opacity-5 z-[9999] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
            {/* Header Contextual */}
            <header className="pb-4 pt-2 mb-4 border-b border-[rgba(255,255,255,0.08)] flex justify-between items-end gap-4 flex-wrap">
                <div className="flex flex-col gap-2">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-[var(--accent)] hover:text-white transition-colors uppercase tracking-widest text-[11px] font-mono group"
                    >
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Volver a Planteles
                    </button>
                    <div className="font-mono text-[11px] uppercase tracking-widest text-[#94a3b8]">Club • Equipos • Plantel</div>
                    <input
                        type="text"
                        value={squadName}
                        onChange={(e) => setSquadName(e.target.value)}
                        className="bg-transparent font-black text-3xl tracking-tighter text-[#f8fafc] leading-tight outline-none border-b border-transparent focus:border-[rgba(255,255,255,0.2)] transition-colors w-full sm:w-[500px]"
                        placeholder="Nombre del Plantel"
                    />
                    <p className="text-[14px] text-[#94a3b8] font-medium">Temporada 2026</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] text-[#f8fafc] text-[13px] font-bold rounded-lg hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.2)] hover:-translate-y-px transition-all">
                        <Calendar className="w-4 h-4" /> Historial
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] text-[#f8fafc] text-[13px] font-bold rounded-lg hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.2)] hover:-translate-y-px transition-all">
                        <Download className="w-4 h-4" /> Exportar
                    </button>
                    <button
                        onClick={handleSaveSquad}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2 bg-[#3b82f6] text-white text-[13px] font-bold rounded-lg hover:bg-[#2563eb] border-none shadow-[0_0_15px_rgba(59,130,246,0.2)] animate-pulse transition-all disabled:opacity-50 disabled:animate-none"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar Plantel'}
                    </button>
                    <button className="flex items-center justify-center p-2.5 bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] text-[#f8fafc] rounded-lg hover:bg-[rgba(255,255,255,0.03)] transition-all">
                        <Settings className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </header>

            {/* Metrics */}
            <section className="bg-[rgba(255,255,255,0.02)] backdrop-blur-md border border-[rgba(255,255,255,0.08)] rounded-xl p-4 flex flex-wrap justify-around items-center gap-4 mb-4">
                <div className="text-center">
                    <span className="block text-[10px] uppercase text-[#94a3b8] tracking-widest mb-1">Jugadores</span>
                    <span className="block font-mono text-[18px] font-bold text-[#f8fafc]">{squadPlayers.length} / 40</span>
                </div>
                <div className="w-px h-8 bg-[rgba(255,255,255,0.08)] hidden md:block"></div>
                <div className="text-center">
                    <span className="block text-[10px] uppercase text-[#94a3b8] tracking-widest mb-1">Forwards</span>
                    <span className="block font-mono text-[18px] font-bold text-[#f59e0b]">0</span>
                </div>
                <div className="w-px h-8 bg-[rgba(255,255,255,0.08)] hidden md:block"></div>
                <div className="text-center">
                    <span className="block text-[10px] uppercase text-[#94a3b8] tracking-widest mb-1">Backs</span>
                    <span className="block font-mono text-[18px] font-bold text-[#10b981]">0</span>
                </div>
                <div className="w-px h-8 bg-[rgba(255,255,255,0.08)] hidden md:block"></div>
                <div className="text-center">
                    <span className="block text-[10px] uppercase text-[#94a3b8] tracking-widest mb-1">Prom. Edad</span>
                    <span className="block font-mono text-[18px] font-bold text-[#f8fafc]">-</span>
                </div>
                <div className="w-px h-8 bg-[rgba(255,255,255,0.08)] hidden md:block"></div>
                <div className="text-center">
                    <span className="block text-[10px] uppercase text-[#94a3b8] tracking-widest mb-1">Bajas</span>
                    <span className="block font-mono text-[18px] font-bold text-[#ef4444]">0</span>
                </div>
            </section>

            {/* CSS grid for the 3 columns Layout A, B, C */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_1.1fr] xl:grid-cols-[320px_1fr_340px] gap-4 min-h-[600px] items-stretch">

                {/* Column A: Disponibles */}
                <aside className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] rounded-2xl flex flex-col overflow-hidden relative">
                    <div className="p-5 border-b border-[rgba(255,255,255,0.08)] bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                        <h2 className="font-bold text-[14px] uppercase tracking-widest text-[#f8fafc] flex justify-between items-center">
                            Disponibles Club <Search className="w-4 h-4 text-[#94a3b8]" />
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <div className="mb-4">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#050505] border border-[rgba(255,255,255,0.08)] p-2.5 rounded-lg text-white text-[13px] outline-none focus:border-[#3b82f6] transition-colors"
                                placeholder="Buscar jugador o posición..."
                            />
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-4">
                                <Loader2 className="w-6 h-6 animate-spin text-[#3b82f6]" />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredAvailable.map((p) => {
                                    const age = p.birth_date ? Math.floor((new Date().getTime() - new Date(p.birth_date).getTime()) / 3.15576e+10) : '?';
                                    return (
                                        <div key={p.id}
                                            onClick={() => setSelectedPlayer(p)}
                                            className={clsx("flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer group",
                                                selectedPlayer?.id === p.id ? "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.15)]" : "border-transparent hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.08)]"
                                            )}
                                        >
                                            <div className="w-9 h-9 rounded-full bg-[#3b82f6]/20 border border-[rgba(59,130,246,0.3)] flex items-center justify-center shrink-0">
                                                <span className="text-[#3b82f6] text-[12px] font-black">{getInitials(p.first_name, p.last_name)}</span>
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <h4 className="text-[13px] font-bold text-[#f8fafc] truncate">{p.full_name || `${p.first_name} ${p.last_name}`}</h4>
                                                <p className="text-[11px] text-[#94a3b8]">{p.position || 'Sin Posición'} · {age} años</p>
                                            </div>
                                            <div className="ml-auto">
                                                {p.division_id ? (
                                                    <span className="bg-[rgba(59,130,246,0.1)] text-[#3b82f6] text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                                        EN OTRO PLANTEL
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleAddPlayer(p); }}
                                                        className="flex items-center justify-center w-7 h-7 bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] text-[#f8fafc] rounded-md hover:bg-[#3b82f6] hover:border-[#3b82f6] transition-all font-mono opacity-0 group-hover:opacity-100"
                                                    >
                                                        +
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                                {filteredAvailable.length === 0 && !loading && (
                                    <div className="text-center text-[12px] text-[#94a3b8] p-4">No hay jugadores disponibles</div>
                                )}
                            </div>
                        )}
                    </div>
                </aside>

                {/* Column B: Plantel Heart */}
                <section className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] rounded-2xl flex flex-col overflow-hidden relative">
                    <div className="p-5 border-b border-[rgba(255,255,255,0.08)] bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                        <h2 className="font-bold text-[14px] uppercase tracking-widest text-[#f8fafc] flex justify-between items-center">
                            Composición de Plantel <span className="font-mono text-[11px] text-[#3b82f6]">{squadPlayers.length} SELECCIONADOS</span>
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">

                        {squadPlayers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-50">
                                <div className="w-16 h-16 rounded-full border border-dashed border-[rgba(255,255,255,0.2)] flex items-center justify-center mb-4">
                                    <Users className="w-6 h-6 text-[#94a3b8]" />
                                </div>
                                <h3 className="font-bold text-[16px] text-[#f8fafc] mb-2 uppercase tracking-widest">Plantel Vacío</h3>
                                <p className="text-[#94a3b8] text-[13px] max-w-xs">Agrega jugadores desde la lista de disponibles. Si es para rugby, intenta cubrir los puestos clave.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {squadPlayers.map((p) => {
                                    const age = p.birth_date ? Math.floor((new Date().getTime() - new Date(p.birth_date).getTime()) / 3.15576e+10) : '?';
                                    return (
                                        <div key={p.id}
                                            onClick={() => setSelectedPlayer(p)}
                                            className={clsx("flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                                                selectedPlayer?.id === p.id ? "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.15)]" : "bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.15)]"
                                            )}>
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#10b981]"></div>
                                            <div className="w-10 h-10 ml-2 rounded-full bg-[#10b981]/20 border border-[rgba(16,185,129,0.3)] flex items-center justify-center shrink-0">
                                                <span className="text-[#10b981] text-[13px] font-black">{getInitials(p.first_name, p.last_name)}</span>
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <h4 className="text-[14px] font-bold text-[#f8fafc] truncate mb-0.5">{p.full_name || `${p.first_name} ${p.last_name}`}</h4>
                                                <p className="text-[11px] text-[#94a3b8] tracking-widest uppercase">{p.position || 'Sin Pos.'} · {age} AÑOS</p>
                                            </div>
                                            <div className="ml-auto">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleRemovePlayer(p.id); }}
                                                    className="flex items-center justify-center w-8 h-8 bg-transparent text-[#94a3b8] rounded-md hover:bg-[rgba(239,68,68,0.1)] hover:text-[#ef4444] transition-all"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                    </div>
                </section>

                {/* Column C: Detalle */}
                <aside className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] rounded-2xl flex flex-col overflow-hidden relative">
                    <div className="p-5 border-b border-[rgba(255,255,255,0.08)] bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                        <h2 className="font-bold text-[14px] uppercase tracking-widest text-[#f8fafc] flex justify-between items-center">
                            Detalle Seleccionado <span className="text-[10px] bg-[#3b82f6]/20 text-[#3b82f6] px-1.5 py-0.5 rounded font-bold">⚡ INFO</span>
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-center">
                        {selectedPlayer ? (
                            <>
                                <div className="w-[120px] h-[120px] mx-auto mb-5 rounded-full border-[3px] border-[rgba(255,255,255,0.08)] p-1 relative flex items-center justify-center bg-[rgba(255,255,255,0.02)]">
                                    <span className="text-[#f8fafc] text-4xl font-black">{getInitials(selectedPlayer.first_name, selectedPlayer.last_name)}</span>
                                    <div className={clsx("absolute bottom-2 right-2 w-5 h-5 border-[3px] border-[#0f0f0f] rounded-full bg-[#10b981]")}></div>
                                </div>

                                <h2 className="text-[22px] font-black text-[#f8fafc] mb-1">{selectedPlayer.full_name || `${selectedPlayer.first_name} ${selectedPlayer.last_name}`}</h2>
                                <p className="font-mono text-[13px] text-[#3b82f6] uppercase tracking-widest mb-6">
                                    {selectedPlayer.position || 'JUGADOR'}
                                </p>

                                <div className="flex flex-wrap justify-center gap-2 mb-6">
                                    {['Disponible', 'En Plantel', 'Formativa'].map((status) => (
                                        <div key={status} className={clsx(
                                            "px-3 py-1.5 rounded-full border border-[rgba(255,255,255,0.08)] text-[11px] cursor-pointer transition-all",
                                            status === 'Disponible' ? "bg-[#f8fafc] text-[#050505] font-bold" : "text-[#94a3b8] hover:bg-[rgba(255,255,255,0.03)]"
                                        )}>
                                            {status}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                                    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
                                        <label className="text-[9px] uppercase tracking-widest text-[#94a3b8] block mb-1">Edad</label>
                                        <span className="font-bold text-[14px] text-[#f8fafc]">{selectedPlayer.birth_date ? Math.floor((new Date().getTime() - new Date(selectedPlayer.birth_date).getTime()) / 3.15576e+10) : '?'} años</span>
                                    </div>
                                    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
                                        <label className="text-[9px] uppercase tracking-widest text-[#94a3b8] block mb-1">DNI</label>
                                        <span className="font-bold text-[14px] text-[#f8fafc]">{selectedPlayer.id_number || 'N/A'}</span>
                                    </div>
                                    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
                                        <label className="text-[9px] uppercase tracking-widest text-[#94a3b8] block mb-1">División Actual</label>
                                        <span className="font-bold text-[11px] text-[#3b82f6] uppercase">{selectedPlayer.division_name || 'Ninguna'}</span>
                                    </div>
                                    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
                                        <label className="text-[9px] uppercase tracking-widest text-[#94a3b8] block mb-1">Rol</label>
                                        <span className="font-bold text-[13px] text-[#f8fafc] uppercase">{selectedPlayer.role}</span>
                                    </div>
                                </div>

                                <div className="text-left mb-6">
                                    <label className="text-[11px] uppercase tracking-widest text-[#94a3b8] block mb-2">Notas Técnicas</label>
                                    <textarea
                                        className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3 text-white text-[13px] outline-none focus:border-[rgba(255,255,255,0.15)] transition-all resize-none h-[100px]"
                                        placeholder="Agregar observaciones del staff técnico..."
                                    ></textarea>
                                </div>

                                <div className="pt-6 border-t border-[rgba(255,255,255,0.05)]">
                                    <button className="w-full flex items-center justify-center py-3 bg-[#3b82f6] text-white text-[13px] font-bold rounded-xl hover:bg-[#2563eb] transition-all">
                                        Guardar Cambios
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-50">
                                <Users className="w-8 h-8 text-[#94a3b8] mb-4" />
                                <p className="text-[13px] text-[#94a3b8]">Selecciona un jugador para ver detalles.</p>
                            </div>
                        )}
                    </div>
                </aside>

            </div>
        </div>
    );
}
