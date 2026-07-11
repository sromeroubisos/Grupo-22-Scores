# Gestor de Torneos — Flujo de creación, edición y gestión

> Documento de arquitectura funcional para el rol **Administrador de Torneos** (gestor).
> Describe el recorrido completo: entrada al panel, alcance (scope), creación,
> listado, gestión profunda en el "gestor" y el resto de secciones del panel.

---

## 1. Visión general

Un Administrador de Torneos opera dentro de un panel acotado en
[`src/app/admin/torneo/`](../src/app/admin/torneo/). A diferencia del Super
Admin, **solo ve y modifica lo que creó él o lo que el Super Admin le
concedió**, con una cascada automática: el acceso a un torneo arrastra a sus
clubes participantes.

Recorrido típico de punta a punta:

```
Panel → Mis torneos → Crear torneo (wizard 4 pasos, queda en draft a su nombre)
      → Abrir en gestor → completar Estructura / Participantes / Fases
      → cargar fixture y resultados en Operación
      → Publicar (desde el listado o la pestaña Publicación)
```

Todo siempre filtrado por su **scope**.

---

## 2. Entrada al panel y control de acceso

| Pieza | Archivo | Rol |
|---|---|---|
| Layout / guard | [`layout.tsx`](../src/app/admin/torneo/layout.tsx) | Ejecuta `requireTournamentAdminContext()` en cada request; si falla, redirige fuera |
| Home / stats | [`page.tsx`](../src/app/admin/torneo/page.tsx) | Tarjetas con conteo de clubes y torneos según scope |
| Navegación | [`TournamentAdminSidebar.tsx`](../src/app/admin/torneo/components/TournamentAdminSidebar.tsx) | 7 secciones del panel |
| Resolución de scope | [`tournamentAdminScope.ts`](../src/lib/auth/tournamentAdminScope.ts) | Calcula qué torneos/clubes puede tocar el usuario |

### 2.1 El modelo de scope (clave)

`resolveTournamentAdminScope()` devuelve:

- **Admin global / super admin** → `isUnlimited: true`: ve absolutamente todo.
- **Gestor común** → conjunto explícito de IDs:
  1. Torneos donde `created_by_user_id` = su usuario (los que creó).
  2. Torneos/clubes concedidos por el Super Admin (memberships con
     `scopeType` `tournament` o `club` y rol `admin`/`editor`).
  3. **Cascada dinámica**: todos los clubes que participan en cualquier torneo
     accesible, resuelto en vivo desde `tournament_participants` (no requiere
     re-conceder cuando cambian los participantes).

> Nota técnica: la lectura de torneos propios usa *service-role* porque la
> política RLS de SELECT pública oculta los borradores, que el gestor debe ver.
> Existe además un override de preview por `PREVIEW_TOURNAMENT_IDS` (solo
> `.env.local`) que restringe todo el gestor a un set fijo, ignorando el rol.

Helpers: `isScopeAllowedTournament(scope, id)` / `isScopeAllowedClub(scope, id)`.

### 2.2 Secciones del panel

`Inicio` · `Clubes` · `Torneos` · `Importar Excel` · `Equipos / Plantel` ·
`Editar partidos` · `Usuarios`.

---

## 3. Creación de un torneo

### 3.1 Punto de entrada

Desde **Mis torneos** el botón "Crear torneo" lleva a
[`torneos/crear/page.tsx`](../src/app/admin/torneo/torneos/crear/page.tsx),
que **reutiliza el wizard del Super Admin**
([`super/torneos/crear/page.tsx`](../src/app/admin/super/torneos/crear/page.tsx))
con la prop `navigationMode="tournament-admin"`.

El único efecto del modo: `tournamentsHomeHref` apunta a
`/admin/torneo/torneos` en vez del panel super, de modo que al terminar el
gestor vuelve a *su* listado.

### 3.2 Etapas del wizard (`STAGE_ORDER`)

| # | Stage | Qué se define |
|---|---|---|
| 0 | `template` | Plantilla: Liga (round-robin), Eliminación directa, Grupos + Playoff, Circuito por eventos, o Personalizado multi-fase (abre modo avanzado con `PhaseCreator`). Cada plantilla precarga formato y defaults. |
| 1 | `basics` | Nombre, deporte, audiencia/categoría, temporada, país, unión, logo, visibilidad |
| 2 | `structure` | Cantidad de equipos, modalidad, sistema de puntos |
| 3 | `participants` | Catálogo de clubes + selección de plantel (división) por club |
| — | `advanced` | `PhaseCreator` completo (cuando la plantilla es personalizada) |

