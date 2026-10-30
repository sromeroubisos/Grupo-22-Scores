# El Interino de rugby — spec de adaptación para g22scores

**Qué es este documento:** el diseño concreto de cómo se convierte *El Interino* (simulador de DT de fútbol) en un juego de rugby dentro de g22scores. No es teoría: cada pieza dice de dónde sale el código o el dato, porque casi todo ya existe repartido entre cinco proyectos tuyos.

**Nombre de trabajo:** `el-entrenador` (ruta `/juegos/minijuegos/el-entrenador`).

---

## 1. La idea, en una página

En Carrera de Rugby sos un jugador. En El Capitán sos el líder del equipo. **Acá sos el entrenador de un club argentino de rugby**, y el juego no es sobre planteos tácticos: es sobre todo lo demás.

Agarrás Jockey de Salta en el Regional del NOA. Tenés que llegar al Torneo del Interior. El apertura titular se va a estudiar a Córdoba, la subcomisión quiere que suban tres del M19 porque no hay plata para el micro, el pilar derecho —el único con certificación de primera línea— está suspendido dos fechas, y el sábado viene el clásico. **Cada temporada son cinco o seis decisiones así, un puñado de partidos, y un resultado.** Una carrera son 15–25 minutos. Al retirarte, tu carrera entra al ranking.

**Por qué este juego y no el manager profundo:** es el mismo formato que ya te funcionó dos veces en g22scores (Carrera de Rugby y El Capitán), reusa la infraestructura que ya tenés, y se termina. El *Football Manager* de rugby de tu GDD es otro producto y te frenó dos veces.

**Por qué es distinto de todo lo que existe:** ningún juego de rugby del mundo tiene el club de tu ciudad. Vos tenés 554 clubes argentinos reales con unión, ciudad, escudo y color.

---

## 2. Dónde vive

Sigue exactamente el patrón que ya usan los otros dos juegos: **motor en `src/features/`, presentación en `src/app/juegos/minijuegos/`**. Esa regla ya está escrita en el `CLAUDE.md` del repo.

```
src/features/coach/
  engine/          # motor puro: sin React, sin app/**, sin Math.random ni Date.now
    random.ts          # mulberry32 (copiar de features/career/engine/random.ts)
    simulate-match.ts  # el dado
    simulate-season.ts # la temporada
    events.ts          # selector de eventos con cooldown
    progression.ts     # jugadores, club, entrenador
    pressure.ts        # presión, objetivo, despido
    economy.ts         # el presupuesto del club
    world.ts           # el tick anual de la pirámide
    knockout.ts        # llaves del TDI / Nacional
    share-token.ts     # receta compartible (copiar de career/)
  data/
    competitions.ts    # ← portado de rugby-manager-pro/js/pyramid/ruleSets.js
    clubs.generated.ts # ← portado de clubsARG.js + cruzado con Supabase
    events/*.ts        # las decisiones, como datos
    positions.ts       # ← reusar el de features/career
    calendar.ts
  types/
src/app/juegos/minijuegos/el-entrenador/   # solo UI
src/features/meta/                          # capa de cuenta compartida (ver §10)
```

**Regla dura, la misma que ya respetás:** `engine/` no importa React ni Supabase. Se testea con `node`. Los datos entran por parámetro.

---

## 3. La pirámide — el `LEAGUES` de rugby ya está escrito

El Interino tiene 48 ligas y 984 clubes de fútbol inventados a mano. Para rugby **no hay que inventar nada**: `rugby-manager-pro/js/pyramid/ruleSets.js` ya tiene **29 competencias argentinas** en cinco niveles, con `level`, `scope`, `ownerId` y `status`, y `clubsARG.js` tiene **554 clubes** en **25 uniones** y **8 regiones**.

La pirámide, tal como está codificada:

