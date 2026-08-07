# URBA — carga histórica y navegación por división

Bitácora de la sesión. Continúa [BITACORA_URBA_Y_AUDITORIA_DB.md](BITACORA_URBA_Y_AUDITORIA_DB.md),
que cerró con los 134 torneos de 2026 cargados y el conector sin ejecutar sobre
el histórico.

**Nada de esto está commiteado.** Todo el trabajo de URBA —incluido el conector
de la sesión anterior— vive en el árbol de trabajo. Ver *Lo que falta*.

---

## Estado de la base al cerrar

| | antes | ahora |
|---|---:|---:|
| `tournaments` de URBA | 134 | **811** |
| — publicados (`is_active`) | 0 | **134** (todo 2026) |
| — con el escudo de URBA | 8 (base64) | **811** (ruta) |
| `matches` de URBA | 10.917 | **52.258** |
| — visibles | 10.917 | 10.917 (sólo 2026) |
| `tournament_phases` de URBA | 135 | **812** |
| `tournament_participants` de URBA | 1.567 | **8.440** |
| `club_external_ids` de URBA | 1.539 | **1.541** |

Por temporada: 2021 · 141 · 2022 · 141 · 2023 · 127 · 2024 · 127 · 2025 · 141 ·
2026 · 134.

---

## Dos cosas del estado inicial salieron distintas

**Las fases de 2026 ya estaban.** El pedido decía que los 126 se habían cargado
sin fase. En realidad alguien ya había backfilleado: 134 fases `Fase Regular` con
marca `editor_source: 'urba_backfill'` y los 10.917 partidos con `phase_id`. Sirvió
de plantilla exacta para el histórico.

**La política de RLS no filtra por `is_visible`.** Es
`USING (is_active = true)` —está en
[20260318001122_final_rls_recursion_fix.sql](supabase/migrations/20260318001122_final_rls_recursion_fix.sql)—
y varias migraciones más viejas declaran `USING (true)`, que no es lo que corre.
Medido con la anon key: había **148 torneos con `is_visible = true` que el
anónimo igual no veía**. Hay además una cuarta puerta que no es RLS: el feed del
home filtra los partidos por `tournament.status === 'published'` ESTRICTO, así que
`'active'` no pasa por ahí aunque `isPublicTournamentStatus` lo acepte.

> Para publicar un torneo hacen falta las tres: `is_visible`, `is_active` y
> `status = 'published'`.

---

## Parte 1 — La carga histórica 2021-2025

### La derivación se validó antes de usarla

`planTournamentRow` reproduce los 126 torneos que la carga de 2026 creó **sin una
sola diferencia** en `name`, `season_id`, `category`, `subcategory`, `age_grade`
y `gender`, más las 16 constantes. Los 8 restantes de 2026 no se derivan y no
deberían: ya existían en G22 y la carga los vinculó en vez de crearlos.

`legs` de la fase se deriva de cuántas veces se cruza el par que más se cruza en
el payload, no del nombre. Contra las 126 fases de 2026 acierta 125.

### Una regla que faltaba en `subcategoriaDeTorneoUrba`

Siete torneos de mayores no llevan grado en el nombre —`Segunda` a secas (2021),
`TOP 12 - Play Off`, `Primera A - Pre-Desarrollo`— y quedaban en `NULL`, o sea
fuera de la navegación. Una división de mayores sin grado en el nombre **es** la
Superior: la Intermedia y las Preintermedias sí lo llevan siempre.

Resultado: de los 677 históricos, **71 quedan en `NULL`** y las 71 son
competencias de un solo nivel (Femenino 25, Universitario 21, Empresarial 11,
Formativo 8, Desarrollo/Formativo 6). Cero fuera de esas familias.

### El hallazgo: el `club_id` 14 de URBA

La primera corrida en seco dio **0 clubes a crear**. Estaba mal, y el 0 era el
síntoma: URBA publicó los equipos de **San Andrés** con el `club_id` de **San
Albano** entre 2021 y 2023, y el triple entero se apoya en ese id.