Defaults de puntaje por deporte vienen de `sportDefaults` (ej. fútbol
3/1/0, rugby 4/2/0). El borrador del wizard se autoguarda en `localStorage`
bajo `g22.tournament.create.draft.v1` y se limpia al éxito.

### 3.3 Persistencia (`handleCreate`)

1. **Crea el torneo** vía `createEntitySafe('tournament', payload)`:
   - `slug = slugify(nombre)-{timestamp}`
   - `status = 'published'` si visibilidad pública, sino `'draft'`
   - `ruleset` incluye `competition` derivado del formato
2. **Persiste participantes**: `POST /api/tournaments/{id}/participants` por
   cada club seleccionado. Si un club tiene >1 plantel y no se eligió cuál,
   **se bloquea con error** (no se puede ambiguar el plantel).
3. **Fase inicial (opcional, no bloqueante)**: intenta `saveQuickPhase()`.
   Si no hay participantes o el formato (playoff) exige ≥2 equipos, el torneo
   **igual queda creado** y se avisa por `alert` que la fase quedó pendiente
   para completarse en el gestor.
4. Invalida cache de listado y **redirige a `/admin/torneo/torneos`**.

> Diseño deliberado: la creación nunca se cae por sub-pasos parciales
> (temporada, participantes, fases, membership). Junta *warnings* y los
> muestra; el torneo se completa después en el gestor.

---

## 4. Listado y acciones rápidas ("Mis torneos")

Archivo: [`torneos/page.tsx`](../src/app/admin/torneo/torneos/page.tsx).
Carga `/api/admin/torneo/tournaments` (ya filtrado por scope) y
`/api/admin/torneo/clubs`.

Acciones por tarjeta de torneo:

| Acción | Efecto |
|---|---|
| **Abrir en gestor** | Navega a `/admin/entities/{id}/manage?type=tournament&tab=estructura` (gestión profunda) |
| **Clubes** | Panel inline: vincular/desvincular clubes participantes (`POST`/`DELETE .../participants`) |
| **Publicar / Despublicar** | `PATCH /api/admin/torneo/tournaments/{id}` con `status` + `is_visible` |
| **Eliminar** | `DELETE` con confirmación |
| **Solicitar acceso a otros torneos** | Modal → `POST /api/admin/torneo/tournaments/access-request` (notifica al Super Admin) |

Estados visibles: `draft` (Borrador), `published`/`active` (Publicado),
`archived` (Archivado).

---

## 5. Gestión / edición profunda — el "gestor"

### 5.1 Estructura del shell

Ruta única: [`/admin/entities/[id]/manage`](../src/app/admin/entities/[id]/manage/page.tsx).
Para `type=tournament` renderiza
[`TournamentManageShell`](../src/components/admin/entities/tournament/TournamentManageShell.tsx)
con pestañas de [`TournamentTabs`](../src/components/admin/entities/tournament/TournamentTabs.tsx).

La page server-side resuelve la entidad (`resolveEntity`), construye la
navegación de temporadas (familia por slug + relaciones explícitas) y arma
`shellData`. Maneja alias de tabs legacy (`overview→resumen`,
`fixture/tabla/estadisticas→operacion`, etc.).

### 5.2 Pestañas

| Pestaña | Componente | Qué gestiona |
|---|---|---|
| **Resumen** | `TournamentSummaryTab` | Estado general, salud, sidebar de acciones |
| **Detalles** | `TournamentDetailsTab` | Identidad: nombre, slug, temporada, deporte, unión, país, logo, `ruleset` |
| **Formato** | `TournamentFormatTab` | Puntaje, eventos de partido (`ruleset.matchEvents`), reglas deportivas |
| **Estructura** | `TournamentStructureTab` | Fases, zonas, modelo competitivo, fixture, constructor de playoff |
| **Participantes** | `TournamentParticipantsTab` | Altas/bajas, filtros, planteles |
| **Operación** | `TournamentOperationTab` | Fixture, resultados, tabla, sincronización (ESPN/FlashScore). Subtabs: `fixture`, `tabla`, `estadisticas`, `sincronizacion` |
| **Relacionados** | `TournamentRelatedTab` | Cruces y torneos vinculados (familia de temporadas) |
| **Publicación** | `TournamentPublishTab` | Estado, visibilidad, destacados |
| **Auditoría** | `AuditSection` | Bitácora inmutable de mutaciones |

