# Auditoría UX/UI — Páginas de torneos

**Objeto:** `/tournaments` y `/tournaments/[id]` (Top 14 de la URBA, `d29703d0…35a6e`)
**Fecha:** 6 de agosto de 2026
**Método:** panel de 4 personajes (skill `ux-ui-audit`) + Playwright sobre `localhost:3000`
**Resultado:** 22 hallazgos. Se implementaron 19; el árbol quedó revertido, así que este
documento es el registro y la especificación para re-aplicarlos.

> **Estado del código:** los cambios descritos acá **no están en el árbol**. Fueron
> implementados y verificados durante la sesión y después revertidos. Todo lo que sigue
> incluye archivo, línea y valor exacto para poder rehacerlo sin volver a investigar.

---

## 1. Cómo se midió

Nada de lo que sigue está estimado a ojo. Los números salen de tres arneses de medición
que conviene conservar, porque **cada uno detecta una clase de problema que los otros no
ven**:

| Arnés | Qué mide | Qué encontró que los otros no |
|---|---|---|
| Contraste | Ratio WCAG 2.x contra el fondo **efectivo** resuelto por herencia | Que un solo token causaba 8 de 10 fallos |
| Desborde | `scrollWidth` vs `clientWidth` en todo contenedor que no recorta | Que el marcador agrandado se salía de su caja |
| Apilado | `elementFromPoint` sobre un menú abierto | Que el dropdown estaba atrapado en un contexto de apilado |

**La lección de método:** la primera ronda de verificación midió tamaños de fuente,
z-index y contraste, y dio todo verde. Pero nunca preguntó *«¿el texto entra en su
caja?»*, ni abrió un desplegable, ni miró el tema oscuro. Tres bugs pasaron por ahí. Medir
propiedades computadas no alcanza: hay que medir **relaciones** (contenido contra
contenedor, elemento contra elemento).

Los tamaños de fuente y los objetivos táctiles se miden en píxeles **renderizados**: donde
hay `zoom`, el valor computado se multiplica por el factor, que es lo que el ojo y el dedo
encuentran de verdad.

---

## 2. Resumen ejecutivo

La página está mejor construida de lo que se ve. Tiene un sistema de tokens real con dos
temas, el foco no está borrado (13 reglas `:focus-visible` contra 10 `outline:none`), la
tabla de posiciones colapsa exactamente al set que corresponde en mobile, y los números van
en monoespaciada, así que el marcador no baila. El problema no era de oficio: tres
decisiones puntuales le pasaban por encima a todo lo demás.

1. **`html { zoom: 0.7 }` en desktop** — 217 de 225 nodos de texto por debajo de 12 px reales.
2. **El horario no se convertía** — `15:30 hs` idéntico desde Buenos Aires, Madrid y Auckland.
3. **El gris `--fl-text-dim`** — falla AA en los dos temas y se lleva puesta media página.

### Puntajes por personaje (0-100)

| Personaje | Puntaje | Por qué |
|---|---|---|
| Usuario mobile | 58 | Popup al entrar, pestañas invisibles, targets de 18 px |
| Usuario desktop | 44 | El zoom global arrastra cuerpo, targets y foco a la vez |
| Diseñador UX/UI | 62 | Sistema de tokens sólido; el fallo vive en la capa semántica |
| Diseñador deportivo | 51 | Marcador más chico que el nombre del torneo; 2 de 5 estados |

---

## 3. Inventario de skills (paso obligatorio de la skill)

236 skills instaladas (213 globales, 23 del proyecto, 0 en plugins). Relevantes:

| Skill | ¿Relevante? | Cómo se aplicó |
|---|---|---|
| `impeccable` | Sí | Registro «product»: primero información, después estética |
| `design-auditor` | Sí | Categorías de estados, foco, tokens y microcopy |
| `ui-ux-pro-max` | Sí | Prioridad 1→10 para ordenar qué mirar primero |
| `ui-styling` · `design-system` | Sí | Tokens en tres capas — marco del hallazgo A2 |
| `emil-design-eng` · `apple-design` | Sí | Duración de transiciones y objetivos táctiles |
| `dataviz` | Sí | Sostiene M6: comparar dos valores pide una barra, no una planilla |
| `brandkit` | No | Genera imágenes de brand-kit; no define la paleta del producto |
| `design-taste-frontend` | Parcial | Se autolimita a landings — excluye dashboards y data tables |
| `minimalist-ui` · `high-end-visual-design` | No | Prescriben una estética; aplicarlas sería reemplazar el sistema, no auditarlo |

El proyecto no tiene `DESIGN.md`. La fuente de verdad del sistema visual es
`src/app/tournaments/[id]/page.module.css` (4.133 líneas) más los tokens `--fl-*`.

---

## 4. Los cambios, uno por uno

### B1 · Bloqueante — El horario no se convertía a la zona del usuario

**Evidencia.** La misma página cargada con el navegador en tres husos daba **idéntico**
resultado: `Sábado, 15 de agosto · 15:30 hs`. Desde Madrid ese partido empieza 20:30; desde
Auckland, 06:30 del **domingo 16** — o sea que hasta el día estaba mal.

**Causa.** `formatArgentinaDate()` clavaba `APP_TIMEZONE` en los 28 puntos de formato de
`TournamentDetailClient.tsx`.

**Solución.**

