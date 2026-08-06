# Plan de carga URBA → G22

Carga en seis etapas, cada una con su verificación y su rollback. **Nada de esto
corre solo**: cada etapa se ejecuta a mano, se verifica, y recién ahí se pasa a la
siguiente. Si la etapa 1 sale mal, se revierte con 96 filas adentro y no con 1.012.

Requisitos previos:

1. `supabase/migrations/20260804140000_club_external_ids.sql` — **ya aplicada** (la
   tabla está en la base con 0 filas).
2. `supabase/migrations/20260804150000_club_external_ids_format_check.sql` —
   **ya aplicada** (verificado 2026-08-05: la restricción
   `club_external_ids_urba_format_check` existe con la definición correcta y
   rechaza `'30|mayores'` con error 23514, antes que la FK). Agrega el CHECK de
   formato sobre `external_id`. Va aparte porque el `CREATE TABLE IF NOT EXISTS`
   de la primera no vuelve a correr.

Las dos se aplicaron **a mano**, como las 52 anteriores: van a necesitar su
`supabase migration repair --status applied` cuando se repare el historial.
Ver `HANDOFF_MIGRACIONES.md`.

### Paso previo — ocultar `cuq-femenino`

Decisión tomada: la distinción masculino/femenino vive en el torneo, así que el
registro aparte no hace falta. Se oculta, **no se borra**. Es independiente de las
seis etapas y se puede correr antes o después.

```sql
UPDATE public.clubs SET is_visible = FALSE WHERE id = 'cuq-femenino';
```

Verificación — tiene que seguir existiendo, vacío y oculto:

```sql
SELECT id, name, is_visible FROM public.clubs WHERE id = 'cuq-femenino';
-- esperado: 1 fila, is_visible = false
```

Rollback: `UPDATE public.clubs SET is_visible = TRUE WHERE id = 'cuq-femenino';`

Los CSV se cargan primero a tablas de staging y de ahí a las tablas reales. Eso
permite verificar antes de tocar `clubs`, y da una fuente exacta para el rollback.
Los archivos vienen sin BOM y con las comillas escapadas al estilo CSV estándar.

> **Por qué los campos de texto vacíos vienen como `""`.** `COPY ... CSV` lee un
> campo vacío *sin comillas* como NULL. El sufijo vacío no es un faltante: es el
> dato "URBA no informa letra para este equipo", y tiene que llegar como string
> vacío. Entrecomillado, Postgres lo distingue de NULL sin opciones extra. Las
> columnas numéricas sí traen el vacío sin comillas, porque en una columna INTEGER
> `""` es un error de sintaxis. Los `INSERT` de abajo llevan igual un
> `COALESCE(sufijo, '')` como segunda barrera.

---

## Etapa 0 — Staging (no toca ninguna tabla real)

```sql
BEGIN;

CREATE TABLE stg_urba_vinculaciones (
  provider TEXT, external_id TEXT, club_id TEXT, urba_club_id INTEGER,
  categoria TEXT, sufijo TEXT, confidence TEXT, nivel TEXT,
  urba_institucion TEXT, urba_nombre_equipo TEXT, g22_nombre TEXT, g22_union TEXT,
  anios TEXT, veces INTEGER
);

CREATE TABLE stg_urba_altas (
  prioridad INTEGER, tipo TEXT, urba_club_id INTEGER, nombre TEXT,
  categoria TEXT, sufijo TEXT, union_id TEXT, sport TEXT, logo_url TEXT,
  id_sugerido TEXT, institucion_padre_urba_id INTEGER, anios TEXT, veces INTEGER, motivo TEXT
);

CREATE TABLE stg_urba_mapeo_pendiente (
  provider TEXT, external_id TEXT, club_id_sugerido TEXT, urba_club_id INTEGER,
  categoria TEXT, sufijo TEXT, confidence TEXT, nivel TEXT, etapa_que_lo_crea INTEGER,
  urba_institucion TEXT, urba_nombre_equipo TEXT, anios TEXT, veces INTEGER
);

COMMIT;
```

