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
import { invalidateCache } from '@/lib/cache/superAdminCache';
import {
  CLUB_DERIVATIVE_LABELS,
  type ClubDerivativeType,
  getClubSportValue,
  getSportDisplayName,
} from '@/lib/clubDerivatives';

const activeSports = getActiveSports();

const ENTITY_TYPES = [
  { value: 'club', label: 'Club', icon: '🏟️' },
  { value: 'seleccion', label: 'Selección', icon: '🏆' },
  { value: 'academia', label: 'Academia', icon: '🎓' },
  { value: 'franquicia', label: 'Franquicia', icon: '🏢' },
];

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

function sortUnionOptions(list: UnionOption[]) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
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

export default function NewClubForm({ unions = [], derivedPrefill = null }: NewClubFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    name: '',
    short_name: '',
    slug: '',
    slugManuallyEdited: false,
    entity_type: 'club',
    logo_url: null,
    primary_color: '#00a365',

    sport: 'rugby',
    gender: 'Masculino',
    age_grade: '',

    country: 'Argentina',
    region: '',
    city: '',
    address: '',
    lat: null as number | null,
    lng: null as number | null,

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
    venue_capacity: null as number | null,
    venue_notes: '',

    website: '',
    instagram: '',
    x_url: '',
    youtube: '',
    tiktok: '',

    visibility: 'visible',
    lifecycle: 'draft',
    notes_internal: ''
  });

  const [initialForm, setInitialForm] = useState(form);
  const [saving, setSaving] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdClubId, setCreatedClubId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const derivedPrefillAppliedRef = useRef(false);
  const [availableUnions, setAvailableUnions] = useState<UnionOption[]>(() => sortUnionOptions(unions));

  // Estado para autocomplete de unión
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

  // Estado para URL de logo
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [useUrlForLogo, setUseUrlForLogo] = useState(false);

  // Dirty tracking
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  // Auto-generate slug from name
  useEffect(() => {
    if (!form.slugManuallyEdited && form.name) {
      setForm(prev => ({ ...prev, slug: normalizeSlug(form.name) }));
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
    const noteTokens = [
      `Derivado de ${derivedPrefill.baseClub.name}`,
      relationLabel,
      sportLabel || null,
    ].filter(Boolean);

    const nextForm: FormState = {
      ...form,
      name: derivedPrefill.baseClub.name || form.name,
      short_name: derivedPrefill.baseClub.short_name || '',
      slug: normalizeSlug(derivedPrefill.baseClub.name || form.name),
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
    setInitialForm(nextForm);

    const selectedUnion = unions.find((union) => union.id === derivedPrefill.baseClub.union_id);
    if (selectedUnion) {
      setUnionSearch(selectedUnion.name);
    }

    derivedPrefillAppliedRef.current = true;
  }, [derivedPrefill, form, unions]);

  // Sincronizar nombre de unión cuando se selecciona un ID
  useEffect(() => {
    if (form.union_id && !unionSearch) {
      const selectedUnion = availableUnions.find(u => u.id === form.union_id);
      if (selectedUnion) {
        setUnionSearch(selectedUnion.name);
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
        || (union.country && union.country.toLowerCase().includes(query))
      )
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

  // Navigation blocker
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Scroll logic for header
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Kinetic background interaction
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (wrapperRef.current) {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      wrapperRef.current.style.backgroundPosition = `${x * 10}px ${y * 10}px`;
    }
  };

  const updateField = useCallback(<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSlugChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      slug: value.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, ''),
      slugManuallyEdited: true,
    }));
  };

  const handleRegenerateSlug = () => {
    setForm(prev => ({
      ...prev,
      slug: normalizeSlug(form.name),
      slugManuallyEdited: false,
    }));
  };

  // Handler para búsqueda de unión con autocomplete
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

  const updateUnionCreateField = useCallback(<K extends keyof InlineUnionFormState>(
    field: K,
    value: InlineUnionFormState[K]
  ) => {
    setUnionCreateForm((prev) => ({ ...prev, [field]: value }));
  }, []);

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

  // Handler para logo URL
  const handleLogoUrlSubmit = () => {
    if (logoUrlInput.trim()) {
      updateField('logo_url', logoUrlInput.trim());
      setLogoUrlInput('');
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();

    // Validaciones basicas frontend
    if (!form.name || form.name.length < 2) {
      alert('Error: El nombre debe tener mínimo 2 caracteres.');
      return;
    }
    if (!form.slug || !/^[a-z0-9-]+$/.test(form.slug)) {
      alert('Error: Slug vacío o con formato inválido (solo a-z, 0-9 y guiones).');
      return;
    }
    if (!form.country) {
      alert('Error: Especifique un país.');
      return;
    }
    if (form.source === 'api' && !form.external_id) {
      alert('Error: External ID es requerido cuando la fuente es API.');
      return;
    }

    // Warnings interactivas
    const warnings = [];
    if (!form.logo_url) warnings.push('El club no tiene logo.');
    if (!form.union_id) warnings.push('El club no tiene Unión/Liga asociada.');
    if (!form.city) warnings.push('No especificaste la ciudad.');
    if (form.source === 'api' && (!form.aliases_text || form.aliases_text.length === 0)) warnings.push('No se añadieron aliases, esto dificulta el mapping con la API externa.');

    if (warnings.length > 0) {
      const confirmed = window.confirm(
        'Advertencias:\n' +
        warnings.map(w => `- ${w}`).join('\n') +
        '\n\n¿Continuar de todas formas?'
      );
      if (!confirmed) return;
    }

    // Preparar payload
    const payload: ClubCreateInput & { aliases?: string[] } = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      entity_type: form.entity_type as any,
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
      source: form.source as any,
      external_id: form.external_id || null,
      aliases: form.aliases_text.split(',').map(s => s.trim()).filter(Boolean),
      venue_name: form.venue_name || null,
      venue_address: form.venue_address || null,
      venue_capacity: form.venue_capacity,
      venue_notes: form.venue_notes || null,
      website: form.website || null,
      instagram: form.instagram || null,
      x_url: form.x_url || null,
      youtube: form.youtube || null,
      tiktok: form.tiktok || null,
      visibility: form.visibility as any,
      lifecycle: form.lifecycle as any,
      notes_internal: form.notes_internal || null,
      categories: buildManualVariantCategories(form, Boolean(derivedPrefill), derivedPrefill?.baseClub.id),
    };

    setSaving(true);
    try {
      const result = await createClub(payload);
      if (!result.success) {
        alert('Error: ' + result.error);
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

      // Success
      invalidateCache('clubs_list');
      setCreatedClubId(createdId);
      setShowSuccessModal(true);
    } catch (err) {
      alert('Error inesperado: ' + (err instanceof Error ? err.message : 'Desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowExitModal(false);
  };

  const confirmExitModal = () => {
    router.back();
  };

  const handleCreateAnotherClub = () => {
    window.location.assign('/admin/entities/new?type=club');
  };

  return (
    <div className={styles.formWrapper} ref={wrapperRef} onMouseMove={handleMouseMove}>

      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{derivedPrefill ? 'Nuevo Club Derivado' : 'Nuevo Club'}</h1>
          <div className={`${styles.dirtyIndicator} ${isDirty ? styles.dirtyIndicatorVisible : ''}`}>
            <div className={styles.pulseDot}></div>
            <span>Cambios sin guardar</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.btnAction} ${styles.btnSave} ${isDirty ? styles.btnSaveActive : ''}`}
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? 'Guardando...' : 'Guardar Club'}
          </button>
        </div>
      </header>

      {/* Modal Éxito */}
      {showSuccessModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalHeader}>¡Club creado exitosamente!</h2>
            <p className={styles.modalText}>¿Qué querés hacer ahora?</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancelModal} onClick={handleCreateAnotherClub}>
                Crear otro club
              </button>
              <button className={styles.btnConfirmModal} onClick={() => router.push(`/admin/entities/${createdClubId}/manage?type=club`)}>
                Ir al panel del club
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Interceptor */}
      {showExitModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalHeader}>¡Atención!</h2>
            <p className={styles.modalText}>Tenés cambios sin guardar. ¿Deseás descartarlos y salir?</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancelModal} onClick={closeModal}>Seguir editando</button>
              <button className={styles.btnConfirmModal} onClick={confirmExitModal}>Descartar</button>
            </div>
          </div>
        </div>
      )}

      {derivedPrefill && (
        <section className={styles.module} style={{ marginBottom: '1.5rem' }}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>00</span>
            <h2 className={styles.moduleTitle}>Contexto del Derivado</h2>
            <span className={styles.requiredBadge}>{CLUB_DERIVATIVE_LABELS[derivedPrefill.derivativeType]}</span>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <p className={styles.helper} style={{ margin: 0 }}>
              Base: <strong>{derivedPrefill.baseClub.name}</strong>
              {derivedPrefill.derivativeType === 'other_sport' && form.sport
                ? ` · deporte objetivo: ${getSportDisplayName(form.sport)}`
                : ''}
            </p>
            <p className={styles.helper} style={{ margin: 0 }}>
              El formulario arranca con nombre, union, ubicacion y branding del club base. Ajusta nombre y slug para marcar la rama que vas a crear.
            </p>
          </div>
        </section>
      )}

      <form className={styles.container} autoComplete="off">

        {/* CARD 1: IDENTIDAD */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>01</span>
            <h2 className={styles.moduleTitle}>Identidad del Club</h2>
            <span className={styles.requiredBadge}>OBLIGATORIO</span>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Nombre del Club</label>
              <input type="text" className={styles.input} value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ej: Jockey Club Córdoba" required minLength={2} />
              <span className={styles.helper}>Nombre oficial completo.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Nombre Corto (Opcional)</label>
              <input type="text" className={styles.input} value={form.short_name || ''} onChange={(e) => updateField('short_name', e.target.value)} placeholder="Ej: Jockey CC" />
              <span className={styles.helper}>Para tablas compactas.</span>
            </div>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Slug (URL)</label>
              <div className={styles.slugContainer}>
                <input type="text" className={`${styles.input} ${styles.slugInput}`} value={form.slug} onChange={(e) => handleSlugChange(e.target.value)} placeholder="jockey-club-cordoba" required pattern="[a-z0-9-]+" />
                <button type="button" className={`${styles.btnAction} ${styles.btnRegen}`} onClick={handleRegenerateSlug}>Regenerar</button>
              </div>
              <span className={styles.helper}>Solo minúsculas, números y guiones.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Tipo de Entidad</label>
              <select className={styles.select} required value={form.entity_type} onChange={(e) => updateField('entity_type', e.target.value as any)}>
                {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Logo del Club</label>

            {/* Tabs para elegir método */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => setUseUrlForLogo(false)}
                className={styles.tabBtn}
                style={{
                  background: !useUrlForLogo ? 'var(--copper-primary)' : 'transparent',
                  color: !useUrlForLogo ? 'black' : 'var(--text-dim)',
                  border: !useUrlForLogo ? 'none' : '1px solid var(--wireframe)',
                  padding: '0.5rem 1rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
              >
                📁 SUBIR ARCHIVO
              </button>
              <button
                type="button"
                onClick={() => setUseUrlForLogo(true)}
                className={styles.tabBtn}
                style={{
                  background: useUrlForLogo ? 'var(--copper-primary)' : 'transparent',
                  color: useUrlForLogo ? 'black' : 'var(--text-dim)',
                  border: useUrlForLogo ? 'none' : '1px solid var(--wireframe)',
                  padding: '0.5rem 1rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
              >
                🔗 USAR URL
              </button>
            </div>

            {/* Preview del logo si existe */}
            {form.logo_url && (
              <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                <img src={form.logo_url} className={styles.logoPreview} alt="Logo preview" style={{ display: 'block', margin: '0 auto' }} />
                <button type="button" onClick={() => updateField('logo_url', null)} className={styles.logoRemoveBtn} style={{ marginTop: '0.5rem' }}>QUITAR</button>
              </div>
            )}

            {/* Uploader o URL input según tab seleccionada */}
            {!useUrlForLogo ? (
              <div className={styles.logoZone}>
                <div className={styles.logoPlaceholder}>
                  <LogoUploader onUpload={(url) => updateField('logo_url', url)} accentColor="#00a365" />
                  <p style={{ fontSize: '0.6rem', marginTop: '5px', color: 'var(--text-dim)' }}>PNG 256x256 (Recomendado)</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="url"
                  className={styles.input}
                  value={logoUrlInput}
                  onChange={(e) => setLogoUrlInput(e.target.value)}
                  placeholder="https://ejemplo.com/logo.png"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLogoUrlSubmit();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleLogoUrlSubmit}
                  className={`${styles.btnAction} ${styles.btnRegen}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>

          {/* Selector de Color Predominante */}
          <div className={styles.field}>
            <label className={styles.label}>Color Predominante del Club</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input
                type="color"
                value={form.primary_color || '#00a365'}
                onChange={(e) => updateField('primary_color', e.target.value)}
                style={{
                  width: '80px',
                  height: '40px',
                  border: '1px solid var(--wireframe)',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
              />
              <input
                type="text"
                className={styles.input}
                value={form.primary_color || '#00a365'}
                onChange={(e) => updateField('primary_color', e.target.value)}
                placeholder="#00a365"
                pattern="^#[0-9A-Fa-f]{6}$"
                style={{ flex: 1, fontFamily: 'monospace' }}
              />
            </div>
            <span className={styles.helper}>Se usa para el branding del club en la plataforma.</span>
          </div>
        </section>

        {/* CARD 2: CLASIFICACIÓN */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>02</span>
            <h2 className={styles.moduleTitle}>Clasificación Deportiva</h2>
            <span className={styles.requiredBadge}>OBLIGATORIO</span>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Deporte Principal</label>
              <select className={styles.select} required value={form.sport} onChange={(e) => updateField('sport', e.target.value)}>
                {activeSports.map(sport => <option key={sport.id} value={sport.id}>{sport.nameEs}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Categoría / Nivel</label>
              <input type="text" className={styles.input} placeholder="Ej: Primera, Juvenil..." />
            </div>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Género</label>
              <select className={styles.select} value={form.gender || ''} onChange={(e) => updateField('gender', e.target.value)}>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Mixto">Mixto</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Age Grade</label>
              <input type="text" className={styles.input} placeholder="Ej: Plantel Superior, M19..." value={form.age_grade || ''} onChange={(e) => updateField('age_grade', e.target.value)} />
            </div>
          </div>
        </section>

        {/* CARD 3: UBICACIÓN */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>03</span>
            <h2 className={styles.moduleTitle}>Ubicación</h2>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>País</label>
              <select className={styles.select} required value={form.country} onChange={(e) => updateField('country', e.target.value)}>
                {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Provincia / Región</label>
              <input type="text" className={styles.input} placeholder="Ej: Córdoba" value={form.region || ''} onChange={(e) => updateField('region', e.target.value)} />
            </div>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Ciudad</label>
              <input type="text" className={styles.input} value={form.city || ''} onChange={(e) => updateField('city', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Dirección</label>
              <input type="text" className={styles.input} value={form.address || ''} onChange={(e) => updateField('address', e.target.value)} />
            </div>
          </div>
          <div className={styles.gridRow2}>
            <div className={styles.field}>
              <label className={styles.label}>Latitud</label>
              <input type="number" step="any" className={styles.input} placeholder="0.0000" value={form.lat || ''} onChange={(e) => updateField('lat', e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Longitud</label>
              <input type="number" step="any" className={styles.input} placeholder="0.0000" value={form.lng || ''} onChange={(e) => updateField('lng', e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
          </div>
        </section>

        {/* CARD 4: ORGANIZACIÓN */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>04</span>
            <h2 className={styles.moduleTitle}>Unión / Liga</h2>
          </div>
          <div className={styles.field} style={{ marginBottom: '1.5rem', position: 'relative' }}>
            <label className={styles.label}>Unión Principal</label>
            <input
              type="text"
              className={styles.input}
              value={unionSearch}
              onChange={(e) => handleUnionSearchChange(e.target.value)}
              onFocus={() => setShowUnionSuggestions(true)}
              onBlur={() => setTimeout(() => setShowUnionSuggestions(false), 200)}
              placeholder="Escribí para buscar unión..."
            />

            {/* Dropdown de sugerencias */}
            {showUnionSuggestions && filteredUnions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'var(--bg-card)',
                border: '1px solid var(--copper-primary)',
                borderRadius: '4px',
                marginTop: '4px',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0, 163, 101, 0.2)'
              }}>
                {filteredUnions.map(u => (
                  <div
                    key={u.id}
                    onMouseDown={() => handleSelectUnion(u.id, u.name)}
                    style={{
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--wireframe)',
                      transition: 'var(--transition)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 163, 101, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{u.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      {u.country || 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {form.union_id && (
              <span className={styles.helper}>
                ✓ Unión seleccionada: <strong>{availableUnions.find((union) => union.id === form.union_id)?.name}</strong>
              </span>
            )}
            <div className={styles.unionHelperRow}>
              <span className={styles.helper}>Si no existe en el catalogo, podes crear la union desde aca.</span>
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

                <div className={styles.gridRow2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Nombre</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={unionCreateForm.name}
                      onChange={(e) => updateUnionCreateField('name', e.target.value)}
                      placeholder="Ej: Union de Rugby de Salta"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Slug</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={unionCreateForm.slug}
                      onChange={(e) => handleUnionCreateSlugChange(e.target.value)}
                      placeholder="union-rugby-salta"
                    />
                  </div>
                </div>

                <div className={styles.gridRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Pais</label>
                    <select
                      className={styles.select}
                      value={unionCreateForm.country}
                      onChange={(e) => updateUnionCreateField('country', e.target.value)}
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
                      onChange={(e) => updateUnionCreateField('sport', e.target.value)}
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
                      onChange={(e) => updateUnionCreateField('union_level', e.target.value)}
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
                  <button
                    type="button"
                    className={styles.btnCancelModal}
                    onClick={handleToggleUnionCreator}
                    disabled={creatingUnion}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={styles.btnConfirmModal}
                    onClick={handleCreateUnion}
                    disabled={creatingUnion}
                  >
                    {creatingUnion ? 'Creando...' : 'Crear y seleccionar'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contacto Administrativo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
              <input type="text" className={styles.input} placeholder="Nombre" value={form.admin_contact_name || ''} onChange={(e) => updateField('admin_contact_name', e.target.value)} />
              <input type="email" className={styles.input} placeholder="Email" value={form.admin_contact_email || ''} onChange={(e) => updateField('admin_contact_email', e.target.value)} />
            </div>
          </div>
        </section>

        {/* CARD 5: FUENTE & INTEGRACIONES */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>05</span>
            <h2 className={styles.moduleTitle}>Fuente de Datos</h2>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Origen</label>
              <select className={styles.select} value={form.source} onChange={(e) => updateField('source', e.target.value as any)}>
                <option value="manual">Carga Manual</option>
                <option value="api">Sincronización API</option>
                <option value="import">Importación CSV/XLS</option>
              </select>
            </div>
            <div className={styles.field} style={{ opacity: form.source === 'api' ? 1 : 0.3, pointerEvents: form.source === 'api' ? 'all' : 'none' }}>
              <label className={styles.label}>External ID</label>
              <input type="text" className={styles.input} placeholder="UUID de la API" value={form.external_id || ''} onChange={(e) => updateField('external_id', e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Aliases / Nombres Alternativos</label>
            <input type="text" className={styles.input} placeholder="Separados por coma..." value={form.aliases_text} onChange={(e) => updateField('aliases_text', e.target.value)} />
            <span className={styles.helper}>Crucial para matching inteligente con fuentes externas.</span>
          </div>
        </section>

        {/* CARD 6: VENUE */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>06</span>
            <h2 className={styles.moduleTitle}>Cancha / Venue</h2>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Nombre del Estadio</label>
              <input type="text" className={styles.input} value={form.venue_name || ''} onChange={(e) => updateField('venue_name', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Capacidad</label>
              <input type="number" className={styles.input} placeholder="0" value={form.venue_capacity || ''} onChange={(e) => updateField('venue_capacity', e.target.value ? parseInt(e.target.value) : null)} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notas de Infraestructura</label>
            <textarea rows={2} className={styles.textarea} value={form.venue_notes || ''} onChange={(e) => updateField('venue_notes', e.target.value)}></textarea>
          </div>
        </section>

        {/* CARD 7: LINKS */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>07</span>
            <h2 className={styles.moduleTitle}>Links & Redes</h2>
          </div>
          <div className={styles.gridRow}>
            <div className={styles.field}>
              <label className={styles.label}>Website</label>
              <input type="url" className={styles.input} placeholder="https://..." value={form.website || ''} onChange={(e) => updateField('website', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Instagram</label>
              <input type="text" className={styles.input} placeholder="@usuario" value={form.instagram || ''} onChange={(e) => updateField('instagram', e.target.value)} />
            </div>
          </div>
        </section>

        {/* CARD 8: ESTADO */}
        <section className={styles.module}>
          <div className={styles.moduleHeader}>
            <span className={styles.moduleNum}>08</span>
            <h2 className={styles.moduleTitle}>Visibilidad</h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className={styles.field}>
              <label className={styles.label}>Estado de Visibilidad</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem' }}>Oculto</span>
                <label className={styles.switch}>
                  <input type="checkbox" checked={form.visibility === 'visible'} onChange={(e) => updateField('visibility', e.target.checked ? 'visible' : 'hidden')} />
                  <span className={styles.slider}></span>
                </label>
                <span style={{ fontSize: '0.8rem' }}>Público</span>
              </div>
            </div>
            <div className={styles.field} style={{ width: '200px' }}>
              <label className={styles.label}>Ciclo de Vida</label>
              <select className={styles.select} value={form.lifecycle} onChange={(e) => updateField('lifecycle', e.target.value as any)}>
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
          </div>
        </section>

        {/* BOTÓN GUARDAR AL FINAL */}
        <section style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2rem 0',
          marginTop: '1rem'
        }}>
          <button
            className={`${styles.btnAction} ${styles.btnSave} ${isDirty ? styles.btnSaveActive : ''}`}
            onClick={handleSave}
            disabled={!isDirty || saving}
            style={{
              fontSize: '1rem',
              padding: '1rem 3rem',
              clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0% 100%)'
            }}
          >
            {saving ? 'GUARDANDO...' : 'GUARDAR CLUB'}
          </button>
        </section>

      </form>
    </div>
  );
}
