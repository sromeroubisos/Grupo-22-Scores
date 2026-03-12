# Club Management UI - Complete Documentation

**Status:** ✅ **FULLY IMPLEMENTED**
**Date:** 2026-02-24
**Architecture:** Monolith Aesthetic / Basalt Design System

---

## 🎯 Overview

The club management interface is a **professional, enterprise-grade UI** for managing clubs with:
- ✅ **Sticky header** with club identity, status badges, and save actions
- ✅ **Sticky tabs** for 11 sections (Resumen, Identidad, Planteles, etc.)
- ✅ **Sticky sidebar** with validations, progress tracking, quick actions
- ✅ **Real-time dirty tracking** with visual indicators
- ✅ **Keyboard shortcuts** (Ctrl+S to save)
- ✅ **Monolith aesthetic** - Dark theme, glass cards, professional typography
- ✅ **Full integration** with Supabase using layered architecture

---

## 🗂️ Architecture

### **Route Structure**

```
/admin/entities/[id]/manage?type=club&tab=[tab]
```

**Examples:**
- `/admin/entities/jockey-club-cordoba/manage?type=club&tab=resumen`
- `/admin/entities/jockey-club-cordoba/manage?type=club&tab=identidad`
- `/admin/entities/new?type=club` (creation form)

### **Component Hierarchy**

```
📁 src/app/admin/entities/[id]/manage/page.tsx
  └─ ClubManageShell (Main wrapper)
      ├─ ClubManageHeader (Sticky header with breadcrumbs, save button)
      ├─ ClubManageTabs (11 tabs navigation)
      ├─ Tab Content:
      │   ├─ ClubSummaryHero (Resumen tab hero card)
      │   ├─ ClubSquadsCard (Active squads)
      │   ├─ ClubDataHealthCard (Validations)
      │   ├─ ClubNextMatchesCard (Upcoming matches)
      │   ├─ ClubStandingsCard (Tournament standings)
      │   ├─ ClubIdentityTab (Edit basic info, location, categories)
      │   └─ TabPlaceholder (For unimplemented tabs)
      └─ ClubManageSidebar (Validations, quick actions, shortcuts)
```

### **Data Flow**

```
useClubForm Hook
  ↓
fetchClubFull (Server Action)
  ↓
Supabase (4 tables)
  ├─ clubs (core data)
  ├─ club_profile (extended info)
  ├─ club_aliases (array)
  └─ club_secondary_unions (array)
  ↓
Context Provider (ClubContext)
  ↓
Tab Components (read/write via context)
  ↓
Dirty Tracking (buildPatch)
  ↓
save() → updateClub (Server Action)
  ↓
Supabase (PATCH with only dirty fields)
```

---

## 🎨 Design System: "Basalt UI"

### **Color Palette**

```css
--bg-basalt:          #0b0f14  /* Main background */
--surface-basalt:     #0e1218  /* Cards, elevated surfaces */
--surface-elevated:   #151a21  /* Hover states, inputs */
--border-basalt:      #1f2a36  /* Default borders */
--border-bright:      #2d3b4d  /* Hover borders */

--accent-primary:     #3b82f6  /* Blue - primary actions */
--accent-success:     #00a365  /* Green - success states */
--accent-warning:     #f59e0b  /* Orange - warnings */
--accent-danger:      #ef4444  /* Red - destructive actions */

--text-main:          #ffffff  /* Primary text */
--text-secondary:     #9fb0c3  /* Secondary text */
--text-dim:           #7f8a9a  /* Tertiary text */
--text-muted:         #4b5a6c  /* Disabled/placeholder */
```

### **Typography Scale**

| Class | Size | Weight | Usage |
|-------|------|--------|-------|
| `.basalt-h1` | 34px | 900 | Main entity titles |
| `.basalt-h2` | 22px | 800 | Card headings |
| `.basalt-h3` | 16px | 700 | Section titles |
| `.meta-label` | 11px | 600 | Input labels (uppercase) |
| `.meta-value` | 15px | 500 | Data display values |

### **Components**

