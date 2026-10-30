# El Entrenador — componentes (2026-10-14)

Tokens: `tokens.dark.json` y `tokens.light.json` (roles → `--color-*` de G22).
Contraste: `python contrast.py tokens.{dark,light}.json` → 13 pares, 0 fallas AA.
Tipografía: la del sitio (Outfit). Nada de fuentes, colores ni marca de la referencia.

Reglas del sistema
- Arriba del pliegue: marcador, contenido principal y acción principal.
- La acción principal vive en `ActionBar` (fixed). No sticky: el `<main>` del sitio lleva `overflow-x: hidden` y anula cualquier sticky.
- Lo secundario se pliega (`<details>`), no se esconde. Si el club jugó una definición, la llave arranca abierta.
- El verde de G22 no va como fondo de texto blanco ni como texto en el tema claro (3,27:1 y 3,13:1): se usan `--e-accent-ink` y `--e-accent-text`.
- Movimiento: entrada de tarjeta de 280 ms, presión de botón `scale(.985)`. Todo se apaga con `prefers-reduced-motion`.

```
TopBar
  partes     volver (ícono, aria-label "Volver a Minijuegos") · h1 del juego · etiqueta (se oculta < 520px)
  tokens     h1 lg/900 · etiqueta micro
  a11y       único h1 de la página

Board (marcador del club)
  partes     escudo · nombre (2 líneas, sin cortar) · torneo, temporada y año · Presión/Caja/Fuerza XV · "Te piden" · progreso de decisiones
  variantes  pretemporada, decisión (con progreso), cierre (sin "Te piden": ya está en el veredicto)
  tokens     franja y degradé con --club (color del club) · líneas de cancha al 6 % · stat 17/800 tabular
  a11y       <dl> con dt/dd; el progreso lleva aria-label "Decisión n de 5"

ActionBar
  partes     botón primario + motivo si está deshabilitado
  estados    habilitado, deshabilitado (fondo surface-2 y texto muted, nunca un verde apagado)
  ubicación  fixed; móvil: encima de la barra del sitio y del área segura; escritorio: 12px del borde
  a11y       el deshabilitado dice qué falta ("Te queda 1 punto por repartir en el perfil")

Stepper (creación)
  partes     1 Tu perfil · 2 Tu club
  estados    actual (aria-current="step"), disponible, bloqueado (paso 2 hasta cerrar el perfil)

ProfileOption / ProfileTuner
  móvil      perfiles como botones de una línea en 2 columnas; la descripción del elegido va una vez
  tuner      −/+ con aria-label por eje · contador "Puntos por repartir" (aria-live) · ±2 por eje, suma fija
  a11y       radiogroup con aria-checked

OfferCard
  partes     escudo · nombre · ciudad/unión ("Ciudad sin verificar" si falta) · chip de tier · torneo y posición · objetivo · 4 datos
  estados    reposo, hover, presionado, elegido (borde y anillo de acento), foco visible
  a11y       radiogroup "Ofertas de trabajo"

EventCard (decisión) y PlayoffBoard
  partes     familia/instancia · título · planteo · opciones A/B/C con costo y probabilidades
  playoff    cruce con los dos escudos, puesto en la tabla y localía · "Chance de ganar" por opción (400 simulaciones con RNG derivado) · llave con lo ya jugado
  a11y       las opciones son <button>; las barras son aria-hidden y el número va en texto

Fold (plegable)
  usos       "Cómo se juega", "Playoff y copas", "Tabla final"
  partes     título + pista (p. ej. "2° de 8 · 52 puntos") + chevron
  a11y       <details>/<summary> nativos

Upgrades / BoardReview / Tier chips
  ver el bloque "Lo que se trajo de El Interino" en entrenador.module.css
```

Medidas en mobile (390×844, barra del sitio de 78px). Antes → después:

| pantalla | alto antes | acción principal antes | alto después | acción principal después |
|---|---|---|---|---|
| creación | 3119 | a 2873px (oculta) | 1066 (paso 1) / 1069 (paso 2) | a la vista |
| pretemporada | 1665 | oculta | 1131 | a la vista |
| decisión | 1288 | — | 957 (entra entera) | — |
| revelado | 1056 | oculta | 845 | a la vista |
| cierre del año | 2431 | oculta | 1424 | a la vista |

Medido también a 360×640 y 1440×900, sin desbordes horizontales. El chequeo recorre elementos, no `scrollWidth`, que miente por el overflow del `<main>`.
