# CLAUDE.md — Minijuego "Carrera de Rugby" (G22 Scores)

Convenciones del feature `src/features/career` y de la ruta
`src/app/juegos/minijuegos/carrera-rugby`. Aplican **siempre**, no solo en la
tarea que tengas entre manos.

---

## 1. La regla que no se rompe: el motor es determinista

Toda la simulación sale de una semilla. Una misma semilla + una misma secuencia
de decisiones tiene que producir exactamente la misma carrera, hoy y dentro de
seis meses.

**Dentro de `src/features/career/engine/` está prohibido:**

- `Math.random()`
- `Date.now()`, `new Date()`, `performance.now()`
- Leer `localStorage`, `window`, `navigator` o cualquier cosa del entorno
- Iterar `Object.keys()` / `Set` / `Map` para elegir un elemento sin ordenar antes
  (el orden de inserción es una fuente de no-determinismo encubierta)

**Lo único que se permite** es el PRNG de `engine/random.ts`
(`createRng`, `hashSeed`, `rngFromState` — mulberry32). Si necesitás azar, pedí
un `rng` por parámetro y devolvé el `rng` actualizado. Nunca lo tomes de un
scope superior.

`Math.random()` aparece **una sola vez en todo el proyecto**: en `CareerFlow.tsx`,
para generar la semilla inicial. Ese es el único lugar legítimo.

Cuando elijas entre candidatos, ordenalos de forma estable primero:

```ts
const ordered = [...rung.clubs].sort((a, b) => a.id.localeCompare(b.id));
const club = rng.weighted(ordered, (c) => strongest - c.rating + 4);
```

---

## 2. Persistencia: si tocás el estado, subí la versión

El guardado vive en
`src/app/juegos/minijuegos/carrera-rugby/careerStorage.ts`, bajo la clave
`g22-carrera-rugby`. El payload lleva **seis campos de versión**:

```ts
{
  schema: 5,
  engineVersion: '1.5.0',
  clubCatalogVersion: '2026-27.6',
  nationsVersion: '2026-07.2',
  competitionLevelsVersion: '2026-27.1',
  environmentVersion: '2026-27.2',
  savedAt: <timestamp>,
  state: CareerState
}
```

Reglas:

| Si cambiás… | Subí… |
|---|---|
| La forma de `CareerState` (campos nuevos, renombrados, borrados) | `schema` |
| Lógica de simulación que altera resultados con la misma semilla | `engineVersion` |
| `BY_EMPLOYMENT`, `STRUCTURE_BONUS`, `DEVELOPMENT_TRACK` u otra constante de `engine/environment.ts` | `CAREER_ENVIRONMENT_VERSION` |
| El catálogo de clubes | `clubCatalogVersion` |
| Países | `nationsVersion` |
| Niveles de competición | `competitionLevelsVersion` |

`loadCareer()` devuelve `{ kind: 'none' | 'ok' | 'outdated' }`. **Nunca hagas que
una partida vieja explote**: si no podés migrarla, devolvé `'outdated'` y que la
UI ofrezca empezar de nuevo con un mensaje claro.

El guardado va siempre envuelto en `try/catch` — modo privado y cuota llena son
escenarios reales, y la partida tiene que poder seguir en memoria:

```ts
} catch {
  // Sin acceso a localStorage (modo privado, cuota): la partida sigue en memoria.
}
```

`CareerState` tiene que ser **serializable a JSON puro**. Nada de `Date`, `Map`,
`Set`, funciones ni referencias circulares. Si te tienta guardar un objeto club
entero, guardá el `id` y resolvelo desde el catálogo.

---

## 3. Los eventos son datos, no código

Viven en `src/features/career/data/events/*.ts` agrupados por familia:
`club.ts`, `environment-events.ts`, `injuries.ts`, `media.ts`, `milestones.ts`,
`national-team.ts`, `personal.ts`, `tactical.ts`, y se exportan desde `index.ts`.

Forma canónica:

```ts
{
  id: 'env-semi-pro-offer',          // prefijo de familia + kebab-case, único
  category: 'club',
  title: 'Oferta profesional',
  text: 'Aparece la chance de dar el salto al profesionalismo full-time.',
  weight: 7,                          // probabilidad relativa dentro del pool
  repeatable: true,
  cooldown: 5,                        // temporadas hasta que puede repetirse
  requires: { employment: ['semi-professional'], maxAge: 31 },
  options: [
    {
      id: 'go-pro',
      label: 'Ir por el contrato',
      hint: 'Dedicarte por completo.',
      outcomes: [
        { weight: 3, effect: { … }, resultText: '…' },
        { weight: 1, effect: { … }, resultText: '…' }
      ]
    }
  ]
}
```

Para agregar contenido **no toques el selector**: agregá objetos al archivo de
la familia que corresponda. Si necesitás una precondición que `requires` todavía
no soporta, extendé `requires` y su evaluador en `engine/event-selector.ts`, no
metas un `if` especial para tu evento.

Prefijos vigentes: `env-` (entorno/empleo), `club-`, `per-` (personal),
`mil-` (hitos), `nt-` (selección), `tac-` (táctica), `med-` (medios),
`inj-` (lesiones).

**Nunca escribas una decisión de una sola opción.** Si el jugador no elige nada,
no es una decisión: es un resultado, y va como tarjeta de resultado con un
"Continuar" visualmente distinto de los botones de decisión.