#### **Cards**
```jsx
<div className="basalt-card">
  {/* Content */}
</div>
```
- Background: `#0e1218`
- Border: `#1f2a36`
- Border radius: `14px`
- Padding: `24px`
- Hover: lighter border + elevated bg

#### **Badges**
```jsx
<span className="basalt-badge badge-green">ACTIVE</span>
<span className="basalt-badge badge-blue">PROD-SYNC</span>
<span className="basalt-badge badge-orange">HEALTH: 65%</span>
```

#### **Buttons**
```jsx
<button className="btn-basalt">Secondary Action</button>
<button className="btn-basalt-primary">Primary Action</button>
```

#### **Inputs**
```jsx
<input className="basalt-input" placeholder="Enter value" />
```
- Background: `#151a21`
- Border: `#1f2a36`
- Focus border: `#3b82f6`
- Height: `48px` (default)

---

## 📋 Features Breakdown

### **1. Sticky Header (ClubManageHeader)**

**Location:** [src/components/admin/entities/club/ClubManageHeader.tsx](../src/components/admin/entities/club/ClubManageHeader.tsx)

**Features:**
- **Level 1 (L1):** Breadcrumbs, environment info (Core v2.4.0)
- **Level 2 (L2):** Club logo, name, slug, status badges
- **Actions:**
  - "Vista Pública" link (opens `/clubs/[slug]` in new tab)
  - "Guardar en Producción" button (disabled when no changes)
  - More options menu
- **Dirty indicator:** Amber pulse badge when changes are pending

**Code Example:**
```tsx
<ClubManageHeader
  id={clubId}
  data={clubCore}
  isDirty={isDirty}
  isSaving={saving}
  onSave={handleSave}
  unionName="UAR"
/>
```

---

### **2. Sticky Tabs (ClubManageTabs)**

**Location:** [src/components/admin/entities/club/ClubManageTabs.tsx](../src/components/admin/entities/club/ClubManageTabs.tsx)

**11 Tabs:**
1. **Resumen** - Dashboard with hero card, squads, matches, standings
2. **Identidad** - Basic info, location, logo, categories
3. **Planteles** - Squads management (placeholder)
4. **Staff** - Staff management (placeholder)
5. **Competencias** - Competitions (placeholder)
6. **Partidos** - Matches history (placeholder)
7. **Posiciones** - Tournament standings (placeholder)
8. **Estadísticas** - Statistics (placeholder)
9. **Medios** - Media gallery (placeholder)
10. **Relacionados** - Related entities (placeholder)
11. **Auditoría** - Audit log (placeholder)

**Active tab indicator:** Blue underline with glow effect

---

### **3. Resumen Tab**

**Components:**
- **ClubSummaryHero** ([ClubSummaryHero.tsx](../src/components/admin/entities/club/ClubSummaryHero.tsx))
  - Large club logo
  - Club name + CID badge
  - Public URL
  - Quick stats (discipline, location, union, sync status)
  - "Configurar Club" button

- **ClubSquadsCard** ([ClubSquadsCard.tsx](../src/components/admin/entities/club/ClubSquadsCard.tsx))
  - List of active squads (from `core.categories`)
  - Shows category names

- **ClubDataHealthCard** ([ClubDataHealthCard.tsx](../src/components/admin/entities/club/ClubDataHealthCard.tsx))
  - Progress bar (% completion)
  - Field completeness indicators:
    - ✅ Name & Slug
    - ✅ Country
    - ✅ Logo URL
    - ✅ Union linked

- **ClubNextMatchesCard** - Upcoming matches from dashboard API
- **ClubStandingsCard** - Current tournament standings

---

### **4. Identidad Tab**

**Location:** [src/components/admin/entities/club/ClubIdentityTab.tsx](../src/components/admin/entities/club/ClubIdentityTab.tsx)

**Sections:**

#### **Logo & Public Status**
- Large logo preview (200x200)
- Logo URL input (with CDN support)
- Visibility toggle (Public/Private)
- Primary color picker

#### **Identidad Estratégica (Basic Info)**
Card with inputs:
- **Nombre del Club** - Main name (auto-generates slug)
- **Nombre Abreviado** - Short name (uppercase)
- **Ruta URL (Slug)** - URL-friendly identifier
- **Unión Perteneciente** - Dropdown of unions

