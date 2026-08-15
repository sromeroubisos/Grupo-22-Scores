// EL CAPITÁN — el estado de la carrera.
//
// `CaptainState` es JSON PURO: nada de `Date`, `Map`, `Set`, funciones ni
// referencias circulares. Si te tienta guardar un club entero, guardá el `id` y
// resolvelo contra el catálogo (CLAUDE.md §2). Hay un test que lo verifica
// serializando y comparando.

import type { CaptainPlayer, CaptainStage, PositionFamilyId } from './player.ts';
import type { BelongingLedger, DamageLedger } from './currencies.ts';
import type { CaptainDecisionEntry, CaptainSeasonEntry, MatchBudget } from './season.ts';
import type { MomentRecord, PendingMoment } from './moment.ts';
import type { Milestone, SeasonAward } from './achievements.ts';
import type { LeagueStanding } from './season.ts';
import type { PendingTournament } from './tournament.ts';

/**
 * VERSIÓN DEL MOTOR.
 *
 * Se sube cuando cambia lógica que altera resultados con la misma semilla. No
 * se sube por un texto de UI que no se persista, ni por nada derivado.
 *
 * ── Changelog ──
 * 0.1.0 — El esqueleto. Tipos, las seis monedas, las ocho familias de puesto,
 *         el reducer con el ciclo de temporada y el chequeo de retiro. Todavía
 *         no hay simulación de partidos, ni eventos, ni mercado: las funciones
 *         que faltan están declaradas como TODO en `state/captain-reducer.ts`,
 *         nombrando el archivo que las va a llenar.
 * 0.2.0 — El juego. Simulación de temporada (tiempo de juego, planilla del
 *         puesto, desgaste y conmociones), crecimiento y declive de atributos,
 *         la escalera de club con ofertas y títulos, la escalera representativa
 *         con caps y archirrival, el momento bisagra de firmar profesional, y
 *         el catálogo de eventos con su selector.
 * 0.3.0 — Los Momentos: la jugada que decide y que no se simula, se juega. El
 *         armazón (cuándo aparece, con qué márgenes, cómo vuelve a la
 *         temporada) y los dos transversales, El Tackle y El Bunker. Los quince
 *         por puesto entran por el mismo carril sin tocar el reducer.
 * 0.4.0 — El CONTRATO de un Momento (`types/moment-def.ts`) y el primero que lo
 *         cumple, El Jackal, para la tercera línea. Tres cosas que el contrato
 *         impone y antes eran disciplina: `resolve` no ve el contexto —lo que
 *         necesita viaja masticado en el Setup, así que la jugada se resuelve
 *         igual antes y después de un F5—, `MomentDeltas` está cerrado a los
 *         carriles del motor, y una cadena se resuelve a lo sumo una vez.
 *         Las semillas son DERIVADAS: `hash(semilla:temporada:momentPick)` para
 *         elegir el kind y `hash(semilla:kind:temporada:idx)` para el minijuego.
 *         `rollMoment` sigue consumiendo lo mismo del stream principal, así que
 *         el digest congelado no se mueve por agregar Momentos: se mueve solo
 *         donde uno cambió de verdad el resultado.
 * 0.5.0 — Tres Momentos más, y con ellos tres VERBOS que el juego no tenía. El
 *         Ancla (primera línea) se juega insistiendo: push-your-luck sobre un
 *         punto de quiebre oculto, y es el único que no mide reflejos. El Código
 *         (hooker y segunda línea) se juega acordándose: la seña del line-out se
 *         muestra y se repite. Los Palos (apertura) se juega apuntando afuera:
 *         el viento corre la pelota, así que frenar sobre el blanco es errarle.
 *         Un juego de puestos donde los quince minijuegos midan lo mismo no es
 *         un juego de puestos.
 *         Y EL CRUCE: el 8% de las veces te toca una jugada que no es tuya y la
 *         jugás con menos oficio. Es lo que despierta `proficiency`, que hasta
 *         acá existía sin usarse en partida.
 * 0.6.0 — La Banda (wing y fullback), el sexto verbo: ELEGIR CUÁNDO. El defensor
 *         viene y vos decidís a qué distancia lo resolvés —amague de lejos,
 *         cambio de ritmo a media, atropellar solo encima—, y lo que se gasta es
 *         LA CANCHA: el amague es el más seguro y el que más lateral se come, así
 *         que amagarlos a todos no entra. La cal corta la jugada pero no borra
 *         los metros, que es de dónde salen sus cuatro notas.
 *         Es el primer Momento cuya mano es una SECUENCIA que puede cortarse a la
 *         mitad: `resolve` la camina hasta el primer fallo y cobra el parcial.
 *         El contrato lo aguantó sin un carril nuevo.
 *         Y `playAt`: cada Momento declara cómo lo juega un simulado de nivel
 *         bien / regular / mal. No cambia lo que pasa en partida —la pantalla no
 *         lo llama— pero es lo que hace comparable el digest entre Momentos, y lo
 *         que impide que la receta de un test vuelva a congelar a un pateador que
 *         apunta al azar.
 * 0.7.0 — SE VAN LAS SEIS FICHAS. En su lugar hay una carta de pretemporada:
 *         elegís un entrenamiento entre cuatro y sube uno o dos atributos. No es
 *         un cambio de balance sino de género — repartir un presupuesto es
 *         contabilidad y no deja anécdota; elegir una cosa y comerse la
 *         consecuencia sí.
 *         Las otras cuatro vías que alimentaban las fichas se DERIVAN ahora: la
 *         Pertenencia sale de quedarse, jugar y ganar; el cuerpo descansa una
 *         pretemporada fija; la estabilidad la cubre el evento
 *         `per-trabajo-y-entrenamiento`, que ya existía; y el resto de los
 *         atributos se mueve por el RENDIMIENTO de la temporada en vez de por
 *         una ficha de entrenar.
 *         Se va también el empuje del gimnasio del PlaDAR sobre la escalera
 *         representativa, y esa es la única vía que queda sin reemplazo hasta que
 *         entren las convocatorias jugables.
 * 0.8.0 — EL TECHO SE PARTE EN DOS: `potentialBase` (sorteado) + `built`
 *         (construido, acotado a `POTENTIAL_BAND`). `potential` deja de ser un
 *         campo y pasa a ser `potentialOf()`, derivado.
 *         No es tuning: es el canal que el motor no tenía. Medido antes del
 *         cambio, un jugador SIN ENTRENAR NADA tocaba su techo exacto en los
 *         tres puestos y los tres niveles de potencial —`pull` es proporcional
 *         a la brecha, así que el lazo converge solo—, y toda decisión caía
 *         adentro del mismo recorte: podía hacerte llegar antes, nunca más
 *         alto. La carta cara, encima, terminaba POR DEBAJO de la gratis,
 *         porque el recorte es proporcional y lo dirigido le robaba al
 *         crecimiento general mientras el costo se cobraba igual.
 *         Ahora lo que construye la carta cae AFUERA del recorte y el costo
 *         compra algo. Falta la otra mitad —`pull` escalado por rendimiento—
 *         para que no llegar al techo vuelva a ser posible.
 * 0.9.0 — CINCO CAMBIOS EN UNA SOLA VERSIÓN, y hay que decirlo así porque el
 *         digest estuvo rojo desde el primero y no se refrescó hasta el quinto:
 *
 *           eb76b8d  una liga tiene UN campeón, y lo elige el rating
 *           1c66b8d  los carriles de abajo son cupos, no umbrales
 *           d4a0bd6  la camada maduraba en el techo del propio jugador
 *           a23272e  SQUAD_SHAPE no hacía nada
 *           0fd5008  la cola de los cupos era una logística inflada
 *
 *         LA ATRIBUCIÓN INDIVIDUAL NO SE RECUPERA. Este número no dice qué hizo
 *         cada uno: dice que entre 0.8.0 y acá pasaron esos cinco. El que quiera
 *         saber cuál movió qué campo tiene que volver a medir commit por commit.
 * 0.10.0 — LA DISPONIBILIDAD. Un cambio y uno solo, a propósito, después de lo
 *         que costó 0.9.0.
 *
 *         Hasta acá los minutos salían de UNA cuenta —`share = f(ovr − rating)`—
 *         y el juego medía si eras mejor que tu club, nada más. La convocatoria
 *         SUMABA partidos sin sacarte de ninguno, la lesión existía solamente
 *         como riesgo de una carta de pretemporada, y el crecimiento leía tu
 *         LUGAR en el equipo en vez de los partidos que jugaste.
 *
 *         Ahora hay dos números distintos y separados:
 *           · el LUGAR   — `share`, cuánto de lo disponible te toca. No cambió.
 *           · la AUSENCIA — fechas que te perdiste: gira, lesión, suspensión.
 *
 *         Y el crecimiento pasa a leer los partidos JUGADOS, de la camiseta que
 *         sea. Es el prerrequisito §6.ter de `docs/el-capitan-formacion.md`: sin
 *         esta dimensión, los años 16–20 serían un prólogo donde al que se rompe
 *         la espalda entrenando le pasa lo mismo que al que no.
 * 0.11.0 — LA PROGRESIÓN. Es el cambio más grande desde 0.2.0 y toca las dos
 *         mitades del juego: cómo crece un jugador y qué puede ganar.
 *
 *         ── Cómo crece ──
 *         Hasta acá el trabajo de una temporada valía lo mismo en el Top 14 que
 *         en la Tercera de la URBA: la única entrada era cuántos partidos
 *         jugaste. Ahora vale lo que vale, y se calcula en `engine/growth.ts`
 *         con seis factores que se discuten por separado —entorno, vida afuera,
 *         empuje juvenil, tirada del año, mérito de la temporada pasada y
 *         perfil de desarrollo—. Entra además la CURVA POR ATRIBUTO: a los 31 un
 *         wing pierde velocidad al doble de lo que pierde liderazgo, que es la
 *         mitad de la explicación de por qué un apertura juega hasta los 35.
 *
 *         Ojo con lo que esto NO hace, porque es el §1.6 del CLAUDE de captain:
 *         `pull` sigue siendo proporcional a la brecha, así que el lazo converge
 *         al techo igual. Lo que cambia es CUÁNTAS TEMPORADAS tarda — y como la
 *         carrera dura lo que dura, el del club de barrio se retira sin haber
 *         llegado. Ese es el mecanismo, y es honesto.
 *
 *         Entra también el PERFIL DE DESARROLLO (`player.developmentProfile`,
 *         sorteado al nacer y revelado en el retiro) y la regresión por lesión
 *         grave: romperse baja atributos físicos, así que la media puede caer en
 *         una temporada bien entrenada.
 *
 *         ── Qué puede ganar ──
 *         Los cinco carriles de logros, que antes eran uno y medio:
 *           · TÍTULOS DE CLUB — ya estaban.
 *           · ASCENSO Y DESCENSO (`engine/promotion.ts`) — el grafo `MOVEMENTS`
 *             existía como dato y no lo leía nadie. Si tu club sube, jugás la
 *             temporada que viene en la división nueva, con el mismo club.
 *           · TÍTULOS DE SELECCIÓN (`engine/international-results.ts`) — tu
 *             unión gana o no gana por su cuenta, y el título se te acredita si
 *             sumaste al menos un cap ese año.
 *           · PREMIOS INDIVIDUALES (`engine/awards.ts`) — tres, en escalera de
 *             alcance, para que la vitrina no sea solo del que llegó arriba.
 *           · HITOS (`engine/milestones.ts`) — debut, primer contrato, cruce de
 *             frontera, vuelta a casa, Salón de la Fama.
 *
 *         Y el número que faltaba para que todo eso se pudiera preguntar: EL
 *         PUNTAJE DE LA TEMPORADA (`engine/season-rating.ts`), de 5,0 a 9,9,
 *         relativo a lo que se esperaba de tu media en tu puesto.
 *
 *         La tabla de liga (`leagueTableOf`) es la fuente única de campeón,
 *         posición y movimiento de división. EL CAMPEÓN NO SE MOVIÓ: la tabla
 *         usa la misma semilla y el mismo primer tiro que usaba `championOf`.
 * 0.12.0 — LA BIBLIOTECA. No entra ninguna regla nueva: entra el catálogo que ya
 *         estaba escrito y que este motor no leía. Son cuatro cosas y las cuatro
 *         son la misma — dejar de inventar datos que el proyecto ya tiene.
 *
 *         · EL CALENDARIO DE SELECCIONES. La 0.11.0 estrenó un
 *           `captain/data/international.ts` con SEIS torneos escritos a mano y
 *           su propia versión. Duró un commit y estuvo mal desde el primer
 *           minuto: el CLAUDE.md raíz dice que el tope de caps sale de
 *           `career/data/international-calendar.ts` y de ningún otro lado, y ese
 *           archivo tiene VEINTE competiciones, ciento treinta y una uniones y
 *           diecinueve trofeos. Se borró el duplicado.
 *
 *           Con él entra lo que un calendario a mano no puede tener: que el
 *           Nations Championship le tape la ventana de noviembre a Irlanda pero
 *           no a Namibia, que el Mundial sume las llaves que te dé tu
 *           reputación, que el que no clasificó directo juegue eliminatorias las
 *           dos temporadas previas, y que Rusia —suspendida— juegue cero sin un
 *           caso especial escrito para Rusia.
 *
 *         · EL TOPE DE CAPS. Era `rng.normal(base, 1.5, 1, 9)`: un nueve fijo
 *           que afirmaba que todas las uniones tienen el mismo año, todos los
 *           años. Ahora sale de `internationalSeason(unión, temporada)`. Y con
 *           él entra la puerta del debut: las giras son partidos SECUNDARIOS y
 *           es ahí donde te llevan de pibe, que es lo que hace que exista el
 *           jugador de un cap.
 *
 *         · LAS ONCE COPAS. `CUPS` y `qualifiesFor` estaban declaradas con sus
 *           reglas reales de clasificación y El Capitán no las miraba: un club
 *           disputaba UN torneo por temporada. Ahora juega su liga más las copas
 *           que se ganó por dónde terminó el año pasado — y por eso entra
 *           `lastStanding` al estado.
 *
 *         · LAS FECHAS DE CADA LIGA. `CLUB_MATCHES = 22` para todo el planeta,
 *           cuando `regularSeasonMatchesOf` declara las reales competición por
 *           competición. De ese número salen los partidos, el desgaste, las
 *           lesiones y la Pertenencia.
 *
 *         Efecto de conjunto que conviene anticipar: con liga real más copas, el
 *         TECHO DE TREINTA PARTIDOS pasa a morder de verdad en los clubes
 *         grandes. Es a propósito — es la decisión que World Rugby les puso
 *         enfrente a los clubes en octubre de 2025, y hasta ahora el juego la
 *         tenía escrita sin que llegara a doler.
 * 0.13.0 — EL TECHO SUBE, Y ES UN CAMBIO DE PREMISA, NO UNA CALIBRACIÓN.
 *
 *         La 0.12.0 dejó cableados el catálogo entero de clubes, las veinte
 *         competiciones de selecciones y las once copas. Medida contra ese
 *         mundo, la población que el motor sorteaba no podía visitarlo:
 *
 *           techo mediano 66 · p90 76      contra
 *           seleccionado A de Argentina 74,9 · la mayor 78,8 · Top 14 desde 66
 *
 *         O sea que Europa, los caps y los torneos no eran raros: eran
 *         inalcanzables para la práctica totalidad de la población, y el motor
 *         los tenía declarados igual. Un canal que existe y nunca transporta es
 *         la trampa del §2 al revés — se verificó el canal y no la población.
 *
 *         Dos cambios, y hacen falta los dos:
 *
 *         · LA CAMPANA SUBE. `POTENTIAL_MEAN_GAP` 14 → 27, `POTENTIAL_MIN_GAP`
 *           4 → 18, `POTENTIAL_MAX_GAP` 40 → 43. El desvío NO se movió: la
 *           dispersión no era el problema. Techo mediano ~79, p90 ~89, y la cola
 *           llega a los 90 largos que la vitrina necesita para significar algo.
 *
 *         · EL RECORTE SE VA. `rng.normal(…, min, max)` hace `Math.max(min, x)`,
 *           que no es una normal acotada sino una normal con una TORRE en el
 *           borde. Medido con la campana vieja: 11,9% de los jugadores nacía con
 *           el margen mínimo contra 2,5% en el valor siguiente. El resultado más
 *           probable del juego era el peor posible, y ese jugador tocaba su
 *           techo a los 24 con once temporadas por delante donde el número solo
 *           baja. Ahora se re-tira hasta caer adentro (`engine/truncatedNormal`).
 *
 *         LO QUE ESTO NO ARREGLA, y conviene decirlo: la meseta. El pico sigue
 *         llegando cerca de los 25 porque `pull` es proporcional a la brecha y
 *         el lazo converge. Subir el techo estira la subida, no la mueve de
 *         lugar. La meseta 26–31 es trabajo aparte y vive en `aging.ts`.
 *
 *         La camada sube con el jugador —`data/cohort.ts` lee estas mismas
 *         constantes, para eso están ahí— así que los CUPOS (unión, academia,
 *         M20) siguen igual de disputados. Lo que se abre son los umbrales
 *         ABSOLUTOS: el seleccionado A, la mayor y el rating de los clubes.
 * 0.14.0 — SE EMPIEZA A LOS DIECISÉIS, Y NADIE NACE SIN DESTINO.
 *
 *         Dos cambios de premisa que viajan juntos porque los dos mueven la
 *         misma cuenta —cuánto podés llegar a ser y cuántos años tenés para
 *         serlo— y separarlos habría dejado un commit intermedio afirmando un
 *         mundo que nunca quisimos.
 *
 *         · `START_AGE` 18 → 16. Dos temporadas más, y son de formación pura:
 *           a los 16 no hay ventana representativa abierta (la unión abre a los
 *           17, el M20 a los 18) y `playingTimeOf` recorta el tiempo de juego
 *           de quien está por debajo del debut de su puesto. O sea que no son
 *           dos temporadas de regalo: son dos temporadas de entrenar, crecer y
 *           mirar. Lo que cambia de verdad es que el que apunta alto llega con
 *           dos años más de margen al pico, que es donde se decide todo.
 *
 *           Y con la constante se movieron sus DERIVADAS, que estaban escritas
 *           a mano y ya no decían lo que su nombre prometía (§1.9): la ventana
 *           de crecimiento de `aging.ts` —que se documentaba como «de los 18 al
 *           pico de un pilar» y valía 9— y el avance de la camada en
 *           `data/cohort.ts`. Las dos se calculan ahora.
 *
 *         · `POTENTIAL_FLOOR = 84`. El material deja de ser lo que te cierra la
 *           puerta: nadie nace con un techo por debajo de 84. El piso viejo era
 *           del MARGEN (18 puntos sobre la base del puesto) y por lo tanto
 *           relativo — daba destinos de 70, que contra las puertas de este
 *           catálogo es un jugador que no puede pelear nada. El nuevo es
 *           absoluto y está dicho en la unidad en la que están escritas esas
 *           puertas.
 *
 *           Se aplica moviendo el borde de la truncada (`potentialGapMin`), no
 *           recortando: recortar habría apilado en 84 exacto a media población,
 *           que es el error que la 0.13.0 vino a sacar del sorteo.
 *
 *           La camada sube con la población —`cohortCurve` pasa a leer
 *           `expectedPotentialGap`, la media DESPUÉS de truncar, y no la de la
 *           campana— así que los cupos siguen igual de disputados y los
 *           umbrales relativos se mueven solos. Si la camada hubiera seguido
 *           leyendo la media vieja, Pumitas y la academia se habrían abierto
 *           solos sin que nada fallara.
 *
 *         EL FRACASO NO SE FUE: cambió de causa. Ya no es «no me tocó» sino «no
 *         llegué» — el lazo de `aging.ts` converge al techo, lo que se acaba es
 *         el tiempo, y eso lo deciden el entorno, el cuerpo y las decisiones.
 * 0.15.0 — LOS PARTIDOS QUE NO SE JUGABAN.
 *
 *         Dos arreglos, y el segundo se descubrió tirando del primero.
 *
 *         · LA CURVA DEL TIEMPO DE JUEGO TENÍA UNA RECTA DONDE VA UNA RODILLA.
 *           `playingTimeOf` repartía 0,08 → 0,95 en línea recta entre −15 y +10
 *           de diferencia con el club, y eso afirmaba que estar AL NIVEL de tu
 *           club te daba el 60% de los partidos. Medido: un centro de 90 en el
 *           Stade Toulousain (95) jugaba 11 de 26 fechas, y con una lesión
 *           encima cerraba la temporada con SIETE partidos siendo su club el
 *           primero del Top 14. Ahora el cero de la curva vale 0,78 —titular con
 *           la rotación adentro— y el tramo de abajo sigue igual de duro.
 *
 *           La consecuencia no era de planilla: menos partidos es menos puntaje,
 *           y el puntaje reparte los premios y empuja el crecimiento del año
 *           siguiente. Medido sobre 160 carreras, el «mejor del mundo» pasa de
 *           68 a 183 y el XV ideal de 103 a 148. No se tocó una sola línea de
 *           premios: estaban bien y no llegaban candidatos.
 *
 *         · LOS CARRILES REPRESENTATIVOS NO JUGABAN NADA. El juego te ponía
 *           «Seleccionado A» en la cabecera y la temporada seguía contando solo
 *           fechas del club: la convocatoria no aparecía en ningún número. Ahora
 *           el M20, la academia, la unión y el A-XV tienen sus partidos
 *           (`representativeMatchesOf`), cuentan para la planilla y para el tope
 *           de treinta, y los dos de mayores te sacan fechas del club como los
 *           caps. NO son caps y no tocan `national.caps`: un cap es de la mayor.
 * 0.16.0 — LA RAREZA, Y EL OFICIO DEL PUESTO.
 *
 *         Una tarjeta puede declarar CADA CUÁNTO pasa una cosa así
 *         (`rarity: normal | especial | raro | oro`), y el selector sortea en dos
 *         niveles: primero la banda, después cuál de las de esa banda.
 *
 *         · POR QUÉ EN DOS NIVELES Y NO CON UN PESO MÁS GRANDE. Con un solo
 *           sorteo ponderado, la frecuencia de una clase es LA SUMA DE LOS PESOS
 *           DE SUS MIEMBROS: escribir el noveno evento de oro lo haría un 12% más
 *           frecuente sin que nadie lo decidiera, y sostener la tasa obligaría a
 *           reescribir los ocho pesos anteriores cada vez. Es el §1.9 —la tasa
 *           quedaría derivada del tamaño del catálogo y congelada a mano— y por
 *           eso la frecuencia vive sola en `RARITY_BAND` y se mide sola en
 *           `__tests__/rarity.test.ts`.
 *
 *         · LAS BANDAS SE DERIVARON DE LA TASA POR CARRERA, no al revés (§1.8).
 *           Entre `RARITY_BAND.oro = 3` y «cuántas carreras ven un oro» hay
 *           `SEASON_EVENT_PROB`, los gates de `requires` y la longitud de la
 *           carrera, que va de 14 a 17 temporadas según el puesto. Medido sobre
 *           160 carreras: el 25% ve un oro, el 51% ve un raro, y la banda alta es
 *           el 19,3% de las decisiones — el grueso sigue siendo la vida del club,
 *           que es la premisa del juego.
 *
 *         · LA FAMILIA `of-`: EL OFICIO DEL PUESTO. Dieciséis tarjetas nuevas, un
 *           raro y un oro por cada una de las ocho familias, escritas sobre los
 *           atributos y la gloria que ese puesto cobra de verdad — el pilar pelea
 *           penales de scrum, el hooker el porcentaje de su line-out, el wing los
 *           metros. Es la misma respuesta que `data/positions.ts` le dio al
 *           problema del pilar: sin esto, la tarjeta grande de la carrera sería la
 *           misma para los quince y medio equipo jugaría un juego más chico.
 *
 *         · CONTRA QUÉ CANAL SE ESCRIBIERON (§2). `fame` NO es un canal: nadie lo
 *           lee: `generateOffers` mira `ovr`, `stage`, el carril y el techo
 *           doméstico, y `reachableTrack` mira `ovr` contra el umbral. Lo grande
 *           de estas tarjetas se paga en `playingTime`, `statBoost` y `belonging`,
 *           que sí transportan, y los deltas de atributo se quedan en +3 porque
 *           `applyAttrs` recorta contra el techo y un +9 se convertiría en +2 sin
 *           avisar. Sigue sin existir un canal para empujar la convocatoria sin
 *           pasar por la media: es la deuda que `simulate-season.ts` ya declaraba,
 *           y ninguna tarjeta de acá promete una citación que el motor no podría
 *           cumplir.
 *
 *         EL ESTADO NO CAMBIÓ: `rarity` es un campo del CATÁLOGO y lo persistido
 *         sigue siendo el `pendingEventId`. Por eso no sube `schema` — sube el
 *         motor, porque el sorteo en dos niveles consume otra tirada y las cuatro
 *         carreras congeladas se mueven enteras.
 *
 * 0.17.0 LOS SESENTA Y CINCO. Entra el catálogo de minijuegos por dorsal
 *        (`data/minigames/`): cuatro por número del 1 al 15 más cinco que le
 *        tocan a cualquiera. Tres cosas cambian de verdad y las tres mueven el
 *        digest:
 *
 *          · EL POOL. `pickMomentKind` sortea entre sesenta y cinco kinds donde
 *            sorteaba entre seis.
 *          · EL EJE. El sorteo pasa de la FAMILIA al DORSAL. Antes, un pilar
 *            izquierdo y uno derecho jugaban lo mismo porque las ocho familias
 *            los meten en la misma bolsa; ahora el 1 tiene sus cuatro y el 3 las
 *            suyas. Y `proficiency` pasa de dos escalones a tres —la tuya, la de
 *            tu compañero de línea, la de otro puesto— que es lo que hace que un
 *            minijuego sea especialidad y no exclusividad.
 *          · EL PAGO. Los cincuenta y nueve nuevos cobran por una tabla única
 *            (`data/minigames/pay.ts`) en vez de por su cuenta.
 *
 *        EL ESTADO SÍ CAMBIÓ, y por eso sube también `schema`: `PendingMoment.setup`
 *        pasó a poder llevar un `MinigameSetup` —con la mecánica y sus márgenes
 *        adentro— que una partida vieja no sabe leer, y `MomentRecord.kind` pasó
 *        a poder ser un id del catálogo. Una partida en curso guardada con el
 *        esquema anterior se resuelve como `'outdated'`.
 *
 * 0.18.0 LOS TORNEOS REPRESENTATIVOS. Entra la academia provincial M16 y los
 *        tres torneos que se juegan destapando celdas: el Campeonato Argentino
 *        Juvenil M17, el Mundial M20 y el Mundial. Cuatro cosas mueven el
 *        digest, y las cuatro son de diseño:
 *
 *          · EL CARTEL. Un torneo paga fama por dónde terminó el equipo y por
 *            cómo jugaste vos. Está calibrado CONTRA EL DIGEST y no estimado: la
 *            primera versión llevaba una carrera de pilar de 17,7 a 77,7 y
 *            clavaba tres de los cuatro casos en el techo de 100.
 *          · LOS CAPS. El Mundial suma uno por partido jugado. Los juveniles no
 *            suman ninguno, que es como se cuentan los caps de verdad.
 *          · LA VITRINA, EN LAS DOS DIRECCIONES. Sube donde el torneo se ganó
 *            jugando, y BAJA donde el sorteo de `international-results.ts` venía
 *            regalando un Mundial que ahora se pierde en pantalla. Ese −1 es la
 *            regla 3 de `types/tournament.ts` haciéndose ver.
 *          · LA ACADEMIA. Un Momento más en la primera temporada de todo
 *            argentino.
 *
 *        LO QUE NO SE MOVIÓ, y es la mitad importante del diff: `seasons`,
 *        `retirementAge`, `lastClub`, `belonging` y `moments` quedaron IDÉNTICOS
 *        en los cuatro casos. La semilla del torneo es derivada, así que agregar
 *        torneos no corrió el stream de la carrera de nadie — que era
 *        exactamente lo que la semilla derivada existe para garantizar.
 *
 *        EL ESTADO SÍ CAMBIÓ, y por eso sube también `schema`: `CaptainState`
 *        suma `pendingTournament` y `tournaments`. Una partida en curso guardada
 *        con el esquema anterior se resuelve como `'outdated'`.
 *
 * 0.19.0 LA PLATA SIRVE PARA ALGO. Entra la tienda —veinte cosas para comprar
 *        con el sueldo del contrato— y con ella CINCO cambios de motor, de los
 *        cuales solo el primero es la feature. Los otros cuatro son deudas que
 *        la tienda hizo visibles y que no se podían dejar:
 *
 *          · LA TIENDA. `data/shop.ts` (catálogo) y `engine/shop.ts` (reglas).
 *            El techo de la media pasa a tener una tercera mitad —lo que
 *            compraste— y `potentialOf` la suma. Comprar NO consume azar: dos
 *            partidas con la misma semilla que compran distinto siguen
 *            recibiendo los mismos Momentos, y la diferencia entre ellas es
 *            exactamente lo que la tienda hizo.
 *
 *          · EL SUELDO QUE SE PROMETÍA NO ERA EL QUE SE PAGABA. La tarjeta de
 *            mercado decía `salaryFor(club)` —US$ 817.500 al año en un club de
 *            élite— y la temporada acreditaba `rating × 900`, o sea 81.000. Dos
 *            respuestas a «cuánto ganás», y la que el jugador leía antes de
 *            firmar era la que no corría. Ahora sale de una sola función. Es el
 *            cambio que más mueve el digest de los cuatro casos: el saldo entra
 *            en el `stateHash`.
 *
 *          · LA CUENTA DE LA CABEZA DEJÓ DE SER DECORATIVA. `damage.cabeza`
 *            subía desde la 0.1.0 y NO LA LEÍA NADIE: un HIA costaba lo mismo
 *            que no tenerlo. Ahora cuesta Visión, poco y por golpe
 *            (`HEAD_VISION_LOSS_PER_HIA`), que es donde la evidencia lo pone.
 *            Pega fuerte en un apertura —Visión pesa 30 en su media— y casi nada
 *            en un pilar, que es el reparto correcto.
 *
 *          · LAS OFERTAS PASARON DE DOS A CUATRO. `MAX_OFFERS`, con la escalera
 *            de `EXTRA_OFFER_CHANCE` decidiendo cuántas aparecen. NO hace que el
 *            mercado se abra más seguido —eso sigue dependiendo de que haya al
 *            menos un candidato— pero consume otras tiradas, así que corre el
 *            stream de toda carrera que reciba una oferta.
 *
 *          · FIRMAR DEJÓ DE VACIARTE LA CUENTA. `signProfessional` ponía la
 *            plata en cero. Era inofensivo mientras la plata no servía para
 *            nada; con la tienda adentro le borra los ahorros al que volvió a su
 *            club y firma de nuevo, sin que ninguna regla del rugby lo pida.
 *
 *        EL ESTADO SÍ CAMBIÓ, y por eso sube también `schema`: `CaptainPlayer`
 *        suma `shop` e `injuryLoss`, y cada fila del historial suma `income`.
 *        Una partida en curso guardada con el esquema anterior se resuelve como
 *        `'outdated'`.
 *
 * 0.20.0 LA CARRERA LLEGA A LOS 40, Y NO A TODOS LES LLEGA IGUAL.
 *
 *        Dos cambios que son uno solo, porque el primero sin el segundo deja a
 *        todos los jugadores de un mismo puesto retirándose el mismo año.
 *
 *          · LA CURVA DE CADA PUESTO SE CORRIÓ CUATRO AÑOS del declive para
 *            atrás (`CAPTAIN_POSITIONS_VERSION`). El pico y el debut no se
 *            tocaron: lo que se estiró es el final. El puesto más longevo —la
 *            primera línea— queda justo en el tope del juego, y el más corto
 *            —wing y fullback— cuatro años abajo, así que la diferencia de
 *            longevidad entre puestos se conserva entera.
 *
 *          · ENTRÓ LA LONGEVIDAD, el segundo eje de la forma de la carrera
 *            (`player.longevity`, ±3 años). El perfil de desarrollo ya decía
 *            CUÁNDO llegabas; esto dice CUÁNTO TE DURA, y son independientes a
 *            propósito: cruzados dan el precoz que se queda una década en la
 *            meseta, el que se quema a los 31, y el tardío que toca los 40.
 *
 *          · `resolveAgeCurve` PASA A SER LA ÚNICA FUENTE de la curva. Antes
 *            `peakShift` corría el pico dentro de `aging.ts` y `retireIfDue`
 *            leía la tabla cruda: al tardío se le estiraban dos años de buen
 *            juego y se le cortaba la carrera en la misma fecha que a todos. El
 *            envejecimiento, el retiro y el regreso al club de origen leen ahora
 *            del mismo lugar, y `AgingContext` perdió `peakShift` para que no
 *            se pueda volver a pasar una curva distinta de la del jugador.
 *
 *          · `CAREER_HARD_CAP` (40) es el tope del juego, APARTE de la tabla.
 *            Existe para que sumar años acá adentro no pueda producir un jugador
 *            de 45 en cuanto alguien mueva una constante.
 *
 *        EL ESTADO SÍ CAMBIÓ, y por eso sube también `schema`: `CaptainPlayer`
 *        suma `longevity`, que es material sorteado al nacer y no tiene default
 *        honesto. Una partida en curso se resuelve como `'outdated'`.
 *
 * 0.21.0 EL MERCADO SE ABRE TODOS LOS AÑOS, Y DICE DÓNDE VAS A JUGAR.
 *
 *        Cuatro cambios, y el tercero es el que hace posibles a los otros tres.
 *
 *          · LA VENTANA ABRE A LOS 20 (`MARKET_OPEN_AGE`) y pone CINCO clubes
 *            sobre la mesa (`OPEN_MARKET_OFFERS`), más quedarte en el tuyo. No
 *            se sortea la cantidad: la escalera de `EXTRA_OFFER_CHANCE` se queda
 *            para la ventana cerrada —los años de formación, donde una oferta es
 *            una noticia— y de los veinte en adelante la mesa es fija. Comparar
 *            cinco sueldos un año y uno al siguiente no es comparar.
 *
 *          · EL EJE DEL CANDIDATO PASA DE «TU CLUB» A «TU MEDIA». Con la ventana
 *            abierta el filtro deja de pedir que el club sea un paso adelante y
 *            pasa a pedir que esté A TU ALTURA (banda simétrica de `±alcance`
 *            alrededor de tu media). Es lo que destraba al suplente de un club
 *            grande, que por definición no tenía ningún «paso adelante»
 *            disponible y era justo el que más necesitaba que lo llamaran. La
 *            banda es una PUERTA y no un peso, por la razón de siempre: sin
 *            borde de abajo, los cientos de clubes chicos del catálogo le ganan
 *            por volumen a cualquier ponderación (CLAUDE.md raíz §5).
 *
 *          · EL MERCADO DEJÓ DE COMPETIR CONTRA LA TARJETA DEL AÑO. Vivía dentro
 *            de `selectEvent` con prioridad, o sea que aparecía EN LUGAR de la
 *            decisión de la temporada. Con la ventana abierta todos los años eso
 *            dejaba el catálogo entero de eventos sin usarse de los veinte al
 *            retiro. Ahora es un paso propio (`openMarketOrClose`) que corre
 *            DESPUÉS: primero lo que te pasó en el año, después dónde jugás el
 *            que viene. Una temporada puede traer dos tarjetas, y por eso
 *            `decisionText` suma en vez de pisar.
 *
 *          · CADA OFERTA DICE EN QUÉ LUGAR DEL PLANTEL CAERÍAS (`squadRole`).
 *            Sale de `playingTimeOf` —la misma cuenta que va a repartir los
 *            minutos— y no de un número escrito en la tarjeta. Es la otra mitad
 *            de la decisión: sin ella, el mercado empuja siempre al club que
 *            mejor paga, que es exactamente el club donde no vas a jugar.
 *
 *        EL ESTADO NO CAMBIÓ DE FORMA: el rol es DERIVADO y se calcula al
 *        dibujar la tarjeta, y el orden por sueldo vive en `offers[]`, que ya
 *        existía. No sube `schema`; una partida en curso se resuelve igual como
 *        `'outdated'` porque el guardado sella la versión del motor.
 *
 * 0.22.0 LA MAYOR DEJA DE SER UN UMBRAL Y PASA A SER UNA CAMISETA.
 *
 *        Hasta acá los seis escalones se decidían igual: una media contra una
 *        barra, todos los años desde cero. Eso hacía que la selección fuera un
 *        termómetro y no una historia — el que cruzaba por un punto entraba
 *        igual que el que cruzaba por diez, y el que bajaba dos puntos a los 30
 *        se caía como si nunca hubiera estado.
 *
 *        LA ESCALERA JUVENIL NO SE TOCA. Unión, academia y M20 siguen siendo
 *        cupos contra la camada (`data/cohort.ts`) y el A-XV sigue siendo
 *        umbral. Lo que cambia es el último escalón, y por eso el modelo nuevo
 *        vive al lado del viejo en vez de reemplazarlo: son dos preguntas
 *        distintas. «¿Estás entre los treinta mejores de tu camada?» tiene
 *        respuesta anual; «¿sos de la casa?» no.
 *
 *          · ELEGIBILIDAD (Reg. 8 de World Rugby, `engine/eligibility.ts`). La
 *            unión a la que aspirás ya no es `player.countryCode`: sale de tus
 *            claims. Nacés con el del 8.1(a), sumás meses de registro en la
 *            unión de tu club y a los 60 exclusivos y consecutivos ganás otro
 *            (8.1(c)); a los 10 años de presencia, otro más (8.1(d)). El día que
 *            debutás, la unión te captura (8.2).
 *
 *          · VALOR DE SELECCIÓN contra una VARA. La media cruda más forma, nivel
 *            del club, escasez del puesto y proyección; contra el umbral de tu
 *            unión más el recargo del amateur, menos el descuento de estar
 *            adentro, menos el alivio del año previo al Mundial, más la presión
 *            del que viene atrás.
 *
 *          · CINCO ESTADOS (`NationalStatus`). `trial` es el que faltaba: el que
 *            cruza por menos de tres puntos va de gira y nada más, y tiene dos
 *            temporadas para cruzar con margen. Es lo que produce al jugador de
 *            un solo cap, que es de las figuras más comunes del deporte y en
 *            este motor no existía.
 *
 *          · EL ARCHIRRIVAL SE QUEDA CON LO SUYO. En los cupos juveniles sigue
 *            ocupando un lugar de la fila; en la mayor se reparte el fixture con
 *            vos, y ahora `Rival.caps` cuenta de verdad en vez de quedarse en
 *            cero para siempre.
 *
 *        SUBE `schema`: `NationalRecord` cambia de forma y cada fila de la
 *        trayectoria suma el estado de la camiseta de esa temporada.
 *
 * 0.23.0 LA HINCHADA VUELVE A MIRAR.
 *
 *        La Pertenencia estaba muerta para la mayoría de las carreras y no se
 *        veía, porque el camino que la sostiene —quedarse toda la vida en el
 *        club— la mostraba sana. La sonda de distribución separó los dos:
 *
 *          brazo fiel (0% profesional): T5 80% Titular · T6 94% · T10 89%
 *            Referente · final 70% Vitalicio. Impecable.
 *          brazo que rota (81% profesional): T3 4,6 · T6 0,7 · T10 0,0 y el
 *            94% retirado en «Uno del plantel».
 *
 *          · EL CONGELAMIENTO ERA GLOBAL. Se prende al firmar profesional y solo
 *            lo apaga volver a casa, así que durante toda la etapa profesional
 *            NINGÚN club sumaba: ni el nuevo, ni con títulos, ni con Momentos.
 *            Una carrera entera de figura en Japón mostraba cero. Ahora congela
 *            la cuenta de los clubes donde NO estás —que es lo que el reglamento
 *            URBA justifica— y la del club donde jugás corre normalmente. Un
 *            tramo profesional pasó de 0,00 a 2,97 puntos por temporada.
 *
 *          · CÓMO JUGASTE ENTRA EN LA CUENTA. El término de la temporada se
 *            modula con el puntaje del año (`belongingFormFactor`, [0,5 – 2]
 *            centrado en la temporada correcta). Antes la única señal de
 *            rendimiento era cuántos partidos jugaste, y valía medio punto. El
 *            bloque se mudó del §7 al §11 para poder leerlo: no consume azar y
 *            nadie lee `belonging` en el medio, así que no mueve una tirada.
 *
 *          · EL DESCUENTO DEL EXTERIOR PASA DE 0,5 A 0,75. Es la misma regla que
 *            el congelamiento —«tu cancha se hace en tu club»— contada dos veces
 *            sobre dos ledgers distintos, y la segunda vez sobre el equivocado.
 *            Sigue siendo un descuento: emigrar es el camino que menos
 *            construye, y el número lo dice. Tramo profesional: 2,97 → 4,45 por
 *            temporada, contra 4,74 del amateur en su club.
 *
 *          · LOS TÍTULOS DE SELECCIÓN DEJAN DE CONSTRUIR EL VÍNCULO CON EL CLUB.
 *            Entraba `titulos.length`, que los incluye. Estaba marcado como
 *            discutible en `calibration.test.ts` desde la 0.11.0; se decide acá.
 *            La selección paga en Cartel y en caps, que tienen su propia línea.
 *
 *        NO SUBE `schema`: el estado no cambia de forma. `BelongingContext` suma
 *        `playingHere`, que es DERIVADO de `player.clubId` y no se guarda.
 *        Sí cambia lo que la misma semilla produce, así que las partidas en
 *        curso se resuelven como `'outdated'` por la versión del motor.
 *
 * 0.24.0 EL PRIMER CONTRATO ES DE TU CASA.
 *
 *        Un argentino debutaba como profesional en la Championship inglesa o en
 *        el Pro D2, y Super Rugby Américas no aparecía NUNCA. Medido sobre las
 *        primeras ofertas profesionales de un jugador argentino: 23% Championship,
 *        22% Pro D2, 22% NPC, 16% Japón D2 — y 0% SRA. Son dos fallas apiladas:
 *
 *          · `pro-regional` NO CONTABA COMO PROFESIONAL. La SRA, la MLR, la
 *            Nationale, la Currie Cup Premier y la liga rusa entraban a la mesa
 *            como pases amateurs de sueldo CERO: firmar con los Dogos no te
 *            volvía profesional, no te pagaba y no congelaba la Pertenencia. Y el
 *            `salaryFor` de este motor ya declaraba su tramo —16 a 34 mil— con un
 *            comentario que explicaba que Super Rugby Américas es el escalón más
 *            bajo del profesionalismo mundial. Un tramo que ningún llamador podía
 *            alcanzar: dos respuestas a la misma pregunta y ganaba la no escrita.
 *
 *          · TU PAÍS NO TENÍA CLUBES PROFESIONALES, y era un artefacto del
 *            catálogo. Dogos, Pampas y Tarucas están cargados como
 *            `countryCode: 'multi'` porque la SRA no es de un país, así que
 *            preguntando por el código del catálogo Argentina tiene 264 clubes y
 *            ninguno profesional. La pregunta ahora se le hace a la AFINIDAD
 *            (`affinityCountryOf`, declarada club por club en career), que sabe
 *            que los Dogos son argentinos, Peñarol uruguayo, Selknam chileno,
 *            Cobras brasileño, Yacaré paraguayo, Benetton italiano y los Ospreys
 *            galeses.
 *
 *        La regla nueva: mientras nunca hayas firmado, las ofertas profesionales
 *        salen de TU sistema y de ningún otro; el resto del mundo se abre con el
 *        primer contrato y no se vuelve a cerrar —ni siquiera si volvés a tu club
 *        y rescindís—. Al que nació donde no hay profesionalismo (España,
 *        Portugal, Georgia, Canadá) la puerta se le abre sola, que es lo único
 *        honesto. Y las vías declaradas ponen el piso: 58 la SRA, 57 la MLR, 64 la
 *        URC, 74 el Super Rugby, leídos del `minOvr` del dato y no de un número
 *        nuestro.
 *
 *        Medido después: AR/UY/CL/BR/PY 100% Super Rugby Américas —cada uno con
 *        SU franquicia—, US 100% MLR, FR Nationale/Pro D2/Top 14, ZA Currie Cup
 *        + URC, NZ NPC + Super Rugby, IT la URC.
 *
 *        Y UN TERCER CAMBIO QUE LA PUERTA DESTAPÓ: EL REPECHAJE DE LA MESA. Con
 *        el mercado profesional del exterior cerrado, al argentino de 87 se le
 *        vaciaba la banda de «clubes a tu altura» y el repechaje abría el pozo
 *        entero: 270 clubes de su sistema, con el peso `12 − |rating − ovr|`
 *        saturado en 1 para todo lo que está a más de once puntos, o sea las tres
 *        franquicias de la SRA sorteadas 3 veces cada 270. El 72% de las carreras
 *        no firmaba un contrato en toda la vida. El repechaje ahora ordena por
 *        cercanía y corta en `REPECHAJE_POOL`: el piso se afloja hasta juntar una
 *        mesa y ni un club más. Es el mismo bicho del volumen que el CLAUDE.md
 *        raíz §5 documenta dos veces, y lleva la misma medicina — un cupo, no un
 *        peso más grande. Con eso, 98% de las carreras firman.
 *
 *        NO SUBE `schema`: el estado no cambia de forma. `everProfessional` se
 *        DERIVA del historial y no se guarda. Sí cambia lo que la misma semilla
 *        produce, y además el guardado sella `TRANSFER_RULES_VERSION`, porque
 *        desde acá el mercado depende de un catálogo más.
 *
 * 0.25.0 EL SUELDO ES DEL JUGADOR Y NO DEL CLUB.
 *
 *        La mesa de mercado ofrecía US$ 804.000 a un jugador de media 74 y
 *        US$ 804.000 a uno de 92, porque `salaryFor` solo recibía el club: el
 *        sueldo salía del nivel de la liga y del rating del club, y la media del
 *        que iba a firmar no entraba en la cuenta. En pantalla se leía como lo
 *        que era —«tu lugar ahí: Rotación» arriba de un sueldo de figura—, y las
 *        dos cosas eran ciertas al mismo tiempo porque no salían del mismo lado.
 *
 *        Medido antes, sobre la mesa abierta (techo de lo que te ofrecen):
 *        media 74 → 763.000, media 80 → 845.000, media 86 → 886.500,
 *        media 92 → 900.000. Media carrera de diferencia movía el techo un 18%.
 *
 *        Tres cambios que son uno solo:
 *
 *          · `salaryFor(club, ovr)`. Los dos ejes se pesan en la misma escala
 *            —la de `ovr − clubRating`, que ya trataba a las dos varas como una—
 *            con 0,70 para tu media y 0,30 para el rating del club.
 *
 *          · LA BANDA DE CADA NIVEL CAMBIÓ DE SENTIDO: dejó de decir «lo que
 *            paga este nivel» y pasa a decir «de lo que cobra el último del
 *            plantel a lo que cobra la figura». Con el piso de la élite en
 *            420 mil, el eje del jugador no tenía dónde moverse: cualquiera que
 *            recibiera una oferta de un club de élite cobraba 420 mil como
 *            mínimo. Ahora arranca en 60 mil, que es lo que cobra el último de
 *            un plantel de Top 14 de verdad.
 *
 *          · LA CUENTA ES CONVEXA (`SALARY_CURVE`). La plata del deporte no es
 *            lineal en la calidad: entre el 15º y el 1º de un mismo plantel hay
 *            un factor diez, más de lo que hay entre dos clubes de la misma liga.
 *
 *        Medido después: media 74 → 327.500, media 80 → 527.000,
 *        media 86 → 745.000, media 92 → 900.000. Y el promedio de la mesa entera
 *        pasa de 307.905 a 133.643 en una media de 74, que es el jugador al que
 *        el mundo viejo le pagaba como a una figura.
 *
 *        LO QUE NO SE MOVIÓ, y es la mitad del diseño: el canje del mercado.
 *        Dentro de una misma mesa el que mejor paga sigue siendo el club más
 *        grande —el que te sienta—, porque el eje del club se mide contra la
 *        escala global y no contra tu media. Si midiera la distancia entre vos y
 *        el club, el club donde serías titular pagaría más y la decisión de
 *        mercado se quedaría sin filo.
 *
 *        NO SUBE `schema`: el estado no cambia de forma. Sí cambia lo que la
 *        misma semilla produce —el saldo entra en el `stateHash`—, así que las
 *        partidas en curso se resuelven como `'outdated'`.
 *
 * 0.26.0 EL M20 SE JUEGA COMO EL M20. El Mundial juvenil pasa de doce equipos
 *        con «pasás o jugás por el quinto» al formato de verdad: DIECISÉIS
 *        equipos, cuatro grupos de cuatro, y cuatro cuadros de cuatro repartidos
 *        por victorias del grupo —3 al del título, 2 al del quinto, 1 al del
 *        noveno, 0 al del decimotercero—. Todos juegan cinco partidos y todos
 *        terminan con un puesto exacto del 1 al 16.
 *
 *        EL BUG QUE LO DESTAPÓ, porque explica el resto: una carrera que perdió
 *        los tres partidos del grupo veía en la llave las mismas palabras que el
 *        que los ganó —SEMI y FINAL— y las ganaba. La pantalla decía «se terminó
 *        el torneo» sin decir nunca que había sido por el decimotercer puesto.
 *
 *        LAS CUATRO COSAS QUE CAMBIAN UN RESULTADO:
 *
 *          · EL CAMPO. `fieldSize` 12 → 16, así que los rivales del M20 son
 *            otros: entran las uniones 13, 14, 15 y 16 del ranking, que es de
 *            donde salen los clasificados por los continentales M18.
 *          · EL CUADRO DE ARRIBA DEJA DE ELIMINAR. Perder la semifinal del
 *            título cerraba el torneo; ahora se juega el partido por el tercer
 *            puesto, que es un partido más por carrera para el que llega ahí.
 *          · EL HUECO SE VUELVE DEL TÍTULO. El tablero de las nueve casillas
 *            pedía haber clasificado por puntos; ahora pide estar en el cuadro
 *            de arriba y haber ganado la semifinal. Es más difícil de alcanzar
 *            a propósito: era la final del mundo y se jugaba también por el
 *            quinto puesto.
 *          · EL CAMPEÓN. `closeTournament` pregunta si el partido repartía la
 *            copa en vez de si la ronda se llamaba `final` — en el M20 todos
 *            terminan en una ronda que se llama así.
 *
 *        NO SUBE `schema`: `CaptainState` no suma un campo. El cuadro, el puesto
 *        y por qué se juega cada ronda se DERIVAN de los partidos ya guardados
 *        (§1.9), así que no hay nada nuevo que persistir ni que pueda quedar
 *        desincronizado. Sí sube `TOURNAMENTS_VERSION` a 0.5.0 —el formato es
 *        catálogo— y las partidas en curso se resuelven como `'outdated'` por
 *        cualquiera de las dos.
 *
 * 0.27.0 EL M20 TIENE DOS DIVISIONES. Entra el Mundial M20 B —las uniones 17 a
 *        32 del ranking, mismo formato de cuatro cuadros— y con él lo que lo
 *        vuelve una escalera: los dos primeros de la B suben y los dos últimos
 *        de la A bajan. Una carrera puede terminar el M20 de los dieciocho en el
 *        16.º puesto, jugar la B a los diecinueve y volver a la primera a los
 *        veinte ganándola.
 *
 *        LO QUE NO SE GUARDA, y es la decisión de diseño de esta versión: la
 *        división de tu unión. Se DERIVA del ranking mundial —de dónde arranca—
 *        y de las ediciones que ya jugaste, que están enteras en
 *        `state.tournaments`. Un campo `division` persistido sería una segunda
 *        fuente de verdad y bastaría un solo camino que se olvide de escribirlo
 *        para que la vitrina reciba una copa de la primera ganada en la segunda.
 *        Por eso NO sube `schema`: `CaptainState` no cambia de forma.
 *
 *        LO QUE MUEVE UN RESULTADO:
 *
 *          · LA COMPUERTA. Es la primera vez que un torneo se cierra por algo
 *            que no es la edad, la media ni el escalón: dos torneos comparten
 *            los tres y los separa la división. Sin eso, la B abría nunca —el
 *            catálogo devuelve el primero que abre y la A está antes— que es el
 *            mismo bug del `'AR'` en mayúscula, contenido muerto con cartel de
 *            vivo.
 *          · EL CAMPO. `rivalsFor` toma la FRANJA del ranking que el torneo
 *            declara y completa hacia abajo. Para la primera división no cambia
 *            nada; lo que agrega es que la segunda no juegue contra Nueva
 *            Zelanda, y que el que ASCIENDE ocupe un lugar de arriba sin que el
 *            campo quede en quince.
 *          · LAS CARRERAS DE UNIONES CHICAS. Un uruguayo, un tongano o un
 *            estadounidense pasan a tener un Mundial juvenil que pueden ganar. Y
 *            uno argentino puede perder el suyo por una edición.
 *
 *        `TOURNAMENTS_VERSION` sube a 0.6.0: el catálogo suma un torneo.
 *
 * 0.28.0 TRES NÚMEROS QUE DESCRIBÍAN UN JUEGO QUE NO EXISTE. Salen de un reporte
 *        con una sola tarjeta de retiro —nueve veces mejor jugador del mundo, dos
 *        caps, ningún Mundial y «Titular» después de doce temporadas en el mismo
 *        club— y las tres causas resultaron ser la misma especie: una constante o
 *        una condición calibrada contra un mundo que el motor no produce.
 *
 *          · EL PREMIO NO PODÍA CUMPLIR SU PROPIA REGLA. «Mejor jugador del
 *            mundo» pedía `minRating: 7.8`, y el puntaje de la temporada se
 *            normaliza contra la producción esperada PARA TU MEDIA: el cociente
 *            da ~1 para todos y el número se clava en el pivote. Medido sobre
 *            6.235 temporadas, la correlación media↔puntaje es r = −0,138 y sólo
 *            el 1,0% de las temporadas de media ≥ 90 llega a 7,8. La condición
 *            era inalcanzable justo para el jugador que el premio busca, y por
 *            eso el atajo de `certainAtOvr` salteaba `califica` ENTERO — 89 de 89
 *            premios repartidos a jugadores que no estaban en su selección. El
 *            atajo ahora apaga el dado y no las reglas; el puntaje se va de este
 *            premio y la media queda como su único eje.
 *          · LA PRESIÓN GARANTIZABA LA EXPULSIÓN. `(temporadas − gracia) × peso`
 *            crece sin techo y el descuento que la compensa vale 3 y decae con la
 *            edad: para cualquier unión de rep ≥ 2 hay un año a partir del cual
 *            la vara sube sola para siempre. No modelaba competencia, modelaba un
 *            despido con fecha. Permanencia media medida: 2,4 temporadas contra
 *            un ciclo de Mundial de 4 años, y de ahí el 4,1% de carreras que
 *            jugaban uno. Entra `PRESSURE_MAX`, la gracia pasa de 2 a 3.
 *          · EL ALIVIO DEL MUNDIAL LLEGABA UN AÑO TARDE. Se pedía sólo
 *            `isPreWorldCupSeason`, o sea el año ANTERIOR, cuando la lista de 33
 *            que el alivio existe para modelar se firma EN el año del Mundial —el
 *            mismo índice con el que `gateOpen` abre el torneo—. Bajaba la vara
 *            el año en que no se podía jugar y la dejaba entera el año en que sí.
 *
 *        Y los escalones de Pertenencia (`types/currencies.ts`): 25/50/75/95
 *        pedían 6 y 22 temporadas seguidas en un club sobre un ritmo real de 4,4
 *        por temporada. El 98,1% de las carreras se retiraba en «Uno del
 *        plantel» y el 0% llegaba a «Referente». Se reanclaron a 13/30/48/70 —en
 *        temporadas, que es la unidad en la que el jugador lo vive— y con ellos
 *        los tres topes que son su espejo, o un jugador sin un solo título
 *        terminaba Vitalicio. El RITMO no se tocó.
 *
 *        NO SUBE `schema`: `CaptainState` no cambia de forma. Ninguno de los
 *        cinco cambios agrega un campo — son umbrales y condiciones.
 *
 * 0.29.0 EL RETIRO DEJA DE SER UN RELOJ QUE NADIE PODÍA MIRAR NI MOVER. Sale del
 *        mismo lugar que la 0.28.0 —una tarjeta de retiro— y del mismo reclamo:
 *        una carrera cortada a los 34 con media 93, nueve veces mejor jugador del
 *        mundo y doce temporadas en el mismo club. Barrido de 320 carreras
 *        completas, y las dos causas resultaron ser independientes:
 *
 *          · EL DESGASTE ERA UN TRINQUETE, NO UN RELOJ. Con el descanso fijo en
 *            3,5 contra un desgaste de ~10 por temporada de titular, el cuerpo
 *            subía +6,7 todos los años y no bajaba nunca. Mediana al retiro: 91
 *            de 100, y el 54% de los jugadores cruzaba el primer umbral de
 *            adelanto a los 23 años. O sea que «el cuerpo roto adelanta el tope
 *            blando hasta tres años» describía a TODO EL MUNDO, y la tabla de
 *            edades de `positions.ts` mentía dos o tres años sin que nada
 *            fallara: decía tope blando 36 para un apertura que lo tenía en 33.
 *            El descanso pasa a tener tres partes —base, aguante y lo comprado—
 *            y el adelanto arranca desde un piso (`BODY_ANTICIPATION_FLOOR`), así
 *            que vuelve a medir lo que su nombre dice: cuánto MÁS roto estás que
 *            lo normal. Desgaste mediano al retiro: 91 → 44.
 *          · LA TIRADA NO MIRABA CÓMO ESTABAS JUGANDO. Solo edad y cuerpo. La
 *            media poblacional a los 34 era 85,6 y a los 38 era 85,2 —no baja,
 *            porque la tirada se llevaba puestos a los que estaban bien— y el
 *            docstring de la propia decisión citaba el 76% de internacionales que
 *            sigue a los diez años contra el 38% del resto: un mundo que no
 *            estaba implementado en ninguna línea. Entra el SOSTÉN
 *            (`engine/retirement.ts`): nivel contra tu propio pico, titularidad y
 *            caps. Sin sostén el internacional se retiraba ANTES que el resto
 *            —37,0 contra 37,3—, o sea al revés del dato que lo justifica; con
 *            sostén, 38,0 contra 37,5.
 *
 *        JUNTAS, sobre una carrera que nunca cuelga los botines por su cuenta:
 *        edad mediana de retiro 36 → 38, y el 1,3% que llegaba a los 40 pasa a
 *        ser el 16,5%. El caso del reporte —cortado en su pico antes de los 35—
 *        queda en el 0,8% de las carreras.
 *
 *        Y la tercera, que no es del motor pero es la que hacía invisible a las
 *        otras dos: la góndola «El cuerpo» de la tienda —seis ítems, hasta 410k—
 *        no tocaba `damage.cuerpo` ni una vez. Entra `recovery` como canal, y con
 *        él `CAPTAIN_SHOP_VERSION`. La cabecera pasa a mostrar el desgaste.
 *
 *        LO QUE NO SE TOCÓ, a propósito: la tabla de edades de `positions.ts`.
 *        Está calibrada contra edades reales del rugby puesto por puesto y no era
 *        lo que estaba mal — lo que estaba mal es que nadie llegaba a vivirla.
 *
 *        NO SUBE `schema`: la mejor media y el tiempo de juego que lee el sostén
 *        se DERIVAN de `history[]`, que ya los contiene.
 *
 * 0.30.0 EL CONTRATO DURA LO QUE DICE QUE DURA. Hasta acá todos duraban un año y
 *        nadie lo había decidido: era el default que quedó de cuando el mercado
 *        se abría de vez en cuando, y con la ventana abierta todos los junios
 *        (0.21.0) se convirtió en un jugador que renegocia su vida entera cada
 *        temporada. En el rugby de verdad se firma por dos o tres años, y de ahí
 *        salen las dos cosas que al juego le faltaban: el compromiso —firmar
 *        cierra el mercado hasta que venza— y la renovación, que es la única
 *        conversación económica que un profesional tiene con su club.
 *
 *        Tres piezas, y la del medio es la que hace que las otras signifiquen algo:
 *
 *          · EL PLAZO ENTRA EN LA OFERTA (`contractYearsFor`). Uno a tres años,
 *            por edad y por cuánto te ve el club por encima suyo: al pibe lo atan
 *            largo, al veterano lo renuevan año a año. Es tabla y no dado a
 *            propósito — la renovación se dibuja en cada render y una tarjeta no
 *            puede consumir azar, así que el plazo tiene que ser el mismo mirado
 *            dos veces.
 *          · EL SUELDO SE CONGELA AL FIRMAR (`CaptainState.contract`). Es el
 *            único campo del estado que este cambio agrega y hay que decir por qué
 *            no viola la §1.9: con contrato de un año el sueldo ERA
 *            `salaryFor(club, ovr)` y guardarlo duplicaba una derivada; con
 *            contrato largo es un hecho del pasado que ninguna cuenta de hoy
 *            reconstruye. El que firma a los 22 y explota cobra de menos tres
 *            años, y esa es exactamente la apuesta.
 *          · MIENTRAS CORRE, NO HAY MERCADO. `generateOffers` devuelve la mesa
 *            vacía y la tarjeta no se arma. El año en que vence, la mesa vuelve y
 *            la opción de quedarte pasa a ser RENOVAR, con sueldo nuevo calculado
 *            con la media de hoy y su propio plazo.
 *
 *        Y la puerta de escape sigue abierta: volver al club de origen rescinde y
 *        limpia el contrato, que es lo que hicieron Boffelli y Creevy. Un contrato
 *        largo no es una jaula, es una decisión que cuesta salir.
 *
 *        SUBE `schema` (15 → 16): `CaptainState` suma `contract` y `ClubOffer`
 *        suma `years`. Una partida vieja no tiene con qué inventarse un contrato
 *        —¿cuántos años, firmado cuándo, por cuánto?— y cualquier default la haría
 *        cobrar un sueldo que ninguna temporada suya produjo.
 *
 * 0.31.0 AL PIBE LO TIENE EL CLUB QUE LO FORMÓ. El mercado juvenil no existía:
 *        había tres puertas para salir del país —ser profesional, estar en un
 *        carril representativo, haberte quedado grande para tu sistema— y las
 *        tres son puertas de NIVEL, así que un chico de dieciséis con buena media
 *        tenía el catálogo entero encima. Medido sobre veinte países, ocho medias
 *        y doce semillas: a los dieciséis, el 23,6% de las ofertas venían de otro
 *        país y el 19,1% de otro continente; con el pibe en el M20 —`scouted`,
 *        que abría el catálogo entero— la cuenta se iba al 89,2% de afuera.
 *
 *        La ventana pasa a abrirse en TRES TIEMPOS, y las tres son puertas y no
 *        pesos, por lo de siempre: un multiplicador de cercanía lo gana el
 *        catálogo más grande, y el catálogo más grande casi nunca es el tuyo.
 *
 *          · HASTA LOS 18 (`HOMETOWN_MARKET_AGE`), los clubes NO PROFESIONALES
 *            de su país y nada más. Se evalúa por encima de las tres puertas de
 *            nivel en vez de sumarse a ellas: el M20 no la abre. Y «no
 *            profesional» es la única traducción honesta de «club amateur» que
 *            este catálogo soporta, porque el escalón de abajo se llama distinto
 *            en cada país —264 clubes argentinos son `amateur`, los irlandeses
 *            son `development`, los georgianos `semipro`— y un filtro por
 *            `level === 'amateur'` dejaría diez países en CERO.
 *          · HASTA LOS 21 (`REGIONAL_MARKET_AGE`), tres de cada cuatro ofertas
 *            son de su país o su región (`HOME_MARKET_SHARE`), por CUPO sobre la
 *            mesa. Con el refuerzo de casa —los clubes de su región más cercanos
 *            a su media, aunque queden abajo de la banda— porque hay regiones que
 *            se terminan: sin él, Uruguay cerraba en 59,8% y con él en 79,0%.
 *          · DE AHÍ EN ADELANTE, el mercado del rugby profesional y punto. El
 *            cupo es un ancla, no una jaula.
 *
 *        NO SUBE `schema`: no se agrega un solo campo al estado. La edad ya está
 *        en `player`, y la región de un club se DERIVA de su país de afinidad
 *        contra el catálogo de naciones (§1.9). Sí invalida las partidas en curso
 *        por `engineVersion`, que es lo correcto: la misma semilla ya no produce
 *        la misma carrera.
 *
 * 0.32.0 EL SALTO AL CLÁSICO. `BELONGING_CAP_RIVAL_JUMP` estaba escrito desde el
 *        primer día y era inalcanzable: `belongingSituation` lo leía de
 *        `flags['salto-al-clasico']`, una bandera que NINGUNA línea del motor
 *        escribía y que tenía al lado un comentario diciendo «cuando exista». O
 *        sea que el juego tenía el castigo del traidor y no tenía traidores.
 *
 *        Faltaban las dos mitades, y entran juntas porque por separado no
 *        significan nada:
 *
 *          · EL CATÁLOGO (`data/rivalries.ts`). Los clásicos grandes de verdad,
 *            de la URBA al NPC, verificados club por club contra el catálogo por
 *            `rivalries.test.ts` — que es lo único que puede decir cuántos son
 *            sin quedar viejo. Es DATO y no fórmula: CASI y SIC están a doce
 *            cuadras y son EL clásico,
 *            Alumni y Belgrano Athletic también son de zona norte y no lo son.
 *            Ninguna cuenta de geografía, división o palmarés separa esas dos
 *            cosas.
 *          · EL COBRO (`engine/betrayal.ts`). Irte de tu club a su clásico BORRA
 *            la Pertenencia que construiste ahí —no la baja, no la congela— y
 *            deja su techo abajo para siempre. Es la única pérdida total del
 *            juego, y tiene que serlo: todo lo demás que te aleja del club es
 *            estar lejos, y esto es estar enfrente.
 *
 *        Y ARREGLA UN §1.7 DE PASO. La bandera se llamaba como una pregunta
 *        sobre UN club —«¿te fuiste de ESTE club al rival?»— y su cuerpo era un
 *        booleano por carrera: el primer salto le habría bajado el techo a TODOS
 *        los clubes, incluido el que te acababa de fichar. Ahora se deriva por
 *        club de la trayectoria.
 *
 *        NO SUBE `schema`: no se guarda un campo nuevo. La pregunta «¿de qué
 *        clubes te fuiste al clásico?» ya la contesta `history[]`, y un
 *        `betrayed: string[]` en el ledger sería la segunda fuente de verdad que
 *        el §2 del CLAUDE raíz prohíbe — la que se desincroniza el día que un
 *        pase se olvide de escribirla. Lo que sí entra al guardado es
 *        `rivalriesVersion`, que sella el catálogo igual que los torneos y la
 *        tienda.
 *
 *        LA TARJETA LO DICE ANTES. El `hint` de la oferta nombra al club que
 *        dejás y el escalón al que quedás limitado, DERIVADO de las constantes y
 *        no escrito a mano. Un castigo de esta magnitud que se entera después no
 *        es una decisión difícil: es una trampa.
 *
 * 0.37.0 EL SELECCIONADO A DEJÓ DE SER UN IMPUESTO. El escalón `a-xv` existía
 *        desde la 0.15.0, cobraba seis fechas del club por temporada y no tenía
 *        NADA del otro lado: ni rival, ni copa, ni un nombre que se entendiera.
 *        En pantalla se leía «Jugaste 6 partidos con Seleccionado A» debajo de
 *        «Te faltan 8 puntos para la vara de Argentina», o sea que el juego te
 *        decía en dos renglones seguidos que no habías llegado a la selección y
 *        que habías jugado con una selección.
 *
 *        Entran tres cosas y son la misma:
 *
 *          · EL NOMBRE. Se llama por el país —«Argentina XV», «Nueva Zelanda
 *            XV», «Kirguistán XV»— así que dejó de ser una entrada de tabla y
 *            pasó a ser `trackLabelOf(track, countryCode)`. Sacarlo del `Record`
 *            es lo que impide que vuelva: el compilador ya no deja escribir
 *            `TRACK_LABEL[track]` sin decir de dónde sos (§1.5).
 *          · EL TORNEO. La Nations Cup (`data/tournaments.ts`), la ventana de los
 *            segundos seleccionados, todos los años y con su copa. NO DA CAPS, y
 *            eso lo sigue diciendo `capsOf`: un cap es un partido con la mayor.
 *          · LA CUENTA. El retiro muestra los partidos y las temporadas con esa
 *            camiseta, en su propio bloque y NUNCA sumados a los caps.
 *
 *        SUBE `schema`. `CaptainSeasonEntry.track` guardaba el RÓTULO y ahora
 *        guarda el id (`trackId`). No es cosmético: con el texto adentro, la
 *        pregunta «¿cuántas temporadas jugaste con el XV?» había que contestarla
 *        comparando cadenas —y cadenas que ahora cambian de país en país—. Es la
 *        misma regla que los premios ya respetaban: ids, no textos, y la UI
 *        traduce.
 *
 * 0.38.0 LA CARRERA DEJA DE CAERSE A LOS VEINTIPICO, Y LA VUELTA A CASA TERMINA
 *        LA CARRERA. Dos reportes de la misma sesión y las dos son de la misma
 *        familia: el motor hacía algo distinto de lo que la pantalla prometía.
 *
 *          · EL PISO DEL DECLIVE (`DECLINE_FLOOR`, 33). La tabla de
 *            `positions.ts` está calibrada contra edades reales y ahí un centro
 *            afloja a los 29; con la peor tirada de longevidad, a los 26. Cierto
 *            en el rugby e ilegible en un juego de carrera. La tabla sigue
 *            diciendo lo que dice —de ella salen el pico, la meseta y los dos
 *            topes— y encima corre un piso: la caída no puede empezar antes de
 *            los 33. Vive en `resolveAgeCurve`, que es la única fuente de la
 *            curva, así que el envejecimiento, el retiro y el llamado del club
 *            de origen lo ven los tres.
 *          · Y EL RUIDO DEJÓ DE RESTAR ANTES DEL DECLIVE. El piso solo no
 *            alcanzaba: medido, 14 de 96 carreras seguían perdiendo media antes
 *            de los 33 porque en la meseta `delta` vale casi cero y media tirada
 *            de ruido es negativa. Se sigue tirando igual —el stream no se
 *            mueve— pero de este lado del declive solo puede sumar.
 *          · LA DESPEDIDA (`farewell`). «Terminar donde empezaste» no terminaba
 *            nada: volvías a tu club y el mercado seguía poniéndote la mesa
 *            todos los junios hasta el tope duro del puesto. Ahora la opción
 *            marca la temporada (`FAREWELL_FLAG`), el mercado no vuelve a
 *            abrirse y se juega UNA temporada más —la despedida— antes de
 *            colgar los botines, con `'decision'` como motivo. El `hint` lo dice
 *            antes de que la elijas.
 *
 *        NO SUBE `schema`. La despedida se anota en `player.flags`, que ya
 *        existe, ya se persiste y ya es el lugar de los contadores libres
 *        (`ultimo-pase` vive ahí). Un campo propio del estado pediría migrar el
 *        guardado para representar el mismo hecho.
 *
 *        LO QUE NO CAMBIÓ, dicho para que no se lea como un olvido: una lesión
 *        grave y una conmoción siguen bajando atributos a cualquier edad. Son
 *        otro canal —el cuerpo, no el almanaque— y son justamente lo que hace
 *        que romperse se sienta.
 *
 * 0.39.0 A LOS DIECISÉIS NO SE DEBUTA EN PRIMERA, Y LA VENTANA DE LOS DIECISIETE
 *        TIENE DOS TORNEOS.
 *
 *          · JUVENILES (`FIRST_TEAM_AGE`, 18). El plantel superior es de
 *            mayores: a los 16 y a los 17 se juega con los de tu edad. El motor
 *            ya separaba `clubShare` —qué parte de la temporada del CLUB
 *            jugaste— de `rendimiento` —cuántos minutos jugaste, de la camiseta
 *            que sea—, así que el pibe sigue creciendo por jugar y lo que se le
 *            cierra es el plantel: no levanta la copa de la división mayor ni
 *            cierra su primera temporada con un «debutaste en primera» arriba de
 *            un año de M16. La cabecera dice «Juveniles» y la crónica también.
 *          · SE CAYÓ LA REGLA DEL UNO POR AÑO. Decía que una temporada trae como
 *            mucho un torneo, y el calendario real de los diecisiete la
 *            desmiente: se juega el provincial y de ahí sale el equipo del
 *            continental. La regla nueva es más chica —CADA TORNEO SE JUEGA UNA
 *            VEZ POR TEMPORADA— y quién cae junto lo sigue decidiendo el
 *            catálogo, no el motor.
 *          · SEIS CONTINENTALES M18, uno por región del mapa, con la compuerta
 *            puesta en la REGIÓN (`TournamentGate.regions`) y el campo sacado de
 *            las uniones de esa región (`rivalPool: 'region'`). Ninguna
 *            nacionalidad elegible se queda sin la ventana de los diecisiete, que
 *            hasta acá era argentina y de nadie más.
 *          · Y EL PROVINCIAL SE LLAMA M18, que es su nombre. Cambia el id
 *            (`juvenil-m18`), así que sube `TOURNAMENTS_VERSION`.
 *
 *        NO SUBE `schema`: no hay un campo nuevo en el estado. La camiseta de una
 *        temporada se DERIVA de la edad que la fila ya guarda (§1.9).
 */