Sin corregirlo, **553 partidos de San Andrés se cargaban como San Albano en
silencio**, y sólo 13 fallaban de forma visible.

Las cinco pruebas que fijan de qué lado está el error están en
[docs/urba-club-id-14.md](docs/urba-club-id-14.md). En corto: el id 31 no existe
antes de 2024; los dos nombres conviven en 13 torneos y juegan entre sí; el
`club` embebido del equipo dice "San Albano" mientras el equipo se llama "San
Andres"; y la continuidad de división es concluyente —San Albano en Primera A
los seis años, San Andrés en Primera B pasando del id 14 al 31 en 2024—.

El barrido de los 811 payloads: de los 153 `club_id` distintos, 44 aparecen con
más de un nombre y **43 son variantes de escritura del mismo club**
("Belgrano Athletic" / "Belgrano Athl."), inofensivas porque el nombre no entra
en el triple. **Queda uno solo.** Por eso `CLUB_ID_CORREGIDO` es una tabla de una
entrada y no una heurística.

**Reparación** ([urba-san-andres-fix.ts](src/scripts/urba-san-andres-fix.ts)),
con cero partidos y cero participantes colgando de lo que se tocó:

| operación | registros |
|---|---|
| renombrados | `san-albano-m19` · `san-albano-m20-a` · `san-albano-m20-b` → `san-andres-*` |
| retirado | `san-albano-m15-c` (duplicado: el correcto ya existía con 17 partidos) |
| creados | `san-andres-m15` · `san-andres-m18-a` · `san-andres-m18-b` |

Los tres creados son triples que usaron **los dos** clubes, así que San Albano
conserva el suyo.

### La corrida en seco, después de la reparación

| año | torneos | partidos | rango |
|---|---:|---:|---|
| 2021 | 141 | 3.876 | 17-07 a 08-12 |
| 2022 | 141 | 8.205 | 19-03 a 13-11 |
| 2023 | 127 | 8.664 | 18-03 a 12-11 |
| 2024 | 127 | 9.887 | 16-03 a 16-11 |
| 2025 | 141 | 10.709 | 15-03 a 22-11 |
| **total** | **677** | **41.341** | |

**0 triples sin mapeo · 0 partidos perdidos por club · 0 sin fecha · 0 estados
fuera del CHECK · 0 fechas fuera del año de su torneo · 0 `external_id`
colisionando.** Los 13 "mismo equipo de los dos lados" desaparecieron: ahora
resuelven a clubes distintos, que es lo que son. Queda 1 omitido, un
`equipo_ausente_en_el_torneo` de 2024.

### La ejecución

677 torneos · 677 fases · 41.341 partidos · 6.873 participantes.
**Cero tandas fallidas.** Cada torneo es una tanda y el orden adentro no es
negociable: torneo → fase → participantes → partidos, porque un partido sin
`phase_id` no entra en ninguna tabla y no falla nada.

Todo entró oculto por las tres puertas. Rollback en
`URBA_HISTORICO_ROLLBACK.sql`, cortado por `season_id IN ('2021'…'2025')` — no
toca 2026 ni por accidente.

---

## Parte 2 — La navegación

### El desplegable de grado

En mayores el grado es Superior / Intermedia / Preintermedia; **en juveniles es
el grupo y la zona**. Son la misma pregunta en distinto idioma y por eso las dos
terminan en `subcategory`.

Antes los 554 juveniles decían todos `'juvenil'`: el menú de una división llegaba
a repetir la palabra veintiocho veces. [`ejeJuvenil.ts`](src/lib/integrations/urba/ejeJuvenil.ts)
extrae componentes y los emite en orden canónico, porque conviven tres
convenciones de nombre y en 2024/2025 URBA invierte el orden de `Grupo` y `Nivel`:

