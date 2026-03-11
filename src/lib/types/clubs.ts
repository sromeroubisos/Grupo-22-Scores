// ============================================================
// CLUBS - Professional Layered Type System
// ============================================================
// Diseño por capas:
//   - Core: datos esenciales (clubs table)
//   - Profile: datos extensos (club_profile table)
//   - Arrays: aliases y secondary unions (tablas relacionales)
//   - Create: input mínimo requerido
//   - Update: PATCH parcial (dirty fields only)
// ============================================================

// ============================================================
// DATABASE TYPES (reflejan las tablas de Supabase)
// ============================================================

/**
 * CLUBS (CORE) - Tabla principal
 * Campos esenciales y de búsqueda frecuente
 */
export interface ClubCore {
  // Identidad
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  entity_type: 'club' | 'seleccion' | 'academia' | 'franquicia';
  sport: string; // Default: 'rugby'

  // Ubicación
  country: string; // Default: 'ARG'
  region: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;

  // Organización
  union_id: string | null; // FK a unions (PRIMARY union)

  // Medios
  logo_url: string | null;
  primary_color: string | null;

  // Integraciones
  source: 'manual' | 'api' | 'import';
  external_id: string | null;
  last_sync_at: string | null; // ISO datetime
  sync_status: string | null;

  // Estado
  visibility: 'visible' | 'hidden';
  lifecycle: 'draft' | 'published' | 'active' | 'archived';
  is_visible: boolean; // Legacy (mantener por compatibilidad)

  notes_internal: string | null;
  categories: string[] | null;

  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

/**
 * CLUB_PROFILE - Tabla de detalles extensos
 * Contactos, redes sociales, venue principal
 */
export interface ClubProfile {
  club_id: string;

  // Contacto admin
  admin_contact_name: string | null;
  admin_contact_email: string | null;
  admin_contact_phone: string | null;

  // Links y redes
  website: string | null;
  instagram: string | null;
  x_url: string | null;
  youtube: string | null;
  tiktok: string | null;

  // Venue principal
  venue_name: string | null;
  venue_address: string | null;
  venue_capacity: number | null;
  venue_notes: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * CLUB_ALIASES - Nombres alternativos (tabla relacional)
 */
export interface ClubAlias {
  id: string;
  club_id: string;
  alias: string;
  created_at: string;
}

/**
 * CLUB_SECONDARY_UNIONS - Uniones adicionales (tabla relacional)
 */
export interface ClubSecondaryUnion {
  id: string;
  club_id: string;
  union_id: string;
  created_at: string;
}

/**
 * CLUB COMPLETO - Join de todas las tablas
 */
export interface ClubFull {
  core: ClubCore;
  profile: ClubProfile | null;
  aliases: string[]; // Array de alias strings
  secondary_unions: string[]; // Array de union_ids
}

// ============================================================
// INPUT TYPES (para API)
// ============================================================

/**
 * CREATE CLUB INPUT - Mínimo requerido para crear
 *
 * Campos obligatorios:
 * - name (>=2 chars)
 * - slug (no vacío, kebab-case, único)
 * - entity_type
 * - sport (default 'rugby')
 * - country (default 'ARG')
 *
 * Si source='api' entonces external_id es obligatorio
 */
export interface ClubCreateInput {
  // Obligatorios
  name: string;
  slug: string;
  entity_type: 'club' | 'seleccion' | 'academia' | 'franquicia';

  // Opcionales con defaults
  sport?: string; // Default: 'rugby'
  country?: string; // Default: 'ARG'

  // Opcionales
  short_name?: string | null;
  region?: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;

  union_id?: string | null;

  logo_url?: string | null;
  primary_color?: string | null;

  source?: 'manual' | 'api' | 'import'; // Default: 'manual'
  external_id?: string | null;

  visibility?: 'visible' | 'hidden'; // Default: 'visible'
  lifecycle?: 'draft' | 'published' | 'active' | 'archived'; // Default: 'draft'

  notes_internal?: string | null;

  // Extended Profile & Relations
  aliases?: string[];
  secondary_unions?: string[];
  gender?: string | null;
  age_grade?: string | null;
  admin_contact_name?: string | null;
  admin_contact_email?: string | null;
  admin_contact_phone?: string | null;
  organization_role?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_capacity?: number | null;
  venue_notes?: string | null;
  website?: string | null;
  instagram?: string | null;
  x_url?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
}

/**
 * UPDATE CLUB CORE INPUT - PATCH parcial para clubs table
 * Todos los campos son opcionales (solo se envían los que cambiaron)
 */
export interface ClubCoreUpdateInput {
  name?: string;
  short_name?: string | null;
  slug?: string;
  entity_type?: 'club' | 'seleccion' | 'academia' | 'franquicia';
  sport?: string;

  country?: string;
  region?: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;

  union_id?: string | null;

  logo_url?: string | null;
  primary_color?: string | null;

  source?: 'manual' | 'api' | 'import';
  external_id?: string | null;
  last_sync_at?: string | null;
  sync_status?: string | null;

  visibility?: 'visible' | 'hidden';
  lifecycle?: 'draft' | 'published' | 'active' | 'archived';

  notes_internal?: string | null;
}

/**
 * UPDATE CLUB PROFILE INPUT - PATCH parcial para club_profile table
 * Todos los campos son opcionales
 */
export interface ClubProfileUpdateInput {
  admin_contact_name?: string | null;
  admin_contact_email?: string | null;
  admin_contact_phone?: string | null;

  website?: string | null;
  instagram?: string | null;
  x_url?: string | null;
  youtube?: string | null;
  tiktok?: string | null;

  venue_name?: string | null;
  venue_address?: string | null;
  venue_capacity?: number | null;
  venue_notes?: string | null;
}

/**
 * UPDATE CLUB INPUT - Completo (core + profile + arrays)
 */
export interface ClubUpdateInput {
  core?: ClubCoreUpdateInput;
  profile?: ClubProfileUpdateInput;
  aliases?: {
    add?: string[]; // Nuevos aliases a agregar
    remove?: string[]; // Aliases a eliminar
  };
  secondary_unions?: {
    add?: string[]; // Nuevos union_ids a agregar
    remove?: string[]; // Union_ids a eliminar
  };
}

// ============================================================
// VALIDATION TYPES
// ============================================================

export interface ClubValidationError {
  field: string;
  message: string;
  level: 'error' | 'warning';
}

export interface ClubValidationResult {
  valid: boolean;
  errors: ClubValidationError[];
  warnings: ClubValidationError[];
}

/**
 * Health/Completeness Status
 */
export type ClubHealthStatus = 'error' | 'warning' | 'ok';

export interface ClubHealth {
  status: ClubHealthStatus;
  errors: string[]; // Errores bloqueantes
  warnings: string[]; // Campos recomendados faltantes
  completeness: number; // 0-100 %
}

// ============================================================
// UTILITY TYPES
// ============================================================

/**
 * Campos que se normalizan antes de guardar
 */
export interface NormalizedClubData {
  core: Partial<ClubCore>;
  profile: Partial<ClubProfile>;
}

/**
 * Response de API
 */
export interface ClubCreateResponse {
  success: boolean;
  club?: ClubCore;
  error?: string;
  validationErrors?: ClubValidationError[];
}

export interface ClubUpdateResponse {
  success: boolean;
  club?: ClubFull;
  error?: string;
  validationErrors?: ClubValidationError[];
}