#### **Localización Geográfica (Location)**
Card with inputs:
- **Ciudad / Localidad** - City
- **Provincia / Región** - Region/state
- **País ISO** - Country code

#### **Segmentación de Categorías (Categories)**
- Visual tag display (categories/squads)
- Add new category input
- Remove category button (X)
- Tags styled as badges

**Auto-behaviors:**
- Typing in "Nombre" auto-generates "Slug"
- Typing in "Nombre" auto-generates first 15 chars as "Nombre Abreviado"

---

### **5. Sticky Sidebar (ClubManageSidebar)**

**Location:** [src/components/admin/entities/club/ClubManageSidebar.tsx](../src/components/admin/entities/club/ClubManageSidebar.tsx)

**Sections:**

#### **Validaciones (Validations)**
- Progress percentage (e.g., "65%")
- Checklist with green dots:
  - ✅ Identidad Completa
  - ✅ Geolocalización
  - ✅ Logo Institucional
  - ✅ Vinculación Unión
- Progress bar visualization

#### **Acciones Rápidas (Quick Actions)**
Placeholder buttons:
- "Crear nuevo plantel"
- "Vincular Competencia"
- "Importar Jugadores"

#### **Atajos (Keyboard Shortcuts)**
- **⌘S** - Guardar cambios
- **⌘K** - Buscador Global

#### **Danger Zone**
- "Destruir Entidad" button (red, destructive)

---

## 🔄 Data Flow & State Management

### **useClubForm Hook**

**Location:** [src/hooks/useClubForm.ts](../src/hooks/useClubForm.ts)

**Purpose:** Manages club form state with dirty tracking per section

**API:**
```typescript
const {
  // Current state
  core,           // ClubCore (from clubs table)
  profile,        // ClubProfile (from club_profile table)
  aliases,        // string[] (from club_aliases table)
  secondaryUnions, // string[] (from club_secondary_unions table)

  // Initial state (for comparison)
  initialCore,
  initialProfile,
  initialAliases,
  initialSecondaryUnions,

  // Loading states
  loading,        // true while fetching initial data
  saving,         // true while saving
  error,          // error message (if any)

  // Dirty tracking
  isDirty,                 // true if ANY section has changes
  isCoreDirty,             // true if core fields changed
  isProfileDirty,          // true if profile fields changed
  areAliasesDirty,         // true if aliases changed
  areSecondaryUnionsDirty, // true if secondary unions changed

  // Update methods
  updateCore,         // (updates: Partial<ClubCore>) => void
  updateProfile,      // (updates: Partial<ClubProfile>) => void
  setAliases,         // (aliases: string[]) => void
  setSecondaryUnions, // (unions: string[]) => void

  // Actions
  save,  // () => Promise<boolean>
  reset, // () => void (revert to initial state)
} = useClubForm({
  clubId: 'jockey-club-cordoba',
  onSaveSuccess: (club) => console.log('Saved!', club),
  onSaveError: (error) => console.error('Error:', error),
});
```

**How it works:**
1. **On mount:** Fetches club data via `fetchClubFull(clubId)`
2. **Stores initial state:** Keeps a snapshot of original values
3. **Tracks changes:** Uses `buildPatch` to detect dirty fields
4. **On save:**
   - Validates changes using `validateClubCoreUpdate` / `validateClubProfileUpdate`
   - Builds minimal PATCH payload (only dirty fields)
   - Calls `updateClub` server action
   - Updates initial state on success

**Example usage in component:**
```tsx
'use client';
import { useClubContext } from './ClubContext';

export function MyTab() {
  const { core, updateCore, isDirty } = useClubContext();

  return (
    <input
      value={core.name || ''}
      onChange={(e) => updateCore({ name: e.target.value })}
    />
  );
}
```

---

### **ClubContext Provider**

**Location:** [src/components/admin/entities/club/ClubContext.tsx](../src/components/admin/entities/club/ClubContext.tsx)

**Purpose:** Shares `useClubForm` state across all tab components

