# Gestor de Torneos — Fases: rediseño y defaults por deporte

> Bitácora de sesión · 2026-08-31 · rama `feat/carrera-rugby-v2`
>
> Arrancó como "cómo hacer más intuitiva la gestión de fases" mirando
> challenge.place, terminó con un módulo de defaults por deporte en el código y
> tres bugs viejos cerrados. Este documento existe para que el paso siguiente no
> empiece de cero.

---

## 1. De dónde salió

El disparador fueron capturas de dos productos:

- **challenge.place** — su alta de fase y su vista de fase (tabla + calendario
  lado a lado, cuadro de llaves con ranuras heredadas).
- **tournify** — un cuadro de llaves espejado, con el camino del ganador
  resaltado.

La pregunta original: cómo aplicar ese modelo a nuestro gestor.

---

## 2. Las seis diferencias reales

Casi todo lo que muestra challenge.place ya lo tenemos. Lo que cambia es **la
forma del recorrido**, no el catálogo de funciones.

| # | Diferencia | Estado nuestro |
|---|---|---|
| 1 | La pestaña Estructura es sólo la lista de fases | Hoy convive con el wizard de alta y el modelo competitivo |
| 2 | El alta es **un formulario**, no un wizard | Hoy son 6 pasos: Básico → Puntos → Desempate → Etiquetas → Estadísticas → Circuito |
| 3 | **Dos tipos** de fase en la pregunta (Tabla / Llaves) | Hoy son cuatro, y dos de ellos son indistinguibles para el gestor |
| 4 | La fase es **una pantalla**: tabla y calendario juntos | Hoy se parte entre Estructura y Operación → fixture |
| 5 | "Generar calendario" pregunta **una sola cosa** | Hoy se llama "Generar Jornadas (Cálculo Automático Ronda de Campeones)" y vive en otra pestaña |
| 6 | El cruce sin equipo es una **ranura editable** | Hoy se esconde con `is_visible = false` |

**Lo que no conviene copiar:** su modelo no sabe de bonus ofensivo de rugby ni
de arrastre de puntos entre fases (`settings.carryOver`). Las dos cosas son
nuestras y están bien.

---

## 3. El mockup navegable

https://claude.ai/code/artifact/6b5dc163-3b5a-4bf3-9537-2900bbce80f8

Armado sobre los tokens reales de `basalt.css` (`#0F141A`, verde `#22C55E` para
acciones, azul `#38BDF8` para info, Inter + JetBrains Mono), con datos de rugby
—URBA Primera A 2026, bonus ofensivo y defensivo incluidos—.

Tiene un botón **"Notas de diseño"** que prende los comentarios explicando qué
cambia respecto de hoy y por qué.

Recorrido: lista de fases → alta de fase (formulario único con acordeón) →
pantalla de fase (tabla + calendario) → cuadro de llaves del Playoff.

### 3.1 Pasada de UI/UX

Se corrieron las guías de dashboards densos contra el mockup. La base de datos
de diseño **validó la paleta**: recomendó acento `#22C55E` y estilo dark, que es
exactamente lo que basalt ya usa. Lo que sí salió fueron nueve incumplimientos:

- Contraste del texto terciario en **3,6:1** (bajo el mínimo) → subido a 4,6:1.
- La zona de la tabla se comunicaba **sólo por color** → ahora cada fila lleva su
  sigla (`SF`, `RC`) además de la franja.
- Áreas táctiles de 30px → 36 visibles con hit-area a 44.
- Glifos tipográficos (`⋮ ‹ › ▾`) como íconos → set SVG con trazo uniforme.
- Tamaños arbitrarios (10,5 / 12,5 / 13,5px) → escala modular.
- Sin URL por pantalla → `#/fases`, `#/fases/nueva`, `#/fase/p1`, con botón atrás.
- Sin confirmación antes de borrar → modal que dice qué se pierde.
- Validación recién al enviar → al salir del campo.
- Faltaba selección múltiple de partidos → barra de lote (útil cuando se
  suspende una fecha por lluvia).

### 3.2 El cuadro de llaves

De challenge.place se tomó la estructura y la semántica: rótulo de ronda
editable, nombre de serie sobre la tarjeta, disco `?` para la ranura vacía, y el
texto heredado (*"Ganador de Semifinal 2"*, *"Perdedor de Semifinal 2"*), con el
`⋮` montado sobre el borde derecho de cada serie y el 3º puesto colgando de la
Final.

De tournify se tomó la jerarquía: el que avanza en blanco y negrita con su
marcador en cápsula, el eliminado en gris, y el camino del ganador resaltado.