| Nivel | Competencias | Alcance |
|---|---|---|
| 1 | Nacional de Clubes | UAR |
| 2 | Torneo del Interior A · Reválida TDI · **URBA Top 14** | UAR / URBA |
| 3 | TDI B · Repechaje B · URBA Primera A · Litoral A · Centro Top 10 A · NOA Super 10 · Oeste Top 8 · NEA A · Pampeano A · Patagónico A | regional |
| 4 | URBA Primera B · Litoral B · Centro Súper 9 B · Súper 8 de Ascenso · NOA Ascenso · Oeste Ascenso · NEA B · Pampeano B · Cuadrangular de permanencia · Patagónico B | regional |
| 5 | URBA Primera C · NOA Desarrollo · Pampeano C · Torneo de la Unión Andina | unión |

Distribución de clubes por unión: URBA 88, URR 43, UCR 40, UROBA 34, UER 27, URNE 27, URS 27, USR 23, URC 22, URMDP 22, URAV 21, URT 19, URUMI 18, USTG 17, URAND 16, URAUS 14, URSUR 14, URF 13, UJR 13, URSL 13, URLS 11, USJ 11, USCR 8, URTF 7, URVCH 6.

**Tres decisiones de diseño que ya vienen resueltas en ese archivo y hay que conservar:**

1. **Identidad canónica única.** *"El mismo objeto juega el torneo provincial, el regional, el Torneo del Interior y el Nacional de Clubes. No existe 'Marista Regional' ni 'Marista TDI'."* Es exactamente el modelo de El Interino (el club es un string; los atributos van en tablas laterales).
2. **Referencia por rol, no por nombre** (`ARG_COMP_ROLES`): el Nacional enfrenta al *campeón de la máxima de URBA*, se llame Top 12 o Top 14 y tenga los equipos que tenga. Esto es mejor que El Interino, que hardcodea nombres de copas.
3. **Torneos dormidos** (`status: "dormant"`): el TDI C conserva nombre, historial, nivel y reglas sin generar fixture. Permite temporadas históricas sin `if`s.

### De dónde sale cada dato

| Dato del juego | Fuente | Estado |
|---|---|---|
| Competencias, niveles, formatos | `ruleSets.js` (29 competencias) | Listo, portar a TS |
| Clubes: id, nombre, sigla, unión, región, ciudad, provincia, afiliación, colores | `clubsARG.js` (554) | Listo, portar |
| Escudos | Supabase `clubs.logo_url` | Listo |
| Rating de club | Supabase `club_rankings` (algoritmo World-Rugby-style) + `rating` de `clubsARG.js` | Cruzar |
| Historia / palmarés | Supabase `tournament_seasons.champion_club_id` | Listo |
| Clásicos | `clubs` + `unions` (mismo `union_id`, misma ciudad) + declarados a mano | A construir |
| Planteles reales | Supabase `season_rosters` + `roster_memberships` | Listo (decidir si se usan, §11) |
| Puestos y escasez | `features/career/data/positions.ts` | Reusar tal cual |

**La tarea de datos más valiosa de todo el proyecto:** cruzar los 554 clubes de `clubsARG.js` contra la tabla `clubs` de Supabase. Probablemente completes el interior de tu propia base de datos de producción en el proceso — el juego termina mejorando el producto principal.

---

## 4. El perfil deportivo

El `SPORT_PROFILE` del que hablaba la spec de El Interino, instanciado:

```ts
export const RUGBY: SportProfile = {
  outcomes: ['win', 'draw', 'loss'],
  drawBand: 3,                       // El Interino usa ±7; en rugby el empate es raro
  points: { win: 4, draw: 2, loss: 0 },
  bonus: {
    offensive: (tries) => tries >= 4,          // (o diferencia de 3 tries, según torneo)
    defensive: (margin) => margin <= 7,
  },
  score: { type: 'high', base: [15, 35], margin: [1, 25] },
  lineup: { starters: 15, bench: 8 },
  positionGroups: ['primera-linea', 'segunda-linea', 'tercera-linea',
                   'medios', 'centros', 'fondo'],
  scarcity: { hooker: 2, pilar: 2, segunda: 2 },   // de features/career/positions.ts
  playerStats: ['tries', 'tackles', 'metros', 'puntosAlPie'],
  calendar: { startMonth: 3, endMonth: 10 },
  promotion: 'playoff',              // no hay descenso automático arriba: hay ascensos
};
```

