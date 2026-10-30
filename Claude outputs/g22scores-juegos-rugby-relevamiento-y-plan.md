# Juegos de rugby de g22scores — relevamiento completo y plan

**Encargo:** cómo adaptar los sistemas de *El Interino* a los juegos de rugby de g22scores.
**Fecha:** 8 de septiembre de 2026.
**Fuentes leídas:** código en la máquina (`Grupo-22-Scores`, `rugby-manager-pro`, `Rugby Manager`, `RUGBY MANAGER V2`) y el `index.html` desplegado de `interino.web.app`. Todo lo que sigue sale de leer archivos, no de suposiciones; donde no pude verificar algo, está dicho.

---

## 0. Resumen ejecutivo — tres cosas que cambian el encargo

**1. No hay que portar El Interino a rugby. Ya hay cinco bases de código de rugby.** El relevamiento encontró:

| # | Activo | Estado | Tamaño | Última actividad |
|---|---|---|---|---|
| 1 | **Carrera de Rugby** (g22scores) | En producción | 38.662 líneas de motor + 7.224 de consola | Activo |
| 2 | **El Capitán** (g22scores) | En producción | ~15.000 de motor + 11.773 de UI + 7.273 de CSS | Activo |
| 3 | **Prode** (g22scores) | En producción | 1.885 + 1.130 líneas de servidor | Activo |
| 4 | **rugby-manager-pro** | Pausado a mitad de un sistema | 77.938 líneas, 251 archivos | 22-jul-2026 |
| 5 | **Rugby Manager** (React) + **GDD v1.0** | Pausado en seco | 23.409 líneas + GDD de 39.000 caracteres | 20-may-2026 |

El problema no es falta de motor. Es que hay **cinco motores y ninguna capa de cuenta**.

**2. Los dos juegos que están en producción tienen un bug estructural que borra las partidas de todos los jugadores en cada release.** Carrera de Rugby guarda en `localStorage` bajo `g22-carrera-rugby` con `SCHEMA = 17` y sella siete versiones de catálogo más `ENGINE_VERSION`; El Capitán guarda en `g22-el-capitan` con `SCHEMA = 18` y sella **doce** versiones. La política, escrita en el código, es *cero migraciones*: cualquier desajuste devuelve `{kind:'outdated'}`, borra la clave y ofrece empezar de nuevo. Traducido: cada vez que tocás un evento, un club o el motor, todo el que tenía una carrera de 18 temporadas la pierde. Con 17 y 18 schemas ya recorridos, eso pasó decenas de veces.

**3. Los tres juegos son de jugador. Falta el de entrenador — y es exactamente el hueco que llena El Interino.** Carrera de Rugby y El Capitán son carreras de un jugador (uno más simulacionista, otro más narrativo con minijuegos). El Prode es predicción. **No existe el juego de dirigir un club**, que es el género de El Interino, el de *Rugby Manager* (GDD) y el de *rugby-manager-pro* — los dos proyectos parados.

**La conclusión del relevamiento, en una línea:** lo que hay que traer de El Interino no es su motor de partido — es su **capa de cuenta y retención**, que es justo lo que los juegos de g22scores no tienen y lo que convierte un minijuego que se juega una vez en un producto al que se vuelve.

---

## PARTE I — RELEVAMIENTO

### 1. Carrera de Rugby

**Dónde vive:** la carpeta `src/app/juegos/minijuegos/carrera-rugby/` es solo la consola. El motor está en `src/features/career/` — **38.662 líneas**, `ENGINE_VERSION = '1.35.0'`. `advanceCareer.ts` son 49 líneas que encadenan `careerReducer` hasta que haya algo que mostrar (`MAX_STEPS = 8`).

**El juego:** carrera de jugador de los 18 (`START_AGE`) al retiro (opcional 34–38, forzado a 39). 16–21 temporadas, entre 7 y 20 decisiones según `paceMode` (`SEASONS_PER_DECISION = {intense:1, normal:2, express:3}`). Cinco pantallas: `loading → intro → create → club → career`.

**Lo bueno, y es mucho:**