```ts
// antes
function formatArgentinaDate(value, options) {
    return formatDateInTimeZone(value, 'es-AR', options, APP_TIMEZONE) || '';
}

// después — la zona es un parámetro, con el torneo como default
function formatEnZona(value, options, timeZone: string = APP_TIMEZONE) {
    return formatDateInTimeZone(value, 'es-AR', options, timeZone) || '';
}
```

En el componente:

```tsx
// Arranca en la zona del TORNEO a propósito: esto también se pinta en el servidor,
// donde no hay navegador que preguntar. Tomar el huso del visitante en el primer
// render rompería la hidratación (server = hora argentina, cliente = hora local).
const [zonaDelVisitante, setZonaDelVisitante] = useState<string>(APP_TIMEZONE);

useEffect(() => {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) setZonaDelVisitante(tz);
    } catch { /* sin Intl: se queda con la del torneo */ }
}, []);

const fechaEnZonaDelVisitante = React.useCallback(
    (value, options) => formatEnZona(value, options, zonaDelVisitante),
    [zonaDelVisitante],
);
```

Más un `sufijoDeZona` que agrega `(GMT+2)` cuando el huso del visitante difiere del del
torneo. **Se compara el desfasaje real, no el nombre**: `America/Buenos_Aires` y
`America/Argentina/Buenos_Aires` son la misma hora con dos nombres.

También hay que pasar la zona a `formatMatchSchedule()` y `getQuickStats()`, que la usan
internamente. En `formatMatchSchedule` el «hoy/mañana» **también** es relativo al huso: a
las 22:00 en Auckland ya es mañana en Buenos Aires.

**Verificado.**

| Huso | Tarjeta destacada | Fila |
|---|---|---|
| `America/Argentina/Buenos_Aires` | `15/08/2026 · 15:30 hs` | `15/8 · 15:30` |
| `Europe/Madrid` | `15/08/2026 · 20:30 hs (GMT+2)` | `15/8 · 20:30` |
| `Pacific/Auckland` | `16/08/2026 · 06:30 hs (GMT+12)` | `16/8 · 06:30` |

Cero errores de hidratación en los tres.

---

### B2 · Bloqueante — `html { zoom: 0.7 }` en desktop

**Ubicación.** `src/app/globals.css:1696-1700`.

**Evidencia.** Medido a 1440×900 con la regla puesta:

| Página | Texto < 12 px | Mín. | Targets < 24 px |
|---|---|---|---|
| `/clubs` | **100 %** (1603/1606) | 8,4 px | **530** |
| `/tournaments` | **99 %** (620/624) | 7 px | **802** |
| `/` | 97 % (104/107) | 7 px | 75 |
| `/tournaments/[id]` | 94 % (200/213) | 7,1 px | 46 |
| `/tablas` | 92 % (187/203) | 8,4 px | 43 |

Nombre de club **10,1 px**. Marcador **10,6 px**. Fila de resultado **8,7 px**.

El dato que lo cierra: **a 720 px la regla no aplica**, y ahí el mismo nombre de club mide
14,4 px y el marcador 15,2 px. La página se leía **mejor en una tablet que en un monitor de
27 pulgadas**.

Arrastraba dos cosas más: encogía los objetivos táctiles y adelgazaba el outline de foco de
2 px a 1,43 px.

**Medición previa a tocar nada.** Se midieron 12 páginas con la regla y con la regla
neutralizada por JS (`documentElement.style.zoom = '1'`), que es exactamente lo que se ve
al borrarla. En las 12:

- `documentElement.scrollWidth` quedó **dentro del viewport** en ambos estados
- la cantidad de contenedores que derraman quedó **idéntica** (0/0, 4/4, 1/1)

O sea: **los layouts son fluidos y no dependían del zoom para entrar**. Sacar la regla no
rompe ningún ancho.

**Resultado tras sacarla** (medido, coincidió con la predicción):

| Página | Antes | Después |
|---|---|---|
| `/clubs` | 100 % / 530 targets | **0 % / 16** |
| `/tournaments` | 99 % / 802 | **0 % / 16** |
| `/` | 97 % / 75 | **1 % / 16** |
| `/tablas` | 92 % / 43 | **0 % / 16** |

**Fallout real, y su arreglo.** Sacar el zoom destapó la cabecera: con `zoom: 0.7`, un
viewport de 1024 px equivalía a 1463 px lógicos y entraba todo con aire. A escala real, el
logo y el breadcrumb quedaban pegados borde con borde (medido: logo `72–215`, zona central
arranca en `215`), y a 1024 px el logo se comprimía hasta **0 px de ancho**.

En `src/app/admin/styles/obsidian-header.css`:

```css
.g22-header-inner {
    /* … */
    gap: 24px;          /* no había: logo y breadcrumb se tocaban */
}

@media (max-width: 1100px) {
    .g22-header-inner { padding: 0 48px; gap: 16px; }
}

/* Desktop angosto: el breadcrumb es lo prescindible —la misma información está
   en el título de la página—, así que es lo que cede. El logo nunca se encoge. */
@media (max-width: 1200px) {
    .g22-logo { flex: 0 0 auto; min-width: max-content; }
    .g22-header-center-zone { min-width: 0; gap: 16px; overflow: hidden; }
}
@media (max-width: 1080px) {
    .g22-header-center-zone { display: none; }
}
```

Verificado sin desborde de 768 a 1600 px, con el logo manteniendo sus 143 px.