**Cuatro cosas del rugby que hacen el juego mejor que el de fútbol, no más complicado:**

1. **El punto bonus obliga a que el marcador importe.** En El Interino el marcador es cosmético: solo cuenta ganar, empatar o perder. Acá "perder por 6 en cancha del líder" suma un punto y puede definir la temporada. Eso convierte cada partido en dos preguntas en vez de una, y le da sentido a decisiones tipo *"¿vas a los palos o vas al line?"*.
2. **La escasez de puesto es real.** Un lateral se improvisa; un hooker no. `scarcity: 2` para primera línea y segunda ya está implementado en Carrera de Rugby, y en Supabase existe `team_memberships.front_row_certified`. Quedarte sin hooker certificado debe poder **costarte el partido por reglamento** (scrums simulados). Es un tipo de tensión que el fútbol no tiene.
3. **El calendario es corto.** Marzo a octubre, 12–18 partidos. Una temporada se juega en 2–3 minutos, no en 10. Perfecto para el formato.
4. **El club es amateur.** Ver §7: cambia la economía entera, para mejor.

---

## 5. El motor de partido

La fórmula de El Interino, con los términos traducidos y calibrada con **datos reales**: `rugby-manager-pro/js/calibration.js` midió sobre **286 partidos de 2026** que la localía vale **+4,38 puntos**, que `ptsPerRating = 1,965` y que el local gana el **61,8%**.

```ts
function rollMatch(rng, my, rival, ctx) {
  // Rating de partido: promedio del XV, con peso extra al pack
  const forwards = avg(pack) * 0.55 + avg(backs) * 0.45;

  const conduccion  = (stat('conduccion')  - 5) * 0.8;   // ← "táctica"
  const arenga      = ctx.pressure >= 60 ? (stat('arenga') - 5) * 1.2 : 0;
  const ruido       = 30 * clamp(1 - (stat('disciplina') - 5) / 20, 0.7, 1.3);
  const grupo       = (cohesion() - 50) / 8;             // ← "química"
  const localia     = ctx.home ? 4.38 / 1.965 : 0;       // calibrado, no inventado
  const banco       = (avg(bench.slice(0,3)) - avg(pack)) * 0.15;  // el impacto del banco

  const dado = (forwards - rival.rating) + conduccion + arenga + grupo
             + localia + banco + rng.range(-ruido, ruido);

  const outcome = dado > 3 ? 'win' : dado < -3 ? 'loss' : 'draw';
  return { outcome, margin: dado };
}
```

**El marcador ya no es cosmético** — sale del mismo dado y alimenta los bonus:

```ts
function genScore(rng, outcome, margin, ctx) {
  const base   = rng.int(15, 32);                    // puntos del perdedor-ish
  const brecha = Math.round(Math.abs(margin) * 1.2 + rng.int(0, 8));
  const [pf, pc] = outcome === 'win'  ? [base + brecha, base]
                 : outcome === 'loss' ? [base, base + brecha]
                 : [base, base];
  const tries  = Math.round(pf / 7 * rng.range(0.75, 1.15));   // ~1 try cada 7 pts
  return {
    pf, pc, tries,
    bonusOf: tries >= 4,
    bonusDef: outcome === 'loss' && (pc - pf) <= 7,
  };
}
```

**Eventos de partido** (`rollMatchEvent` de El Interino, traducidos): 84% nada · 6% tarjeta amarilla (`mod: -4`, 10 minutos con uno menos) · 2% roja (`mod: -8`) · 8% lesión (`mod: (suplente - titular) / 11`). Y una rama nueva y muy de rugby: **si el lesionado es primera línea y no hay reemplazo certificado, scrums simulados** — `mod: -6` fijo, con su propia línea de narración.