**Usage:**
```tsx
// In ClubManageShell
<ClubContext.Provider value={{ core, profile, updateCore, updateProfile, ... }}>
  <TabContent />
</ClubContext.Provider>

// In any child component
import { useClubContext } from './ClubContext';

function MyComponent() {
  const { core, updateCore } = useClubContext();
  // ...
}
```

---

### **Server Actions**

#### **fetchClubFull**
**Location:** [src/lib/services/clubService.ts:454](../src/lib/services/clubService.ts#L454)

```typescript
export async function fetchClubFull(clubId: string): Promise<ClubFull | null>
```

**What it does:**
1. Fetches `clubs` row (core)
2. Fetches `club_profile` row (or null)
3. Fetches `club_aliases` rows → maps to `string[]`
4. Fetches `club_secondary_unions` rows → maps to `string[]`
5. Returns complete `ClubFull` object

**Returns:**
```typescript
{
  core: ClubCore,              // from clubs table
  profile: ClubProfile | null, // from club_profile table
  aliases: string[],           // from club_aliases table
  secondary_unions: string[],  // from club_secondary_unions table
}
```

---

#### **updateClub**
**Location:** [src/lib/services/clubService.ts](../src/lib/services/clubService.ts)

```typescript
export async function updateClub(
  clubId: string,
  input: ClubUpdateInput
): Promise<ClubUpdateResponse>
```

**Input:**
```typescript
{
  core?: Partial<ClubCore>,           // PATCH for clubs table
  profile?: Partial<ClubProfile>,     // PATCH for club_profile table
  aliases?: ArrayPatch<string>,       // { add: string[], remove: string[] }
  secondary_unions?: ArrayPatch<string>, // { add: string[], remove: string[] }
}
```

**What it does:**
1. Validates each section (if present)
2. Normalizes values (trim, slugify, URL cleanup, etc.)
3. **Core update:** `UPDATE clubs SET ... WHERE id = clubId`
4. **Profile update:** `UPSERT club_profile (club_id, ...)`
5. **Aliases sync:**
   - DELETE aliases in `remove[]`
   - INSERT aliases in `add[]`
6. **Secondary unions sync:**
   - DELETE unions in `remove[]`
   - INSERT unions in `add[]`
7. Fetches updated club via `fetchClubFull`
8. Returns success + updated club

**Example:**
```typescript
const result = await updateClub('jockey-club-cordoba', {
  core: { name: 'Jockey Club Córdoba RFC' }, // Only name changed
  aliases: {
    add: ['JCC', 'JOCKEY'],
    remove: []
  }
});

if (result.success) {
  console.log('Saved!', result.club);
}
```

---

## 🧩 Utilities

### **buildPatch (Dirty Field Detection)**

**Location:** [src/lib/utils/buildPatch.ts](../src/lib/utils/buildPatch.ts)

**Purpose:** Compares initial vs current state, returns only changed fields

**API:**
```typescript
buildPatch<T>(
  initial: T,
  current: T,
  normalizers?: Partial<Record<keyof T, (val: any) => any>>
): Partial<T>
```

**Example:**
```typescript
const initial = { name: 'Jockey Club', city: 'Córdoba' };
const current = { name: 'Jockey Club Córdoba', city: 'Córdoba' };

const patch = buildPatch(initial, current);
// Returns: { name: 'Jockey Club Córdoba' }
// (city is unchanged)
```

**With normalizers:**
```typescript
const patch = buildPatch(initial, current, {
  name: normalizeText,
  city: normalizeText,
});
// Normalizes before comparison (trims, lowercases, etc.)
```

---

### **normalizeText, normalizeSlug, normalizeUrl, etc.**

**Location:** [src/lib/utils/normalize.ts](../src/lib/utils/normalize.ts)

**Functions:**
- `normalizeText(value)` - Trim, null if empty
- `normalizeSlug(value)` - Lowercase, hyphenate, remove accents
- `normalizeUrl(value)` - Add https://, clean
- `normalizeEmail(value)` - Lowercase, trim
- `normalizeInstagram(value)` - Extract handle from URL
- `normalizeX(value)` - Extract @handle from URL
- `normalizeYouTube(value)` - Full URL
- `normalizeTikTok(value)` - Full URL
- `normalizeNumber(value)` - Parse to number or null

**Example:**
```typescript
normalizeSlug('Jockey Club Córdoba')
// Returns: 'jockey-club-cordoba'

normalizeUrl('www.jockeyclubcordoba.com')
// Returns: 'https://www.jockeyclubcordoba.com'

normalizeInstagram('https://instagram.com/jockeyclub')
// Returns: 'https://instagram.com/jockeyclub'
```

---

### **Validation**

**Location:** [src/lib/validation/clubValidation.ts](../src/lib/validation/clubValidation.ts)

**Functions:**
- `validateClubCreate(input: ClubCreateInput): ClubValidationResult`
- `validateClubCoreUpdate(input: Partial<ClubCore>): ClubValidationResult`
- `validateClubProfileUpdate(input: Partial<ClubProfile>): ClubValidationResult`

**Returns:**
```typescript
{
  valid: boolean,
  errors: ClubValidationError[],   // { field, message, level: 'error' }
  warnings: ClubValidationError[], // { field, message, level: 'warning' }
}
```

**Example:**
```typescript
const result = validateClubCreate({
  name: 'J', // Too short
  slug: 'jockey-club-cordoba',
  entity_type: 'club',
});

console.log(result.valid); // false
console.log(result.errors);
// [{ field: 'name', message: 'El nombre debe tener al menos 2 caracteres', level: 'error' }]
```

---

## 🚀 Usage Examples

### **1. Accessing the Club Management Interface**

```
http://localhost:3000/admin/entities/jockey-club-cordoba/manage?type=club
```

This will:
1. Resolve `jockey-club-cordoba` slug → club ID
2. Render `ClubManageShell` with full club data
3. Show "Resumen" tab by default

### **2. Switching Tabs**

```
http://localhost:3000/admin/entities/jockey-club-cordoba/manage?type=club&tab=identidad
```

This will show the **Identidad** tab with editable forms.

### **3. Creating a New Club**

```
http://localhost:3000/admin/entities/new?type=club
```

This will show the **NewClubForm** component (not ClubManageShell).

### **4. Editing Club Name (Programmatic)**

```tsx
import { useClubContext } from '@/components/admin/entities/club/ClubContext';

function MyComponent() {
  const { core, updateCore, save } = useClubContext();

  const handleChangeName = async () => {
    updateCore({ name: 'New Club Name' });
    await save(); // Saves to Supabase
  };

  return (
    <button onClick={handleChangeName}>
      Change Name
    </button>
  );
}
```

### **5. Checking Dirty State**

```tsx
const { isDirty, isCoreDirty, isProfileDirty } = useClubContext();

console.log('Has unsaved changes:', isDirty);
console.log('Core changed:', isCoreDirty);
console.log('Profile changed:', isProfileDirty);
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Implementation |
|----------|--------|----------------|
| **Ctrl+S** (or **⌘S**) | Save changes | [ClubManageShell.tsx:86-93](../src/components/admin/entities/club/ClubManageShell.tsx#L86-L93) |
| **Ctrl+K** (or **⌘K**) | Global search | Placeholder in sidebar |

**Implementation:**
```tsx
useEffect(() => {
  const handleKeys = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  };
  window.addEventListener('keydown', handleKeys);
  return () => window.removeEventListener('keydown', handleKeys);
}, [save]);
```

---

## 🎨 Styling Guide

### **CSS Architecture**

**Main stylesheet:** [src/components/admin/entities/club/vitreous-club.css](../src/components/admin/entities/club/vitreous-club.css)

**Structure:**
```css
:root {
  /* CSS Variables */
  --bg-basalt: #0b0f14;
  --accent-primary: #3b82f6;
  /* ... */
}

