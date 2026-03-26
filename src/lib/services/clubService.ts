'use server';

// ============================================================
// CLUB SERVICE - Database Operations
// ============================================================
// Funciones para crear, actualizar y sincronizar clubes en Supabase.
// Implementa el patrón profesional:
//   - Create: insert mínimo
//   - Update: PATCH parcial (dirty fields)
//   - Sync arrays: diff add/remove
// ============================================================

import { createClient as createServerClient } from '@/lib/supabase/server';
import type {
  ClubCreateInput,
  ClubUpdateInput,
  ClubCore,
  ClubFull,
  ClubProfile,
  ClubCreateResponse,
  ClubUpdateResponse,
} from '../types/clubs';
import type { ClubDerivativeType } from '@/lib/clubDerivatives';
import {
  normalizeText,
  normalizeSlug,
  normalizeUrl,
  normalizeEmail,
  normalizeNumber,
  normalizeInstagram,
  normalizeX,
  normalizeYouTube,
  normalizeTikTok,
} from '../utils/normalize';
import { validateClubCreate, validateClubCoreUpdate, validateClubProfileUpdate } from '../validation/clubValidation';
import { isPatchEmpty } from '../utils/buildPatch';

type ClubDerivativeUpsertClient = {
  from(table: 'club_derivatives'): {
    upsert(
      values: {
        base_club_id: string;
        derived_club_id: string;
        derivative_type: ClubDerivativeType;
      },
      options: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
  };
};

// ============================================================
// CREATE CLUB
// ============================================================

/**
 * Crea un nuevo club (solo campos core esenciales)
 */
export async function createClub(
  input: ClubCreateInput,
  options?: { supabaseClient?: any }
): Promise<ClubCreateResponse> {
  // 1. Validar input
  const validation = validateClubCreate(input);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Errores de validación',
      validationErrors: validation.errors,
    };
  }

  // 2. Normalizar datos
  const normalizedData = {
    id: normalizeSlug(input.slug)!,
    name: normalizeText(input.name)!,
    short_name: normalizeText(input.short_name),
    slug: normalizeSlug(input.slug),
    sport: normalizeText(input.sport) ?? 'rugby',
    sport_id: normalizeText(input.sport) ?? 'rugby',
    country: normalizeText(input.country) ?? 'ARG',
    region: normalizeText(input.region),
    city: normalizeText(input.city),
    union_id: normalizeText(input.union_id),
    logo_url: normalizeUrl(input.logo_url),
    primary_color: normalizeText(input.primary_color),
    categories: Array.isArray(input.categories)
      ? input.categories.map(normalizeText).filter((category): category is string => Boolean(category))
      : null,
    is_visible: input.visibility !== 'hidden',
  };

  // 3. Insertar en Supabase
  try {
    const supabase = options?.supabaseClient ?? await createServerClient();

    if (normalizedData.union_id) {
      // Unifica uniones: Buscar primero si existe con nombre similar (case-insensitive)
      const { data: existingUnions } = await supabase
        .from('unions')
        .select('id')
        .ilike('name', normalizedData.union_id.trim())
        .limit(1);

      if (existingUnions && existingUnions.length > 0) {
        // En lugar de arrojar error, vinculamos con el existente
        normalizedData.union_id = existingUnions[0].id;
      } else {
        // Generamos un ID amigable si se crea por primera vez
        const newUnionId = normalizedData.union_id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        await supabase.from('unions').upsert([{
          id: newUnionId,
          name: normalizedData.union_id.trim()
        }], { onConflict: 'id', ignoreDuplicates: true });
        normalizedData.union_id = newUnionId;
      }
    }

    // Schema Healing: Intentar insertar con todo, reintentar sin columnas problemáticas si fallan
    let { data: club, error } = await supabase
      .from('clubs')
      .insert(normalizedData)
      .select('*')
      .single();

    // Si falla porque falta la columna 'is_visible' o 'sport' (o la caché está vieja), reintentamos sin ellas
    if (error && (
      error.message.includes('column "is_visible"') ||
      error.message.includes('column "sport"') ||
      error.message.includes('column "sport_id"') ||
      error.message.includes('column "categories"') ||
      (error.message.includes('categories') && error.message.includes('does not exist')) ||
      error.message.includes("'is_visible' column") ||
      error.message.includes("'sport' column") ||
      error.message.includes("'sport_id' column") ||
      error.message.includes("'categories' column") ||
      error.message.includes("schema cache")
    )) {
      console.warn('⚠️ Detectada discrepancia de esquema en "clubs", reintentando operación reducida...');
      const fallbackData: Partial<typeof normalizedData> = { ...normalizedData };
      const isSchemaCacheError = error.message.includes("schema cache");

      if (isSchemaCacheError || error.message.includes('column "sport"') || error.message.includes("'sport' column")) {
        delete fallbackData.sport;
      }

        if (isSchemaCacheError || error.message.includes('column "sport_id"') || error.message.includes("'sport_id' column")) {
          delete fallbackData.sport_id;
        }
        if (
          isSchemaCacheError ||
          error.message.includes('column "categories"') ||
          error.message.includes("'categories' column") ||
          (error.message.includes('categories') && error.message.includes('does not exist'))
        ) {
          delete fallbackData.categories;
        }
      
      // Si la columna 'is_visible' realmente no existe aún (esquema muy viejo) o falla la caché
      if (isSchemaCacheError || error.message.includes('column "is_visible"') || error.message.includes("'is_visible' column")) {
        delete fallbackData.is_visible;
      }

      const retry = await supabase
        .from('clubs')
        .insert(fallbackData)
        .select('*')
        .single();

      club = retry.data;
      error = retry.error;
    }

    if (error) {
      // Detectar error de slug duplicado
      if (error.code === '23505' && error.message.includes('slug')) {
        return {
          success: false,
          error: 'El slug ya existe. Elige uno diferente.',
          validationErrors: [
            {
              field: 'slug',
              message: 'Ya existe un club con este slug',
              level: 'error',
            },
          ],
        };
      }

      // Detectar error de external_id duplicado
      if (error.code === '23505' && error.message.includes('external_id')) {
        return {
          success: false,
          error: 'El external_id ya existe.',
          validationErrors: [
            {
              field: 'external_id',
              message: 'Ya existe un club con este external_id',
              level: 'error',
            },
          ],
        };
      }

      // Detectar error de Unión inexistente (FK violation)
      if (error.code === '23503' && error.message.includes('union_id')) {
        return {
          success: false,
          error: 'La Unión / Liga especificada no existe.',
          validationErrors: [
            {
              field: 'union_id',
              message: 'No se encontró la Unión / Liga con ese ID',
              level: 'error',
            },
          ],
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }

    
    // Insert Profile (Card 4, 6, 7)
    if (
      input.admin_contact_name || input.admin_contact_email || input.admin_contact_phone ||
      input.website || input.instagram || input.x_url || input.youtube || input.tiktok ||
      input.venue_name || input.venue_address || input.venue_capacity || input.venue_notes ||
      input.organization_role
    ) {
      await supabase.from('club_profile').insert({
        club_id: club.id,
        admin_contact_name: normalizeText(input.admin_contact_name),
        admin_contact_email: normalizeEmail(input.admin_contact_email),
        admin_contact_phone: normalizeText(input.admin_contact_phone),
        website: normalizeUrl(input.website),
        instagram: normalizeInstagram(input.instagram),
        x_url: normalizeX(input.x_url),
        youtube: normalizeYouTube(input.youtube),
        tiktok: normalizeTikTok(input.tiktok),
        venue_name: normalizeText(input.venue_name),
        venue_address: normalizeText(input.venue_address),
        venue_capacity: normalizeNumber(input.venue_capacity),
        venue_notes: normalizeText(input.venue_notes),
        // Wait, organization_role is not in the DB type ClubProfile. Let's omit it if it's absent, 
        // to prevent DB crashing.
      });
    }

    // Insert Aliases (Card 5)
    if (input.aliases && input.aliases.length > 0) {
      const aliasInserts = input.aliases.map(a => ({
        club_id: club.id,
        alias: normalizeText(a)
      })).filter(a => a.alias);
      
      if (aliasInserts.length > 0) {
        await supabase.from('club_aliases').insert(aliasInserts);
      }
    }

    // Insert Secondary Unions (Card 4)
    if (input.secondary_unions && input.secondary_unions.length > 0) {
      const suInserts = input.secondary_unions.map(uId => ({
        club_id: club.id,
        union_id: uId
      }));
      await supabase.from('club_secondary_unions').insert(suInserts);
    }

    return { success: true, club: club as ClubCore };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error desconocido',
    };
  }
}