```
2021-2023  Menores de 16 - Grupo 2 - Zona B - Segunda Rueda
2024-2025  Juveniles - Primera rueda - M16 - Grupo II - Nivel 1 - Zona B Equipos B
2026       Menores de 16 - Primera Rueda - G2 NIVEL 1 B Eq B
```

Más la normalización de la letra suelta: en 2026 URBA dejó de escribir "Zona", y
sin `G1 A` → `G1 Zona A` la competencia se parte en dos entre años.

**Un cambio de precedencia que no estaba previsto.** La rama de `Intermedia`
corría antes que la juvenil, así que `Menores de 19 - G2 Nivel 1 Intermedia`
salía como `'Intermedia'` a secas —la etiqueta de mayores— y `G1 Intermedia`,
`G2 Intermedia` y `G2 Nivel 1 Intermedia` colapsaban en un valor. Ahora la rama
juvenil va primero.

Backfill de 554 filas. Verificación:

| | objetivo | resultado |
|---|---|---|
| divisiones con desplegable útil | 73 | **73** |
| torneos sin eje derivable | 0 | **0** |
| valores distintos | 85 | **65** |

Los 65 no son un fallo: 85 era la medición *sin* normalizar la letra. La cadena:
85 (sin normalizar, contando 3 de M22 que no son juveniles) → 76 (normalizada) →
74 (sólo M15-M20) → **65**. Los 9 últimos son fusiones correctas que el módulo
hace mejor que la sonda de medición (`G2 Nivel 1 A Eq B` → `G2 Nivel 1 Zona A Eq B`
y `G1 Formativo A` → `G1 Formativa A`). Cero valores en la base que la sonda no
tuviera.

**La rueda: etiqueta secundaria, y sólo donde desambigua.** Hay 87 pares que
comparten eje y sólo se diferencian por la rueda; colisiones verdaderas —mismo
eje, misma rueda—: **cero**. Agruparlas bajo una entrada obligaba a elegir a cuál
de las dos llevar, y eso no tiene respuesta. Ponerla en todos los ítems
ensuciaría las 62 de 85 divisiones sin colisión.

### El desplegable de temporadas

La clave cruda `(category, subcategory, age_grade, gender)` no se sostiene, y la
causa no es el histórico sucio: **la máxima categoría de URBA cambia de nombre
con su tamaño** — Top 12 (2021, 2023-25), Top 13 (2022), Top 14 (2026). Es una
competencia y la clave la partía en tres.

[`competitionKey.ts`](src/lib/competitionKey.ts) colapsa `Top 12/13/14` a `Top`
—y sólo las que llevan el tamaño en el nombre; `Primera A` y `Primera B` siguen
separadas— y normaliza la grafía de `age_grade` y el `gender` en NULL. **No hace
falta una columna nueva**: el dato ya estaba, faltaba leerlo bien.

| sobre los 811 | crudo | con `competitionKey` |
|---|---:|---:|
| claves distintas | 79 | **60** |
| torneos sin temporadas para elegir | 92 (11%) | **54 (7%)** |
| de mayores | 40 (16%) | **7 (3%)** |

Los 8 torneos preexistentes se normalizaron (`category`, `age_grade`, `gender`);
el `name` editorial de G22 no se tocó.

### La implementación

- [`/api/tournaments/[id]/navegacion`](src/app/api/tournaments/[id]/navegacion/route.ts) —
  service-role, devuelve `id · name · subcategory · season_id` y nada más. Nunca
  partidos, nunca tabla. **La política de RLS no se tocó.**
- [`TournamentNavigation.tsx`](src/app/tournaments/[id]/TournamentNavigation.tsx) —
  montado en la cabecera. Devuelve `null` cuando no hay a dónde ir: sin
  contenedor, sin separador, sin control deshabilitado.
- [`tournamentNavigation.ts`](src/lib/tournamentNavigation.ts) — la lógica pura,
  21 tests.

### Intermedia y Preintermedia fuera de la portada

