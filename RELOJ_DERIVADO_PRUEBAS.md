# Reloj derivado — checklist de prueba manual

Rama `feat/reloj-derivado`. **No mergear a main sin correr esto entero.**

## Orden de despliegue

1. `supabase/migrations/20260726120000_match_clock_transition_fn.sql` — la función de transición.
2. `supabase/migrations/20260726120100_match_clock_backfill.sql` — el backfill (idempotente, trae su query de verificación al pie).
3. Recién ahí, el código.

Al revés también funciona: sin la función, `runMatchClockTransition` cae al path JS,
que ancla igual a hora de server pero **no es atómico**. No lo dejes así en un fin de
semana con partidos.

## Partido de prueba (no aparece en el feed público ni en el prode)

Dos compuertas independientes, cualquiera alcanza; poné las dos.

| Dónde | Campo | Valor | Por qué |
|---|---|---|---|
| `tournaments` | `status` | `draft` | `isTournamentVisibleToPublic` exige `active` o `published` ([tournamentReview.ts](src/lib/tournamentReview.ts)). El prode filtra `.in('status', ['active','published'])` ([prodePlay.ts:1352](src/lib/server/prodePlay.ts#L1352)) |
| `tournaments` | `is_visible` | `false` | Corta antes que cualquier otra regla |
| `matches` | `is_visible` | `false` | `isMatchVisibleToPublic` ([matchReview.ts](src/lib/matchReview.ts)), aplicado en [api/matches/route.ts:615](src/app/api/matches/route.ts#L615) |

**Usá dos clubes descartables, no clubes reales.** El checklist termina el partido a
propósito (caso 8 → `status: 'final'`), y eso dispara recálculo de posiciones y de
rankings de club para los equipos involucrados. Con clubes de prueba la contaminación
queda encerrada.

Verificación previa: el partido no debe aparecer en `/api/matches?tz=...` ni en el
prode. Chequealo **antes** de empezar a romperlo.

## Los 11 casos

| # | Caso | Esperado | OK |
|---|---|---|---|
| 1 | Refresh a mitad de tiempo con el reloj corriendo | Vuelve corriendo, en el valor correcto, sin perder los segundos del refresh | ☐ |
| 2 | Pestaña en background 5 min | Al volver marca +5:00 reales, no los ~3 min que dejaría el interval throttleado | ☐ |
| 3 | Guardar un evento con el reloj corriendo | Sigue corriendo. No rebobina ni un segundo | ☐ |
| 4 | **FIN 1T a los 41:30** | Queda **41:30** pausado, **no 40:00** | ☐ |
| 5 | **INICIO 2T después de ese FIN** | Salta a **40:00** y queda **pausado**. Solo arranca con REANUDAR | ☐ |
| 6 | Eventos después del INICIO 2T | Se guardan con minuto 40+ | ☐ |
| 7 | Override manual MIN/SEG con el reloj corriendo | Tipeás sin que el tick te pise; al salir del campo aplica y sigue corriendo desde el nuevo valor | ☐ |
| 8 | FIN de partido a los 83:12 | Queda 83:12, **no 80:00** | ☐ |
| 9 | Dos pestañas del mismo partido | La que no tocó nada refleja la transición; ninguna rebobina a la otra | ☐ |
| 10 | Ficha pública durante el partido | Minuto correcto vía espejo legacy cumulativo | ☐ |
| 11 | club-admin del mismo partido | Ídem, sin haberle tocado una línea | ☐ |

### Notas por caso

**2.** Chrome throttlea `setInterval` a 1/min en pestañas ocultas. El caso pasa porque
el valor se recalcula contra `period_started_at`, no se acumula sumando ticks. Probalo
de verdad: dejá la pestaña atrás 5 minutos de reloj de pared.

**4 y 5.** Son el par que motivó la regla. El rebase se engancha al evento de
**arranque**, no al cambio de período: `match_half` avanza el período a 2T pero
**pausa conservando**, y `start_period` rebasa al offset aunque el período ya sea el
correcto. Si el 4 da 40:00, el rebase se enganchó donde no va.

**5.** Ojo con la guarda: el rebase **solo aplica con el reloj pausado**. Si venís del
caso 4 está pausado y funciona. Si probás INICIO 2T con el reloj corriendo, por diseño
no pasa nada.

**7.** El input tiene draft propio (`clock.manual`). Mientras tiene foco el tick no lo
toca. Se persiste en el `onBlur`, como transición `set`.

**9.** El escenario que importa es el que rompía: START en una pestaña y PAUSE en la
otra casi simultáneos. Con la función Postgres el acumulado sale bien porque la
transición es atómica. **Si la migración no corrió, este caso puede desviarse** — es
la razón de que la función vaya primero.

**10 y 11.** Los dos leen el espejo legacy `minute`/`seconds`, que es cumulativo. Es
todo el motivo de la Decisión A. Si acá aparece el minuto del período en vez del
minuto del partido, algo rompió el espejo.

## Pendiente conocido

- `ClubMatchWorkspace.tsx` sigue en modelo snapshot. Lee el espejo legacy, así que no
  se rompe, pero su reloj no es derivado.
- El offset de ET (4800 en rugby) no lo alcanza ningún evento: `start_period` desde
  `2T` devuelve `2T`. Para abrir el suplementario hay que elegir ET en el select y
  usar "Ir al inicio del período".
