# Diseño de la consola de torneos

Base de diseño para `/admin/entities/[id]/manage?type=tournament` y, por
extensión, para cualquier espacio de gestión que use el shell **basalt**
(`src/components/admin/entities/tournament/`).

No es un manual de marca. Es el contrato que hace que estas pantallas se
entiendan sin explicación y entren en un monitor sin scrolls de más.

---

## 1. Registro: producto, no portada

El gestor **sirve** a una tarea; no es la tarea. El usuario entra con un
objetivo concreto (cargar un resultado, dar de alta un equipo, publicar) y la
interfaz tiene que desaparecer detrás de eso.

De ahí salen tres decisiones que no se negocian:

| Decisión | Por qué |
|---|---|
| Escala tipográfica **fija**, no fluida | El admin se ve siempre en escritorio y a DPI estable. Un `clamp()` de portada solo hace que el mismo título mida distinto en dos pantallas. |
| Densidad alta, jerarquía clara | Hay muchos datos por pantalla. Se gana con contraste de peso y color, no con tamaño. |
| Vocabulario familiar | Barra superior + pestañas + contenido. Nada de afordancias inventadas para tareas estándar. |

Anti-referencia explícita: la jerga de consola decorativa
(`MODE: TOURNAMENT_CONSOLE`, `SYSTEMS NOMINAL`, `GLOBAL HASH`, `Quick
Validations`). Suena a panel de control y no dice nada. Si un bloque no responde
una pregunta que el gestor realmente se hace, no va.

---

