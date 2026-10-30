---
target: "http://localhost:3000/juegos/minijuegos/el-capitan"
total_score: 20
p0_count: 1
p1_count: 4
timestamp: 2026-08-09T03-56-41Z
slug: src-app-juegos-minijuegos-el-capitan
---
⚠️ DEGRADED: single-context (las reglas de esta sesión prohíben lanzar sub-agentes salvo pedido explícito del usuario)

Target: `src/app/juegos/minijuegos/el-capitan` · medido en Chrome headless propio (el perfil del MCP de Playwright estaba tomado), recorriendo 5 temporadas reales del juego en 1920/1440/1280/1024/1023/900/768/390/360 y en los dos temas.

## Design Health Score

| # | Heurística | Puntaje | Hallazgo |
|---|-----------|-------|----------|
| 1 | Visibilidad del estado | 2 | Cero `aria-live` en todas las pantallas; el paso `loading` pinta un shell vacío; la barra de Pertenencia mide 1190×6 px en escritorio (198:1) y no se lee |
| 2 | Sistema ↔ mundo real | 4 | Lo mejor del juego: voseo, vocabulario de rugby, caps antes que vitrina, puestos con sus números |
| 3 | Control y libertad | 1 | La pantalla de carrera no tiene salida propia (`salida={false}`); no hay deshacer, ni volver, ni abandonar partida |
| 4 | Consistencia | 2 | El contenedor salta 780↔1240 px entre pantallas consecutivas; tres rojos distintos hardcodeados; eyebrow en el 100% de las tarjetas |
| 5 | Prevención de error | 2 | "Empezar una nueva" borra la carrera guardada sin confirmar |
| 6 | Reconocer > recordar | 3 | Ganancias, techo, costo y probabilidades a la vista; pero comparar 4 entrenamientos exige leer 4 bloques de prosa |
| 7 | Flexibilidad y eficiencia | 1 | Sin atajos de teclado en un juego de 1-de-4; sin saltar el resultado repetido |
| 8 | Estética y minimalismo | 2 | ~45% del viewport vacío en cada pantalla; el aside reserva 452 px para una línea |
| 9 | Recuperación de errores | 2 | Partida vieja → mensaje claro (bien); fallo de `localStorage` se traga en silencio y el jugador nunca se entera |
| 10 | Ayuda y documentación | 1 | La portada describe mecánicas que ya no existen ("seis fichas de tiempo") |
| **Total** | | **20/40** | **Aceptable (borde bajo)** |

## Anti-Patterns Verdict

**Evaluación propia.** No parece hecho por IA — y eso es mérito real. La voz es de crónica, no de videojuego; la paleta es un verde y nada más; no hay glassmorphism, ni texto con degradado, ni la plantilla de métrica-héroe. Los dos tells que quedan:

- **Eyebrow diminuto en versalitas trackeadas sobre CADA tarjeta**: `MINIJUEGOS`, `EMPEZÁS EN LA M19`, `TEMPORADA 1 · 18 AÑOS · APERTURA`, `PASAN COSAS`, `TRAYECTORIA`, `MINUTO 49 · EL MOMENTO`. Algunos cargan información real (temporada/edad/puesto, minuto). Otros son andamiaje: `PASAN COSAS` no dice nada y `TRAYECTORIA` es un `h3` disfrazado.
- **Grilla de tarjetas idénticas**: los cuatro entrenamientos son cuatro cajas iguales en 2×2, cada una con cinco micro-tipografías apiladas. No se pueden comparar por columna.

**Escaneo determinista** (`detect.mjs` sobre el directorio, 3 hallazgos, todos en `capitan.module.css`):
- `border-left: 3px solid rgba(--color-accent-rgb, .5)` en `.note` (L515) — el side-stripe. Confirmado a ojo: la línea del "Minuto 49" lo lleva.
- `transition: width` en `.fill` (L250) y `.bandaSpaceFill` (L1136) — anima una propiedad de layout.

