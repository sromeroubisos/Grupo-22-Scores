'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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

type TemplateConfig = {
    id: RuleTemplate;
    name: string;
    description: string;
    exact: number;
    winner: number;
    diff: number;
    minutes: number;
};

const TEMPLATES: TemplateConfig[] = [
    { id: 'classic', name: 'Prode clasico', description: 'Equilibrado y facil de explicar.', exact: 5, winner: 3, diff: 2, minutes: 15 },
    { id: 'competitive', name: 'Prode competitivo', description: 'Premia mas el marcador exacto.', exact: 6, winner: 3, diff: 2, minutes: 10 },
    { id: 'casual', name: 'Prode casual', description: 'Entrada rapida para grupos de amigos.', exact: 4, winner: 3, diff: 1, minutes: 20 },
];

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
    const { user, login } = useAuth();
    const [step, setStep] = useState<StepIndex>(0);
    const [leagueName, setLeagueName] = useState('');
    const [sportFilter, setSportFilter] = useState<string>('all');
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

    const filteredCompetitions = useMemo(() => (
        sportFilter === 'all'
            ? competitions
            : competitions.filter((competition) => (competition.sportId || competition.sportLabel || 'other') === sportFilter)
    ), [competitions, sportFilter]);

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
    const canContinueConfig = Boolean(leagueName.trim()) && Boolean(competitionId);

    const previewRules = useMemo(() => ({
        exact: customizeRules ? pointsExact : template.exact,
        winner: customizeRules ? pointsWinner : template.winner,
        diff: customizeRules ? pointsDiff : template.diff,
        minutes: customizeRules ? lockMinutes : template.minutes,
        mode: template.name,
        doubleFinals,
    }), [customizeRules, doubleFinals, lockMinutes, pointsDiff, pointsExact, pointsWinner, template]);

    const previewName = leagueName.trim() || 'Tu liga privada';

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

    function handleQuickCreate() {
        const firstCompetition = filteredCompetitions[0] || competitions[0];
        if (!firstCompetition) return;

        setLeagueName((current) => current || `${firstCompetition.displayName} - Mi liga`);
        setCompetitionId(firstCompetition.id);
        setVisibility('private');
        setDescription((current) => current || 'Liga privada creada para competir con amigos.');
        setTemplateId('classic');
        setCustomizeRules(false);
        setPointsExact(5);
        setPointsWinner(3);
        setPointsDiff(2);
        setLockMinutes(15);
        setDoubleFinals(false);
        setStep(2);
    }

    function goNext() {
        if (step === 0 && canContinueConfig) {
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

    async function handleCreateLeague() {
        if (!selectedCompetition) return;

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    name: previewName,
                    description,
                    visibility,
                    selectedCompetition,
                    rules: {
                        templateId,
                        exact: previewRules.exact,
                        winner: previewRules.winner,
                        diff: previewRules.diff,
                        minutes: previewRules.minutes,
                        doubleFinals,
                    },
                }),
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
                        <p className={styles.privateLeagueEyebrow}>Liga creada</p>
                        <h1 className={styles.privateLeagueTitle}>{previewName}</h1>
                        <p className={styles.privateLeagueText}>
                            Tu liga nace dentro de {selectedCompetition.displayName} y genera un codigo unico para invitar.
                        </p>
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
                        </div>
                    </div>

                    <div className={styles.successNote}>
                        Ya quedaste registrado como owner y primer miembro de la liga.
                    </div>

                    <div className={styles.inviteResultActions}>
                        <Link href={createdState.leagueUrl} className={styles.posterPrimaryCta}>
                            Entrar a jugar
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
            <div className={styles.wizardLayout}>
                <section className={styles.wizardPanel}>
                    <div className={styles.wizardHeader}>
                        <div>
                            <p className={styles.privateLeagueEyebrow}>Crear tu liga en 30 segundos</p>
                            <h1 className={styles.privateLeagueTitle}>Wizard de liga privada</h1>
                            <p className={styles.privateLeagueText}>
                                Flujo corto para crear, invitar y arrancar a competir sin configuraciones tecnicas.
                            </p>
                        </div>
                        <button type="button" className={styles.quickCreateBtn} onClick={handleQuickCreate}>
                            Crear liga rapida
                        </button>
                    </div>

                    <div className={styles.stepper}>
                        {['Configuracion', 'Reglas', 'Invitar'].map((label, index) => (
                            <div
                                key={label}
                                className={`${styles.stepperItem} ${step === index ? styles.stepperItemActive : ''} ${step > index ? styles.stepperItemDone : ''}`}
                            >
                                <span className={styles.stepperIndex}>{index + 1}</span>
                                <span className={styles.stepperLabel}>{label}</span>
                            </div>
                        ))}
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
                                    placeholder="Ej: Prode Salida de 22"
                                />
                            </div>

                            <div className={styles.formField}>
                                <span className={styles.formLabel}>Competencia base</span>
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
                                <div className={styles.competitionChoiceGrid}>
                                    {filteredCompetitions.length ? filteredCompetitions.map((competition) => (
                                        <button
                                            key={competition.id}
                                            type="button"
                                            className={`${styles.competitionChoice} ${competitionId === competition.id ? styles.competitionChoiceActive : ''}`}
                                            onClick={() => setCompetitionId(competition.id)}
                                        >
                                            <div className={styles.competitionChoiceHeader}>
                                                {competition.logoUrl ? (
                                                    <Image
                                                        src={competition.logoUrl}
                                                        alt={`Logo de ${competition.displayName}`}
                                                        className={styles.competitionChoiceLogo}
                                                        width={46}
                                                        height={46}
                                                    />
                                                ) : (
                                                    <div className={styles.competitionChoiceLogoFallback} aria-hidden="true">
                                                        {competition.displayName.slice(0, 1)}
                                                    </div>
                                                )}
                                                <div className={styles.competitionChoiceCopy}>
                                                    <strong>{competition.displayName}</strong>
                                                    <span>{getCompetitionStatus(competition)}</span>
                                                </div>
                                            </div>
                                            <small>{competition.sportLabel || 'Competencia general'}</small>
                                            <small>{competition.countryLabel || 'Cobertura general'}</small>
                                        </button>
                                    )) : (
                                        <div className={styles.empty}>
                                            No hay competencias para este deporte en este momento.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={styles.inlineFieldGrid}>
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
                                        placeholder="Invita a tus amigos y compitan cada fecha."
                                        rows={4}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {step === 1 ? (
                        <div className={styles.formStep}>
                            <div className={styles.formField}>
                                <span className={styles.formLabel}>Plantilla de reglas</span>
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
                                    {customizeRules ? 'Modo avanzado' : 'Usar defaults'}
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

                    {step === 2 ? (
                        <div className={styles.formStep}>
                            <div className={styles.inviteCodeCard}>
                                <span className={styles.inviteResultLabel}>Codigo de acceso</span>
                                <strong className={styles.inviteResultCode}>{inviteCode}</strong>
                                <span className={styles.inviteResultLink}>{makeShareUrl(inviteCode)}</span>
                            </div>

                            <div className={styles.inviteHintGrid}>
                                <button
                                    type="button"
                                    className={styles.inviteHintCard}
                                    onClick={() => void copyToClipboard(inviteCode, 'code')}
                                >
                                    <strong>Compartir codigo</strong>
                                    <span>{copiedTarget === 'code' ? 'Codigo copiado al portapapeles.' : 'Ideal para WhatsApp, grupo de amigos o la oficina.'}</span>
                                </button>
                                <button
                                    type="button"
                                    className={styles.inviteHintCard}
                                    onClick={() => void copyToClipboard(makeShareUrl(inviteCode), 'link')}
                                >
                                    <strong>Link directo</strong>
                                    <span>{copiedTarget === 'link' ? 'Link copiado al portapapeles.' : 'Copia el link directo para entrar con el codigo cargado.'}</span>
                                </button>
                            </div>
                        </div>
                    ) : null}

                    <div className={styles.wizardActions}>
                        <button type="button" className={styles.posterSecondaryCta} onClick={goBack} disabled={step === 0}>
                            Volver
                        </button>

                        {step < 2 ? (
                            <button type="button" className={styles.posterPrimaryCta} onClick={goNext} disabled={step === 0 && !canContinueConfig}>
                                Continuar
                            </button>
                        ) : (
                            <button type="button" className={styles.posterPrimaryCta} onClick={() => void handleCreateLeague()} disabled={isSubmitting || !selectedCompetition}>
                                {isSubmitting ? 'Creando...' : 'Crear liga'}
                            </button>
                        )}
                    </div>

                    {submitError ? <div className={styles.warning}>{submitError}</div> : null}
                </section>

                <aside className={styles.wizardSidebar}>
                    <div className={styles.previewCard}>
                        <p className={styles.previewEyebrow}>Vista previa</p>
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
                </aside>
            </div>
        </div>
    );
}