**Verificación:** con esta fórmula y los ratings reales de `club_rankings`, simulá 1.000 temporadas y comprobá contra los tres números de `calibration.js` (61,8% de victorias locales, margen medio, tasa de empates ~2–4%). Si no dan, se ajusta `ruido` y el factor de brecha. **Eso es un test automatizable y es el primer test que hay que escribir.**

---

## 6. La temporada y las competencias

**Formato base:** todos los torneos de la pirámide son liga + playoff. `LEAGUES` de El Interino se mapea casi 1:1, con `reducidoRows` haciendo de semifinales:

```ts
{
  id: 'NOA_A', name: 'Regional del NOA - Súper 10',
  level: 3, scope: 'regional', ownerId: 'REGION_NOA',
  format: 'single-table-playoff',
  teams: 10, rounds: 2,          // ida y vuelta = 18 fechas
  playoffRows: [1, 4],           // semis cruzadas + final
  promotesTo: 'ARG_TDI_B',       // cupo al TDI
  relegateRows: 1,
}
```

**Las dos copas nacionales usan `runKnockoutChain` tal cual** (con `stageDefs`, rival sintético, journal de determinismo — todo portable de El Interino):

- **Torneo del Interior**: se juega *durante* la temporada regional, en ventanas del calendario. Es la Copa Argentina del juego. Los cupos salen de las posiciones de los regionales del año anterior.
- **Nacional de Clubes**: el techo. Campeón de URBA + campeón del TDI + los mejores del interior. Ganarlo es el objetivo final de una carrera.

**El tick del mundo** (`advanceWorldPyramid`): 554 clubes que suben y bajan sin simular un solo partido, con `weightedPickOne` ponderado por rating. Ya está resuelto en El Interino y ya está resuelto en `pyramid/seasonRunner.js`. Se elige uno.

**Calendario:** `CALENDAR_PROFILE` de El Interino con la ventana `{start: 3, end: 10}`. El mes que ve el jugador se deriva de `matchIndex / fixtures.length`, no se guarda. Y hay un detalle criollo que vale oro: **la fecha suspendida por lluvia** — un evento de calendario, no un bug.

---

## 7. La economía — acá está la adaptación más importante

**El Interino tiene presupuesto, sueldos, valor de mercado, deuda y fichajes. En el rugby de clubes argentino nada de eso existe.** Es amateur. Si copiás la economía tal cual, el juego miente y cualquiera que juegue al rugby se da cuenta en la primera pantalla.

La traducción correcta:

| El Interino (fútbol) | El Entrenador (rugby de club) |
|---|---|
| Presupuesto de fichajes | **Caja del club**: cuota social, buffet, la rifa, el sponsor de la ferretería del barrio |
| Sueldos del plantel | **Costos de temporada**: canchas, botiquín, indumentaria, el micro |
| Valor de mercado | *No existe* — un jugador no se compra |
| Comprar un jugador | **Retener al que se va** y **traer al que vuelve** (el que estaba en Buenos Aires, el que se recibió) |
| Vender al crack | **El que se va a Europa o al seleccionado**: no cobrás nada, y encima lo perdés |
| Cantera | **El M19**: la única fuente real de jugadores |
| Deuda | **Deuda con la unión / con el proveedor** — te puede dejar sin fichas |
| Estructura del club | Canchas, gimnasio, tercer tiempo, la sede |

**El gasto que define la temporada es el viaje.** Clasificar al Torneo del Interior es deportivamente glorioso y económicamente un problema: hay que llevar 26 personas a Tucumán tres fines de semana. Esa tensión —*"ganamos, y ahora cómo pagamos el micro"*— **no existe en ningún juego de deportes y es la médula del rugby de club argentino**. Debería ser la decisión estrella de la primera temporada.

Fórmulas propuestas (mismo esqueleto que El Interino, otra escala):

```ts
cajaInicial   = f(socios, categoría, ciudad)       // ~ el initialBudgetFor
ingresoAnual  = cuotas + buffet + sponsors + subsidio de la unión
costoAnual    = canchas + indumentaria + botiquín + arbitrajes + viajes
deudaMeses    = (-caja / ingresoAnual) * 12        // mismos umbrales 3 / 6 / 12
```