**Overlays visuales**: no se inyectó overlay. El servidor de dev del usuario ya estaba corriendo y no monté el live-server; la evidencia es de screenshots + medición por CDP.

## Overall Impression

Este juego está mejor escrito que diseñado. El CSS tiene comentarios que documentan auditorías de contraste con ratios medidos, el porqué de cada decisión de layout y hasta la política del sitio sobre tipografía — es de lo más cuidado que vi en este repo. Y sin embargo la pantalla que le llega al jugador tiene un pop-up del Mundial de fútbol encima, la mitad inferior negra, y una barra de Pertenencia que no se ve.

La brecha es siempre la misma: **las correcciones se aplicaron al elemento que las motivó y no barrieron la hoja**. La cabecera se auditó a fondo; el formulario, las fichas y la escala clara quedaron con el mismo defecto que la cabecera tenía.

La oportunidad más grande no es de píxeles: es que **el resultado de la temporada —el clímax del bucle— es una tabla de cuatro celdas grises**. El juego se vende como crónica deportiva y reporta el año como planilla.

## What's Working

1. **La voz.** "Doscientas patadas por día", "el cuerpo lo paga", "Dejan de venirte a buscar". No hay una sola frase de videojuego. El `hint` dice lo que resignás, no solo lo que ganás — que es la regla difícil y está cumplida.
2. **La honestidad de la tarjeta de pretemporada.** Ganancia, aporte de techo, costo y prosa, todo antes de elegir; y `costLabel()` se arma de los tres campos del catálogo, así que no puede mentir aunque alguien cambie el riesgo y se olvide del texto. Eso es diseño de sistema, no de pantalla.
3. **La cabecera.** El chip de MEDIA con el techo al lado y "(+5 construido)" cuenta dos historias —dónde estás y qué construiste vos— en dos líneas y sin adornos.

## Priority Issues

### [P0] Un intersticial del Mundial de fútbol tapa el juego en curso

`ProdeWorldCupBanner` exime `/prode` y las rutas de detalle (`tournaments|matches|clubs|players`), pero **no `/juegos`**. Lo capturé apareciendo sobre una decisión de carrera: desenfoca la pantalla entera y la única acción posible es cerrar algo que nadie pidió.

- **Por qué importa**: es peor que el caso que el propio código ya decidió excluir. En un torneo perdés lectura; acá perdés una partida en curso, y encima es fútbol interrumpiendo un juego de rugby.
- **Además**: el diálogo no tiene `role="dialog"` ni `aria-modal`; el único cierre es un botón de 36×36 px (bajo el mínimo de 44) arriba a la derecha, fuera de la zona del pulgar en 390 px.
- **Fix**: sumar `/juegos` a `skipBanner` en `ProdeWorldCupBanner.tsx:55`. Y de paso: `role="dialog"`, `aria-modal="true"`, cierre de 44 px y `Escape`.

### [P1] El contraste que se arregló en la cabecera nunca barrió el resto de la hoja