## 2. Anatomía de la pantalla

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER (sticky, ~103px)                                          │
│   slug                                     [chips de estado]     │
│   TÍTULO  [Temporada ▾]        [acciones secundarias] [primaria] │
│   deporte · categoría · formato                                  │
├──────────────────────────────────────────────────────────────────┤
│ PESTAÑAS (sticky bajo el header, 52px)                           │
├───────────────────────────────────────────┬──────────────────────┤
│ CONTENIDO                                 │ BARRA LATERAL        │
│ (padding 32px, misma línea que el título) │ (solo en Resumen)    │
└───────────────────────────────────────────┴──────────────────────┘
```

**Izquierda = qué es esto. Derecha = qué puedo hacer.** El header no mezcla las
dos cosas: identidad y contexto a la izquierda, estado y acciones a la derecha.

### Reglas de la caja

- **Un solo scroll en la pantalla: el de la página.** Ningún panel lleva
  `overflow: auto` con alto calculado. La barra lateral es `position: sticky` +
  `height: auto`: crece con su contenido y nunca corta su último bloque.
- **`align-items: start` en la grilla del shell.** Con `stretch`, la columna de
  contenido se estira al alto de la barra lateral y deja un vacío negro debajo.
- **Sangrado único de 32px.** Header, riel de pestañas y contenido arrancan en
  la misma línea vertical. El riel compensa con `padding: 0 16px` porque cada
  pestaña ya trae 16px propios.
- **Nada fijo abajo.** El header pegajoso ya lleva Guardar y Recalcular; una
  barra inferior fija repite las mismas acciones y se come 110px en todas las
  pestañas.

---

### El cuerpo habla el mismo idioma que la barra

Lo que define el header define el contenido. No hay dos sistemas:

| Elemento | Barra | Cuerpo |
|---|---|---|
| Esquina | 2px (chips, botones) | 4px (paneles, menús) |
| Borde | 1px `--border-basalt` | 1px `--border-basalt` |
| Rótulo de sección | mono, 11px, versalita, tinta atenuada | igual |
| Dato | tinta plena, peso 600 | igual |
| Acento | azul (`--accent-primary`) | azul |

Nada de tarjetas `rounded-xl` sueltas ni de repetir el nombre del torneo dentro
del contenido: ya ocupa la primera línea de la barra. Los paneles del Resumen
usan `.basalt-card` + `.summary-panel`; si agregás uno, seguí ese par.

**Ojo con `.basalt-card`:** arrastra `grid-column: span 12` de la rejilla vieja
de 12 columnas. Dentro de una rejilla de 3, eso lo manda a fila completa. Por
eso `.summary-panel` lo devuelve a `auto`.

### El fondo se cuelga del viewport, no de la caja

`html[data-theme="dark"]` pinta el fondo verdoso de G22 (varios radiales de
`rgba(0,163,101,…)`, uno de ellos pegado al borde inferior). La consola pinta su
propio negro neutro. Si ese negro vive en la caja del shell, el documento
—header del sitio + 100vh— es más alto que la caja, y donde la caja termina
aparece una costura con el verde del sitio debajo.

Por eso el fondo de la consola va en dos pseudo-elementos `position: fixed`
sobre `.basalt-body`: `::before` es la base plana y `::after` la rejilla con su
desvanecido. Cubren la pantalla completa mientras la consola está montada, sin
importar cuánto mida el contenido ni dónde esté el scroll.

Entre hermanos con el mismo `z-index` negativo gana el último del DOM: base en
`::before`, rejilla en `::after`. Si invertís el orden, la rejilla desaparece.

### Menús flotantes

Los menús del header se portalean a `<body>` para escapar del `backdrop-filter`
del header (que crea un bloque contenedor y rompe `position: fixed` en los
descendientes). Consecuencia: **un `top: calc(100% + 8px)` deja de medirse
contra el disparador y pasa a medirse contra el documento** — el menú se abría
al final de la página y de paso la alargaba.

La regla, entonces: menú portaleado ⇒ `position: fixed` + coordenadas
calculadas del rect del disparador (`useAnchoredMenu`). En teléfono no se usa:
`tournament-mobile.css` los ancla como hoja inferior con `!important`, que le
gana al estilo inline.

---

## 3. Tipografía

| Rol | Tamaño | Peso | Notas |
|---|---|---|---|
| Título del torneo (`.basalt-h1`) | 25px | 700 | Mayúsculas, una línea, elipsis. `title` con el nombre completo. |
| Encabezado de tarjeta (`h2`) | 18px | 700 | |
| Encabezado de sección (`h3`) | 15px | 600 | |
| Etiqueta / dato menor (`h4`–`h6`) | 14px | 600 | |
| Texto de apoyo, meta | 12px | 400 | |
| Botones y pestañas | 11.5–12px | 700 | Mayúsculas, `letter-spacing` 0.05em. |
| Chips y datos técnicos | 11px | — | Mono (`JetBrains Mono`). |

**Tracking:** negativo solo en caja baja. El título va en mayúsculas, así que su
`letter-spacing` es **positivo** (0.005em). Un `-0.055em` sobre mayúsculas pega
las letras entre sí.

### La trampa de `globals.css`

`globals.css` declara `h1..h6` con tamaños de portada (`h2: clamp(2rem, 4vw,
3rem)`) **fuera de toda `@layer`**. En Tailwind v4 lo no-capado le gana a
cualquier utilidad, así que un `<h2 className="text-lg">` renderizaba a 48px y
un `<h3 className="text-sm">` a 32px.

Por eso la escala de arriba está fijada en `basalt.css`, acotada a
`.basalt-body`, y **no** depende de clases `text-*`. Si agregás un encabezado en
el gestor, dejá que la escala lo tome: no le pongas `text-lg` esperando que
mande, porque no manda.

---

## 4. Color y jerarquía de acciones

Estrategia **contenida**: neutros teñidos + un acento. El color significa, no
decora.

| Rol | Token / valor | Uso |
|---|---|---|
| Fondo | `--bg-basalt` | Página. |
| Superficie | `--surface-elevated` | Tarjetas y paneles. |
| Borde | `--border-basalt` | Divisiones. |
| Acento | `--accent-primary` (azul) | Pestaña activa, acción de estado, foco. |
| Confirmación | `--accent-success` (verde) | **Solo Guardar.** |
| Alerta | ámbar | Cambios sin guardar, datos a revisar. |
| Error | rojo | Oculto, datos incompletos, borrar. |

### Tres niveles de botón, y uno solo verde

1. **Primario (verde lleno)** — `basalt-btn-primary`. Confirma un cambio
   pendiente. Solo existe cuando hay algo que confirmar.
2. **Acento (contorno azul)** — `basalt-btn-accent`. La acción que manda cuando
   no hay nada que guardar (hoy: Cambiar estado).
3. **Secundario (contorno neutro)** — `basalt-btn`. Todo lo demás.

Dos botones verdes compitiendo en la misma fila es el error a evitar: ninguno
de los dos es entonces "el" siguiente paso.

### Chips de estado

Tres, siempre en el mismo orden: **Estado · Visibilidad · Datos**. Prefijo en
tinta atenuada, valor en tinta plena, punto de color a la izquierda del valor.

El punto lleva el significado: verde (activo, correcto), ámbar (revisar), rojo
(oculto, incompleto), **neutro** (borrador, archivado — estados inertes, no
llevan color). Un punto azul en "Borrador" lo hacía leer como información
activa, igual que "Público".

---

## 5. Accesibilidad

- **Contraste medido, no estimado.** Piso AA (4.5:1 en texto normal). Hoy: ≥6.6:1
  en tema oscuro y ≥5.5:1 en tema claro para cada texto del header.
- **El tema claro no es opcional.** Cualquier color escrito a mano necesita su
  contraparte en el bloque `:root[data-theme="light"]`. Ojo con el orden: una
  regla de variante (`.basalt-btn-accent`) tiene la misma especificidad que la
  genérica (`.basalt-btn`) y el botón lleva las dos clases, así que la variante
  **tiene que ir después**.
- Anillo de foco: definido una vez en `basalt.css` para todo lo enfocable. No se
  quita.
- Botón de solo ícono: `aria-label` obligatorio.
- El estado nunca depende solo del color: el punto va acompañado de su palabra.
- Área táctil de 44px en móvil; en escritorio los controles del header miden
  36px de alto, todos iguales.

---

## 6. Voz

Español, tono llano, caja de oración. Con acentos: es *Operación*, no
*Operacion*.

| Bien | Mal |
|---|---|
| Vista pública | Public view |
| Chequeos · Atajos | Quick Validations · Operation Shortcuts |
| Estado · Borrador | LIFECYCLE · DRAFT |
| Editar participantes | Edit Participant List |

Etiquetas sin punto final. Nada de exclamaciones. El nombre de una acción dice
qué hace, no cómo se siente.

---

## 7. Contrato con móvil

El corte es **767px** y vive en `tournament-mobile.css`. En teléfono el header
conserva lo que identifica y lo que se confirma; el resto se va al menú `⋯`:

| Elemento | ≤767px |
|---|---|
| Título | Hasta dos líneas (`-webkit-line-clamp: 2`), sin elipsis |
| Selector de temporada | Visible, junto al título |
| Chips | Solo el de Estado |
| Línea de meta | Oculta |
| Vista pública · Recalcular · Nueva temporada · Cambiar estado | Ocultos → menú `⋯` |
| Guardar | Visible cuando hay cambios, a ancho completo |

Regla derivada: **si agregás un botón al header, decidí en el mismo commit qué
hace en móvil.** Si no, aparece duplicado (en la barra y en el menú) o
desaparece sin reemplazo.

---

## 8. Antes de dar por terminado un cambio acá

1. `npx tsc --noEmit` y `npm run build` sin errores nuevos.
2. Miralo a 1440px, a 1024px y a 390px. En los tres: sin scroll horizontal y sin
   scroll propio dentro de un panel.
3. Probá los cuatro estados del header: limpio, con cambios sin guardar, nombre
   largo, y torneo sin nombre/sin temporada.
4. Cambiá a tema claro. Todo lo que escribiste tiene que seguir legible.
5. Navegá con el teclado: el anillo de foco tiene que verse en cada control.
6. Si tocaste un ancho, un alto o un padding del shell, verificá que el header y
   el contenido sigan arrancando en la misma línea vertical.

---

## 9. Historial de trampas ya pisadas

Se dejan anotadas para no volver a pagarlas:

- **Eyebrow centrado.** Un bloque declaraba `.basalt-header-eyebrow` en fila con
  `align-items: center`; otro posterior lo pasó a columna sin resetear el
  `align-items`, y el bloque quedó centrado en medio del header.
- **Hueco bajo el header pegajoso.** `margin: 18px ... 0` sobre un elemento
  `sticky` deja una franja por la que se ve pasar el contenido.
- **`<a class="basalt-btn">` 18px más alto que su vecino `<button>`.** Faltaba
  `box-sizing: border-box` explícito en `.basalt-btn`.
- **`min-height` en una fila de botones.** El `⋯` (ícono de 18px) salía 2px más
  alto. En una fila de controles va **altura fija**.
- **`flex-wrap` en la columna de acciones.** El contenedor reclamaba el ancho de
  todo en una línea (~1330px) y le comía el aire al título. Se resolvió con
  `grid`, que mide por fila.
- **`--text-secondary` sin contraparte clara.** Definido solo en el bloque
  oscuro: en tema claro los botones quedaban en 2.55:1.
- **Menú portaleado con `top: calc(100% + 8px)`.** Se abría al final del
  documento, alargando la página. Ver §2, *Menús flotantes*.
- **`grid-column: span 12` heredado en `.basalt-card`.** Dentro de una rejilla
  de 3 columnas, cada panel se comía la fila entera.
- **150px de despeje reservados abajo** para una barra fija que ya no existe.
- **Costura de fondos.** El negro de la consola vivía en la caja del shell y el
  verde del sitio asomaba debajo. Ver §2, *El fondo se cuelga del viewport*.