La curva de presupuesto de El Interino (`3134.026 * g^2.1927`) se reemplaza por algo mucho más simple, porque el rango es mucho más chato: entre el club más rico y el más pobre de la pirámide hay un factor de 20, no de 4.000.

**El "mercado" pasa a ser retención.** Cada temporada, tres o cuatro jugadores tuyos reciben una tentación: la beca en Buenos Aires, el laburo en Neuquén, la oferta de un club del Top 14, la lesión que lo hace colgar los botines. Tu decisión no es cuánto pagás — es **qué le ofrecés**: minutos, la capitanía, el puesto que quiere, o dejarlo ir en buenos términos para que vuelva en dos años. Eso encaja perfecto con el sistema de `outcomes` ponderados de El Interino y con los chips de impacto de El Capitán.

---

## 8. Las decisiones — el contenido real

El Interino tiene ~105 eventos; Carrera de Rugby 86; El Capitán 167. Para arrancar alcanzan **40**, con la misma estructura de datos de El Interino (que es la misma que la de Carrera de Rugby, así que el tipo ya existe).

Reparto sugerido: club/dirigencia 8 · plantel y vestuario 8 · M19 y cantera 6 · lesiones y disciplina 5 · retención y salidas 5 · prensa y comunidad 4 · viajes y logística 4.

Tres ejemplos escritos, para fijar el tono:

> **El micro a Tucumán**
> Clasificaron al TDI. La subcomisión hizo números: el viaje se come cuatro meses de cuotas.
> - *Poner la plata igual* — caja −35%, cohesión +6, hinchada +0,4
> - *Rifa y asado a beneficio* — 65%: caja −10%, hinchada +0,6, presión +4 · 35%: caja −25%, hinchada +0,2
> - *Viajar con 22 en vez de 26* — caja −20%, y si hay lesión de primera línea, scrums simulados

> **El apertura se va a estudiar**
> Le dieron la beca en Córdoba. Es tu único pateador.
> - *Dejalo ir* — perdés al jugador, +0,3 de estructura (el club queda bien), cohesión +3
> - *Pedirle que viaje los sábados* — 55%: se queda, rendimiento −4 · 45%: se va igual, cohesión −5
> - *Bancarle el alquiler* — caja −18%, se queda entero

> **El pilar suspendido**
> Dos fechas por el codazo. Y el suplente no tiene la certificación de primera línea.
> - *Jugar con lo que hay* — riesgo de scrums simulados en las dos fechas
> - *Subir al del M19* — el pibe debuta: +potencial, rendimiento −3 esta temporada
> - *Apelar la sanción* — 40%: se levanta · 60%: queda firme y la unión te mira feo (reputación −2)

**Dos mejoras de El Capitán que hay que traer desde el día uno:**

- **`decisionImpact` que resta estados en vez de leer el efecto declarado.** Los chips que ve el jugador nunca mienten aunque el motor haya recortado el efecto por un techo. Son 268 líneas ya escritas.
- **La cobertura exhaustiva en compilación** (`Record<EventKind, true>`), que es justo lo que le falta a El Interino y le produjo el bug de `undefined` que está en producción ahora mismo.

---

## 9. Los minijuegos

**No inventar nada: usar el sistema de El Capitán.** Ya tiene 7 verbos (`ventana`, `sostén`, `puntería`, `punto`, `lectura`, `secuencia`, `memoria`), 65 variantes, y una fórmula de dificultad más limpia que la de El Interino:

```ts
margin = ((attr − 15) / 75) × (1 − pressure × 0.22) × (1 − (body/100) × 0.2) × proficiency
```

Para el juego de entrenador cambian los sujetos, no las mecánicas: la `puntería` deja de ser tu patada y pasa a ser **la del pateador que vos elegiste**; el `punto` es elegir la salida correcta; la `lectura` es leer al rival en el line. El `margin` se calcula con el atributo del **jugador designado**, modulado por tus stats de entrenador — así elegir bien al pateador importa.

