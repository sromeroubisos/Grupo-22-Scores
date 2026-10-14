# El Entrenador v2: cómo sigue la construcción

Complementa [el-entrenador-v2.md](el-entrenador-v2.md), que tiene la auditoría y el diseño.
Este archivo es el plan de trabajo: qué se hace en cada etapa, en qué orden, qué
se toca, cómo se prueba y cuándo se da por terminada.

Estado al 2026-10-14: la **Etapa 1 (base)** está cerrada (SCHEMA 6, motor 2.0.0) y la
**Etapa 2 (la temporada en tramos)** está construida y a la espera de revisión
(SCHEMA 7, motor 2.1.0). Ver "Cómo quedó la etapa 2" más abajo. La **Etapa 3 (el
mercado de jugadores)** está construida y a la espera de revisión (SCHEMA 8, motor
2.2.0). Ver "Cómo quedó la etapa 3". La **Etapa 4 (juveniles)** está construida y a
la espera de revisión (SCHEMA 9, motor 2.3.0). Ver "Cómo quedó la etapa 4".

---

## Cómo se trabaja cada etapa

1. **Brief preciso** a un agente: archivos, reglas, números a medir y criterios de
   aceptación. Las etapas van **en secuencia** porque todas tocan el mismo motor
   (`run-season.ts`, `types/coach.ts`, el guardado). Dos en paralelo se pisan.
2. **Revisión mía** antes de pasar a la siguiente:
   - diff completo de lo tocado;
   - `npx tsc --noEmit -p .` sin errores;
   - todos los tests del juego en verde, incluido el harness de mil carreras;
   - números medidos con scripts, no estimados;
   - una partida jugada en el navegador, con recarga (F5) a mitad de temporada.
3. **El guardado nunca se rompe**: cada etapa que cambia el estado sube el esquema y
   agrega su migrador. Una partida de hoy tiene que cargar en todas las etapas.
4. **Nada decorativo**: cada botón nuevo cambia el estado, el cambio persiste y se
   ve en alguna pantalla. Si no, no entra.

---

## Etapa 1 — Base (en curso)

- Estatus por división: `amateur`, `viaticos`, `semipro`.
- Jugador con moral, fatiga, lesión, personalidad, arraigo, formado en el club,
  vínculo (beca, viático o contrato) y estadísticas.
- Economía v2: sueldos, entradas, mantenimiento de las mejoras, cuerpo técnico,
  intereses.
- Deuda con consecuencias proporcionales: ajustada → complicada (bloqueos) → grave
  (plan de ajuste) → crónica (intervención).
- Salidas de la deuda: préstamo de la unión, adelanto de cuotas, evento a
  beneficio y recortes.
- Objetivos múltiples (deportivo, secundarios con contexto, formativo, económico)
  y un proyecto de tres temporadas.
- Esquema del guardado 6, motor 2.0.0.

**Lo reviso con especial cuidado:**
- que un club pobre no quede condenado desde el año 1;
- que una mala temporada no colapse al club, pero tres seguidas sí lo pongan en crisis;
- que los objetivos sean realistas para cada club.

---

## Etapa 2 — La temporada en tramos

**Qué cambia:** la fase regular deja de jugarse de una vez. Se parte en tres tramos
y el entrenador decide antes de cada uno.

- `CoachState.inSeason`: tramo actual, tabla y partidos parciales, ratings del año.
  Recargar a mitad de un tramo retoma idéntico.
- **Partido a partido con jugadores reales.** La alineación sale del plantel:
  - los lesionados no juegan;
  - la fatiga y la moral bajan el nivel del día;
  - los tries se reparten por puesto y nivel;
  - se suman partidos, titularidades, tries, puntos y nota.
- **Minijuego 1, la semana de entrenamiento.** Cinco días para repartir entre carga
  (alta, media, baja) y foco (scrum y line, defensa, ataque, físico, recuperación).
  Rinde más el foco que ataca la debilidad del rival del tramo. Mueve la fatiga, el
  riesgo de lesión, el rendimiento del tramo y el crecimiento de los jóvenes.
