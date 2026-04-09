'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import styles from '@/app/prode/page.module.css';
import type { ProdeBaseCompetitionOption } from '@/lib/prode/types';

type CreatePrivateLeagueWizardProps = {
    competitions: ProdeBaseCompetitionOption[];
    catalogReady: boolean;
};

type StepIndex = 0 | 1 | 2;
type RuleTemplate = 'classic' | 'competitive' | 'casual';
type VisibilityMode = 'public' | 'private';
type CreationMode = 'quick' | 'advanced';

type TemplateConfig = {
    id: RuleTemplate;
    name: string;
    description: string;
    exact: number;
    winner: number;
    diff: number;
    minutes: number;
};

type LeagueCreatePayload = {
    name: string;
    description: string;
    visibility: VisibilityMode;
    selectedCompetition: ProdeBaseCompetitionOption;
    rules: {
        templateId: RuleTemplate;
        exact: number;
        winner: number;
        diff: number;
        minutes: number;
        doubleFinals: boolean;
    };
};

const TEMPLATES: TemplateConfig[] = [
    { id: 'classic', name: 'Prode clasico', description: 'Equilibrado y facil de explicar.', exact: 5, winner: 3, diff: 2, minutes: 15 },
    { id: 'competitive', name: 'Prode competitivo', description: 'Premia mas el marcador exacto.', exact: 6, winner: 3, diff: 2, minutes: 10 },
    { id: 'casual', name: 'Prode casual', description: 'Entrada rapida para grupos de amigos.', exact: 4, winner: 3, diff: 1, minutes: 20 },
];

const ADVANCED_STEP_LABELS = ['Base', 'Configuracion', 'Invitar'];

function makeInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makeShareUrl(code: string) {
    if (typeof window === 'undefined') {
        return `g22scores.com/prode/ligas/unirse?codigo=${code}`;
    }

    return `${window.location.origin}/prode/ligas/unirse?codigo=${encodeURIComponent(code)}`;
}

function getTemplateById(id: RuleTemplate) {
    return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}

function getCompetitionStatus(competition: ProdeBaseCompetitionOption) {
    if (competition.status === 'active') return 'Activa';
    if (competition.status === 'published') return 'Publicada';
    if (competition.status === 'finished') return 'Finalizada';
    if (competition.status === 'archived') return 'Archivada';
    return 'Disponible';
}