### 5.3 Mecánica de edición

- **Sistema de borradores** (`TournamentDraftProvider`): cada sección
  (`details`, `format`, `structure`) marca su estado *dirty* de forma
  independiente; las pestañas muestran un punto verde si hay cambios sin
  guardar y un pulso al guardar.
- **Guardar**: botón único + atajo `Ctrl/Cmd+S`. `handleSave` arma el
  `payload` combinando **solo las secciones sucias** y llama
  `updateEntity('tournament', id, updates)`. El logo se persiste con
  `persistTournamentLogo`.
- **Estructura es especial**: tiene sus propios botones de guardado (modelo
  competitivo, wizard de fases). El shell **no la persiste** y lo avisa
  explícitamente si esa es la única sección sucia.
- **Protección de salida**: handler `beforeunload` advierte si se sale con
  cambios sin guardar.
- **Transición de estado**: ciclo
  `draft → published → active → archived → draft`, ajustando `is_visible`
  según el estado destino.
- **Acciones del header**:
  - *Recalcular tabla*: `POST /api/admin/tournaments/{id}/standings/recalculate`
    sobre la fase activa (o la primera).
  - *Duplicar* (`duplicateTournament`) → abre la copia.
  - *Exportar* JSON del torneo.
  - *Eliminar* (irreversible, con doble confirmación).
  - *Selector de temporadas*: navega entre torneos de la misma familia
    (slug/relaciones) preservando o descartando borradores.

---

## 6. Resto de secciones del panel

| Sección | Archivo | Función |
|---|---|---|
| **Importar Excel** | [`importar/page.tsx`](../src/app/admin/torneo/importar/page.tsx) | Importación determinística de torneos/fixtures (`src/lib/tournamentImport/`, interpret + commit) |
| **Equipos / Plantel** | [`equipos/`](../src/app/admin/torneo/equipos/) | Plantel fijo por torneo (config `ruleset.fixedRoster`, derive-on-read en lineups) |
| **Editar partidos** | [`partidos/page.tsx`](../src/app/admin/torneo/partidos/page.tsx) | Edición de partidos *scoped al torneo* del partido (no blanket por rol) |
| **Clubes** | [`clubes/`](../src/app/admin/torneo/clubes/) | CRUD de clubes accesibles según scope |
| **Usuarios** | [`usuarios/page.tsx`](../src/app/admin/torneo/usuarios/page.tsx) | Gestión de usuarios dentro del scope |

---

## 7. APIs relevantes

| Endpoint | Uso |
|---|---|
| `POST /api/tournaments/{id}/participants` | Vincular club/plantel al torneo |
| `GET /api/tournaments/{id}/phases` | Listar fases (usado al recalcular) |
| `POST /api/admin/tournaments/{id}/standings/recalculate` | Recalcular tabla de una fase |
| `GET/PATCH/DELETE /api/admin/torneo/tournaments/{id}` | Listado y acciones del panel gestor |
| `POST /api/admin/torneo/tournaments/access-request` | Solicitar acceso a torneos ajenos |
| `.../tournaments/{id}/playoff` | Constructor de bracket de playoff |
| `.../tournaments/{id}/external/{espn,flashscore}/*` | Sincronización externa |

---

## 8. Resumen de garantías de diseño

1. **Aislamiento por scope**: un gestor nunca ve ni toca torneos/clubes fuera
   de su alcance; la cascada mantiene clubes en sync sin intervención.
2. **Creación tolerante a fallos**: el torneo se crea aunque participantes o
   fase inicial queden pendientes; se avisa y se completa en el gestor.
3. **Borradores por sección**: edición granular con indicadores visuales y
   protección ante pérdida de cambios.
4. **Reutilización**: el wizard de creación es el mismo del Super Admin,
   parametrizado por `navigationMode`; reduce divergencia de comportamiento.

---

*Fuentes: código en `src/app/admin/torneo/`, `src/components/admin/entities/tournament/`,
`src/lib/auth/tournamentAdminScope.ts`, `src/app/admin/entities/[id]/manage/page.tsx`,
`src/app/admin/super/torneos/crear/page.tsx`.*