---

## 4. Voz y escritura

Español rioplatense, voseo, segunda persona. Frases cortas. Sin signos de
exclamación. El tono es de crónica deportiva, no de videojuego.

Bien:

> **Trabajo y entrenamiento**
> El laburo te pisa los horarios de entrenamiento. Algo tenés que resignar.
> · **Priorizar el rugby** — Menos ingresos, más juego.
> · **Cumplir con el trabajo** — Estabilidad.

Mal: *"¡Tomá la decisión más importante de tu carrera!"*, *"Debes elegir"*,
*"tu equipo"* (es *tu club*).

Cada opción lleva un `hint` corto que dice el costo, no solo el beneficio. El
jugador tiene que poder elegir entendiendo qué resigna.

Vocabulario de rugby, no de fútbol: *club* (no equipo), *palos*, *tries*,
*tackles*, *caps*, *seleccionado*, *gira*, *plantel*, *primera*.

---

## 5. Rugby no es fútbol

Al portar ideas del simulador de Copero, respetá las diferencias del deporte:

- **No hay valor de mercado en euros.** El eje económico del rugby es el
  escalafón de empleo (amateur → profesional), no una cifra de traspaso. Nunca
  agregues un "valor" en dinero al jugador.
- **Las estadísticas dependen del puesto.** Apertura → palos. Segunda línea →
  tackles. Wing → tries. Está resuelto en `data/positions.ts`; si agregás una
  estadística, agregala ahí y no en el componente.
- **Los caps valen más que los títulos.** En la jerarquía visual, la selección va
  antes que la vitrina de clubes.
- **La elegibilidad es por residencia, no solo por nacimiento** (`nt-eligibility-switch`).
- **El protocolo de conmoción no se banaliza.** `inj-concussion-protocol` puede
  tener una opción de ocultar el golpe, pero las consecuencias tienen que ser
  serias y estar del lado del riesgo real. No es una decisión "pícara".

---

## 6. UI

- Next.js App Router + Tailwind. Los componentes del juego viven en
  `src/app/juegos/minijuegos/carrera-rugby/*.tsx`.
- **Un solo `<h1>` por página**, y es el título del juego. El logo de G22 nunca
  es un `h1`.
- Todas las imágenes con `loading="lazy"` salvo la que esté sobre el pliegue.
  Hoy el juego cumple 24 de 24 — no lo rompas.
- Los botones de solo ícono llevan `aria-label`.
- Escudos y banderas siempre con `alt` — vacío si son decorativos junto a un
  texto que ya nombra la entidad, descriptivo si van solos.
- Los grupos de selección (posición, nacionalidad, ruta) usan
  `role="radiogroup"` con `aria-checked`.
- Nada de layouts que dejen una columna vacía: si un panel no tiene contenido
  todavía, que colapse en vez de reservar media pantalla.
- El botón deshabilitado siempre dice qué falta para habilitarse. Ya lo hacemos
  bien en `CreatePlayer.tsx` (*"Elegí una nacionalidad y una posición para
  empezar."*) — mantené ese estándar en cualquier formulario nuevo.

---

## 7. Mapa del feature

```
src/app/juegos/minijuegos/carrera-rugby/
  CareerFlow.tsx          orquestador; único lugar con Math.random (semilla)
  CreatePlayer.tsx        selector de nacionalidad + posición
  CountryPicker.tsx       24 destacados + "Ver más"
  PlayerHeader.tsx        cabecera con OVR y estadísticas
  EventCard.tsx           tarjeta de decisión
  SeasonResultInline.tsx  resultado de temporada
  CareerTimeline.tsx      trayectoria
  RetirementSummary.tsx   pantalla de retiro
  ClubBadge.tsx  Flag.tsx
  advanceCareer.ts        avance de temporada
  careerStorage.ts        save / load / clear + versionado

src/features/career/
  engine/     random · run-career · simulate-season · apply-decision · aging
              environment · event-selector · injuries · national-team
              club-offers · contracts · market-routes · domestic-system
              eligibility · scoring · statistics · headlines
              competition-identity · competition-results · create-player
  data/       clubs · countries.generated · nations · positions · origins
              competition-levels2026 · guides · movement-copy
              clubs2026/{saClubs.generated, competitions2026, rosters2026, clubStrength}
              events/{club, environment-events, injuries, media, milestones,
                      national-team, personal, tactical, index}
  state/      career-reducer · career-actions
  types/      career · season
```

Regla de dependencia: `app/**` puede importar de `features/career/**`.
**`features/career/engine/**` no importa nada de `app/**` ni de React.** El motor
tiene que poder correr en un test de Node sin DOM.

---

## 8. Antes de dar algo por terminado

1. `npm run build` y `npx tsc --noEmit` sin errores nuevos.
2. Jugá **una carrera completa** de punta a punta en el navegador.
3. **Probá la recarga**: a mitad de carrera, F5, y verificá que retoma idéntico.
4. Si tocaste el motor, verificá el determinismo: misma semilla y mismas
   decisiones → mismo resultado.
5. Consola sin errores ni warnings nuevos.
6. Si cambiaste el estado, probá que una partida guardada con el esquema anterior
   se resuelve como `'outdated'` y no revienta.

No marques una tarea como completa si algo de esto falla.