- **Determinismo real.** Prohibido `Math.random`/`Date.now` dentro de `engine/`; solo mulberry32 de `engine/random.ts`. La regla está escrita en el `CLAUDE.md` del repo (que, ojo, es el manual de este minijuego, no del proyecto entero).
- **Progresión seria.** `growthScale = growthScaleFor(ovr, potential) × environmentSupport × loadPenaltyFactor × youthDrive × developmentRoll × merit × profileFactor`, con picos por atributo y grupo (`PEAKS`: speed de back a los 25, power de forward a los 30, vision/mental a los 40) y declive `clamp((age-peak)/4.5, 0.3, 2.2)` acelerado ×1.5 para la velocidad de los backs pasados los 30. Bandas de potencial ponderadas (`CEILING_BANDS`: 80–84 con peso 50, 99 con peso 0.8).
- **Lesiones tipificadas:** 7 con pesos, secuelas permanentes (+8 de `injuryRisk`, −1.5 a −3.2 en power/speed/stamina), chance `0.10 + injuryRisk*0.0035 + fatigue*0.0025 + max(0,edad-28)*0.010 + max(0,edad-33)*0.022 + gravesPrevias*0.03`, tope 0.75.
- **Elegibilidad World Rugby Regla 8 completa** (`registrationMonths`, `presenceMonths`, `capturedBy`) y selección con `DEBUT_BY_REPUTATION = [57,61,74,78,81,84]` más `AMATEUR_SURCHARGE = [3,3,8,14,20,26]`.
- **86 eventos** en `ALL_EVENTS`, distribuidos en 10 familias, con gating por edad, OVR, puesto, flags y `EventRequirements`.
- **Puestos con escasez** (`data/positions.ts`): 9 puestos con `weights` que suman 100, `retirement {soft, hard}` por puesto (wing 31/35, pilar 34/39) y **`scarcity: 2` para prop/hooker/lock**, con `scarcityNumbers: [3]` — solo el pilar derecho la cobra.
- **Compartir bien resuelto:** el token es una **receta** (`{seed, position, nationality, startRoute, paceMode, surname, number, startClubId, decisions[], receipt}`) en base64url, no un resultado; el servidor re-corre el motor. Tarjetas 1200×630 / 1080×1350 / 1080×1920 dibujadas con **Satori del lado del servidor**, i18n español/inglés completo (`i18n/ui.ts`, 735 líneas).

**Lo que le falta:**

- **Backend de partida: cero.** Solo `localStorage`, una carrera a la vez, sin cuenta, sin sincronización entre dispositivos, sin historial. `/api/carrera/` solo tiene `logos/route.ts` (dev).
- **Leaderboard: no existe.** `careerScore = peakOvr*40 + titles*120 + caps*8 + tries*6 + assists*2 + fame*3 + seasons*15 + 1500 + 400` se calcula al retirarse **y se tira**. El token está diseñado para validación server-side y nadie la usa.
- Sin partidos, sin plantel, sin compañeros, sin economía (decisión explícita: `Effect.statBoost` reemplaza al dinero), sin negociación (las ofertas son aceptar/rechazar), sin metaprogresión entre carreras, sin arcos narrativos multi-temporada.
- **Código muerto:** `ACADEMY_EVENTS` (6 eventos en `academy.ts`) está escrito y nunca se importa en `index.ts`.

**Archivos más grandes:** `saClubs.generated.ts` 4.296 · `market-routes.ts` 1.287 · `arSystem2026.ts` 950 · `rosters2026.ts` 789 · `CareerSpine.tsx` 736 · `i18n/ui.ts` 735 · `types/career.ts` 729 · `simulate-season.ts` 707.

### 2. El Capitán

**Dónde vive:** UI en `src/app/juegos/minijuegos/el-capitan/` (11.773 líneas + **7.273 de CSS en un solo módulo**), motor en `src/features/captain/` (`CAPTAIN_ENGINE_VERSION = '0.39.0'`).

**El juego:** carrera de jugador de los 16 (`START_AGE`) al retiro (`CAREER_HARD_CAP = 40`), 8 a 24 temporadas, 15–35 minutos. Bucle por temporada: pretemporada (elegís UNA cosa para entrenar) → **momento** (`MOMENT_PROB = 0.62`) → temporada simulada → torneo representativo → decisión (`SEASON_EVENT_PROB = 0.88`) → desenlace.

**Lo bueno:**

- **167 eventos** en 6 archivos (`oficio.ts` solo tiene 703 líneas).
- **65 minijuegos**, no 7. Son 7 *verbos* (`ventana`, `sostén`, `puntería`, `punto`, `lectura`, `secuencia`, `memoria`) × 15 dorsales, `PER_SHIRT = 4`, más 5 universales. Un `Record<MechanicId,true>` garantiza **en compilación** que ningún verbo quede sin pantalla.
- **Dificultad unificada y elegante:** `margin = ((attr−15)/75) × (1−pressure×0.22) × (1−(body/100)×0.2) × proficiency`, clampeado a `[0.06, 0.94]`, donde `proficiency` es 1 si es tu dorsal, 0.9 misma familia, 0.75 ajeno — y hay un 8% de "cruce" que te tira un minijuego de otro puesto. **Esto es mejor que el sistema de asistencia de El Interino.**
- **Pago del minijuego tabulado** (`pay.ts`, `payFor(stake, risk, gloria, grade)`): fama, pertenencia, statBoost y daño corporal según apuesta, riesgo y a quién le sirve la gloria.
- **`decisionImpact.ts` no lee el efecto declarado: resta el estado antes menos el estado después.** Así los chips que ve el jugador nunca mienten, aunque el motor haya recortado el efecto por techo de potencial, puerta de la plata o tope de fama. Es una idea muy buena y El Interino no la tiene.
- **30 títulos de carrera** (`careerTitle.ts`) evaluados en orden con fallback, y `careerTrail.ts` que cuenta la carrera **por camisetas** en vez de por temporadas.
- Daño acumulado en tres canales (`damage.cabeza`, `damage.cuerpo`, `damage.hia`) con protocolo HIA y `BunkerScene` — un "anti-minijuego" de 8 segundos de espera donde el veredicto ya está decidido. Es rugby de verdad.