Son grados de una división, no competencias sueltas: sin filtrarlos el Top 14
ocupa ocho entradas del listado. `ocultarGradosSubordinados` los saca de la vista
general y de la de mayores, **pero no de la de juveniles/reserva**, que es adonde
pertenecen — `resolveTournamentAudience` los manda ahí.

```
listado general / mayores : 112
juveniles / reserva       : 121
torneos con menú de grado : 127 de 134
```

### Los 22 de reserva, publicados

El menú del Top 14 salía vacío: sus hermanos eran exactamente los 22 torneos
ocultos de 2026, y `fetchTournamentData` devuelve "not found" para
`is_visible = false` — listarlos habría dado 22 links muertos. Se publicaron con
las tres puertas.

---

## El logo

`src/img/Logo URBA.png` son 576 KB a 1080×1080. Como base64 en 811 filas serían
~227 MB, en la dirección opuesta a los últimos commits de performance.

Va como ruta: [`public/competiciones/ar-urba.png`](public/competiciones/ar-urba.png),
512×512, **36 KB**. Los 811 torneos lo tienen. Se pisaron los 8 que traían base64
propio: **1,8 MB liberados**, reponibles byte a byte desde el rollback.

**Trampa encontrada:** `normalizeUrl` no contemplaba rutas desde la raíz y
devolvía `https:///competiciones/ar-urba.png` — inválida, y sin error, sólo el
escudo roto. Por ahí pasa el `logo_url` de todo torneo y todo club vía
`normalizeLogoUrl`. Arreglado en [normalize.ts](src/lib/utils/normalize.ts), con
test; las URLs protocol-relative (`//cdn…`) siguen tratándose como dominio.

---

## El cron

**Era una constante.** [route.ts](src/app/api/cron/urba-sync/route.ts) tenía
`const ANIO = 2026`. El 1 de enero de 2027 habría dejado de ver la temporada
nueva, respondiendo `ok: true` con `torneosNuevos: []`, mientras los torneos de
2027 se acumulaban sin cargar.

Ahora sale del reloj en hora de Buenos Aires
([temporada.ts](src/lib/integrations/urba/temporada.ts)). La zona no es
decorativa: el servidor corre en UTC y a las 23:00 argentinas del 31 de diciembre
en UTC ya es enero. **Hay test para esa hora exacta.**

El alcance se acota a `season_id = temporadaEnCurso()` **en la consulta**, no en
un filtro posterior: los 677 del histórico no viajan ni entran en ningún
contador. La rotación queda en los 134 para los que estaba calibrada.

Dos cosas más que aparecieron al acotar:

- **La puerta al histórico estaba rota antes de existir.** La categoría se leía
  de `stg_urba_torneos`, que sólo tiene los 134 de 2026: un `?anio=2024` habría
  fallado en los 127 torneos con "sin categoría". Ahora se deriva del nombre del
  torneo — verificado sobre los 811, los resuelve todos y coincide con staging en
  los 134, cero diferencias.
- **El histórico está oculto**, así que `?anio=2024` encuentra 127 torneos y 0 en
  rotación. La combinación real es `?anio=2024&ocultos=1`. No se hizo implícito
  porque el trigger de notificaciones no mira `is_visible`. La respuesta lo avisa
  cuando pasa, en vez de devolver un `ok: true` con `updated: 0`.

---

## Lo que falta

### Decisiones tomadas que todavía no se ejecutaron

