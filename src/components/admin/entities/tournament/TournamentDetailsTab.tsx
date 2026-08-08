'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { getOffensiveBonusPreset } from '@/lib/sportMatchProfile';
import { SPORTS } from '@/lib/data/sports';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { type TournamentDetailsDraft, useTournamentDirty } from './TournamentContext';
import { AlertCircle, CheckCircle2, Globe, Image as ImageIcon, Shield } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import { FlashScoreIntegrationSection } from './FlashScoreIntegrationSection';
import { beginClientRequest, usePerfComponentLifecycle } from '@/lib/perf/react';
import { persistTournamentLogo } from '@/lib/utils/persistTournamentLogo';
import { normalizeSlug, normalizeText } from '@/lib/utils/normalize';
// La pestaña ya no usa `manager-*`: habla basalt como el resto de la consola.
// La hoja sigue importada porque `FlashScoreIntegrationSection` —que se dibuja
// acá abajo— todavía vive en ese vocabulario. Cuando esa sección migre, esta
// línea se va con ella.
import '../club/vitreous-club.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentDetailsRow = TournamentRow & {
    display_name?: string | null;
    is_api_managed?: boolean | null;
    ruleset?: Record<string, unknown> | null;
};
type CountryRow = Pick<Database['public']['Tables']['countries']['Row'], 'id' | 'name' | 'code' | 'flag_emoji'>;

const REGIONS = ['Sudamérica', 'Norteamérica', 'Europa Occidental', 'Europa del Este', 'Oceanía', 'África', 'Asia'];
const AGE_GRADES = ['Mayores', 'Juveniles', 'Reserva'];

const COUNTRY_OPTIONS = [
    { id: 'argentina', label: 'Argentina' },
    { id: 'brazil', label: 'Brasil' },
    { id: 'chile', label: 'Chile' },
    { id: 'colombia', label: 'Colombia' },
    { id: 'uruguay', label: 'Uruguay' },
    { id: 'paraguay', label: 'Paraguay' },
    { id: 'bolivia', label: 'Bolivia' },
    { id: 'peru', label: 'PerÃº' },
    { id: 'ecuador', label: 'Ecuador' },
    { id: 'venezuela', label: 'Venezuela' },
    { id: 'united-kingdom', label: 'United Kingdom' },
    { id: 'france', label: 'France' },
    { id: 'spain', label: 'Spain' },
    { id: 'italy', label: 'Italy' },
    { id: 'new-zealand', label: 'New Zealand' },
    { id: 'south-africa', label: 'South Africa' },
    { id: 'australia', label: 'Australia' },
    { id: 'international', label: 'Internacional' },
] as const;

const SPORT_OPTIONS = Object.values(SPORTS).sort((a, b) => a.priority - b.priority);

