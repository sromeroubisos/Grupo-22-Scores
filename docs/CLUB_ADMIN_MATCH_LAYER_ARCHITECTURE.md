# Club Admin Match Layer Architecture

## Objetivo

Definir como extender el ecosistema publico de G22 Scores con una capa operativa privada para clubes, sin duplicar partidos ni separar dos fuentes de verdad.

La regla central es:

- `public.matches` sigue siendo el nucleo canonico del partido.
- Club Admin agrega una capa privada de trabajo sobre ese mismo partido.
- Si un club necesita crear un amistoso o un partido todavia no publicado, ese partido tambien nace en `public.matches`, pero con metadata de origen y visibilidad privada.

Esto evita:

- dos tablas paralelas para el mismo concepto
- IDs duplicados para un mismo partido
- sync fragil entre "partido publico" y "partido interno"

---

## Encaje con el schema actual

El repo ya tiene estas piezas reutilizables:

- `public.matches` como entidad central del fixture
- `public.club_divisions` y `public.matches.home_division_id/away_division_id`
- `public.club_teams` como capa moderna de equipos/planteles
- `public.team_memberships` para personas por equipo
- `public.people` y `public.club_person_roles`
- `public.club_users` y helpers RLS para permisos de club

Entonces no conviene crear una segunda tabla de partidos del club. Conviene agregar:

1. metadata de origen/publicacion al match canonico
2. workspaces privados por club sobre `matches.id`
3. tablas hijas para convocatoria, disponibilidad, notas, stats y reportes
4. una capa de contenido/export para convertir operacion en media y revenue

---

## Decision de arquitectura

### 1. Match canonico

`public.matches` representa el partido base, sea:

- oficial de G22
- creado por un club
- candidato a publicacion

### 2. Workspace privado por club

Cada club que participa en un match puede tener su propio contexto operativo privado.

Ejemplo:

- un mismo `matches.id` puede tener un workspace para el club local
- y otro workspace para el club visitante

Cada workspace controla:

- convocatoria
- disponibilidad
- lineup
- observaciones
- stats internas
- reportes de staff
- adjuntos

### 3. Match creado por club

Cuando el partido no existe todavia en G22:

- se crea igual en `public.matches`
- pero con `source_type = 'club'`
- y `publication_status = 'private'` o `pending_sync`

Si luego G22 lo adopta:

- se promueve el mismo row a oficial
- o, si ya se creo un row oficial aparte, se fusiona y los workspaces migran al canonico

---

## Cambios propuestos en `public.matches`

Agregar columnas para soportar origen, publicacion y conciliacion.

Decision fina:

- no guardar `visibility_scope` e `internal_only` como columnas canonicas
- dejar que la visibilidad se derive desde `publication_status`
- usar menos estados para reducir conflictos logicos

Ejemplo de conflicto que queremos evitar:

- `visibility_scope = 'public'`
- `publication_status = 'private'`
- `internal_only = true`

Eso es una fuente innecesaria de bugs. La recomendacion final es:

- `source_type` define de donde vino el match
- `publication_status` define si es publico, privado, pendiente o fusionado

```sql
ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'g22'
        CHECK (source_type IN ('g22', 'club', 'hybrid')),
    ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'official'
        CHECK (publication_status IN ('official', 'private', 'pending_sync', 'merged', 'archived')),
    ADD COLUMN IF NOT EXISTS origin_club_id TEXT NULL REFERENCES public.clubs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS canonical_match_id UUID NULL REFERENCES public.matches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sync_confidence NUMERIC(5,2) NULL,
    ADD COLUMN IF NOT EXISTS source_reference JSONB NOT NULL DEFAULT '{}'::jsonb;
```

### Semantica de columnas

- `source_type`
  - `g22`: creado desde el sistema oficial
  - `club`: creado por un club
  - `hybrid`: partido originado por club y luego consolidado con G22

- `publication_status`
  - `official`: partido oficial activo
  - `private`: solo interno
  - `pending_sync`: candidato a sincronizacion
  - `merged`: absorbido por otro row canonico
  - `archived`: descartado o cerrado

- `origin_club_id`
  - club que creo el partido si nacio desde Club Admin

- `canonical_match_id`
  - si un row fue absorbido por otro, apunta al match canonico