**Residual.** Después de sacar el zoom, quedan páginas con texto declarado genuinamente
chico: `/rankings` 31 %, `estadísticas` 26 %, `torneo` 16 %. Eso es **M8** (escala
tipográfica), no el zoom.

> **Nota sobre `zoom` y el resto del código.** Hay al menos cinco lugares que compensan a
> mano el `zoom: 0.7` (`carrera.module.css` ×4, `tournament-mobile.css`,
> `ConditionalLayout.module.css`, y el bloque `data-full-height` de `globals.css`). Al
> sacar el zoom, esos parches quedan obsoletos pero inofensivos. Conviene revisarlos en una
> pasada aparte, no junto con esto.

---

### A2 · Alto — Un solo token causa 8 de 10 fallos de contraste

**Calculado** sobre el fondo efectivo:

| Tema | Valor | Sobre | Ratio | AA |
|---|---|---|---|---|
| Oscuro | `#505c70` | `#0f141b` | **2,73:1** | ✗ |
| Claro | `#8b9ab0` | `#ffffff` | **2,86:1** | ✗ |
| Claro | `#8b9ab0` | `#f0f4f8` (barra de pestañas) | **2,59:1** | ✗ |

Lo consumen: pestañas inactivas, el `FT` de cada fila, los encabezados `# J DG` de la
tabla, «Leyenda», las etiquetas de Información, el estado vacío del Cuadro y la fecha del
partido destacado.

**Solución.** `src/app/tournaments/[id]/page.module.css`, líneas 29 y 87:

```css
/* oscuro */
--fl-text-dim: #7d8a9e;   /* era #505c70 */
/* claro  */
--fl-text-dim: #617086;   /* era #8b9ab0 */
```

**Cómo se eligieron esos valores, que es lo importante:** hay que medir contra las **cuatro
superficies** del tema, no sólo contra el fondo. Un primer intento con `#727e92` (oscuro) y
`#68778d` (claro) pasaba sobre `--fl-surface` y **fallaba** sobre `--fl-surface-hov` (3,84:1)
y sobre la barra de pestañas (4,12:1). Los valores finales:

| | `--fl-bg` | `surface` | `surface-alt` | `surface-hov` |
|---|---|---|---|---|
| `#7d8a9e` (oscuro) | 5,76 | 5,28 | 4,85 | 4,51 |
| `#617086` (claro) | 4,56 | 5,04 | 4,69 | 4,44 |

---

### M1 · Medio — El verde de marca como texto sobre blanco

`#00a365` sobre `#ffffff` = **3,27:1**; sobre `#f0f4f8` = **2,96:1**. En el tema oscuro el
mismo verde da **5,66:1** y pasa: el problema es exclusivo del claro.

**Solución.** Token separado, sólo para texto. El verde de marca queda intacto para fondos,
bordes y escudos.

```css
:root                 { --fl-primary-text: #00a365; }  /* oscuro: 5,66:1 */
[data-theme="light"]  { --fl-primary-text: #00713d; }  /* claro:  5,41:1 */
```

**Ojo con el fondo de medición:** `#00884a` pasaba sobre blanco (4,54:1) pero daba **4,01:1**
sobre el fondo teñido de las chapas (`rgba(0,163,101,.1)` sobre la tarjeta ≈ `#e6f4ee`).
`#00713d` da 5,41 ahí y 6,12 sobre blanco.

Migrar los **7 usos como texto** (`page.module.css` líneas 393, 562, 817, 855, 2240, 2378,
2637). **No** tocar `border-top-color` (170) ni `border-color` (633): los bordes piden 3:1,
no 4,5.

---

### A1 · Alto — La barra de 8 pestañas esconde la mitad sin señal

`.navTabs` mide **726 px de contenido en 351 px visibles**, con la scrollbar ocultada a
propósito (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) y sin nada que
la reemplace — verificado: sin `mask-image`, sin gradiente, sin `::after`. Playoff, Equipos,
Puntajes y Estadísticas son invisibles.

```css
.navTabs {
    /* … lo que ya había … */
    scroll-snap-type: x proximity;
    --fade-left: 0px;
    --fade-right: 0px;
    -webkit-mask-image: linear-gradient(to right,
        transparent 0, #000 var(--fade-left),
        #000 calc(100% - var(--fade-right)), transparent 100%);
    mask-image: linear-gradient(to right,
        transparent 0, #000 var(--fade-left),
        #000 calc(100% - var(--fade-right)), transparent 100%);
    transition: -webkit-mask-image var(--fl-dur-fast) linear,
                mask-image var(--fl-dur-fast) linear;
}
.navTabs[data-overflow-start="true"] { --fade-left: 28px; }
.navTabs[data-overflow-end="true"]   { --fade-right: 28px; }
.tabButton { scroll-snap-align: start; }
```

Los `data-*` los pone un listener, para que el desvanecido aparezca **sólo del lado donde
hay algo que revelar** (en desktop, con las ocho a la vista, no se ve nada):

```tsx
const navTabsRef = React.useRef<HTMLElement | null>(null);

useEffect(() => {
    const el = navTabsRef.current;
    if (!el) return;
    const sync = () => {
        const max = el.scrollWidth - el.clientWidth;
        el.dataset.overflowStart = String(el.scrollLeft > 1);
        // -1 de tolerancia: scrollLeft es fraccionario con zoom o en HiDPI
        el.dataset.overflowEnd = String(el.scrollLeft < max - 1);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', sync); ro.disconnect(); };
}, [navigationTabs]);

// La pestaña activa se arrastra a la vista: sin esto, entrar por deep link a
// Estadísticas deja la pestaña marcada fuera de pantalla.
useEffect(() => {
    navTabsRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}, [activeTab, navigationTabs]);
```

