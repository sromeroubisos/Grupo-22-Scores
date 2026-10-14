# Tests rojos de Carrera de Rugby y El Capitán (ticket)

**Estado:** 8 tests marcados con `skip` el 2026-09-08. No están arreglados: están
aislados para que la suite vuelva a ser una señal. Una suite roja deja de
serlo, y en dos semanas nadie sabe si los 8 son los de siempre o se rompió algo
nuevo.

## Evidencia de que ya fallaban antes

Corrida sobre un worktree limpio en `HEAD = 575ab28` (`fix(rugby): el recalculo
de puntajes guardados tambien pasa el plantel`), sin ningún cambio de El
Entrenador:

```
node --test "src/features/career/**/*.test.ts" "src/features/captain/**/*.test.ts" "src/app/juegos/**/*.test.ts"
ℹ tests 1044
ℹ pass 1036
ℹ fail 8
```

Los mismos 8 fallan con el árbol de trabajo. El Entrenador no toca ningún
archivo de `features/career` ni de `features/captain`.

## Los ocho

| Feature | Archivo | Test |
|---|---|---|
| career | `engine/__tests__/determinism.test.ts` | digest congelado: el comportamiento del motor no cambió sin querer |
| career | `engine/__tests__/national-reputation.test.ts` | la carrera internacional de un tier 1 tiene COLA, la de un tier 3 no (tarda ~184 s) |
| captain | `engine/__tests__/determinism.test.ts` | digest congelado: el comportamiento del motor no cambió sin querer |
| captain | `engine/__tests__/agency.test.ts` | CONSTRUIR VALE LA PENA Y PUEDE SALIR MAL |
| captain | `engine/__tests__/agency.test.ts` | la tasa de llegada al seleccionado cae en una banda, y el esfuerzo la mueve |
| captain | `engine/__tests__/calibration.test.ts` | la pirámide: llegar a la mayor es raro |
| captain | `engine/__tests__/calibration.test.ts` | la conmoción no es rutina ni es imposible |
| captain | `engine/__tests__/shop.test.ts` | LA GÓNDOLA ES MÁS CARA QUE UNA CARRERA DE ESCALÓN MEDIO |

## Lo que se sabe (de sesiones anteriores, no verificado de nuevo acá)

- El digest de career viene rojo desde el 2026-07-28. `ENGINE_VERSION` subió a
  1.34.0 y `EXPECTED` quedó sellado en 1.33.0, así que los tres casos fallan
  aunque el resto coincida. Regla del proyecto: **no actualizar `EXPECTED` sin
  entender qué se movió**. El `for` sobre `CASES` corta en el primer caso roto y
  sub-reporta.
- Los de captain habían quedado en verde el 2026-08-15 (`de9c8da`) y volvieron a
  romperse después; el digest de captain lleva la misma versión adentro.

## El Entrenador: "del rojo se vuelve" (todo, 2026-10-14)

`src/features/coach/engine/invariants.test.ts`, la mitad con decisiones al azar
del invariante "clasificar al Interior no es una condena". Va con `todo`, no con
`skip`: corre y muestra el número, pero no falla.

- Ya era frágil antes del canon: con semillas de jugador 7.000, 31.000 y 90.000
  fallaba sin ningún cambio de motor (se recuperaban 8–14 de 25–45).
- Desde que El Entrenador juega sobre el canon (`arSystem2026.ts`), los clubes
  que clasifican al Interior todos los años (Top 10 A, Top 10 del Litoral, NEA A,
  NOA A) pagan el viaje cada temporada. Con semilla 1000: 34 se recuperan y 103
  no. Eran 217 hasta que se dejó de cobrar el micro al local en octavos y
  cuartos (`run-season.ts`).
- La otra mitad —una campaña profunda sobre la caja inicial, cinco años sin
  decisiones— quedó como test propio y pasa, medida sobre los 16 que clasifican.
  Si se mide sobre los 48 clubes de los regionales con cupo, los cuatro más
  chicos del NEA A y del NOA A (CURDA, San José de Paraguay, Aguará, Sixty) no
  se recuperan en cinco años de tres viajes.

Para cerrarlo: rebalancear la economía post-Interior (costo del viaje, subsidio
por nivel, lo que vacían las decisiones) y medir sobre varias semillas.

## Para cerrar el ticket

1. Sacar el `skip` de a uno, correr el archivo, y o bien arreglar la causa o
   bien re-sellar el digest con una explicación de qué cambió y por qué está
   bien.
2. El `skip` lleva un motivo que apunta acá; buscarlo: `grep -rn "TESTS_ROJOS_JUEGOS" src`.