// ============================================================
// UPDATE CLUB (PATCH)
// ============================================================

/**
 * Actualiza un club (PATCH parcial)
 * - core: campos de clubs table
 * - profile: campos de club_profile table (upsert)
 * - aliases: sync con diff
 * - secondary_unions: sync con diff
 */
export async function updateClub(
  clubId: string,
  input: ClubUpdateInput
): Promise<ClubUpdateResponse> {
  const supabase = await createServerClient();

  try {
    // 1. Update core (clubs table)
    if (input.core && !isPatchEmpty(input.core)) {
      // Validar core
      const validation = validateClubCoreUpdate(input.core);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Errores de validación en core',
          validationErrors: validation.errors,
        };
      }

      // Normalizar core
      const normalizedCore: Record<string, unknown> = {};
      if (input.core.name !== undefined) {
        normalizedCore.name = normalizeText(input.core.name);
      }
      if (input.core.short_name !== undefined) {
        normalizedCore.short_name = normalizeText(input.core.short_name);
      }
      if (input.core.slug !== undefined) {
        normalizedCore.slug = normalizeSlug(input.core.slug);
      }
      if (input.core.sport !== undefined) {
        normalizedCore.sport = normalizeText(input.core.sport);
        normalizedCore.sport_id = normalizeText(input.core.sport);
      }
      if (input.core.country !== undefined) {
        normalizedCore.country = normalizeText(input.core.country);
      }
      if (input.core.region !== undefined) {
        normalizedCore.region = normalizeText(input.core.region);
      }
      if (input.core.city !== undefined) {
        normalizedCore.city = normalizeText(input.core.city);
      }
      if (input.core.union_id !== undefined) {
        normalizedCore.union_id = normalizeText(input.core.union_id);
      }
      if (input.core.logo_url !== undefined) {
        normalizedCore.logo_url = normalizeUrl(input.core.logo_url);
      }
      if (input.core.primary_color !== undefined) {
        normalizedCore.primary_color = normalizeText(input.core.primary_color);
      }
      if (input.core.visibility !== undefined) {
        normalizedCore.is_visible = input.core.visibility === 'visible';
      }

      if (normalizedCore.union_id) {
        const unionStr = String(normalizedCore.union_id).trim();
        // Unifica uniones: Buscar primero si existe con nombre similar (case-insensitive)
        const { data: existingUnions } = await supabase
          .from('unions')
          .select('id')
          .ilike('name', unionStr)
          .limit(1);

        if (existingUnions && existingUnions.length > 0) {
          // Vinculamos con el existente
          normalizedCore.union_id = existingUnions[0].id;
        } else {
          // Generamos un ID amigable si se crea por primera vez
          const newUnionId = unionStr.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
          await supabase.from('unions').upsert([{
            id: newUnionId,
            name: unionStr
          }], { onConflict: 'id', ignoreDuplicates: true });
          normalizedCore.union_id = newUnionId;
        }
      }

      // Update clubs table with Schema Healing
      let { error: coreError } = await supabase
        .from('clubs')
        .update(normalizedCore)
        .eq('id', clubId);

      // Si falla porque falta la columna 'is_visible' (o la caché está vieja), reintentamos sin ella
      if (coreError && (
        coreError.message.includes('column "is_visible"') ||
        coreError.message.includes('column "sport_id"') ||
        coreError.message.includes("'is_visible' column") ||
        coreError.message.includes("'sport_id' column") ||
        coreError.message.includes("schema cache")
      )) {
        console.warn('⚠️ Detectada discrepancia de esquema en "clubs" durante UPDATE, reintentando...');
        const fallbackCore: Partial<typeof normalizedCore> = { ...normalizedCore };
        delete fallbackCore.is_visible;
        delete fallbackCore.sport_id;

        const retry = await supabase
          .from('clubs')
          .update(fallbackCore)
          .eq('id', clubId);

        coreError = retry.error;
      }

      if (coreError) {
        // Detectar error de slug duplicado
        if (coreError.code === '23505' && coreError.message.includes('slug')) {
          return {
            success: false,
            error: 'El slug ya existe',
            validationErrors: [
              {
                field: 'slug',
                message: 'Ya existe un club con este slug',
                level: 'error',
              },
            ],
          };
        }

        // Detectar error de Unión inexistente (FK violation)
        if (coreError.code === '23503' && coreError.message.includes('union_id')) {
          return {
            success: false,
            error: 'La Unión / Liga especificada no existe.',
            validationErrors: [
              {
                field: 'union_id',
                message: 'No se encontró la Unión / Liga con ese ID',
                level: 'error',
              },
            ],
          };
        }

        return {
          success: false,
          error: coreError.message,
        };
      }
    }

    // 2. Upsert profile (club_profile table)
    if (input.profile && !isPatchEmpty(input.profile)) {
      // Validar profile
      const validation = validateClubProfileUpdate(input.profile);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Errores de validación en profile',
          validationErrors: validation.errors,
        };
      }

      // Normalizar profile
      const normalizedProfile: Record<string, unknown> = {
        club_id: clubId,
      };

      if (input.profile.admin_contact_name !== undefined) {
        normalizedProfile.admin_contact_name = normalizeText(input.profile.admin_contact_name);
      }
      if (input.profile.admin_contact_email !== undefined) {
        normalizedProfile.admin_contact_email = normalizeEmail(input.profile.admin_contact_email);
      }
      if (input.profile.admin_contact_phone !== undefined) {
        normalizedProfile.admin_contact_phone = normalizeText(input.profile.admin_contact_phone);
      }
      if (input.profile.website !== undefined) {
        normalizedProfile.website = normalizeUrl(input.profile.website);
      }
      if (input.profile.instagram !== undefined) {
        normalizedProfile.instagram = normalizeInstagram(input.profile.instagram, { returnUrl: true });
      }
      if (input.profile.x_url !== undefined) {
        normalizedProfile.x_url = normalizeX(input.profile.x_url, { returnUrl: true });
      }
      if (input.profile.youtube !== undefined) {
        normalizedProfile.youtube = normalizeYouTube(input.profile.youtube, { returnUrl: true });
      }
      if (input.profile.tiktok !== undefined) {
        normalizedProfile.tiktok = normalizeTikTok(input.profile.tiktok, { returnUrl: true });
      }
      if (input.profile.venue_name !== undefined) {
        normalizedProfile.venue_name = normalizeText(input.profile.venue_name);
      }
      if (input.profile.venue_address !== undefined) {
        normalizedProfile.venue_address = normalizeText(input.profile.venue_address);
      }
      if (input.profile.venue_capacity !== undefined) {
        normalizedProfile.venue_capacity = normalizeNumber(input.profile.venue_capacity);
      }
      if (input.profile.venue_notes !== undefined) {
        normalizedProfile.venue_notes = normalizeText(input.profile.venue_notes);
      }

      // Upsert (insert or update)
      const { error: profileError } = await supabase
        .from('club_profile')
        .upsert(normalizedProfile, { onConflict: 'club_id' });

      if (profileError) {
        return {
          success: false,
          error: profileError.message,
        };
      }
    }

    // 3. Sync aliases
    if (input.aliases) {
      const { add, remove } = input.aliases;

      // Agregar nuevos aliases
      if (add && add.length > 0) {
        const aliasesToAdd = add
          .map(normalizeText)
          .filter(Boolean)
          .map((alias) => ({ club_id: clubId, alias }));

        if (aliasesToAdd.length > 0) {
          const { error: addError } = await supabase
            .from('club_aliases')
            .insert(aliasesToAdd);

          if (addError && addError.code !== '23505') {
            // Ignorar duplicados (23505)
            return {
              success: false,
              error: addError.message,
            };
          }
        }
      }

      // Remover aliases
      if (remove && remove.length > 0) {
        const aliasesToRemove = remove.map(normalizeText).filter(Boolean);

        if (aliasesToRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('club_aliases')
            .delete()
            .eq('club_id', clubId)
            .in('alias', aliasesToRemove);

          if (removeError) {
            return {
              success: false,
              error: removeError.message,
            };
          }
        }
      }
    }

    // 4. Sync secondary unions
    if (input.secondary_unions) {
      const { add, remove } = input.secondary_unions;

      // Agregar nuevas uniones
      if (add && add.length > 0) {
        const unionsToAdd = add
          .map(normalizeText)
          .filter(Boolean)
          .map((union_id) => ({ club_id: clubId, union_id }));

        if (unionsToAdd.length > 0) {
          const { error: addError } = await supabase
            .from('club_secondary_unions')
            .insert(unionsToAdd);

          if (addError && addError.code !== '23505') {
            // Ignorar duplicados
            return {
              success: false,
              error: addError.message,
            };
          }
        }
      }

      // Remover uniones
      if (remove && remove.length > 0) {
        const unionsToRemove = remove.map(normalizeText).filter(Boolean);

        if (unionsToRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('club_secondary_unions')
            .delete()
            .eq('club_id', clubId)
            .in('union_id', unionsToRemove);

          if (removeError) {
            return {
              success: false,
              error: removeError.message,
            };
          }
        }
      }
    }

    // 5. Fetch updated club
    const updatedClub = await fetchClubFull(clubId);
    if (!updatedClub) {
      return {
        success: false,
        error: 'No se pudo obtener el club actualizado',
      };
    }

    return {
      success: true,
      club: updatedClub,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error desconocido',
    };
  }
}