---

### A3 · Alto — Las pestañas no tocaban la URL; Atrás salía del sitio

**Medido.** Click en «Clasificación` → URL **idéntica**. Con la pestaña cambiada,
`history.back()` llevaba a **`about:blank`**, o sea fuera del sitio.

Tres pérdidas de una causa: no se podía compartir «la tabla del Top 14», Atrás expulsaba, y
F5 perdía el lugar.

```tsx
/* Quién manda al montar: la URL. El efecto de escritura espera a que el de
   lectura haya corrido, o pisaría la pestaña pedida por deep link. */
const [urlAplicada, setUrlAplicada] = useState(false);

useEffect(() => {
    const leerDeUrl = () => {
        const pedida = new URLSearchParams(window.location.search).get('tab');
        if (pedida && navigationTabs.some((t) => t.id === pedida)) setActiveTab(pedida);
        setUrlAplicada(true);   // SIEMPRE, haya o no pestaña en la URL
    };
    leerDeUrl();
    window.addEventListener('popstate', leerDeUrl);
    return () => window.removeEventListener('popstate', leerDeUrl);
}, [navigationTabs]);

useEffect(() => {
    if (!urlAplicada) return;
    const url = new URL(window.location.href);
    const enLaUrl = url.searchParams.get('tab');
    if (enLaUrl === activeTab) return;
    url.searchParams.set('tab', activeTab);
    // Sin pestaña previa en la URL esto es sincronización inicial, no navegación:
    // va con replace, o entrar ya dejaría una entrada de más en el historial.
    if (enLaUrl === null) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
}, [activeTab, urlAplicada]);
```

**`history.pushState` nativo, NO `router.push`:** en el App Router, `router.push` vuelve a
renderizar la página en el servidor con cada cambio de solapa. El proyecto ya aprendió esto
en el gestor de admin.

**Verificado:** `?tab=standings` compartible; Atrás vuelve a la solapa anterior y sigue en
el torneo; deep link en pestaña nueva abre donde corresponde.

---

### A4 · A9 · M2 — Objetivos táctiles

| Elemento | Antes | Después | Regla |
|---|---|---|---|
| «Ver todos» / «Ver tabla» / «Ver cuadro» | 55×18, 51×18, 63×18 | 71×42, 67×42 | `.linkButton { padding: 12px 8px; margin: -12px -8px }` |
| «Ver Fixture» / «Ver Cuadro» | 93×34 | 93×46 | `.ctaBtnSecondary { padding: 13px 18px }` |
| «☆ Seguir» | 79×34 | 79×46 | `.followBtn { padding: 13px 20px }` |
| Selector de temporada | 72×22 | 80×44 | `padding: 11px 14px 11px 16px` **+ `min-height: 44px`** |
| Nombres de equipo (tabla) | 20 px de alto | 44 px | `.colTeamName { padding: 12px 0; margin: -12px 0 }` |

**Resultado: de 12 objetivos por debajo de 24 px (piso WCAG 2.2) a 0.**

Dos trampas que costaron tiempo:

1. **`.ctaBtnSecondary` y `.followBtn` tienen un override en `@media (max-width: 600px)`
   con `padding: 7px 14px`** que deshacía silenciosamente el arreglo de la regla base. Hay
   que subir los dos.
2. **`.colTeamName` NO puede pasar a `display: flex`** para centrar: tiene
   `text-overflow: ellipsis`, que sólo aplica a contenedores de bloque. El padding con
   margen negativo agranda el área sin matar el truncado.

El margen negativo mantiene el layout **exactamente** igual: sólo crece el área táctil.

---

### A6 · Alto — El marcador era lo más chico de la fila

Se renderizaba a **14,1 px en mobile** y **10,6 px en desktop**, contra un `<h1>` de 28 y
38,6 px. El nombre del torneo pesaba cuatro veces más que el resultado — la jerarquía al
revés (lo correcto es marcador > equipos > estado > competición).

```css
.matchScore {
    font-size: 1.15rem;   /* 18,4 px; era 0.95rem → 15,2 */
    font-weight: 800;
    white-space: nowrap;
}
@media (max-width: 600px) { .matchScore { font-size: 1.05rem; letter-spacing: 0.02em; } }
@media (max-width: 380px) { .matchScore { font-size: 1rem; } }
```

**Y —esto es obligatorio— la pista del grid tiene que dejar de ser fija:**

```css
.matchRow {
    /* era: 60px 1fr 88px 1fr 52px */
    grid-template-columns: 60px 1fr minmax(92px, max-content) 1fr;
}
@media (max-width: 900px) { .matchRow { grid-template-columns: 54px 1fr minmax(86px, max-content) 1fr; } }
@media (max-width: 600px) { .matchRow { grid-template-columns: 38px 1fr minmax(84px, max-content) 1fr; } }
@media (max-width: 380px) { .matchRow { grid-template-columns: 34px 1fr minmax(78px, max-content) 1fr; } }
```

Sin esto, «12 − 38» a 20 px pide 95 px en una pista de 88 y **se derrama fuera de la caja**.

La quinta pista de `52px` era del `.matchStatus` que se elimina en B3: si queda, la fila
entera se corre a la izquierda con un hueco muerto a la derecha.

---

### A5 · B3 — Fecha ausente, hora duplicada, «FT» por duplicado

**Medido.** La fila de próximos decía `15:30 | Los Tilos | 15:30 | Los Matreros` — la hora
dos veces y ningún dato del día, con 63 partidos por jugarse. Y cada fila de resultado
llevaba **dos** «FT»: uno a 16 px a la izquierda y otro a 9,6 px a la derecha, en el gris
que además fallaba contraste.

**Causa de la fecha ausente.** `page.module.css` en `@media (max-width: 600px)` tenía
`.matchDateDay { display: none }` — ocultaba la **fecha** y dejaba la hora, que la caja
central ya muestra.

**Solución.** Separar estado de hora en el JSX, que es lo que permitía ocultar una sin la
otra:

```tsx
<span className={styles.matchDateDay}>{dateStr}</span>
{/* Sólo el estado. La hora vivía también acá y la caja central ya la muestra. */}
{isFinished && <span className={styles.matchDateStatus}>FT</span>}
```

Eliminar el bloque `<div className={styles.matchStatus}>` con el `.ftBadge`. En CSS:
`.matchDateDay { display: block }` en mobile, y un `.matchDateStatus` que **sale de
`--fl-text-dim`** — el estado del partido no es información secundaria:

```css
.matchDateStatus {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--fl-text-muted);
    font-family: var(--fl-mono);
    letter-spacing: 0.06em;
    white-space: nowrap;
}
```

**Resultado:** `1/8 | FT | Los Matreros | 3 − 69 | Newman` y `15/8 | Los Tilos | 15:30 | Los Matreros`.

---

### M3 · M4 — Semántica de pestañas y landmarks

**Medido:** 0 `role="tablist"`, 0 `role="tab"`, 0 `aria-selected`. Un lector de pantalla
anunciaba ocho botones sueltos. Y había **dos `<main>`** en el documento, más un buscador
sin nombre accesible.

```tsx
<nav ref={navTabsRef} role="tablist" aria-label="Secciones del torneo">
  {navigationTabs.map((tab) => (
    <button
      key={tab.id}
      id={`tab-${tab.id}`}
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-controls={`panel-${tab.id}`}
      tabIndex={activeTab === tab.id ? 0 : -1}
      onClick={() => setActiveTab(tab.id)}
      onKeyDown={(e) => onTabKeyDown(e, tab.id)}
    >{tab.label}</button>
  ))}
