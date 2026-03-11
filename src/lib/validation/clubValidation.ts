// ============================================================
// CLUB VALIDATION
// ============================================================
// Validaciones frontend para crear/editar clubes.
// Se replican en DB constraints para seguridad.
// ============================================================

import type {
  ClubCreateInput,
  ClubCoreUpdateInput,
  ClubProfileUpdateInput,
  ClubValidationError,
  ClubValidationResult,
  ClubHealth,
  ClubHealthStatus,
  ClubCore,
  ClubProfile,
} from '../types/clubs';
import { normalizeText, normalizeSlug, normalizeEmail, normalizeUrl } from '../utils/normalize';

// ============================================================
// CREATE VALIDATION
// ============================================================

/**
 * Valida los datos de creación de un club
 */
export function validateClubCreate(input: ClubCreateInput): ClubValidationResult {
  const errors: ClubValidationError[] = [];
  const warnings: ClubValidationError[] = [];

  // name: obligatorio, mínimo 2 caracteres
  const name = normalizeText(input.name);
  if (!name) {
    errors.push({
      field: 'name',
      message: 'El nombre es obligatorio',
      level: 'error',
    });
  } else if (name.length < 2) {
    errors.push({
      field: 'name',
      message: 'El nombre debe tener al menos 2 caracteres',
      level: 'error',
    });
  }

  // slug: obligatorio, formato kebab-case
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    errors.push({
      field: 'slug',
      message: 'El slug es obligatorio',
      level: 'error',
    });
  } else if (slug !== input.slug) {
    warnings.push({
      field: 'slug',
      message: `El slug será normalizado a: ${slug}`,
      level: 'warning',
    });
  }

  // entity_type: obligatorio
  if (!input.entity_type) {
    errors.push({
      field: 'entity_type',
      message: 'El tipo de entidad es obligatorio',
      level: 'error',
    });
  }

  // country: recomendado (default ARG)
  if (!normalizeText(input.country)) {
    warnings.push({
      field: 'country',
      message: 'Se recomienda especificar el país (default: ARG)',
      level: 'warning',
    });
  }

  // sport: recomendado (default rugby)
  if (!normalizeText(input.sport)) {
    warnings.push({
      field: 'sport',
      message: 'Se recomienda especificar el deporte (default: rugby)',
      level: 'warning',
    });
  }

  // source=api ⇒ external_id obligatorio
  if (input.source === 'api' && !normalizeText(input.external_id)) {
    errors.push({
      field: 'external_id',
      message: 'external_id es obligatorio cuando source=api',
      level: 'error',
    });
  }

  // logo_url: recomendado
  if (!normalizeText(input.logo_url)) {
    warnings.push({
      field: 'logo_url',
      message: 'Se recomienda subir un logo',
      level: 'warning',
    });
  }

  // union_id: recomendado
  if (!normalizeText(input.union_id)) {
    warnings.push({
      field: 'union_id',
      message: 'Se recomienda asignar una unión',
      level: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// UPDATE VALIDATION
// ============================================================

/**
 * Valida los datos de actualización del core
 */
export function validateClubCoreUpdate(input: ClubCoreUpdateInput): ClubValidationResult {
  const errors: ClubValidationError[] = [];
  const warnings: ClubValidationError[] = [];

  // Si se está actualizando name, validarlo
  if (input.name !== undefined) {
    const name = normalizeText(input.name);
    if (!name) {
      errors.push({
        field: 'name',
        message: 'El nombre no puede estar vacío',
        level: 'error',
      });
    } else if (name.length < 2) {
      errors.push({
        field: 'name',
        message: 'El nombre debe tener al menos 2 caracteres',
        level: 'error',
      });
    }
  }

  // Si se está actualizando slug, validarlo
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug) {
      errors.push({
        field: 'slug',
        message: 'El slug no puede estar vacío',
        level: 'error',
      });
    } else if (slug !== input.slug) {
      warnings.push({
        field: 'slug',
        message: `El slug será normalizado a: ${slug}`,
        level: 'warning',
      });
    }
  }

  // source=api ⇒ external_id no puede ser null
  if (input.source === 'api' && input.external_id === null) {
    errors.push({
      field: 'external_id',
      message: 'external_id no puede ser null cuando source=api',
      level: 'error',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Valida los datos de actualización del profile
 */
export function validateClubProfileUpdate(input: ClubProfileUpdateInput): ClubValidationResult {
  const errors: ClubValidationError[] = [];
  const warnings: ClubValidationError[] = [];

  // Validar email si se provee
  if (input.admin_contact_email !== undefined && input.admin_contact_email !== null) {
    const email = normalizeEmail(input.admin_contact_email);
    // Regex simple para validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      errors.push({
        field: 'admin_contact_email',
        message: 'Formato de email inválido',
        level: 'error',
      });
    }
  }

  // Validar URLs si se proveen
  const urlFields: Array<keyof ClubProfileUpdateInput> = [
    'website',
    'instagram',
    'x_url',
    'youtube',
    'tiktok',
  ];

  for (const field of urlFields) {
    const value = input[field];
    if (value !== undefined && value !== null) {
      const normalized = normalizeUrl(value);
      if (normalized && normalized !== value) {
        warnings.push({
          field,
          message: `La URL será normalizada a: ${normalized}`,
          level: 'warning',
        });
      }
    }
  }

  // Validar venue_capacity si se provee
  if (input.venue_capacity !== undefined && input.venue_capacity !== null) {
    if (input.venue_capacity < 0) {
      errors.push({
        field: 'venue_capacity',
        message: 'La capacidad no puede ser negativa',
        level: 'error',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// HEALTH / COMPLETENESS
// ============================================================

/**
 * Calcula el estado de "salud" y completitud de un club
 * (basado en datos existentes, no requiere guardar)
 */
export function calculateClubHealth(
  core: ClubCore,
  profile: ClubProfile | null
): ClubHealth {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ERRORS (bloqueantes)
  if (!normalizeText(core.name) || core.name.length < 2) {
    errors.push('Nombre inválido o muy corto');
  }

  if (!normalizeText(core.slug)) {
    errors.push('Slug vacío');
  }

  if (!core.country) {
    errors.push('País no especificado');
  }

  if (core.source === 'api' && !core.external_id) {
    errors.push('Falta external_id (source=api)');
  }

  // WARNINGS (recomendados)
  if (!core.logo_url) {
    warnings.push('Sin logo');
  }

  if (!core.union_id) {
    warnings.push('Sin unión asignada');
  }

  if (!core.city) {
    warnings.push('Sin ciudad especificada');
  }

  if (!profile) {
    warnings.push('Sin perfil completo (contacto, redes, venue)');
  } else {
    if (!profile.website) {
      warnings.push('Sin sitio web');
    }
    if (!profile.instagram && !profile.x_url) {
      warnings.push('Sin redes sociales');
    }
    if (!profile.venue_name) {
      warnings.push('Sin venue principal');
    }
  }

  // COMPLETENESS (0-100%)
  // Campos importantes:
  const totalFields = 12;
  let completedFields = 0;

  if (core.name) completedFields++;
  if (core.slug) completedFields++;
  if (core.country) completedFields++;
  if (core.logo_url) completedFields++;
  if (core.union_id) completedFields++;
  if (core.city) completedFields++;
  if (core.entity_type) completedFields++;

  if (profile?.website) completedFields++;
  if (profile?.instagram || profile?.x_url) completedFields++;
  if (profile?.admin_contact_email) completedFields++;
  if (profile?.venue_name) completedFields++;
  if (core.primary_color) completedFields++;

  const completeness = Math.round((completedFields / totalFields) * 100);

  // STATUS
  let status: ClubHealthStatus = 'ok';
  if (errors.length > 0) {
    status = 'error';
  } else if (warnings.length > 0) {
    status = 'warning';
  }

  return {
    status,
    errors,
    warnings,
    completeness,
  };
}
