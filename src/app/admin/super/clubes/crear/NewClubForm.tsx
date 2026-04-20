'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LogoUploader from '@/components/LogoUploader';
import { getAllCountries } from '@/lib/data/countries';
import { getActiveSports } from '@/lib/data/sports';
import styles from './styles.module.css';
import { createClub, linkDerivedClub } from '@/lib/services/clubService';
import { createUnion } from '@/lib/services/unionService';
import type { ClubCreateInput } from '@/lib/types/clubs';
import { slugifyUnion } from '@/lib/unions';
import { normalizeSlug } from '@/lib/utils/normalize';
import { normalizeLogoUrl, resolveLogoPreviewSrc } from '@/lib/utils/logoUrl';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import {
  CLUB_DERIVATIVE_LABELS,
  type ClubDerivativeType,
  getClubSportValue,
  getSportDisplayName,
} from '@/lib/clubDerivatives';

const activeSports = getActiveSports();

const ENTITY_TYPES = [
  { value: 'club', label: 'Club' },
  { value: 'seleccion', label: 'Seleccion' },
  { value: 'academia', label: 'Academia' },
  { value: 'franquicia', label: 'Franquicia' },
] as const;

const SECTION_ITEMS = [
  { id: 'identity', index: '01', label: 'IDENTITY_CORE', title: 'Identity Core', tag: 'Blocking Data' },
  { id: 'classification', index: '02', label: 'SPORT_SPECS', title: 'Sport Specs', tag: 'Classification' },
  { id: 'location', index: '03', label: 'GEO_LOCATION', title: 'Geo Location', tag: 'Physical HQ' },
  { id: 'org', index: '04', label: 'ORGANIZATION', title: 'Organization', tag: 'Affiliation' },
  { id: 'infrastructure', index: '05', label: 'VENUE_INFRA', title: 'Venue Infra', tag: 'Infrastructure' },
  { id: 'links', index: '06', label: 'SOCIAL_CONNECT', title: 'Social Connect', tag: 'Presence' },
  { id: 'status', index: '07', label: 'LIFECYCLE', title: 'Lifecycle', tag: 'Visibility' },
] as const;

const COUNTRIES = getAllCountries()
  .filter((country) => country.code.trim().length === 2)
  .map((country) => {
    const label = country.nameEs || country.name;
    return { value: label, label };
  })
  .sort((a, b) => a.label.localeCompare(b.label, 'es'));

const UNION_LEVEL_OPTIONS = [
  { value: 'regional', label: 'Regional' },
  { value: 'provincial', label: 'Provincial' },
  { value: 'national', label: 'Nacional' },
  { value: 'international', label: 'Internacional' },
];

type UnionOption = {
  id: string;
  name: string;
  country?: string | null;
};

interface InlineUnionFormState {
  name: string;
  slug: string;
  country: string;
  sport: string;
  union_level: string;
  slugManuallyEdited: boolean;
}

interface FormState extends Omit<ClubCreateInput, 'slug'> {
  slug: string;
  slugManuallyEdited: boolean;
  aliases_text: string;
  secondary_unions: string[];
}

interface NewClubFormProps {
  unions?: { id: string; name: string; country?: string | null }[];
  derivedPrefill?: {
    baseClub: {
      id: string;
      name: string;
      short_name?: string | null;
      union_id?: string | null;
      country?: string | null;
      region?: string | null;
      city?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
      sport?: string | null;
      sport_id?: string | null;
    };
    derivativeType: ClubDerivativeType;
    derivedSport?: string | null;
  } | null;
}

function getEmptyFormState(): FormState {
  return {
    name: '',
    short_name: '',
    slug: '',
    slugManuallyEdited: false,
    entity_type: 'club',
    logo_url: null,
    primary_color: '#e2ff43',
    sport: 'rugby',
    gender: 'Masculino',
    age_grade: '',
    country: 'Argentina',
    region: '',
    city: '',
    address: '',
    lat: null,
    lng: null,
    union_id: '',
    secondary_unions: [],
    organization_role: '',
    admin_contact_name: '',
    admin_contact_email: '',
    admin_contact_phone: '',
    source: 'manual',
    external_id: '',
    aliases_text: '',
    venue_name: '',
    venue_address: '',
    venue_capacity: null,
    venue_notes: '',
    website: '',
    instagram: '',
    x_url: '',
    youtube: '',
    tiktok: '',
    visibility: 'visible',
    lifecycle: 'draft',
    notes_internal: '',
  };
}

function sortUnionOptions(list: UnionOption[]) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function buildManualVariantCategories(
  form: Pick<FormState, 'gender' | 'age_grade' | 'sport'>,
  isDerived: boolean,
  baseClubId?: string | null,
): string[] | undefined {
  const categories = new Set<string>();
  const normalizedGender = normalizeSlug(form.gender || 'Masculino');
  const normalizedAgeGrade = normalizeSlug(form.age_grade || '');
  const normalizedSport = normalizeSlug(form.sport || '');

  if (isDerived) {
    categories.add('variant:manual');
  }

  if (baseClubId) {
    categories.add(`base_club:${baseClubId}`);
  }

  if (normalizedSport) {
    categories.add(`sport:${normalizedSport}`);
  }

  if (normalizedAgeGrade) {
    categories.add(`age_grade:${normalizedAgeGrade}`);
    categories.add('audience:juveniles');
  }

  if (isDerived || normalizedGender !== 'masculino') {
    categories.add(`gender:${normalizedGender}`);
  }

  return categories.size > 0 ? Array.from(categories) : undefined;
}