- `source_reference`
  - metadata externa o de sync, por ejemplo:
  - `{"provider":"flashscore","external_match_id":"fs_123","created_by":"club_admin"}`

### Visibilidad derivada

- `official` => publico
- `private` => solo club
- `pending_sync` => interno pero visible para revision/operacion
- `merged` => no operativo, redirige al canonico
- `archived` => fuera de operacion

### Regla operativa

- para partidos oficiales existentes: `source_type='g22'`, `publication_status='official'`
- para amistosos internos: `source_type='club'`, `publication_status='private'`
- para partidos creados por club que luego pasan a G22: `source_type='hybrid'`

---

## Nueva tabla: `club_match_workspaces`

Esta es la pieza central de la capa privada.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    team_id UUID NULL REFERENCES public.club_teams(id) ON DELETE SET NULL,
    division_id UUID NULL REFERENCES public.club_divisions(id) ON DELETE SET NULL,
    scope_key TEXT NOT NULL DEFAULT 'club:default',
    workspace_status TEXT NOT NULL DEFAULT 'active'
        CHECK (workspace_status IN ('active', 'draft', 'closed', 'archived')),
    sync_status TEXT NOT NULL DEFAULT 'linked'
        CHECK (sync_status IN ('unlinked', 'suggested_match', 'linked', 'merged')),
    role_in_match TEXT NULL
        CHECK (role_in_match IN ('home', 'away', 'observer', 'neutral')),
    visibility TEXT NOT NULL DEFAULT 'club'
        CHECK (visibility IN ('club', 'staff', 'team')),
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    last_activity_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_match_workspaces_unique UNIQUE (match_id, club_id, scope_key)
);
```

### Por que `scope_key`

Un `UNIQUE (match_id, club_id)` se queda corto si mas adelante necesitás:

- M16 A
- M16 B
- Intermedia
- Primera

`scope_key` evita edge cases de `NULL` en uniques y deja espacio para modelos como:

- `club:default`
- `team:<team_id>`
- `division:<division_id>`
- `observer:rival`

### Que resuelve

- permite una capa privada por club sobre el mismo match
- evita duplicar el partido solo para guardar datos internos
- soporta local y visitante con contextos separados
- soporta multiples contextos internos por club cuando haga falta
- soporta clubes observadores para scouting si hiciera falta

---

## Tablas hijas recomendadas

No hace falta implementar todo de una. El orden sugerido es por valor operativo.

### 1. `club_match_availability`

Disponibilidad previa del plantel.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    team_membership_id UUID NULL REFERENCES public.team_memberships(id) ON DELETE SET NULL,
    availability_status TEXT NOT NULL
        CHECK (availability_status IN ('available', 'doubtful', 'injured', 'unavailable', 'pending')),
    response_source TEXT NOT NULL DEFAULT 'staff'
        CHECK (response_source IN ('staff', 'player', 'system')),
    notes TEXT NULL,
    updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_match_availability_unique UNIQUE (workspace_id, person_id)
);
```

### 2. `club_match_callups`

Lista convocada para el partido.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_callups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    team_membership_id UUID NULL REFERENCES public.team_memberships(id) ON DELETE SET NULL,
    callup_status TEXT NOT NULL
        CHECK (callup_status IN ('called_up', 'confirmed', 'declined', 'reserve', 'cut')),
    squad_role TEXT NULL
        CHECK (squad_role IN ('starter', 'bench', 'reserve', 'staff')),
    jersey_number INTEGER NULL,
    sort_order INTEGER NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_match_callups_unique UNIQUE (workspace_id, person_id)
);
```

### 3. `club_match_lineups`

Formacion final y banco.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    team_membership_id UUID NULL REFERENCES public.team_memberships(id) ON DELETE SET NULL,
    lineup_role TEXT NOT NULL
        CHECK (lineup_role IN ('starter', 'bench', 'reserve', 'not_used')),
    field_position TEXT NULL,
    jersey_number INTEGER NULL,
    is_captain BOOLEAN NOT NULL DEFAULT FALSE,
    minute_in INTEGER NULL,
    minute_out INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_match_lineups_unique UNIQUE (workspace_id, person_id)
);
```