export const CAPTAIN_ENGINE_VERSION = '0.39.0';

/**
 * Las fases del ciclo. `offseason` es propia de este juego y no la tiene
 * Carrera de Rugby: es donde se elige el entrenamiento del año, que es la
 * decisión que se toma todas las temporadas y nunca tiene respuesta obvia.
 */
export type CaptainPhase =
    | 'setup' // creando el jugador
    | 'offseason' // eligiendo el entrenamiento
    | 'moment' // hay una jugada esperando que la juegues
    | 'event' // hay una decisión esperando
    | 'season' // el entrenamiento está elegido, falta jugar
    | 'tournament' // hay un torneo representativo esperando
    | 'retired';

/**
 * Los escalones de la vía representativa, de menor a mayor.
 *
 * El orden importa: `engine/national-team.ts` compara escalones para saber si
 * subiste o bajaste, y la cabecera muestra el más alto que alcanzaste. `club`
 * no es un escalón de selección: es no estar en ninguno.
 */
export type SquadTrack = 'club' | 'union' | 'academia' | 'm20' | 'a-xv' | 'nacional';

export const SQUAD_TRACKS: readonly SquadTrack[] = ['club', 'union', 'academia', 'm20', 'a-xv', 'nacional'];

/**
 * EL ESTADO DE LA CAMISETA DE LA MAYOR, que no es lo mismo que el escalón.
 *
 * El escalón (`SquadTrack`) contesta «¿en qué plantel estás este año?» y se
 * recalcula de cero cada temporada. Esto contesta «¿qué sos para esta unión?», y
 * eso tiene memoria: al que está adentro lo bancan cuando baja, al que se cayó
 * lo siguen conociendo, y al que llevaron una vez de gira todavía no lo eligen.
 *
 *     uncapped ──→ trial ──→ squad ──→ starter
 *                    │         │  ↑        │
 *                    └──→ dropped ←────────┘   (y de dropped se puede volver)
 *
 * `trial` es el que hace falta nombrar: cruzaste la vara por menos de tres
 * puntos, te llevan de gira y jugás partidos secundarios. Tenés dos temporadas
 * para volver a cruzarla con margen. De ahí sale el jugador de un solo cap.
 */
