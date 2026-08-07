# Evaluación: pestaña Operación del gestor de torneos

**Fecha:** 2026-08-06
**Alcance:** `/admin/entities/{id}/manage?type=tournament&tab=operacion` — los tres subtabs: **Fixture · Posiciones · Estadísticas**. Torneo de referencia: `ed986d61…` — Torneo del Interior "A", 16 clubes, 48 partidos.
**Método:** 4 perfiles independientes y aislados (subagentes en paralelo), sobre un banco de mediciones propio.
**Nota de alcance:** el subtab **Fixture** ya se auditó en una pasada anterior ([EVALUACION_GESTOR_FIXTURE_4_PERFILES.md](EVALUACION_GESTOR_FIXTURE_4_PERFILES.md)) y quedó excluido salvo por coherencia. Lo nuevo acá es **Posiciones** (~2.100 líneas en 9 archivos) y **Estadísticas** (636 líneas), que no los había mirado nadie.

---

## Antes que nada: tres errores míos

Le pasé datos falsos a los cuatro perfiles. Tres de ellos los detectaron y los verifiqué uno por uno. Lo pongo primero porque cambia conclusiones:

| Lo que afirmé | Lo que es | Cómo se detectó |
|---|---|---|
| "PTS no se ve sin arrastrar en el teléfono" | **Falso.** PTS lleva `pointsHeader`/`pointsCell` ([StandingsTable.tsx:320-327](src/components/admin/entities/tournament/standings/StandingsTable.tsx#L320-L327)) y el módulo lo ancla con `position: sticky; right: 0` bajo 900px ([module.css:1929-1950](src/components/admin/entities/tournament/standings/TournamentStandingsTab.module.css#L1929-L1950)). Mi banco dibujó esa columna con `thCenter` a secas. **Re-medido: sticky, right 0px, a 320/360/390.** | Perfil C, cruzando el banco contra el componente |
| "`MobileCards` es código muerto, no se invoca" | **Falso.** La función se llama `MobileStandingsCards` y **sí se invoca** ([:694](src/components/admin/entities/tournament/standings/StandingsTable.tsx#L694)). Mi grep buscaba el nombre equivocado. No es código muerto: es un **doble render** con el CSS apagado a propósito. | Perfiles A, B y D, los tres por separado |
| Medí la tabla y reporté sus anchos | **Incompleto.** La medí **aislada**. En el producto vive dentro de `.workspace`, un grid `280px 1fr 320px` ([:303](src/components/admin/entities/tournament/standings/TournamentStandingsTab.module.css#L303)) con dos rieles fijos que se llevan 600px. | Perfil D |

**Re-medido con el banco corregido** (tabla dentro del `workspace`, PTS con sus clases reales):

| Ancho | Centro para la tabla | ¿Arrastra? | PTS |
|---|---|---|---|
| 320 / 360 / 390 | 320 / 360 / 390 | sí (scroller 564px) | **sticky, right 0** |
| 720 | 720 | no | sticky |
| 1280 | 1020 | no | static |
| **1440** | **800** | **sí** | static |
| 1920 | 1280 | no | static |

**1440 es el peor ancho de escritorio**: los dos rieles se llevan 600px y la tabla arrastra, mientras que a 1280 (donde el riel derecho baja) y a 1920 entra. Y ojo: mi banco usa `min-width: 920px`; el módulo documenta que la tabla real calcula **1180px** ([:1657](src/components/admin/entities/tournament/standings/TournamentStandingsTab.module.css#L1657)), así que en producción el arrastre a 1440 es peor que lo medido y a 1280 probablemente también aparece.

---

## Resumen ejecutivo

Posiciones tiene un motor de cálculo serio y una solución de tabla en el teléfono que está bien pensada y bien argumentada. El problema no es lo que el operador ve: es lo que se **escribe**. La tabla que se publica se persiste sin transacción, se puede pisar entera con la tabla de local en dos clics, arrastra 4 MB de escudos en base64 por torneo, y la bitácora que debería registrar todo eso **nunca escribió una sola fila**. Encima, un fallo de red se le presenta al operador como "este torneo no tiene fases".

Estadísticas es la pestaña menos terminada: una función completa es inalcanzable por un nombre de campo equivocado, los filtros se auto-limitan, y su tabla de 19 columnas no heredó ninguna de las soluciones móviles que Posiciones ya resolvió.

**Puntuación global: 5,5/10**

| Perfil | Nota | Titular |
|---|---|---|
| UX/UI | 6/10 | El shell está bien hecho; Posiciones y Estadísticas no hablan el mismo idioma ni entre sí ni con él |
| Funcionalidad | 5/10 · APTO CON RESERVAS | Lo que se ve está bien calculado; lo que se publica se puede corromper sin dejar rastro |
| Mobile | 6/10 | La tabla se lee parada en la cancha; Estadísticas es un tablero de escritorio metido en un teléfono |
| Desktop | 5,5/10 | Dos rieles fijos de 600px, y la pestaña secundaria tiene ordenar/exportar/compartir que la principal no |

---

## Los 3 problemas que importan

### 1. Se puede corromper la tabla publicada, y no queda rastro — S1

**El pisado.** `recalculateAndPersistStandings` borra por `(tournament_id, phase_id, group_id)` **sin filtrar por `table_type`** ([recalculateStandings.ts:264-280](src/lib/server/recalculateStandings.ts#L264-L280)) e inserta con el `table_type` que venga. El operador que mira la vista **Local** y aprieta "Forzar recálculo" borra las filas generales y publica las de local en su lugar. Lo leen sin filtro la página pública ([fetchTournamentData.ts:671-677](src/lib/services/fetchTournamentData.ts#L671-L677)) y el sembrado de playoff ([seedingFromStandings.ts:68-72](src/lib/tournaments/seedingFromStandings.ts#L68-L72)). Son dos clics y ningún aviso.

**Sin transacción.** El DELETE y el INSERT no son atómicos ([:264-326](src/lib/server/recalculateStandings.ts#L264-L326)): si el segundo falla, la fase queda con la tabla **vacía**, no desactualizada. Y el UNIQUE es `(tournament_id, phase_id, group_id, club_id)` sin `season_id`, así que dos recálculos concurrentes —dos operadores, o el botón manual corriendo contra el fire-and-forget de un resultado— no chocan contra ninguna restricción.

**Y la bitácora nunca funcionó.** El panel de Auditoría siempre dice "Sin entradas recientes" porque los dos INSERT fallan en silencio: el de recálculo omite `actor_user_id` (NOT NULL) y el de reglas escribe una columna `payload` que no existe y omite `changes` (NOT NULL). **Verificado contra la base: 936 filas en `admin_audit_log`, 0 con `entity_type` en (`standings`, `phase_rules`)**. Encima la política de SELECT sólo deja ver las filas propias del usuario.

### 2. Un fallo de red se lee como "el torneo está vacío" — S1

Convergente entre UX/UI y Funcionalidad. Si la carga falla —red, permisos, 500—, Posiciones muestra **"No se encontraron fases para este torneo."** ([TournamentStandingsTab.tsx:462-464](src/components/admin/entities/tournament/standings/TournamentStandingsTab.tsx#L462-L464)) o **"No hay participantes o partidos para la combinacion seleccionada"** ([StandingsTable.tsx:550](src/components/admin/entities/tournament/standings/StandingsTable.tsx#L550)).

El mensaje real existe: viaja a `errorMessage` y se pinta **dentro del panel plegable "Reglas de cálculo"**, bajo el título "No se pudo cargar la lógica" —que habla de otra cosa— y en el teléfono ese riel está oculto hasta que tocás "Ajustes". Además **nunca se limpia** en una recarga exitosa. Estadísticas es peor: no tiene superficie de error, sólo `console.error` ([TournamentStatsTab.tsx:150,164-166](src/components/admin/entities/tournament/TournamentStatsTab.tsx#L150)).

El patrón correcto ya existe y está bien resuelto tres archivos más arriba, en el shell ([TournamentOperationTab.tsx:147-172](src/components/admin/entities/tournament/TournamentOperationTab.tsx#L147-L172)).

### 3. Los escudos, otra vez — y ahora persistidos — S2

**En pantalla:** cuando un club no tiene escudo, Posiciones muestra el texto literal **"LOG"** en un cuadradito de 22×22 ([StandingsTable.tsx:653](src/components/admin/entities/tournament/standings/StandingsTable.tsx#L653)) — no son las iniciales del club, es un pedazo de la palabra "logo", igual para todos. Estadísticas usa las dos primeras letras del nombre ([TournamentStatsTab.tsx:72](src/components/admin/entities/tournament/TournamentStatsTab.tsx#L72)). Las dos violan la regla dura de escudo real.

**En la base:** cada fila persistida de standings guarda el escudo como data-URI base64 dentro de `stats.team_logo` ([recalculateStandings.ts:313](src/lib/server/recalculateStandings.ts#L313)), y se reescribe entero en cada recálculo. **Medido en producción: las 16 filas de este torneo pesan 4.063 KB, de los cuales 4.059 KB (99,9 %) son escudos.** La tabla tiene 2.098 filas en total. Es el mismo problema que el hallazgo #1d del fixture, pero acá además queda escrito.

**En el DOM:** `MobileStandingsCards` se renderiza en todos los anchos y su CSS está apagado en todos los anchos, así que cada club dispara un segundo `<img>` del escudo dentro de un subárbol `display:none`. 16 filas = 16 pedidos que nadie ve. Ninguna de las dos copias tiene `loading="lazy"`.

---

## Perfil A — UX/UI · 6/10

23 hallazgos. Además de los de arriba:

| Sev | Hallazgo | Evidencia |
|---|---|---|
| S2 | **El módulo de Posiciones no tiene ni una regla de tema claro en 2.837 líneas** y resuelve color con 35 hex literales. Estadísticas ya migró a tokens (4 hex / 59 `var()`). Son dos etapas de la misma migración conviviendo en una pestaña — y es la causa única de los cinco fallos de contraste. | `grep` de `prefers-color-scheme\|data-theme\|light` = 0 resultados en el módulo |
| S2 | El riel de subtabs declara `role="tablist"`/`role="tab"` pero no cierra el patrón: sin `aria-controls`, sin `role="tabpanel"`, sin roving tabindex ni flechas. Un tablist a medias miente más que tres botones. | `TournamentOperationTab.tsx:380-410` |
| S2 | Un botón por fila que no hace nada: tres puntos con `title="Ver detalles"`, sin `onClick`, sin `aria-label`. 16 filas, 16 promesas vacías. | `StandingsTable.tsx:677-685` |
| S3 | Tres gramáticas para el mismo gesto "elegí uno de N" en la misma pestaña: `tablist` en el shell, `role="group"`+`aria-pressed` en Posiciones, ocho botones sueltos sin grupo en Estadísticas. | `:380-408` / `TournamentStandingsTab.tsx:511-522` / `TournamentStatsTab.tsx:553-563` |
| S3 | Cuatro patrones de carga para una pestaña: esqueleto con forma, esqueleto de tabla, texto plano en inglés (`Loading standings context...`) y texto plano en español. | `TournamentOperationTab.tsx:42-61` · `StandingsTable.tsx:514-545` · `TournamentStandingsTab.tsx:459` · `TournamentStatsTab.tsx:538` |
| S3 | Inglés y jerga interna en pantalla: "Loading standings context...", "tabla real-time", "Overrides aplicados", "bitácora de standings", "Scope estadístico", "Head to Head", la pastilla `off`, `Modo: automatic`. | 7 archivos |
| S3 | Español sin tildes en siete cadenas visibles, conviviendo con texto correctamente acentuado en los mismos archivos: "combinacion", "calculo", "Tabla unica", "Ultima actualizacion", "todavia", "estadisticas". | idem |
| S3 | La tabla de Estadísticas ordena pero no dice por cuál columna: el ícono es idéntico en las 20, sin `aria-sort` ni marca del sentido. | `TournamentStatsTab.tsx:619` |
| S3 | El gráfico de barras no puede dibujar negativos, y en "Equipos" la métrica graficada **es** la diferencia de puntos: todo club con diferencia negativa dibuja una barra de 0px. Además el piso del 8% infla los valores chicos y no hay eje ni escala. | `chartKey: 'points_difference'` en `:487`; ancho en `:627` |
| S3 | Existe un desplegable para asignar etiquetas y nadie lo importa (`AssignLabelDropdown.tsx`, `StandingsBottomModules.tsx`, huérfanos). Lo que se envía es un botón que **cicla**: para poner la cuarta de cinco etiquetas hay que tocar cuatro veces, con un round-trip cada una. | `handleCycleLabel` en `TournamentStandingsTab.tsx:368-456` |
| S3 | El ciclo de etiquetas borra antes de crear y no revierte: si el POST falla después de los DELETE, la fila queda sin etiqueta y el estado local no vuelve atrás. | `:402-441` |
| S3 | Los mensajes de error se autodestruyen a los 3, 4 y 5 segundos según el panel. Un éxito puede evaporarse; un error tiene que quedarse. | `:342`, `:441`; `StandingsSidebar.tsx:240` |
| S4 | Dos tokens de vacío conviviendo en la misma pestaña: `--` en Posiciones, `—` en Estadísticas y el sidebar. | `StandingsTable.tsx:246` vs `TournamentStatsTab.tsx:67` |
| S4 | Terminología partida dentro de un mismo archivo: los encabezados dicen "Equipo", la tabla de jugadores del mismo componente dice "Club". | `StandingsTable.tsx:604`; `TournamentStatsTab.tsx:486-492` |

**Lo que está bien:** el shell de Operación es la mejor parte de las tres — las cifras se derivan del fixture en memoria en vez de guardar un contador que se desincronice, el esqueleto tiene la forma de lo que viene, y los dos vacíos dicen qué pasó y ofrecen la salida. La columna DIF no comunica sólo por color (antepone el signo). El scroller de la tabla es accesible por teclado (`role="region"` + `tabIndex={0}`). El aviso de "las columnas en cero esperan los eventos" distingue dato vacío de dato faltante. Y la decisión de mostrar tabla y no tarjetas en el teléfono está argumentada en el CSS y tiene razón.

## Perfil B — Funcionalidad · APTO CON RESERVAS

21 defectos. Además de los del top 3:

| # | Sev | Defecto | Evidencia |
|---|---|---|---|
| D6 | **S2** | Las rutas de etiquetas de equipo **no validan nada**: cualquier cuenta logueada puede crear o borrar etiquetas de cualquier torneo. Usan el cliente anon+cookie y confían en una RLS que sólo exige `auth.role() = 'authenticated'`. Contrastar con `recalculate/route.ts:14`, que sí llama al guard. | `team-labels/route.ts:103-153`, `team-labels/[id]/route.ts:4-19`; política en `20260318230000_ui_labels.sql:58-63` |
| D4 | S3 | `GET /standings/context`, `/standings`, `/standings/lite` y `/api/admin/team-labels` responden **200 sin cookie** y devuelven el ruleset completo (puntos, bonus, desempates, clasificación) de cualquier torneo no-draft. **Ejecutado por curl.** Misma familia que el hallazgo del fixture. | ninguna ruta llama a un guard |
| D5 | S3 | El GET de contexto **escribe**: recorre las fases en serie y hace `UPDATE tournament_phases` cuando la normalización de etiquetas difiere. N fases = N round-trips seriales por request, y es alcanzable sin sesión. | `context/route.ts:55-82` |
| D7 | S3 | Reordenar los desempates guarda un array de strings planos: se pierde el `order: 'asc'` de cada criterio —así que "menos rojas" o "puntos en contra" quedan invertidos— y los criterios deshabilitados desaparecen del guardado. | `StandingsSidebar.tsx:226-233`; el motor lee `tb.order === 'asc'` en `standingsEngine.ts:657-660` |
| D8 | S3 | En una fase con configuración heredada, tocar cualquier cosa envía las reglas **resueltas** enteras y la fase queda con configuración propia: deja de seguir al torneo para siempre. El propio UI distingue los dos estados. | `StandingsFiltersBar.tsx:242-260`; `rules/route.ts:43-86` |
| D13 | S3 | La pestaña "Formaciones fijas" de Estadísticas **es inalcanzable siempre**: el gate lee `data.sport`, pero la tabla `tournaments` tiene `sport_id`. `isRugby` es constantemente `false` y toda la lógica de `set_pieces` es código muerto. **Verificado en base.** | `TournamentStatsTab.tsx:124-125`; `database.types.ts:1080` |
| D11 | S3 | Los filtros de Estadísticas se auto-limitan: elegís un equipo y la lista queda con ese solo equipo, porque las opciones se derivan de las filas ya filtradas. Hay que volver a "Todos" para cambiar. Ídem Jugador. | `:307`, `:506-507` |
| D16 | S3 | No hay forma de cargar un ajuste manual de puntos (una sanción, por ejemplo). El motor lo aplica, la métrica y la columna ADJ lo anuncian, pero en toda la app nadie escribe `points_delta` salvo el camino de torneos externos. | `standingsEngine.ts:581-585`; único escritor: `externalTournamentStandingsOverrides.ts:878` |
| D10 | S3 | Después de cargar un resultado, Posiciones muestra una tabla correcta (recalcula en vivo por request) mientras la **publicada** puede haber quedado vieja: el recálculo es fire-and-forget. El único indicio es "Última actualización · hace 3 h", sin contraste ni alerta. | `recalcAffectedPhasesTraced.ts:9-12`, `:64-77` |
| D12 | S4 | Dos definiciones de "finalizado" en la misma pestaña: Estadísticas cuenta sólo `'final'`, el motor de posiciones cuenta `['final','finished','ft']`. Latente en este torneo (47 `final`, 0 del resto). | `TournamentStatsTab.tsx:73` vs `matchScope.ts:1` |
| D20 | S4 | `useMemo` está **después** de dos returns tempranos, con un `eslint-disable` encima. Hoy no rompe, pero agregar un segundo hook convierte esto en un crash duro de la pestaña. | `StandingsTable.tsx:514`, `:549`, `:556-557` |
| D22 | S4 | Borrar una etiqueta no pide confirmación. El panel es `aria-modal="true"` pero no cierra con Escape ni atrapa el foco. | `ManageLabelsPanel.tsx:83-109` |

**Cobertura de tests: cero.** El repo tiene 77 archivos de test y **ninguno toca el motor de posiciones**. Sin cubrir: desempates (incluido el round-trip que rompe D7), bonus, carry-over y su anti-ciclo, la atomicidad del DELETE+INSERT, el pisado por `table_type`, fase con 0 partidos, partido `final` con `score` nulo (hoy cuenta 0-0 y suma empate), y la cascada de ~8 orígenes de `resolveRules`.

## Perfil C — Mobile · 6/10

> "La tabla la puedo leer parada al costado de la cancha y eso ya es mucho más de lo que esperaba, pero Estadísticas todavía es un tablero de escritorio metido en un teléfono, y cada vez que vuelvo a Posiciones el juego arranca de cero."

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| 1 | **S2** | En Estadísticas la tabla se arrastra **sin identidad anclada**: "Jugadores" tiene 19 columnas y ni el jugador ni el club quedan fijos. Llegás a la derecha y no sabés de quién es la fila. Posiciones ya resolvió esto; Estadísticas no heredó nada. | `TournamentStatsTab.tsx:488`; ninguna regla `position: sticky` en su módulo |
| 2 | **S2** | Esa misma tabla no tiene freno de rebote: pasarte de largo entrega el gesto al navegador y te saca de la página. Posiciones sí tiene `overscroll-behavior-x: contain`. | `TournamentStatsTab.module.css:250-252` vs `TournamentStandingsTab.module.css:792` |
| 3 | **S2** | Ir y volver entre subtabs tira todo: el render es condicional, así que Posiciones se desmonta y vuelve a pedir contexto + tabla + etiquetas. | `TournamentOperationTab.tsx:431-439` |
| 4 | **S2** | `/standings/context` se pide **dos veces** por montaje, y la segunda prende un `<div>` a pantalla completa que **borra la tabla ya dibujada** — y dice "Loading standings context..." en inglés. | `TournamentStandingsTab.tsx:143` + `:213-215` + `:458-460` |
| 7 | S3 | El esqueleto miente el tamaño: 8 filas fijas para una tabla que trae 16. Son ~342px de salto en una pantalla de 844. | `StandingsTable.tsx:531` |
| 9 | S3 | Todos los `<select>` están por debajo de 16px, así que iOS hace zoom solo: cuatro en Estadísticas, uno en Posiciones y el de fase. | `module.css:410-421`; `TournamentStatsTab.module.css:155,197,511` |
| 10 | S3 | Los ocho módulos de Estadísticas son botones de 30px de alto con `!important`, cancelando el piso de 44px que el propio repo declara. | `operation-console.css:3638-3646` vs `tournament-mobile.css:1763-1773` |
| 12 | S3 | Abrir "Ajustes" mete los dos rieles **encima** de la tabla, así que la tabla se va de pantalla justo cuando querés ver el efecto del filtro. | `module.css:1525-1537` |
| 13 | S4 | La manija para reordenar desempates mide ~13px y en el teléfono el arrastre no arranca: `PointerSensor` sin `touch-action: none`. | `StandingsSidebar.tsx:205`; `module.css:1333-1342` |

**Lo que le gustó:** PTS anclado a la derecha mientras arrastra, con la identidad fija a la izquierda — el arrastre deja de ser trampa y pasa a ser herramienta. El nombre del club no se recorta ni a 320px. Los seis paneles de configuración plegados detrás de "Ajustes" en vez de tirados debajo de 700px de tabla. Esqueletos con la forma del contenido. Y cero scroll horizontal de página en los siete anchos.

## Perfil D — Desktop · 5,5/10

> "Tengo un monitor de 1920 y la tabla que vine a mirar vive en 1137px con dos rieles fijos de 600px al costado que nunca cambian de contenido — y encima la tengo que arrastrar; Estadísticas, que es la pestaña secundaria, tiene ordenar, exportar y compartir, y Posiciones, donde trabajo, no tiene ninguna de las tres."

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| 1 | **S2** | Los dos rieles laterales son de ancho fijo y contenido constante: se llevan 600px a 1920 y a 1440, y le sacan a la tabla el ancho que la obliga a arrastrarse. El monitor grande no compra ni una columna más de contexto. | `module.css:303`; tabla `min-width` 1180px (`:1657`). **Re-medido: a 1440 el centro queda en 800px y arrastra** |
| 2 | **S2** | Nada del estado vive en la URL: fase, grupo, vista, módulo, equipo, jugador, scope, orden. F5 devuelve a Resumen·Totales·primer grupo. Ni link compartible, ni dos pestañas comparando, ni Atrás. | `TournamentStandingsTab.tsx:86-88`; `TournamentStatsTab.tsx:112-119` |
| 3 | **S2** | Para crear una etiqueta de clasificación hay que salir de Operación: el panel es de sólo lectura y manda a la pestaña Estructura; al volver se perdió fase, grupo, vista y filtros. El panel editable existe pero sólo se monta en modo circuito. | `PhaseLabelsPanel.tsx:43-61`; `ManageLabelsPanel` sólo en `isGlobalCircuitMode` |
| 3b | **S2** | El `<thead>` tiene `position: sticky; top: 0` pero su scroller declara `overflow-y: hidden`: **el encabezado no se pega nunca**. Con 16 filas de 58px ya son 928px de tabla scrolleando sin encabezado. | `module.css:786-794` vs `:803-805` |
| 5 | S3 | Posiciones no ordena, no copia y no exporta; Estadísticas hace las tres. Misma pestaña, dos estándares. | `StandingsTable.tsx:607-623` vs `TournamentStatsTab.tsx:619`, `:567` |
| 6 | S3 | Asignar etiquetas es un click por paso con DELETE+POST serializados, y `pendingLabelPosition` **bloquea todas las filas** mientras hay una en vuelo. Cuatro puestos = 8 clicks y 8 round-trips que no se pueden encolar. | `TournamentStandingsTab.tsx:368-456`; `StandingsTable.tsx:662` |
| 7 | S3 | Los tres modales de Posiciones no cierran con Escape, no atrapan el foco ni lo devuelven — y `useDialog` (que hace las cuatro cosas) vive en la misma carpeta y lo usan otros cinco componentes. | `ManageLabelsPanel.tsx:97-109`; `useDialog.ts:127` |
| 8 | S3 | Reordenar desempates es sólo con el ratón: se registra `PointerSensor` y nunca `KeyboardSensor`. La única forma de cambiar la prioridad de desempate no existe para el teclado. | `StandingsSidebar.tsx:205` |
| 11 | S3 | El CSV sale sin BOM y separado por comas: en un Excel es-AR entra todo en una columna y los acentos se rompen. Y se llama `estadisticas-attack.csv`, sin torneo ni fase. | `TournamentStatsTab.tsx:97-107`, `:567` |
| 13 | S4 | Seis requests por visita a Posiciones, tres duplicadas: `/standings/context` dos veces y `/standings/audit` dos veces. | `TournamentStandingsTab.tsx:121-143`; `StandingsSidebar.tsx:184-203` |

**Lo que está bien:** Estadísticas ordena por cualquier columna con orden por defecto sensato por módulo (incluido `discipline: asc`, que es la lectura correcta). El CSV respeta el recorte y el orden de pantalla. La fase se elige una sola vez en la barra y baja por prop — sacaron dos selectores duplicados. El reordenamiento de desempates autoguarda al soltar. Y en Tabla Global los subtabs se deshabilitan de verdad en vez de dejarte entrar a un cartel.

---

## Tabla cruzada y conflictos

| # | Hallazgo | UX/UI | Func. | Mobile | Desktop | Final |
|---|---|:--:|:--:|:--:|:--:|---|
| 1 | Recálculo pisa la tabla publicada + sin transacción | — | S2 | — | — | **S1** |
| 2 | La auditoría nunca escribió una fila | — | S2 | — | — | **S2** |
| 3 | Fallo de red se muestra como "torneo vacío" | S1 | S3 | S2 (#4) | — | **S1** — 3 perfiles |
| 4 | Escudo → texto "LOG" / iniciales | S2 | — | S3 | — | **S2** |
| 5 | 4 MB de escudos base64 persistidos por torneo | — | S2 | — | — | **S2** |
| 6 | Contraste que falla (5 medidos) | S2 | — | S3 | S4 | **S2** — 3 perfiles |
| 7 | Doble render de `MobileStandingsCards` | S3 | S4 | S3 | S4 | **S2** — 4 perfiles |
| 8 | Botón "Ver detalles" muerto | S2 | S4 | S4 | S3 | **S2** — 4 perfiles |
| 9 | Estado no vive en la URL | — | S4 | S3 | S2 | **S2** — 3 perfiles |
| 10 | Endpoints sin autorización (labels / standings) | — | S2+S3 | — | — | **S2** |
| 11 | `useMemo` después de returns tempranos | — | S4 | — | S2 | **S2** |
| 12 | Estadísticas: tabla sin identidad anclada ni freno | — | — | S2 | — | **S2** |
| 13 | Contexto pedido dos veces, la 2ª borra la tabla | S3 | S4 | S2 | S4 | **S2** — 4 perfiles |
| 14 | Ciclo de etiquetas (N clicks, bloqueo global, sin rollback) | S3 | — | — | S3 | **S2** — 2 perfiles |
| 15 | Inglés, jerga y tildes faltantes | S3 | S5 | S4 | — | **S3** |

### Conflictos entre perfiles

**1. ¿PTS se ve en el teléfono? (mi banco decía que no; Perfil C dijo que sí).** El resto de los perfiles tomó mi dato por bueno y construyó encima. C fue el único que cruzó el banco contra el componente y encontró que mi HTML omitía `pointsCell`. **Resolución: re-medí y C tenía razón.** El aprendizaje es que un banco sintético hereda los errores de quien lo escribe, y que el dato medido no es automáticamente más confiable que el código leído — hay que cruzarlos.

**2. ¿`MobileStandingsCards` es código muerto (A, D) o una decisión deliberada a medias (A en su sección de deuda)?** A lo resolvió mejor que yo: el CSS lo apaga **a propósito y documentado** ("las tarjetas quedan en el DOM y apagadas: son el camino de vuelta"), así que el problema no es la decisión sino que se ejecutó a medias — el componente igual se monta. **Salida: `if (!isCompactMobile) return null`,** una línea, respeta la intención del comentario y elimina el doble render.

**3. Densidad: Desktop quiere el ancho de los rieles para la tabla; Mobile los agradece plegados.** No es contradicción: a ≤900px los rieles ya se pliegan detrás de "Ajustes" y ahí la tabla se ve mejor que en un monitor de 1440. **Salida: rieles colapsables con estado persistido en escritorio** — el comportamiento móvil ya es el correcto, falta llevarlo hacia arriba.

**4. Mobile elogia el arrastre horizontal como herramienta; Desktop lo sufre como defecto.** Los dos tienen razón porque son dos casos distintos: en el teléfono el arrastre con identidad fija es la solución correcta a un problema real; en un monitor de 1440 es el síntoma de que dos rieles fijos se comieron 600px. **Salida: mantener el arrastre abajo, eliminarlo arriba dándole el ancho a la tabla.**

---

## Plan de acción

### Ahora (bloquea)
1. **[S1] Filtrar por `table_type` en el DELETE del recálculo** — esfuerzo S. Hoy dos clics publican la tabla de local como si fuera la general, y de ahí come el sembrado de playoff.
2. **[S1] Que un fallo de red no se lea como "torneo vacío"** — esfuerzo S. El patrón correcto ya está escrito en el shell; es portarlo y limpiar el error en cada carga exitosa.
3. **[S2] Arreglar los dos INSERT de auditoría** (`actor_user_id` faltante; columna `payload` inexistente) y la política de SELECT — esfuerzo S. Sin esto no hay forma de saber quién rompió qué.
4. **[S2] Cerrar `team-labels` con `requireTournamentMutationContext`** — esfuerzo S. Hoy cualquier cuenta logueada edita etiquetas de cualquier torneo.

### Después (este ciclo)
5. [S2] Dejar de persistir el escudo base64 en `stats.team_logo`; guardar la clave y resolver por proxy. Es el mismo arreglo que el #1d del fixture y libera ~4 MB por torneo.
6. [S2] Sacar el `<div>LOG</div>` y las iniciales: escudo real o glifo neutro del deporte, nunca texto.
7. [S2] `if (!isCompactMobile) return null` en `MobileStandingsCards` + `loading="lazy"` en el escudo que queda.
8. [S2] Tokenizar los cinco colores de dato de Posiciones con par claro/oscuro. Estadísticas ya muestra cómo.
9. [S2] Subir el `useMemo` de `StandingsTable` arriba de los returns tempranos.
10. [S2] `overscroll-behavior-x: contain` + primera columna sticky en la tabla de Estadísticas. Copiar la receta de Posiciones.
11. [S2] Sacar `selectedPhase` de las deps del callback de contexto (doble fetch que borra la tabla) y no desmontar los subtabs al alternar.
12. [S2] Serializar fase/grupo/vista/filtros a query params; `pushState` para el subtab.

### Luego (backlog)
13. [S3] Tests del motor de posiciones — hoy son cero. Empezar por desempates, el round-trip que rompe `order:'asc'`, y la atomicidad del DELETE+INSERT.
14. [S3] Reemplazar el ciclo de etiquetas por selección directa, con rollback y sin bloqueo global.
15. [S3] `isRugby` leyendo `sport_id`; hoy "Formaciones fijas" es inalcanzable siempre.
16. [S3] Filtros de Estadísticas que no se auto-limiten.
17. [S3] Enchufar `useDialog` en los tres modales; `KeyboardSensor` en el reordenamiento.
18. [S3] Ordenar / copiar / exportar en Posiciones; BOM y `;` en el CSV.
19. [S4] Pasada de copy: tildes, traducciones, "club" en vez de "equipo", un solo token de vacío.

---

## No verificado

- **Nada con sesión.** La ruta responde 307 a `/login` y no hay credenciales. Ningún perfil recorrió la pantalla: todo sale de código, CSS y banco.
- **Sin cifras de tiempo.** La máquina estaba en 2,1 GB libres de 16 con 41 procesos `node`. Donde se habla de costo, se habla de bytes, de round-trips o de nodos del DOM.
- **Estadísticas no tiene mediciones propias.** El banco cubre Posiciones y el riel de subtabs. Los hallazgos de Estadísticas son de lectura de código y CSS, sin contraste medido.
- **D1 y D6 no se ejecutaron**: reproducirlos exigía escribir en la base de producción. Están sustentados por lectura de código y esquema, con la cadena completa de líneas.
- **El `min-width` real de la tabla (1180px) no se midió**, se tomó del comentario del propio módulo. Mi banco usa 920px, así que el arrastre en escritorio está **subestimado**.
- **Torneo grande sin probar**: 16 equipos, 1 fase, 47 partidos finales. El comportamiento con muchas fases (que amplifica el GET que escribe y los fetch duplicados) queda fuera.

## Auto-crítica

- **¿Cada hallazgo tiene evidencia?** Sí, y tres de los míos resultaron falsos: los declaré arriba en vez de borrarlos, porque el modo en que se detectaron es parte del resultado.
- **¿Medí el contraste o lo estimé?** Medido sobre color computado, y esta vez **claro y oscuro dieron valores distintos** — que es lo esperable con dos juegos de tokens. En la evaluación anterior salieron idénticos y eso era un defecto del banco que el Perfil A detectó; acá está corregido.
- **¿Probé en cada viewport o lo deduje del CSS?** Los siete anchos se renderizaron. Pero el banco es una réplica, no la pantalla: le faltaron dos clases y los rieles, y eso produjo dos hallazgos falsos. Un banco sintético vale lo que vale su fidelidad, y hay que cruzarlo contra el componente antes de creerle.
- **¿Hay preferencia personal disfrazada de principio?** Los hallazgos de escala tipográfica, radios y `z-index` son los más discutibles: describen inconsistencia real pero ninguno rompe nada. Están en S4 y en deuda, no en el plan de Ahora.
- **¿El plan es ejecutable?** Los cuatro de "Ahora" son cambios de menos de 20 líneas cada uno y los cuatro tienen la línea exacta. El 13 (tests) es el único con esfuerzo de días.
- **Lo que más me preocupa del proceso:** tres perfiles construyeron sobre un dato mío que era falso, y sólo uno lo cruzó. El aislamiento entre perfiles evita que se contaminen entre sí, pero no los protege de un error en la entrada común. La próxima vez el banco se valida contra el componente **antes** de repartirlo.