function getDerivedClubSuffix(type: ClubDerivativeType, sportLabel?: string | null) {
  if (type === 'youth') return 'Juvenil';
  if (type === 'women') return 'Femenino';
  if (type === 'other_sport') return sportLabel || 'Otro deporte';
  if (type === 'divisions') return 'Divisiones';
  return 'Derivado';
}

export default function NewClubForm({ unions = [], derivedPrefill = null }: NewClubFormProps) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const derivedPrefillAppliedRef = useRef(false);

  const [form, setForm] = useState<FormState>(() => getEmptyFormState());

  const [initialForm] = useState(form);
  const [saving, setSaving] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdClubId, setCreatedClubId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('identity');
  const [availableUnions, setAvailableUnions] = useState<UnionOption[]>(() => sortUnionOptions(unions));
  const [unionSearch, setUnionSearch] = useState('');
  const [showUnionSuggestions, setShowUnionSuggestions] = useState(false);
  const [filteredUnions, setFilteredUnions] = useState<UnionOption[]>(() => sortUnionOptions(unions));
  const [showUnionCreator, setShowUnionCreator] = useState(false);
  const [creatingUnion, setCreatingUnion] = useState(false);
  const [unionCreateError, setUnionCreateError] = useState<string | null>(null);
  const [unionCreateSuccess, setUnionCreateSuccess] = useState<string | null>(null);
  const [unionCreateForm, setUnionCreateForm] = useState<InlineUnionFormState>({
    name: '',
    slug: '',
    country: 'Argentina',
    sport: 'rugby',
    union_level: 'regional',
    slugManuallyEdited: false,
  });
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [useUrlForLogo, setUseUrlForLogo] = useState(false);

  const logoPreviewSrc = resolveLogoPreviewSrc(form.logo_url);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const selectedUnion = availableUnions.find((union) => union.id === form.union_id) || null;
  const systemStatus = saving ? 'WRITING_TO_DATABASE...' : isDirty ? 'DRAFT_PENDING_SAVE' : 'SYSTEM_READY';

  useEffect(() => {
    if (!form.slugManuallyEdited && form.name) {
      setForm((prev) => ({ ...prev, slug: normalizeSlug(form.name) }));
    }
  }, [form.name, form.slugManuallyEdited]);

  useEffect(() => {
    setAvailableUnions(sortUnionOptions(unions));
  }, [unions]);

  useEffect(() => {
    if (!derivedPrefill || derivedPrefillAppliedRef.current) return;

    const baseSport = getClubSportValue(derivedPrefill.baseClub);
    const nextSport = derivedPrefill.derivativeType === 'other_sport'
      ? (derivedPrefill.derivedSport || baseSport || 'rugby')
      : (baseSport || form.sport || 'rugby');
    const relationLabel = CLUB_DERIVATIVE_LABELS[derivedPrefill.derivativeType];
    const sportLabel = derivedPrefill.derivativeType === 'other_sport'
      ? getSportDisplayName(nextSport)
      : '';
    const derivedSuffix = getDerivedClubSuffix(derivedPrefill.derivativeType, sportLabel);
    const baseName = derivedPrefill.baseClub.name || form.name;
    const baseShortName = derivedPrefill.baseClub.short_name || '';
    const derivedName = baseName ? `${baseName} ${derivedSuffix}`.trim() : form.name;
    const derivedShortName = baseShortName ? `${baseShortName} ${derivedSuffix}`.trim() : '';
    const noteTokens = [
      `Derivado de ${derivedPrefill.baseClub.name}`,
      relationLabel,
      sportLabel || null,
    ].filter(Boolean);

    const nextForm: FormState = {
      ...form,
      name: derivedName,
      short_name: derivedShortName,
      slug: normalizeSlug(derivedName),
      slugManuallyEdited: false,
      logo_url: derivedPrefill.baseClub.logo_url || null,
      primary_color: derivedPrefill.baseClub.primary_color || form.primary_color,
      sport: nextSport,
      gender: form.gender || 'Masculino',
      age_grade: derivedPrefill.derivativeType === 'youth' ? (form.age_grade || 'Juvenil') : form.age_grade,
      country: derivedPrefill.baseClub.country || form.country,
      region: derivedPrefill.baseClub.region || '',
      city: derivedPrefill.baseClub.city || '',
      union_id: derivedPrefill.baseClub.union_id || '',
      notes_internal: noteTokens.join(' · '),
    };

    setForm(nextForm);

    const nextSelectedUnion = unions.find((union) => union.id === derivedPrefill.baseClub.union_id);
    if (nextSelectedUnion) {
      setUnionSearch(nextSelectedUnion.name);
    }

    derivedPrefillAppliedRef.current = true;
  }, [derivedPrefill, form, unions]);

  useEffect(() => {
    if (form.union_id && !unionSearch) {
      const nextSelectedUnion = availableUnions.find((union) => union.id === form.union_id);
      if (nextSelectedUnion) {
        setUnionSearch(nextSelectedUnion.name);
      }
    }
  }, [availableUnions, form.union_id, unionSearch]);

  useEffect(() => {
    const query = unionSearch.trim().toLowerCase();
    if (!query) {
      setFilteredUnions(availableUnions);
      return;
    }

    setFilteredUnions(
      availableUnions.filter((union) =>
        union.name.toLowerCase().includes(query)
        || (union.country && union.country.toLowerCase().includes(query)),
      ),
    );
  }, [availableUnions, unionSearch]);

  useEffect(() => {
    if (!unionCreateForm.slugManuallyEdited) {
      setUnionCreateForm((prev) => ({
        ...prev,
        slug: slugifyUnion(prev.name),
      }));
    }
  }, [unionCreateForm.name, unionCreateForm.slugManuallyEdited]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        root: null,
        rootMargin: '-10% 0px -55% 0px',
        threshold: [0.2, 0.45, 0.7],
      },
    );

    const nodes = SECTION_ITEMS
      .map((section) => sectionRefs.current[section.id])
      .filter((node): node is HTMLElement => Boolean(node));

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;

    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    wrapperRef.current.style.setProperty('--pointer-x', `${x}%`);
    wrapperRef.current.style.setProperty('--pointer-y', `${y}%`);
  };

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateUnionCreateField = useCallback(<K extends keyof InlineUnionFormState>(
    field: K,
    value: InlineUnionFormState[K],
  ) => {
    setUnionCreateForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSlugChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      slug: value.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, ''),
      slugManuallyEdited: true,
    }));
  };

  const handleRegenerateSlug = () => {
    setForm((prev) => ({
      ...prev,
      slug: normalizeSlug(prev.name),
      slugManuallyEdited: false,
    }));
  };

  const handleUnionSearchChange = (value: string) => {
    setUnionSearch(value);
    setShowUnionSuggestions(value.length > 0);
  };

  const handleSelectUnion = (unionId: string, unionName: string) => {
    updateField('union_id', unionId);
    setUnionSearch(unionName);
    setShowUnionSuggestions(false);
    setUnionCreateError(null);
    setUnionCreateSuccess(null);
  };

  const handleUnionCreateSlugChange = (value: string) => {
    setUnionCreateForm((prev) => ({
      ...prev,
      slug: slugifyUnion(value),
      slugManuallyEdited: true,
    }));
  };

  const handleToggleUnionCreator = () => {
    setUnionCreateError(null);
    setUnionCreateSuccess(null);

    setShowUnionCreator((prev) => {
      const nextOpen = !prev;
      if (nextOpen) {
        setUnionCreateForm((current) => ({
          ...current,
          name: current.name || unionSearch.trim(),
          slug: current.slug || slugifyUnion(current.name || unionSearch.trim()),
          country: form.country || current.country || 'Argentina',
          sport: form.sport || current.sport || 'rugby',
          union_level: current.union_level || 'regional',
        }));
      }
      return nextOpen;
    });
  };

  const handleCreateUnion = async () => {
    const unionName = unionCreateForm.name.trim();
    const unionSlug = slugifyUnion(unionCreateForm.slug || unionName);

    if (unionName.length < 2) {
      setUnionCreateError('Ingresa un nombre valido para la union.');
      return;
    }

    if (!unionSlug) {
      setUnionCreateError('Ingresa un slug valido para la union.');
      return;
    }

    setCreatingUnion(true);
    setUnionCreateError(null);
    setUnionCreateSuccess(null);

    try {
      const result = await createUnion({
        name: unionName,
        slug: unionSlug,
        country: unionCreateForm.country || form.country || null,
        sport: unionCreateForm.sport || form.sport || null,
        union_level: unionCreateForm.union_level || 'regional',
      });

      if (!result.success || !result.union) {
        setUnionCreateError(result.error || 'No se pudo crear la union.');
        return;
      }

      const createdUnion: UnionOption = {
        id: result.union.id,
        name: result.union.name,
        country: result.union.country || unionCreateForm.country || null,
      };

      setAvailableUnions((prev) => {
        const deduped = prev.filter((union) => union.id !== createdUnion.id);
        return sortUnionOptions([...deduped, createdUnion]);
      });

      invalidateCache('unions_list');
      handleSelectUnion(createdUnion.id, createdUnion.name);
      setUnionCreateSuccess('Union creada y seleccionada.');
      setShowUnionCreator(false);
      setUnionCreateForm({
        name: '',
        slug: '',
        country: form.country || 'Argentina',
        sport: form.sport || 'rugby',
        union_level: 'regional',
        slugManuallyEdited: false,
      });
    } catch (error) {
      setUnionCreateError(error instanceof Error ? error.message : 'No se pudo crear la union.');
    } finally {
      setCreatingUnion(false);
    }
  };

  const handleLogoUrlSubmit = () => {
    const normalizedLogoUrl = normalizeLogoUrl(logoUrlInput);
    if (!normalizedLogoUrl) return;
    updateField('logo_url', normalizedLogoUrl);
    setLogoUrlInput('');
  };

  const handleSave = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();

    if (!form.name || form.name.length < 2) {
      alert('Error: El nombre debe tener minimo 2 caracteres.');
      return;
    }

    if (!form.slug || !/^[a-z0-9-]+$/.test(form.slug)) {
      alert('Error: Slug vacio o con formato invalido (solo a-z, 0-9 y guiones).');
      return;
    }

    if (!form.country) {
      alert('Error: Especifica un pais.');
      return;
    }

    if (form.source === 'api' && !form.external_id) {
      alert('Error: External ID es requerido cuando la fuente es API.');
      return;
    }

    const warnings: string[] = [];
    if (!form.logo_url) warnings.push('El club no tiene logo.');
    if (!form.union_id) warnings.push('El club no tiene union asociada.');
    if (!form.city) warnings.push('No especificaste la ciudad.');
    if (form.source === 'api' && !form.aliases_text.trim()) {
      warnings.push('No se cargaron aliases para mejorar el matching de la API.');
    }

    if (warnings.length > 0) {
      const confirmed = window.confirm(
        `Advertencias:\n${warnings.map((warning) => `- ${warning}`).join('\n')}\n\nContinuar de todas formas?`,
      );

      if (!confirmed) return;
    }

    const payload: ClubCreateInput & { aliases?: string[] } = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      entity_type: form.entity_type,
      sport: form.sport,
      country: form.country,
      short_name: form.short_name || null,
      region: form.region || null,
      city: form.city || null,
      address: form.address || null,
      lat: form.lat,
      lng: form.lng,
      union_id: form.union_id || null,
      secondary_unions: form.secondary_unions.length > 0 ? form.secondary_unions : undefined,
      organization_role: form.organization_role || null,
      admin_contact_name: form.admin_contact_name || null,
      admin_contact_email: form.admin_contact_email || null,
      admin_contact_phone: form.admin_contact_phone || null,
      logo_url: form.logo_url,
      primary_color: form.primary_color || null,
      source: form.source,
      external_id: form.external_id || null,
      aliases: form.aliases_text.split(',').map((value) => value.trim()).filter(Boolean),
      venue_name: form.venue_name || null,
      venue_address: form.venue_address || null,
      venue_capacity: form.venue_capacity,
      venue_notes: form.venue_notes || null,
      website: form.website || null,
      instagram: form.instagram || null,
      x_url: form.x_url || null,
      youtube: form.youtube || null,
      tiktok: form.tiktok || null,
      visibility: form.visibility,
      lifecycle: form.lifecycle,
      notes_internal: form.notes_internal || null,
      categories: buildManualVariantCategories(form, Boolean(derivedPrefill), derivedPrefill?.baseClub.id),
    };

    setSaving(true);

    try {
      const result = await createClub(payload);
      if (!result.success) {
        alert(`Error: ${result.error}`);
        return;
      }

      const createdId = result.club?.id ?? null;

      if (createdId && derivedPrefill) {
        const relationResult = await linkDerivedClub({
          baseClubId: derivedPrefill.baseClub.id,
          derivedClubId: createdId,
          derivativeType: derivedPrefill.derivativeType,
        });

        if (!relationResult.success) {
          alert(`El club se creo, pero no se pudo vincular como derivado: ${relationResult.error}`);
        }
      }

      invalidateCache('clubs_list');
      setCreatedClubId(createdId);
      setShowSuccessModal(true);
    } catch (error) {
      alert(`Error inesperado: ${error instanceof Error ? error.message : 'Desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (isDirty) {
      setShowExitModal(true);
      return;
    }

    router.back();
  };

  const handleCreateAnotherClub = () => {
    derivedPrefillAppliedRef.current = false;
    setForm(getEmptyFormState());
    setUnionSearch('');
    setShowUnionSuggestions(false);
    setFilteredUnions(sortUnionOptions(unions));
    setShowUnionCreator(false);
    setCreatingUnion(false);
    setUnionCreateError(null);
    setUnionCreateSuccess(null);
    setUnionCreateForm({
      name: '',
      slug: '',
      country: 'Argentina',
      sport: 'rugby',
      union_level: 'regional',
      slugManuallyEdited: false,
    });
    setLogoUrlInput('');
    setUseUrlForLogo(false);
    setActiveSection('identity');
    setScrolled(false);
    setShowSuccessModal(false);
    setCreatedClubId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    router.replace('/admin/super/clubes/crear');
  };

  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.formWrapper} ref={wrapperRef} onMouseMove={handleMouseMove}>
      {showSuccessModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalHeader}>Club creado correctamente</h2>
            <p className={styles.modalText}>La carga se guardo. Puedes abrir el panel del club o iniciar una nueva alta.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancelModal} onClick={handleCreateAnotherClub}>
                Crear otro club
              </button>
              <button
                type="button"
                className={styles.btnConfirmModal}
                onClick={() => createdClubId && router.push(`/admin/entities/${createdClubId}/manage?type=club`)}
                disabled={!createdClubId}
              >
                Ir al panel
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalHeader}>Descartar cambios</h2>
            <p className={styles.modalText}>Todavia hay cambios sin guardar. Si sales ahora, se perderan.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancelModal} onClick={() => setShowExitModal(false)}>
                Seguir editando
              </button>
              <button type="button" className={styles.btnConfirmModal} onClick={() => router.back()}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
          <div className={styles.headerMain}>
            <span className={styles.eyebrow}>Admin / Club Management</span>
            <h1 className={styles.title}>
              {derivedPrefill ? 'New Club Variant' : 'New Club Registration'}
            </h1>
            <p className={styles.headerText}>
              Formulario completo para identidad, afiliacion, ubicacion, infraestructura y ciclo de vida del club.
            </p>
          </div>
          <div className={styles.headerMeta}>
            <p className={styles.statusMeta}>SYSTEM_STATUS: {saving ? 'WRITING' : isDirty ? 'DRAFT' : 'READY'}</p>
            <p className={styles.versionMeta}>V.2.1.0-MESH</p>
          </div>
        </header>

        <div className={styles.formGrid}>
          <aside className={styles.navSidebar}>
            <ul className={styles.navList}>
              {SECTION_ITEMS.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`${styles.navItem} ${activeSection === section.id ? styles.navItemActive : ''}`}
                    onClick={() => scrollToSection(section.id)}
                  >
                    <span className={styles.navIndex}>{section.index}</span>
                    <span>{section.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className={styles.sidebarPanel}>
              <p className={styles.sidebarLabel}>SAVE STATE</p>
              <p className={styles.sidebarValue}>{systemStatus}</p>
              {selectedUnion && (
                <p className={styles.sidebarHint}>Union actual: {selectedUnion.name}</p>
              )}
              {derivedPrefill && (
                <p className={styles.sidebarHint}>Base club: {derivedPrefill.baseClub.name}</p>
              )}
            </div>
          </aside>

          <div className={styles.formPane}>
            {derivedPrefill && (
              <div className={styles.derivedNotice}>
                <p className={styles.noticeEyebrow}>00 DERIVED_CONTEXT</p>
                <h2 className={styles.noticeTitle}>Contexto del derivado</h2>
                <p className={styles.noticeText}>
                  Base: <strong>{derivedPrefill.baseClub.name}</strong>
                  {derivedPrefill.derivativeType === 'other_sport' && form.sport
                    ? ` · deporte destino: ${getSportDisplayName(form.sport)}`
                    : ''}
                </p>
                <p className={styles.noticeText}>
                  El formulario arranca con nombre, union, ubicacion y branding del club base.
                  Ajusta nombre y slug para diferenciar esta rama.
                </p>
              </div>
            )}

            <form className={styles.form} autoComplete="off" onSubmit={handleSave}>
              <section
                id="identity"
                ref={(node) => { sectionRefs.current.identity = node; }}
                className={`${styles.sectionCard} ${activeSection === 'identity' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>01 IDENTITY_CORE</p>
                    <h2 className={styles.sectionTitle}>Identity Core</h2>
                  </div>
                  <small className={styles.sectionTag}>Blocking Data</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <div className={styles.labelRow}>
                      <label htmlFor="name" className={styles.label}>Official Name</label>
                      <span className={styles.req}>REQUIRED</span>
                    </div>
                    <input
                      id="name"
                      type="text"
                      className={styles.input}
                      value={form.name}
                      onChange={(event) => updateField('name', event.target.value)}
                      placeholder="e.g. Tala Rugby Club"
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="slug" className={styles.label}>Slug</label>
                      <span className={styles.req}>URL_ID</span>
                    </div>
                    <div className={styles.slugShell}>
                      <input
                        id="slug"
                        type="text"
                        className={`${styles.input} ${styles.slugInput}`}
                        value={form.slug}
                        onChange={(event) => handleSlugChange(event.target.value)}
                        placeholder="tala-rugby-club"
                        required
                      />
                      <button type="button" className={styles.smallButton} onClick={handleRegenerateSlug}>
                        Regenerate
                      </button>
                    </div>
                    <span className={styles.helper}>Solo minusculas, numeros y guiones.</span>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="entity_type" className={styles.label}>Entity Type</label>
                    <select
                      id="entity_type"
                      className={styles.select}
                      value={form.entity_type}
                      onChange={(event) => updateField('entity_type', event.target.value as FormState['entity_type'])}
                    >
                      {ENTITY_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="short_name" className={styles.label}>Short Name</label>
                    <input
                      id="short_name"
                      type="text"
                      className={styles.input}
                      value={form.short_name || ''}
                      onChange={(event) => updateField('short_name', event.target.value)}
                      placeholder="e.g. Tala R.C."
                    />
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <div className={`${styles.field} ${!form.logo_url ? styles.hasWarning : ''}`}>
                    <div className={styles.labelRow}>
                      <label className={styles.label}>Club Logo</label>
                    </div>
                    <div className={styles.logoPanel}>
                      <div className={styles.logoTabs}>
                        <button
                          type="button"
                          className={`${styles.tabButton} ${!useUrlForLogo ? styles.tabButtonActive : ''}`}
                          onClick={() => setUseUrlForLogo(false)}
                        >
                          Upload file
                        </button>
                        <button
                          type="button"
                          className={`${styles.tabButton} ${useUrlForLogo ? styles.tabButtonActive : ''}`}
                          onClick={() => setUseUrlForLogo(true)}
                        >
                          Use URL
                        </button>
                      </div>

                      {logoPreviewSrc && (
                        <div className={styles.logoPreviewWrap}>
                          <img src={logoPreviewSrc} className={styles.logoPreview} alt="Logo preview" />
                          <button type="button" className={styles.logoRemoveBtn} onClick={() => updateField('logo_url', null)}>
                            Remove
                          </button>
                        </div>
                      )}

                      {!useUrlForLogo ? (
                        <div className={styles.logoZone}>
                          <LogoUploader onUpload={(url) => updateField('logo_url', url)} accentColor="#e2ff43" />
                          <p className={styles.helper}>PNG o SVG recomendados para branding.</p>
                        </div>
                      ) : (
                        <div className={styles.logoUrlRow}>
                          <input
                            type="text"
                            className={styles.input}
                            value={logoUrlInput}
                            onChange={(event) => setLogoUrlInput(event.target.value)}
                            placeholder="https://... o snippet HTML"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleLogoUrlSubmit();
                              }
                            }}
                          />
                          <button type="button" className={styles.smallButton} onClick={handleLogoUrlSubmit}>
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={styles.warningTag}>Missing branding asset</div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="primary_color" className={styles.label}>Primary Brand Color</label>
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        value={form.primary_color || '#e2ff43'}
                        onChange={(event) => updateField('primary_color', event.target.value)}
                        className={styles.colorPicker}
                      />
                      <input
                        id="primary_color"
                        type="text"
                        className={styles.input}
                        value={form.primary_color || '#e2ff43'}
                        onChange={(event) => updateField('primary_color', event.target.value)}
                        placeholder="#e2ff43"
                      />
                    </div>
                    <span className={styles.helper}>Se usa para el branding del club en la plataforma.</span>
                  </div>
                </div>
              </section>

              <section
                id="classification"
                ref={(node) => { sectionRefs.current.classification = node; }}
                className={`${styles.sectionCard} ${activeSection === 'classification' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>02 SPORT_SPECS</p>
                    <h2 className={styles.sectionTitle}>Sport Specs</h2>
                  </div>
                  <small className={styles.sectionTag}>Classification</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="sport" className={styles.label}>Primary Sport</label>
                      <span className={styles.req}>REQUIRED</span>
                    </div>
                    <select
                      id="sport"
                      className={styles.select}
                      value={form.sport}
                      onChange={(event) => updateField('sport', event.target.value)}
                    >
                      {activeSports.map((sport) => (
                        <option key={sport.id} value={sport.id}>{sport.nameEs}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="gender" className={styles.label}>Gender Focus</label>
                    <select
                      id="gender"
                      className={styles.select}
                      value={form.gender || ''}
                      onChange={(event) => updateField('gender', event.target.value)}
                    >
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                      <option value="Mixto">Mixto</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="age_grade" className={styles.label}>Age Grade</label>
                    <input
                      id="age_grade"
                      type="text"
                      className={styles.input}
                      value={form.age_grade || ''}
                      onChange={(event) => updateField('age_grade', event.target.value)}
                      placeholder="Seniors, M19, U16..."
                    />
                  </div>
                </div>
              </section>

              <section
                id="location"
                ref={(node) => { sectionRefs.current.location = node; }}
                className={`${styles.sectionCard} ${activeSection === 'location' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>03 GEO_LOCATION</p>
                    <h2 className={styles.sectionTitle}>Geo Location</h2>
                  </div>
                  <small className={styles.sectionTag}>Physical HQ</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="country" className={styles.label}>Country</label>
                      <span className={styles.req}>REQUIRED</span>
                    </div>
                    <select
                      id="country"
                      className={styles.select}
                      value={form.country}
                      onChange={(event) => updateField('country', event.target.value)}
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country.value} value={country.value}>{country.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={`${styles.field} ${!form.city ? styles.hasWarning : ''}`}>
                    <label htmlFor="city" className={styles.label}>City</label>
                    <input
                      id="city"
                      type="text"
                      className={styles.input}
                      value={form.city || ''}
                      onChange={(event) => updateField('city', event.target.value)}
                      placeholder="Buenos Aires"
                    />
                    <div className={styles.warningTag}>City is recommended for search indexing</div>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="region" className={styles.label}>Region</label>
                    <input
                      id="region"
                      type="text"
                      className={styles.input}
                      value={form.region || ''}
                      onChange={(event) => updateField('region', event.target.value)}
                      placeholder="Cordoba"
                    />
                  </div>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label htmlFor="address" className={styles.label}>Full Address</label>
                    <input
                      id="address"
                      type="text"
                      className={styles.input}
                      value={form.address || ''}
                      onChange={(event) => updateField('address', event.target.value)}
                      placeholder="Street, number, neighborhood..."
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="lat" className={styles.label}>Latitude</label>
                    <input
                      id="lat"
                      type="number"
                      step="any"
                      className={styles.input}
                      value={form.lat ?? ''}
                      onChange={(event) => updateField('lat', event.target.value ? parseFloat(event.target.value) : null)}
                      placeholder="-34.6037"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="lng" className={styles.label}>Longitude</label>
                    <input
                      id="lng"
                      type="number"
                      step="any"
                      className={styles.input}
                      value={form.lng ?? ''}
                      onChange={(event) => updateField('lng', event.target.value ? parseFloat(event.target.value) : null)}
                      placeholder="-58.3816"
                    />
                  </div>
                </div>
              </section>

              <section
                id="org"
                ref={(node) => { sectionRefs.current.org = node; }}
                className={`${styles.sectionCard} ${activeSection === 'org' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>04 ORGANIZATION</p>
                    <h2 className={styles.sectionTitle}>Organization</h2>
                  </div>
                  <small className={styles.sectionTag}>Affiliation</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="source" className={styles.label}>Source</label>
                      <span className={styles.req}>REQUIRED</span>
                    </div>
                    <select
                      id="source"
                      className={styles.select}
                      value={form.source}
                      onChange={(event) => updateField('source', event.target.value as FormState['source'])}
                    >
                      <option value="manual">Manual Entry</option>
                      <option value="api">External API</option>
                      <option value="import">Bulk Import</option>
                    </select>
                  </div>
                  <div className={`${styles.field} ${styles.sourceField} ${form.source === 'api' ? styles.sourceFieldActive : ''}`}>
                    <div className={styles.labelRow}>
                      <label htmlFor="external_id" className={styles.label}>External ID</label>
                      {form.source === 'api' && <span className={styles.req}>REQUIRED FOR API</span>}
                    </div>
                    <input
                      id="external_id"
                      type="text"
                      className={styles.input}
                      value={form.external_id || ''}
                      onChange={(event) => updateField('external_id', event.target.value)}
                      placeholder="ID_FROM_API_001"
                      disabled={form.source !== 'api'}
                    />
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <div className={`${styles.field} ${!form.union_id ? styles.hasWarning : ''} ${styles.fieldFull}`}>
                    <div className={styles.labelRow}>
                      <label htmlFor="union_search" className={styles.label}>Main Union</label>
                      <span className={styles.req}>RECOMMENDED</span>
                    </div>
                    <div className={styles.unionSearchWrap}>
                      <input
                        id="union_search"
                        type="text"
                        className={styles.input}
                        value={unionSearch}
                        onChange={(event) => handleUnionSearchChange(event.target.value)}
                        onFocus={() => setShowUnionSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowUnionSuggestions(false), 200)}
                        placeholder="Search union by name..."
                      />

                      {showUnionSuggestions && filteredUnions.length > 0 && (
                        <div className={styles.autocompleteDropdown}>
                          {filteredUnions.map((union) => (
                            <div
                              key={union.id}
                              className={styles.autocompleteItem}
                              onMouseDown={() => handleSelectUnion(union.id, union.name)}
                            >
                              <span>{union.name}</span>
                              <span className={styles.autocompleteCountry}>{union.country || 'N/A'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedUnion && (
                      <span className={styles.helper}>Union seleccionada: {selectedUnion.name}</span>
                    )}
                    <div className={styles.warningTag}>Official affiliation improves competition setup</div>

                    <div className={styles.unionHelperRow}>
                      <span className={styles.helper}>Si no existe en el catalogo, puedes crearla desde este mismo formulario.</span>
                      <button type="button" className={styles.linkButton} onClick={handleToggleUnionCreator}>
                        {showUnionCreator ? 'Cancelar' : 'Crear union'}
                      </button>
                    </div>

                    {unionCreateSuccess && (
                      <span className={`${styles.helper} ${styles.helperSuccess}`}>{unionCreateSuccess}</span>
                    )}

                    {showUnionCreator && (
                      <div className={styles.inlineUnionCard}>
                        <div className={styles.inlineUnionHeader}>
                          <div>
                            <p className={styles.inlineUnionTitle}>Nueva union</p>
                            <p className={styles.inlineUnionText}>Se crea con datos minimos y queda seleccionada en el club.</p>
                          </div>
                        </div>

                        <div className={styles.inputGroup}>
                          <div className={styles.field}>
                            <label className={styles.label}>Nombre</label>
                            <input
                              type="text"
                              className={styles.input}
                              value={unionCreateForm.name}
                              onChange={(event) => updateUnionCreateField('name', event.target.value)}
                              placeholder="Union de Rugby de Salta"
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Slug</label>
                            <input
                              type="text"
                              className={styles.input}
                              value={unionCreateForm.slug}
                              onChange={(event) => handleUnionCreateSlugChange(event.target.value)}
                              placeholder="union-rugby-salta"
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Pais</label>
                            <select
                              className={styles.select}
                              value={unionCreateForm.country}
                              onChange={(event) => updateUnionCreateField('country', event.target.value)}
                            >
                              {COUNTRIES.map((country) => (
                                <option key={country.value} value={country.value}>{country.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Deporte</label>
                            <select
                              className={styles.select}
                              value={unionCreateForm.sport}
                              onChange={(event) => updateUnionCreateField('sport', event.target.value)}
                            >
                              {activeSports.map((sport) => (
                                <option key={sport.id} value={sport.id}>{sport.nameEs}</option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Alcance</label>
                            <select
                              className={styles.select}
                              value={unionCreateForm.union_level}
                              onChange={(event) => updateUnionCreateField('union_level', event.target.value)}
                            >
                              {UNION_LEVEL_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {unionCreateError && (
                          <div className={styles.inlineUnionError}>{unionCreateError}</div>
                        )}

                        <div className={styles.inlineUnionActions}>
                          <button type="button" className={styles.btnCancelModal} onClick={handleToggleUnionCreator}>
                            Cancelar
                          </button>
                          <button type="button" className={styles.btnConfirmModal} onClick={handleCreateUnion} disabled={creatingUnion}>
                            {creatingUnion ? 'Creando...' : 'Crear y seleccionar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="organization_role" className={styles.label}>Organization Role</label>
                    <input
                      id="organization_role"
                      type="text"
                      className={styles.input}
                      value={form.organization_role || ''}
                      onChange={(event) => updateField('organization_role', event.target.value)}
                      placeholder="club afiliado, filial, academia..."
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="admin_contact_name" className={styles.label}>Admin Contact Name</label>
                    <input
                      id="admin_contact_name"
                      type="text"
                      className={styles.input}
                      value={form.admin_contact_name || ''}
                      onChange={(event) => updateField('admin_contact_name', event.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="admin_contact_email" className={styles.label}>Admin Email</label>
                    <input
                      id="admin_contact_email"
                      type="email"
                      className={styles.input}
                      value={form.admin_contact_email || ''}
                      onChange={(event) => updateField('admin_contact_email', event.target.value)}
                      placeholder="admin@club.com"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="admin_contact_phone" className={styles.label}>Admin Phone</label>
                    <input
                      id="admin_contact_phone"
                      type="tel"
                      className={styles.input}
                      value={form.admin_contact_phone || ''}
                      onChange={(event) => updateField('admin_contact_phone', event.target.value)}
                      placeholder="+54..."
                    />
                  </div>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label htmlFor="aliases" className={styles.label}>Aliases / Alternate Names</label>
                    <input
                      id="aliases"
                      type="text"
                      className={styles.input}
                      value={form.aliases_text}
                      onChange={(event) => updateField('aliases_text', event.target.value)}
                      placeholder="Separados por coma..."
                    />
                    <span className={styles.helper}>Importante para matching inteligente con APIs o imports.</span>
                  </div>
                </div>
              </section>

              <section
                id="infrastructure"
                ref={(node) => { sectionRefs.current.infrastructure = node; }}
                className={`${styles.sectionCard} ${activeSection === 'infrastructure' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>05 VENUE_INFRA</p>
                    <h2 className={styles.sectionTitle}>Venue Infra</h2>
                  </div>
                  <small className={styles.sectionTag}>Infrastructure</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={`${styles.field} ${!form.venue_name ? styles.hasWarning : ''}`}>
                    <label htmlFor="venue_name" className={styles.label}>Stadium / Venue Name</label>
                    <input
                      id="venue_name"
                      type="text"
                      className={styles.input}
                      value={form.venue_name || ''}
                      onChange={(event) => updateField('venue_name', event.target.value)}
                      placeholder="Estadio Principal"
                    />
                    <div className={styles.warningTag}>Venue details improve fan experience</div>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="venue_capacity" className={styles.label}>Capacity</label>
                    <input
                      id="venue_capacity"
                      type="number"
                      className={styles.input}
                      value={form.venue_capacity ?? ''}
                      onChange={(event) => updateField('venue_capacity', event.target.value ? parseInt(event.target.value, 10) : null)}
                      placeholder="5000"
                    />
                  </div>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label htmlFor="venue_address" className={styles.label}>Venue Address</label>
                    <input
                      id="venue_address"
                      type="text"
                      className={styles.input}
                      value={form.venue_address || ''}
                      onChange={(event) => updateField('venue_address', event.target.value)}
                      placeholder="Direccion del estadio o sede..."
                    />
                  </div>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label htmlFor="venue_notes" className={styles.label}>Venue Notes</label>
                    <textarea
                      id="venue_notes"
                      rows={3}
                      className={styles.textarea}
                      value={form.venue_notes || ''}
                      onChange={(event) => updateField('venue_notes', event.target.value)}
                      placeholder="Parking, acceso, superficie, detalles operativos..."
                    />
                  </div>
                </div>
              </section>

              <section
                id="links"
                ref={(node) => { sectionRefs.current.links = node; }}
                className={`${styles.sectionCard} ${activeSection === 'links' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>06 SOCIAL_CONNECT</p>
                    <h2 className={styles.sectionTitle}>Social Connect</h2>
                  </div>
                  <small className={styles.sectionTag}>Presence</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.field}>
                    <label htmlFor="website" className={styles.label}>Website</label>
                    <input
                      id="website"
                      type="url"
                      className={styles.input}
                      value={form.website || ''}
                      onChange={(event) => updateField('website', event.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="instagram" className={styles.label}>Instagram</label>
                    <input
                      id="instagram"
                      type="text"
                      className={styles.input}
                      value={form.instagram || ''}
                      onChange={(event) => updateField('instagram', event.target.value)}
                      placeholder="@club"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="x_url" className={styles.label}>X / Twitter</label>
                    <input
                      id="x_url"
                      type="text"
                      className={styles.input}
                      value={form.x_url || ''}
                      onChange={(event) => updateField('x_url', event.target.value)}
                      placeholder="@club"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="youtube" className={styles.label}>YouTube</label>
                    <input
                      id="youtube"
                      type="text"
                      className={styles.input}
                      value={form.youtube || ''}
                      onChange={(event) => updateField('youtube', event.target.value)}
                      placeholder="youtube.com/@club"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="tiktok" className={styles.label}>TikTok</label>
                    <input
                      id="tiktok"
                      type="text"
                      className={styles.input}
                      value={form.tiktok || ''}
                      onChange={(event) => updateField('tiktok', event.target.value)}
                      placeholder="@club"
                    />
                  </div>
                </div>
              </section>

              <section
                id="status"
                ref={(node) => { sectionRefs.current.status = node; }}
                className={`${styles.sectionCard} ${activeSection === 'status' ? styles.sectionCardActive : ''}`}
              >
                <div className={styles.sectionTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>07 LIFECYCLE</p>
                    <h2 className={styles.sectionTitle}>Lifecycle</h2>
                  </div>
                  <small className={styles.sectionTag}>Visibility</small>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.field}>
                    <label htmlFor="visibility" className={styles.label}>Visibility</label>
                    <select
                      id="visibility"
                      className={styles.select}
                      value={form.visibility}
                      onChange={(event) => updateField('visibility', event.target.value as FormState['visibility'])}
                    >
                      <option value="visible">Public / Visible</option>
                      <option value="hidden">Internal / Hidden</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="lifecycle" className={styles.label}>Current Stage</label>
                    <select
                      id="lifecycle"
                      className={styles.select}
                      value={form.lifecycle}
                      onChange={(event) => updateField('lifecycle', event.target.value as FormState['lifecycle'])}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label htmlFor="notes_internal" className={styles.label}>Internal Notes</label>
                    <textarea
                      id="notes_internal"
                      rows={3}
                      className={styles.textarea}
                      value={form.notes_internal || ''}
                      onChange={(event) => updateField('notes_internal', event.target.value)}
                      placeholder="Notas privadas para superadmins..."
                    />
                  </div>
                </div>
              </section>

              <div className={styles.actionsBar}>
                <button type="button" className={styles.btnGhost} onClick={handleDiscard}>
                  Discard Changes
                </button>
                <div className={styles.actionsRight}>
                  <span className={styles.saveStatus}>{systemStatus}</span>
                  <button type="submit" className={styles.btnPrimary} disabled={saving || !isDirty}>
                    {saving ? 'Uploading...' : 'Deploy Club'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