function slugify(s: string) {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function normalizeCountryId(value: string | null | undefined, options: TournamentCountryOption[]): string {
    if (!value) return '';
    const normalized = slugify(value);
    const matched = options.find((option) => slugify(option.id) === normalized || slugify(option.label) === normalized);
    return matched?.id || normalized;
}

interface TournamentDetailsTabProps {
    data: TournamentRow;
    id: string;
    unions: Array<{ id: string; name: string }>;
    countries: CountryRow[];
}

function buildInitialDetailsDraft(
    tournament: TournamentDetailsRow,
    baseCountryOptions: TournamentCountryOption[],
): TournamentDetailsDraft {
    const normalizedCountryId = normalizeCountryId(tournament.country_id ?? tournament.country ?? '', baseCountryOptions);
    const selectedCountryLabel = baseCountryOptions.find((option) => option.id === normalizedCountryId)?.label
        || tournament.country
        || normalizedCountryId;

    return {
        name: tournament.is_api_managed ? (tournament.display_name || tournament.name || '') : (tournament.name ?? ''),
        display_name: tournament.display_name || '',
        slug: tournament.slug ?? '',
        season_id: tournament.season_id ?? '2026',
        priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
        sport_id: tournament.sport_id ?? '',
        union_id: tournament.union_id ?? '',
        country_id: normalizedCountryId,
        country_label: selectedCountryLabel,
        region: tournament.region ?? '',
        category: tournament.category ?? '',
        age_grade: tournament.age_grade ?? '',
        logo_url: tournament.logo_url ?? '',
        ruleset: (tournament.ruleset ?? {}) as Record<string, unknown>,
    };
}

export function TournamentDetailsTab({ data, id, unions, countries }: TournamentDetailsTabProps) {
    const tournament = data as TournamentDetailsRow;
    const router = useRouter();
    usePerfComponentLifecycle('TournamentDetailsTab', {
        tournamentId: id,
        apiManaged: Boolean(tournament.is_api_managed),
    });
    const {
        getSectionDraft,
        setSectionDraft,
        clearSectionDraft,
        markSectionDirty,
        hasDirtySection,
    } = useTournamentDirty();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [slugEdited, setSlugEdited] = useState(false);
    const [logoTab, setLogoTab] = useState<'url' | 'upload'>('url');
    const baseCountryOptions = useMemo(
        () =>
            getTournamentCountryOptions(
                [
                    ...COUNTRY_OPTIONS.map((country) => ({ id: country.id, nameEs: country.label })),
                    ...countries.map((country) => ({
                        id: country.id,
                        name: country.name,
                        code: country.code,
                        flag_emoji: country.flag_emoji,
                    })),
                ],
            ),
        [countries],
    );
    const initialForm = useMemo(
        () => buildInitialDetailsDraft(tournament, baseCountryOptions),
        [baseCountryOptions, tournament],
    );

    const isApiManaged = tournament.is_api_managed || false;
    const form = getSectionDraft<TournamentDetailsDraft>('details') ?? initialForm;
    const isDirty = hasDirtySection('details');
    // Con qué se mide el bonus ofensivo acá: tries en rugby, goles en hockey.
    // Sigue al deporte del formulario, así que cambiarlo actualiza el rótulo.
    const offensiveBonusPreset = getOffensiveBonusPreset(form.sport_id);
    const bonusRules =
        form.ruleset.bonusRules &&
            typeof form.ruleset.bonusRules === 'object' &&
            !Array.isArray(form.ruleset.bonusRules)
            ? form.ruleset.bonusRules as Record<string, { enabled?: boolean }>
            : {};
    const countryOptions = useMemo(() => {
        if (!form.country_id) return baseCountryOptions;

        const normalizedCountryId = normalizeCountryId(form.country_id, baseCountryOptions);
        const existingOption = baseCountryOptions.find((option) => option.id === normalizedCountryId);
        if (existingOption) return baseCountryOptions;

        return [
            {
                id: normalizedCountryId,
                label: tournament.country || form.country_id,
            },
            ...baseCountryOptions,
        ];
    }, [baseCountryOptions, form.country_id, tournament.country]);
    const selectedCountryLabel = useMemo(
        () => countryOptions.find((option) => option.id === form.country_id)?.label || null,
        [countryOptions, form.country_id],
    );

    /**
     * De dónde viene el escudo. Reemplaza a los cuadros `ORIGIN:` / `FORMAT:` /
     * `STATUS: SYNCED` que había: jerga de consola decorativa, que es la
     * anti-referencia explícita del contrato de diseño (§1). Lo único que el
     * gestor se pregunta de verdad —si el escudo está subido o apunta afuera—
     * cabe en una palabra.
     */
    const logoOrigin = useMemo(() => {
        if (!form.logo_url) return 'Sin escudo';
        if (form.logo_url.startsWith('data:')) return 'Archivo subido';
        return 'Enlace externo';
    }, [form.logo_url]);

    useLeaveConfirm(isDirty);

    const update = useCallback(<K extends keyof TournamentDetailsDraft>(key: K, value: TournamentDetailsDraft[K]) => {
        const next = {
            ...form,
            [key]: value,
        };

        if (key === 'name' && !slugEdited && !form.slug.trim()) {
            next.slug = slugify(String(value));
        }

        if (key === 'country_id') {
            next.country_label = countryOptions.find((option) => option.id === value)?.label || String(value || '');
        }

        setSectionDraft('details', next);
        markSectionDirty('details', true);
        setMessage(null);
    }, [countryOptions, form, markSectionDirty, setSectionDraft, slugEdited]);

    const handleSaveRef = useRef<() => void>(() => { });
    useEffect(() => {
        const handler = () => { if (isDirty) handleSaveRef.current(); };
        window.addEventListener('tournament:save', handler);
        return () => window.removeEventListener('tournament:save', handler);
    }, [isDirty]);

    async function handleSave() {
        const normalizedName = normalizeText(form.name) || '';
        const normalizedCountryId = normalizeText(form.country_id);
        const normalizedCountryLabel = normalizeText(selectedCountryLabel || form.country_label);

        if (normalizedName.length < 3) {
            setMessage({ type: 'error', text: 'El nombre requiere al menos 3 caracteres' });
            return;
        }
        setIsSaving(true);
        setMessage(null);
        const saveRequest = beginClientRequest(`tournament:${id}:details`, 'manual_save', {
            component: 'TournamentDetailsTab',
            apiManaged: isApiManaged,
        });
        try {
            const persistedLogoUrl = await persistTournamentLogo(id, form.logo_url);
            await updateEntity('tournament', id, {
                ...(isApiManaged ? {
                    display_name: normalizedName,
                    logo_url: persistedLogoUrl,
                    priority: form.priority ?? 0,
                } : {
                    name: normalizedName,
                    slug: normalizeSlug(form.slug) || null,
                    season_id: normalizeText(form.season_id),
                    priority: form.priority ?? 0,
                    sport_id: normalizeText(form.sport_id),
                    union_id: normalizeText(form.union_id),
                    country: normalizedCountryId ? (normalizedCountryLabel || normalizedCountryId) : null,
                    country_id: normalizedCountryId,
                    region: normalizeText(form.region),
                    category: normalizeText(form.category),
                    age_grade: normalizeText(form.age_grade),
                    logo_url: persistedLogoUrl,
                    ruleset: form.ruleset,
                })
            });
            saveRequest.end({
                error: false,
            });
            clearSectionDraft('details');
            markSectionDirty('details', false);
            setMessage({ type: 'success', text: 'Cambios guardados.' });
            router.refresh();
        } catch (err: unknown) {
            saveRequest.end({
                error: true,
            });
            setMessage({ type: 'error', text: 'Error: ' + (err instanceof Error ? err.message : String(err)) });
        } finally {
            setIsSaving(false);
        }
    }

    handleSaveRef.current = handleSave;

    return (
        <div className="details-console-shell">
            <div className="details-stack">
                {message && (
                    <div className={`details-alert ${message.type === 'error' ? 'is-error' : 'is-success'}`} role="status" aria-live="polite">
                        {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                        <div className="details-alert-copy">
                            <span className="details-alert-title">{message.text}</span>
                        </div>
                    </div>
                )}

                {isApiManaged && (
                    <div className="details-alert is-info">
                        <Globe size={18} />
                        <div className="details-alert-copy">
                            <span className="details-alert-title">Torneo sincronizado por API</span>
                            <p className="details-alert-text">
                                Podés editar el nombre público, el escudo y la prioridad. El resto llega del proveedor
                                y queda protegido para que la próxima sincronización no lo pise.
                            </p>
                        </div>
                    </div>
                )}

                <section className="basalt-card details-panel" aria-labelledby="details-logo-title">
                    <div className="details-panel-head">
                        <div className="details-panel-copy">
                            <h2 className="details-panel-title" id="details-logo-title">
                                <ImageIcon size={18} aria-hidden="true" />
                                Escudo
                            </h2>
                            <p className="details-panel-hint">La imagen que identifica al torneo en tablas, fixtures y vista pública.</p>
                        </div>
                        <span className="details-panel-flag">{form.logo_url ? logoOrigin : 'Sin escudo'}</span>
                    </div>

                    <div className="details-logo-layout">
                        <div className="details-logo-preview">
                            {form.logo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element -- URL arbitraria del usuario, sin dominio conocido para next/image
                                <img src={form.logo_url} alt="Escudo del torneo" />
                            ) : (
                                <div className="details-logo-empty">
                                    <ImageIcon size={40} strokeWidth={1} aria-hidden="true" />
                                    <span>Sin escudo</span>
                                </div>
                            )}
                        </div>

                        <div className="details-logo-controls">
                            {/* Dos formas de cargar lo mismo: radiogroup y no pestañas.
                                No hay dos paneles de contenido, hay un campo que cambia
                                de forma. */}
                            <div className="details-segment" role="radiogroup" aria-label="Cómo cargar el escudo">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={logoTab === 'url'}
                                    className="details-segment-btn"
                                    onClick={() => setLogoTab('url')}
                                >
                                    Pegar una URL
                                </button>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={logoTab === 'upload'}
                                    className="details-segment-btn"
                                    onClick={() => setLogoTab('upload')}
                                >
                                    Subir un archivo
                                </button>
                            </div>

                            {logoTab === 'url' ? (
                                <div className="basalt-field">
                                    <label className="basalt-field-label" htmlFor="details-logo-url">Dirección de la imagen</label>
                                    <input
                                        id="details-logo-url"
                                        type="url"
                                        className="basalt-input"
                                        placeholder="https://.../escudo.png"
                                        value={form.logo_url || ''}
                                        onChange={e => update('logo_url', e.target.value)}
                                    />
                                    <p className="basalt-field-hint">Tiene que ser HTTPS. Acepta png, jpg, webp y svg.</p>
                                    {form.logo_url ? (
                                        <div>
                                            <button
                                                type="button"
                                                className="basalt-btn"
                                                onClick={() => update('logo_url', '')}
                                            >
                                                Quitar escudo
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="basalt-field">
                                    <span className="basalt-field-label">Archivo del escudo</span>
                                    <div className="details-upload-slot">
                                        <LogoUploader
                                            onUpload={(url) => update('logo_url', url)}
                                            accentColor="var(--accent-primary)"
                                            label="Arrastrá el archivo o hacé clic para elegirlo"
                                        />
                                    </div>
                                    <p className="basalt-field-hint">PNG, SVG o JPG. Se guarda al confirmar los cambios.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <section className="basalt-card details-panel" aria-labelledby="details-identity-title">
                    <div className="details-panel-head">
                        <div className="details-panel-copy">
                            <h2 className="details-panel-title" id="details-identity-title">
                                <Shield size={18} aria-hidden="true" />
                                Identidad
                            </h2>
                            <p className="details-panel-hint">Cómo se llama el torneo, en qué temporada corre y por dónde se lo encuentra.</p>
                        </div>
                    </div>

                    <div className="details-grid">
                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-name">
                                {isApiManaged ? 'Nombre público' : 'Nombre del torneo'}
                            </label>
                            <input
                                id="details-name"
                                type="text"
                                placeholder="Top 10 Primera División"
                                className="basalt-input"
                                value={form.name}
                                onChange={e => update('name', e.target.value)}
                            />
                            {isApiManaged && (
                                <p className="basalt-field-hint">Es el nombre que ve la gente en el sitio.</p>
                            )}
                        </div>

                        {isApiManaged && (
                            <div className="basalt-field">
                                <label className="basalt-field-label" htmlFor="details-api-name">Nombre en el proveedor</label>
                                <input
                                    id="details-api-name"
                                    type="text"
                                    className="basalt-input"
                                    value={data.name || ''}
                                    disabled
                                />
                                <p className="basalt-field-hint">Llega de la API y no se edita acá.</p>
                            </div>
                        )}

                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-season">Temporada</label>
                            <input
                                id="details-season"
                                type="text"
                                placeholder="2026"
                                className="basalt-input"
                                value={form.season_id}
                                onChange={e => update('season_id', e.target.value)}
                                disabled={isApiManaged}
                            />
                        </div>

                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-priority">Prioridad pública</label>
                            <input
                                id="details-priority"
                                type="number"
                                placeholder="0"
                                className="basalt-input"
                                value={String(form.priority ?? 0)}
                                onChange={e => update('priority', Number.parseInt(e.target.value, 10) || 0)}
                                min={0}
                            />
                            <p className="basalt-field-hint">El número más alto aparece primero. Si empatan, se ordenan alfabéticamente.</p>
                        </div>

                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-sport">Deporte</label>
                            <select
                                id="details-sport"
                                className="basalt-input"
                                value={form.sport_id}
                                onChange={e => update('sport_id', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">Sin definir</option>
                                {SPORT_OPTIONS.map((sport) => (
                                    <option key={sport.id} value={sport.id}>
                                        {sport.nameEs || sport.name || sport.id}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-slug">Dirección pública</label>
                            <div className="basalt-field-prefixed">
                                <span className="basalt-field-prefix" aria-hidden="true">/torneos/</span>
                                <input
                                    id="details-slug"
                                    type="text"
                                    className="basalt-input"
                                    value={form.slug}
                                    onChange={e => { setSlugEdited(true); update('slug', e.target.value); }}
                                    disabled={isApiManaged}
                                />
                            </div>
                        </div>

                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-union">Organizador</label>
                            <select
                                id="details-union"
                                className="basalt-input"
                                value={form.union_id}
                                onChange={e => update('union_id', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">Sin definir</option>
                                {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>
                </section>

                <section className="basalt-card details-panel" aria-labelledby="details-scope-title">
                    <div className="details-panel-head">
                        <div className="details-panel-copy">
                            <h2 className="details-panel-title" id="details-scope-title">
                                <Globe size={18} aria-hidden="true" />
                                Ubicación y alcance
                            </h2>
                            <p className="details-panel-hint">Dónde se juega y a qué categoría corresponde. Sirve para filtrar y agrupar en la vista pública.</p>
                        </div>
                    </div>

                    <div className="details-grid details-grid-narrow">
                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-country">País</label>
                            <select
                                id="details-country"
                                className="basalt-input"
                                value={form.country_id}
                                onChange={e => update('country_id', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">Sin definir</option>
                                {countryOptions.map((country) => (
                                    <option key={country.id} value={country.id}>{country.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-region">Región</label>
                            <select
                                id="details-region"
                                className="basalt-input"
                                value={form.region}
                                onChange={e => update('region', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">Sin definir</option>
                                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="basalt-field">
                            <label className="basalt-field-label" htmlFor="details-age-grade">Categoría de edad</label>
                            <select
                                id="details-age-grade"
                                className="basalt-input"
                                value={form.age_grade}
                                onChange={e => update('age_grade', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">Sin definir</option>
                                {AGE_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                    </div>
                </section>

                <section
                    className={`basalt-card details-panel ${isApiManaged ? 'details-panel-locked' : ''}`}
                    aria-labelledby="details-bonus-title"
                >
                    <div className="details-panel-head">
                        <div className="details-panel-copy">
                            <h2 className="details-panel-title" id="details-bonus-title">Puntos bonus</h2>
                            <p className="details-panel-hint">
                                Reglas generales del torneo. Cada fase decide después si los aplica.
                            </p>
                        </div>
                    </div>

                    <div className="details-grid">
                        <div className="details-toggle">
                            <label className="details-toggle-head" htmlFor="details-bonus-offensive">
                                <input
                                    id="details-bonus-offensive"
                                    type="checkbox"
                                    checked={bonusRules.offensiveBonus?.enabled || false}
                                    onChange={e => {
                                        update('ruleset', {
                                            ...form.ruleset,
                                            bonusRules: {
                                                ...bonusRules,
                                                offensiveBonus: {
                                                    enabled: e.target.checked,
                                                    type: offensiveBonusPreset.type,
                                                    threshold: offensiveBonusPreset.threshold,
                                                    label: offensiveBonusPreset.label,
                                                },
                                            },
                                        });
                                    }}
                                    disabled={isApiManaged}
                                />
                                Bonus ofensivo
                                <span className="details-toggle-rule">{offensiveBonusPreset.rule}</span>
                            </label>
                            <p className="details-toggle-hint">
                                {offensiveBonusPreset.hint}
                            </p>
                        </div>

                        <div className="details-toggle">
                            <label className="details-toggle-head" htmlFor="details-bonus-defensive">
                                <input
                                    id="details-bonus-defensive"
                                    type="checkbox"
                                    checked={bonusRules.defensiveBonus?.enabled || false}
                                    onChange={e => {
                                        update('ruleset', { ...form.ruleset, bonusRules: { ...bonusRules, defensiveBonus: { enabled: e.target.checked, type: 'point_diff', threshold: 7 } } });
                                    }}
                                    disabled={isApiManaged}
                                />
                                Bonus defensivo
                                <span className="details-toggle-rule">hasta 7 de diferencia</span>
                            </label>
                            <p className="details-toggle-hint">
                                Un punto extra para el equipo que pierda por siete puntos o menos.
                            </p>
                        </div>
                    </div>
                </section>

                {/* La integración con FlashScore todavía habla `manager-*`. Se le
                    da su propio ámbito con las variables que esas clases piden,
                    mapeadas a los tokens de basalt: antes eso llegaba envolviendo
                    la pestaña ENTERA en `.flash-ui-container`, que traía el fondo
                    de la consola de clubes y una textura fija en z-index 9999
                    sobre todo el gestor. */}
                {!isApiManaged && (
                    <div className="details-legacy-vars">
                        <FlashScoreIntegrationSection
                            tournamentId={id}
                            sportId={form.sport_id ?? null}
                            ruleset={form.ruleset}
                            onRulesetChange={(newRuleset) => update('ruleset', newRuleset)}
                        />
                    </div>
                )}

                <div className="details-footer">
                    {isDirty && (
                        <p className="details-footer-note">
                            También podés guardar desde la barra de arriba.
                        </p>
                    )}
                    <button
                        type="button"
                        className="basalt-btn basalt-btn-primary"
                        onClick={handleSave}
                        disabled={isSaving || !isDirty}
                    >
                        {isSaving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
}
