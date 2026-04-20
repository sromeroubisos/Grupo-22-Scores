'use client';

import { Check, Plus, Radio, Shield, Sparkles, Trash2, Trophy, Upload, Users } from 'lucide-react';

interface SidebarProps {
    onDelete: () => void;
    completeness: number;
    metrics: {
        teams: number;
        upcomingMatches: number;
        competitions: number;
    };
    diagnostics: {
        hasName: boolean;
        hasSlug: boolean;
        hasCountry: boolean;
        hasLogo: boolean;
        hasUnion: boolean;
    };
    clubName: string;
    clubShortName?: string | null;
    primaryColor: string;
    nextMatchLabel?: string | null;
}

export function ClubManageSidebar({
    onDelete,
    completeness,
    diagnostics,
    metrics,
    clubName,
    clubShortName,
    primaryColor,
    nextMatchLabel,
}: SidebarProps) {
    const modules = [
        {
            label: 'Identidad',
            detail: diagnostics.hasName && diagnostics.hasSlug && diagnostics.hasLogo
                ? 'Nucleo institucional cargado'
                : 'Faltan datos base del club',
            ready: diagnostics.hasName && diagnostics.hasSlug && diagnostics.hasLogo,
            Icon: Shield,
        },
        {
            label: 'Equipos',
            detail: metrics.teams > 0 ? `${metrics.teams} equipo(s) configurados` : 'Sin estructura deportiva activa',
            ready: metrics.teams > 0,
            Icon: Users,
        },
        {
            label: 'Competencias',
            detail: metrics.competitions > 0 ? `${metrics.competitions} competencia(s) activas` : 'Sin torneos vinculados',
            ready: metrics.competitions > 0,
            Icon: Trophy,
        },
        {
            label: 'Partidos',
            detail: metrics.upcomingMatches > 0 ? `${metrics.upcomingMatches} partido(s) proximos` : 'Sin agenda operativa',
            ready: metrics.upcomingMatches > 0,
            Icon: Radio,
        },
    ];

    return (
        <div className="club-context-panel">
            <div className="sidebar-section">
                <h3>Generador de contenido</h3>
                <div className="club-sidebar-preview">
                    <div className="club-sidebar-preview-top">
                        <span>IG Story Preview</span>
                        <span className="club-sidebar-preview-dot" style={{ background: primaryColor }} />
                    </div>
                    <div className="club-sidebar-preview-body">
                        <span>{nextMatchLabel ? 'Proximo partido' : 'Studio activo'}</span>
                        <strong>{clubShortName || clubName}</strong>
                        <p>{nextMatchLabel ? `${clubShortName || 'Club'} vs ${nextMatchLabel}` : 'Identidad lista para exports sociales.'}</p>
                    </div>
                    <div className="club-sidebar-preview-actions">
                        <button className="btn btn-primary club-preview-button">Exportar para IG</button>
                    </div>
                </div>
            </div>

            <div className="sidebar-section">
                <h3>
                    Estado del sistema
                    <Check className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                </h3>
                <ul className="validation-list">
                    <li className="validation-item" style={{ color: diagnostics.hasName && diagnostics.hasSlug ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasName && diagnostics.hasSlug ? 'var(--success)' : 'var(--border)' }} />
                        Identidad completa
                    </li>
                    <li className="validation-item" style={{ color: diagnostics.hasCountry ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasCountry ? 'var(--success)' : 'var(--border)' }} />
                        Geolocalizacion
                    </li>
                    <li className="validation-item" style={{ color: diagnostics.hasLogo ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasLogo ? 'var(--success)' : 'var(--border)' }} />
                        Logo institucional
                    </li>
                    <li className="validation-item" style={{ color: diagnostics.hasUnion ? 'var(--text)' : 'var(--text-muted)' }}>
                        <div className="dirty-dot" style={{ background: diagnostics.hasUnion ? 'var(--success)' : 'var(--border)' }} />
                        Vinculacion a union
                    </li>
                </ul>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                    <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-fill" style={{ width: `${completeness}%` }} />
                    </div>
                    <span>{Math.round(completeness)}%</span>
                </div>
            </div>

            <div className="sidebar-section">
                <h3>Modulos activos</h3>
                <div className="club-sidebar-modules">
                    {modules.map(({ label, detail, ready, Icon }) => (
                        <div key={label} className="club-sidebar-module">
                            <div className={`club-sidebar-module-mark ${ready ? 'ready' : ''}`}>
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <strong>{label}</strong>
                                <span>{detail}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="sidebar-section">
                <h3>Acciones rapidas</h3>
                <div className="quick-actions">
                    <div className="action-square">
                        <Upload className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                        <div>Importar</div>
                    </div>
                    <div className="action-square">
                        <Plus className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                        <div>Jugadores</div>
                    </div>
                    <div className="action-square">
                        <Sparkles className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                        <div>Exports</div>
                    </div>
                    <div className="action-square">
                        <Shield className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
                        <div>Permisos</div>
                    </div>
                </div>
            </div>

            <div className="metric-card">
                <div className="metric-card-label">Cobertura operativa</div>
                <div className="metric-card-value">{Math.round(completeness)}%</div>
                <div className="metric-card-note">
                    {metrics.upcomingMatches > 0
                        ? `${metrics.upcomingMatches} partido(s) listos para operar`
                        : 'Completa identidad, equipos y agenda para llegar a 100%'}
                </div>
            </div>

            <div className="sidebar-section">
                <h3>Atajos</h3>
                <div className="shortcut"><span>Guardar cambios</span> <span className="kbd">Ctrl+S</span></div>
                <div className="shortcut"><span>Buscador global</span> <span className="kbd">Ctrl+K</span></div>
            </div>

            <div className="danger-zone">
                <button
                    onClick={onDelete}
                    className="btn btn-danger"
                >
                    <Trash2 className="w-4 h-4" />
                    Destruir entidad
                </button>
            </div>
        </div>
    );
}