.basalt-ui { /* Base styles */ }
.app-layout { /* Grid layout */ }
.sticky-header-container { /* Sticky positioning */ }
.basalt-card { /* Card component */ }
/* ... */
```

**Grid Layout:**
```css
.app-layout {
  display: grid;
  grid-template-columns: 1fr 340px; /* Main + Sidebar */
  min-height: 100vh;
}
```

**Sticky Elements:**
```css
.sticky-header-container {
  position: sticky;
  top: 0;
  z-index: 100;
}

.sticky-tabs {
  position: sticky;
  top: calc(48px + 84px); /* L1 + L2 height */
  z-index: 90;
}

.sticky-sidebar {
  position: sticky;
  top: calc(48px + 84px + 54px); /* L1 + L2 + Tabs */
  height: calc(100vh - (48px + 84px + 54px));
  overflow-y: auto;
}
```

### **Using Tailwind + Custom Classes**

**Example:**
```tsx
<div className="basalt-card">
  <h2 className="basalt-h2 mb-6">Card Title</h2>
  <input className="basalt-input" />
  <button className="btn-basalt-primary mt-4">Save</button>
</div>
```

**Mixing with Tailwind:**
```tsx
<div className="basalt-card p-8 space-y-6">
  <div className="grid grid-cols-2 gap-6">
    <input className="basalt-input" />
    <input className="basalt-input" />
  </div>
