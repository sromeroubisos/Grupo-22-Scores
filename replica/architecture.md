# Arquitectura — cerrar la brecha El Interino ↔ El Entrenador

Entrada: `replica/recon.md`, `replica/features.csv`. Alcance elegido por el
usuario el 2026-10-14: **cerrar la brecha del loop central**, sin capa de cuenta.

## 1. Stack

No hay stack nuevo. El juego ya existe y se respeta tal cual:

| capa | elección | por qué |
|---|---|---|
| web | Next.js App Router + TS (el del repo) | El Entrenador vive en `src/app/juegos/minijuegos/el-entrenador` |
| estilos | CSS Modules (`entrenador.module.css`) | es lo que usa el juego; Tailwind no entra a mitad de un módulo |
| motor | `src/features/coach/engine` puro, sin React ni DOM | corre en `node --test`; regla de dependencia del feature |
| azar | mulberry32 de `engine/random.ts` | determinismo: semilla + decisiones → misma carrera |
| persistencia | `localStorage` versionado (`coachStorage.ts`) | migra y sanea, nunca borra |
| base de datos | **ninguna en esta tajada** | Ranking/Logros/guardado en la nube = capa de cuenta, fuera de alcance |

## 2. El "esquema": la forma del estado

No hay SQL: la capa de cuenta (`game_saves`, `game_rankings`) quedó afuera. El
esquema que cambia es el de `CoachState`, y se migra en `coachStorage.ts`.

**Esquema 1 → 2:**

```ts
ClubRuntime {
  cohesion; finances;
  upgrades: Partial<Record<UpgradeId, number>>   // NUEVO. Nivel 0..3. Del CLUB: se pierde al cambiar de club
}
SeasonEntry {
  …;
  board?: BoardReview                            // NUEVO, opcional: las temporadas viejas no lo tienen
}
BoardReview { deportivo: 0..100; caja: 0..100; cantera: 0..100; nota: 0..100 }
```

Migrador `1: (s) => ({ ...s, club: { ...s.club, upgrades: {} } })`. Las
temporadas viejas quedan sin `board` y la UI no lo muestra. El saneado acota
cada nivel a 0..3 y descarta ids de mejora que ya no existan.

**Lo que NO se guarda (derivado):**

- Las ofertas de club: salen de `hashSeed('ofertas:' + seed + ':' + season)`.
  Recargar muestra las mismas tres, y no consumen el RNG de la carrera, así que
  mirar ofertas no altera el futuro.
- El tier de una oferta: posición del club por fuerza dentro de su torneo.
- El costo de una mejora: función de los socios y el nivel.

**Atributos ajustados:** `coach.attrs` ya se guarda. El ajuste solo cambia el
valor inicial: no hay campo nuevo.

## 3. La API (funciones del motor, no rutas HTTP)

| función | qué hace | quién la llama | entrada | salida | flujo |
|---|---|---|---|---|---|
| `tuneAttrs(profile, attrs)` | valida el ajuste (±2 por eje, 1..10, suma 25) | CreateCoach, createCareer | perfil, attrs | attrs válidos o null | F01 |
| `createCareer(seed, clubId, profileId, attrs?)` | firma opcional: attrs ajustados | CoachFlow | — | CoachState | F01 |
| `startingOffers(seed, world)` | 3 ofertas C/B/A de nivel 4–5 | CreateCoach | semilla, pirámide | ClubOffer[] | F01 |
| `jobOffers(state)` | 4 ofertas al cambiar de club, techo por reputación | CoachFlow (tras despido) | estado | ClubOffer[] | F04 |
| `upgradeCost(state, id)` | precio del próximo nivel | PreseasonBoard | estado, id | pesos o null (al tope) | F02 |
| `buyUpgrade(state, id)` | descuenta caja, sube nivel. Solo en pretemporada y con caja ≥ precio | PreseasonBoard | estado, id | CoachState | F02 |
| `boardReview(...)` | nota de la directiva en tres ejes | playSeason | posición, caja, plantel | BoardReview | F03 |

Las mejoras entran al motor en un solo lugar cada una:

| mejora | dónde pega | efecto por nivel |
|---|---|---|
| `kinesiologia` | `sidelineOf` → `extraInjuryRisk` | −1,2 pts de riesgo por partido (base 8 %, piso 2 %) |
| `gimnasio` | `ageSquad` → `growthFactor` | +7 % de crecimiento de los ≤27 |
| `m19` | `promoteFromAcademy` | el pibe que sube trae +2 de nivel |
| `video` | `sidelineOf` → `seasonRating` | +0,5 de rating de equipo |
| `micro` | `seasonBudget` → viajes | −10 % del costo de viajes (liga y copa) |

## 4. Lo que muerde

- **Determinismo.** Las ofertas usan un RNG DERIVADO, nunca `state.rngState`.
  `buyUpgrade` no usa azar. Mejoras → cambia la simulación → `ENGINE_VERSION`
  1.0.0 → 1.1.0.
- **Balance.** Las mejoras son un sumidero de caja que compite con el viaje al
  Interior. El harness de 1.000 carreras (`invariants.test.ts`) compra mejoras al
  azar y tiene que seguir verde: despidos entre 10 y 70 %, del rojo se vuelve.
- **Guardado.** `SCHEMA` 1 → 2 con migrador. Un guardado del esquema 1 tiene que
  cargar (test en `coachStorage.test.ts`).
- **Accesibilidad.** Ofertas y perfiles son `radiogroup`; −/+ con `aria-label`;
  el botón deshabilitado dice qué falta.
- **Sin dinero de jugadores.** Las mejoras se pagan con la caja del CLUB. Ningún
  jugador tiene precio.

Multi-tenant, tiempo real, webhooks, mails, GDPR: no aplica (todo es local).

## 5. Orden de construcción

1. **Motor** — `data/upgrades.ts`, `engine/upgrades.ts`, `engine/offers.ts`,
   `engine/board.ts`, ajuste de perfil; enganche en `run-season`, `squad`,
   `economy`; tipos; `index.ts`.
2. **Guardado** — esquema 2, migrador, saneado.
3. **Tests** — unitarios de cada pieza + harness de invariantes.
4. **UI** — CreateCoach (ajuste + ofertas), pestaña "Club" en la pretemporada,
   evaluación de la directiva en SeasonResult, ofertas tras el despido.
5. **Verificación** — tsc, tests, una carrera completa en el navegador, F5 a
   mitad de carrera, guardado del esquema 1.