**Lo que le falta:** exactamente lo mismo que a Carrera de Rugby — cero backend, cero cuenta, cero ranking, cero metaprogresión, y la misma política de borrado por schema (`SCHEMA = 18`, doce versiones selladas). Además el póster de carrera se dibuja **en canvas del cliente** (`careerPoster.ts`, 1.055 líneas) mientras Carrera de Rugby lo hace server-side con Satori: dos soluciones distintas para el mismo problema.

**Duplicación entre los dos juegos: menos de la que parece.** Los 7 archivos homónimos (`ClubBadge`, `clubCrest`, `ClubPicker`, `CountryPicker`, `CreatePlayer`, `kitColors`, `EventCard`) son forks divergentes, no copias. Duplicación real ≈ **250 líneas**: el algoritmo del monograma (`MONOGRAM_SATURATIONS [40,52,64]`, `MONOGRAM_MIN_CONTRAST 4.5`), `ClubBadge` y la tabla `KIT` de ~33 países con `kitInkOf`. El acoplamiento fuerte está en `features/`, no en `app/`: `el-capitan/clubCrest.ts` ya importa `@/features/career/data/logo-manifest.generated`.

### 3. Prode

Ya tiene lo que a los otros dos les falta: **backend real**. Nueve tablas (`prode_competitions`, `prode_events`, `prode_predictions`, `prode_rankings`, `prode_user_totals`, `prode_private_leagues`, …), cron `*/5 * * * *` con `Bearer CRON_SECRET`, ranking global y por liga privada, invite codes de 8 caracteres.

Puntaje (`prodeScoring.ts`, 1.130 líneas): `winner 3`, `diff 2`, `exact 5`, `doubleFinals` ×2 en instancias, y **`closestMargin: 1` solo si el deporte es rugby** — un bonus relativo al scope que se lleva quien más se acercó a la diferencia real. Tiene hasta **épocas de reglas** (`metadata.rulesHistory` con flag `retroactive`).

**No está monetizado.** Cero referencias a paywall/premium en todo `/prode`. La infraestructura de pago existe (`subscriptions` con planes free/inicial/pro/organizacion) pero es del negocio de clubes y **ningún gate toca `/juegos`**.

### 4. El motor de rating de jugadores

Son tres cosas distintas, conviene no confundirlas:

1. **`rugbyPlayerRating.ts` (536 líneas) — "Rugby Player Rating v3".** Base 6, escala 1–10. Cinco ejes (ataque, defensa, impacto, juego, disciplina), puesto por número de camiseta (16→2, 17→1, 18→3, 19→4, 20→6, 21→9, 22→10, 23→13), `PESOS_POR_PUESTO` que suman 100 por fila con test que lo verifica, 17 rubros con dirección y "voz". Las varas salen de `rugbyRatingReferences.generated.ts`, calibrado sobre **1.338 partidos y 34.182 planillas** de 50+ minutos. Curva tanh asimétrica (`k 0.88, arriba 4, abajo 2`), encogimiento hacia 6 por debajo de 30 minutos, tarjetas planas fuera del modelo (amarilla 1,0 / roja 2,4). Datos de RugbyPass, 23 requests por partido, cron `40 */6 * * *`.
2. **`match_player_ratings`** — el semáforo del hincha, 1/2/3 (rojo/amarillo/verde) + figura, uno por usuario y partido.
3. **`lineup-ratings`** — override manual 0–10 de super admin.

El punto abierto que ya tenías identificado (dispersión y sesgo a favor de los 3/4) es visible en los pesos: el wing tiene `ataque 38` y el pilar `ataque 15`, y el pilar depende de `defensa 35 + impacto 30`, que son rubros que el proveedor mide peor.

### 5. Los datos — el activo más grande de todos

Esto es lo que ningún juego de rugby del mundo tiene y vos sí. En Supabase (197 migraciones; ojo que **`database.types.ts` está desactualizado** y no sirve como inventario):

