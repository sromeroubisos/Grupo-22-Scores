'use client';

import { Database } from '@/lib/database.types';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface SummaryTabProps {
    data: TournamentRow;
    id: string;
    unionName?: string;
    matchCount?: number;
}

export function TournamentSummaryTab({ data, unionName }: SummaryTabProps) {
    return (
        <div className="tab-content active transition-all">
            <div className="basalt-grid">

                {/* 1. Hero Identidad */}
                <div className="basalt-card basalt-hero">
                    <div className="basalt-logo-placeholder">
                        {data.logo_url ? (
                            <img src={data.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                            <span style={{ fontSize: '11px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                CLICK PARA<br />SUBIR LOGO
                            </span>
                        )}
                    </div>
                    <div className="hero-info flex-1">
                        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(18px, 4vw, 24px)', textTransform: 'uppercase' }}>
                            {data.slug || 'SIN-SLUG'}
                        </h2>
                        <div className="basalt-hero-meta">
                            <span>{unionName || data.union_id || 'SIN ORGANIZADOR'}</span>
                            <span>{data.sport?.toUpperCase() || '—'}</span>
                            <span>{data.category || '—'}</span>
                        </div>
                        <p style={{ color: 'var(--text-dim)', fontSize: '14px', maxWidth: '600px', lineHeight: '1.6' }}>
                            {data.is_visible
                                ? 'Visible en catálogo y home. Competencia en curso. Se publican standings y partidos automáticamente.'
                                : 'Actualmente oculto para el público. Los cambios no se reflejarán en la app principal.'}
                        </p>
                        <button className="basalt-btn basalt-btn-primary mt-4 w-full sm:w-auto">Editar Detalles de Identidad</button>
                    </div>
                </div>

                {/* 2. Progreso del Torneo */}
                <div className="basalt-card basalt-card-span-8">
                    <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>Progreso del Torneo</h3>
                    <div className="basalt-progress">
                        <div className={`basalt-progress-step ${data.name && data.slug ? 'complete' : ''}`}></div>
                        <div className={`basalt-progress-step ${data.format ? 'complete' : ''}`}></div>
                        <div className="basalt-progress-step"></div>
                        <div className="basalt-progress-step"></div>
                        <div className="basalt-progress-step"></div>
                        <div className="basalt-progress-step"></div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
                        <div>
                            <span style={{ color: data.name && data.slug ? 'var(--status-active)' : 'var(--text-dim)' }}>
                                {data.name && data.slug ? '✔' : '•'}
                            </span> Identidad
                        </div>
                        <div>
                            <span style={{ color: data.format ? 'var(--status-active)' : 'var(--text-dim)' }}>
                                {data.format ? '✔' : '•'}
                            </span> Formato
                        </div>
                        <div style={{ color: 'var(--text-dim)' }}>• Participantes (Falta)</div>
                        <div style={{ color: 'var(--text-dim)' }}>• Fixture</div>
                        <div style={{ color: 'var(--text-dim)' }}>• Tabla</div>
                        <div style={{ color: 'var(--text-dim)' }}>• Publicación</div>
                    </div>
                </div>

                {/* 5. Salud de Datos */}
                <div className="basalt-card basalt-card-span-4">
                    <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>Salud de Datos</h3>
                    <div className="flex flex-col gap-2">
                        {!data.slug && (
                            <div className="basalt-health-item warning">
                                <span className="text-sm">Falta Slug</span>
                                <a href="#" className="font-bold text-[10px] uppercase text-blue-500">Resolver</a>
                            </div>
                        )}
                        {!data.union_id && (
                            <div className="basalt-health-item error">
                                <span className="text-sm">Falta Organizador</span>
                                <a href="#" className="font-bold text-[10px] uppercase text-blue-500">Ir</a>
                            </div>
                        )}
                        {data.name && data.slug && data.union_id && (
                            <div className="text-sm text-emerald-500 font-medium">✓ Toda la información básica está completa</div>
                        )}
                    </div>
                </div>

                {/* 3. Acciones Pendientes */}
                <div className="basalt-card basalt-card-span-4">
                    <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>Acciones Pendientes</h3>
                    <div className="basalt-checklist-item">
                        <div className="basalt-check-box"></div>
                        <span>Cargar participantes</span>
                    </div>
                    <div className="basalt-checklist-item">
                        <div className="basalt-check-box"></div>
                        <span>Generar fixture base</span>
                    </div>
                    <button className="basalt-btn w-full mt-3 justify-center">Ver Checklist Completa</button>
                </div>

                {/* 4. Estado Competitivo */}
                <div className="basalt-card basalt-card-span-8">
                    <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>Estado Competitivo</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                        <div>
                            <div className="text-[11px] text-dim mb-1 uppercase tracking-wider">PRÓXIMA FECHA</div>
                            <div className="text-lg font-bold">Sin partidos programados</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-dim mb-1 uppercase tracking-wider">ÚLTIMO RECALCULO</div>
                            <div className="text-lg font-bold font-mono">—</div>
                        </div>
                    </div>
                    <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
                        ⚠ No hay datos de competencia suficientes para mostrar estadísticas.
                    </div>
                </div>

            </div>
        </div>
    );
}