`--color-text-tertiary` (#71717a oscuro / #6b7280 claro) falla en los dos temas y sigue en 10 clases. Medido en vivo:

| Clase | Ratio | Tamaño | Qué es |
|---|---|---|---|
| `.choiceMeta` | **3,52:1** | 12 px | "penales de scrum ganados · se retira a los 36" — el dato con el que se elige el puesto |
| `.fieldLabel` | **3,87:1** | 12,5 px | NOMBRE Y APELLIDO / DE DÓNDE SOS / TU PUESTO |
| `.primaryHint` | **3,87:1** | 12,8 px | "Poné tu nombre y elegí un puesto para empezar" |

Y en tema claro se suma el acento, que es el mismo `#00a365` en los dos temas — cosa que el propio archivo documenta en `.ovrLabel` y después no aplica en ningún otro lado:

| Clase | Ratio claro | Qué es |
|---|---|---|
| `.trainingChip` | **2,97:1** | "+6 Pegada" — la ganancia |
| `.trainingCeiling` | **2,97:1** | "↑ Techo +0,9" |
| `.seasonAge` | **2,97:1** | la edad en la trayectoria |
| `.trainingCost` | **3,38:1** | "⚠️ el cuerpo lo paga" — el costo |
| `.eyebrow` | **3,13:1** | temporada · edad · puesto |

- **Por qué importa**: el CLAUDE.md §3.1 exige que el costo y las probabilidades estén a la vista antes de elegir. En tema claro son lo menos legible de la tarjeta. Y el §6 exige que el botón deshabilitado diga qué falta — lo dice a 3,87:1.
- **Fix**: retirar `--color-text-tertiary` de todo texto que no sea decorativo; y para el acento sobre superficie clara, un `--color-accent-ink` más oscuro (o el gris primario, como ya se hizo con `.ovrLabel`).

### [P1] La portada explica un juego que ya no existe

> "Cada temporada repartís **seis fichas de tiempo** entre entrenar, laburar, el club, la familia y el gimnasio"

`TrainingCard.tsx` dice en su propio comentario: *"Reemplaza al reparto de las seis fichas"*. El juego real es elegir 1 de 4 cartas. El texto está en la portada **y en el `description` de la metadata**, o sea también en buscadores y en lo que se comparte.

- **Por qué importa**: es la única explicación de mecánica que recibe un jugador nuevo, y es falsa. Jordan lee eso, entra, y busca seis fichas que no están.
- **Fix**: reescribir el párrafo de `CaptainFlow.tsx:194` y el `description` de `page.tsx:8`. De paso: la portada dice "De la M14" y la creación dice "Empezás en la M19".

### [P1] Media pantalla vacía, y el ancho salta en cada paso

Medido a 1440×900 con la trayectoria abierta: el contenido termina en y≈480 y quedan ~420 px de negro. Y el shell alterna `max-width: 780px` ↔ `1240px` **entre pantallas consecutivas**, porque `:has(.consoleAside)` sólo pregunta si el aside existe:

| Paso | Aside | Ancho del shell | Ancho de la tarjeta |
|---|---|---|---|
| Pretemporada | sí | 1240 | 722 |
| Se terminó el año | no | 780 | 732 |
| Pasan cosas | sí | 1240 | 722 |
| Se terminó el año | no | 780 | 732 |

La tarjeta se corre horizontalmente en cada "Continuar". Y con una sola temporada jugada, el aside reserva **452 px para una línea de 18 px** — que es exactamente lo que el §6 del CLAUDE.md prohíbe ("nada de layouts que dejen una columna vacía"): la condición `:has()` mira existencia, no contenido.

Bonus del mismo bloque: cruzar 1024 px **achica** la tarjeta de decisión de 744 a 570 px, porque justo ahí se abre la segunda columna.

- **Fix**: fijar el ancho del shell para toda la fase de carrera (no por pantalla), y abrir el aside recién con ≥3 temporadas —o moverlo a un `<details>` en escritorio angosto.

### [P1] El clímax del bucle es una planilla, y se muestra dos veces

La temporada termina así: eyebrow, "Se terminó el año", cuatro celdas grises (PARTIDOS 11 · PUNTOS 61,3 · PORCENTAJE AL PALO 70,4% · MEDIA 53 (+1)) y un "Continuar" en botón fantasma —la única acción de la pantalla, con el estilo más débil que hay en la hoja—.

Y por el diseño del flujo (`CaptainFlow.tsx:166`), tras elegir en una decisión **se vuelve a la misma pantalla, con el mismo eyebrow y el mismo título**. Lo verifiqué en 5 temporadas seguidas: el ciclo real es Pretemporada → Se terminó el año → Pasan cosas → **Se terminó el año otra vez** → Pretemporada. Nada indica que la segunda es la misma temporada con la consecuencia agregada.

- **Por qué importa**: la regla del pico-final dice que el recuerdo de una temporada se forma acá. Hoy el pico es una tabla, y el remate es verla repetida.
- **Fix**: que el resultado tenga un titular de crónica (el motor ya tiene `headlines.ts`) y que la segunda pasada se presente como lo que es —"Lo que dejó la decisión"— con su propio título.

## Persona Red Flags

**Jordan (primera vez)**: la portada le promete seis fichas y el juego le da una carta de cuatro opciones. Nunca se le explica qué es "Pertenencia", "Techo", "construido" ni "HIA" —los cuatro aparecen en la cabecera desde el minuto cero, sin ayuda contextual—. El primer clic real es elegir puesto, que el propio texto llama "la decisión más determinante del juego", y el dato para decidir está a 3,52:1.

**Casey (móvil, un pulgar)**: acá el juego está mejor —cabe en 390 sin scroll horizontal y las tarjetas son cómodas—. Pero abajo de 560 px `@media { .headerStats { display: none } }` **borra caps, títulos y HIA**. O sea: el §5 del CLAUDE.md pone los caps por encima de la vitrina, y en el dispositivo donde más se juega no se ven en ninguna parte. En 360 px hay un botón bajo el pliegue.

**Sam (lector de pantalla / teclado)**: el anillo de foco está bien (2 px de acento, global, verificado tabulando de verdad). Lo que falta es todo lo demás: **cero `aria-live` en todo el juego**. La media sube, el club cambia, la temporada se resuelve y se anuncia el pop-up del Mundial — nada de eso se anuncia. Un juego que reemplaza la pantalla entera en su lugar sin región viva es, para un lector de pantalla, silencio después de cada clic. Sumale el diálogo del prode sin `role`/`aria-modal`.

**El hincha de rugby (persona del PRODUCT.md)**: la promesa de "estadísticas con respaldo, nunca decorativas" se cumple en el motor. En pantalla, "PUNTOS 61,3" con un decimal en una celda gris no se lee como el año de un apertura; se lee como una fila de una tabla de la que no puede pedir el detalle.

## Minor Observations

- Tres rojos distintos hardcodeados y ninguno tokenizado: `#e0574f` (`.trainingCost`), `#e0616a` (`.cellDown`, `.verdictBad`), `#d64545` (`.jackalPipFoul`, `.anclaMarkBroken`, `.palosBallOut`, `.bandaCloserFill`). Ninguno cambia con el tema.
- `.note` lleva `border-left: 3px` de acento — el side-stripe. Con el fondo tintado que ya tiene, la franja no agrega nada.
- La barra de Pertenencia en escritorio es de 1190×6 px. A esa proporción un 3% de avance es un punto verde indistinguible de un artefacto de render.
- "Empezar una nueva" borra la partida guardada sin confirmación, y es el botón que está justo debajo de "Continuar la carrera".
- El fallo de `localStorage` se traga en silencio (correcto que no reviente, pero el jugador debería enterarse de que esa carrera no se está guardando).
- `.fill` y `.bandaSpaceFill` animan `width`. `transform: scaleX()` con `transform-origin: left` hace lo mismo sin tocar el layout.
- El paso `loading` renderiza un `<Shell />` vacío: por un instante la pantalla queda en blanco sin ninguna señal.
- Sin atajos de teclado. Un juego cuyo 90% de las interacciones es "elegí 1 de 4" pide `1`–`4` y `Enter` para continuar.
- Consola limpia: sólo un warning de preload de Next ajeno a esta ruta.
- La recarga a media carrera funciona: vuelve con "Continuar la carrera" (§8.3 cumplido).

## Questions to Consider

- Si el resultado de la temporada tuviera un titular en vez de cuatro celdas, ¿haría falta la tabla?
- ¿La trayectoria tiene que estar al lado de la decisión, o es algo que se consulta y podría vivir detrás de un gesto?
- El juego dice que va camino a ser pantalla completa sin footer. ¿Y si eso fuera ahora? Resolvería el vacío, el intersticial y la salida de una sola vez.
- Si en móvil no entran caps, títulos y HIA, ¿es que sobran en escritorio, o es que la cabecera no está eligiendo?