| Tabla | Qué te da para un juego |
|---|---|
| `unions` | Las 25 uniones argentinas como entidad, con branding |
| `clubs` | Clubes con escudo, color primario, ciudad, región, unión, alias, sedes, divisiones |
| `tournaments` + `tournament_seasons` | Torneos con temporada, formato, ruleset y **`champion_club_id` — los campeones históricos** |
| `tournament_standings` | Tablas reales con `points`, `bonus_points`, `form`, `streak` |
| `matches` | Resultados históricos con `home_bonus_points`/`away_bonus_points` **ya modelados**, sede, árbitro, público, clima |
| `match_events` | Eventos minuto a minuto con jugador |
| `people` + `season_rosters` + `roster_memberships` | **Planteles oficiales por torneo y temporada**, con número, puesto, rol y continuidad entre temporadas |
| `player_stats` / `team_stats` | Estadísticas por temporada y torneo |
| `club_rankings` | Ranking de clubes con algoritmo estilo World Rugby (`home_advantage 3`, `margin_threshold 15`, `margin_multiplier 1.5`) |
| `external_players` | 5.045 jugadores de RugbyPass con foto y puesto |
| `team_memberships` | Incluye `front_row_certified` — certificación de primera línea |

**El Interino tiene 984 clubes de fútbol inventados a mano. Vos tenés cientos de clubes argentinos reales, con escudo, unión, ciudad, plantel oficial, historial de campeones y tabla con bonus.** Ese es el foso.

### 6. rugby-manager-pro

**77.938 líneas en 251 archivos de JS vanilla**, sin bundler, 266 `<script>` en orden manual. Pausado el 22-jul-2026 a mitad del sistema comercial. **No está roto: corrí las suites y pasan** (calendario 47/47, gobernanza 82/82, comercial 63/63; hay 84 archivos de test en `tools/`, incluidos tests de determinismo save/load).

Lo valioso:

- **Motor de partido posesión a posesión** (`matchEngine.js`, 1.687 líneas) con rating estructural por áreas (scrum, lineout, maul, ruck, potencia de forwards, velocidad de backs, calidad de banco), respuesta convexa `gapFx = cDiff*(0.45+0.55*|cDiff|)`, ventaja arbitral como máquina de estados (Ley 7), elección de penal por **valor esperado con softmax** (decisión humana, no óptima), distancia real de conversión `22 + ángulo*18`, fatiga desde el minuto 55 modulada por banco y tempo.
- **Calibración contra 286 partidos reales de 2026**: localía **+4,38 puntos**, `ptsPerRating = 1,965`, `homeWinRate = 0,618`, con buckets por diferencia de rating.
- **`js/pyramid/clubsARG.js`: 554 clubes argentinos reales** con id canónico, sigla, unión, región competitiva UAR, ciudad, provincia, afiliación (A/I/D/X), rating y colores. Fuente editable con reporte de duplicados marcados para revisión humana.
- 169 clubes internacionales en 15 ligas + 15 competiciones de selecciones; 13 packs institucionales por país con procedencia declarada (14 `OFFICIAL_VERIFIED`, 21 `PENDING_REVIEW`); ranking oficial masculino al 2026-07-06 con 114 selecciones.

Lo que **no** sirve: `data/rugby_players.db` (2,85 MB, 11.961 jugadores) es **100% sintético a propósito** — clubes "Leinstor", "Munstar", "La Tabluda"; jugadores "Morus Rossouwaal". Decisión de licenciamiento consciente y documentada. No lo uses como dataset.

### 7. Rugby Manager (React) + el GDD

**El GDD es el activo individual más valioso del lote.** `Rugby_Manager_GDD.docx`, v1.0, mayo 2026, firmado por vos: 39.000 caracteres, siete partes. Visión explícita: *"Football Manager para rugby: profundidad de simulación deportiva, editable de arriba a abajo, jugable en cualquier navegador."* Incluye **38 atributos en escala 1–20** (16 técnicos, 12 mentales, 10 físicos, 6 ocultos), 15 posiciones con perfil físico, táctica en 4 capas, motor por fases con sub-motores de scrum/lineout/maul/breakdown, meta-juego completo (contratos con agente en 2–4 rondas, salary cap 7M£/12M€, prensa, vestuario, citings), un editor en 3 niveles y hasta un roadmap con riesgos honestos ("1 dev solo es mucho").

El código: 116 archivos, 23.409 líneas, React 18 + TS + Zustand + Dexie, exactamente el stack que el GDD propone. Motor por fases (`phases.ts`, 872 líneas) **calibrado contra 20+ targets reales** (8,0 ensayos/partido, 178 rucks, 24 lineouts, 76% de efectividad en penales), motor posicional 2D, 11 ligas con clubes reales, 160 países, migraciones de save versionadas con `integrityHash` sha-256. **Nueve días de trabajo intenso (11 al 20 de mayo) y parada seca. Sin git.**

`RUGBY MANAGER V2` no es un proyecto: son 268 PNG de banderas más una versión anterior en HTML/JS vanilla archivada. `RM` está vacía.

