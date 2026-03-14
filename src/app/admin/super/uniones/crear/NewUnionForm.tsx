'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, Save, Shield, Sparkles } from 'lucide-react';

import LogoUploader from '@/components/LogoUploader';
import { useSuperConsole } from '../../SuperConsoleContext';
import { createClient } from '@/lib/supabase/client';
import { createUnion } from '@/lib/services/unionService';
import {
    ARGENTINA_REGIONS,
    buildUnionBrandingPayload,
    COUNTRY_OPTIONS,
    getDefaultUnionForm,
    JURISDICTION_TYPES,
    slugifyUnion,
    SPORT_OPTIONS,
    UNION_ENTITY_TYPES,
    UNION_STATUSES,
    type UnionFormData,
} from '@/lib/unions';
import styles from '../unions-ui.module.css';

const DRAFT_STORAGE_KEY = 'g22_union_create_draft_v2';

const STEPS = [
    { id: 'identity', title: 'Identidad', description: 'Datos base y URL publica.' },
    { id: 'jurisdiction', title: 'Jurisdiccion', description: 'Pais, alcance y sede.' },
    { id: 'relationships', title: 'Relaciones', description: 'Clubes, torneos y entidades.' },
    { id: 'operations', title: 'Operacion', description: 'Permisos, visibilidad y modulos.' },
    { id: 'review', title: 'Revision', description: 'Chequeo final antes de crear.' },
] as const;

type StepId = typeof STEPS[number]['id'];
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken';
type EntityOption = { id: string; label: string; meta?: string };

function readUnionDraft(): { form: Partial<UnionFormData>; savedAt: string | null } {
    if (typeof window === 'undefined') {
        return { form: {}, savedAt: null };
    }

    const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!rawDraft) {
        return { form: {}, savedAt: null };
    }

    try {
        const parsed = JSON.parse(rawDraft) as Partial<UnionFormData> & { savedAt?: string };
        return {
            form: parsed,
            savedAt: parsed.savedAt || null,
        };
    } catch {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return { form: {}, savedAt: null };
    }
}