Carga desde psql (el orden de columnas del CSV coincide con el de la tabla, así que
no hace falta lista de columnas ni transformación):

```bash
psql "$DATABASE_URL" \
  -c "\copy stg_urba_vinculaciones   FROM 'vinculaciones.csv'            CSV HEADER" \
  -c "\copy stg_urba_altas           FROM 'altas.csv'                    CSV HEADER" \
  -c "\copy stg_urba_mapeo_pendiente FROM 'mapeo-pendiente.csv'          CSV HEADER"
```

**Verificación 0**

```sql
SELECT 'vinculaciones' t, count(*) FROM stg_urba_vinculaciones
UNION ALL SELECT 'altas',            count(*) FROM stg_urba_altas
UNION ALL SELECT 'mapeo_pendiente',  count(*) FROM stg_urba_mapeo_pendiente;
-- esperado: 426 / 1012 / 1106
```

```sql
-- El external_id tiene que traer exactamente dos separadores en las 1.532 filas.
SELECT count(*) AS malformados FROM (
  SELECT external_id FROM stg_urba_vinculaciones
  UNION ALL SELECT external_id FROM stg_urba_mapeo_pendiente
) x WHERE array_length(string_to_array(external_id, '|'), 1) <> 3;
-- esperado: 0

-- El triple desnormalizado tiene que coincidir con el que va adentro del external_id.
SELECT count(*) AS incoherentes FROM (
  SELECT external_id, urba_club_id, categoria, sufijo FROM stg_urba_vinculaciones
  UNION ALL SELECT external_id, urba_club_id, categoria, sufijo FROM stg_urba_mapeo_pendiente
) x WHERE external_id <> urba_club_id || '|' || categoria || '|' || COALESCE(sufijo, '');
-- esperado: 0
```

**Rollback 0:** `DROP TABLE stg_urba_vinculaciones, stg_urba_altas, stg_urba_mapeo_pendiente;`

---

## Etapa 1 — 96 instituciones nuevas

```sql
BEGIN;

INSERT INTO public.clubs (id, name, short_name, slug, union_id, sport, sport_id, logo_url, is_visible)
SELECT id_sugerido, nombre, nombre, id_sugerido, 'urba', 'rugby', 'rugby', logo_url, FALSE
FROM stg_urba_altas
WHERE prioridad = 1;

COMMIT;
```

> **Entran ocultos (`is_visible = FALSE`).** Hasta que corra la sync de partidos son
> clubes vacíos, y 96 fantasmas en la pantalla pública de clubes es peor que
> esperar. Se prenden al final, en la etapa 6, y sólo los que tengan datos.
>
> `short_name` queda igual a `name` a propósito: es un campo de presentación que
> conviene curar a mano después, y dejarlo NULL rompe los fallbacks de la UI.

**Verificación 1**

```sql
-- a) entraron las 96
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 1;
-- esperado: 96

-- b) ninguna quedó sin unión (era el objetivo: no engordar el contador)
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 1
WHERE c.union_id IS DISTINCT FROM 'urba';
-- esperado: 0

-- c) ninguna pisó un club existente (si esto no da 96, algo se sobrescribió)
SELECT count(*) FROM public.clubs WHERE union_id = 'urba';
-- esperado: 154 + 96 = 250

-- d) todas con logo
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 1
WHERE c.logo_url IS NULL OR c.logo_url = '';
-- esperado: 0

-- d2) NINGUNA visible todavía (si esto no da 96, se filtraron fantasmas al público)
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 1
WHERE c.is_visible = FALSE;
-- esperado: 96

-- e) a ojo: las dos que salieron de una decisión tuya
SELECT id, name, union_id, logo_url FROM public.clubs
WHERE id IN ('atletico-san-andres', 'tiro-federal-de-baradero');
```

**Rollback 1**