---

## PARTE II — DIAGNÓSTICO

### Qué tiene El Interino que a los juegos de g22scores les falta

| Sistema de El Interino | Estado en Carrera / Capitán | Impacto de traerlo |
|---|---|---|
| **Save en la nube con concurrencia optimista** (`cloudRevision`/`lastWriteId`, ownership, backups) | No existe. localStorage con borrado por schema | **Crítico** — hoy cada release borra las carreras |
| **Migraciones de save** (`safeMigrateStep`) | Política explícita de cero migraciones | **Crítico** |
| **Ranking público server-side** (score calculado en el servidor desde evidencia) | `careerScore` se calcula y se tira | **Alto** — es el loop competitivo |
| **Logros con moneda** (49 logros, gemas 15/35/75/150/400, evidencia validada en servidor) | No hay nada a nivel cuenta | **Alto** |
| **Historial de carreras** (24 h + 10 favoritas para siempre) | Una sola carrera, se pisa | **Alto** |
| **Cofre diario + cartas coleccionables** (24 h, 35 leyendas, picks que se consumen) | No existe | **Alto** — es lo que hace volver al día siguiente |
| **Vitrina de trofeos** (43 slots, álbum permanente) | Títulos existen pero mueren con la carrera | **Medio-alto** |
| **Misiones semanales** (5 por semana, XP, nivel de cuenta) | No existe | **Alto** — y acá tenés una ventaja única (ver Movida 2) |
| **Outbox durable de retiro** | El retiro no manda nada a ningún lado | **Medio** (necesario cuando exista ranking) |
| **Economía** (presupuesto, sueldos, deuda, mercado) | Ausente por decisión de diseño en Carrera | **Solo para el juego de DT** |
| **Rol de entrenador** | No existe ningún juego de DT | **Alto** — hueco de producto |

### Qué tienen los juegos de g22scores que El Interino no

| | Detalle |
|---|---|
| **Datos reales** | Clubes argentinos con escudo, unión y ciudad; planteles oficiales; campeones históricos; tablas con bonus. El Interino inventa todo |
| **Determinismo por diseño** | `engine/` sin `Math.random` ni `Date.now`, seed mulberry32. El Interino lo parchó con journals |
| **Dificultad unificada de minijuegos** | `margin` de El Capitán es más limpio que `minigameAssistFactor` |
| **Chips que no mienten** | `decisionImpact` resta estados en vez de leer el efecto declarado |
| **Compartir server-side** | Satori + token-receta. El Interino dibuja en canvas del cliente |
| **Rating de jugadores calibrado** | 34.182 planillas. El Interino no tiene nada equivalente |
| **Backend serio** | Supabase + auth + crons + Vercel, ya en producción con clientes que pagan |

---

## PARTE III — EL PLAN

### Principio rector

**Una capa de cuenta compartida, tres juegos encima, un solo motor de club.** Nada de un cuarto motor. La secuencia está ordenada por relación impacto/esfuerzo, no por lo que es más divertido de construir.

---

### Movida 0 — Frenar la hemorragia (1 semana)

Antes que nada, porque hoy estás perdiendo jugadores en silencio.

1. **Migrador de saves en vez de borrado.** Reemplazar la política `{kind:'outdated'}` → borrar por un registro de migradores `from → to`, como el `safeMigrateStep` de El Interino pero declarativo desde el día 1:
   ```ts
   const MIGRATIONS: Record<number, (s: unknown) => unknown> = { 17: s => …, 18: s => … };
   ```
   Para los campos de versión de catálogo (eventos, clubes, calendario), el criterio correcto no es "borrar la partida" sino **revalidar y sanear**: si un evento ya no existe, se descarta ese `pendingEventId`; si un club desapareció, se mapea a su sucesor. Vale la pena una función `sanitizeCareer(state)` por juego.
2. **Métrica de la sangría.** Antes de tocar nada, instrumentar cuántas partidas se borran por release. `src/lib/analytics.ts` ya existe y **no se usa en `/juegos`** — cablearlo ahí es media hora.
3. **Congelar `rugby-manager-pro` y `Rugby Manager` formalmente**, con un README honesto cada uno y un `git init` (ninguno de los dos tiene control de versiones). No se tocan más hasta la Movida 4.

---

### Movida 1 — La capa de cuenta compartida (3–4 semanas)

Es el corazón del plan: portar de El Interino lo único que g22scores no tiene, y hacerlo **una sola vez para los tres juegos**.

**Nuevo paquete: `src/features/meta/`** (agnóstico al juego, igual que `core/` en la spec de El Interino).

**Tablas nuevas en Supabase** (siguiendo el patrón que ya usa el Prode):

