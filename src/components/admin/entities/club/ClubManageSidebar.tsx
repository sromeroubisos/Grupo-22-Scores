'use client';

import { Check, AlertCircle, Trash2, Plus, Link as LinkIcon, Upload, Terminal, Info } from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
    onDelete: () => void;
    completeness: number;
    diagnostics: {
        hasName: boolean;
        hasSlug: boolean;
        hasCountry: boolean;
        hasLogo: boolean;
        hasUnion: boolean;
    };
}

export function ClubManageSidebar({ onDelete, completeness, diagnostics }: SidebarProps) {
    return (
        <>
            <div className="sidebar-section">
                <h3>
                    Validaciones
                    <Check className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                </h3>
                <ul className="validation-list">
                    <li className="validation-item" style={{ color: diagnostics.hasName && diagnostics.hasSlug ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasName && diagnostics.hasSlug ? 'var(--success)' : 'var(--border)' }}></div>
                        Identidad Completa
                    </li>
                    <li className="validation-item" style={{ color: diagnostics.hasCountry ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasCountry ? 'var(--success)' : 'var(--border)' }}></div>
                        Geolocalización
                    </li>
                    <li className="validation-item" style={{ color: diagnostics.hasLogo ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasLogo ? 'var(--success)' : 'var(--border)' }}></div>
                        Logo Institucional
                    </li>
                    <li className="validation-item" style={{ color: diagnostics.hasUnion ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasUnion ? 'var(--success)' : 'var(--border)' }}></div>
                        Vinculación Unión
                    </li>
                </ul>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                    <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-fill" style={{ width: `${completeness}%` }}></div>
                    </div>
                    <span>{Math.round(completeness)}%</span>
                </div>
            </div>

            <div className="sidebar-section" style={{ marginTop: '1rem' }}>
                <h3>Acciones Rápidas</h3>
                <div className="quick-actions">
                    <div className="action-square">
                        <Upload className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                        <div>Importar</div>
                    </div>
                    <div className="action-square">
                        <Plus className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                        <div>Planteles</div>
                    </div>
                </div>
            </div>

            <div className="sidebar-section" style={{ marginTop: '1rem' }}>
                <h3>Atajos</h3>
                <div className="shortcut"><span>Guardar cambios</span> <span className="kbd">⌘S</span></div>
                <div className="shortcut"><span>Buscador Global</span> <span className="kbd">⌘K</span></div>
            </div>

            <div className="danger-zone">
                <button
                    onClick={onDelete}
                    className="btn btn-danger"
                >
                    <Trash2 className="w-4 h-4" />
                    Destruir Entidad
                </button>
            </div>
        </>
    );
}