</nav>
```

Con flechas ←/→ y Home/End, y el foco siguiendo a la selección vía `requestAnimationFrame`
(el `tabIndex` del nuevo activo pasa a 0 recién en el render siguiente).

El panel: `id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}`.

**M4:** cambiar el `<main className="g22-container">` de `TournamentDetailClient` por un
`<div>` — `ConditionalLayout` **ya** aporta el landmark (verificado en
`ConditionalLayout.tsx:83`). Y `aria-label="Buscar torneos o clubes"` en los inputs de
`GlobalSearch.tsx` y `search/page.tsx`: el placeholder desaparece al escribir, así que quien
vuelve al campo a mitad de una consulta se queda sin saber qué se esperaba ahí.

---

### A7 · Alto — «TACK 0» en los 14 equipos: un hueco de datos como cero real

Un cero **es** un dato: decía «este club no hizo un solo tackle en 17 partidos», que en
rugby es imposible. Y `TACK ↓/↑` figuraba como criterio de orden, sobre una columna toda
ceros: ordenar no hacía nada y el control parecía roto.

**Solución general**, no un parche para TACK. En `TournamentPublicStats.tsx`:

```ts
/* Estas métricas no salen del resultado del partido: se cuentan sumando eventos
   (`tackle`, `try`, `kick`…) que muchas competiciones no publican. El criterio es
   el total de LA COMPETICIÓN, no el del equipo: un club puede tener 0 tries en una
   temporada mala, pero si la liga entera suma 0, el dato no existe.

   Fuera de la lista quedan a propósito las que derivan del marcador (PJ, PG, PE,
   PP, PTS, PC, DIF) y las de disciplina (TA, TR): ahí el cero sí comunica. */
const EVENT_DERIVED_METRICS = new Set([
    'tries_scored', 'tries_conceded', 'tries',
    'tackles_made', 'tackles', 'passes', 'recoveries',
    'turnovers_won', 'turnovers_lost', 'kick_meters', 'entries_22',
    'conversions', 'conversion_attempts', 'conversion_rate',
    'penalty_goals', 'penalty_goal_attempts', 'drop_goals',
    'penalties_won', 'penalties_conceded', 'free_kicks',
    'knock_ons', 'forward_passes', 'handling_errors',
    'defense_index',
]);

