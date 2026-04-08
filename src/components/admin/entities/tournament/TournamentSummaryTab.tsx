'use client';

import Link from 'next/link';
import { Database } from '@/lib/database.types';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface SummaryTabProps {
    data: TournamentRow;
    id: string;
    unionName?: string;
    matchCount?: number;
}

export function TournamentSummaryTab({ data, unionName, matchCount = 0 }: SummaryTabProps) {
    const progressSteps = [
        Boolean(data.name && data.slug),
        Boolean(data.format),
        false,
        false,
        false,
        Boolean(data.is_visible),
    ];
    const completionPercent = Math.round((progressSteps.filter(Boolean).length / progressSteps.length) * 100);

    return (
        <div className="tab-content active transition-all">
            <div className="basalt-grid">
                <div className="basalt-card basalt-hero">
                    <div className="basalt-logo-placeholder">
                        {data.logo_url ? (
                            <img src={data.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                            <span style={{ fontSize: '11px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                CLICK PARA
                                <br />
                                SUBIR LOGO
                            </span>
                        )}
                    </div>

                    <div className="hero-info flex-1">
                        <span className="basalt-section-kicker">Resumen operativo</span>
                        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(18px, 4vw, 24px)', textTransform: 'uppercase' }}>
                            {data.slug || 'SIN-SLUG'}
                        </h2>

                        <div className="basalt-hero-meta">
                            <span>{unionName || data.union_id || 'SIN ORGANIZADOR'}</span>
                            <span>{data.sport_id?.toUpperCase() || '--'}</span>
                            <span>{data.category || '--'}</span>
                        </div>

                        <p style={{ color: 'var(--text-dim)', fontSize: '14px', maxWidth: '600px', lineHeight: '1.6' }}>
                            {data.is_visible
                                ? 'Visible en catalogo y home. Competencia en curso. Se publican standings y partidos automaticamente.'
                                : 'Actualmente oculto para el publico. Los cambios no se reflejaran en la app principal.'}
                        </p>

                        <Link
                            href={`/admin/entities/${data.id}/manage?type=tournament&tab=detalles`}
                            className="basalt-btn basalt-btn-primary mt-4 w-full sm:w-auto"
                        >
                            Editar detalles base
                        </Link>
                    </div>

                    <div className="basalt-hero-completion">
                        <span className="basalt-hero-completion-label">Completion</span>
                        <strong className="basalt-hero-completion-value">{completionPercent}%</strong>
                    </div>
                </div>

                <div className="basalt-card basalt-summary-strip">
                    <div className="basalt-summary-metric">
                        <span>Estado general</span>
                        <strong>{data.status?.toUpperCase() || 'DRAFT'}</strong>
                        <small>Lifecycle actual del torneo</small>
                    </div>
                    <div className="basalt-summary-metric">
                        <span>Visibilidad</span>
                        <strong>{data.is_visible ? 'PUBLICO' : 'INTERNO'}</strong>
                        <small>Salida publica y catalogo</small>
                    </div>
                    <div className="basalt-summary-metric">
                        <span>Partidos</span>
                        <strong>{matchCount}</strong>
                        <small>Eventos asociados al torneo</small>
                    </div>
                    <div className="basalt-summary-metric">
                        <span>Temporada</span>
                        <strong>{data.season_id || '--'}</strong>
                        <small>Contexto competitivo activo</small>
                    </div>
                </div>

                <div className="basalt-card basalt-card-span-8">
                    <span className="basalt-section-kicker">Wizard status</span>
                    <h3 className="basalt-section-title">Progreso del torneo</h3>
                    <div className="basalt-progress">
                        {progressSteps.map((isComplete, index) => (
                            <div key={index} className={`basalt-progress-step ${isComplete ? 'complete' : ''}`}></div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
                        <div>
                            <span style={{ color: data.name && data.slug ? 'var(--status-active)' : 'var(--text-dim)' }}>
                                {data.name && data.slug ? 'OK' : '•'}
                            </span>{' '}
                            Identidad
                        </div>
                        <div>
                            <span style={{ color: data.format ? 'var(--status-active)' : 'var(--text-dim)' }}>
                                {data.format ? 'OK' : '•'}
                            </span>{' '}
                            Formato
                        </div>
                        <div style={{ color: 'var(--text-dim)' }}>• Participantes</div>
                        <div style={{ color: 'var(--text-dim)' }}>• Fixture</div>
                        <div style={{ color: 'var(--text-dim)' }}>• Tabla</div>
                        <div style={{ color: 'var(--text-dim)' }}>• Publicacion</div>
                    </div>
                </div>

                <div className="basalt-card basalt-card-span-4">
                    <span className="basalt-section-kicker">Control</span>
                    <h3 className="basalt-section-title">Salud de datos</h3>

                    <div className="flex flex-col gap-2">
                        {!data.slug && (
                            <div className="basalt-health-item warning">
                                <span className="text-sm">Falta slug</span>
                                <a href="#" className="font-bold text-[10px] uppercase text-emerald-400">Resolver</a>
                            </div>
                        )}
                        {!data.union_id && (
                            <div className="basalt-health-item error">
                                <span className="text-sm">Falta organizador</span>
                                <a href="#" className="font-bold text-[10px] uppercase text-emerald-400">Ir</a>
                            </div>
                        )}
                        {data.name && data.slug && data.union_id && (
                            <div className="text-sm text-emerald-400 font-medium">OK Toda la informacion basica esta completa</div>
                        )}
                    </div>
                </div>

                <div className="basalt-card basalt-card-span-4">
                    <span className="basalt-section-kicker">Ruta sugerida</span>
                    <h3 className="basalt-section-title">Siguientes pasos reales</h3>

                    <div className="flex flex-col gap-2">
                        <Link className="basalt-btn justify-center" href={`/admin/entities/${data.id}/manage?type=tournament&tab=estructura`}>
                            Definir estructura
                        </Link>
                        <Link className="basalt-btn justify-center" href={`/admin/entities/${data.id}/manage?type=tournament&tab=participantes`}>
                            Cargar participantes
                        </Link>
                        <Link className="basalt-btn justify-center" href={`/admin/entities/${data.id}/manage?type=tournament&tab=operacion`}>
                            Gestionar fixture y tabla
                        </Link>
                    </div>
                </div>

                <div className="basalt-card basalt-card-span-8">
                    <span className="basalt-section-kicker">Monitor</span>
                    <h3 className="basalt-section-title">Estado competitivo</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                        <div>
                            <div className="text-[11px] text-dim mb-1 uppercase tracking-wider">PROXIMA FECHA</div>
                            <div className="text-lg font-bold">Sin partidos programados</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-dim mb-1 uppercase tracking-wider">ULTIMO RECALCULO</div>
                            <div className="text-lg font-bold font-mono">--</div>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                        No hay datos de competencia suficientes para mostrar estadisticas.
                    </div>
                </div>
            </div>
        </div>
    );
}
