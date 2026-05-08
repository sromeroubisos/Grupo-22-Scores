'use client';

import type { ReactNode } from 'react';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    Archive,
    ArrowLeft,
    Building2,
    Eye,
    EyeOff,
    Loader2,
    Plus,
    Save,
    Shield,
    Sparkles,
    Users,
} from 'lucide-react';

import LogoUploader from '@/components/LogoUploader';
import { createClient } from '@/lib/supabase/client';
import { updateUnion } from '@/lib/services/unionService';
import {
    buildUnionBrandingPayload,
    COUNTRY_OPTIONS,
    getDefaultUnionForm,
    getUnionCountry,
    getUnionLogo,
    getUnionOfficialName,
    getUnionRegion,
    getUnionShortName,
    getUnionStatus,
    hydrateUnionForm,
    JURISDICTION_TYPES,
    SPORT_OPTIONS,
    TAB_DEFINITIONS,
    type UnionFormData,
    type UnionTabId,
    UNION_ENTITY_TYPES,
    UNION_STATUSES,
} from '@/lib/unions';
import styles from '../union-manage.module.css';

type ClubRow = {
    id: string;
    name: string;
    short_name: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    is_visible: boolean | null;
    created_at: string;
    updated_at: string | null;
};

type TournamentRow = {
    id: string;
    name: string;
    display_name: string | null;
    status: string | null;
    is_visible: boolean | null;
    created_at: string | null;
    updated_at: string | null;
};

type MembershipRow = {
    id: string;
    user_id: string;
    role: string;
    created_at: string;
};

type NewsRow = {
    id: string;
    title: string;
    status: string;
    published_at: string | null;
    created_at: string;
};

type RegulationRow = {
    id: string;
    content: string | null;
    updated_at: string;
};

type AuditRow = {
    id: string;
    actor_user_id: string;
    action: string;
    changes: Record<string, unknown> | null;
    created_at: string;
    source: string | null;
};

type UnionRecord = {
    id: string;
    name: string;
    country: string | null;
    branding?: Record<string, unknown> | null;
};

const FONT_FAMILY_OPTIONS = ['Geist', 'Sora', 'Manrope', 'Archivo', 'IBM Plex Sans'] as const;
const SYSTEM_LEVEL_OPTIONS = [
    { value: 'international_governing_body', label: 'Gobierno internacional' },
    { value: 'continental_governing_body', label: 'Gobierno continental' },
    { value: 'national_governing_body', label: 'Gobierno nacional' },
    { value: 'regional_governing_body', label: 'Gobierno regional o provincial' },
] as const;
const TABLE_CALCULATION_OPTIONS = [
    { value: 'points_with_bonus', label: 'Puntos con bonus' },
    { value: 'points_without_bonus', label: 'Puntos sin bonus' },
    { value: 'percentage_based', label: 'Porcentaje de efectividad' },
] as const;

