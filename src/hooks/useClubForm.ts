// ============================================================
// USE CLUB FORM HOOK
// ============================================================
// Hook para manejar formularios de clubs con dirty tracking
// por sección (core, profile, aliases, secondary_unions).
//
// Uso:
//   const { core, profile, updateCore, updateProfile, save, isDirty } = useClubForm(clubId);
//
// Ventajas:
//   - Solo se envían campos modificados (PATCH)
//   - Cada card/sección maneja su propio estado
//   - Normalización automática
//   - Validación antes de guardar
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { ClubCore, ClubProfile, ClubFull, ClubUpdateInput } from '@/lib/types/clubs';
import { buildPatch, buildArrayPatch, isPatchEmpty, isArrayPatchEmpty } from '@/lib/utils/buildPatch';
import {
  normalizeText,
  normalizeUrl,
  normalizeSlug,
  normalizeEmail,
  normalizeNumber,
} from '@/lib/utils/normalize';
import { updateClub, fetchClubFull } from '@/lib/services/clubService';
import { validateClubCoreUpdate, validateClubProfileUpdate } from '@/lib/validation/clubValidation';
import { invalidateCache } from '@/lib/cache/superAdminCache';

// ============================================================
// TYPES
// ============================================================

interface UseClubFormOptions {
  clubId: string;
  initialData?: ClubFull;
  onSaveSuccess?: (club: ClubFull) => void;
  onSaveError?: (error: string) => void;
}

interface UseClubFormReturn {
  // Estado actual
  core: Partial<ClubCore>;
  profile: Partial<ClubProfile>;
  aliases: string[];
  secondaryUnions: string[];

  // Estado inicial (para comparación)
  initialCore: Partial<ClubCore>;
  initialProfile: Partial<ClubProfile>;
  initialAliases: string[];
  initialSecondaryUnions: string[];

  // Loading/error
  loading: boolean;
  saving: boolean;
  error: string | null;

  // Dirty tracking
  isDirty: boolean;
  isCoreDirty: boolean;
  isProfileDirty: boolean;
  areAliasesDirty: boolean;
  areSecondaryUnionsDirty: boolean;

  // Métodos de actualización
  updateCore: (updates: Partial<ClubCore>) => void;
  updateProfile: (updates: Partial<ClubProfile>) => void;
  setAliases: (aliases: string[]) => void;
  setSecondaryUnions: (unions: string[]) => void;

  // Guardar
  save: () => Promise<boolean>;

  // Reset
  reset: () => void;
}

// ============================================================
// HOOK
// ============================================================