- **Minijuego 2, el partido clave.** El partido del tramo contra el rival directo o
  el clásico:
  1. Plan previo según el rival, el clima (lluvia: juego cerrado) y el estado físico.
  2. Se juega el primer tiempo.
  3. Con el marcador a la vista, ajuste de entretiempo: cerrar, arriesgar o rotar.
  4. Se juega el segundo tiempo con lo elegido.

  Reusa el motor calibrado partido en dos mitades.
- **Las tarjetas de decisión** pasan a ser 1 o 2 por tramo, no 5 juntas.
- La pantalla de resultado suma las estadísticas individuales y el mejor del año.

**Hecho cuando:**
- tests de determinismo por tramo, de recarga a mitad de tramo y de estadísticas
  que cierran (los tries del club = la suma de los de sus jugadores);
- el harness de mil carreras sigue verde con la calibración del dado intacta.

---

### Cómo quedó la etapa 2 (2026-10-14)

**El tramo, en orden.** Las tarjetas del tramo (2 · 2 · 1: siguen siendo cinco
por año, así que el balance de la caja y la presión no se mueve por el reparto)
→ la semana de entrenamiento → las fechas hasta el partido clave → el partido
clave en dos tiempos → el resto de las fechas → el resumen del tramo. Las
tarjetas van ANTES de la semana para que "Simular el tramo" juegue sin más
preguntas desde ahí.

**El reparto de fechas** (`tramoRange` en `engine/tramos.ts`): bloques seguidos,
los primeros `R mod 3` con una fecha más.

| Fechas | Tramos | Divisiones |
|---|---|---|
| 26 | 9 · 9 · 8 | 14 clubes ida y vuelta (Top 14, Primera A-C, Segunda) |
| 22 | 8 · 7 · 7 | 12 u 11 clubes ida y vuelta (con 11, una fecha libre por rueda) |
| 18 | 6 · 6 · 6 | 10 o 9 clubes ida y vuelta |
| 14 / 10 | 5 · 5 · 4 / 4 · 3 · 3 | 8 o 7, y 6 clubes ida y vuelta |
| 11 / 9 / 7 | 4 · 4 · 3 / 3 · 3 · 3 / 3 · 2 · 2 | 12, 10 (o 9) y 8 clubes a una rueda |
| 6 | 2 · 2 · 2 | Desarrollo Chubut (4 clubes ida y vuelta, la más corta) |

**Partido a partido** (`engine/lineup.ts`, `engine/tramos.ts`): la alineación sale
del plantel sano según la política del tramo (los mejores, rotar, pista a los
pibes); el cansancio y el ánimo del XV son modificadores chicos del rating del
día (hasta −1,2 con el XV fundido, ±0,8 por ánimo); los tries se reparten por
puesto y nivel, el pie va al 10 del día; tackles y nota por jugador. Los tries
de un partido nunca valen más que sus puntos (`fitTries`). Las constantes del
dado no se tocaron; el partido clave usa el mismo dado partido en dos tiempos
(`rollFirstHalf` / `rollSecondHalf` en `match.ts`, con `HALF_LOSER_MEAN = 9`).

**Los números del harness de mil carreras** (decisiones al azar, plan por
defecto; antes → después):

| | 2.0.0 | 2.1.0 |
|---|---|---|
| Despedidos en 12 temporadas | 27,9 % | 33,4 % |
| Temporadas con presión ≤ 5 | 11,0 % | 8,2 % |
| Campeón | 36,7 % | 35,2 % |
| Objetivo deportivo cumplido | 67,9 % | 65,7 % |
| Secundario / económico | 80,3 % / 75,2 % | 80,7 % / 71,6 % |
| Formativo | 100 % | 69,3 % |
| Lesiones por temporada | — | 2,1 |

El salto en los despidos y la caída del económico vienen del formativo, que ya
no se cumple siempre: no cumplirlo suma presión (+2 en vez de −1) y le resta
presupuesto al año siguiente (la nota de los objetivos baja el ajuste de la
subcomisión). Ningún umbral se aflojó.

**El guardado**: 135 KB al terminar una carrera de 12 temporadas; pico de 157 KB a
mitad de año (resumen del tercer tramo en una división de 14).

**Pendiente o dudoso**:
- La alineación del día no la elige el entrenador jugador por jugador: elige la
  política del tramo. Elegir el XV a mano entra con el mercado (etapa 3) o aparte.
- El playoff usa la alineación de hoy (sin lesionados, con su cansancio), pero
  sus partidos no suman estadísticas individuales: las de la temporada son de la
  fase regular.