export type NationalStatus = 'uncapped' | 'trial' | 'squad' | 'starter' | 'dropped';

/**
 * Cómo llegaste a poder representar a una unión. Regulación 8.1 de World Rugby.
 *
 * `naturalisation` es la única que NO es una cláusula del reglamento, y está
 * declarada como lo que es: el papeleo que la unión te empuja cuando sale a
 * buscarte (`nt-cambiar-de-bandera`). En el rugby de verdad ese trámite termina
 * cayendo en el 8.1(c) o en el 8.1(d) —residencia—, pero cuál de los dos y en
 * qué mes es una historia que el motor no simula: no modela mudanzas fuera de la
 * carrera deportiva. Escribirla como `registration-60m` sería afirmar sesenta
 * meses que la partida no tiene, o sea el §1.9 en su forma más barata de cometer.
 *
 * Agregar una variante no invalida ninguna partida guardada: los saves viejos
 * nunca la contienen y el tipo sólo se ensancha.
 */
export type EligibilityRoute =
    | 'birth'
    | 'parent'
    | 'grandparent'
    | 'registration-60m'
    | 'presence-10y'
    | 'naturalisation';

export interface EligibilityClaim {
    union: string;
    route: EligibilityRoute;
}

/**
 * La elegibilidad, tal como la Regulación 8 la cuenta: en MESES y por unión.
 *
 * Va acá y no en `engine/` porque el estado la guarda y el árbol de tipos es la
 * raíz (misma regla que `types/achievements.ts`). Las REGLAS —cuántos meses, qué
 * reinicia la cuenta, qué captura— viven en `engine/eligibility.ts`, que es donde
 * se discuten.
 */