### 4. `club_match_notes`

Notas de prepartido, entretiempo y postpartido.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    note_type TEXT NOT NULL
        CHECK (note_type IN ('pre_match', 'half_time', 'post_match', 'analysis', 'medical', 'logistics')),
    visibility TEXT NOT NULL DEFAULT 'staff'
        CHECK (visibility IN ('club', 'staff', 'team')),
    title TEXT NULL,
    body TEXT NOT NULL,
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5. `club_match_player_stats`

Estadisticas internas por jugador.

Decision fina:

- usar modelo hibrido
- columnas clave para analytics y ranking
- `metrics JSONB` para flexibilidad por deporte, categoria o staff

```sql
CREATE TABLE IF NOT EXISTS public.club_match_player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    team_membership_id UUID NULL REFERENCES public.team_memberships(id) ON DELETE SET NULL,
    tries INTEGER NULL,
    tackles INTEGER NULL,
    meters INTEGER NULL,
    handling_errors INTEGER NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    rating NUMERIC(4,2) NULL,
    minutes_played INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_match_player_stats_unique UNIQUE (workspace_id, person_id)
);
```

### 6. `club_match_tactical_boards`

Modulo diferencial del producto.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_tactical_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    board_type TEXT NOT NULL DEFAULT 'match_plan'
        CHECK (board_type IN ('match_plan', 'set_piece', 'attack_shape', 'defense_shape', 'review')),
    board_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_url TEXT NULL,
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7. `club_match_reports`

Reporte final del staff.

