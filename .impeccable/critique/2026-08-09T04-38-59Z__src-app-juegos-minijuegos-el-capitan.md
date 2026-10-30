---
target: "http://localhost:3000/juegos/minijuegos/el-capitan (verificación post-fix)"
total_score: 29
p0_count: 0
p1_count: 0
timestamp: 2026-08-09T04-38-59Z
slug: src-app-juegos-minijuegos-el-capitan
---
⚠️ DEGRADED: single-context — y además esto NO es una crítica independiente, sino la **pasada de verificación** posterior a los arreglos del snapshot anterior. Cada punto de abajo se volvió a medir en el navegador; la lectura fresca de un ojo que no hizo los cambios sigue pendiente.

Target: `src/app/juegos/minijuegos/el-capitan`. Chrome headless propio, carrera completa en 1440/390, temas oscuro y claro, teclado por eventos reales de CDP.

## Design Health Score

| # | Heurística | Antes | Ahora | Qué cambió |
|---|-----------|---|---|---|
| 1 | Visibilidad del estado | 2 | 3 | `aria-live="polite"` en la consola (medido: 1 región en todas las pantallas de carrera); el paso `loading` dejó de ser una pantalla en blanco; la barra de Pertenencia pasó de 1190×6 a 420×10 |
| 2 | Sistema ↔ mundo real | 4 | 4 | Sin cambio de puntaje, pero el copy dejó de mentir |
| 3 | Control y libertad | 1 | 2 | Confirmación antes de borrar la partida. Sigue sin deshacer y sin salida propia en la pantalla de carrera |
| 4 | Consistencia | 2 | 3 | El ancho del shell dejó de saltar (medido: `780×11 → 1240×3`, una sola transición); un solo rojo tokenizado; una sola tinta sobre acento |
| 5 | Prevención de error | 2 | 3 | Confirmación destructiva + aviso cuando el guardado no anda |
| 6 | Reconocer > recordar | 3 | 3 | Las cuatro opciones comparten línea de base (los `<button>` centraban su contenido). Sigue sin glosario |
| 7 | Flexibilidad | 1 | 3 | `1`–`4` elige y `Enter` continúa, verificado con eventos de teclado reales |
| 8 | Estética y minimalismo | 2 | 3 | El titular manda sobre la grilla; el aside abre con ≥3 temporadas; el medidor tiene proporción. El vacío vertical sigue |
| 9 | Recuperación de errores | 2 | 3 | El fallo de `localStorage` dejó de ser silencioso |
| 10 | Ayuda y documentación | 1 | 2 | La portada y la metadata describen el juego que existe. Sigue sin glosario de Pertenencia / Techo / HIA |
| **Total** | | **20/40** | **29/40** | **Bueno** |

## Lo verificado, con número

**Contraste — 0 fallos.** Antes: 8 clases por debajo del umbral. Ahora, barriendo el DOM del juego en crear / resultado / pretemporada / momento, en oscuro y en claro, a 1440 y a 390: **lista vacía en las cuatro combinaciones**. Causa raíz atacada en la hoja y no en el síntoma: `--color-text-tertiary` fuera de todo texto, y `--cap-accent-ink` para el verde que se lee (mismo tono, 6,1:1 en claro).

**El intersticial.** `/juegos` entró en `skipBanner`. Medido: no aparece en el juego, **ni siquiera con `?prodeBanner=1`**; sigue apareciendo en el home (control), y su cierre pasó de 36×36 a **44×44**.

**El ancho.** Recorrido de 14 pantallas: `780,780,780,780,780,780,780,780,780,780,780,1240,1240,1240`. Una sola transición, cuando la trayectoria realmente aparece. Antes alternaba en cada "Continuar".

**El fin de temporada.** Titulares reales capturados: *"El año que pegaste el salto"*, *"Un año más en Newman"*, *"Un año más en Vicentinos"*. Y la segunda pasada ahora dice **"Lo que dejó la decisión"** en vez de repetir la misma pantalla.

**Móvil.** Caps, títulos y HIA volvieron a existir en 390 px: fila propia dentro de la cabecera, `301 px`, sin desbordes (`docW == winW == 390`). Antes: `display: none`.

**Objetivos táctiles.** Ninguno por debajo de 44 px dentro del juego.

**Gates.** `npx tsc --noEmit` limpio · `npm run build` completo · `detect.mjs` en 0 hallazgos (antes 3) · consola sin errores en una corrida limpia (0 peticiones fallidas).

**Tests del motor.** `npm run test:captain` tiene 3 rojos, y son exactamente los 3 marcados `ALARMA-VIVA` en `calibration.test.ts` (la pirámide, las dos escaleras, la vitrina). No se tocó `src/features/captain/**`.

## Lo que sigue abierto

- **[P2] El vacío vertical.** Se arregló el salto horizontal y el aside vacío, pero a 1440×900 el contenido sigue terminando cerca de la mitad. La solución real es la pantalla de alto completo que los propios comentarios de `Shell` anticipan, y es un cambio de alcance distinto.
- **[P2] Sin glosario.** Pertenencia, Techo, construido y HIA aparecen en la cabecera desde el minuto cero y nunca se explican.
- **[P2] Sin salida propia en la pantalla de carrera.** Sigue dependiendo del footer y de la barra inferior, como documenta `Shell`.
- **[P2] El eyebrow sigue en el 100% de las tarjetas.** `TRAYECTORIA` dejó de serlo (ahora es un `h2`), pero `PASAN COSAS` y `MINIJUEGOS` siguen siendo andamiaje.
- **[Pendiente de diseño] Cómo le fue al club en cada competición y cómo salió el clásico.** El motor no los tiene: un club juega UNA competición y de ella sólo se sabe quién fue campeón; `state.rival` es un jugador que pelea la camiseta, no un club. Entra por un `shape` del motor, y probablemente suba el `SCHEMA`.