export interface EligibilityState {
    /** La nacionalidad elegida al crear el jugador. Identidad y bandera. */
    nationalityCountryCode: string;
    /** 8.1(a). Hoy es siempre el mismo que la nacionalidad: el motor no inventa mudanzas. */
    birthCountryCode: string;
    /** La unión con la que estás registrado HOY, que es la del club actual. */
    registeredUnion: string | null;
    /** Meses de registro EXCLUSIVO y consecutivo, por unión. Cambiar de unión reinicia. */
    registrationMonths: Record<string, number>;
    /** Meses de presencia ACUMULADA, por unión. Esto no se reinicia nunca. */
    presenceMonths: Record<string, number>;
    /** Las uniones que podés representar, con la ruta por la que ganaste el derecho. */
    claims: EligibilityClaim[];
    /**
     * LA UNIÓN A LA QUE QUEDASTE ATADO. Desde acá no cambiás de camiseta.
     *
     * Se llega por dos caminos y el campo tiene que nombrarlos a los dos, porque
     * el nombre y la cosa dicen lo mismo o no dicen nada (CLAUDE de captain §1.5):
     *
     *   · 8.2 — debutaste con la mayor. Lo escribe `evaluateNationalTeam`.
     *   · aceptaste nacionalizarte. Lo escribe `switchToUnion` desde la tarjeta
     *     de la otra bandera, que declara con todas las letras que es para
     *     siempre. Estrictamente el 8.2 captura al DEBUTAR y no al aceptar, pero
     *     el efecto sobre la carrera es el mismo —ya no podés jugar para otra— y
     *     un segundo campo para decir lo mismo sería una segunda fuente de verdad
     *     sobre a qué unión aspirás.
     */
    capturedBy: string | null;
}