```sql
game_saves        (user_id, game_slug, schema, engine_version, state JSONB,
                   revision INT, last_write_id UUID, updated_at)
                  -- PK (user_id, game_slug): una partida activa por juego
game_careers      (id, user_id, game_slug, payload JSONB, score INT,
                   started_at, ended_at, favorite BOOL)
                  -- historial de carreras retiradas
game_rankings     (game_slug, mode, user_id, score, breakdown JSONB,
                   career_id, started_at, position)
                  -- UNIQUE (game_slug, mode, user_id)
game_achievements (user_id, achievement_id, unlocked_at, counter, rewarded INT)
game_account      (user_id, total_xp, gems, display_name, avatar_card_id)
game_missions     (user_id, week_id, mission_id, completed_at)
```

**Qué se copia de El Interino, casi literal:**

- **Concurrencia optimista.** `revision` + `last_write_id` como columnas hermanas (nunca dentro del JSONB). En Postgres es más simple que en Firestore: un `UPDATE ... WHERE revision = $expected` que devuelve 0 filas es el conflicto. Y **no hace falta nada del aparato de chunking**: el save de una carrera de rugby es de kilobytes, no de 785 KB de rosters. Te ahorrás la deuda más cara de El Interino.
- **Ownership del save local** (`ownerUid`): nunca subir ni destruir el save de otra cuenta; backup con prune.
- **Ancla de hora del servidor.** `nowMs() = serverMs + (performance.now() - perfMs)`, monotónico e inmune a tocar el reloj del sistema. Necesario para el cofre y las misiones. En g22scores ya hay precedente: el reloj de partido derivado usa ancla de servidor.
- **Outbox durable de retiro** (`localStorage`, separado del save, escrito **sincrónicamente antes** de borrar la partida, con `retirementEventId` y owner-aware). Es infraestructura pura, se copia tal cual.
- **Validación server-side por evidencia.** El cliente manda el `breakdown` (títulos por tier, caps, temporadas), no el `score`. **Y acá Carrera de Rugby te da algo que El Interino no tiene: el token-receta.** El servidor puede **re-correr el motor determinista** con la receta y verificar el resultado de verdad, no solo re-sumar puntos. Es el mejor anti-cheat de los dos mundos.

**Local-first sigue siendo la regla:** sin login se juega igual, todo en `localStorage`; al loguearse se sube y se resuelve el conflicto con la comparación local/nube de El Interino (`decideSaveConflict` + `classifySaveTimestamp`, con `MAX_FUTURE_SAVE_SKEW_MS = 5 min` para saves con fecha futura).

**Entregable de la movida:** las dos carreras existentes sobreviven a los releases, se sincronizan entre teléfono y desktop, y al retirarse quedan guardadas.

---

### Movida 2 — Retención (2–3 semanas)

Ahora sí, la parte que hace que vuelvan. Todo esto es **contenido sobre la capa de la Movida 1**.

**a) Ranking.** El más barato y el que más rinde. Ya tenés `careerScore` calculado en Carrera de Rugby y 30 títulos de carrera en El Capitán. Dos tablas por juego, separadas por modo (`con club elegido` / `sin elegir`, el equivalente al `offer`/`manual` de El Interino, que evita comparar peras con manzanas). `MIN_SEASONS` para entrar, poda de los que quedan fuera del top 50 a las 24 h, y la fila se matchea por `career_id`, sin exponer `user_id`.

**b) Vitrina de trofeos — y acá tenés algo que El Interino no puede tener.** El Interino colecciona 43 trofeos inventados. Vos podés coleccionar **los trofeos reales de `tournament_seasons`**: el Top 12 de la URBA, el Nacional de Clubes, el torneo de tu unión. Con el escudo real y el campeón histórico real al lado. Es la misma mecánica de álbum, con un peso emocional que un juego genérico no alcanza.

**c) Misiones semanales enganchadas al fixture real.** Esta es la mejor idea que salió del relevamiento y **no existe en ningún juego del mundo**: El Interino tiene un catálogo de misiones curado a mano semana por semana. Vos tenés `matches` con el fixture real de la semana en vivo. Una misión puede ser *"esta semana juega el clásico de tu unión: ganalo en tu carrera"* o *"salí campeón con el club que hoy lidera el Top 12"*. **El juego se sincroniza con el rugby que está pasando de verdad.** Eso conecta el minijuego con el producto principal y le da a alguien una razón para abrir g22scores un martes.

**d) Cofre diario y colección.** El cofre de 24 h con cooldown decidido por el servidor (nunca por el cliente), y como coleccionable la versión rugby de las cartas nostálgicas: **figuras del rugby argentino** — y acá hay una decisión de derechos de imagen que tenés que tomar, porque `rugby-manager-pro` ya la tomó en sentido contrario (nombres inventados a propósito). Alternativa segura: coleccionar **camisetas y escudos históricos de clubes reales**, que son tuyos de licenciar mucho más fácil que las caras de las personas. Los picks se consumen al empezar carrera, que es lo que empuja a abrir carreras nuevas.