- Las copas (Interior y Nacional) siguen con el rating de pretemporada.

## Etapa 3 — Mercado de jugadores, nacional e internacional

**Salidas:**
- clubes del país de más arriba, y del exterior desde los 558 clubes del catálogo
  de Carrera;
- el interés sale del nivel, la edad, el techo, la forma y las estadísticas de la
  etapa 2;
- cada oferta trae club, país, liga, condiciones, compensación para el club y la
  **inclinación del jugador** (personalidad, arraigo, salto de nivel, plata).

**Decisiones:**
- aceptar;
- rechazar (si el jugador quería irse, baja su moral y puede pedir de nuevo);
- retener con beca, viático o contrato, según el estatus y si la caja lo permite;
- negociar la compensación.

**Minijuego 3, la negociación.** Rondas de oferta y contraoferta contra un rival
con un valor de reserva oculto y una paciencia que se gasta. Las reacciones dan
pistas, nunca el número. Se reusa en las renovaciones, en las incorporaciones y en
la etapa 5 con los sponsors.

**Llegadas:**
- libres, los que vuelven del exterior y los que quieren subir de categoría;
- extranjeros de la región (Uruguay, Chile, Paraguay, Brasil), donde el estatus lo
  permite;
- la disposición de cada uno sale del atractivo del club;
- a veces otro club compite por el mismo jugador.

**Ventanas:** la pretemporada, y una corta entre el tramo 1 y el 2. Además:
- vencimientos de viáticos y contratos;
- cesiones de suplentes a clubes de abajo para que sumen minutos;
- el jugador que no juega pide salir.

**Lo reviso midiendo en cientos de carreras:**
- cuántas ofertas recibe un titular de cada nivel y qué parte son del exterior;
- que los clubes amateurs no se vacíen;
- que el que destaca en la etapa 2 despierte más interés.

### Cómo quedó la etapa 3 (2026-10-14)

**Archivos.** `engine/transfers.ts` (el mercado), `engine/negotiation.ts` (el
minijuego 3, genérico), `engine/market-policy.ts` (el jugador simulado de los
harness), `data/transfer-pathways.ts` (las vías declaradas, catálogo con versión);
en la UI, `MarketBoard.tsx` (pestaña Mercado en la pretemporada y la pantalla de la
ventana corta) y `NegotiationPanel.tsx` (reutilizable).

**Las dos ventanas.** La de la pretemporada se abre al cerrar el año, con las
estadísticas de la temporada que terminó; la corta es una fase nueva (`market`)
entre el tramo 1 y el 2, con las del tramo 1. Lo que no se contesta se resuelve
solo al cerrar la ventana: la oferta se rechaza, el vencido se renueva por lo que
pide si la caja lo deja, el pedido de salida queda en nada. Todo el azar del
mercado sale de RNG derivados: mirar o resolver la ventana no corre el RNG de la
carrera.

**Las puertas del exterior.** Primero se decide si el club que llama es de afuera,
con una chance fija por estatus (`ABROAD_SHARE`: 0,15 amateur, 0,30 viáticos, 0,70
semiprofesional) y después se busca destino de ese lado: si no hay, no hay oferta.
Del lado de afuera se elige la LIGA (cada una pesa uno) y después el club: el
volumen de un país no gana. El que tiene contrato tiene mercado abierto (22 ligas
profesionales o semiprofesionales, 234 clubes). El amateur, el becado y el del
viático solo por una de las cinco vías declaradas: el scouting del Super Rugby
Americas (19 a 27 años, nivel 58), la academia de un club francés (18 a 21, techo
66), y los convenios con España, Italia y la Fédérale 1 (nivel 48 a 50). Del
catálogo de Carrera (558 clubes del exterior) el mercado usa 319, en 29 ligas.
Del lado de acá: hasta dos divisiones de arriba en la rama, y en el techo de una
rama del interior, el Top 14 de la URBA.

**Identidad amateur.** Sin pase en el amateur ni en los viáticos: compensación cero,
o una ayuda simbólica de un club profesional del exterior que entra a la caja como
renglón propio y no se muestra sobre el jugador. El viático se negocia en
porcentaje del de la división. Los pesos sobre un jugador aparecen solo en el
semiprofesional.