/** La planilla con UNA unión. Los caps son por camiseta, no un total de la carrera. */
export interface UnionCaps {
    caps: number;
    /**
     * Los que sumaste ESTANDO EN EL PLANTEL. Los de gira no cuentan: la
     * titularidad se gana adentro, y al que llevaron de gira todavía lo están
     * mirando.
     */
    squadCaps: number;
}

export interface NationalRecord {
    track: SquadTrack;
    /** El más alto que pisaste. No baja aunque te dejen afuera. */
    bestTrack: SquadTrack;
    /** Partidos con la mayor. Los caps valen más que los títulos (CLAUDE.md §5). */
    caps: number;
    debutSeason: number | null;
    /** Qué sos hoy para tu unión. */
    status: NationalStatus;
    /**
     * La planilla POR UNIÓN. Es un total de la carrera y a la vez no lo es: hoy
     * la captura del 8.2 hace que nadie juegue para dos, pero contarlo por unión
     * es lo que impide que el día que entre la transferencia del 8.6 el total de
     * una camiseta quede sumando partidos de la otra.
     */
    byUnion: Record<string, UnionCaps>;
    eligibility: EligibilityState;
}

/**
 * El otro tipo que juega en tu puesto.
 *
 * En El Ídolo el archirrival te compite en goles. Acá te compite LA CAMISETA:
 * en cada convocatoria entra uno de los dos, y el marcador que importa es el de
 * caps. Es la traducción correcta —el rugby no tiene tabla de goleadores— y
 * tiene precedente: Isgró quedó afuera de los doce de París y viajó de reserva.
 */