export default function NewUnionForm() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const { unions, clubs, tournaments, refresh } = useSuperConsole();

    const [draftSnapshot] = useState(() => readUnionDraft());
    const [form, setForm] = useState<UnionFormData>(() => ({ ...getDefaultUnionForm(), ...draftSnapshot.form }));
    const [activeStep, setActiveStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
    const [slugCheckValue, setSlugCheckValue] = useState('');
    const [savedAt, setSavedAt] = useState<string | null>(draftSnapshot.savedAt);

    useEffect(() => {
        if (!form.slug) return;

        const slug = slugifyUnion(form.slug);
        const timeoutId = window.setTimeout(async () => {
            const { data, error: slugError } = await supabase
                .from('unions')
                .select('id')
                .eq('id', slug)
                .maybeSingle();

            if (slugError) {
                setSlugStatus('idle');
                return;
            }

            setSlugCheckValue(slug);
            setSlugStatus(data ? 'taken' : 'available');
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [form.slug, supabase]);

    const activeStepId = STEPS[activeStep].id;
    const sortedParentUnions = useMemo(() => [...unions].sort((a, b) => a.name.localeCompare(b.name)), [unions]);
    const clubOptions = useMemo(
        () =>
            [...clubs]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((club) => ({
                    id: club.id,
                    label: club.name,
                    meta: [club.region, club.country].filter(Boolean).join(' - ') || 'Sin region',
                })),
        [clubs],
    );
    const unionOptions = useMemo(
        () =>
            sortedParentUnions.map((union) => ({
                id: union.id,
                label: union.name,
                meta: [union.country, union.region].filter(Boolean).join(' - ') || 'Sin detalle',
            })),
        [sortedParentUnions],
    );
    const tournamentOptions = useMemo(
        () =>
            [...tournaments]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((tournament) => ({
                    id: tournament.id,
                    label: tournament.display_name || tournament.name,
                    meta: [tournament.season_id, tournament.status].filter(Boolean).join(' - ') || 'Sin temporada',
                })),
        [tournaments],
    );

    const updateField = <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => {
        if (field === 'slug') {
            setSlugStatus(value ? 'checking' : 'idle');
        }
        setForm((prev) => ({ ...prev, [field]: value }));
        setError(null);
        setNotice(null);
    };

    const toggleSelection = (field: keyof UnionFormData, value: string) => {
        const current = form[field];
        if (!Array.isArray(current)) return;
        updateField(field, (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) as UnionFormData[typeof field]);
    };

    const persistDraft = () => {
        const snapshot = { ...form, savedAt: new Date().toISOString() };
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
        setSavedAt(snapshot.savedAt);
        setNotice('Borrador guardado localmente. Puedes retomarlo mas tarde.');
    };

    const nextStep = () => {
        const currentError = validateCurrentStep(activeStepId, form, slugStatus, slugCheckValue);
        if (currentError) {
            setError(currentError);
            return;
        }
        setActiveStep((prev) => Math.min(prev + 1, STEPS.length - 1));
        setError(null);
    };

    const previousStep = () => {
        setActiveStep((prev) => Math.max(prev - 1, 0));
        setError(null);
    };

    const handleCreate = async () => {
        const currentError = validateCurrentStep('review', form, slugStatus, slugCheckValue);
        if (currentError) {
            setError(currentError);
            return;
        }

        setSaving(true);
        setError(null);
        setNotice(null);

        const result = await createUnion({
            name: form.official_name.trim(),
            slug: form.slug,
            country: form.country,
            sport: form.sport,
            union_level: form.jurisdiction_type,
            parent_union_id: form.parent_organization_id || null,
            branding: buildUnionBrandingPayload(form),
        });

        setSaving(false);

        if (!result.success || !result.union) {
            setError(result.error || 'No se pudo crear la union');
            return;
        }

        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        await refresh('unions');
        router.push(`/admin/super/uniones/${result.union.id}`);
    };

    return (
        <div className={styles.shell}>
            <div className={styles.gridBackground}>
                <div className={styles.createLayout}>
                    <aside className={styles.sidebar}>
                        <div className={styles.brand}>
                            <div className={styles.brandMark} />
                            <div>
                                <div className={styles.brandTitle}>Flash Union</div>
                                <div className={styles.brandSubtitle}>Alta institucional escalable</div>
                            </div>
                        </div>

                        <div className={styles.stepList}>
                            {STEPS.map((step, index) => (
                                <button
                                    key={step.id}
                                    type="button"
                                    className={`${styles.stepItem} ${index === activeStep ? styles.stepItemActive : ''}`}
                                    onClick={() => setActiveStep(index)}
                                >
                                    <span className={styles.stepIndex}>{String(index + 1).padStart(2, '0')}</span>
                                    <span className={styles.stepTitle}>{step.title}</span>
                                    <span className={styles.stepDescription}>{step.description}</span>
                                </button>
                            ))}
                        </div>

                        <div className={styles.sidebarFooter}>
                            <div className={styles.draftBox}>
                                <div className={styles.pill}>
                                    <Shield size={14} />
                                    Wizard institucional
                                </div>
                                <p className={styles.sideText} style={{ marginTop: 12 }}>
                                    La alta inicial pide lo minimo para publicar y deja la configuracion profunda para la gestion posterior.
                                </p>
                            </div>

                            <div className={styles.metaCard}>
                                <div className={styles.sidebarSectionTitle}>Borrador</div>
                                <p className={styles.sideText} style={{ marginTop: 10 }}>
                                    {savedAt ? `Ultimo guardado: ${new Date(savedAt).toLocaleString()}` : 'Aun no hay borrador guardado.'}
                                </p>
                            </div>
                        </div>
                    </aside>

                    <main className={styles.createMain}>
                        <div className={styles.topBar}>
                            <div>
                                <div className={styles.eyebrow}>Organization Create Page</div>
                                <h1 className={styles.heroTitle}>
                                    Crear union
                                    <br />
                                    y dejarla lista para operar
                                </h1>
                                <p className={styles.heroText}>
                                    Separar identidad, jurisdiccion, relaciones y operacion evita un formulario gigante y habilita un alta limpia, rapida y escalable.
                                </p>
                            </div>

                            <div className={styles.progressRail}>
                                <div className={styles.rowBetween}>
                                    <span className={styles.eyebrow}>Paso {activeStep + 1} / {STEPS.length}</span>
                                    <span className={styles.pill}>{STEPS[activeStep].title}</span>
                                </div>
                                <div className={styles.progressTrack}>
                                    <div className={styles.progressValue} style={{ width: `${((activeStep + 1) / STEPS.length) * 100}%` }} />
                                </div>
                            </div>
                        </div>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <div>
                                    <div className={styles.eyebrow}>{STEPS[activeStep].title}</div>
                                    <h2 className={styles.panelTitle}>{getPanelTitle(activeStepId)}</h2>
                                    <p className={styles.panelDescription}>{getPanelDescription(activeStepId)}</p>
                                </div>
                                <div className={styles.pill}>
                                    <Sparkles size={14} />
                                    Draft first
                                </div>
                            </div>

                            {error && <p className={styles.errorText}>{error}</p>}
                            {notice && <p className={styles.hint}>{notice}</p>}

                            {activeStepId === 'identity' && (
                                <IdentityStep
                                    form={form}
                                    slugStatus={slugStatus}
                                    onAutoSlug={() => updateField('slug', slugifyUnion(form.official_name))}
                                    onChange={updateField}
                                />
                            )}

                            {activeStepId === 'jurisdiction' && (
                                <JurisdictionStep form={form} onChange={updateField} />
                            )}

                            {activeStepId === 'relationships' && (
                                <RelationshipsStep
                                    form={form}
                                    unionOptions={unionOptions}
                                    clubOptions={clubOptions}
                                    tournamentOptions={tournamentOptions}
                                    onChange={updateField}
                                    onToggle={toggleSelection}
                                />
                            )}

                            {activeStepId === 'operations' && (
                                <OperationsStep form={form} onChange={updateField} />
                            )}

                            {activeStepId === 'review' && (
                                <ReviewStep
                                    form={form}
                                    parentName={sortedParentUnions.find((item) => item.id === form.parent_organization_id)?.name || 'Sin entidad superior'}
                                    affiliatedClubs={clubOptions.filter((club) => form.affiliated_clubs.includes(club.id))}
                                    tournaments={tournamentOptions.filter((item) => form.organized_tournaments.includes(item.id))}
                                />
                            )}

                            <div className={styles.footerActions}>
                                <div className={styles.inlineRow}>
                                    <Link href="/admin/super/uniones" className={styles.buttonGhost}>
                                        <ArrowLeft size={16} />
                                        Volver
                                    </Link>
                                    {activeStep > 0 && (
                                        <button type="button" className={styles.button} onClick={previousStep}>
                                            <ArrowLeft size={16} />
                                            Paso anterior
                                        </button>
                                    )}
                                </div>

                                <div className={styles.inlineRow}>
                                    <button type="button" className={styles.button} onClick={persistDraft}>
                                        <Save size={16} />
                                        Guardar borrador
                                    </button>
                                    {activeStep < STEPS.length - 1 ? (
                                        <button type="button" className={styles.buttonPrimary} onClick={nextStep}>
                                            Continuar
                                            <ArrowRight size={16} />
                                        </button>
                                    ) : (
                                        <button type="button" className={styles.buttonPrimary} onClick={handleCreate} disabled={saving}>
                                            {saving ? <Loader2 size={16} /> : <Check size={16} />}
                                            {saving ? 'Creando...' : 'Crear union'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        </div>
    );
}

function IdentityStep({
    form,
    slugStatus,
    onAutoSlug,
    onChange,
}: {
    form: UnionFormData;
    slugStatus: SlugStatus;
    onAutoSlug: () => void;
    onChange: <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => void;
}) {
    return (
        <div className={styles.fieldGrid}>
            <div className={styles.fieldSpanFull}>
                <label className={styles.label}>Nombre oficial <span className={styles.required}>*</span></label>
                <input className={styles.control} value={form.official_name} placeholder="Union Cordobesa de Rugby" onChange={(event) => onChange('official_name', event.target.value)} />
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Nombre corto <span className={styles.required}>*</span></label>
                <input className={styles.control} value={form.short_name} placeholder="UCR" onChange={(event) => onChange('short_name', event.target.value)} />
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Sigla</label>
                <input className={styles.control} value={form.acronym} placeholder="UCR" onChange={(event) => onChange('acronym', event.target.value)} />
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Tipo de entidad <span className={styles.required}>*</span></label>
                <select className={styles.select} value={form.entity_type} onChange={(event) => onChange('entity_type', event.target.value)}>
                    {UNION_ENTITY_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Deporte <span className={styles.required}>*</span></label>
                <select className={styles.select} value={form.sport} onChange={(event) => onChange('sport', event.target.value)}>
                    {SPORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>

            <div className={styles.fieldSpanFull}>
                <label className={styles.label}>Slug publico <span className={styles.required}>*</span></label>
                <div className={styles.slugWrap}>
                    <div className={styles.slugPrefix}>scores.app/</div>
                    <input className={styles.slugInput} value={form.slug} placeholder="union-cordobesa-rugby" onChange={(event) => onChange('slug', slugifyUnion(event.target.value))} />
                    <button type="button" className={styles.slugAction} onClick={onAutoSlug}>Auto</button>
                </div>
                <p className={styles.hint}>{renderSlugStatus(slugStatus, form.slug)}</p>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Color principal</label>
                <div className={styles.inlineRow}>
                    <input type="color" className={styles.control} style={{ padding: 6, minHeight: 52 }} value={form.primary_color} onChange={(event) => onChange('primary_color', event.target.value)} />
                    <input className={styles.control} value={form.primary_color} onChange={(event) => onChange('primary_color', event.target.value)} />
                </div>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Color secundario</label>
                <div className={styles.inlineRow}>
                    <input type="color" className={styles.control} style={{ padding: 6, minHeight: 52 }} value={form.secondary_color} onChange={(event) => onChange('secondary_color', event.target.value)} />
                    <input className={styles.control} value={form.secondary_color} onChange={(event) => onChange('secondary_color', event.target.value)} />
                </div>
            </div>

            <div className={`${styles.fieldSpanFull} ${styles.logoBox}`}>
                <LogoUploader currentLogo={form.logo} accentColor={form.primary_color} label="Logo o escudo" onUpload={(value) => onChange('logo', value)} />
            </div>
        </div>
    );
}

function JurisdictionStep({
    form,
    onChange,
}: {
    form: UnionFormData;
    onChange: <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => void;
}) {
    return (
        <div className={styles.fieldGrid}>
            <div className={styles.field}>
                <label className={styles.label}>Pais <span className={styles.required}>*</span></label>
                <select className={styles.select} value={form.country} onChange={(event) => onChange('country', event.target.value)}>
                    {COUNTRY_OPTIONS.map((country) => (
                        <option key={country.value} value={country.value}>{country.label} ({country.code})</option>
                    ))}
                </select>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Alcance territorial <span className={styles.required}>*</span></label>
                <select className={styles.select} value={form.jurisdiction_type} onChange={(event) => onChange('jurisdiction_type', event.target.value)}>
                    {JURISDICTION_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Region / Provincia / Estado</label>
                {form.country === 'argentina' ? (
                    <select className={styles.select} value={form.region} onChange={(event) => onChange('region', event.target.value)}>
                        {ARGENTINA_REGIONS.map((region) => (
                            <option key={region} value={region}>{region}</option>
                        ))}
                    </select>
                ) : (
                    <input className={styles.control} value={form.region} placeholder="Provincia, estado o region" onChange={(event) => onChange('region', event.target.value)} />
                )}
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Ciudad sede</label>
                <input className={styles.control} value={form.city} placeholder="Cordoba" onChange={(event) => onChange('city', event.target.value)} />
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Sede institucional</label>
                <input className={styles.control} value={form.headquarters} placeholder="Casa central / sede administrativa" onChange={(event) => onChange('headquarters', event.target.value)} />
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Ano de fundacion</label>
                <input className={styles.control} value={form.founded_year} placeholder="1931" onChange={(event) => onChange('founded_year', event.target.value.replace(/[^\d]/g, '').slice(0, 4))} />
            </div>
        </div>
    );
}

function RelationshipsStep({
    form,
    unionOptions,
    clubOptions,
    tournamentOptions,
    onChange,
    onToggle,
}: {
    form: UnionFormData;
    unionOptions: EntityOption[];
    clubOptions: EntityOption[];
    tournamentOptions: EntityOption[];
    onChange: <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => void;
    onToggle: (field: keyof UnionFormData, value: string) => void;
}) {
    return (
        <div className={styles.chipGrid}>
            <div className={styles.field}>
                <label className={styles.label}>Entidad superior</label>
                <select className={styles.select} value={form.parent_organization_id} onChange={(event) => onChange('parent_organization_id', event.target.value)}>
                    <option value="">Sin entidad superior</option>
                    {unionOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                </select>
            </div>

            <EntityPicker title="Disciplinas asociadas" items={SPORT_OPTIONS.map((item) => ({ id: item.value, label: item.label, meta: 'Disciplina' }))} selected={form.associated_disciplines} onToggle={(value) => onToggle('associated_disciplines', value)} />
            <EntityPicker title="Clubes afiliados iniciales" items={clubOptions} selected={form.affiliated_clubs} onToggle={(value) => onToggle('affiliated_clubs', value)} />
            <EntityPicker title="Entidades hijas o regionales" items={unionOptions.filter((item) => item.id !== form.parent_organization_id)} selected={form.child_organizations} onToggle={(value) => onToggle('child_organizations', value)} />
            <EntityPicker title="Selecciones representativas" items={clubOptions} selected={form.representative_teams} onToggle={(value) => onToggle('representative_teams', value)} />
            <EntityPicker title="Torneos vinculados iniciales" items={tournamentOptions} selected={form.organized_tournaments} onToggle={(value) => onToggle('organized_tournaments', value)} />
        </div>
    );
}

function OperationsStep({
    form,
    onChange,
}: {
    form: UnionFormData;
    onChange: <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => void;
}) {
    return (
        <div className={styles.cardGrid2}>
            <div className={styles.mainCard}>
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.sectionTitle}>Estado institucional</div>
                        <p className={styles.sectionText}>Controla publicacion, operacion y default ruleset.</p>
                    </div>
                </div>

                <div className={styles.fieldGrid}>
                    <div className={styles.field}>
                        <label className={styles.label}>Estado <span className={styles.required}>*</span></label>
                        <select className={styles.select} value={form.status} onChange={(event) => onChange('status', event.target.value)}>
                            {UNION_STATUSES.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>Ruleset por defecto</label>
                        <input className={styles.control} value={form.default_ruleset_id} placeholder="reglamento-general-2026" onChange={(event) => onChange('default_ruleset_id', event.target.value)} />
                    </div>
                </div>
            </div>

            <div className={styles.mainCard}>
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.sectionTitle}>Capacidades habilitadas</div>
                        <p className={styles.sectionText}>Todo puede ajustarse luego desde la gestion avanzada.</p>
                    </div>
                </div>

                <div className={styles.list}>
                    <ToggleCard label="Visible publicamente" description="Expone la ficha publica institucional." checked={form.public_visible} onChange={(checked) => onChange('public_visible', checked)} />
                    <ToggleCard label="Puede crear torneos" description="Habilita el alta de competencias propias." checked={form.can_create_tournaments} onChange={(checked) => onChange('can_create_tournaments', checked)} />
                    <ToggleCard label="Puede gestionar rankings" description="Activa rankings oficiales y estadisticas." checked={form.can_manage_rankings} onChange={(checked) => onChange('can_manage_rankings', checked)} />
                    <ToggleCard label="Puede gestionar clubes" description="Permite vincular y administrar afiliaciones." checked={form.can_manage_clubs} onChange={(checked) => onChange('can_manage_clubs', checked)} />
                    <ToggleCard label="Puede gestionar prensa" description="Habilita noticias, banners y medios." checked={form.can_manage_media} onChange={(checked) => onChange('can_manage_media', checked)} />
                    <ToggleCard label="Puede administrar staff" description="Permite altas, roles y accesos internos." checked={form.can_manage_staff} onChange={(checked) => onChange('can_manage_staff', checked)} />
                </div>
            </div>
        </div>
    );
}

function ReviewStep({
    form,
    parentName,
    affiliatedClubs,
    tournaments,
}: {
    form: UnionFormData;
    parentName: string;
    affiliatedClubs: EntityOption[];
    tournaments: EntityOption[];
}) {
    return (
        <div className={styles.reviewGrid}>
            <div className={styles.previewCard}>
                <div className={styles.previewHeader}>
                    {form.logo ? <img className={styles.previewLogo} src={form.logo} alt={form.official_name || 'Logo'} /> : <div className={styles.previewLogo} />}
                    <div>
                        <div className={styles.previewName}>{form.official_name || 'Nombre institucional'}</div>
                        <div className={styles.previewMeta}>
                            <span>{form.short_name || 'Sin nombre corto'}</span>
                            <span>{form.entity_type}</span>
                            <span>{form.sport}</span>
                            <span>{form.country}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.summaryList}>
                    <ChecklistRow label="Slug" value={`scores.app/${form.slug}`} />
                    <ChecklistRow label="Jurisdiccion" value={`${[form.region, form.city].filter(Boolean).join(' - ') || 'Sin detalle'} - ${form.jurisdiction_type}`} />
                    <ChecklistRow label="Entidad superior" value={parentName} />
                    <ChecklistRow label="Operacion inicial" value={`Estado ${form.status} - publico ${form.public_visible ? 'si' : 'no'} - torneos ${form.can_create_tournaments ? 'si' : 'no'}`} />
                </div>
            </div>

            <div className={styles.mainCard}>
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.sectionTitle}>Checklist de alta</div>
                        <p className={styles.sectionText}>La configuracion avanzada podra completarse desde la gestion de la entidad.</p>
                    </div>
                </div>

                <div className={styles.list}>
                    <ChecklistRow label="Identidad base" value={`${form.official_name} / ${form.short_name}`} />
                    <ChecklistRow label="Jurisdiccion" value={`${form.country} - ${form.jurisdiction_type}`} />
                    <ChecklistRow label="Clubes iniciales" value={`${affiliatedClubs.length} vinculados`} />
                    <ChecklistRow label="Torneos iniciales" value={`${tournaments.length} vinculados`} />
                    <ChecklistRow label="Permisos operativos" value={`${[
                        form.can_create_tournaments,
                        form.can_manage_rankings,
                        form.can_manage_clubs,
                        form.can_manage_media,
                        form.can_manage_staff,
                    ].filter(Boolean).length} modulos habilitados`} />
                </div>

                <div className={styles.callout} style={{ marginTop: 18 }}>
                    Tras crear la union se abre el dashboard de gestion con tabs, KPIs, afiliaciones, reglamentos, configuracion publica y auditoria.
                </div>
            </div>
        </div>
    );
}

function EntityPicker({
    title,
    items,
    selected,
    onToggle,
}: {
    title: string;
    items: EntityOption[];
    selected: string[];
    onToggle: (value: string) => void;
}) {
    const [query, setQuery] = useState('');

    const filtered = useMemo(
        () => items.filter((item) => `${item.label} ${item.meta || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 18),
        [items, query],
    );

    return (
        <div className={styles.mainCard}>
            <div className={styles.chipToolbar}>
                <div>
                    <div className={styles.sectionTitle}>{title}</div>
                    <p className={styles.sectionText}>Selecciona entidades existentes desde el ecosistema actual.</p>
                </div>
                <input className={styles.searchInput} placeholder="Buscar..." value={query} onChange={(event) => setQuery(event.target.value)} style={{ maxWidth: 220 }} />
            </div>

            <div className={styles.chipList} style={{ marginTop: 16 }}>
                {filtered.length === 0 && <span className={styles.chipMuted}>Sin resultados</span>}
                {filtered.map((item) => {
                    const isActive = selected.includes(item.id);
                    return (
                        <button type="button" key={item.id} className={`${styles.chip} ${isActive ? styles.chipActive : ''}`} onClick={() => onToggle(item.id)}>
                            {isActive && <Check size={14} />}
                            <span>{item.label}</span>
                            {item.meta && <span className={styles.chipMuted}>{item.meta}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ToggleCard({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className={styles.toggleCard}>
            <div>
                <strong>{label}</strong>
                <span>{description}</span>
            </div>
            <label className={styles.switch}>
                <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
                <span className={styles.switchSlider} />
            </label>
        </div>
    );
}

function ChecklistRow({ label, value }: { label: string; value: string }) {
    return (
        <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>{label}</div>
            <div className={styles.summaryValue}>{value}</div>
        </div>
    );
}

function getPanelTitle(step: StepId) {
    switch (step) {
        case 'identity':
            return 'Identidad institucional y branding minimo';
        case 'jurisdiction':
            return 'Alcance territorial y sede de referencia';
        case 'relationships':
            return 'Mapa inicial del ecosistema deportivo';
        case 'operations':
            return 'Permisos y capacidades que heredaran los modulos';
        case 'review':
            return 'Revision final y salto directo a gestion';
        default:
            return '';
    }
}

function getPanelDescription(step: StepId) {
    switch (step) {
        case 'identity':
            return 'Define nombre oficial, nombre corto, tipo de entidad, deporte, logo y slug unico. El slug pasa a ser el identificador publico de la union.';
        case 'jurisdiction':
            return 'Esta capa fija el territorio que representa la organizacion y deja el contexto listo para futuras afiliaciones y torneos.';
        case 'relationships':
            return 'No es obligatorio vincular todo ahora, pero puedes dejar conectadas entidades clave para arrancar con contexto real.';
        case 'operations':
            return 'Lo que habilites aqui define que modulos y acciones estaran disponibles apenas se cree la entidad.';
        case 'review':
            return 'Se crea la union con lo minimo y se guarda la estructura avanzada dentro de branding para continuar completando desde el dashboard.';
        default:
            return '';
    }
}

function validateCurrentStep(step: StepId, form: UnionFormData, slugStatus: SlugStatus, slugValue: string) {
    if (step === 'identity' || step === 'review') {
        if (!form.official_name.trim()) return 'Completa el nombre oficial.';
        if (!form.short_name.trim()) return 'Completa el nombre corto.';
        if (!form.entity_type) return 'Selecciona el tipo de entidad.';
        if (!form.sport) return 'Selecciona el deporte.';
        if (!form.slug.trim()) return 'Completa el slug.';
        if (slugifyUnion(form.slug) !== form.slug) return 'El slug debe quedar normalizado.';
        if (slugStatus === 'taken' && slugValue === form.slug) return 'Ese slug ya esta en uso.';
    }

    if (step === 'jurisdiction' || step === 'review') {
        if (!form.country) return 'Selecciona el pais.';
        if (!form.jurisdiction_type) return 'Selecciona el alcance territorial.';
        if (form.founded_year && Number(form.founded_year) < 1800) return 'Revisa el ano de fundacion.';
    }

    if (step === 'operations' || step === 'review') {
        if (!form.status) return 'Selecciona el estado.';
    }

    return null;
}

function renderSlugStatus(status: SlugStatus, slug: string) {
    if (!slug) return 'El slug se usara como URL publica e identificador interno.';
    if (status === 'checking') return 'Verificando disponibilidad del slug...';
    if (status === 'available') return 'Slug disponible.';
    if (status === 'taken') return 'Ese slug ya existe. Elige otro.';
    return 'Usa solo letras minusculas, numeros y guiones.';
}