**Lo medido** (200 carreras × 12 temporadas, el mercado al azar). Ofertas por
titular y por temporada, tercio alto / medio / bajo del XV: amateur 0,24 / 0,09 /
0,02; viáticos 0,29 / 0,12 / 0,03; semipro 0,40 / 0,28 / 0,10. Parte del exterior:
3 %, 33 % y 100 %. Ninguna oferta del exterior a un jugador sin contrato por fuera
de una vía declarada (768 miradas). A igual nivel, el que se destaca recibe entre
0,05 y 0,09 ofertas por ventana y el que no juega, ninguna. Los planteles amateurs
quedan entre 23 y 26 aceptando todo y rechazando todo, y la fuerza media del XV no
cae (14,7 → 17,7 y 14,9 → 17,7).

**El harness de mil carreras** (antes → después): despedidos 33,4 → 35,4 %; presión
≤ 5 8,2 → 7,3 %; campeón 35,2 → 33,3 %; objetivo deportivo 65,7 → 64,8 %;
secundario 80,7 → 79,7 %; económico 71,6 → 71,8 %; formativo 69,3 → 59,0 %. El
formativo baja por las decisiones del mercado (vender al propio, firmar de afuera,
ceder pibes): rechazando todo da 69,7 %. Ningún umbral se aflojó.

**El guardado**: 136 KB al cierre de cada año como mucho, 137 KB al terminar la
carrera, pico de 160 KB en el resumen del tercer tramo. El mercado no pasa de 7 KB.

**Pendiente o dudoso**:
- En la ficha del plantel (`SquadBoard`, etapa 1) el viático de cada jugador sigue
  apareciendo en pesos en las divisiones con viáticos; el Mercado ya no lo hace.
  Decidir si se unifica.
- La fuerza media del XV sube unos tres puntos en doce temporadas con cualquier
  política: es el crecimiento de `ageSquad` y no el mercado, pero conviene mirarlo
  en la etapa 8.
- El cedido no suma estadísticas en el club al que va (no se simula esa liga).
- La disposición de los candidatos no mira todavía los sponsors (etapa 5) ni la
  cantera (etapa 4).

---

## Etapa 4 — Juveniles

- **M19** de 8 a 12 pibes. Techo real oculto y un **rango estimado** que se afina
  observándolos.
- **Minijuego 4, la jornada de captación.** Candidatos con información parcial y
  puntos de observación limitados para gastar antes de elegir a quién sumar. Una
  joya aparece muy de vez en cuando (alrededor del 3 % por año), sin garantía de
  que llegue.
- **Planes de desarrollo:** físico, técnico, minutos o equilibrado. Rinden según la
  formación del entrenador, la estructura y la mejora del M19.
- **Decisiones:** mantener, promover a primera, ceder o liberar.
- Los objetivos formativos de la etapa 1 pasan a medir esto: promover N y dar
  minutos a los formados.
- **El costo de formar contra el de comprar** tiene que ser una elección real. Se
  mide en el harness: un club que forma bien tiene que poder competir sin
  incorporar.

### Cómo quedó la etapa 4 (2026-10-14)

**Archivos.** `engine/academy.ts` (el M19, la captación, los planes y el cierre),
`engine/market-policy.ts` (`autoResolveAcademy`: el jugador simulado `azar`,
`forma` y `compra`), `engine/academy.test.ts`; se tocaron `run-season.ts` (el
cierre), `transfers.ts` (`fillFromAcademy` sube primero del M19; `SQUAD_MAX` y
`SQUAD_MIN` viven en `squad.ts`), `squad.ts` (`ageSquad` con `replaceRetired`),
`objectives.ts` (`formativeKind`), `sanitize.ts`, `types/coach.ts`. En la UI,
`AcademyBoard.tsx` (pestaña M19 de la pretemporada) y `ScoutingDay.tsx` (el
minijuego 4, componente propio).

**El M19.** De 8 a 12 pibes de 16 a 19 en `CoachState.academy`, fuera del plantel
y del tope de 26. Techo real OCULTO; el club ve un rango estimado que lo contiene
siempre: ancho 10 en los chicos del club, 18 en un candidato (24 en una joya); se
angosta a la mitad al observar (piso 3) y a tres cuartos por cada año en el club.