// ============================================================
// FETCH CLUB FULL (con profile, aliases, secondary_unions)
// ============================================================

/**
 * Obtiene un club completo (core + profile + arrays)
 */
export async function fetchClubFull(clubId: string): Promise<ClubFull | null> {
  const supabase = await createServerClient();

  // 1) Core first (needed to confirm entity exists)
  const { data: core, error: coreError } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single();

  if (coreError || !core) {
    return null;
  }

  // 2) Related data in parallel (faster first paint + save roundtrips)
  const [profileResult, aliasesResult, secondaryUnionsResult] = await Promise.all([
    supabase
      .from('club_profile')
      .select('*')
      .eq('club_id', clubId)
      .maybeSingle(),
    supabase
      .from('club_aliases')
      .select('alias')
      .eq('club_id', clubId),
    supabase
      .from('club_secondary_unions')
      .select('union_id')
      .eq('club_id', clubId),
  ]);

  const aliases = aliasesResult.data?.map((a) => a.alias) ?? [];
  const secondary_unions = secondaryUnionsResult.data?.map((u) => u.union_id) ?? [];

  return {
    core: core as ClubCore,
    profile: (profileResult.data as ClubProfile | null) ?? null,
    aliases,
    secondary_unions,
  };
}

export async function linkDerivedClub(params: {
  baseClubId: string;
  derivedClubId: string;
  derivativeType: ClubDerivativeType;
}, options?: { supabaseClient?: any }): Promise<{ success: boolean; error?: string }> {
  const supabase = options?.supabaseClient ?? await createServerClient();

  if (!params.baseClubId || !params.derivedClubId) {
    return { success: false, error: 'Faltan los identificadores del vinculo.' };
  }

  if (params.baseClubId === params.derivedClubId) {
    return { success: false, error: 'El club base y el derivado deben ser distintos.' };
  }

  const { data: derivedClub, error: derivedClubError } = await supabase
    .from('clubs')
    .select('categories')
    .eq('id', params.derivedClubId)
    .maybeSingle();

  if (derivedClubError && !(
    derivedClubError.message.includes('column "categories"') ||
    derivedClubError.message.includes("'categories' column") ||
    (derivedClubError.message.includes('categories') && derivedClubError.message.includes('does not exist')) ||
    derivedClubError.message.includes('schema cache')
  )) {
    return { success: false, error: derivedClubError.message };
  }

  const relationCategories = new Set<string>(Array.isArray(derivedClub?.categories) ? derivedClub.categories : []);
  relationCategories.add(`base_club:${params.baseClubId}`);

  const { error: categoryUpdateError } = derivedClubError
    ? { error: null as { message: string } | null }
    : await supabase
      .from('clubs')
      .update({ categories: Array.from(relationCategories) })
      .eq('id', params.derivedClubId);

  if (categoryUpdateError && !(
    categoryUpdateError.message.includes('column "categories"') ||
    categoryUpdateError.message.includes("'categories' column") ||
    (categoryUpdateError.message.includes('categories') && categoryUpdateError.message.includes('does not exist')) ||
    categoryUpdateError.message.includes('schema cache')
  )) {
    return { success: false, error: categoryUpdateError.message };
  }

  const relationClient = supabase as unknown as ClubDerivativeUpsertClient;
  const { error } = await relationClient
    .from('club_derivatives')
    .upsert({
      base_club_id: params.baseClubId,
      derived_club_id: params.derivedClubId,
      derivative_type: params.derivativeType,
    }, {
      onConflict: 'base_club_id,derived_club_id',
    });

  if (error) {
    if (
      error.message.includes('club_derivatives') &&
      (error.message.includes('schema cache') || error.message.includes('does not exist'))
    ) {
      return { success: true };
    }

    return { success: false, error: error.message };
  }

  return { success: true };
}