**e) Logros de cuenta.** El catálogo de 49 logros de El Interino con su escala de gemas (15/35/75/150/400) se traduce casi 1:1 al rugby. Con una advertencia del propio código de El Interino: **las gemas no tienen sumidero** — el número sube y es puro estatus. Si vas a poner moneda, decidí en qué se gasta antes de emitirla.

---

### Movida 3 — El tercer juego: dirigir un club (6–10 semanas)

Recién acá entra la adaptación de El Interino como juego, y con una decisión de alcance importante.

**No hagas *Football Manager* de rugby.** Ese es el GDD de `Rugby Manager`, es un juego de 200 horas y es el que te frenó dos veces (mayo y julio). Hacé **El Interino de rugby**: carrera de entrenador de 15–30 minutos, decisiones extradeportivas, un dado por partido, resultado narrado. El mismo formato que ya te funcionó dos veces en g22scores.

**El perfil deportivo** (el `SPORT_PROFILE` de la spec de El Interino), instanciado para rugby:

```js
outcomes:      ["win","draw","loss"],   // el empate existe pero es raro
drawBand:      3,                        // ±3 en vez de ±7
pointsFor:     { win: 4, draw: 2, loss: 0 },
bonusPoints:   { offensive: "4+ tries", defensive: "perder por ≤7" },
scoreModel:    { type: "high", base: [15,35], margin: [1,25] },
lineupSize:    15, bench: 8,
positionGroups: ["1ª línea","2ª línea","3ª línea","medios","centros","fondo"],
playerStats:   ["tries","tackles","metros","puntos al pie"],
calendar:      { start: 3, end: 10 },    // marzo–octubre
promotion:     null,                     // el Top 12 no tiene descenso: playoffs
```

Dos particularidades del rugby que **mejoran** el diseño de El Interino, no lo complican:

1. **El punto bonus obliga a que el marcador importe**, no solo el resultado. En El Interino el marcador es cosmético. Acá `genScore` alimenta la tabla, lo que hace que "perder por poco" sea una decisión táctica real.
2. **La escasez de puesto** ya está resuelta en Carrera de Rugby (`scarcity: 2` para pilar/hooker/segunda línea, `front_row_certified` en la base). En fútbol podés improvisar un lateral; en rugby, si no tenés hooker no jugás. Eso hace el mercado y las lesiones mucho más tensos que en El Interino, gratis.

**Qué se reusa y de dónde** — esto es lo que hace que sean 6–10 semanas y no 6 meses:

| Pieza | De dónde sale |
|---|---|
| Motor de temporada, eventos, presión, reputación, economía, tick del mundo | **El Interino** (la spec del documento anterior) |
| Determinismo, seed, arquitectura `engine/` sin React | **Carrera de Rugby** (`features/career/engine/`) |
| Dificultad de minijuegos (`margin`) y el pago tabulado | **El Capitán** |
| Chips de impacto que restan estados | **El Capitán** (`decisionImpact.ts`) |
| Motor de partido con bonus, ventaja, patada por valor esperado | **rugby-manager-pro** (`matchEngine.js`) — simplificado a un dado |
| Calibración: localía +4,38, ptsPerRating 1,965 | **rugby-manager-pro** (286 partidos reales) |
| Clubes, uniones, escudos, planteles, campeones | **Supabase de g22scores** + los 554 clubes de `clubsARG.js` |
| Capa de cuenta, ranking, logros, cofre | **Movida 1 y 2** |
| Compartir (token-receta + Satori) | **Carrera de Rugby** |

**Qué hay que escribir de cero:** el `SPORT_PROFILE`, unos 40 eventos de decisión con vocabulario de rugby argentino (dirigencia de club, la subcomisión, el sponsor local, el jugador que se va a Europa, el M19 que sube, la fecha suspendida por lluvia), y la UI del club.

**Y lo más importante: el clásico.** El Interino tiene 85 clásicos declarados y 29 pares emergentes. Vos podés declarar los clásicos reales del rugby argentino desde `clubs` + `unions` — CASI/SIC, Tala/Palermo Bajo, La Tablada/Jockey — y además **generar los emergentes con datos reales**: dos clubes de la misma ciudad que compitieron por el mismo ascenso en `tournament_standings`. Rivalidad derivada de la historia real.

---

### Movida 4 — Qué hacer con los dos proyectos parados (decisión, no trabajo)