**La jornada de captación.** Una por año en la pretemporada: 6 candidatos (+1 con
estructura ≥ 50, +1 por nivel del entrenador del M19, tope 10) con puesto, edad,
una pista en palabras (un rasgo y una impresión que mira el techo con ruido) y el
rango. Puntos de observación: 2 + formación/2 (+1 con estructura ≥ 60, +1 por
nivel de la mejora): el neutro tiene 4, el formador 6. Observar deja ver el nivel
de hoy. Se suman hasta 3. Arrancar la temporada cierra la jornada. Joya: 3 %
(medido 3,13 %: 150 de 4.800 jornadas), techo 10 a 18 puntos arriba del nivel
base de primera, sin garantía (una tirada anual de 0,35 a 1,35 la puede estancar).

**Los planes.** Crecimiento anual = 0,24 × lo que le falta al techo × plan ×
entrenador × tirada. Físico 1,2 en forwards / 0,9 en backs; técnico al revés;
minutos 0,85 en el club y 1,45 cedido; equilibrado 1 (cedido, cualquiera 1,15).
Entrenador = (0,6 + formación/12) × (0,7 + estructura/160) × (1 + 0,12 por nivel
del M19). Profesional ×1,1, conflictivo ×0,85.

**Decisiones.** Subir a primera (desde los 17, respeta el tope de 26: con el
plantel lleno hay que liberar a alguien o reservarlo), reservar para el cierre,
ceder por el año (hasta 3, a un club de la división de abajo), liberar (con más
de 8) y el plan. La REGLA DE LOS 20, escrita en la pantalla: al cierre el que
cumple 20 sube si hay lugar y, si no, se va.

**El cierre.** Ya no se inventa un pibe cuando alguien se retira. Orden: crecen
y vuelven los cedidos → los reservados cubren los lugares → los de 20 suben o se
van → si todavía falta, suben solos los mejores de 18 o más (avisado en la
pestaña M19) → si el M19 no alcanza, libres generados como antes → el M19 se
completa hasta 8 con chicos de 16 y 17. Una salida a mitad de año que deja el
plantel por debajo de 23 también sube primero del M19.

**El formativo** elige entre "subir del M19 a N" (cuando hay un pibe listo y el
plantel tiene 8 o más de 30 años, o 1 propio o menos en el XV; N = 1, o 2 con tres
listos) y las titularidades de siempre. Harness de objetivos (200 carreras, el
M19 al azar): 76 % (83 % titularidades, 67 % subir). Sin tocar el M19: 23 %.

**Formar contra comprar** (150 carreras × 12, tarjetas al azar): el que forma
termina con el XV en 25,3, posición media 0,244, 38,6 % de temporadas con
título, 32 % despedido y 48,5 M de caja; el que compra, 26,6, 0,226, 41,5 %,
38,7 % y 37,9 M. Ninguno domina en todo (`academy.test.ts`).

**El harness de mil carreras** (antes → después): despedidos 35,4 → 34,7 %;
presión ≤ 5 7,3 → 8,7 %; deportivo 64,8 → 64,7 %; secundario 79,7 → 79,5 %;
económico 71,8 → 72,8 %; formativo 59,0 → 72,6 %. Sin decisiones sobre el M19:
formativo 29,9 % y despedidos 41,8 %.

**El guardado**: 144 KB al cierre como mucho (eran 136), pico de 166 KB en el
resumen del tercer tramo (eran 160). El M19 no pasa de 7 KB. El migrador 8 → 9
deja `academy` en null y el saneado lo arma con un RNG derivado de la semilla y
el club (no corre la carrera); en la pretemporada abre también la jornada.

**Pendiente o dudoso**:
- El pibe que sube llega en promedio a base − 9,9 (el libre generado llegaba a
  base − 8): el M19 de las categorías es un poco más flojo. Revisarlo en la
  etapa 8 junto con la fuerza media del XV.
- Al subir a primera, el techo pasa a ser el `potential` del jugador, que la
  ficha del plantel muestra. Es el comportamiento de siempre del plantel; si se
  quiere el techo oculto también en primera, es un cambio de `SquadBoard`.
- El cedido del M19 no suma estadísticas (como el cedido del plantel).
- La ventana corta no tiene pantalla del M19: el motor deja subir y liberar ahí,
  pero la pestaña existe solo en la pretemporada.