```sql
CREATE TABLE IF NOT EXISTS public.club_match_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.club_match_workspaces(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL
        CHECK (report_type IN ('head_coach', 'assistant_coach', 'fitness', 'medical', 'manager', 'video')),
    summary TEXT NULL,
    report_body TEXT NOT NULL,
    next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Tabla de conciliacion sugerida

Para evitar duplicados cuando entra un match de G22 o cuando el club carga uno primero:

```sql
CREATE TABLE IF NOT EXISTS public.club_match_link_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    candidate_match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    suggested_for_club_id TEXT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    confidence_score NUMERIC(5,2) NOT NULL,
    match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    resolved_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL
);
```

### Reglas de matching

Calcular sugerencias por:

- fecha
- hora con tolerancia
- club local
- club visitante
- torneo
- `home_division_id` / `away_division_id`
- venue o pitch

### Umbrales sugeridos

- `>= 0.95`: autolink interno si no hay conflicto
- `0.75 - 0.94`: sugerencia a admin
- `< 0.75`: no sugerir

---

## Flujo operativo exacto

### Flujo A: partido oficial ya existente en G22

1. G22 crea o sincroniza el row en `public.matches`.
2. El sistema detecta que el club participa por `home_club_id` o `away_club_id`.
3. Se crea automaticamente `club_match_workspaces` para los clubes administrados que corresponden.
4. El club abre la ficha operativa y trabaja sobre el workspace.
5. El resultado publico sigue viviendo en `matches.score` y `matches.status`.
6. Las notas, convocatoria y stats privadas viven solo en tablas hijas del workspace.

### Flujo B: partido creado por el club

1. Club Admin crea un row en `public.matches`.
2. Se graba con:
   - `source_type='club'`
   - `publication_status='private'` o `pending_sync`
   - `origin_club_id=<club>`
3. Se crea su `club_match_workspace`.
4. El partido aparece en la vista "Partidos internos".

### Flujo C: luego aparece el partido oficial en G22

1. Entra un match oficial desde la sync central.
2. Se corre conciliacion contra matches `source_type='club'` abiertos.
3. Si hay alta confianza:
   - opcion preferida: promover el row existente
   - opcion fallback: fusionar rows
4. Todos los `club_match_workspaces` deben quedar apuntando al `match_id` canonico.
5. El row absorbido queda con:
   - `publication_status='merged'`
   - `canonical_match_id=<match oficial>`

---

## Regla de fusion

### Estrategia preferida: promotion in place

Si el partido creado por club todavia no fue publicado por G22, lo ideal es convertir ese mismo row en canonico:

- `source_type: club -> hybrid`
- `publication_status: pending_sync -> official`
- completar `tournament_id`, `round_id`, arbitraje, etc.

Ventaja:

- no se mueve ningun `workspace_id`
- no cambian FKs
- no hay reescritura masiva

### Estrategia fallback: merge into official row

Si el row oficial ya existe separado:

1. elegir un `matches.id` canonico
2. mover `club_match_workspaces.match_id` al canonico
3. mover tablas hijas por `workspace_id` si hiciera falta
4. marcar el row viejo como `merged`
5. registrar auditoria de merge

---

## Permisos y RLS

### Lectura publica

- `public.matches`
  - solo rows con `publication_status='official'`
  - rows privados no deben salir por endpoints publicos

### Gestion privada

- `club_match_workspaces` y tablas hijas
  - solo usuarios que puedan gestionar ese club
  - reutilizar `public.can_manage_club(club_id, ARRAY['admin','editor'])`

### Division admins

Si se quiere granularidad por division:

- permitir acceso si el usuario tiene scope sobre `division_id` o `team_id`
- o resolverlo por pertenencia a `club_users` + restricciones aplicativas

### Regla importante

Lo privado nunca se publica automaticamente en G22.

Campos publicables deben salir por accion explicita:

- formacion oficial
- figuras del partido
- notas editoriales
- highlights o assets

---

## Impacto en UI

La tab actual de partidos en Club Admin hoy consume `matches` como lectura central. Deberia evolucionar a:

### Vista 1: Partidos oficiales

- fuente: `public.matches`
 - filtro: club participa y `publication_status='official'`
 - muestra estado de workspace:
  - sin ficha
  - con convocatoria
  - con stats internas
  - con pizarron tactico
  - con reporte final

### Vista 2: Partidos internos

- fuente: `public.matches`
 - filtro: `origin_club_id=<club>` y `publication_status IN ('private','pending_sync')`

### Ficha Operativa de Partido

Unica ficha para ambos casos, armada sobre `club_match_workspaces`.

Bloques sugeridos:

1. informacion base
2. convocatoria
3. disponibilidad
4. lineup
5. notas
 6. estadisticas
 7. pizarron
 8. rendimiento fisico
 9. reporte final

---

## Integracion con Content Engine

La capa operativa no deberia terminar en guardado interno. Tiene que alimentar el motor de contenido de G22.

### Activos que deberian salir desde la ficha

- convocatoria grafica
- formacion oficial
- resultado final sponsor-ready
- jugador destacado
- resumen de stats
- story rapida de proximo partido

### Regla de negocio

Lo operativo genera borradores de contenido.

La publicacion a canales publicos debe ser explicita y auditada.

### Modelo sugerido

Sin bloquear el MVP con mas tablas, alcanza con que cada workspace pueda generar payloads exportables:

- `content_exports.formacion`
- `content_exports.convocatoria`
- `content_exports.resultado`
- `content_exports.destacado`

Eso puede vivir primero en `metadata` del workspace o en una tabla dedicada posterior.

---

## Orden de implementacion recomendado

### Fase 1: foundation

- agregar metadata a `public.matches`
- crear `club_match_workspaces`
- crear endpoint para auto-crear workspace sobre partidos oficiales
- mostrar badges de origen en Club Admin
- exponer badge de estado operativo y badge de contenido

### Fase 2: operacion minima viable

- `club_match_availability`
- `club_match_callups`
- `club_match_lineups`
- nueva Ficha Operativa de Partido

### Fase 3: analisis interno

- `club_match_notes`
- `club_match_player_stats`
- `club_match_tactical_boards`
- `club_match_reports`

### Fase 4: conciliacion y merge

- `club_match_link_suggestions`
- job de dedupe
- UI de aprobar/rechazar vinculacion

### Fase 5: contenido y monetizacion

- export social desde la ficha
- sponsor slots por pieza
- featured player y resumen de partido
- salida a G22 Studio

---

## Decision final recomendada

La arquitectura correcta para este repo es:

- no duplicar partidos
- usar `public.matches` como fuente canonica
- permitir que Club Admin origine partidos dentro de `matches`
- montar la operacion privada en `club_match_workspaces`
- fusionar por conciliacion cuando aparezca el oficial

En una frase:

`matches` define el partido; `club_match_workspaces` define como trabaja cada club sobre ese partido.
