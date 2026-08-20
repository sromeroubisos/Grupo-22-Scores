'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Image as ImageIcon, Palette, Sparkles, Zap } from 'lucide-react';
import type { Database } from '@/lib/database.types';
import type { ClubDashboardMatch, ClubDashboardStanding } from '@/lib/club-admin/dashboard-types';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubContentStudioTabProps {
    data: Partial<ClubRow>;
    upcomingMatches: ClubDashboardMatch[];
    standings: ClubDashboardStanding[];
}

const TEMPLATE_OPTIONS = [
    { id: 'proximo', label: 'Proximo partido' },
    { id: 'resultado', label: 'Resultado final' },
    { id: 'formacion', label: 'Formacion' },
    { id: 'tabla', label: 'Tabla de posiciones' },
] as const;

type TemplateId = (typeof TEMPLATE_OPTIONS)[number]['id'];

export function ClubContentStudioTab({ data, upcomingMatches, standings }: ClubContentStudioTabProps) {
    const [activeTemplate, setActiveTemplate] = useState<TemplateId>('proximo');

    const nextMatch = upcomingMatches[0] ?? null;
    const currentStanding = standings[0] ?? null;

    const previewCopy = useMemo(() => {
        if (activeTemplate === 'resultado') {
            return {
                eyebrow: 'Post partido',
                title: `${data.short_name || data.name || 'Club'} cerro otra jornada`,
                detail: currentStanding
                    ? `Posicion actual #${currentStanding.position ?? '-'} en ${currentStanding.tournamentName}`
                    : 'Listo para publicar el score y activar sponsors.',
            };
        }

        if (activeTemplate === 'formacion') {
            return {
                eyebrow: 'Plantel confirmado',
                title: `Formacion ${data.short_name || 'Club'}`,
                detail: 'Lista rapida, visual sponsor-ready y salida instantanea para redes.',
            };
        }

        if (activeTemplate === 'tabla') {
            return {
                eyebrow: 'Competencia',
                title: currentStanding ? `${currentStanding.tournamentName}` : 'Tabla de posiciones',
                detail: currentStanding
                    ? `Puesto #${currentStanding.position ?? '-'} / ${currentStanding.points} pts`
                    : 'Publica posicion, forma y contexto del torneo desde la base de datos.',
            };
        }

        return {
            eyebrow: 'Proximo partido',
            title: nextMatch
                ? `${data.short_name || data.name || 'Club'} vs ${nextMatch.opponentShortName || nextMatch.opponentName}`
                : `${data.short_name || data.name || 'Club'} en agenda`,
            detail: nextMatch?.tournament?.name || 'Genera piezas listas para Instagram, sponsor y web del club.',
        };
    }, [activeTemplate, currentStanding, data.name, data.short_name, nextMatch]);

    return (
        <div className="club-ops-grid">
            <section className="club-ops-panel club-ops-preview">
                <div className="club-ops-panel-header">
                    <div>
                        <div className="card-title">Contenido y exports</div>
                        <p className="club-ops-subtext">Preview local desacoplado del guardado para evitar resets visuales.</p>
                    </div>
                    <div className="club-ui-pill">G22 Studio</div>
                </div>

                <div className="content-preview-canvas">
                    <div className="content-preview-noise" />
                    <div className="content-preview-topline">
                        <span>{previewCopy.eyebrow}</span>
                        <span className="club-preview-color-chip" style={{ background: data.primary_color || 'var(--club-primary)' }} />
                    </div>
                    <div className="content-preview-body">
                        <div className="content-preview-brand">{data.short_name || 'G22'}</div>
                        <h2>{previewCopy.title}</h2>
                        <p>{previewCopy.detail}</p>
                    </div>
                    <div className="content-preview-footer">
                        <span>{data.name || 'Club listo para publicar'}</span>
                        <span>{activeTemplate.toUpperCase()}</span>
                    </div>
                </div>

                <div className="content-template-strip">
                    {TEMPLATE_OPTIONS.map((template) => {
                        const isActive = template.id === activeTemplate;
                        return (
                            <button
                                key={template.id}
                                type="button"
                                className={`content-template-chip ${isActive ? 'active' : ''}`}
                                onClick={() => setActiveTemplate(template.id)}
                            >
                                {template.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="club-ops-panel">
                <div className="club-ops-panel-header">
                    <div>
                        <div className="card-title">Piezas rapidas</div>
                        <p className="club-ops-subtext">Activos clave para sponsors, Instagram y web.</p>
                    </div>
                </div>

                <div className="content-ops-list">
                    <div className="content-ops-item">
                        <CalendarDays className="w-4 h-4" />
                        <div>
                            <strong>Proximo partido</strong>
                            <span>Partido, sede y horario sincronizados desde fixture.</span>
                        </div>
                    </div>
                    <div className="content-ops-item">
                        <Zap className="w-4 h-4" />
                        <div>
                            <strong>Resultado final</strong>
                            <span>Ideal para publicar cierre, score y badge de sponsors.</span>
                        </div>
                    </div>
                    <div className="content-ops-item">
                        <ImageIcon className="w-4 h-4" />
                        <div>
                            <strong>Formacion</strong>
                            <span>Sale del plantel activo y queda lista para validacion interna.</span>
                        </div>
                    </div>
                    <div className="content-ops-item">
                        <Palette className="w-4 h-4" />
                        <div>
                            <strong>Tabla de posiciones</strong>
                            <span>Usa branding G22 y colores del club sin romper consistencia visual.</span>
                        </div>
                    </div>
                </div>

                <div className="content-kpis">
                    <div className="content-kpi">
                        <span className="content-kpi-label">Templates</span>
                        <strong>{TEMPLATE_OPTIONS.length}</strong>
                    </div>
                    <div className="content-kpi">
                        <span className="content-kpi-label">Partidos futuros</span>
                        <strong>{upcomingMatches.length}</strong>
                    </div>
                    <div className="content-kpi">
                        <span className="content-kpi-label">Competencias</span>
                        <strong>{standings.length}</strong>
                    </div>
                </div>

                <button type="button" className="btn btn-primary club-ops-primary">
                    <Sparkles className="w-4 h-4" />
                    Abrir export social
                </button>
            </section>
        </div>
    );
}