1. ~~**Publicar el histórico, año por año.**~~ **HECHO (2026-08-06): las seis
   temporadas están publicadas.** El anónimo ve los **811 torneos** y los
   **52.258 partidos**, que es toda la base de URBA.

   | | 2026 | 2025 | 2024 | 2023 | 2022 | 2021 |
   |---|---:|---:|---:|---:|---:|---:|
   | torneos | 134 | 141 | 127 | 127 | 141 | 141 |
   | partidos | 10.917 | 10.709 | 9.886 | 8.660 | 8.210 | 3.876 |

   El patrón quedó en
   [urba-publicar-temporada.ts](src/scripts/urba-publicar-temporada.ts)
   (`--anio=YYYY --plan|--execute`), con rollback por año.

   Entre 2025 y 2024 hubo que frenar a arreglar el listado: publicar un solo año
   lo llevó de 129 a 251 entradas.
   [tournamentSeasonFilter.ts](src/lib/tournamentSeasonFilter.ts) lo contuvo, y
   está medido en cada paso: **el listado general se quedó en 129 los cinco
   años**, que son exactamente los 129 que había antes de publicar el primero.
   El feed de partidos nunca fue el problema: está acotado por día en la
   consulta, así que un partido de 2021 no puede aparecer hoy.

2. **La captura del menú de temporadas.** Ya hay qué capturar: el Top 14 de 2026
   ofrece diez entradas para seis años. Las otras tres están en
   `capturas-navegacion/`.

### Verificación pendiente

3. **La página real, en un navegador.** Las capturas se hicieron con el harness
   headless (CSS real del módulo, menús calculados con las mismas funciones que
   usa la ruta) porque la página del torneo tarda **más de tres minutos** desde
   esta máquina contra Supabase en us-west. La ruta `/navegacion` sí se probó
   end-to-end contra el build de producción. Falta ver la cabecera real con el
   componente montado, y probar el menú en mobile.

4. **Los 8 tests en rojo de los minijuegos.** `src/features/career` y
   `src/features/captain` — el digest congelado ya documentado. Son previos y
   ajenos a este trabajo, pero siguen ahí.

### Trabajo que no se hizo

5. **Commitear.** Todo esto —y el conector de la sesión anterior— está sin
   commitear. `src/lib/integrations/urba/` entero figura como untracked.

6. **Encender el cron.** Las tres entradas de `urba-sync` en `vercel.json` están
   sin commitear: en producción no corren. Antes de prenderlo conviene mirar que
   la rotación siga calzando ahora que la consulta filtra por temporada.

7. **`graphify update .`** — el grafo quedó desactualizado.

8. **El menú de temporadas en juveniles.** Con el eje fino, el 22% de los
   juveniles queda sin temporadas para elegir (antes era 8%, pero con una clave
   tan gruesa que `otro ǀ juvenil ǀ M15 ǀ masculino` se comía 84 torneos: el menú
   andaba y no servía). El 78% restante sí ofrece un año que significa algo.
   Si molesta, hay margen para más normalizaciones de nombre, del mismo tipo que
   `Top 12/13/14` y la letra suelta.

9. ~~**Los 22 de reserva de las temporadas históricas.**~~ Entraron con su año,
   por coherencia con 2026: 19 en 2025, 18 en 2024, 20 en 2023, 28 en 2022 y 16
   en 2021. No van a la portada —`ocultarGradosSubordinados`— y se llegan por el
   desplegable de grado de su división.

10. **El año que se ofrece varias veces en el menú de temporadas.** Con las seis
    temporadas arriba, el menú del Top 14 tiene diez entradas para seis años:
    2022 aparece tres veces y 2021 otras tres.

    2021 es el caso previsto —la temporada regular más sus dos ruedas, que se
    distinguen por la segunda línea, tal como se decidió—. **2022 no**: sus tres
    entradas son `Semifinal`, `Clasificación` y `Final`, y **ninguna es la
    temporada regular**, porque URBA ese año no publicó una: partió la división
    en fases y nada más.

    Medido sobre los 811: hay **118 pares (competencia, año) con más de un
    torneo**; en **4** todos los torneos son una fase y no hay regular, y los
    cuatro son de 2022 —`Top Superior`, `Top Intermedia`, `Desarrollo Superior`,
    `Desarrollo Intermedia`—. En otros 13 hay fases *además* de la regular.

    O sea que la segunda línea SÍ distingue —se lee cuál es cuál— pero en esos 4
    el menú ofrece un año que no tiene adónde llevar "en general". Si molesta, lo
    barato es ordenar dentro del año en `menuDeTemporadas`: la regular primero y
    las fases después, sin esconder ninguna. No se hizo: es una decisión de
    producto y el dato de la fuente es el que es.