**`rugby-manager-pro`: canibalizar datos, no continuar.** Los 554 clubes argentinos de `clubsARG.js` con unión, región, ciudad y afiliación son irreemplazables y hay que **cruzarlos con la tabla `clubs` de Supabase** — probablemente sea la fuente que le falta a la base para completar el interior. La calibración (`+4,38` de localía sobre 286 partidos reales) alimenta el motor de la Movida 3. El motor de partido posesión a posesión es demasiado para un juego de 20 minutos, pero es la base perfecta si algún día hacés el manager profundo. Lo que **no** se usa: `rugby_players.db` (sintético) y los 290 MB de `img/`.

**`Rugby Manager`: el GDD se rescata, el código se archiva.** El GDD es tu visión escrita y sirve de norte para la Movida 3 (las partes 2 y 5 son directamente aplicables). El código React tiene el motor por fases calibrado contra targets reales — vale como referencia, no como base, porque meterlo en g22scores obliga a decidir si es app separada o módulo, y esa decisión no la necesitás ahora.

**Regla de higiene:** no vuelvas a abrir un tercer frente de manager hasta que la Movida 1 esté en producción. El patrón de los últimos seis meses (mayo: Rugby Manager, 9 días y para; julio: rugby-manager-pro, para a mitad del sistema comercial) sugiere que el problema no es capacidad técnica sino frentes simultáneos.

---

### Roadmap

| Fase | Movida | Semanas | Entregable |
|---|---|---|---|
| 0 | Frenar la hemorragia | 1 | Migradores + analytics + repos congelados con git |
| 1 | Capa de cuenta `features/meta/` | 3–4 | Las carreras sobreviven releases y se sincronizan |
| 2a | Ranking + historial | 1–2 | Loop competitivo vivo |
| 2b | Vitrina de trofeos reales | 1 | Álbum con los torneos de verdad |
| 2c | Misiones semanales sobre fixture real | 2 | El juego late al ritmo del rugby real |
| 2d | Cofre + colección + logros | 2 | Retención diaria |
| 3 | Juego de DT de club | 6–10 | Tercer juego, género nuevo |
| 4 | Consolidación de datos (clubsARG → Supabase) | 2 | Base de clubes completa |

**Camino corto si querés un resultado visible rápido:** Movida 0 + Movida 2a. En tres semanas los dos juegos que ya están en producción dejan de borrar partidas y tienen ranking. Eso solo probablemente mueva más la aguja que cualquier juego nuevo.

---

## PARTE IV — Decisiones que dependen de vos

1. **Derechos de imagen de los coleccionables.** ¿Figuras reales del rugby argentino, o camisetas/escudos históricos? `rugby-manager-pro` ya eligió lo conservador (nombres inventados). Es la decisión que más condiciona la Movida 2d.
2. **¿Las gemas se gastan en algo?** El Interino emitió moneda sin sumidero y lo documenta como problema abierto. Decidilo antes de emitir.
3. **¿Los juegos entran alguna vez en el negocio?** Hoy `/juegos` no tiene ningún gate y el Prode tampoco. Las ligas privadas del Prode son la superficie natural de monetización si alguna vez la querés, y ya está construida.
4. **¿Un juego de DT o el manager profundo?** Mi recomendación es fuerte: el corto primero. El GDD no se pierde, queda esperando.
5. **¿Carrera de Rugby y El Capitán convergen o siguen separados?** La duplicación real es de solo 250 líneas, así que no urge unirlos. Pero la capa de cuenta debe nacer compartida desde el día 1, si no vas a tener tres implementaciones de ranking.

---

## Anexo — Hallazgos sueltos que conviene anotar

- **`ACADEMY_EVENTS` de Carrera de Rugby está escrito y nunca se importa.** Seis eventos de cantera perdidos en `data/events/academy.ts`. Encenderlos es una línea.
- **Los arcos narrativos de El Interino están apagados** (`NARRATIVE_ARCS_ENABLED = false`) con 8 arcos de 3–4 capítulos ya escritos. El motor de arcos es directamente portable a cualquiera de los juegos de rugby.
- **`database.types.ts` está desactualizado** (1.680 líneas sin `prode_*`, `season_rosters`, `player_stats`, `match_events`, `external_*`). Regenerarlo es barato y te ahorra leer migraciones cada vez.
- **`CLAUDE.md` de la raíz de `Grupo-22-Scores` es el manual de Carrera de Rugby, no del proyecto.** Confunde a cualquiera que llegue nuevo (incluido un agente). Vale renombrarlo o dividirlo.
- **`ESTADO.md` está desactualizado** (solo habla del reloj derivado).
- **El bug de El Interino que reporté ayer sigue en pie**: `undefined` / `UNDEFINED` en la tarjeta del partido decisivo, por desincronización entre el `if/else` de `startMinigameRound()` y los cinco diccionarios paralelos de minijuegos. **El Capitán resolvió exactamente ese problema** con `VERBOS_CUBIERTOS: Record<MechanicId, true>`, que hace fallar la compilación si un verbo queda sin pantalla. Es la solución que le falta a El Interino.