Los conectores se calculan **midiendo el DOM**, no con alineaciones de CSS. Está
verificado en el navegador: cuartos en 79 y 211 → semifinal en 145; semis en 145
y 409 → final en **277**, el punto medio exacto.

**Bug real encontrado al verificar:** `.backdrop { display: grid }` **pisa** el
`[hidden]` de la hoja del navegador, así que el fondo del modal estaba
renderizado siempre. En el artifact quedaba tapado sólo por el
`[hidden]{display:none!important}` que inyecta la plataforma — o sea, andaba de
casualidad. Le pasaba lo mismo a `.field-error`.

---

## 4. Lo que se llevó al código

Alcance pedido: **la creación de la fase, adaptada a nuestros parámetros y a los
de cada deporte**, y la gestión de fase en una pantalla.

### 4.1 Nuevo: `src/lib/data/phaseDefaults.ts`

La única fuente de qué trae puesta una fase según el deporte: puntaje, bonus,
columnas base, columnas de estadística y desempates.

Antes esto vivía en dos lugares parciales:

- `sportDefaults` en `src/app/admin/super/torneos/crear/page.tsx:75` — sólo
  `duration/win/draw/loss`.
- `COLUMN_TIEBREAKER_CONFIG` y los ternarios `isRugby` en
  `TournamentStructureTab.tsx` — columnas de rugby fijas para todos los deportes.

### 4.2 Cableado en `TournamentStructureTab.tsx`

Doce reemplazos. Desapareció `const isRugby = sport_id === 'rugby'` y con él
todos los `isRugby ? algoDeRugby : algoDeFutbol`.

Resultado, corriendo el módulo con los mismos argumentos que le pasa el
componente:

| Deporte | V/E/D | Bonus | Empate | Desempate 1→2 | Columnas del deporte |
|---|---|---|---|---|---|
| rugby | 4/2/0 | sí | sí | points → headToHead | tries, conversions, penalties, dropGoals, tackles, runs |
| rugby-union | 4/2/0 | sí | sí | points → headToHead | idem |
| rugby-league | 2/1/0 | **no** | sí | points → headToHead | idem |
| football | 3/1/0 | no | sí | points → **pointsDiff** | (ninguna) |
| handball | 2/1/0 | no | sí | points → headToHead | (ninguna) |
| field-hockey | 3/1/0 | no | sí | points → pointsDiff | (ninguna) |
| basketball | 2/0/1 | no | **no** | points → headToHead | (ninguna) |
| volleyball | 3/0/0 | no | **no** | points → won | (ninguna) |
| american-football | 1/0/0 | no | sí | points → pointsDiff | (ninguna) |

---

## 5. Hallazgos — los bugs que estaban vivos

### 5.1 `rugby-union` no era rugby

`isRugby` comparaba contra el **string exacto** `'rugby'`. Un torneo cargado con
`sport_id = 'rugby-union'` recibía puntaje de fútbol (3/1/0), perdía el bonus y
perdía las columnas de try. **Cerrado.**

### 5.2 El mundo era rugby o fútbol

Todo lo que no era rugby caía en el ternario a 3/1/0. Handball arrancaba con el
puntaje del fútbol en vez de 2/1/0, y básquet pedía puntos por un empate que no
puede pasar. **Cerrado**: el campo "Empate" ahora desaparece donde no hay
empates.

### 5.3 El bucket de deporte miente para los puntos

`normalizeSportBucket` manda `rugby-league` al bucket `rugby` porque comparten
los eventos de partido. Si los defaults se resolvieran por bucket —que es lo
natural— league cobraría 4 por victoria en vez de 2, y la tabla saldría mal sin
que nadie tocara nada.

**Regla:** el puntaje se resuelve por **id exacto** de deporte, con el bucket
sólo de red. Los eventos y las columnas sí van por bucket. Hay un test que lo
fija.

### 5.4 Dos trampas de identificadores

Las dos habrían pasado el build en silencio:

- **Los ids de columna son plurales.** El selector conoce `tries`,
  `conversions`, `dropGoals`. Derivar la clave del tipo de evento daba `try`,
  `conversion`, `drop_goal`: la columna se habría guardado marcada y la tabla no
  la habría pintado nunca.
- **`head_to_head` es un id legacy.** Figura en `TIEBREAKER_LABEL_ALIASES` como
  alias de partidas viejas; el canónico es `headToHead`. Una fase nueva habría
  nacido con el id de una partida vieja.

### 5.5 Una columna de estadística no se inventa