```sql
DELETE FROM public.clubs
WHERE id IN (SELECT id_sugerido FROM stg_urba_altas WHERE prioridad = 1);
```

> Si alguna ya tiene partidos colgando, el `DELETE` falla por FK en vez de borrar
> en cascada. Eso es deseable: significa que el rollback llegó tarde y hay que
> mirar qué se cargó encima antes de seguir.
>
> **Verificado en la base (2026-08-05):** de las 49 FKs que apuntan a `clubs`, 40
> son `ON DELETE CASCADE`, pero las que importan **no** cascadean —`matches`
> (home, away, created_by), `people`, `match_events`, `player_stats`,
> `user_notifications`, `tournaments.created_by_club_id` y
> `tournament_seasons.champion_club_id`—. La red existe.
>
> **`club_external_ids` SÍ cascadea, y eso ordena el rollback.** Borrar un club de
> la etapa 1 se lleva puestas sus filas de mapeo. O sea: el rollback 1 es seguro
> *inmediatamente*, pero una vez corridas las etapas 2 a 5 hay que **deshacer en
> orden inverso** —5, 4, 3, 2 y recién ahí 1—. Si se corre el rollback 1 solo, el
> mapeo desaparece sin que ningún error lo diga, y el conteo de la Verificación 5a
> deja de cerrar. Las filas se regeneran desde el CSV, pero hay que saber que se
> fueron.

---

## Etapa 2 — 426 vinculaciones (clubes que ya existían)

```sql
BEGIN;

INSERT INTO public.club_external_ids
  (provider, external_id, club_id, urba_club_id, categoria, sufijo, confidence)
SELECT provider, external_id, club_id, urba_club_id, categoria, COALESCE(sufijo, ''), confidence
FROM stg_urba_vinculaciones;

COMMIT;
```

**Verificación 2**

```sql
-- a) entraron las 426
SELECT count(*) FROM public.club_external_ids WHERE provider = 'urba';
-- esperado: 426

-- b) TODAS resuelven contra un club real (si el FK está bien, esto es 0 por
--    construcción; se consulta igual para dejarlo asentado)
SELECT count(*) FROM public.club_external_ids m
LEFT JOIN public.clubs c ON c.id = m.club_id
WHERE m.provider = 'urba' AND c.id IS NULL;
-- esperado: 0

-- c) el caso que rompía el esquema viejo: GEBA tiene que tener sus 11 filas
SELECT external_id, club_id FROM public.club_external_ids
WHERE provider = 'urba' AND urba_club_id = 30 ORDER BY external_id;
-- esperado: 11 filas — 30|M17|A, 30|M17|B, 30|M19|A, 30|M19|B,
--           30|intermedia|, 30|mayores|, 30|mayores|C,
--           30|preintermedia|, 30|preintermedia|B, 30|preintermedia|C, 30|preintermedia|D

-- d) los clubes con más de una fila son la norma, no un error
SELECT club_id, count(*) n FROM public.club_external_ids
WHERE provider = 'urba' GROUP BY club_id HAVING count(*) > 1 ORDER BY n DESC LIMIT 5;
-- esperado: los-tilos 10, club-newman 10, cuba 9, la-plata 9, san-isidro-club 9,
--           asoc-alumni 8, geba 7 ... (los juveniles cuentan aparte: tienen su
--           propio club_id, geba-m17-a y compañía)

-- e) ida y vuelta: un club de URBA resuelto por su triple
SELECT c.name FROM public.club_external_ids m
JOIN public.clubs c ON c.id = m.club_id
WHERE m.provider = 'urba' AND m.external_id = '1|mayores|';
-- esperado: San Isidro Club
```

**Rollback 2**

```sql
DELETE FROM public.club_external_ids
WHERE provider = 'urba'
  AND external_id IN (SELECT external_id FROM stg_urba_vinculaciones);
```

---

## Etapa 3 — 743 equipos juveniles de clubes que ya existen