Cuándo se dispara, calcado de El Interino: el clásico, el partido decisivo (con el umbral reparametrizado: en rugby "a tiro" son ~8 puntos, no 6), y las semifinales y finales del TDI y del Nacional.

---

## 10. La capa de cuenta

Todo lo del documento anterior (Movida 1), y vale repetir el punto: **hacela compartida desde el día uno**, en `src/features/meta/`, o vas a terminar con tres implementaciones de ranking.

Lo mínimo para este juego:

- `game_saves` con `revision` + `last_write_id` (concurrencia optimista en Postgres: `UPDATE ... WHERE revision = $expected` que devuelve 0 filas es el conflicto). **Sin chunking** — el save de una carrera de rugby pesa kilobytes, no los 785 KB de rosters que obligaron a El Interino a partir el documento.
- **Migradores de save**, no borrado. La regla actual (`SCHEMA` desajustado → borrar) hoy destruye las carreras de Carrera de Rugby y El Capitán en cada release.
- `game_rankings` con score calculado **en el servidor**. Y acá hacé lo que El Interino no puede: como el motor va a ser determinista con seed, el servidor **re-corre la carrera** desde el token-receta y verifica el resultado de verdad. Carrera de Rugby ya tiene el token construido para eso.
- Outbox durable de retiro (`localStorage`, separado del save, escrito antes de borrar la partida).

**Score de la carrera**, adaptando el de El Interino a la pirámide argentina:

```
score = reputación
      + 45 × Nacional de Clubes
      + 30 × Torneo del Interior A
      + 25 × campeonato de URBA Top / regional A
      + 12 × campeonato de categoría menor
      + 15 × cada ascenso
      +  2 × cada temporada
```

---

## 11. La decisión que hay que tomar antes de empezar: ¿jugadores reales o inventados?

Tenés `season_rosters` y `roster_memberships` con **planteles oficiales por torneo y temporada**. La tentación es usarlos. Antes de hacerlo:

- `rugby-manager-pro` ya tomó la decisión contraria a propósito y está documentada: 11.961 jugadores **sintéticos**, generados desde `name_bank.json`, por licenciamiento.
- El rugby de clubes argentino es amateur: son personas que no cobran por jugar, muchas menores de edad en el M19, y algunos son clientes tuyos (o sus hijos).

**Mi recomendación: clubes reales, jugadores generados.** El escudo, la ciudad, la unión y el palmarés son los que hacen la conexión emocional, y son datos públicos e institucionales. Los nombres de personas no agregan casi nada al juego y agregan todo el riesgo. El generador de El Interino (perfil por división + `scatter` + banco de nombres regional) ya resuelve esto, y `name_bank.json` de `rugby-manager-pro` tiene 10 regiones culturales listas.

Excepción razonable: **para el coleccionable, camisetas y escudos históricos de clubes**, no caras de jugadores.

---

## 12. Orden de construcción

### El vertical slice (10 días) — antes de comprometerse a nada más

El objetivo es tener **una temporada jugable de punta a punta con un solo torneo**, para probar si el juego es divertido antes de construir la pirámide entera.

| Día | Qué |
|---|---|
| 1 | Portar `positions.ts` y `random.ts` de `features/career`. Portar 10 clubes de un solo regional desde `clubsARG.js` |
| 2–3 | `simulate-match.ts` + `genScore` con bonus. **Test de calibración contra los 286 partidos** |
| 4 | `simulate-season.ts`: fixture, tabla con bonus, objetivo |
| 5–6 | 8 eventos de decisión + `decisionImpact` (copiado de El Capitán) |
| 7 | Presión, objetivo, despido (portados de El Interino) |
| 8 | Caja del club: ingresos, costos, el viaje |
| 9 | UI mínima: consola de temporada reusando `juegos.module.css` |
| 10 | Retiro + resumen. **Jugarlo 20 veces y decidir si sigue** |