export default function UnionManagePage() {
    const params = useParams();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const unionId = params?.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<UnionTabId>('overview');
    const [clubQuery, setClubQuery] = useState('');
    const [tournamentQuery, setTournamentQuery] = useState('');

    const [unionRecord, setUnionRecord] = useState<UnionRecord | null>(null);
    const [form, setForm] = useState<UnionFormData>(() => getDefaultUnionForm());
    const [clubs, setClubs] = useState<ClubRow[]>([]);
    const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
    const [memberships, setMemberships] = useState<MembershipRow[]>([]);
    const [newsItems, setNewsItems] = useState<NewsRow[]>([]);
    const [regulations, setRegulations] = useState<RegulationRow[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
    const [playerCount, setPlayerCount] = useState(0);
    const [refereeCount, setRefereeCount] = useState(0);

    const deferredClubQuery = useDeferredValue(clubQuery);
    const deferredTournamentQuery = useDeferredValue(tournamentQuery);

    const filteredClubs = useMemo(
        () =>
            clubs.filter((club) => `${club.name} ${club.region || ''} ${club.country || ''}`.toLowerCase().includes(deferredClubQuery.toLowerCase())),
        [clubs, deferredClubQuery],
    );

    const filteredTournaments = useMemo(
        () =>
            tournaments.filter((tournament) => `${tournament.display_name || tournament.name} ${tournament.status || ''}`.toLowerCase().includes(deferredTournamentQuery.toLowerCase())),
        [tournaments, deferredTournamentQuery],
    );

    const kpis = useMemo(() => {
        const activeTournaments = tournaments.filter((item) => ['active', 'published'].includes(item.status || '')).length;
        const historicalTournaments = tournaments.filter((item) => ['archived', 'completed'].includes(item.status || '')).length;

        return [
            { label: 'Clubes afiliados', value: clubs.length },
            { label: 'Torneos activos', value: activeTournaments },
            { label: 'Historico torneos', value: historicalTournaments || Math.max(tournaments.length - activeTournaments, 0) },
            { label: 'Selecciones', value: form.representative_teams.length },
            { label: 'Jugadores', value: playerCount },
            { label: 'Arbitros', value: refereeCount },
            { label: 'Noticias', value: newsItems.filter((item) => item.status === 'published').length },
            { label: 'Staff', value: memberships.length },
        ];
    }, [clubs.length, tournaments, form.representative_teams.length, playerCount, refereeCount, newsItems, memberships.length]);

    const activeTabDefinition = useMemo(
        () => TAB_DEFINITIONS.find((tab) => tab.id === activeTab) ?? TAB_DEFINITIONS[0],
        [activeTab],
    );

    const recentActivity = useMemo(() => {
        const activity = [
            ...clubs.slice(0, 4).map((club) => ({
                id: `club-${club.id}`,
                title: `Afiliacion de club: ${club.name}`,
                time: club.updated_at || club.created_at,
                meta: [club.region, club.country].filter(Boolean).join(' - ') || 'Afiliacion institucional',
            })),
            ...tournaments.slice(0, 4).map((tournament) => ({
                id: `tournament-${tournament.id}`,
                title: `Movimiento en torneo: ${tournament.display_name || tournament.name}`,
                time: tournament.updated_at || tournament.created_at || new Date().toISOString(),
                meta: [tournament.status].filter(Boolean).join(' - ') || 'Competicion oficial',
            })),
            ...memberships.slice(0, 4).map((membership) => ({
                id: `staff-${membership.id}`,
                title: `Alta de staff: ${membership.role}`,
                time: membership.created_at,
                meta: membership.user_id,
            })),
        ];

        return activity
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 8);
    }, [clubs, tournaments, memberships]);

    const updateField = <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setNotice(null);
        setError(null);
    };

    const saveForm = async (nextForm: UnionFormData, message = 'Cambios guardados') => {
        setSaving(true);
        setError(null);
        setNotice(null);

        const result = await updateUnion(unionId, {
            name: nextForm.official_name.trim(),
            country: nextForm.country,
            sport: nextForm.sport,
            union_level: nextForm.jurisdiction_type,
            parent_union_id: nextForm.parent_organization_id || null,
            branding: buildUnionBrandingPayload(nextForm),
        });

        setSaving(false);

        if (!result.success || !result.union) {
            setError(result.error || 'No se pudieron guardar los cambios');
            return;
        }

        setUnionRecord(result.union);
        setForm(nextForm);
        setNotice(message);
        await loadDashboard();
    };

    const quickToggleVisibility = async () => {
        const nextForm = { ...form, public_visible: !form.public_visible };
        await saveForm(nextForm, nextForm.public_visible ? 'Union publicada' : 'Union oculta del frente publico');
    };

    const quickArchive = async () => {
        const nextForm = { ...form, status: 'archived', public_visible: false };
        await saveForm(nextForm, 'Union archivada');
    };

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);

        const [
            unionRes,
            clubsRes,
            tournamentsRes,
            membershipsRes,
            newsRes,
            regulationsRes,
            auditRes,
        ] = await Promise.all([
            supabase.from('unions').select('*').eq('id', unionId).maybeSingle(),
            supabase.from('clubs').select('id, name, short_name, city, region, country, is_visible, created_at, updated_at').eq('union_id', unionId).order('name'),
            supabase.from('tournaments').select('id, name, display_name, status, is_visible, created_at, updated_at').eq('union_id', unionId).order('created_at', { ascending: false }),
            supabase.from('memberships').select('id, user_id, role, created_at').eq('scope_type', 'union').eq('scope_id', unionId).order('created_at', { ascending: false }),
            supabase.from('news').select('id, title, status, published_at, created_at').eq('scope', 'union').eq('scope_id', unionId).order('created_at', { ascending: false }).limit(8),
            supabase.from('regulations').select('id, content, updated_at').eq('scope_type', 'union').eq('scope_id', unionId).order('updated_at', { ascending: false }).limit(8),
            supabase.from('admin_audit_log').select('id, actor_user_id, action, changes, created_at, source').eq('entity_type', 'union').eq('entity_id', unionId).order('created_at', { ascending: false }).limit(20),
        ]);

        if (unionRes.error || !unionRes.data) {
            setError(unionRes.error?.message || 'No se pudo cargar la union');
            setLoading(false);
            return;
        }

        const clubData = clubsRes.data || [];
        setUnionRecord(unionRes.data as UnionRecord);
        setForm(hydrateUnionForm(unionRes.data));
        setClubs(clubData as ClubRow[]);
        setTournaments((tournamentsRes.data || []) as TournamentRow[]);
        setMemberships((membershipsRes.data || []) as MembershipRow[]);
        setNewsItems((newsRes.data || []) as NewsRow[]);
        setRegulations((regulationsRes.data || []) as RegulationRow[]);
        setAuditLogs(((auditRes.data as AuditRow[] | null) || []));

        if (clubData.length > 0) {
            const clubIds = clubData.map((club) => club.id);
            const peopleRes = await supabase.from('people').select('id, role').in('club_id', clubIds);
            const people = peopleRes.data || [];
            setPlayerCount(people.filter((person) => /player|jugador/i.test(person.role || '')).length);
            setRefereeCount(people.filter((person) => /referee|arbit/i.test(person.role || '')).length);
        } else {
            setPlayerCount(0);
            setRefereeCount(0);
        }

        setLoading(false);
    }, [supabase, unionId]);

    useEffect(() => {
        if (!unionId) return;
        void loadDashboard();
    }, [unionId, loadDashboard]);

    if (loading) {
        return (
            <div className={styles.shell}>
                <div className={styles.gridBackground} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
                    <div className={styles.mainCard} style={{ maxWidth: 420 }}>
                        <div className={styles.inlineRow}>
                            <Loader2 size={18} />
                            <span>Cargando consola institucional...</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error && !unionRecord) {
        return (
            <div className={styles.shell}>
                <div className={styles.gridBackground} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
                    <div className={styles.mainCard} style={{ maxWidth: 520 }}>
                        <div className={styles.sectionTitle}>No se pudo abrir la gestion</div>
                        <p className={styles.sectionText} style={{ marginTop: 10 }}>{error}</p>
                        <div className={styles.inlineRow} style={{ marginTop: 18 }}>
                            <button type="button" className={styles.button} onClick={() => router.push('/admin/super/uniones')}>
                                <ArrowLeft size={16} />
                                Volver al listado
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.shell}>
            <div className={styles.gridBackground}>
                <div className={styles.pageContainer}>
                    <div className={styles.topContext}>
                        <div className={styles.breadcrumb}>
                            <Link href="/admin/super" prefetch={false} className={styles.breadcrumbLink}>Superadmin</Link>
                            <span>/</span>
                            <Link href="/admin/super/uniones" prefetch={false} className={styles.breadcrumbLink}>Uniones</Link>
                            <span>/</span>
                            <span>{getUnionOfficialName(unionRecord)}</span>
                        </div>

                        <span className={styles.statusBadge}>
                            <span className={styles.statusDot} />
                            Pagina completa de gestion
                        </span>
                    </div>

                    <div className={styles.manageShell}>
                    <aside className={styles.navCard}>
                        <div className={styles.navHeader}>
                            <Link href="/admin/super/uniones" prefetch={false} className={styles.buttonGhost}>
                                <ArrowLeft size={16} />
                                Uniones
                            </Link>
                            <div>
                                <div className={styles.sidebarSectionTitle}>Secciones</div>
                                <div className={styles.navHint}>Gestion institucional</div>
                            </div>
                        </div>

                        <div className={styles.divider} />

                        <div className={styles.tabStack}>
                            {TAB_DEFINITIONS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <span>{tab.short}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <main className={styles.manageMain}>
                        <div className={styles.mobileTabNav}>
                            <select
                                className={styles.mobileTabSelect}
                                value={activeTab}
                                onChange={(event) => setActiveTab(event.target.value as UnionTabId)}
                            >
                                {TAB_DEFINITIONS.map((tab) => (
                                    <option key={tab.id} value={tab.id}>
                                        {tab.short} · {tab.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <section className={styles.heroCard}>
                            <div className={styles.heroToolbar}>
                                <div className={styles.heroToolbarMeta}>
                                    <span className={styles.statusBadge}>
                                        <span className={styles.statusDot} />
                                        {getUnionStatus(unionRecord)}
                                    </span>
                                    <span className={styles.heroBadge}>{activeTabDefinition.label}</span>
                                </div>

                                <div className={styles.quickActions}>
                                    <button type="button" className={styles.button} onClick={() => setActiveTab('identity')}>
                                        <Building2 size={16} />
                                        Editar identidad
                                    </button>
                                    <button type="button" className={styles.button} onClick={quickToggleVisibility}>
                                        {form.public_visible ? <EyeOff size={16} /> : <Eye size={16} />}
                                        {form.public_visible ? 'Ocultar' : 'Publicar'}
                                    </button>
                                    <button type="button" className={styles.buttonDanger} onClick={quickArchive}>
                                        <Archive size={16} />
                                        Archivar
                                    </button>
                                    <button type="button" className={styles.buttonPrimary} onClick={() => router.push(`/admin/union/${unionId}/torneos/crear`)}>
                                        <Plus size={16} />
                                        Crear torneo
                                    </button>
                                </div>
                            </div>

                            <div className={styles.heroHeader}>
                                <div className={styles.heroIdentity}>
                                    {getUnionLogo(unionRecord) ? (
                                        <img className={styles.heroLogo} src={getUnionLogo(unionRecord)} alt={getUnionOfficialName(unionRecord)} />
                                    ) : (
                                        <div className={styles.heroLogo} />
                                    )}

                                    <div className={styles.heroCopy}>
                                        <div className={styles.eyebrow}>Gestion institucional premium</div>
                                        <div className={styles.heroHeadline}>{getUnionOfficialName(unionRecord)}</div>
                                        <div className={styles.heroSubline}>
                                            <span className={styles.heroBadge}>{getUnionShortName(unionRecord) || 'Sin short name'}</span>
                                            <span className={styles.heroBadge}>{form.entity_type}</span>
                                            <span className={styles.heroBadge}>{form.sport}</span>
                                            <span className={styles.heroBadge}>{[getUnionCountry(unionRecord), getUnionRegion(unionRecord)].filter(Boolean).join(' - ') || 'Sin region'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.kpiGrid}>
                                {kpis.map((kpi) => (
                                    <div key={kpi.label} className={styles.kpiCard}>
                                        <div className={styles.kpiValue}>{kpi.value}</div>
                                        <div className={styles.kpiLabel}>{kpi.label}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className={styles.contentStack}>
                            {error && <p className={styles.errorText}>{error}</p>}
                            {notice && <p className={styles.hint}>{notice}</p>}
                            {renderActiveTab({
                                activeTab,
                                form,
                                unionRecord,
                                clubs: filteredClubs,
                                tournaments: filteredTournaments,
                                memberships,
                                newsItems,
                                regulations,
                                auditLogs,
                                recentActivity,
                                clubQuery,
                                tournamentQuery,
                                setClubQuery,
                                setTournamentQuery,
                                updateField,
                                onSave: () => saveForm(form),
                                saving,
                            })}
                        </div>
                    </main>

                    <aside className={styles.rightRail}>
                        <div className={styles.sidebarCard}>
                            <div className={styles.sidebarSectionTitle}>Quick info</div>
                            <div className={styles.summaryListCompact} style={{ marginTop: 14 }}>
                                <ChecklistRow label="Estado" value={getUnionStatus(unionRecord)} />
                                <ChecklistRow label="Pais" value={form.country} />
                                <ChecklistRow label="Region" value={form.region || 'Sin region'} />
                                <ChecklistRow label="Staff" value={`${memberships.length} accesos`} />
                            </div>

                            <div className={styles.sidebarMetaBlock}>
                                <div className={styles.summaryLabel}>Slug publico</div>
                                <div className={styles.slugValue} title={form.slug}>
                                    {form.slug.length > 24 ? `${form.slug.slice(0, 24)}...` : form.slug}
                                </div>
                            </div>
                        </div>

                        <div className={styles.sidebarCard}>
                            <div className={styles.sidebarSectionTitle}>Capacidades</div>
                            <div className={styles.tokenList} style={{ marginTop: 14 }}>
                                {form.can_create_tournaments && <span className={styles.token}>Torneos</span>}
                                {form.can_manage_rankings && <span className={styles.token}>Rankings</span>}
                                {form.can_manage_clubs && <span className={styles.token}>Clubes</span>}
                                {form.can_manage_media && <span className={styles.token}>Prensa</span>}
                                {form.can_manage_staff && <span className={styles.token}>Staff</span>}
                            </div>
                        </div>

                        <div className={styles.sidebarCard}>
                            <div className={styles.sidebarSectionTitle}>Acciones rapidas</div>
                            <div className={styles.list} style={{ marginTop: 14 }}>
                                <button type="button" className={styles.button} onClick={() => setActiveTab('rules')}>
                                    <Shield size={16} />
                                    Reglamentos
                                </button>
                                <button type="button" className={styles.button} onClick={() => setActiveTab('public')}>
                                    <Sparkles size={16} />
                                    Config publica
                                </button>
                                <button type="button" className={styles.button} onClick={() => setActiveTab('staff')}>
                                    <Users size={16} />
                                    Staff y roles
                                </button>
                            </div>
                        </div>
                    </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}

function renderActiveTab({
    activeTab,
    form,
    unionRecord,
    clubs,
    tournaments,
    memberships,
    newsItems,
    regulations,
    auditLogs,
    recentActivity,
    clubQuery,
    tournamentQuery,
    setClubQuery,
    setTournamentQuery,
    updateField,
    onSave,
    saving,
}: {
    activeTab: UnionTabId;
    form: UnionFormData;
    unionRecord: UnionRecord | null;
    clubs: ClubRow[];
    tournaments: TournamentRow[];
    memberships: MembershipRow[];
    newsItems: NewsRow[];
    regulations: RegulationRow[];
    auditLogs: AuditRow[];
    recentActivity: Array<{ id: string; title: string; time: string; meta: string }>;
    clubQuery: string;
    tournamentQuery: string;
    setClubQuery: (value: string) => void;
    setTournamentQuery: (value: string) => void;
    updateField: <K extends keyof UnionFormData>(field: K, value: UnionFormData[K]) => void;
    onSave: () => Promise<void>;
    saving: boolean;
}) {
    switch (activeTab) {
        case 'overview':
            return (
                <div className={styles.list}>
                    <SectionCard title="Hero summary" description="Ficha rapida de la entidad organizadora.">
                        <div className={styles.cardGrid3}>
                            <ChecklistRow label="Nombre oficial" value={getUnionOfficialName(unionRecord)} />
                            <ChecklistRow label="Entidad" value={form.entity_type} />
                            <ChecklistRow label="Ultima actualizacion" value={new Date().toLocaleString()} />
                            <ChecklistRow label="Pais" value={form.country} />
                            <ChecklistRow label="Region" value={form.region || 'Sin region'} />
                            <ChecklistRow label="Entidad superior" value={form.parent_organization_id || 'Sin entidad superior'} />
                        </div>
                    </SectionCard>

                    <SectionCard title="Actividad reciente" description="Actualizaciones institucionales, altas y movimientos recientes.">
                        <div className={styles.activityList}>
                            {recentActivity.length === 0 && <div className={styles.emptyState}>Todavia no hay actividad trazada.</div>}
                            {recentActivity.map((item) => (
                                <div key={item.id} className={styles.activityItem}>
                                    <div className={styles.activityTime}>{new Date(item.time).toLocaleString()}</div>
                                    <div style={{ marginTop: 6, fontWeight: 700 }}>{item.title}</div>
                                    <div className={styles.sectionText}>{item.meta}</div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                </div>
            );
        case 'identity':
            return (
                <div className={styles.list}>
                    <SectionCard title="Identidad basica" description="Nombre oficial, alias institucional y posicionamiento primario dentro del sistema.">
                        <div className={styles.fieldGrid}>
                            <Field label="Nombre oficial">
                                <input className={styles.control} value={form.official_name} onChange={(event) => updateField('official_name', event.target.value)} />
                            </Field>
                            <Field label="Nombre corto">
                                <input className={styles.control} value={form.short_name} onChange={(event) => updateField('short_name', event.target.value)} />
                            </Field>
                            <Field label="Sigla">
                                <input className={styles.control} value={form.acronym} onChange={(event) => updateField('acronym', event.target.value)} />
                            </Field>
                            <Field label="Slug">
                                <input className={styles.control} value={form.slug} onChange={(event) => updateField('slug', event.target.value)} />
                            </Field>
                            <Field label="Tipo de organizacion">
                                <select className={styles.select} value={form.entity_type} onChange={(event) => updateField('entity_type', event.target.value)}>
                                    {UNION_ENTITY_TYPES.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Deporte principal">
                                <select className={styles.select} value={form.sport} onChange={(event) => updateField('sport', event.target.value)}>
                                    {SPORT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="Branding institucional" description="Sistema visual base y activos de marca usados por la entidad.">
                        <div className={styles.cardGrid3}>
                            <div className={styles.logoBox}>
                                <LogoUploader currentLogo={form.logo} accentColor={form.primary_color} label="Logo principal" onUpload={(value) => updateField('logo', value)} />
                            </div>
                            <div className={styles.logoBox}>
                                <LogoUploader currentLogo={form.logo_alternative} accentColor={form.secondary_color} label="Logo alternativo" onUpload={(value) => updateField('logo_alternative', value)} />
                            </div>
                            <div className={styles.logoBox}>
                                <LogoUploader currentLogo={form.crest} accentColor={form.accent_color} label="Escudo / crest" onUpload={(value) => updateField('crest', value)} />
                            </div>
                        </div>

                        <div className={styles.fieldGrid} style={{ marginTop: 20 }}>
                            <Field label="Color principal">
                                <input type="color" className={styles.control} style={{ padding: 6, minHeight: 52 }} value={form.primary_color} onChange={(event) => updateField('primary_color', event.target.value)} />
                            </Field>
                            <Field label="Color secundario">
                                <input type="color" className={styles.control} style={{ padding: 6, minHeight: 52 }} value={form.secondary_color} onChange={(event) => updateField('secondary_color', event.target.value)} />
                            </Field>
                            <Field label="Color acento">
                                <input type="color" className={styles.control} style={{ padding: 6, minHeight: 52 }} value={form.accent_color} onChange={(event) => updateField('accent_color', event.target.value)} />
                            </Field>
                            <Field label="Familia tipografica">
                                <select className={styles.select} value={form.font_family} onChange={(event) => updateField('font_family', event.target.value)}>
                                    {FONT_FAMILY_OPTIONS.map((font) => (
                                        <option key={font} value={font}>{font}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="Ubicacion y jurisdiccion" description="Localizacion institucional y alcance de la entidad.">
                        <div className={styles.fieldGrid}>
                            <Field label="Pais">
                                <select className={styles.select} value={form.country} onChange={(event) => updateField('country', event.target.value)}>
                                    {COUNTRY_OPTIONS.map((country) => (
                                        <option key={country.value} value={country.value}>{country.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Region">
                                <input className={styles.control} value={form.region} onChange={(event) => updateField('region', event.target.value)} />
                            </Field>
                            <Field label="Ciudad">
                                <input className={styles.control} value={form.city} onChange={(event) => updateField('city', event.target.value)} />
                            </Field>
                            <Field label="Jurisdiccion">
                                <select className={styles.select} value={form.jurisdiction_type} onChange={(event) => updateField('jurisdiction_type', event.target.value)}>
                                    {JURISDICTION_TYPES.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="Informacion institucional" description="Datos troncales de contacto, sede y descripcion publica.">
                        <div className={styles.fieldGrid}>
                            <Field label="Ano de fundacion">
                                <input className={styles.control} value={form.founded_year} onChange={(event) => updateField('founded_year', event.target.value.replace(/[^\d]/g, '').slice(0, 4))} />
                            </Field>
                            <Field label="Sede">
                                <input className={styles.control} value={form.headquarters} onChange={(event) => updateField('headquarters', event.target.value)} />
                            </Field>
                            <Field label="Sitio web">
                                <input className={styles.control} value={form.website} onChange={(event) => updateField('website', event.target.value)} />
                            </Field>
                            <Field label="Email">
                                <input className={styles.control} value={form.email} onChange={(event) => updateField('email', event.target.value)} />
                            </Field>
                            <Field label="Telefono">
                                <input className={styles.control} value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                            </Field>
                            <div className={styles.fieldSpanFull}>
                                <Field label="Descripcion">
                                    <textarea className={styles.textarea} value={form.description} onChange={(event) => updateField('description', event.target.value)} />
                                </Field>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Jerarquia deportiva" description="Vinculos deportivos madre e insercion de la union dentro del ecosistema.">
                        <div className={styles.fieldGrid}>
                            <Field label="Organizacion superior">
                                <input className={styles.control} value={form.parent_organization_id} onChange={(event) => updateField('parent_organization_id', event.target.value)} placeholder="Id o referencia de entidad superior" />
                            </Field>
                            <Field label="Confederacion continental">
                                <input className={styles.control} value={form.continental_confederation} onChange={(event) => updateField('continental_confederation', event.target.value)} />
                            </Field>
                            <Field label="Federacion internacional">
                                <input className={styles.control} value={form.international_federation} onChange={(event) => updateField('international_federation', event.target.value)} />
                            </Field>
                            <Field label="Nivel en el sistema">
                                <select className={styles.select} value={form.system_level} onChange={(event) => updateField('system_level', event.target.value)}>
                                    {SYSTEM_LEVEL_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="Estado y visibilidad" description="Estado administrativo y exposicion publica de la organizacion.">
                        <div className={styles.fieldGrid}>
                            <Field label="Estado de la organizacion">
                                <select className={styles.select} value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                                    {UNION_STATUSES.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        <div className={styles.cardGrid2} style={{ marginTop: 20 }}>
                            <ToggleCard label="Visibilidad publica" description="Permite mostrar la union en el frente publico." checked={form.public_visible} onChange={(checked) => updateField('public_visible', checked)} />
                            <ToggleCard label="Creacion de torneos" description="Habilita la alta de torneos desde esta entidad." checked={form.can_create_tournaments} onChange={(checked) => updateField('can_create_tournaments', checked)} />
                        </div>
                    </SectionCard>

                    <SectionCard title="Configuracion deportiva por defecto" description="Reglas institucionales base que los torneos pueden heredar.">
                        <div className={styles.fieldGrid}>
                            <Field label="Sistema de puntos">
                                <textarea className={styles.textarea} value={form.default_points_system} onChange={(event) => updateField('default_points_system', event.target.value)} />
                            </Field>
                            <Field label="Criterios de desempate">
                                <textarea className={styles.textarea} value={form.default_tiebreakers} onChange={(event) => updateField('default_tiebreakers', event.target.value)} />
                            </Field>
                            <Field label="Formato competitivo">
                                <input className={styles.control} value={form.competition_format} onChange={(event) => updateField('competition_format', event.target.value)} />
                            </Field>
                            <Field label="Modo de calculo de tabla">
                                <select className={styles.select} value={form.table_calculation_mode} onChange={(event) => updateField('table_calculation_mode', event.target.value)}>
                                    {TABLE_CALCULATION_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="Documentos institucionales" description="Activos normativos y documentos de referencia oficial.">
                        <div className={styles.fieldGrid}>
                            <Field label="Estatuto">
                                <textarea className={styles.textarea} value={form.statute} onChange={(event) => updateField('statute', event.target.value)} />
                            </Field>
                            <Field label="Reglamento de competencia">
                                <textarea className={styles.textarea} value={form.competition_rules_document} onChange={(event) => updateField('competition_rules_document', event.target.value)} />
                            </Field>
                            <Field label="Codigo disciplinario">
                                <textarea className={styles.textarea} value={form.disciplinary_code} onChange={(event) => updateField('disciplinary_code', event.target.value)} />
                            </Field>
                            <Field label="Documentos oficiales">
                                <textarea className={styles.textarea} value={form.official_documents} onChange={(event) => updateField('official_documents', event.target.value)} placeholder="Listado, enlaces o notas internas" />
                            </Field>
                        </div>
                    </SectionCard>

                    <SectionCard title="Permisos administrativos" description="Distribucion operativa de responsables internos por perfil.">
                        <div className={styles.fieldGrid}>
                            <Field label="Administradores">
                                <textarea className={styles.textarea} value={form.administrators} onChange={(event) => updateField('administrators', event.target.value)} placeholder="Usuarios o emails, uno por linea" />
                            </Field>
                            <Field label="Editores">
                                <textarea className={styles.textarea} value={form.editors} onChange={(event) => updateField('editors', event.target.value)} placeholder="Usuarios o emails, uno por linea" />
                            </Field>
                            <Field label="Operadores">
                                <textarea className={styles.textarea} value={form.operators} onChange={(event) => updateField('operators', event.target.value)} placeholder="Usuarios o emails, uno por linea" />
                            </Field>
                            <Field label="Auditores">
                                <textarea className={styles.textarea} value={form.auditors} onChange={(event) => updateField('auditors', event.target.value)} placeholder="Usuarios o emails, uno por linea" />
                            </Field>
                        </div>
                        <ActionRow saving={saving} onSave={onSave} />
                    </SectionCard>
                </div>
            );
        case 'structure':
            return (
                <div className={styles.list}>
                    <SectionCard title="Relaciones organizacionales" description="Vinculos institucionales y picks relacionados.">
                        <div className={styles.cardGrid3}>
                            <ChecklistRow label="Entidad superior" value={form.parent_organization_id || 'Sin entidad superior'} />
                            <ChecklistRow label="Entidades hijas" value={`${form.child_organizations.length}`} />
                            <ChecklistRow label="Selecciones" value={`${form.representative_teams.length}`} />
                        </div>
                    </SectionCard>

                    <SectionCard title="Clubes afiliados" description="Tabla operativa con filtro rapido y lectura institucional.">
                        <input className={styles.searchInput} placeholder="Buscar club..." value={clubQuery} onChange={(event) => setClubQuery(event.target.value)} style={{ marginBottom: 16 }} />
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Club</th>
                                        <th>Ubicacion</th>
                                        <th>Visibilidad</th>
                                        <th>Actualizado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clubs.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className={styles.mutedCell}>No hay clubes afiliados con este filtro.</td>
                                        </tr>
                                    )}
                                    {clubs.map((club) => (
                                        <tr key={club.id}>
                                            <td>{club.name}</td>
                                            <td>{[club.region, club.country].filter(Boolean).join(' - ') || '-'}</td>
                                            <td>{club.is_visible ? 'Visible' : 'Oculto'}</td>
                                            <td>{new Date(club.updated_at || club.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>
            );
        case 'competitions':
            return (
                <SectionCard title="Competiciones" description="Torneos oficiales gestionados o avalados por la entidad.">
                    <input className={styles.searchInput} placeholder="Buscar torneo..." value={tournamentQuery} onChange={(event) => setTournamentQuery(event.target.value)} style={{ marginBottom: 16 }} />
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Torneo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tournaments.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className={styles.mutedCell}>No hay torneos vinculados.</td>
                                    </tr>
                                )}
                                {tournaments.map((tournament) => (
                                    <tr key={tournament.id}>
                                        <td>{tournament.display_name || tournament.name}</td>
                                        <td>{tournament.status || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            );
        case 'rules':
            return (
                <div className={styles.list}>
                    <SectionCard title="Defaults deportivos" description="Configuracion marco heredable por torneos y subentidades.">
                        <div className={styles.fieldGrid}>
                            <Field label="Sistema de puntos">
                                <textarea className={styles.textarea} value={form.default_points_system} onChange={(event) => updateField('default_points_system', event.target.value)} />
                            </Field>
                            <Field label="Desempates">
                                <textarea className={styles.textarea} value={form.default_tiebreakers} onChange={(event) => updateField('default_tiebreakers', event.target.value)} />
                            </Field>
                            <Field label="Reglas de bonus">
                                <textarea className={styles.textarea} value={form.default_bonus_rules} onChange={(event) => updateField('default_bonus_rules', event.target.value)} />
                            </Field>
                            <Field label="Duracion de partido">
                                <input className={styles.control} value={form.default_match_duration} onChange={(event) => updateField('default_match_duration', event.target.value)} />
                            </Field>
                            <Field label="Jugadores por lado">
                                <input className={styles.control} value={form.default_players_per_side} onChange={(event) => updateField('default_players_per_side', event.target.value)} />
                            </Field>
                            <Field label="Categorias por defecto">
                                <textarea className={styles.textarea} value={form.default_competition_categories} onChange={(event) => updateField('default_competition_categories', event.target.value)} />
                            </Field>
                            <Field label="Elegibilidad">
                                <textarea className={styles.textarea} value={form.player_eligibility_rules} onChange={(event) => updateField('player_eligibility_rules', event.target.value)} />
                            </Field>
                            <Field label="Disciplina">
                                <textarea className={styles.textarea} value={form.disciplinary_rules} onChange={(event) => updateField('disciplinary_rules', event.target.value)} />
                            </Field>
                        </div>
                        <ActionRow saving={saving} onSave={onSave} />
                    </SectionCard>

                    <SectionCard title="Documentos de reglamento" description="Versiones sincronizadas desde la tabla de regulaciones.">
                        <div className={styles.list}>
                            {regulations.length === 0 && <div className={styles.emptyState}>No hay regulaciones cargadas para esta union.</div>}
                            {regulations.map((regulation) => (
                                <div key={regulation.id} className={styles.rowCard}>
                                    <div style={{ fontWeight: 700 }}>Documento {regulation.id.slice(0, 8)}</div>
                                    <div className={styles.sectionText}>{(regulation.content || 'Sin contenido').slice(0, 200)}</div>
                                    <div className={styles.activityTime}>{new Date(regulation.updated_at).toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                </div>
            );
        case 'rankings':
            return (
                <SectionCard title="Rankings y estadisticas" description="Configuracion oficial de ranking y vistas de lectura.">
                    <div className={styles.fieldGrid}>
                        <ToggleCard label="Ranking oficial habilitado" description="Habilita el modulo de ranking institucional." checked={form.official_ranking_enabled} onChange={(checked) => updateField('official_ranking_enabled', checked)} />
                        <ToggleCard label="Tracking historico" description="Guarda movimientos y evolucion en el tiempo." checked={form.historical_movement_tracking} onChange={(checked) => updateField('historical_movement_tracking', checked)} />
                        <Field label="Tipo de ranking">
                            <input className={styles.control} value={form.ranking_type} onChange={(event) => updateField('ranking_type', event.target.value)} />
                        </Field>
                        <Field label="Ponderacion">
                            <textarea className={styles.textarea} value={form.competition_weighting} onChange={(event) => updateField('competition_weighting', event.target.value)} />
                        </Field>
                        <Field label="Puntos por competencia">
                            <textarea className={styles.textarea} value={form.points_by_competition} onChange={(event) => updateField('points_by_competition', event.target.value)} />
                        </Field>
                        <Field label="Rankings por categoria">
                            <textarea className={styles.textarea} value={form.category_rankings} onChange={(event) => updateField('category_rankings', event.target.value)} />
                        </Field>
                    </div>
                    <ActionRow saving={saving} onSave={onSave} />
                </SectionCard>
            );
        case 'staff':
            return (
                <div className={styles.list}>
                    <SectionCard title="Staff y permisos" description="Miembros con acceso operativo sobre la union.">
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>User id</th>
                                        <th>Rol</th>
                                        <th>Alta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {memberships.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className={styles.mutedCell}>No hay staff vinculado.</td>
                                        </tr>
                                    )}
                                    {memberships.map((membership) => (
                                        <tr key={membership.id}>
                                            <td>{membership.user_id}</td>
                                            <td>{membership.role}</td>
                                            <td>{new Date(membership.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    <SectionCard title="Catalogo de roles" description="Set de roles operativos sugeridos para esta organizacion.">
                        <div className={styles.tokenList}>
                            {['super_admin', 'organization_admin', 'tournament_operator', 'content_editor', 'press_manager', 'club_coordinator', 'analytics_role', 'read_only'].map((role) => (
                                <span key={role} className={styles.token}>{role}</span>
                            ))}
                        </div>
                    </SectionCard>
                </div>
            );
        case 'communication':
            return (
                <div className={styles.list}>
                    <SectionCard title="Noticias y anuncios" description="Contenido oficial asociado a esta union.">
                        <div className={styles.list}>
                            {newsItems.length === 0 && <div className={styles.emptyState}>No hay noticias institucionales cargadas.</div>}
                            {newsItems.map((item) => (
                                <div key={item.id} className={styles.rowCard}>
                                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                                    <div className={styles.sectionText}>{item.status} - {item.published_at ? new Date(item.published_at).toLocaleDateString() : 'Sin publicar'}</div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard title="Activos y acreditaciones" description="Espacio reservado para banners, sponsors y flujo de acreditaciones.">
                        <div className={styles.callout}>La entidad ya tiene espacio para prensa y acreditaciones. Falta conectar formularios y media assets especificos.</div>
                    </SectionCard>
                </div>
            );
        case 'public':
            return (
                <SectionCard title="Configuracion publica" description="Define que modulos quedan visibles en la pagina institucional.">
                    <div className={styles.cardGrid2}>
                        <ToggleCard label="Mostrar clubes afiliados" description="Lista publica de clubes vinculados." checked={form.show_affiliated_clubs} onChange={(checked) => updateField('show_affiliated_clubs', checked)} />
                        <ToggleCard label="Mostrar torneos" description="Competiciones oficiales visibles." checked={form.show_tournaments} onChange={(checked) => updateField('show_tournaments', checked)} />
                        <ToggleCard label="Mostrar standings" description="Tablas y rankings visibles." checked={form.show_standings} onChange={(checked) => updateField('show_standings', checked)} />
                        <ToggleCard label="Mostrar autoridades" description="Referentes institucionales en el perfil." checked={form.show_authorities} onChange={(checked) => updateField('show_authorities', checked)} />
                        <ToggleCard label="Mostrar sponsors" description="Espacio comercial publico." checked={form.show_sponsors} onChange={(checked) => updateField('show_sponsors', checked)} />
                        <ToggleCard label="Mostrar contacto" description="Canales de contacto visibles." checked={form.show_contact} onChange={(checked) => updateField('show_contact', checked)} />
                        <ToggleCard label="Mostrar noticias" description="Feed editorial publico." checked={form.show_news} onChange={(checked) => updateField('show_news', checked)} />
                        <ToggleCard label="Mostrar documentos" description="Reglamentos y manuales en front." checked={form.show_documents} onChange={(checked) => updateField('show_documents', checked)} />
                    </div>
                    <div className={styles.sidebarCard} style={{ marginTop: 18 }}>
                        <div className={styles.sidebarSectionTitle}>Orden publico</div>
                        <div className={styles.tokenList} style={{ marginTop: 14 }}>
                            {form.public_modules_order.map((item) => (
                                <span key={item} className={styles.token}>{item}</span>
                            ))}
                        </div>
                    </div>
                    <ActionRow saving={saving} onSave={onSave} />
                </SectionCard>
            );
        case 'audit':
            return (
                <SectionCard title="Auditoria" description="Trazabilidad institucional y operativa.">
                    <div className={styles.list}>
                        {auditLogs.length === 0 && <div className={styles.emptyState}>No hay registros de auditoria visibles para esta union.</div>}
                        {auditLogs.map((item) => (
                            <div key={item.id} className={styles.rowCard}>
                                <div style={{ fontWeight: 700 }}>{item.action}</div>
                                <div className={styles.sectionText}>Actor: {item.actor_user_id}</div>
                                <div className={styles.sectionText}>Source: {item.source || 'manual'}</div>
                                <div className={styles.activityTime}>{new Date(item.created_at).toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            );
        default:
            return null;
    }
}

function SectionCard({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div className={styles.mainCard}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.sectionTitle}>{title}</div>
                    <p className={styles.sectionText}>{description}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className={styles.field}>
            <label className={styles.label}>{label}</label>
            {children}
        </div>
    );
}

function ActionRow({ saving, onSave }: { saving: boolean; onSave: () => Promise<void> }) {
    return (
        <div className={styles.inlineRow} style={{ justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className={styles.buttonPrimary} onClick={() => void onSave()} disabled={saving}>
                {saving ? <Loader2 size={16} /> : <Save size={16} />}
                {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
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