- El harness de objetivos (`economy-objectives.test.ts`) ahora maneja el M19 al
  azar; sin eso el formativo cae al 23 % porque nadie sube a los pibes que la
  subcomisión pide.

---

## Etapa 5 — Sponsors

- Empresas **ficticias** por sector y tamaño, cada una con su presupuesto, sus
  preferencias (exposición, gente, imagen) y su tolerancia a una crisis.
- Tres lugares: principal y dos secundarios.
- **Prospectos** según el atractivo del club: categoría, gente, resultados,
  reputación y exposición en el Interior, el Nacional y el playoff.
- **La negociación** reusa el minijuego 3: monto, años y cláusula por objetivo.
- **Contratos** con vencimiento, renovación según la satisfacción y rescisión por
  descenso o por crisis.
- Pantalla **Comercial** con los contratos vigentes, los vencimientos, lo proyectado
  y las oportunidades.
- **Reemplaza** la fórmula `hinchada × 21.000` de la economía.
- **Conexiones:**
  - una buena campaña trae prospectos más grandes;
  - una crisis espanta a los sponsors y complica renovar;
  - el objetivo comercial de la subcomisión mide esto.

---

## Etapa 6 — Eventos con contexto real

- Las 40 tarjetas pasan a nombrar personas y cosas reales de la partida: el jugador
  sin minutos, el rival directo, el sponsor que vence, el pibe que pide pista.
- **Disparadores por estado**, no por azar:
  - moral baja de un titular → conflicto de vestuario;
  - deuda complicada → reunión de tesorería;
  - racha de derrotas → la prensa aprieta.
- **Minijuego 5, la conferencia de prensa.** Tres preguntas seguidas. El tono de
  cada respuesta mueve las expectativas, la gente y la presión, y lo que se promete
  queda como objetivo.
- **Minijuego 6, el conflicto de vestuario.** Jugadores con nombre y personalidad.
  Las opciones dependen de quién es el líder del plantel, y la moral queda marcada
  jugador por jugador.
- **Familias nuevas:** vestuario, tesorería, comercial.
- **Meta:** que en doce temporadas casi ninguna situación se repita igual. Se mide
  con el harness.

---

## Etapa 7 — El entrenador al exterior

- Las ligas del exterior del catálogo pasan a ser jugables como división única, sin
  pirámide.
- Su economía sale de su estatus y su moneda, con tipos de cambio fijos declarados
  como dato.
- Sus vacantes entran al mercado de entrenadores con una puerta de reputación:
  Sudamérica desde 50, Europa y la MLR desde 70.
- Al volver a la Argentina se conserva la reputación y la trayectoria.

---

## Etapa 8 — Balance y escenarios

Un harness de escenarios, además del de mil carreras:

- club rico y club pobre en cada estatus;
- temporadas buenas seguidas y malas seguidas;
- déficit persistente: tiene que escalar a crónica, nunca colapsar en un año;
- un club que solo forma y uno que solo incorpora: los dos tienen que ser viables;
- ofertas internacionales: cuántas, a quién y si un club pequeño puede retener;
- sponsors: que un club grande no sea el único que consigue contratos.

Se corrige lo que salga incoherente y se deja el número medido en un comentario
junto a cada constante, como en `economy.ts`.

---

## Riesgos y cómo se manejan

- **El tamaño del guardado.** Hoy son ~90 KB. Con estadísticas, juveniles, mercado
  y sponsors puede pasar los 200 KB. Se mide en cada etapa; si se acerca a 1 MB, el
  historial de partidos viejos se resume.
- **Largo de una temporada.** Con tres tramos son unas 10 interacciones en vez de 5.
  Para que no canse, cada tramo tiene la opción "Simular el tramo", con un plan por
  defecto que el entrenador puede dejar fijo.
- **Calibración del partido.** El motor del dado está medido sobre 286 partidos
  reales (`match-calibration.test.ts`). La fatiga, la moral y el entrenamiento
  entran como modificadores chicos del rating del día, nunca tocan las constantes
  del dado.
- **Identidad amateur.** El valor de mercado y los sueldos solo existen donde
  existen de verdad (semipro y exterior). En una división amateur no aparece un
  número en pesos sobre un jugador.