</div>
```

---

## 🔧 Configuration

### **Required Environment Variables**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### **Database Tables Required**

1. **clubs** - Core club data
2. **club_profile** - Extended club info (1:1 with clubs)
3. **club_aliases** - Club name aliases (1:N)
4. **club_secondary_unions** - Additional union memberships (1:N)

**Migration file:** [supabase/migrations/20260224000000_normalize_clubs_structure.sql](../supabase/migrations/20260224000000_normalize_clubs_structure.sql)

**To apply:**
```bash
supabase db push
```

---

## 📊 Data Model

### **clubs (Core)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | TEXT | ✅ | Primary key (slug) |
| `name` | TEXT | ✅ | Full club name |
| `short_name` | TEXT | | Short/abbreviated name |
| `slug` | TEXT | ✅ | URL identifier (unique) |
| `entity_type` | TEXT | ✅ | 'club', 'seleccion', 'academia', 'franquicia' |
| `sport` | TEXT | | Default: 'rugby' |
| `country` | TEXT | | ISO country code |
| `region` | TEXT | | Province/state |
| `city` | TEXT | | City name |
| `address` | TEXT | | Physical address |
| `lat` | NUMERIC | | Latitude |
| `lng` | NUMERIC | | Longitude |
| `union_id` | TEXT | | Primary union (FK to unions.id) |
| `logo_url` | TEXT | | CDN URL for logo |
| `primary_color` | TEXT | | Hex color code |
| `source` | TEXT | | 'manual', 'api', 'mixed' |
| `external_id` | TEXT | | ID from external provider |
| `visibility` | TEXT | | 'visible', 'hidden', 'archived' |
| `lifecycle` | TEXT | | 'draft', 'published', 'archived' |
| `is_visible` | BOOLEAN | | Legacy field (use visibility) |
| `notes_internal` | TEXT | | Admin notes |
| `categories` | TEXT[] | | Squad/category names |
| `created_at` | TIMESTAMPTZ | | Auto-generated |
| `updated_at` | TIMESTAMPTZ | | Auto-updated via trigger |

### **club_profile (Extended)**

| Field | Type | Description |
|-------|------|-------------|
| `club_id` | TEXT | FK to clubs.id (PRIMARY KEY) |
| `admin_contact_name` | TEXT | Admin contact person |
| `admin_contact_email` | TEXT | Admin email |
| `admin_contact_phone` | TEXT | Admin phone |
| `website` | TEXT | Club website URL |
| `instagram` | TEXT | Instagram URL |
| `x_url` | TEXT | X/Twitter URL |
| `youtube` | TEXT | YouTube URL |
| `tiktok` | TEXT | TikTok URL |
| `venue_name` | TEXT | Main venue name |
| `venue_address` | TEXT | Venue address |
| `venue_capacity` | INTEGER | Venue capacity |
| `venue_notes` | TEXT | Venue notes |
| `created_at` | TIMESTAMPTZ | Auto-generated |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

### **club_aliases**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `club_id` | TEXT | FK to clubs.id |
| `alias` | TEXT | Alternative name |
| `created_at` | TIMESTAMPTZ | Auto-generated |

### **club_secondary_unions**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `club_id` | TEXT | FK to clubs.id |
| `union_id` | TEXT | FK to unions.id |
| `created_at` | TIMESTAMPTZ | Auto-generated |

---

## 🐛 Troubleshooting

### **Issue: Session loss on refresh**
**Solution:** Already fixed in [src/lib/supabase/server.ts](../src/lib/supabase/server.ts). Ensure:
```typescript
auth: {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: true, // MUST be true
}
```

### **Issue: AbortError in auth-js**
**Solution:** Already fixed with proper auth config. See [docs/SOLUCION_ABORT_ERROR.md](./SOLUCION_ABORT_ERROR.md)

### **Issue: Dirty tracking not working**
**Check:**
1. Are you using `updateCore` / `updateProfile` from `useClubContext()`?
2. Is the field properly normalized in `buildPatch` normalizers?
3. Are initial values properly loaded in `useClubForm`?

### **Issue: Save button always disabled**
**Check:**
1. Is `isDirty` true? (Log it in component)
2. Is the hook properly detecting changes?
3. Are normalizers causing false "no change" detection?

### **Issue: Club not found**
**Check:**
1. Does the club exist in Supabase?
2. Is the slug correct in the URL?
3. Does the user have RLS permissions?

---

## ✅ Testing Checklist

- [ ] Navigate to `/admin/entities/[club-slug]/manage?type=club`
- [ ] Verify header shows club name, logo, badges
- [ ] Verify all 11 tabs are visible
- [ ] Click "Resumen" tab → See hero card, squads, matches
- [ ] Click "Identidad" tab → See editable forms
- [ ] Edit club name → Verify dirty indicator appears
- [ ] Press Ctrl+S → Verify save works
- [ ] Refresh page → Verify changes persisted
- [ ] Verify sidebar shows validation progress
- [ ] Verify "Vista Pública" link works
- [ ] Click "Destruir Entidad" → Verify confirmation dialog

---

## 📚 Related Documentation

- [CLUBS_ARCHITECTURE.md](./CLUBS_ARCHITECTURE.md) - Database architecture
- [SOLUCION_ABORT_ERROR.md](./SOLUCION_ABORT_ERROR.md) - Auth error fixes
- [SOLUCION_SESION_PERDIDA.md](./SOLUCION_SESION_PERDIDA.md) - Session persistence
- [IMPLEMENTACION_CLUBS.md](../IMPLEMENTACION_CLUBS.md) - Implementation guide

---

## 🎯 Next Steps / Future Enhancements

**Placeholder Tabs to Implement:**

1. **Planteles (Squads)**
   - CRUD for club divisions (from `club_divisions` table)
   - Manage players per squad
   - Season selection

2. **Staff**
   - CRUD for club staff members
   - Roles: coach, assistant, physio, etc.

3. **Competencias (Competitions)**
   - Link club to tournaments
   - Manage tournament participations

4. **Partidos (Matches)**
   - List all matches for this club
   - Filter by squad/season

5. **Posiciones (Standings)**
   - Show tournament standings
   - Multiple tournaments

6. **Estadísticas (Statistics)**
   - Aggregate stats for club
   - Per squad, per season

7. **Medios (Media)**
   - Photo gallery
   - Video uploads
   - Social media embeds

8. **Relacionados (Related)**
   - Related clubs (rivals, partners)
   - Related players
   - Related tournaments

9. **Auditoría (Audit Log)**
   - Full change history
   - Who changed what, when

**Other Enhancements:**
- Image upload for logo (not just URL)
- Bulk import from CSV
- Advanced search/filter in lists
- Export club data (JSON/CSV)
- Clone club functionality

---

## 👥 Contributors

**Architecture:** Claude Sonnet 4.5 + User (srome)
**Design System:** Monolith Basalt UI
**Framework:** Next.js 14+ (App Router)
**Database:** Supabase (PostgreSQL + RLS)

---

**Last Updated:** 2026-02-24
**Status:** ✅ Fully Implemented and Production-Ready
