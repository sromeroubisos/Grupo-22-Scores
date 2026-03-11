'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@/lib/database.types';
import { clsx } from 'clsx';
import { fetchDivisions, createDivision, Division } from '@/lib/services/divisionService';
import { createClient } from '@/lib/supabase/client';
import { Users, Trophy, Calendar, Plus, LayoutGrid, List, Filter, Search, Shield, ChevronRight } from 'lucide-react';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

function getColorClass(id: string) {
    const num = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
    const classes = [
        'from-blue-600 to-indigo-600',
        'from-emerald-500 to-teal-600',
        'from-orange-400 to-red-500',
        'from-purple-500 to-fuchsia-600',
        'from-cyan-500 to-blue-500'
    ];
    return classes[num % classes.length];
}

interface ClubSquadsTabProps {
    id: string;
    data?: ClubRow;
}

export function ClubSquadsTab({ id, data }: ClubSquadsTabProps) {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchQuery, setSearchQuery] = useState('');
    const [squads, setSquads] = useState<any[]>([]); // We map them to a local structure, so any[] is fine or we can define UI structure
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        loadSquads();
    }, [id]);

    async function loadSquads() {
        setLoading(true);
        try {
            const data = await fetchDivisions(id);
            const mappedDivisions = data.map(d => ({
                id: d.id,
                name: d.name || 'Sin nombre',
                shortName: (d.name || 'SQD').substring(0, 3).toUpperCase(),
                category: d.category || d.sport || 'Categoría',
                season: d.season || String(new Date().getFullYear()),
                tag: d.status === 'active' ? 'Competencia' : '',
                tagColor: d.status === 'active' ? 'green' : 'gray',
                sport: d.sport || 'Rugby',
                status: d.status || 'draft',
                colorClass: getColorClass(d.id),
                players: d.players_count || 0,
                staff: d.staff_count || 0
            }));
            setSquads(mappedDivisions);
        } catch (error) {
            console.error("Error loading squads:", error);
            setSquads([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateSquad() {
        const name = window.prompt("Ingrese el nombre del nuevo plantel (ej: Primera División, M19...):");
        if (!name || name.trim() === '') return;

        setIsSaving(true);
        try {
            const result = await createDivision(id, name.trim());
            if (result.success) {
                await loadSquads();
            } else {
                console.error("Error al crear:", result.error);
                alert("Hubo un error al crear el plantel.");
            }
        } finally {
            setIsSaving(false);
        }
    }

    const filteredSquads = squads.filter(s =>
        (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.category || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeSquads = filteredSquads.filter(s => s.status === 'active' || s.status === 'paused');
    const draftSquads = filteredSquads.filter(s => s.status === 'draft');
    const historicalSquads = filteredSquads.filter(s => s.status === 'archived');

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            {/* Controles y Filtros (Kinetic Structuralism) */}
            <div className="manager-card">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Shield className="w-6 h-6 text-[var(--accent)]" /> Gestión de Planteles</h1>
                        <p>Administración de divisiones, planteles y categorías del club.</p>
                    </div>
                    <div className="manager-metadata-box" id="status-indicator">
                        TOTAL: {squads.length} | ACTIVOS: {activeSquads.length}
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Búsqueda */}
                    <div className="manager-input-group">
                        <label className="manager-field-label">Búsqueda Rápida</label>
                        <div className="relative flex items-center">
                            <Search className="absolute left-4 w-4 h-4 text-[#888]" />
                            <input
                                type="text"
                                className="manager-url-input pl-12"
                                placeholder="Nombre o categoría..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Vista */}
                    <div className="manager-input-group">
                        <label className="manager-field-label">Modo de Vista</label>
                        <div className="manager-tabs">
                            <div className="manager-tab-indicator" style={{ transform: `translateX(${viewMode === 'cards' ? '0%' : '100%'})` }}></div>
                            <button
                                className={`manager-tab-btn ${viewMode === 'cards' ? 'active text-[var(--bg)]' : ''}`}
                                onClick={(e) => { e.preventDefault(); setViewMode('cards'); }}
                            >
                                <LayoutGrid className="w-4 h-4 inline mr-1.5" /> Tarjetas
                            </button>
                            <button
                                className={`manager-tab-btn ${viewMode === 'table' ? 'active text-[var(--bg)]' : ''}`}
                                onClick={(e) => { e.preventDefault(); setViewMode('table'); }}
                            >
                                <List className="w-4 h-4 inline mr-1.5" /> Tabla
                            </button>
                        </div>
                    </div>

                    {/* Acciones */}
                    <div className="manager-input-group">
                        <label className="manager-field-label">Acciones Rápidas</label>
                        <div className="flex gap-3">
                            <button
                                onClick={handleCreateSquad}
                                disabled={isSaving}
                                className="flex-1 bg-[var(--accent)] text-[var(--bg)] px-4 py-3 font-bold uppercase tracking-widest text-xs border border-[var(--accent)] hover:opacity-80 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4" />
                                {isSaving ? 'Creando...' : 'Crear Plantel'}
                            </button>
                            <button className="px-4 py-3 bg-[rgba(255,255,255,0.05)] border border-[var(--border)] text-[#e2e2e2] font-bold uppercase text-xs hover:bg-[rgba(255,255,255,0.08)] transition-all flex items-center justify-center">
                                <Filter className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="manager-card">
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-12 h-12 border-2 border-[var(--accent)]/20 border-t-[var(--accent)] rounded-full animate-spin"></div>
                        <p className="text-[#888] uppercase text-xs tracking-widest">Cargando planteles...</p>
                    </div>
                </div>
            ) : viewMode === 'cards' ? (
                <>
                    {/* Planteles Activos */}
                    {activeSquads.length > 0 && (
                        <div className="manager-card">
                            <header className="manager-header">
                                <div className="manager-header-titles">
                                    <h1 className="flex items-center gap-3"><Trophy className="w-6 h-6 text-[var(--success)]" /> Planteles Activos</h1>
                                    <p>Divisiones en competencia actual y operativas.</p>
                                </div>
                                <div className="manager-metadata-box">
                                    COUNT: {activeSquads.length}
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {activeSquads.map((squad) => (
                                    <div
                                        key={squad.id}
                                        className="strata-card p-0 overflow-hidden cursor-pointer group"
                                        onClick={() => router.push(`/admin/super/clubes/${id}/planteles/${squad.id}`)}
                                    >
                                        <div className={clsx("h-28 relative overflow-hidden bg-gradient-to-br", squad.colorClass)}>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-white/10 text-7xl font-black tracking-tighter">{squad.shortName}</span>
                                            </div>
                                            <div className="absolute top-3 right-3 flex gap-2">
                                                {squad.status === 'active' && (
                                                    <div className="status-badge bg-[var(--success)]"></div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="font-bold text-lg text-[#e2e2e2] mb-1 truncate uppercase tracking-tight">
                                                {squad.name || 'Sin nombre'}
                                            </h3>
                                            <p className="text-[#888] text-xs uppercase tracking-widest mb-4 font-bold">
                                                {squad.sport} · {squad.category}
                                            </p>

                                            <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="flex items-center gap-2 text-[#e2e2e2]">
                                                    <Users className="w-4 h-4 text-[var(--accent)]" />
                                                    <span className="font-black text-sm">{squad.players || 0}</span>
                                                    <span className="text-[#888] text-xs uppercase">jugadores</span>
                                                </div>
                                                <div className="anodized-tag text-[#888]">
                                                    {squad.season}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Borradores */}
                    {draftSquads.length > 0 && (
                        <div className="manager-card">
                            <header className="manager-header">
                                <div className="manager-header-titles">
                                    <h1 className="flex items-center gap-3"><Calendar className="w-6 h-6 text-[var(--warning)]" /> Borradores</h1>
                                    <p>Planteles en preparación o pendientes de activación.</p>
                                </div>
                                <div className="manager-metadata-box">
                                    COUNT: {draftSquads.length}
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {draftSquads.map((squad) => (
                                    <div
                                        key={squad.id}
                                        className="strata-card p-0 overflow-hidden cursor-pointer opacity-70 hover:opacity-100"
                                        onClick={() => router.push(`/admin/super/clubes/${id}/planteles/${squad.id}`)}
                                    >
                                        <div className="h-28 relative overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-white/10 text-7xl font-black tracking-tighter">{squad.shortName}</span>
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="font-bold text-lg text-[#e2e2e2] mb-1 truncate uppercase tracking-tight">
                                                {squad.name || 'Sin nombre'}
                                            </h3>
                                            <p className="text-[#888] text-xs uppercase tracking-widest mb-4 font-bold">
                                                {squad.sport} · {squad.category}
                                            </p>

                                            <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="anodized-tag text-[var(--warning)] border-[var(--warning)]/30">
                                                    BORRADOR
                                                </div>
                                                <div className="anodized-tag text-[#888]">
                                                    {squad.season}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Archivados */}
                    {historicalSquads.length > 0 && (
                        <div className="manager-card opacity-60 hover:opacity-100 transition-opacity">
                            <header className="manager-header">
                                <div className="manager-header-titles">
                                    <h1>Archivados</h1>
                                    <p>Planteles históricos y temporadas pasadas.</p>
                                </div>
                                <div className="manager-metadata-box">
                                    COUNT: {historicalSquads.length}
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 grayscale">
                                {historicalSquads.map((squad) => (
                                    <div
                                        key={squad.id}
                                        className="strata-card p-0 overflow-hidden cursor-pointer"
                                        onClick={() => router.push(`/admin/super/clubes/${id}/planteles/${squad.id}`)}
                                    >
                                        <div className="h-28 relative overflow-hidden bg-gradient-to-br from-gray-600 to-gray-700">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-white/10 text-7xl font-black tracking-tighter">{squad.shortName}</span>
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="font-bold text-lg text-[#e2e2e2] mb-1 truncate uppercase tracking-tight">
                                                {squad.name || 'Sin nombre'}
                                            </h3>
                                            <p className="text-[#888] text-xs uppercase tracking-widest mb-4 font-bold">
                                                Temporada {squad.season}
                                            </p>

                                            <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="anodized-tag text-[#666]">
                                                    ARCHIVADO
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sin resultados */}
                    {filteredSquads.length === 0 && (
                        <div className="manager-card">
                            <div className="flex flex-col items-center justify-center py-16 gap-4">
                                <Shield className="w-16 h-16 text-[#333] opacity-50" />
                                <p className="text-[#888] uppercase text-sm tracking-widest">No se encontraron planteles</p>
                                <button
                                    onClick={handleCreateSquad}
                                    disabled={isSaving}
                                    className="mt-4 bg-[var(--accent)] text-[var(--bg)] px-6 py-3 font-bold uppercase tracking-widest text-xs border border-[var(--accent)] hover:opacity-80 transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-4 h-4" />
                                    {isSaving ? 'Creando...' : 'Crear Primer Plantel'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Vista de Tabla */
                <div className="manager-card">
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1>Vista Completa de Planteles</h1>
                            <p>Listado detallado con información expandida.</p>
                        </div>
                    </header>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="px-6 py-4 text-left text-xs font-black text-[#888] uppercase tracking-widest">Plantel</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-[#888] uppercase tracking-widest">Deporte</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-[#888] uppercase tracking-widest">Temporada</th>
                                    <th className="px-6 py-4 text-center text-xs font-black text-[#888] uppercase tracking-widest">Jugadores</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-[#888] uppercase tracking-widest">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSquads.map((squad) => (
                                    <tr
                                        key={squad.id}
                                        className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer"
                                        onClick={() => router.push(`/admin/super/clubes/${id}/planteles/${squad.id}`)}
                                    >
                                        <td className="px-6 py-5">
                                            <div className="font-bold text-sm text-[#e2e2e2] uppercase tracking-tight">{squad.name || 'Sin nombre'}</div>
                                            <div className="text-xs text-[#888] mt-0.5 font-mono">{squad.category}</div>
                                        </td>
                                        <td className="px-6 py-5 text-sm text-[#e2e2e2] font-medium uppercase">{squad.sport}</td>
                                        <td className="px-6 py-5">
                                            <div className="anodized-tag inline-block">{squad.season}</div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <span className="font-black text-[#e2e2e2] text-base">{squad.players || 0}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={clsx(
                                                "anodized-tag inline-flex items-center gap-2",
                                                squad.status === 'active' ? 'text-[var(--success)] border-[var(--success)]/30' :
                                                    squad.status === 'draft' ? 'text-[var(--warning)] border-[var(--warning)]/30' :
                                                        'text-[#666] border-[#666]/30'
                                            )}>
                                                {squad.status === 'active' && <span className="status-badge bg-[var(--success)]"></span>}
                                                {squad.status === 'active' ? 'ACTIVO' : squad.status === 'draft' ? 'BORRADOR' : squad.status === 'paused' ? 'RECESO' : 'ARCHIVADO'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
