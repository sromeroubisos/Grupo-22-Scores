'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList, Layers, ListChecks, Trophy, Users, XCircle } from 'lucide-react';
import { Database } from '@/lib/database.types';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface SummaryTabProps {
    data: TournamentRow;
    id: string;
    unionName?: string;
    matchCount?: number;
}

export function TournamentSummaryTab({ data, id, unionName, matchCount = 0 }: SummaryTabProps) {
    const progressSteps = [
        Boolean(data.name && data.slug),
        Boolean(data.format),
        false,
        false,
        false,
        Boolean(data.is_visible),
    ];
    const completionPercent = Math.round((progressSteps.filter(Boolean).length / progressSteps.length) * 100);

    const stateLabel = (data.status || 'draft').toUpperCase();
    const visibilityLabel = data.is_visible ? 'Publico' : 'Interno';
    const seasonLabel = data.season_id || '--';
    const sportLabel = data.sport_id?.toUpperCase() || '--';

    const healthIssues: Array<{ tone: 'warn' | 'err'; label: string; href: string; cta: string }> = [];
    if (!data.slug) {
        healthIssues.push({ tone: 'warn', label: 'Falta identificador (slug)', href: `/admin/entities/${id}/manage?type=tournament&tab=detalles`, cta: 'Asignar' });
    }
    if (!data.union_id) {
        healthIssues.push({ tone: 'err', label: 'Falta organizador asignado', href: `/admin/entities/${id}/manage?type=tournament&tab=detalles`, cta: 'Vincular' });
    }
    if (!data.format) {
        healthIssues.push({ tone: 'warn', label: 'Sin formato definido', href: `/admin/entities/${id}/manage?type=tournament&tab=formato`, cta: 'Configurar' });
    }
    const everythingHealthy = healthIssues.length === 0;

    return (
        <div className="tab-content active transition-all">
            {/* Mobile-only redesigned summary. Hidden on desktop via CSS. */}
            <section className="tournament-summary-mobile" aria-label="Resumen del torneo">
                <article className="tsm-card tsm-card-state">
                    <div className="tsm-card-eyebrow">Estado actual</div>
                    <div className="tsm-state-row">
                        <strong className="tsm-state-status">{stateLabel}</strong>
                        <span className={`tsm-state-pill ${data.is_visible ? 'is-public' : 'is-internal'}`}>
                            {visibilityLabel}
                        </span>
                    </div>
                    <div className="tsm-state-meta">
                        <span><Trophy size={14} /> {sportLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{seasonLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{matchCount} partidos</span>
                    </div>
                    <div className="tsm-state-progress" aria-label={`Configuracion ${completionPercent}%`}>
                        <div className="tsm-state-progress-bar">
                            <div className="tsm-state-progress-fill" style={{ width: `${completionPercent}%` }} />
                        </div>
                        <span className="tsm-state-progress-label">{completionPercent}% configurado</span>
                    </div>
                </article>

                <article className="tsm-card">
                    <div className="tsm-card-eyebrow">Acciones rapidas</div>
                    <div className="tsm-quick-grid">
                        <Link
                            prefetch={false}
                            className="tsm-quick"
                            href={`/admin/entities/${id}/manage?type=tournament&tab=operacion`}
                        >
                            <span className="tsm-quick-glyph"><ListChecks size={18} /></span>
                            <span className="tsm-quick-text">
                                <strong>Cargar resultados</strong>
                                <small>Fixture y partidos</small>
                            </span>
                        </Link>
                        <Link
                            prefetch={false}
                            className="tsm-quick"
                            href={`/admin/entities/${id}/manage?type=tournament&tab=participantes`}
                        >
                            <span className="tsm-quick-glyph"><Users size={18} /></span>
                            <span className="tsm-quick-text">
                                <strong>Equipos</strong>
                                <small>Altas y plantel</small>
                            </span>
                        </Link>
                        <Link
                            prefetch={false}
                            className="tsm-quick"
                            href={`/admin/entities/${id}/manage?type=tournament&tab=estructura`}
                        >
                            <span className="tsm-quick-glyph"><Layers size={18} /></span>
                            <span className="tsm-quick-text">
                                <strong>Estructura</strong>
                                <small>Fases y formato</small>
                            </span>
                        </Link>
                        <Link
                            prefetch={false}
                            className="tsm-quick"
                            href={`/admin/entities/${id}/manage?type=tournament&tab=detalles`}
                        >
                            <span className="tsm-quick-glyph"><ClipboardList size={18} /></span>
                            <span className="tsm-quick-text">
                                <strong>Detalles</strong>
                                <small>Identidad y reglas</small>
                            </span>
                        </Link>
                    </div>
                </article>

                <article className="tsm-card">
                    <div className="tsm-card-eyebrow">
                        <span>Salud del torneo</span>
                        <span className={`tsm-card-eyebrow-badge ${everythingHealthy ? 'is-ok' : 'is-warn'}`}>
                            {everythingHealthy ? 'Todo OK' : `${healthIssues.length} pendiente${healthIssues.length === 1 ? '' : 's'}`}
                        </span>
                    </div>
                    {everythingHealthy ? (
                        <div className="tsm-health-empty">
                            <CheckCircle2 size={18} aria-hidden="true" />
                            <span>Toda la informacion basica esta completa.</span>
                        </div>
                    ) : (
                        <ul className="tsm-health-list">
                            {healthIssues.map((issue) => (
                                <li key={issue.label} className={`tsm-health-item ${issue.tone}`}>
                                    <span className="tsm-health-icon" aria-hidden="true">
                                        {issue.tone === 'err' ? <XCircle size={16} /> : <AlertTriangle size={16} />}
                                    </span>
                                    <span className="tsm-health-label">{issue.label}</span>
                                    <Link prefetch={false} className="tsm-health-cta" href={issue.href}>
                                        {issue.cta}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </article>

                <article className="tsm-card">
                    <div className="tsm-card-eyebrow">Proximo evento</div>
                    <div className="tsm-next-empty">
                        <strong>Sin partidos programados</strong>
                        <small>Cuando publiques una fecha aparecera aca con el horario de los partidos.</small>
                        <Link
                            prefetch={false}
                            className="tsm-next-cta"
                            href={`/admin/entities/${id}/manage?type=tournament&tab=operacion`}
                        >
                            Ir a operacion
                        </Link>
                    </div>
                </article>
            </section>

            {/* Desktop layout. Hidden on mobile via CSS to avoid duplicate render. */}
            <div className="basalt-grid tournament-summary-desktop">
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
                            prefetch={false}
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
                        <Link prefetch={false} className="basalt-btn justify-center" href={`/admin/entities/${data.id}/manage?type=tournament&tab=estructura`}>
                            Definir estructura
                        </Link>
                        <Link prefetch={false} className="basalt-btn justify-center" href={`/admin/entities/${data.id}/manage?type=tournament&tab=participantes`}>
                            Cargar participantes
                        </Link>
                        <Link prefetch={false} className="basalt-btn justify-center" href={`/admin/entities/${data.id}/manage?type=tournament&tab=operacion`}>
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