El catálogo de eventos sabe de handball y de hockey, pero **la tabla de
posiciones sólo tiene columnas de rugby**. Ofrecer las de handball dejaría
casillas que se marcan, se guardan y no dibujan nada. Por eso handball muestra
`(ninguna)` en la tabla de arriba: es lo honesto hasta que el renderer las
soporte. Cuando las soporte, se agregan a `STAT_COLUMNS_BY_BUCKET` y el
formulario las toma solo.

Sí se cruza contra los eventos del torneo: un torneo de rugby que no registra
drops no ofrece la columna Drop Goal.

---

## 6. Verificación

- `npx tsc --noEmit` → **0 errores**
- `npm run build` → completo
- `node --test src/lib/data/phaseDefaults.test.ts` → **20 de 20**

**No se abrió el gestor en el navegador.** La verificación fue de tipos, build y
datos, no clickeando el formulario.

---

## 7. Lo que queda

### 7.1 El `sportDefaults` duplicado

`src/app/admin/super/torneos/crear/page.tsx:75` sigue teniendo su propia tabla.
**El alta de torneo y el alta de fase deciden el puntaje por separado y ya no
dan lo mismo**: crear un torneo de handball da 3/1/0 y crearle una fase da
2/1/0. Es chico y es lo primero.

### 7.2 La forma del formulario (los 6 pasos → un scroll)

El problema **no es que sean seis pasos**: es que el estado del formulario y el
armado del payload están fundidos. Veinticinco `useState` sueltos que un
`body: JSON.stringify({...})` de ochenta líneas lee directo, con claves
duplicadas en snake y camel (`playoff_stage_names` **y**
`playoffStageMatchCounts` **y** `playoff_match_counts`) que existen porque las
leen fases viejas.

Orden propuesto, y el orden importa:

1. **Extraer** `buildPhaseSettings(formState, defaults)` como función pura. El
   componente queda igual, sólo delega.
2. **Congelar con un test golden**: con el estado de hoy tiene que producir
   *exactamente* el mismo objeto que hoy, claves duplicadas incluidas. Un caso
   por tipo de fase: liga, grupos, playoff, circuito, y uno con `carryOver`.
3. **Recién ahí**, cambiar la forma del formulario.

Sin el paso 2, la refactorización puede dejar de escribir `playoff_match_counts`
y no lo nota nadie: no rompe la pantalla, rompe una fase de playoff cargada el
año pasado, y se descubre tres semanas después.

### 7.3 La fase en una pantalla

**Está medio resuelto y conviene saberlo.** Operación no guarda la fase en
estado local: la guarda en la URL con `useStandingsUrlState()`, y hay un
comentario en `TournamentOperationTab.tsx:79-84` contando que antes había dos
fuentes de verdad —esa barra y el `selectedPhase` de Posiciones— unidas por un
efecto que podía discrepar, y que las unificaron contra la URL.

Entonces **no hay que fusionar dos pestañas: hay que promover la fase a ruta.**

1. Estructura lee el mismo `useStandingsUrlState()` que ya escribe Operación.
   Sin `phaseId`, muestra la lista; con `phaseId`, esa fase.
2. La vista de fase monta dos paneles que ya existen y ya trabajan scopeados: el
   de posiciones y `TournamentOperationFixtureWorkspace`.
3. La preselección ya está bien resuelta: es derivada, no un efecto que escribe
   estado (`TournamentOperationTab.tsx:123-127`).

**No tocar** `FixtureProvider` ni su pestillo `autoFetchedRef`: ese comentario de
veinte líneas describe un bug de StrictMode que ya costó caro. La vista de fase
monta *dentro* del provider.

---

## 8. Archivos

| Archivo | Estado |
|---|---|
| `src/lib/data/phaseDefaults.ts` | **nuevo** |
| `src/lib/data/phaseDefaults.test.ts` | **nuevo** — 20 tests |
| `src/components/admin/entities/tournament/TournamentStructureTab.tsx` | modificado — 12 reemplazos |

### Notas de implementación

- `phaseDefaults.ts` usa **rutas relativas con extensión** (`../matchEventCatalog.ts`),
  no el alias `@/`: el runner del proyecto (`node --test`) no resuelve el alias,
  sólo lo hace el build de Next. Es la misma convención de
  `src/lib/integrations/urba/planMatches.ts`.
- Los defaults se siembran al montar el formulario y al resetearlo. Si se cambia
  el deporte del torneo en Detalles con el formulario de fase abierto, no se
  re-siembra hasta cerrarlo y volver a abrirlo.