```sql
BEGIN;

INSERT INTO public.clubs (id, name, short_name, slug, union_id, sport, sport_id, logo_url, is_visible)
SELECT id_sugerido, nombre, nombre, id_sugerido, 'urba', 'rugby', 'rugby', logo_url, FALSE
FROM stg_urba_altas
WHERE prioridad = 2;

COMMIT;
```

**Verificación 3**

```sql
-- a) entraron las 743
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 2;
-- esperado: 743

-- b) la convención de nombre: con sufijo lleva comillas, sin sufijo no
SELECT count(*) FILTER (WHERE a.sufijo <> '' AND c.name NOT LIKE '%"_"') AS con_sufijo_mal,
       count(*) FILTER (WHERE a.sufijo =  '' AND c.name LIKE '%"%')      AS sin_sufijo_mal
FROM public.clubs c JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 2;
-- esperado: 0 / 0

-- c) ningún juvenil quedó sin su institución en el padrón
SELECT count(*) FROM stg_urba_altas a
WHERE a.prioridad = 2
  AND NOT EXISTS (SELECT 1 FROM public.club_external_ids m
                  WHERE m.provider = 'urba' AND m.urba_club_id = a.institucion_padre_urba_id);
-- esperado: 0

-- d) a ojo: que SIC no haya quedado como "San Isidro Club M19 ..."
SELECT id, name FROM public.clubs WHERE id LIKE 'sic-m%' ORDER BY id;
```

**Rollback 3**

```sql
DELETE FROM public.clubs
WHERE id IN (SELECT id_sugerido FROM stg_urba_altas WHERE prioridad = 2);
```

---

## Etapa 4 — 173 equipos juveniles de los clubes creados en la etapa 1

```sql
BEGIN;

INSERT INTO public.clubs (id, name, short_name, slug, union_id, sport, sport_id, logo_url, is_visible)
SELECT id_sugerido, nombre, nombre, id_sugerido, 'urba', 'rugby', 'rugby', logo_url, FALSE
FROM stg_urba_altas
WHERE prioridad = 3;

COMMIT;
```

**Verificación 4**

```sql
-- a) entraron las 173
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id AND a.prioridad = 3;
-- esperado: 173

-- b) su institución padre existe (la creó la etapa 1)
SELECT count(*) FROM stg_urba_altas a
WHERE a.prioridad = 3
  AND NOT EXISTS (SELECT 1 FROM stg_urba_altas i
                  JOIN public.clubs c ON c.id = i.id_sugerido
                  WHERE i.prioridad = 1 AND i.urba_club_id = a.institucion_padre_urba_id);
-- esperado: 0

-- c) total de clubes de URBA después de las tres altas
SELECT count(*) FROM public.clubs WHERE union_id = 'urba';
-- esperado: 154 + 96 + 743 + 173 = 1166
```

**Rollback 4**

```sql
DELETE FROM public.clubs
WHERE id IN (SELECT id_sugerido FROM stg_urba_altas WHERE prioridad = 3);
```

---

## Etapa 5 — 1.106 filas de mapeo de todo lo recién creado

Sin esta etapa la sync sólo puede resolver los 426 equipos que ya existían: los
1.106 clubes creados en las etapas 1, 3 y 4 quedarían sin identidad externa y sus
partidos no encontrarían a nadie.

```sql
BEGIN;

INSERT INTO public.club_external_ids
  (provider, external_id, club_id, urba_club_id, categoria, sufijo, confidence)
SELECT p.provider, p.external_id, p.club_id_sugerido, p.urba_club_id, p.categoria, COALESCE(p.sufijo, ''), p.confidence
FROM stg_urba_mapeo_pendiente p
JOIN public.clubs c ON c.id = p.club_id_sugerido;   -- el JOIN es el filtro: si el club no se creó, no se mapea

COMMIT;
```

**Verificación 5**