export interface Rival {
    name: string;
    surname: string;
    ovr: number;
    caps: number;
}

/** Una copa en la vitrina. */
export interface Title {
    season: number;
    competitionId: string;
    labelEs: string;
    clubId: string | null;
    kind: 'club' | 'national';
}

/**
 * Una oferta sobre la mesa. Las amateur no traen plata —no existe— y las
 * profesionales sí, con el sueldo anual en dólares.
 */
export interface ClubOffer {
    clubId: string;
    kind: 'amateur' | 'professional';
    salary: number;
    /**
     * POR CUÁNTOS AÑOS TE FIRMAN. Cero en las amateurs, que es la verdad y no un
     * caso borde: en el club amateur sos socio, no tenés contrato, y por eso la
     * ventana de pases se te abre todos los junios sin que nadie te lo permita.
     *
     * Sale de `contractYearsFor`, que es la MISMA función que arma la renovación
     * de la tarjeta. Si la oferta declarara sus años por su cuenta, la mesa y la
     * renovación podrían prometer plazos distintos con la misma regla escrita
     * dos veces (§1.9).
     */
    years: number;
    /** Temporada en que apareció. Una oferta no espera para siempre. */
    season: number;
}

/**
 * EL CONTRATO PROFESIONAL: con quién, desde cuándo, por cuánto tiempo y por
 * cuánta plata.
 *
 * ── POR QUÉ EL SUELDO SE GUARDA ACÁ, SI LA 0.25.0 LO SACÓ DEL ESTADO ────────
 * Aquella vez tenía razón: el contrato duraba un año, así que el sueldo era
 * exactamente `salaryFor(club, ovr)` corrido con la media de ese mismo año.
 * Guardarlo era duplicar una derivada, que es la §1.9 del CLAUDE de captain.
 *
 * Con un contrato de dos o tres años deja de serlo. El sueldo es un HECHO DEL
 * PASADO —lo que ese club aceptó pagar el junio que firmaste— y la media con la
 * que se calculó ya no existe: al año siguiente crecés (y cobrás de menos) o te
 * caés (y cobrás de más), y las dos cosas son el contrato haciendo su trabajo.
 * Derivarlo cada temporada borraría justamente lo que un contrato largo compra.
 *
 * Lo que sigue SIN guardarse es la fecha de vencimiento: `since + years - 1` se
 * calcula (`lastSeasonOf`), no se escribe.
 */
