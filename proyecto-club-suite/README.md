# Club Suite — consola completa del club (semilla de proyecto nuevo)

Esta carpeta **no se compila**. Está fuera de `src/`, así que ni Next la rutea ni
`tsc` la mira (`tsconfig.json` incluye solo `src/**/*`). Es una copia congelada
de la consola de club completa, tomada el **20/8/2026**, antes de reducir
`/admin/entities/[id]/manage?type=club` a cuatro pestañas.

El motivo de que exista: entrenamientos, rendimiento, pizarra y partidos salieron
de G22 Scores para vivir en un producto aparte. El código no se tira — se guarda
acá con sus dependencias propias para poder arrancar el proyecto nuevo sin
rehacerlo.

---

## Qué se llevó

### Pestañas que ya no están en G22 Scores

| Módulo | Archivos | Líneas |
|---|---|---|
| **Rendimiento** | `ClubPerformanceTab.tsx` + `.module.css`, `ClubStaffPerformanceSuite.tsx` + `.module.css` | ~4.700 |
| **Entrenamientos** | `ClubEntrenamientosTab.tsx`, `ClubTrainingCreateModal.tsx`, `ClubTrainingGymTab.tsx` | ~7.000 |
| **Pizarra** | `ClubPizarraTab.tsx`, `pizarra/`, `src/lib/club-pizarra/` | ~2.100 + lib |
| **Partidos** | `ClubFixtureResultsTab.tsx`, `CreateInternalMatchModal.tsx`, `ClubNextMatchesCard.tsx` | ~1.900 |
| **Competencias** | `ClubCompetitionsPanel.tsx`, `ClubStandingsCard.tsx`, `ClubStandingsOverviewTab.tsx` | ~1.500 |
| **Contenido / Sponsors / Staff** | `ClubContentStudioTab.tsx`, `ClubSponsorsTab.tsx`, `ClubStaffTab.tsx` | ~590 |
| **Gráficos** | `src/components/admin/charts/` | — |
| **Import CSV** | `CSVImportModal.tsx`, `src/lib/services/csvService.ts` | ~630 |

### Lo que quedó y también está acá

`ClubManageShell.tsx` (el orquestador viejo, 1.003 líneas), `ClubIdentityTab`,
`ClubSquadsTab`, `ClubUsersTab`, `ClubRelatedClubsTab`, el CSS
(`vitreous-club.css` son 266 KB) y las rutas de API bajo `api/club-admin/` y
`api/clubs/`. En G22 Scores esas cuatro pestañas se reescribieron de cero; acá
está la versión original por si el proyecto nuevo la necesita entera.

---

## Cómo injertarlo en un proyecto nuevo

1. Next.js App Router + Tailwind + Supabase, igual que G22.
2. Copiar `src/` de esta carpeta sobre el `src/` del proyecto nuevo. Los paths
   `@/…` ya coinciden.
3. Traer del repo de G22 las dependencias compartidas que **no** están acá — son
   infraestructura, no consola de club:

   ```
   lib/supabase/{server,admin,read,serviceWriter}
   lib/auth/{permissions,roles,apiAdmin,tournamentAdminScope}
   lib/utils/{logoUrl,postgrest,supabaseSchema,normalize,errorUtils}
   lib/types/clubs · lib/database.types · lib/validation/clubValidation
   lib/data/sports · lib/timezone · lib/clubDerivatives
   lib/services/{entityResolver,fixtureService,matchCenterService,
                 externalMatchCache,externalTeamHonours,relatedResolver}
   lib/standings/{tableTypeSupport,matchPointsPreview}
   lib/{matchEventCatalog,matchEventStats,matchPeriods,matchReview,
        matchStatsFromEvents,matchSheetPdf,matchPlayerSelection}
   lib/performance/{rugbyStaff,rugbyStaffStore}
   components/{LogoUploader,TeamLogo} · components/admin/ui/*
   ```

4. El esquema de Supabase que hace falta: `clubs`, `club_profile`,
   `club_aliases`, `club_secondary_unions`, `club_derivatives`, `memberships`,
   `people`, `teams` (divisiones), `season_rosters`, `roster_memberships`,
   `trainings`, `gym_plans`, `physical_records`, `physical_test_definitions`,
   `performance_records`, `chart_configs`, `club_sponsors`, `club_documents`.

## Trampas conocidas

- **Los escudos vienen en base64.** `clubs.logo_url` guarda data URIs de hasta
  ~870 KB. Nunca embeber `logo_url` crudo en una lista: se sirve por el proxy
  (`/api/assets/team-logo?key=…`). Un `select` con el logo por fila timeoutea.
- **`database.types.ts` se mantiene a mano** y miente. La tabla `clubs` real
  tiene: `id, union_id, name, short_name, city, region, country, logo_url,
  primary_color, slug, is_visible, created_at, updated_at, entity_type, sport,
  sport_id, category, categories, status, visibility, external_id`. No hay
  columna de camiseta.
- **Las divisiones pueden ser sintéticas.** `fetchDivisions()` devuelve ids del
  tipo `family-division|<club>|<nombre>` para planteles compartidos por la
  familia de clubes. No asumir que el id es una fila de `teams`.
- **`vitreous-club.css` pesa 266 KB** y está escrito contra la estructura del
  `ClubManageShell` viejo. Si el proyecto nuevo rehace el layout, conviene
  reescribirlo antes que arrastrarlo.
