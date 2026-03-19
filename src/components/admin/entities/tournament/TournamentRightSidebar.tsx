'use client';

import { Database } from '@/lib/database.types';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface RightSidebarProps {
    id: string;
    data: TournamentRow;
    onDelete: () => void;
}

export function TournamentRightSidebar({ data, onDelete }: RightSidebarProps) {
    return (
        <aside className="basalt-sidebar hidden xl:block w-[320px]">
            <div className="sidebar-section basalt-rail-section mb-8">
                <span className="basalt-sidebar-title">Validaciones</span>
                <div className="basalt-checklist-item">
                    <div className={`basalt-check-box ${data.name && data.slug ? 'checked' : ''}`}></div>
                    <span style={{ color: 'var(--text-dim)' }}>Nombre y slug</span>
                </div>
                <div className="basalt-checklist-item">
                    <div className={`basalt-check-box ${data.union_id ? 'checked' : ''}`}></div>
                    <span style={{ color: 'var(--text-dim)' }}>Organizador vinculado</span>
                </div>
                <div className="basalt-checklist-item">
                    <div className="basalt-check-box"></div>
                    <span>Carga de Participantes</span>
                </div>
                <div className="basalt-checklist-item">
                    <div className="basalt-check-box"></div>
                    <span>Definición de Fixture</span>
                </div>
            </div>

            <div className="sidebar-section basalt-rail-section mb-8">
                <span className="basalt-sidebar-title">Atajos de Teclado</span>
                <div className="flex justify-between text-xs font-mono mb-2">
                    <span style={{ color: 'var(--text-dim)' }}>Guardar</span>
                    <span>⌘ S</span>
                </div>
                <div className="flex justify-between text-xs font-mono mb-2">
                    <span style={{ color: 'var(--text-dim)' }}>Recalcular</span>
                    <span>⌘ R</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                    <span style={{ color: 'var(--text-dim)' }}>Nueva Fase</span>
                    <span>⌘ N</span>
                </div>
            </div>

            <div className="sidebar-section basalt-rail-section">
                <span className="basalt-sidebar-title">Estado rapido</span>
                <div className="basalt-sidebar-status">
                    <strong>{data.status?.toUpperCase() || 'DRAFT'}</strong>
                    <span>{data.is_visible ? 'Visible para publico' : 'Oculto para publico'}</span>
                </div>
            </div>

            <div className="sidebar-section mt-12">
                <button
                    className="basalt-btn basalt-btn-danger w-full justify-center"
                    onClick={onDelete}
                >
                    BORRAR TORNEO
                </button>
            </div>
        </aside>
    );
}