export interface Contract {
    clubId: string;
    /** Primera temporada cubierta. */
    since: number;
    /** Años que dura. Entre uno y tres, y lo decide el club (`contractYearsFor`). */
    years: number;
    /** El sueldo anual, en dólares, CONGELADO al firmar. */
    salary: number;
}

/** Lo que hace falta para arrancar una carrera. */
export interface CreateCaptainInput {
    name: string;
    surname: string;
    family: PositionFamilyId;
    countryCode: string;
    /** Dorsal dentro de la familia. Si no viene, lo sortea el motor. */
    number?: number;
    /** Club del catálogo. Si no viene o no existe, arranca sin club resuelto. */
    clubId?: string;
}

export interface CaptainState {
    // ── Versiones congeladas al empezar la partida ──────────────────────────
    // Se guardan EN EL ESTADO y no solo en el envoltorio del guardado, para que
    // una partida cargada sepa contra qué datos se jugó.
    version: string; // CAPTAIN_ENGINE_VERSION
    positionsVersion: string; // CAPTAIN_POSITIONS_VERSION
    clubCatalogVersion: string; // NORMALIZED_CATALOG_VERSION

    // ── Azar ────────────────────────────────────────────────────────────────
    /** La semilla original. Con esto y la secuencia de decisiones se rehace todo. */
    seed: number;
    /** Estado actual del PRNG. Se sella al final de cada paso del reducer. */
    rngState: number;