export default function CreatePrivateLeagueWizard({
    competitions,
    catalogReady,
}: CreatePrivateLeagueWizardProps) {
    const competitionsPerPage = 10;
    const { user, login } = useAuth();
    const [mode, setMode] = useState<CreationMode>('quick');
    const [step, setStep] = useState<StepIndex>(0);
    const [leagueName, setLeagueName] = useState('');
    const [sportFilter, setSportFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [competitionPage, setCompetitionPage] = useState(1);
    const [competitionId, setCompetitionId] = useState<string>(competitions[0]?.id || '');
    const [visibility, setVisibility] = useState<VisibilityMode>('private');
    const [description, setDescription] = useState('');
    const [templateId, setTemplateId] = useState<RuleTemplate>('classic');
    const [customizeRules, setCustomizeRules] = useState(false);
    const [pointsExact, setPointsExact] = useState<number>(5);
    const [pointsWinner, setPointsWinner] = useState<number>(3);
    const [pointsDiff, setPointsDiff] = useState<number>(2);
    const [lockMinutes, setLockMinutes] = useState<number>(15);
    const [doubleFinals, setDoubleFinals] = useState(false);
    const [inviteCode] = useState(makeInviteCode);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);
    const [createdState, setCreatedState] = useState<null | { inviteCode: string; shareUrl: string; leagueUrl: string }>(null);

    const sportOptions = useMemo(() => {
        const uniqueSports = new Map<string, string>();

        competitions.forEach((competition) => {
            const sportKey = competition.sportId || competition.sportLabel || 'other';
            const sportLabel = competition.sportLabel || 'Otros';
            if (!uniqueSports.has(sportKey)) {
                uniqueSports.set(sportKey, sportLabel);
            }
        });

        return [
            { value: 'all', label: 'Todos' },
            ...Array.from(uniqueSports.entries())
                .sort((left, right) => left[1].localeCompare(right[1], 'es'))
                .map(([value, label]) => ({ value, label })),
        ];
    }, [competitions]);

    const filteredCompetitions = useMemo(() => {
        const baseCompetitions = sportFilter === 'all'
            ? competitions
            : competitions.filter((competition) => (competition.sportId || competition.sportLabel || 'other') === sportFilter);
        const normalizedSearch = searchTerm.trim().toLowerCase();

        if (!normalizedSearch) {
            return baseCompetitions;
        }

        return baseCompetitions.filter((competition) => {
            const haystack = [
                competition.displayName,
                competition.name,
                competition.sportLabel,
                competition.countryLabel,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(normalizedSearch);
        });
    }, [competitions, searchTerm, sportFilter]);

    const competitionPageCount = Math.max(1, Math.ceil(filteredCompetitions.length / competitionsPerPage));
    const paginatedCompetitions = useMemo(() => {
        const safePage = Math.min(competitionPage, competitionPageCount);
        const startIndex = (safePage - 1) * competitionsPerPage;
        return filteredCompetitions.slice(startIndex, startIndex + competitionsPerPage);
    }, [competitionPage, competitionPageCount, filteredCompetitions]);

    useEffect(() => {
        setCompetitionPage(1);
    }, [searchTerm, sportFilter]);

    useEffect(() => {
        setCompetitionPage((current) => Math.min(current, competitionPageCount));
    }, [competitionPageCount]);

    useEffect(() => {
        if (!filteredCompetitions.length) {
            return;
        }

        const selectionStillVisible = filteredCompetitions.some((competition) => competition.id === competitionId);
        if (!selectionStillVisible) {
            setCompetitionId(filteredCompetitions[0].id);
        }
    }, [competitionId, filteredCompetitions]);

    const selectedCompetition = useMemo(
        () => competitions.find((competition) => competition.id === competitionId) ?? null,
        [competitionId, competitions],
    );

    const template = useMemo(() => getTemplateById(templateId), [templateId]);
    const totalSteps = mode === 'advanced' ? 3 : 1;
    const currentStepNumber = mode === 'advanced' ? step + 1 : 1;
    const currentStepLabel = mode === 'advanced' ? ADVANCED_STEP_LABELS[step] : 'Base';
    const canContinueBase = Boolean(competitionId);

    const previewRules = useMemo(() => ({
        exact: customizeRules ? pointsExact : template.exact,
        winner: customizeRules ? pointsWinner : template.winner,
        diff: customizeRules ? pointsDiff : template.diff,
        minutes: customizeRules ? lockMinutes : template.minutes,
        mode: template.name,
        doubleFinals,
    }), [customizeRules, doubleFinals, lockMinutes, pointsDiff, pointsExact, pointsWinner, template]);

    const previewName = leagueName.trim() || `${selectedCompetition?.displayName || 'Nueva liga'} - Mi liga`;
    const invitePreviewUrl = makeShareUrl(inviteCode);
    const quickModeReady = Boolean(selectedCompetition);

    function syncTemplate(nextTemplateId: RuleTemplate) {
        const nextTemplate = getTemplateById(nextTemplateId);
        setTemplateId(nextTemplateId);
        if (!customizeRules) {
            setPointsExact(nextTemplate.exact);
            setPointsWinner(nextTemplate.winner);
            setPointsDiff(nextTemplate.diff);
            setLockMinutes(nextTemplate.minutes);
        }
    }

    function switchMode(nextMode: CreationMode) {
        setMode(nextMode);
        setStep(0);
        setSubmitError(null);
    }

    function buildPayload(competition: ProdeBaseCompetitionOption, overrides?: Partial<LeagueCreatePayload>): LeagueCreatePayload {
        return {
            name: overrides?.name || previewName,
            description: overrides?.description ?? description,
            visibility: overrides?.visibility ?? visibility,
            selectedCompetition: overrides?.selectedCompetition ?? competition,
            rules: overrides?.rules ?? {
                templateId,
                exact: previewRules.exact,
                winner: previewRules.winner,
                diff: previewRules.diff,
                minutes: previewRules.minutes,
                doubleFinals,
            },
        };
    }

    function goNext() {
        if (step === 0 && canContinueBase) {
            setStep(1);
            return;
        }
        if (step === 1) {
            setStep(2);
        }
    }

    function goBack() {
        setStep((current) => Math.max(0, current - 1) as StepIndex);
    }

    async function copyToClipboard(value: string, target: 'code' | 'link') {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        await navigator.clipboard.writeText(value);
        setCopiedTarget(target);
        window.setTimeout(() => {
            setCopiedTarget((current) => (current === target ? null : current));
        }, 1600);
    }

    async function submitLeague(payload: LeagueCreatePayload) {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
            });

            const result = await response.json() as { error?: string; inviteCode?: string; shareUrl?: string; leagueUrl?: string };

            if (!response.ok || !result.inviteCode || !result.shareUrl || !result.leagueUrl) {
                throw new Error(result.error || 'No se pudo crear la liga.');
            }

            setCreatedState({
                inviteCode: result.inviteCode,
                shareUrl: result.shareUrl,
                leagueUrl: result.leagueUrl,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear la liga.';
            setSubmitError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleQuickCreate() {
        const competition = selectedCompetition ?? filteredCompetitions[0] ?? competitions[0] ?? null;
        if (!competition) return;

        await submitLeague({
            name: leagueName.trim() || `${competition.displayName} - Mi liga`,
            description: description.trim() || 'Liga privada creada para competir rapido con amigos.',
            visibility: 'private',
            selectedCompetition: competition,
            rules: {
                templateId: 'classic',
                exact: 5,
                winner: 3,
                diff: 2,
                minutes: 15,
                doubleFinals: false,
            },
        });
    }

    async function handleCreateLeague() {
        if (!selectedCompetition) return;
        await submitLeague(buildPayload(selectedCompetition));
    }

    if (!user) {
        return (
            <div className={styles.createPageShell}>
                <div className={styles.createGate}>
                    <div className={styles.createGateCopy}>
                        <p className={styles.createGateEyebrow}>Cuenta requerida</p>
                        <h1 className={styles.createGateTitle}>Para jugar y crear ligas tenes que estar registrado.</h1>
                        <p className={styles.createGateText}>
                            El prode necesita usuarios autenticados para guardar picks, membresias y codigos de invitacion.
                        </p>
                        <div className={styles.createGateActions}>
                            <button type="button" className={styles.posterPrimaryCta} onClick={() => login('fan', '/prode/ligas/nueva')}>
                                Iniciar sesion
                            </button>
                            <Link href="/register" className={styles.posterSecondaryCta}>
                                Crear cuenta
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (createdState && selectedCompetition) {
        return (
            <div className={styles.createPageShell}>
                <div className={styles.createSuccessShell}>
                    <div className={styles.createSuccessCopy}>
                        <p className={styles.privateLeagueEyebrow}>Tu liga esta lista</p>
                        <h1 className={styles.privateLeagueTitle}>{previewName}</h1>
                        <p className={styles.privateLeagueText}>
                            Ya quedo creada dentro de {selectedCompetition.displayName}. Desde aca podes copiar el acceso y entrar directo a jugar.
                        </p>
                    </div>

                    <div className={styles.previewCard}>
                        <p className={styles.previewEyebrow}>Resumen</p>
                        <h2 className={styles.previewTitle}>{selectedCompetition.displayName}</h2>
                        <div className={styles.previewPills}>
                            <span className={styles.metaTag}>{visibility === 'private' ? 'Privada con codigo' : 'Publica'}</span>
                            <span className={styles.metaTag}>{previewRules.mode}</span>
                            {selectedCompetition.sportLabel ? <span className={styles.metaTag}>{selectedCompetition.sportLabel}</span> : null}
                        </div>
                        <div className={styles.previewRuleList}>
                            <div className={styles.previewRuleRow}><span>Resultado correcto</span><strong>{previewRules.winner} pts</strong></div>
                            <div className={styles.previewRuleRow}><span>Marcador exacto</span><strong>{previewRules.exact} pts</strong></div>
                            <div className={styles.previewRuleRow}><span>Diferencia</span><strong>{previewRules.diff} pts</strong></div>
                            <div className={styles.previewRuleRow}><span>Cierre</span><strong>{previewRules.minutes} min antes</strong></div>
                        </div>
                    </div>

                    <div className={styles.inviteResultCard}>
                        <span className={styles.inviteResultLabel}>Codigo de acceso</span>
                        <strong className={styles.inviteResultCode}>{createdState.inviteCode}</strong>
                        <span className={styles.inviteResultLink}>{createdState.shareUrl}</span>
                        <div className={styles.inviteResultActions}>
                            <button
                                type="button"
                                className={styles.posterPrimaryCta}
                                onClick={() => void copyToClipboard(createdState.inviteCode, 'code')}
                            >
                                {copiedTarget === 'code' ? 'Codigo copiado' : 'Copiar codigo'}
                            </button>
                            <button
                                type="button"
                                className={styles.posterSecondaryCta}
                                onClick={() => void copyToClipboard(createdState.shareUrl, 'link')}
                            >
                                {copiedTarget === 'link' ? 'Link copiado' : 'Copiar link'}
                            </button>
                            <a
                                href={`https://wa.me/?text=${encodeURIComponent(`Sumate a ${previewName}: ${createdState.shareUrl}`)}`}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.posterSecondaryCta}
                            >
                                WhatsApp
                            </a>
                        </div>
                    </div>

                    <div className={styles.successNote}>
                        Ya quedaste registrado como administrador y primer miembro de la liga.
                    </div>

                    <div className={styles.inviteResultActions}>
                        <Link href={createdState.leagueUrl} className={styles.posterPrimaryCta}>
                            Ir a la liga
                        </Link>
                        <Link href="/prode" className={styles.posterSecondaryCta}>
                            Volver al hub
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (competitions.length === 0) {
        return (
            <div className={styles.createPageShell}>
                {!catalogReady ? (
                    <div className={styles.warning}>
                        No se pudo cargar el catalogo unificado de competencias para crear ligas.
                    </div>
                ) : null}
                <div className={styles.empty}>
                    No encontramos competencias disponibles ni en la API ni en la base local.
                </div>
            </div>
        );
    }

    return (
        <div className={styles.createPageShell}>
            <section className={styles.wizardPanel}>
                <div className={styles.wizardHeader}>
                    <div className={styles.wizardHeaderCopy}>
                        <p className={styles.privateLeagueEyebrow}>Liga privada</p>
                        <h1 className={styles.privateLeagueTitle}>Crear liga</h1>
                        <p className={styles.privateLeagueText}>
                            Elegi torneo, defini el formato y sali a invitar sin vueltas.
                        </p>
                    </div>

                    <div className={styles.modeSwitch} role="tablist" aria-label="Modo de creacion">
                        <button
                            type="button"
                            className={`${styles.modeSwitchBtn} ${mode === 'quick' ? styles.modeSwitchBtnActive : ''}`}
                            onClick={() => switchMode('quick')}
                        >
                            Rapido
                        </button>
                        <button
                            type="button"
                            className={`${styles.modeSwitchBtn} ${mode === 'advanced' ? styles.modeSwitchBtnActive : ''}`}
                            onClick={() => switchMode('advanced')}
                        >
                            Avanzado
                        </button>
                    </div>
                </div>

                <div className={styles.wizardProgress}>
                    <div>
                        <p className={styles.wizardProgressLabel}>Paso {currentStepNumber} de {totalSteps}</p>
                        <strong className={styles.wizardProgressTitle}>{mode === 'quick' ? 'Base de la liga' : currentStepLabel}</strong>
                    </div>
                    {mode === 'advanced' ? (
                        <div className={styles.wizardProgressDots} aria-hidden="true">
                            {ADVANCED_STEP_LABELS.map((label, index) => (
                                <span
                                    key={label}
                                    className={`${styles.wizardProgressDot} ${step === index ? styles.wizardProgressDotActive : ''} ${step > index ? styles.wizardProgressDotDone : ''}`}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>

                {step === 0 ? (
                    <div className={styles.formStep}>
                            <div className={styles.formField}>
                                <label className={styles.formLabel} htmlFor="league-name">Nombre de la liga</label>
                                <input
                                    id="league-name"
                                    className={styles.formInput}
                                    value={leagueName}
                                    onChange={(event) => setLeagueName(event.target.value)}
                                    placeholder="Ej: Prode amigos del laburo"
                                />
                                <span className={styles.fieldHint}>Si no lo completas, usamos un nombre sugerido con el torneo elegido.</span>
                            </div>

                            <div className={styles.formField}>
                                <span className={styles.formLabel}>Deporte</span>
                                <div className={styles.filterBar}>
                                    {sportOptions.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={`${styles.filterChip} ${sportFilter === option.value ? styles.filterChipActive : ''}`}
                                            onClick={() => setSportFilter(option.value)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.formField}>
                                <label className={styles.formLabel} htmlFor="competition-search">Buscar torneo</label>
                                <input
                                    id="competition-search"
                                    type="search"
                                    className={styles.formInput}
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Buscar liga o torneo"
                                />
                                {filteredCompetitions.length ? (
                                    <div className={styles.competitionSearchMeta}>
                                        <span>{filteredCompetitions.length} ligas encontradas</span>
                                        <span>Pagina {competitionPage} de {competitionPageCount}</span>
                                    </div>
                                ) : null}
                                <div className={styles.competitionChoiceGrid}>
                                    {paginatedCompetitions.length ? paginatedCompetitions.map((competition) => (
                                        <button
                                            key={competition.id}
                                            type="button"
                                            className={`${styles.competitionChoice} ${competitionId === competition.id ? styles.competitionChoiceActive : ''}`}
                                            onClick={() => setCompetitionId(competition.id)}
                                        >
                                            {competition.logoUrl ? (
                                                <img
                                                    src={competition.logoUrl}
                                                    alt={`Logo de ${competition.displayName}`}
                                                    className={styles.competitionChoiceLogo}
                                                    width={28}
                                                    height={28}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className={styles.competitionChoiceLogoFallback} aria-hidden="true">
                                                    {competition.displayName.slice(0, 1)}
                                                </div>
                                            )}
                                            <div className={styles.competitionChoiceCopy}>
                                                <strong>{competition.displayName}</strong>
                                                <span>{competition.sportLabel || 'Competencia general'} - {competition.countryLabel || 'Cobertura general'}</span>
                                            </div>
                                            <small>{getCompetitionStatus(competition)}</small>
                                        </button>
                                    )) : (
                                        <div className={styles.empty}>
                                            No hay competencias para este deporte en este momento.
                                        </div>
                                    )}
                                </div>
                                {filteredCompetitions.length > competitionsPerPage ? (
                                    <div className={styles.paginationBar}>
                                        <button
                                            type="button"
                                            className={styles.paginationBtn}
                                            onClick={() => setCompetitionPage((current) => Math.max(1, current - 1))}
                                            disabled={competitionPage === 1}
                                        >
                                            Anterior
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.paginationBtn}
                                            onClick={() => setCompetitionPage((current) => Math.min(competitionPageCount, current + 1))}
                                            disabled={competitionPage === competitionPageCount}
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                    </div>
                ) : null}

                {mode === 'advanced' && step === 1 ? (
                    <div className={styles.formStep}>
                            <div className={styles.formField}>
                                <span className={styles.formLabel}>Visibilidad</span>
                                <div className={styles.toggleRow}>
                                    <button type="button" className={`${styles.togglePill} ${visibility === 'public' ? styles.togglePillActive : ''}`} onClick={() => setVisibility('public')}>
                                        Publica
                                    </button>
                                    <button type="button" className={`${styles.togglePill} ${visibility === 'private' ? styles.togglePillActive : ''}`} onClick={() => setVisibility('private')}>
                                        Privada con codigo
                                    </button>
                                </div>
                            </div>

                            <div className={styles.formField}>
                                <label className={styles.formLabel} htmlFor="league-description">Descripcion</label>
                                <textarea
                                    id="league-description"
                                    className={styles.formTextarea}
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    placeholder="Invita a tus amigos y compitan fecha a fecha."
                                    rows={4}
                                />
                            </div>

                            <div className={styles.formField}>
                                <span className={styles.formLabel}>Sistema de puntos</span>
                                <div className={styles.templateGrid}>
                                    {TEMPLATES.map((currentTemplate) => (
                                        <button
                                            key={currentTemplate.id}
                                            type="button"
                                            className={`${styles.templateCard} ${templateId === currentTemplate.id ? styles.templateCardActive : ''}`}
                                            onClick={() => syncTemplate(currentTemplate.id)}
                                        >
                                            <strong>{currentTemplate.name}</strong>
                                            <span>{currentTemplate.description}</span>
                                            <small>Exacto {currentTemplate.exact} - Resultado {currentTemplate.winner} - Diff {currentTemplate.diff}</small>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.ruleHeader}>
                                <span className={styles.formLabel}>Personalizar reglas</span>
                                <button type="button" className={`${styles.togglePill} ${customizeRules ? styles.togglePillActive : ''}`} onClick={() => setCustomizeRules((current) => !current)}>
                                    {customizeRules ? 'Modo avanzado activo' : 'Usar defaults'}
                                </button>
                            </div>

                            <div className={styles.ruleGrid}>
                                <div className={styles.ruleCard}>
                                    <label className={styles.formLabel} htmlFor="points-winner">Resultado correcto</label>
                                    <input id="points-winner" type="number" className={styles.formInput} value={customizeRules ? pointsWinner : template.winner} onChange={(event) => setPointsWinner(Number(event.target.value))} disabled={!customizeRules} />
                                </div>
                                <div className={styles.ruleCard}>
                                    <label className={styles.formLabel} htmlFor="points-exact">Marcador exacto</label>
                                    <input id="points-exact" type="number" className={styles.formInput} value={customizeRules ? pointsExact : template.exact} onChange={(event) => setPointsExact(Number(event.target.value))} disabled={!customizeRules} />
                                </div>
                                <div className={styles.ruleCard}>
                                    <label className={styles.formLabel} htmlFor="points-diff">Diferencia</label>
                                    <input id="points-diff" type="number" className={styles.formInput} value={customizeRules ? pointsDiff : template.diff} onChange={(event) => setPointsDiff(Number(event.target.value))} disabled={!customizeRules} />
                                </div>
                                <div className={styles.ruleCard}>
                                    <label className={styles.formLabel} htmlFor="lock-minutes">Cierre de picks</label>
                                    <input id="lock-minutes" type="number" className={styles.formInput} value={customizeRules ? lockMinutes : template.minutes} onChange={(event) => setLockMinutes(Number(event.target.value))} disabled={!customizeRules} />
                                </div>
                            </div>

                            <label className={styles.checkboxRow}>
                                <input type="checkbox" checked={doubleFinals} onChange={(event) => setDoubleFinals(event.target.checked)} />
                                <span>Doble puntaje en finales</span>
                            </label>
                    </div>
                ) : null}

                {mode === 'advanced' && step === 2 ? (
                    <div className={styles.formStep}>
                            <div className={styles.inviteCodeCard}>
                                <span className={styles.inviteResultLabel}>Codigo de acceso</span>
                                <strong className={styles.inviteResultCode}>{inviteCode}</strong>
                                <span className={styles.inviteResultLink}>{invitePreviewUrl}</span>
                            </div>

                            <div className={styles.previewCard}>
                                <p className={styles.previewEyebrow}>Resumen final</p>
                                <h2 className={styles.previewTitle}>{previewName}</h2>
                                <p className={styles.previewMeta}>
                                    Basado en: <strong>{selectedCompetition?.displayName || 'Elegi una competencia'}</strong>
                                </p>
                                <div className={styles.previewPills}>
                                    <span className={styles.metaTag}>{visibility === 'private' ? 'Privada con codigo' : 'Publica'}</span>
                                    <span className={styles.metaTag}>{previewRules.mode}</span>
                                    {selectedCompetition?.sportLabel ? <span className={styles.metaTag}>{selectedCompetition.sportLabel}</span> : null}
                                </div>
                                <div className={styles.previewRuleList}>
                                    <div className={styles.previewRuleRow}><span>Resultado correcto</span><strong>{previewRules.winner} pts</strong></div>
                                    <div className={styles.previewRuleRow}><span>Marcador exacto</span><strong>{previewRules.exact} pts</strong></div>
                                    <div className={styles.previewRuleRow}><span>Diferencia</span><strong>{previewRules.diff} pts</strong></div>
                                    <div className={styles.previewRuleRow}><span>Cierre</span><strong>{previewRules.minutes} min antes</strong></div>
                                </div>
                                {description.trim() ? <p className={styles.previewDescription}>{description}</p> : null}
                            </div>

                            <div className={styles.inviteHintGrid}>
                                <button
                                    type="button"
                                    className={styles.inviteHintCard}
                                    onClick={() => void copyToClipboard(inviteCode, 'code')}
                                >
                                    <strong>Copiar codigo</strong>
                                    <span>{copiedTarget === 'code' ? 'Codigo copiado al portapapeles.' : 'Ideal para pasarlo por grupo o mensaje.'}</span>
                                </button>
                                <button
                                    type="button"
                                    className={styles.inviteHintCard}
                                    onClick={() => void copyToClipboard(invitePreviewUrl, 'link')}
                                >
                                    <strong>Copiar link</strong>
                                    <span>{copiedTarget === 'link' ? 'Link copiado al portapapeles.' : 'Entra con el codigo ya cargado.'}</span>
                                </button>
                                <a
                                    href={`https://wa.me/?text=${encodeURIComponent(`Sumate a ${previewName}: ${invitePreviewUrl}`)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.inviteHintCard}
                                >
                                    <strong>Compartir por WhatsApp</strong>
                                    <span>Abre el mensaje listo para mandar la invitacion.</span>
                                </a>
                            </div>
                    </div>
                ) : null}

                <div className={styles.wizardActions}>
                    {mode === 'advanced' ? (
                        <>
                            <button type="button" className={styles.posterSecondaryCta} onClick={goBack} disabled={step === 0}>
                                Volver
                            </button>

                            {step < 2 ? (
                                <button type="button" className={styles.posterPrimaryCta} onClick={goNext} disabled={step === 0 && !canContinueBase}>
                                    Continuar
                                </button>
                            ) : (
                                <button type="button" className={styles.posterPrimaryCta} onClick={() => void handleCreateLeague()} disabled={isSubmitting || !selectedCompetition}>
                                    {isSubmitting ? 'Creando...' : 'Crear liga'}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button type="button" className={styles.posterSecondaryCta} onClick={() => switchMode('advanced')}>
                                Configurar mas
                            </button>
                            <button type="button" className={styles.posterPrimaryCta} onClick={() => void handleQuickCreate()} disabled={isSubmitting || !quickModeReady}>
                                {isSubmitting ? 'Creando...' : 'Crear liga'}
                            </button>
                        </>
                    )}
                </div>

                {submitError ? <div className={styles.warning}>{submitError}</div> : null}
            </section>
        </div>
    );
}