---

## Inventario

### Módulos nuevos

| archivo | qué es |
|---|---|
| `src/lib/integrations/urba/tournamentRow.ts` | la fila de `tournaments` y la de `tournament_phases` |
| `src/lib/integrations/urba/ejeJuvenil.ts` | el eje de grupo y zona de los juveniles |
| `src/lib/integrations/urba/temporada.ts` | la temporada en curso, del reloj |
| `src/lib/competitionKey.ts` | la identidad de una competencia entre años |
| `src/lib/tournamentNavigation.ts` | los dos menús y el filtro del listado |
| `src/app/api/tournaments/[id]/navegacion/route.ts` | la ruta que sirve los menús |
| `src/app/tournaments/[id]/TournamentNavigation.tsx` | el componente |

### Módulos tocados

`externalId.ts` (regla de Superior, `corregirUrbaClubId`, precedencia juvenil) ·
`planMatches.ts` (corrección del club_id en el triple) · `normalize.ts` (rutas
desde la raíz) · `tournamentAudience.ts` (la reserva va con juveniles) ·
`cron/urba-sync/route.ts` · `api/public/tournaments/route.ts` ·
`TournamentDetailClient.tsx`.

### Scripts

Todos con `--plan` / `--execute` y rollback previo:
`urba-historico-dry-run` · `urba-historico-execute` · `urba-san-andres-fix` ·
`urba-logo-2026` · `urba-activar-2026` · `urba-normalizar-preexistentes` ·
`urba-eje-juvenil-backfill` · `urba-publicar-reserva-2026` ·
`urba-navegacion-medicion`.

### Rollbacks

`URBA_HISTORICO_ROLLBACK.sql` · `URBA_SAN_ANDRES_ROLLBACK.sql` ·
`URBA_LOGO_ROLLBACK.sql` (1,8 MB, con los 8 base64) · `URBA_ACTIVAR_ROLLBACK.sql` ·
`URBA_PREEXISTENTES_ROLLBACK.sql` · `URBA_EJE_JUVENIL_ROLLBACK.sql` ·
`URBA_PUBLICAR_RESERVA_ROLLBACK.sql`.

### Informes

`URBA_HISTORICO_DRY_RUN.md` · `URBA_NAVEGACION_MEDICION.md` ·
`docs/urba-club-id-14.md` · `capturas-navegacion/`.

### Tests

182 en verde en lo tocado: 144 de URBA, 21 de navegación, 13 de
`competitionKey`, 4 de `normalizeUrl`. `tsc --noEmit` limpio y `npm run build` en
verde.

---

## Lo que conviene no olvidar

**El 0 que era el síntoma.** La primera corrida en seco dijo "0 clubes a crear" y
eso parecía la confirmación de que el mapeo estaba completo. Era lo contrario:
dos clubes distintos resolvían al mismo registro. Un número que da justo lo que
esperabas merece la misma desconfianza que uno que da mal.

**La constante que sólo falla una vez al año.** `const ANIO = 2026` habría roto
la sincronización el 1 de enero de 2027, en producción, sin un error. Es el mismo
patrón que el contador que suma sin escribir.

**Medir antes de implementar cambió el diseño dos veces.** El eje juvenil parecía
gratis hasta que se midió su efecto sobre el otro desplegable (8% → 22% de
juveniles sin temporadas). Y el desplegable de grado parecía servir para 716
torneos hasta que se contó *valores distintos* en vez de *hermanos*: eran 170.

**Un menú que promete algo que no cumple es peor que uno ausente.** De ahí salen
tres reglas: el menú vacío no se dibuja, los ítems que no se pueden abrir no se
listan, y la rueda aparece sólo donde desambigua.