```sql
-- a) entraron las 1.106 (si da menos, algún club de las etapas 1/3/4 no se creó)
SELECT count(*) FROM public.club_external_ids WHERE provider = 'urba';
-- esperado: 426 + 1106 = 1532

-- b) qué quedó sin mapear, si algo quedó
SELECT p.etapa_que_lo_crea, count(*) FROM stg_urba_mapeo_pendiente p
LEFT JOIN public.clubs c ON c.id = p.club_id_sugerido
WHERE c.id IS NULL GROUP BY 1;
-- esperado: 0 filas

-- c) el universo completo: un external_id por cada equipo distinto de URBA
SELECT count(DISTINCT external_id) FROM public.club_external_ids WHERE provider = 'urba';
-- esperado: 1532

-- d) por categoría, contra el inventario
SELECT categoria, count(*) FROM public.club_external_ids
WHERE provider = 'urba' GROUP BY categoria ORDER BY 2 DESC;
-- esperado: M19 228, preintermedia 205, M16 197, M17 190, M15 186,
--           M18 128, mayores 103, intermedia 91, M20 65, femenino 40,
--           empresarial 35, formativo 29, universitario 20, M22 15
```

**Rollback 5**

```sql
DELETE FROM public.club_external_ids
WHERE provider = 'urba'
  AND external_id IN (SELECT external_id FROM stg_urba_mapeo_pendiente);
```

---

## Etapa 6 — hacer visibles sólo los que tienen partidos

Los 1.012 clubes entraron ocultos. Esta etapa los prende, **y sólo a los que ya
tienen datos**: un club sin un solo partido en el feed sigue siendo un fantasma,
lo haya creado esta carga o no.

Correr **después** de la primera sync de partidos, no antes: si se corre ahora
no va a prender nada, porque todavía no hay un solo partido cargado.

```sql
BEGIN;

UPDATE public.clubs c
SET is_visible = TRUE
WHERE c.id IN (SELECT id_sugerido FROM stg_urba_altas)
  AND c.is_visible = FALSE
  AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.home_club_id = c.id OR m.away_club_id = c.id
  );

COMMIT;
```

**Verificación 6**

```sql
-- a) cuántos se prendieron y cuántos siguen ocultos
SELECT c.is_visible, count(*)
FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id
GROUP BY 1;

-- b) NINGUNO visible sin partidos (esto es lo que la etapa promete)
SELECT count(*) FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id
WHERE c.is_visible = TRUE
  AND NOT EXISTS (SELECT 1 FROM public.matches m
                  WHERE m.home_club_id = c.id OR m.away_club_id = c.id);
-- esperado: 0

-- c) los que quedan ocultos, para revisarlos a ojo: ¿es que URBA no publicó
--    partidos suyos, o es que el mapeo no resolvió?
SELECT c.id, c.name, a.categoria, a.sufijo, a.veces AS apariciones_en_urba
FROM public.clubs c
JOIN stg_urba_altas a ON a.id_sugerido = c.id
WHERE c.is_visible = FALSE
ORDER BY a.veces DESC
LIMIT 50;
```

**Rollback 6**

```sql
UPDATE public.clubs SET is_visible = FALSE
WHERE id IN (SELECT id_sugerido FROM stg_urba_altas);
```

> Esta es la única etapa que conviene repetir: cada vez que la sync traiga
> partidos nuevos, volver a correrla prende a los que recién ahora tienen datos.
> Es idempotente — el `AND c.is_visible = FALSE` la hace barata en las repeticiones.

---

## Cierre

Una vez verificada la etapa 5:

```sql
DROP TABLE stg_urba_vinculaciones, stg_urba_altas, stg_urba_mapeo_pendiente;
```

**Rollback total** (deshace las seis etapas), sólo mientras las tablas de staging
sigan vivas y antes de que se cargue cualquier partido:

```sql
BEGIN;
DELETE FROM public.club_external_ids WHERE provider = 'urba';
DELETE FROM public.clubs WHERE id IN (SELECT id_sugerido FROM stg_urba_altas);
COMMIT;
```
