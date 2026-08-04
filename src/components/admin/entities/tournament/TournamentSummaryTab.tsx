'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle, ClipboardList, Layers, ListChecks, Trophy, Users, XCircle } from 'lucide-react';
import { Database } from '@/lib/database.types';
import { SPORTS } from '@/lib/data/sports';

// NOTE(tokens): los colores semánticos (emerald/amber/red) están hardcodeados a
// propósito. Los tokens de la Fase 2 (success/warning/error) todavía NO existen
// como utilidades Tailwind — solo como vars --color-* en un :root design-system
// (globals.css), no en el @theme. Reemplazar en la pasada de tokens del
// saneamiento CSS (ver GESTOR_TORNEOS_FASE2_CSS.md).

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface SummaryTabProps {
    data: TournamentRow;
    id: string;
    unionName?: string;
    matchCount?: number;
}

const tabHref = (id: string, tab: string) => `/admin/entities/${id}/manage?type=tournament&tab=${tab}`;

export function TournamentSummaryTab({ data, id, unionName, matchCount = 0 }: SummaryTabProps) {
    const [logoError, setLogoError] = useState(false);
    const isVisible = Boolean(data.is_visible);
    const statusLabel = (data.status || 'draft').toUpperCase();
    // sport_id es un slug ('football'...) → nombre legible; season_id es TEXT (año).
    // Ninguno es un UUID, así que no se muestra una cadena hexadecimal.
    const sportLabel = (data.sport_id && SPORTS[data.sport_id as keyof typeof SPORTS]?.nameEs)
        || data.sport_id?.toUpperCase() || '--';
    const showLogo = Boolean(data.logo_url) && !logoError;

    // Chequeos REALES derivables de props (0 requests). Participantes/Tabla NO se
    // muestran: necesitan fetch y no se fabrica su estado.
    const baseChecks = [
        { label: 'Identidad', ok: Boolean(data.name && data.slug) },
        { label: 'Formato', ok: Boolean(data.format) },
        { label: 'Tiene partidos', ok: matchCount > 0 },
        { label: 'Publicado', ok: isVisible },
    ];

    const healthIssues: Array<{ tone: 'warn' | 'err'; label: string; tab: string; cta: string }> = [];
    if (!data.slug) healthIssues.push({ tone: 'warn', label: 'Falta identificador (slug)', tab: 'detalles', cta: 'Asignar' });
    if (!data.union_id) healthIssues.push({ tone: 'err', label: 'Falta organizador asignado', tab: 'detalles', cta: 'Vincular' });
    // El formato competitivo se define en Estructura (TournamentStructureTab escribe
    // tournaments.format); el modulo Formato ya no existe en el gestor.
    if (!data.format) healthIssues.push({ tone: 'warn', label: 'Sin formato definido', tab: 'estructura', cta: 'Configurar' });
    const healthy = healthIssues.length === 0;

    const quickActions = [
        { icon: ListChecks, title: 'Cargar resultados', subtitle: 'Fixture y partidos', tab: 'operacion' },
        { icon: Users, title: 'Equipos', subtitle: 'Altas y plantel', tab: 'participantes' },
        { icon: Layers, title: 'Estructura', subtitle: 'Fases y formato', tab: 'estructura' },
        { icon: ClipboardList, title: 'Detalles', subtitle: 'Identidad y reglas', tab: 'detalles' },
    ];

    // Mismo lenguaje que el header: panel de borde fino y esquina de 4px,
    // rotulo mono en versalita, dato en tinta plena. Sin tarjetas redondeadas
    // ni repetir el nombre del torneo, que ya esta en la barra de arriba.
    return (
        <div className="summary-console">
            <section className="basalt-card summary-panel">
                <div className="summary-panel-head">
                    <span className="summary-panel-title">Estado</span>
                    <span className={`summary-flag ${isVisible ? 'is-public' : ''}`}>{isVisible ? 'Público' : 'Interno'}</span>
                </div>
                <div className="summary-identity">
                    <span className="summary-crest">
                        {showLogo ? (
                            <img
                                src={data.logo_url as string}
                                alt=""
                                loading="lazy"
                                onError={() => setLogoError(true)}
                            />
                        ) : (
                            <Trophy size={18} aria-hidden="true" />
                        )}
                    </span>
                    <span className="summary-identity-copy">
                        <strong title={data.name || 'Torneo sin nombre'}>{data.name || 'Torneo sin nombre'}</strong>
                        <small>{sportLabel} · {data.season_id || 'sin temporada'}{unionName ? ` · ${unionName}` : ''}</small>
                    </span>
                </div>
                <dl className="summary-stats">
                    <div>
                        <dt>Estado</dt>
                        <dd>{statusLabel}</dd>
                    </div>
                    <div>
                        <dt>Partidos</dt>
                        <dd>{matchCount}</dd>
                    </div>
                </dl>
            </section>

            {/* Datos base — chequeos REALES (props). Sin % agregado (evita el false-confiable). */}
            <section className="basalt-card summary-panel">
                <div className="summary-panel-head">
                    <span className="summary-panel-title">Datos base</span>
                    <span className="summary-panel-value">{baseChecks.filter((c) => c.ok).length}/{baseChecks.length}</span>
                </div>
                <ul className="summary-list">
                    {baseChecks.map((c) => (
                        <li key={c.label}>
                            {c.ok ? (
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" aria-hidden="true" />
                            ) : (
                                <Circle size={15} className="text-system-secondary shrink-0" aria-hidden="true" />
                            )}
                            <span className={c.ok ? '' : 'is-pending'}>{c.label}</span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Salud — REAL (props) */}
            <section className="basalt-card summary-panel">
                <div className="summary-panel-head">
                    <span className="summary-panel-title">Salud del torneo</span>
                    <span className={`summary-flag ${healthy ? 'is-ok' : 'is-warn'}`}>
                        {healthy ? 'Todo OK' : `${healthIssues.length} pendiente${healthIssues.length === 1 ? '' : 's'}`}
                    </span>
                </div>
                {healthy ? (
                    <p className="summary-empty">La información básica está completa.</p>
                ) : (
                    <ul className="summary-list">
                        {healthIssues.map((issue) => (
                            <li key={issue.label}>
                                {issue.tone === 'err' ? (
                                    <XCircle size={15} className="text-red-400 shrink-0" aria-hidden="true" />
                                ) : (
                                    <AlertTriangle size={15} className="text-amber-400 shrink-0" aria-hidden="true" />
                                )}
                                <span>{issue.label}</span>
                                <Link prefetch={false} href={tabHref(id, issue.tab)} className="summary-cta">{issue.cta}</Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Acciones rápidas — links REALES */}
            <section className="basalt-card summary-panel summary-panel-wide">
                <div className="summary-panel-head">
                    <span className="summary-panel-title">Acciones rápidas</span>
                </div>
                <div className="summary-actions">
                    {quickActions.map((a) => {
                        const Icon = a.icon;
                        return (
                            <Link key={a.tab} prefetch={false} href={tabHref(id, a.tab)} className="summary-action">
                                <span className="summary-action-glyph"><Icon size={17} /></span>
                                <span className="summary-action-copy">
                                    <strong>{a.title}</strong>
                                    <small>{a.subtitle}</small>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