    // ── Dónde está la carrera ───────────────────────────────────────────────
    season: number;
    stage: CaptainStage;
    phase: CaptainPhase;
    /** La temporada en que firmaste profesional. `null` mientras seas amateur. */
    signedProSeason: number | null;
    /**
     * EL CONTRATO VIGENTE, o `null` si no tenés ninguno —o sea, si sos amateur—.
     *
     * Es lo que hace que un pase sea un compromiso y no una decisión anual: la
     * ventana de pases se cierra mientras el contrato corra (`generateOffers`) y
     * se vuelve a abrir el año en que vence, con tu club ofreciéndote renovar por
     * un sueldo nuevo y el resto del mercado sobre la mesa.
     *
     * Va en el estado y no derivado del historial: el sueldo que acordaste no se
     * puede reconstruir desde ninguna otra parte, y el club y el plazo tampoco
     * —una fila de temporada dice dónde jugaste, no hasta cuándo firmaste—.
     */
    contract: Contract | null;

    player: CaptainPlayer;

    /**
     * El club de origen: donde te hiciste. Es el único que puede ponerle tu
     * nombre a la cancha, y el que te espera si volvés.
     */
    homeClubId: string | null;

    // ── Las dos escaleras ───────────────────────────────────────────────────
    national: NationalRecord;
    rival: Rival | null;
    /** La vitrina: copas de club y de selección, en el orden en que se ganaron. */
    titles: Title[];
    /** Ofertas sobre la mesa. Se limpian al resolverse la decisión de mercado. */
    offers: ClubOffer[];

    // ── Lo que la carrera va dejando escrito ────────────────────────────────
    /** Premios individuales de temporada. El XV ideal se puede repetir. */
    awards: SeasonAward[];
    /** Hitos, en orden de carrera. Cada uno pasa una sola vez. */
    milestones: Milestone[];
    /**
     * ASCENSOS Y DESCENSOS DE ESTA CARRERA: `clubId → competición`.
     *
     * Vive en el estado y no en el catálogo, y es la única forma de hacerlo bien:
     * `CLUBS` es un módulo compartido por todas las partidas cargadas en la misma
     * pestaña, así que un club que ascendió en tu carrera no ascendió en la mía.
     * El club se resuelve al leer, con `engine/promotion.ts`.
     */
    divisions: Record<string, string>;
    /**
     * DÓNDE TERMINÓ TU CLUB LA TEMPORADA PASADA, y en qué competición.
     *
     * Es lo único de este bloque que NO es derivado, y por eso se guarda: la
     * Champions Cup de este año se juega con la tabla del anterior, igual que en
     * el rugby de verdad. Al cerrar la temporada la posición se recalcula sola
     * —sale de `leagueTableOf`, que es determinista—, pero recalcularla desde
     * cero exigiría rehacer la tabla de una competición que el club quizás ya
     * dejó, con la división que tenía entonces. Guardarla es más barato y más
     * honesto que reconstruirla.
     *
     * `null` en la primera temporada: todavía no hay año anterior, así que el
     * club entra a las copas que le tocan por pertenecer a su división y a
     * ninguna que se gane por posición. Es la verdad y no un caso borde.
     */
    lastStanding: LeagueStanding | null;

    // ── El entrenamiento de ESTA temporada ──────────────────────────────────
    /**
     * Id del `TrainingDef` elegido en la pretemporada, o `null` mientras no se
     * eligió. Se guarda el ID y no la definición: es la misma regla que el club
     * —guardá la clave, resolvela contra el catálogo— y así retocar un `hint` no
     * toca ninguna partida guardada.
     */
    training: string | null;

    // ── Las cinco monedas ───────────────────────────────────────────────────
    belonging: BelongingLedger; // por club
    fame: number; // Cartel
    money: number; // US$: quieta hasta firmar
    damage: DamageLedger; // 🧠 + 🦴

    // ── Presupuesto de partidos ─────────────────────────────────────────────
    matches: MatchBudget;

    // ── Lo que una decisión le deja a LA TEMPORADA QUE VIENE ────────────────
    // Duran una sola temporada y se apagan solos al cerrarla. Si duraran más,
    // una decisión buena del año tres seguiría empujando en el año doce y nadie
    // podría explicar por qué.
    pendingPlayingTime: number;
    pendingStatBoost: number;
    /** Partidos de suspensión que te vas a comer. */
    pendingSanction: number;
    /** Fechas que te vas a perder por estar roto. Ausencia, igual que la sanción. */
    pendingInjury: number;

    // ── Torneos representativos ─────────────────────────────────────────────
    /**
     * El torneo que estás jugando, con TODOS los marcadores ya sorteados
     * adentro. `null` fuera de la fase.
     *
     * Se guarda entero y no se recalcula al cargar, y es la única forma de
     * hacerlo bien: el torneo dura nueve pantallas, así que la ventana para
     * recargar en el medio es nueve veces la de un Momento. Un F5 en la semi
     * tiene que devolver la misma semi.
     */
    pendingTournament: PendingTournament | null;
    /**
     * LOS TORNEOS JUGADOS, en orden de carrera.
     *
     * Es la mano del jugador y no un dado, igual que `moments`: de acá salen la
     * crónica del retiro y la respuesta a "¿jugaste un Mundial?". Se guarda el
     * torneo cerrado y no un resumen — el resumen se deriva, y una derivada
     * guardada es una mentira con fecha de vencimiento (CLAUDE.md §1.9).
     */
    tournaments: PendingTournament[];

    // ── Momentos ────────────────────────────────────────────────────────────
    /** La jugada que te espera esta temporada. `null` si no hay ninguna. */
    pendingMoment: PendingMoment | null;
    /** Las jugadas que ya jugaste. Es tu mano, no un dado: se persiste. */
    moments: MomentRecord[];

    // ── Eventos ─────────────────────────────────────────────────────────────
    pendingEventId: string | null;
    /**
     * Los últimos eventos vistos, MÁS RECIENTE PRIMERO. El cooldown es una
     * ventana de N entradas sobre esta lista, no un contador de temporadas:
     * es el patrón de `career/engine/event-selector.ts`.
     */
    recentEventIds: string[];

    // ── Lo que queda escrito ────────────────────────────────────────────────
    history: CaptainSeasonEntry[];
    decisionLog: CaptainDecisionEntry[];
}