export function useClubForm(options: UseClubFormOptions): UseClubFormReturn {
  const { clubId, initialData, onSaveSuccess, onSaveError } = options;
  const hasInitialData = Boolean(initialData?.core?.id);

  // Estado inicial (del servidor)
  const [initialCore, setInitialCore] = useState<Partial<ClubCore>>(initialData?.core ?? {});
  const [initialProfile, setInitialProfile] = useState<Partial<ClubProfile>>(initialData?.profile ?? {});
  const [initialAliases, setInitialAliases] = useState<string[]>(initialData?.aliases ?? []);
  const [initialSecondaryUnions, setInitialSecondaryUnions] = useState<string[]>(initialData?.secondary_unions ?? []);

  // Estado actual (editable)
  const [core, setCore] = useState<Partial<ClubCore>>(initialData?.core ?? {});
  const [profile, setProfile] = useState<Partial<ClubProfile>>(initialData?.profile ?? {});
  const [aliases, setAliases] = useState<string[]>(initialData?.aliases ?? []);
  const [secondaryUnions, setSecondaryUnions] = useState<string[]>(initialData?.secondary_unions ?? []);

  // Loading/error
  const [loading, setLoading] = useState(!hasInitialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // FETCH INITIAL DATA
  // ============================================================

  const isAbortError = (e: unknown) =>
    e instanceof Error && (e.name === 'AbortError' || e.message.toLowerCase().includes('aborted'));

  useEffect(() => {
    if (hasInitialData) return;

    async function loadClub() {
      setLoading(true);
      setError(null);

      try {
        const clubFull = await fetchClubFull(clubId);

        if (!clubFull) {
          setError('Club no encontrado');
          setLoading(false);
          return;
        }

        // Guardar estado inicial
        setInitialCore(clubFull.core);
        setInitialProfile(clubFull.profile ?? {});
        setInitialAliases(clubFull.aliases);
        setInitialSecondaryUnions(clubFull.secondary_unions);

        // Inicializar estado actual
        setCore(clubFull.core);
        setProfile(clubFull.profile ?? {});
        setAliases(clubFull.aliases);
        setSecondaryUnions(clubFull.secondary_unions);

        setLoading(false);
      } catch (err) {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : 'Error al cargar club');
        setLoading(false);
      }
    }

    loadClub();
  }, [clubId, hasInitialData]);

  // ============================================================
  // UPDATE METHODS
  // ============================================================

  const updateCore = useCallback((updates: Partial<ClubCore>) => {
    setCore((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateProfile = useCallback((updates: Partial<ClubProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  // ============================================================
  // DIRTY TRACKING
  // ============================================================

  // Normalizers para buildPatch
  const coreNormalizers = {
    name: normalizeText,
    short_name: normalizeText,
    slug: normalizeSlug,
    city: normalizeText,
    region: normalizeText,
    country: normalizeText,
    address: normalizeText,
    lat: normalizeNumber,
    lng: normalizeNumber,
    union_id: normalizeText,
    logo_url: normalizeUrl,
    primary_color: normalizeText,
    external_id: normalizeText,
    notes_internal: normalizeText,
  };

  const profileNormalizers = {
    admin_contact_name: normalizeText,
    admin_contact_email: normalizeEmail,
    admin_contact_phone: normalizeText,
    website: normalizeUrl,
    instagram: normalizeUrl,
    x_url: normalizeUrl,
    youtube: normalizeUrl,
    tiktok: normalizeUrl,
    venue_name: normalizeText,
    venue_address: normalizeText,
    venue_capacity: normalizeNumber,
    venue_notes: normalizeText,
  };

  const corePatch = buildPatch(initialCore, core, coreNormalizers);
  const profilePatch = buildPatch(initialProfile, profile, profileNormalizers);
  const aliasesPatch = buildArrayPatch(initialAliases, aliases);
  const unionsPatch = buildArrayPatch(initialSecondaryUnions, secondaryUnions);

  const isCoreDirty = !isPatchEmpty(corePatch);
  const isProfileDirty = !isPatchEmpty(profilePatch);
  const areAliasesDirty = !isArrayPatchEmpty(aliasesPatch);
  const areSecondaryUnionsDirty = !isArrayPatchEmpty(unionsPatch);

  const isDirty = isCoreDirty || isProfileDirty || areAliasesDirty || areSecondaryUnionsDirty;

  // ============================================================
  // SAVE
  // ============================================================

  const save = useCallback(async (): Promise<boolean> => {
    // 1. Validar antes de enviar
    if (isCoreDirty) {
      const coreValidation = validateClubCoreUpdate(corePatch);
      if (!coreValidation.valid) {
        const errorMsg = coreValidation.errors.map((e) => e.message).join(', ');
        setError(errorMsg);
        onSaveError?.(errorMsg);
        return false;
      }
    }

    if (isProfileDirty) {
      const profileValidation = validateClubProfileUpdate(profilePatch);
      if (!profileValidation.valid) {
        const errorMsg = profileValidation.errors.map((e) => e.message).join(', ');
        setError(errorMsg);
        onSaveError?.(errorMsg);
        return false;
      }
    }

    // 2. Construir payload de update
    const updatePayload: ClubUpdateInput = {};

    if (isCoreDirty) {
      updatePayload.core = corePatch;
    }

    if (isProfileDirty) {
      updatePayload.profile = profilePatch;
    }

    if (areAliasesDirty) {
      updatePayload.aliases = aliasesPatch;
    }

    if (areSecondaryUnionsDirty) {
      updatePayload.secondary_unions = unionsPatch;
    }

    // 3. Guardar
    setSaving(true);
    setError(null);

    try {
      const result = await updateClub(clubId, updatePayload);

      if (!result.success) {
        setError(result.error ?? 'Error al guardar');
        onSaveError?.(result.error ?? 'Error al guardar');
        setSaving(false);
        return false;
      }

      // 4. Actualizar estado inicial con nuevos valores
      if (result.club) {
        setInitialCore(result.club.core);
        setInitialProfile(result.club.profile ?? {});
        setInitialAliases(result.club.aliases);
        setInitialSecondaryUnions(result.club.secondary_unions);

        setCore(result.club.core);
        setProfile(result.club.profile ?? {});
        setAliases(result.club.aliases);
        setSecondaryUnions(result.club.secondary_unions);
        invalidateCache('clubs_list');

        onSaveSuccess?.(result.club);
      }

      setSaving(false);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMsg);
      onSaveError?.(errorMsg);
      setSaving(false);
      return false;
    }
  }, [
    clubId,
    corePatch,
    profilePatch,
    aliasesPatch,
    unionsPatch,
    isCoreDirty,
    isProfileDirty,
    areAliasesDirty,
    areSecondaryUnionsDirty,
    onSaveSuccess,
    onSaveError,
  ]);

  // ============================================================
  // RESET
  // ============================================================

  const reset = useCallback(() => {
    setCore(initialCore);
    setProfile(initialProfile);
    setAliases(initialAliases);
    setSecondaryUnions(initialSecondaryUnions);
    setError(null);
  }, [initialCore, initialProfile, initialAliases, initialSecondaryUnions]);

  // ============================================================
  // RETURN
  // ============================================================

  return {
    // Estado actual
    core,
    profile,
    aliases,
    secondaryUnions,

    // Estado inicial
    initialCore,
    initialProfile,
    initialAliases,
    initialSecondaryUnions,

    // Loading/error
    loading,
    saving,
    error,

    // Dirty tracking
    isDirty,
    isCoreDirty,
    isProfileDirty,
    areAliasesDirty,
    areSecondaryUnionsDirty,

    // Métodos
    updateCore,
    updateProfile,
    setAliases,
    setSecondaryUnions,

    // Save/reset
    save,
    reset,
  };
}