Si a los 10 días no es divertido, perdiste 10 días y no 3 meses. Ese es el punto.

### Después del slice

| Fase | Qué | Semanas |
|---|---|---|
| A | Capa de cuenta `features/meta/` (sirve a los 3 juegos) | 3–4 |
| B | Pirámide completa: 29 competencias + 554 clubes + tick del mundo | 2 |
| C | TDI y Nacional de Clubes con `runKnockoutChain` + journal | 1,5 |
| D | Los 40 eventos completos + retención de jugadores | 2 |
| E | Minijuegos (reusando el motor de El Capitán) | 1 |
| F | Ranking, vitrina con trofeos reales, compartir con Satori | 1,5 |
| G | Balance: 1.000 temporadas simuladas, ajustar las 5 perillas | 1,5 |

**Las cinco perillas de balance**, las mismas que en El Interino: el freno de progresión, el `ruido` del dado, el `drawBand`, la curva de riesgo de despido y la escala económica.

---

## 13. Riesgos, en orden

1. **Abrir este frente sin cerrar el bug de los saves.** Carrera de Rugby y El Capitán están borrando partidas en cada release. Empezar un tercer juego encima de eso multiplica el problema por tres. **Los migradores van primero.**
2. **Scope creep hacia el manager profundo.** Tu propio GDD lo marca como riesgo Alta/Crítico. Cada vez que aparezca la idea de "y si además el jugador arma el line...", la respuesta es el GDD, no este juego.
3. **La calibración del marcador.** El punto bonus hace que el marcador tenga consecuencias, así que un `genScore` mal calibrado rompe la tabla. Por eso el test de calibración va en el día 2–3, no al final.
4. **Datos de personas.** Ver §11. Decidilo antes de escribir una línea, no después.
5. **Frentes simultáneos.** Mayo: Rugby Manager, 9 días y para. Julio: rugby-manager-pro, para a mitad del sistema comercial. El patrón no es técnico.

---

## Anexo — Tabla de reuso: de dónde sale cada pieza

| Pieza | Fuente | Trabajo |
|---|---|---|
| Bucle de temporada, checkpoints | El Interino | Portar |
| Sistema de eventos + `outcomes` ponderados | El Interino | Portar |
| Presión, objetivo, despido | El Interino | Portar con nuevos umbrales |
| Reputación con techo por categoría y factor de tier | El Interino | Portar |
| `runKnockoutChain` + journal de determinismo | El Interino | Portar |
| Tick anual de la pirámide | El Interino / `seasonRunner.js` | Elegir uno |
| Cofre, logros, vitrina, misiones | El Interino | Portar a `features/meta/` |
| `random.ts` mulberry32, arquitectura `engine/` | Carrera de Rugby | Copiar |
| `positions.ts` con escasez de puesto | Carrera de Rugby | Copiar |
| Token-receta + Satori para compartir | Carrera de Rugby | Copiar |
| Curva de edad y lesiones tipificadas | Carrera de Rugby | Adaptar a plantel |
| Motor de minijuegos + `margin` + `pay.ts` | El Capitán | Copiar |
| `decisionImpact` (restar estados) | El Capitán | Copiar |
| Cobertura exhaustiva en compilación | El Capitán | Copiar |
| 29 competencias con niveles y roles | `rugby-manager-pro/ruleSets.js` | Portar a TS |
| 554 clubes con unión, ciudad, colores | `rugby-manager-pro/clubsARG.js` | Portar + cruzar con Supabase |
| Calibración: +4,38 localía, 61,8% local | `rugby-manager-pro/calibration.js` | Usar como test |
| Banco de nombres por región cultural | `rugby-manager-pro/name_bank.json` | Usar |
| Escudos, palmarés, tablas con bonus, rating de clubes | Supabase de g22scores | Consultar |
| Fixture real para misiones semanales | Supabase `matches` | Consultar |

**Lo único que hay que escribir de cero: el `SPORT_PROFILE`, los 40 eventos, la economía del club amateur y la UI.** Todo lo demás ya existe en algún proyecto tuyo.