function findUnmeasuredMetrics(rows: any[]): Set<string> {
    const sinDatos = new Set<string>();
    if (!rows.length) return sinDatos;
    EVENT_DERIVED_METRICS.forEach((id) => {
        if (rows.every((row) => n(row?.[id]) === 0)) sinDatos.add(id);
    });
    return sinDatos;
}
```

Tres decisiones de diseño que importan:

1. **La columna se sigue mostrando, con `—`.** Que la métrica exista y no tengamos el dato
   es información; borrarla en silencio dejaría al usuario creyendo que nunca se contempló.
2. **Pero sale del menú de orden** (`sortableColumns`), porque ordenar por una columna toda
   `—` no hace nada.
3. **Se calcula sobre todas las filas, no las filtradas**: si el usuario filtra por un club,
   la métrica no pasa a estar «sin datos» sólo porque ese club no la tenga.

Más un fallback: la vista Defensa ordena por `defense_index` por defecto, que es de las que
puede quedar sin datos; si el orden activo apunta a una métrica no medida, se cae a la
primera ordenable.

---

### B4 · Bajo — El signo de la diferencia, distinto en cada pestaña

Clasificación mostraba `255`, `179`, `-48`. Estadísticas, para los mismos equipos, `+220`,
`+255`, `-96`. El mismo dato con dos convenciones a un click de distancia.

Archivo nuevo `src/lib/utils/formatDifference.ts`:

```ts
export function formatDifference(value: unknown, digits = 0): string {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const abs = Math.abs(num).toLocaleString('es-AR', {
        minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
    if (num > 0) return `+${abs}`;
    if (num < 0) return `-${abs}`;
    return abs;   // el cero va sin signo: no es ni a favor ni en contra
}
```

**La trampa:** la celda de la tabla de posiciones **saltea** la función `value()` de la
columna y usa el número crudo (`TournamentDetailClient.tsx`, ~L3413):

```tsx
const value = column.key === 'diff'
    ? formatDifference(goalDifference)   // ← acá, no en la definición de la columna
    : column.value(row);
```

Y **hay que ensanchar la celda**: `+255` son cuatro caracteres y no entraban en 30 px.

```css
.colValDG { display: block; width: 42px; }
@media (max-width: 600px) { .colValDG { width: 40px; } }
```

---

### A8 · Alto — El popup del Prode tapa el torneo al entrar

En una carga en frío de `/tournaments/[id]` se abre el modal del Mundial sobre un fondo
desenfocado. La bandera `FORCE_ALWAYS_SHOW` está en `false`: aparece siguiendo sus reglas
reales, no por un flag olvidado.

En `src/components/ProdeWorldCupBanner.tsx`:

```tsx
/* Un intersticial se banca en un destino genérico —el home, donde el usuario
   todavía está eligiendo qué mirar—, pero no cuando vino por un link a ESTE
   torneo. Es la peor entrada posible: la que llega de un link compartido o de
   una búsqueda, o sea la de alguien que todavía no conoce el sitio. */
const onDetailRoute = /^\/(tournaments|matches|clubs|players)\/[^/]+/.test(pathname ?? '');
const skipBanner = onProdeRoute || onDetailRoute;
```

Y usar `skipBanner` en el efecto y en su array de dependencias.

---

### B5 · Bajo — Espaciados fuera de la grilla de 4

`.tabButton { padding: 15px 20px }` → `16px 20px`. Los otros (`9px` de los CTA, `22px` del
badge) se resuelven solos al aplicar M2 y A4.

---

### M5 · Medio — Nombres de club truncados por ancho disponible

`Los Matr…`, `Club Ne…`, `Club Ch…`, `Belgran…`. No hay regla de abreviación: se corta donde
llega el espacio, así que **el mismo club aparecía con dos etiquetas distintas en la misma
pantalla** («Club Newman» en la tabla, «Club …» en el lateral). Y `Club Ne…` y `Club Ch…`
empiezan igual: había que mirar el escudo para desambiguar.

**Hallazgo clave: `short_name` ya está poblado en la base**, y con formas mejores que las
siglas de tres letras que la auditoría había propuesto:

`Newman` · `Alumni` · `SIC` · `Hindú` · `Regatas BV` · `Belgrano Ath.` · `Atl. del Rosario`
· `Champagnat` · `CUBA` · `CASI` · `La Plata` · `Los Tilos` · `Los Matreros` · `BIEI`

Sólo faltaba usarlas:

```tsx
function nombreDeFila(equipo: any, nombreCompleto: string) {
    const corto = getExplicitExportShortName(equipo?.short_name)
        || getExplicitExportShortName(equipo?.shortName);
    return corto || nombreCompleto;
}
```

Aplicar **sólo en `renderMatchItem`** (la fila compacta). `renderFeaturedMatch` tiene lugar
de sobra y se queda con el nombre completo. El completo va en el `title`.

**Lo que no cierra.** Medido: cada columna de equipo tiene **63–66 px** para el nombre y a
cuatro clubes les faltan entre **4,2 y 16,5 px**, así que `Champagnat`, `Belgrano Ath.`,
`Regatas BV` y `Los Matreros` siguen truncando. Lo que **sí** se resolvió es la ambigüedad:
`Champ…` y `Belgran…` son inconfundibles; `Club Ch…` y `Club Ne…` no lo eran. Recuperar esos
17 px pide rebalancear la fila (padding, gaps, escudo).

---

### M7 · Medio — De los cinco estados de partido, sólo existían dos

**Esto era peor que «faltan estados».** El tipo canónico del proyecto
(`src/types/match.ts`) declara:

```ts
export type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';
```

Pero el cliente derivaba a mano, en **seis renderers distintos**, siempre la misma pareja
copiada:

```ts
const isLive     = match.status === 'live' || match.status === 'in_play';
const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;
```

Tres agujeros, y los tres se ven en pantalla:

1. **`'final'` no estaba en la lista** — y es el valor que guarda la propia app. Un partido
   terminado dependía de caer en la lista de «resultados» para mostrarse como terminado.
2. **`'postponed'` y `'cancelled'` caían al caso por defecto** y se dibujaban **igual que un
   partido programado, con su horario**. La página mandaba gente a una cancha donde no se
   juega — el peor error posible en esto.
3. **El entretiempo no existía**: un partido en el descanso se mostraba en juego, con el
   minuto congelado en 40'.

**Solución:** un módulo puro, `src/lib/utils/matchState.ts`, con `resolverEstado(status,
{ estaEnResultados })` que devuelve `{ estado, etiqueta, descripcion, muestraMarcador,
relojCorriendo }`.

Dos detalles de implementación que costaron un bug cada uno:

```ts
/* Las siglas cortas NO se pueden buscar por `includes`: son subcadenas unas de
   otras. `aet` (after extra time, o sea TERMINADO) contiene `et`, así que una
   lista de en-vivo con `et` se come todos los AET y los muestra en juego.
   Entonces: las siglas van por igualdad exacta y las frases por inclusión. */
const EXACTOS: Record<string, EstadoDePartido> = {
    ht: 'entretiempo', ft: 'finalizado', aet: 'finalizado', pen: 'finalizado',
    fin: 'finalizado', ot: 'en-vivo', q1: 'en-vivo', q2: 'en-vivo',
    q3: 'en-vivo', q4: 'en-vivo', wo: 'suspendido',
    // `et` queda AFUERA a propósito: en inglés es extra time (en juego) y en
    // castellano entretiempo (detenido). Un dato que puede significar dos cosas
    // opuestas no se adivina; si llega así, cae en programado y no miente.
};

/* El entretiempo se chequea ANTES que "en vivo": "1st half" y "halftime"
   comparten la palabra `half`. Con el orden invertido, todo descanso se leería
   como juego corriendo. */
```

Y la pista de origen **nunca pisa un estado explícito**: un `postponed` que aparezca listado
entre resultados sigue siendo postergado.

**Verificación: 10 tests** en `src/lib/utils/matchState.test.ts` (`node --test`). Los estados
que importan no se pueden reproducir en el navegador —hace falta un partido jugándose un
sábado a las 15:30—, así que la función pura + tests es la única verificación honesta
disponible. **El primer test que corrió encontró el bug del `AET`.**

**Color.** `.matchLive` usaba `--fl-danger`, el rojo que en rugby ya significa tarjeta roja.
Se le da token propio:

```css
--fl-live:     #ff3b30;   /* oscuro: 5,21:1 y 4,79:1 */
--fl-live:     #d92318;   /* claro:  5,00:1 y 4,52:1 */
--fl-off-text: #f0a93a;   /* suspendido, oscuro: 9,19:1 */
--fl-off-text: #8a4b00;   /* suspendido, claro:  6,05:1 sobre el chip teñido */
```

Se mantiene el rojo porque es la convención más fuerte del rubro y la fila no muestra
tarjetas al lado; **lo que se corrige es que el significado quede declarado en vez de
heredado por accidente**. `--fl-warning` no sirve como texto: sobre superficie clara da
3,19:1.

---

### M6 · Medio — Estadísticas: 14 tarjetas de números, sin una barra

La pestaña medía **11.632 px de alto en 390 px** — catorce pantallas. Comparar dos valores
leyendo dos columnas de cifras obliga a hacer la resta mentalmente y a recordar el número
de la tarjeta anterior, catorce pantallas más arriba.

Dos componentes: `BarraFavorContra` (puntos a favor vs. en contra) y `BarraDeBalance`
(PG/PE/PP como una sola proporción). Reglas de diseño:

- **Los números quedan a la vista en los extremos.** La barra agrega proporción, no
  reemplaza el dato.
- **Ninguna información viaja sólo en el color.** Cada tramo lleva su cifra en la leyenda.
- **Sin partidos jugados no se dibuja nada**: media barra de cada lado sugeriría un empate
  que no ocurrió.
- `role="img"` + `aria-label` con el texto completo («11 ganados, 0 empatados, 6 perdidos de
  17 partidos»).

**Y hay que sacar los números que la barra ya dice.** La primera versión dejaba «G 11 · P 6»
arriba y «PG 11 / PP 6» dos líneas abajo — el mismo defecto que el «FT» duplicado.

**Resultado: de 11.632 px a 6.753 px de alto (−42 %).**

---

## 5. Los aciertos — lo que no hay que tocar

Cada personaje encontró algo bien resuelto, y verificarlo importa tanto como encontrar
fallas:

- **La tabla de posiciones colapsa a `# · EQUIPO · J · DG · PTS`** en mobile, que es
  exactamente el set mínimo útil, y **sin scroll horizontal escondido**: el único contenedor
  que scrollea de lado en toda la página es la barra de pestañas.
- **`main` reserva `padding-bottom: 74px`**, así que la barra inferior fija de 78 px no tapa
  nunca la última fila ni la leyenda. Verificado scrolleando hasta el fondo: cero elementos
  tapados.
- **El foco es visible** — `outline: 2px solid #00a365`, con **13 reglas `:focus-visible`
  contra 10 `outline:none`**. No lo borraron, lo reemplazaron.
- **Las zonas de la tabla se marcan con color Y con leyenda** («SEMIFINALES», «DESCENSO»),
  no sólo con color.
- **Los números van en JetBrains Mono**, así que el marcador no se corre al pasar de 9 a 10.
- **`prefers-reduced-motion` está respetado** (3 reglas) y las animaciones duran 0,24–0,48 s.
- **32 de 32 imágenes con `alt`** y sólo 2 sin `lazy`, que son las de arriba del pliegue.
- El local va **siempre** a la izquierda, en las cinco vistas donde aparece una fila.

**Hipótesis descartadas al verificar** (vale la pena registrarlas para no volver a
levantarlas): el recorte de 80 px de la card destacada resultó ser el glow decorativo
`::after` (`right: -80px` + `overflow: hidden`), correcto; y el marcador **sí** usa
monoespaciada, así que el anti-patrón del «marcador que baila» no aplica.

---

## 6. Conflictos entre personajes

Cuatro tensiones donde dos personajes piden cosas incompatibles. Ninguna se resuelve con un
promedio.

**1. Mobile quiere menos pestañas; Desktop las quiere todas a la vista.**
Distinto comportamiento por breakpoint. Abajo de 900 px: cuatro pestañas fijas (Resumen ·
Resultados · Fixture · Clasificación) y un botón «Más». Desde 1024 px: las ocho en línea. El
scroll horizontal actual es justamente el promedio que no le sirve a ninguno.

**2. Desktop pide densidad; el `zoom: 0.7` era un intento de dársela.**
La tensión es legítima y hay que decirlo: el zoom no fue un descuido, el comentario del
código lo documenta. Pero la densidad se compra con **altura de fila y padding**, no con
escala global. Las filas ya miden 42 px, que está bien. El camino es achicar *contenedores*
y dejar el *texto* en 14–16 px reales.

**3. Mobile quiere truncar; el deportivo quiere reconocer el club.**
Abreviatura canónica, no truncado por ancho. Resuelto vía `short_name` (M5).

**4. El diseñador quiere un solo gris; el deportivo necesita que «FT» se lea.**
El token no sobra, estaba mal asignado. `--fl-text-dim` se queda para jerarquía realmente
secundaria; el estado del partido se muda a su propio token.

---

## 7. Las nueve veces que rompí algo (y cómo apareció)

Registro honesto, porque el patrón es más útil que la lista:

| # | Qué rompí | Cómo apareció |
|---|---|---|
| 1 | El marcador agrandado se derramaba de su caja (pista fija de 88 px) | Lo reportó el usuario |
| 2 | Sacar el «FT» duplicado dejó una pista de grid huérfana de 52 px | Lo reportó el usuario |
| 3 | `+255` no entraba en la celda DG de 30 px | Arnés de desborde |
| 4 | La lista blanca de mobile ocultaba el nav → el teléfono se quedó sin selector | Medición de la línea meta |
| 5 | `useRef` como guarda del primer render — inútil bajo StrictMode | Medición de la URL |
| 6 | El efecto de escritura pisaba el deep link antes de que se aplicara | Test de deep link |
| 7 | `AET` leído como «en vivo» por colisión de subcadena con `et` | Test unitario, primera corrida |
| 8 | Números duplicados junto a las barras nuevas | Captura de pantalla |
| 9 | Un `*/` de más en un comentario CSS → hoja entera rota, páginas en blanco | Medición dio `0/0` nodos |

**El patrón:** los tres que el usuario tuvo que reportar (1, 2 y el apilado de dropdowns) son
los que mi primera verificación no podía ver, porque medía **propiedades** y no
**relaciones**. Los seis restantes los agarró el arnés corregido o un test.

Y el #9 merece su propia lección: cuando una medición da un resultado *demasiado* bueno
(`0/0`, «cero texto por debajo de 12 px»), lo primero a sospechar es la medición, no el
éxito.

---

## 8. Lo que quedó pendiente

| ID | Qué | Esfuerzo |
|---|---|---|
| **M8** | Escala tipográfica de 6 pasos que reemplace los 23 tamaños actuales. Es lo que queda expuesto al sacar el zoom: `/rankings` 31 %, `estadísticas` 26 %, `torneo` 16 % de texto todavía bajo 12 px | L |
| **M9** | Listado `/tournaments`: 6.846 px de alto en mobile, «Recomendados» sin escudo, temporada ni estado — el dato existe y el listado elige no usarlo | M |
| — | Gris del pie: `--color-text-muted: #9ca3af` = **2,43:1**. Una línea, pero el token lo consumen ~50 archivos | S |
| — | Verde del logo del pie: `#00a365` sobre `#f9fafb` = **3,13:1**. Mismo caso que M1, fuera del módulo de torneos | S |
| — | Los ~5 parches que compensan a mano el `zoom: 0.7` quedan obsoletos al sacarlo | M |
| — | M5 no cierra: faltan ~17 px por columna para que ningún nombre trunque | M |

---

## 9. Comandos de verificación

```bash
npx tsc --noEmit                              # tipos
npm run build                                 # build de producción
node --test "src/lib/utils/matchState.test.ts"  # estados de partido
node --test "src/**/*.test.ts"                # todo
```

Y los umbrales que valen como criterio de aceptación, todos medidos en el navegador a
390 px y 1440 px, en los dos temas:

- 0 pares de texto/fondo por debajo de su mínimo WCAG
- 0 objetivos interactivos por debajo de 24 px de pantalla
- 0 contenedores con `scrollWidth > clientWidth` que no recorten ni scrolleen
- `documentElement.scrollWidth` dentro del viewport
- un desplegable abierto, visible en toda su altura (`elementFromPoint`)
- 0 errores de consola
