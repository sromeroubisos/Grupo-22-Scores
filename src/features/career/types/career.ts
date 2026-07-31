import type { Player, Position } from './player.ts';
import type { LeagueStanding, SeasonCompetitionParticipation, SeasonResult, SeasonStats } from './season.ts';
import type { TitleWon } from '../data/clubs2026/competitions2026.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import type { EmploymentStatus, SquadTrack } from '../engine/contracts.ts';
import type { CareerArchetype } from '../engine/archetypes.ts';
import type { SeasonAwardId } from '../engine/awards.ts';
import type { SquadRole } from '../engine/squad-role.ts';

/**
 * LA RAMA CON LA QUE ARRANCA LA CARRERA. La sortea el motor: dejó de ser una
 * elección de la pantalla de creación (1.26.0).
 *
 * Era una elección y no debía serlo. Antes de jugar una carrera nadie sabe qué
 * significa "desarrollo", así que la primera decisión del juego era la única que
 * el jugador no podía entender. Ahora se descubre jugando, y la primera decisión
 * de verdad pasa a ser qué club te lleva.
 *
 * LA RAMA FIJA DÓNDE ARRANCÁS (1.28.0), y de ahí sale el nivel. Hasta 1.27.0
 * fijaba sólo una banda de OVR y mandaba a todos al mismo club amateur: la
 * etiqueta no describía nada que el jugador pudiera ver.
 *
 *   amateur      → plantel senior de un club amateur. Vínculo amateur, track
 *                  senior, 45-55 de OVR a los 18 pesado por proyección.
 *   development  → ACADEMIA de un club semipro o profesional. Vínculo
 *                  compensado, track desarrollo, 50-55 de OVR a los 18.
 *
 * El nombre `development` ahora coincide con lo que hace. Hasta 1.27.0 era la
 * rama que justamente NO iba a desarrollo, que es la clase de nombre que termina
 * en un bug.
 *
 * `professional` QUEDA COMO VALOR LEGADO y no se sortea nunca. Sigue en el tipo
 * porque viaja en `CareerState` (localStorage) y en el token compartible: una
 * partida guardada de 1.26.0 lo trae, y el motor la trata como `development`.
 * Borrarlo del tipo rompería la carga de esas partidas sin ganar nada.
 *
 * SE CONSERVA EL NOMBRE `startRoute` aunque ya no sea una ruta elegida: viaja en
 * el estado y renombrarlo no cambiaría una sola línea de comportamiento.
 */
export type StartRouteId = 'amateur' | 'development' | 'professional';

/** Las que el motor SORTEA. `professional` no está: es legado de lectura. */
export const START_ROUTES: readonly StartRouteId[] = ['amateur', 'development'];

/**
 * RITMO de la carrera: cuántas temporadas pasan por cada decisión.
 *
 * No toca el balance ni la simulación — cambia CADA CUÁNTO se le pregunta algo
 * al jugador. Una carrera de veinte temporadas pide veinte decisiones en
 * `intense` y siete en `express`.
 *
 * Lo que NUNCA se silencia es el MERCADO: si aparece una oferta, el tramo se
 * corta ahí aunque le queden temporadas. Silenciarlo no sería cambiar el ritmo
 * sino la carrera — el ascenso de amateur a profesional pasa por el mercado, y
 * un modo que lo mira un año de cada tres asciende a la tercera parte de la
 * gente. Por eso el número es un MÁXIMO de temporadas por decisión, no un paso
 * fijo, y la UI lo dice así.
 */
export type PaceModeId = 'intense' | 'normal' | 'express';

export const PACE_MODES: readonly PaceModeId[] = ['intense', 'normal', 'express'];

/**
 * Temporadas que corren por decisión. `intense` = 1 es el comportamiento
 * histórico del motor: con ese valor el bucle de tramo no se ejecuta ni una
 * vez, no consume RNG y la carrera queda byte-idéntica a la de 1.10.0.
 */
export const SEASONS_PER_DECISION: Readonly<Record<PaceModeId, number>> = {
    intense: 1,
    normal: 2,
    express: 3,
};

/** Cómo entró el jugador al rugby profesional/senior. Se sella en la historia. */
export type EntryMode =
    | 'domestic-senior' // debuta en el plantel senior de su liga doméstica
    | 'foreign-amateur' // emigra a una liga amateur/mixta de otro país
    | 'external-development'; // entra a la academia/desarrollo de un club de afuera

/**
 * Naturaleza del movimiento de mercado, en terminología de rugby (UAR). NO es
 * "firmar contrato" salvo en clubes profesionales. La UI y el relato consumen
 * `movementKind` para elegir el texto correcto (pase, invitación, contrato…).
 */
export type MovementKind =
    | 'stay' // seguir en el club
    | 'amateur-pass' // pase amateur dentro de la misma unión/sistema
    | 'inter-union-pass' // pase entre uniones (mudanza / oportunidad deportiva)
    | 'international-pass' // pase a otro país
    | 'development-invite' // lugar de desarrollo / academia
    | 'semi-pro-agreement' // acuerdo semiprofesional
    | 'professional-contract'; // contrato profesional (solo clubes pro)

// 1.5.0: identidad REAL de competición (fin del "campeón de Liga Argentina"),
// ledger de participación club↔jugador, títulos del club vs del jugador,
// terminología amateur por movementKind, mercado como fase explícita y curva de
// OVR recalibrada. Cambia historial/títulos/mercado ⇒ los guardados < 1.5.0 se
// descartan con el aviso no técnico existente.
//
// 1.6.0: planilla completa (puntos guardados + desglose del pie + scrums) y
// ELECCIÓN DE RUTA INICIAL (amateur / desarrollo / profesional), que fija empleo,
// track, modelo económico del club de arranque, edad de debut y OVR inicial.
//
// Las estadísticas por sí solas NO habrían cambiado los resultados: su desglose
// sale de un rng re-sembrado aparte, y se verificó que las carreras de la línea
// de base quedan byte-idénticas. Lo que sí cambia todo es la ruta: el club de
// arranque ahora depende de ella, y con él la carrera entera.
//
// 1.11.0: MODOS DE DURACIÓN (`paceMode`). El digest congelado NO cambió —en
// `intense` el motor hace exactamente lo mismo que en 1.10.0— pero la versión
// sube igual, porque el motor ahora puede producir estados que 1.10.0 no sabe
// reproducir: una carrera guardada en `express` no se reconstruye desde
// (semilla + decisiones) con el motor anterior, y `version` es justamente el
// campo que le dice a un validador qué motor la generó.
// 1.14.0: la ranura del puesto de la TERCERA LÍNEA deja de ser `turnovers` y
// pasa a `metres`. Es un cambio chico pero toca el estado: `secondaryStatLabel`
// y `secondaryStat` se congelan en cada entrada de la trayectoria, así que la
// misma semilla produce un estado distinto para un jugador de tercera línea. Los
// tres casos del digest (apertura, pilar, wing) no usan esa ranura: lo único que
// se les movió es el `stateHash`, porque el estado guarda `version`.
// 1.15.0: EL RETIRO ES UNA DECISIÓN. Hasta 1.14.0 el motor cerraba la carrera
// solo, con un dado contra la edad "blanda" del puesto: se retiraba a un
// jugador de 34 años, titular, con 81 de OVR y campeón. Ahora no se retira a
// nadie por edad antes de los 39; entre los 34 y los 38 la opción "Retirarte"
// viaja con la decisión de cada temporada, y lo único que puede cortar antes es
// una lesión grave. Con eso, además, se acabó el desperdicio de RNG de
// preguntar todos los años si se retira.
//
// Va con contenido para que seguir jugando NO sea solo perder OVR: el descuento
// por edad en el mercado tiene tope (los clubes siguen llamando, más abajo), la
// lesión pesa más a partir de los 34 (ese es el precio real de estirarla) y hay
// dos arquetipos de longevidad.
//
// La forma de `CareerState` NO cambia, así que `schema` se queda en 8: lo que
// cambia es el comportamiento con la misma semilla.
// 1.16.0: PLANILLA DE SELECCIÓN POR UNIÓN (`player.nationalStats`) y la columna
// del puesto reducida a una sola (el tackle dejó de ser columna fija). Los caps
// dejan de ser un contador plano: se guardan por unión, porque un cambio de
// elegibilidad no puede sumar los de Gales con los de Argentina, y `player.caps`
// pasa a ser el total de la camiseta actual.
// 1.17.0: EL MERCADO PASA A SER EL EJE. Medido, dos de cada tres decisiones
// eran de vida y una de mercado (21% / 79%); ahora es al revés (64% / 36%), que
// es lo que hace que la carrera se sienta una carrera de rugby y no un
// cuestionario. Se subió la presión del mercado (`surfaceMarketProbability` de
// 0.10 a 0.60 de base) y el silencio tras un pase bajó de dos temporadas a una.
//
// Y EL CLUB TAMBIÉN DECIDE: si no rendís, no te renuevan (`engine/renewal.ts`).
// Esa decisión NO tiene opción de quedarse — es la única del juego que no la
// tiene, y ahí está todo su peso.
// 1.19.0: LA TITULARIDAD SE GANA. El descuento de −3 se regalaba en el debut, y
// por eso el modelo producía la misma carrera internacional con distinto escudo
// (70,5 · 71,2 · 59,3 caps promedio, los tres tiers en la misma banda) y no
// producía al jugador de un solo cap. Ahora los primeros cinco caps son a prueba
// y la temporada del debut se juega desde el banco (`SHARE_DEBUT`), sin lo cual
// el umbral de prueba no servía: un debutante de tier 1 se llevaba 10-11 caps de
// una y lo superaba antes de terminar el año.
// 1.20.0: LOS CAPS SALEN DEL CALENDARIO. El tope de caps por temporada dejó de
// ser una tabla por reputación (`TESTS_BY_REPUTATION`, borrada) y pasó a ser una
// consecuencia del fixture real: `data/international-calendar.ts` dice cuántos
// partidos juega cada unión cada temporada, y nadie puede sumar más caps que
// eso. Si Tailandia juega tres partidos al año, el tailandés no suma seis por
// más que tenga 85 de OVR.
//
// Con eso, Georgia juega siete partidos por temporada y Argentina trece: el
// georgiano necesita casi el doble de temporadas para llegar a los mismos caps,
// sin que ningún umbral lo diga.
//
// Y el Mundial deja de tener dos calendarios: `mil-world-cup-callup` y
// `mil-world-cup-final` salían cada tres temporadas cayera donde cayera, y ahora
// sólo en un año de Mundial.
// 1.21.0: EL ESTADO `trial`. Nadie debuta en la primera fecha del Seis Naciones:
// se debuta en una gira de julio contra un rival menor. El calendario ahora parte
// sus partidos en primarios (torneos y llaves) y secundarios (giras, ventana de
// noviembre, clasificatorias), y el que cruza el umbral por menos de
// `TRIAL_MARGIN` juega SOLO secundarios hasta que vuelva a cruzarlo con margen.
// Con eso aparece el jugador de un solo cap, que es de las figuras mas comunes
// del deporte y que el motor no producia: el 54% de los internacionales de tier 1
// terminaba con mas de 60 caps.
// 1.22.0: absorbe los parches de la sesión paralela, todos de la misma familia —
// un evento dando por sentado un fixture que el calendario no tiene:
//
//   · `mil-world-cup-callup` y `mil-world-cup-final` pedían sólo un cooldown, así
//     que había convocatorias al Mundial en 2029 y finales en 2030. Ahora piden
//     `isWorldCupYear`.
//   · `nt-tour-vs-rest` le ofrecía la gira de fin de año al tailandés, cuya unión
//     no tiene ventana de noviembre. Ahora pide `playsEndOfYearTour`, que
//     contempla que en un año de Nations Championship los cruzados SON la
//     ventana: gatear con `tourMatches > 0` a secas se la sacaba a las doce
//     uniones de arriba en la mitad de las temporadas.
//   · Rusia sale de `RUGBY_UNIONS` (`SUSPENDED_UNIONS`, con motivo): una unión sin
//     fixture es una camiseta que no se puede jugar, y ofrecerla es una trampa.
//
// La forma de `CareerState` no cambia — `schema` se queda en 11 — pero un evento
// que antes salía y ahora no corre el stream del rng, así que la misma semilla
// produce otra carrera.
// 1.23.0: la gracia de la presión del titular baja de 3 temporadas a 2, y la
// ventana de giras sale de la reputación y pasa a ser una entrada del calendario
// (`july-window`, `november-window`, `world-cup-warm-ups`, con `replacedBy`
// diciendo quién le ocupa la fecha a quién). Era el último resto de la
// aproximación vieja, de la misma familia que `TESTS_BY_REPUTATION`.
//
// Medido sobre las mismas 303 carreras internacionales de tier 1, apagando y
// encendiendo la constante: la presión mueve el 60+ de 51,8% a 46,2% y la
// mediana de 62 a 55, y la gracia en 2 agrega un punto al 10-30 sin tocar el
// `<10`. Lo que NO hace es llenar el 10-30, y no lo va a hacer: ver §19.
// 1.24.0: EL CATÁLOGO COMPLETO DE UNIONES. De 43 a 128, con las seis
// asociaciones regionales y el fixture de abajo (Trophy y Conference europeos,
// divisiones de África y Asia, Sudamérica B, RAN Championship, Oceania Cup), y
// la reasignación de bandas contra el ranking mundial de julio de 2026.
//
// Sube `engineVersion` además de `nationsVersion` y `internationalCalendarVersion`
// porque no es sólo catálogo: mueve nueve uniones de banda, y la banda ES el
// umbral de convocatoria. Un uruguayo con la misma semilla ahora pelea contra 80
// donde antes peleaba contra 67.
// 1.26.0: SE UNIFICAN LAS RUTAS DE ARRANQUE. La ruta dejó de ser una elección de
// la pantalla de creación y pasó a ser una rama sorteada, y con eso dejó de fijar
// el CONTEXTO para fijar sólo el NIVEL:
//
//   · todos arrancan a los 18 (antes 18, 19 o 20 según origen y ruta, así que dos
//     partidas no se podían comparar y la ruta amateur perdía dos temporadas de
//     crecimiento justo donde `youthDrive` vale más);
//   · todos arrancan en un club amateur, `employment: 'amateur'`, plantel senior;
//   · la rama sorteada fija la banda de OVR a los 18 y nada más: 45-55 la larga,
//     55-60 la rápida, con la rápida en el 30% de los sorteos.
//
// EL TECHO NO SE MOVIÓ, y es lo que hace que el cambio sea seguro: el sorteo de
// potencial se hace contra el nivel de REFERENCIA del puesto y no contra el OVR de
// arranque, así que subir el arranque no sube el techo. Medido: sorteándolo contra
// el arranque nuevo, el 88,9% de las carreras terminaba con techo ≥80 y el 54,1%
// ≥90, contra el 44,2%/7,1% de 1.25.0. Anclado, el reparto de techos queda igual.
//
// Y el DENOMINADOR de los objetivos de §16 se resuelve solo: el 40% de picos ≥80 se
// medía sobre "desarrollo + profesional", que son exactamente las dos ramas que
// sobreviven. El denominador nuevo (todas las carreras) ES el viejo.
//
// Además, LA OFERTA CUMPLE LO QUE ANUNCIA. `moveToClub` no aplicaba
// `offeredEmployment`: el vínculo lo recalculaba `renewContract` al cierre de la
// temporada siguiente, y ése sube de a un escalón por vez. Un amateur que firmaba
// con Dogos XV —franquicia plenamente profesional— tardaba tres temporadas en ser
// profesional mientras la tarjeta ya le había dicho "contrato profesional". Ahora
// un pase resuelve el contrato de cero contra el club nuevo, y el escalón de a uno
// queda para QUEDARSE, que es lo que `renewContract` documenta. No hizo falta una
// excepción sudamericana: la regla general cubre Dogos, Pampas, Peñarol y Selknam,
// y también la MLR y las franquicias del Pacífico.
// 1.27.0: LA TABLA DE DEBUT BAJA 6 PUNTOS PAREJA, de [63,67,80,84,87,90] a
// [57,61,74,78,81,84]. Se movió cuánta gente llega a una selección y nada más:
// los saltos entre bandas (4, 13, 4, 3, 3) y el abanico de 27 puntos quedan
// idénticos, así que ninguna frontera entre uniones se corrió.
//
// LO QUE NO SE TOCÓ es el umbral de TITULAR, y ahí está la mitad interesante: el
// hueco entre entrar al plantel y ganarse el puesto pasó de 4 a 10 puntos en las
// tres bandas de abajo. Se debuta antes y se pasa más tiempo en el banco.
//
// Tampoco se tocó el `AMATEUR_SURCHARGE`, que es un sobreprecio y no un umbral
// propio: por eso la ruta amateur bajó los mismos 6 y rep 2 pasó de imposible por
// construcción (88 contra un techo medido de 77) a apenas rozable (82).
// 1.28.0: EL ARRANQUE SALE DEL CLUB, Y EL DESTINO SIGUE AL NIVEL.
//
//   · El club inicial vuelve a variar (1.26.0 mandaba a todos al mismo club
//     amateur) y de él sale la banda de OVR a los 18: amateur 45-55 pesada por
//     proyección, semipro/pro 50-55. El techo de arranque baja de 60 a 55.
//   · El que entra a un club pago entra a la ACADEMIA —track `development`,
//     vínculo compensado— y juega su propio campeonato, no una fracción marginal
//     del calendario del plantel senior. Las apariciones de academia pasaron de
//     una mediana de 1 a la banda de 5-9 que el invariante pedía.
//   · Las franquicias regionales entran al pool por VÍA y no por país: Dogos,
//     Pampas, Peñarol y Selknam llevan `countryCode: 'multi'`, así que un filtro
//     por 'ar' devolvía cero y el 97% de los argentinos arrancaba amateur.
//   · `clubIsInterested` deja de perdonar 8 puntos fijos a todos: la tolerancia
//     se cierra con el nivel del club (élite 2, regional 4,4, resto 8). Un club
//     grande puede elegir; uno chico apuesta. Medido, el jugador que pica por
//     debajo de 70 pasó de llegar a una liga top el 23,1% de las veces al 10,9%.
//   · El ÉXITO DEL CLUB entra al desarrollo (`leaguePosition` → `meritDrive`,
//     ±6%): entrenar un año peleando el título forma más que hacerlo en un
//     equipo que terminó último.
//   · `POTENTIAL_MAX` 95 → 99 y la lotería de talento se afina (3% de premiados,
//     premio máximo 26): la cola dejó de estar cortada en seco.
//
// LOS NOMBRES DE RAMA CAMBIARON DE SENTIDO y hay que leerlo antes de tocar nada:
// `development` es ahora la academia de un club pago y `amateur` el plantel
// senior de un club amateur. Hasta 1.27.0 `development` era, literalmente, la
// rama que NO iba a desarrollo. `professional` queda como valor legado de lectura.
// 1.29.0: LAS DECISIONES HABLAN EN CINCO EJES, Y SE VEN LAS POSIBILIDADES.
//
// El jugador elegía entre dos frases y descubría después —leyendo una tabla— si
// le había ido bien. Ahora cada opción muestra sus desenlaces con probabilidad y
// consecuencia en el idioma del deporte: valoración, tiempo de juego, lesión,
// sanción y reputación (`engine/impact.ts`).
//
// Nada de eso es una etiqueta escrita a mano. La valoración de un efecto es el
// OVR que ese efecto mueve DE VERDAD en ese puesto (suma ponderada de los deltas,
// la misma cuenta que `ovrExact`), así que las setenta y una decisiones que ya
// existían hablan el idioma nuevo sin reescribir ninguna, y no hay forma de que
// la tarjeta prometa una cosa y el motor haga otra.
//
// Tres ejes nuevos SÍ necesitaban motor, porque no existían:
//
//   · 🕒 `playingTime` — escalones que multiplican la fracción de fechas del
//     lugar en el plantel (`engine/season-modifiers.ts`). Hasta acá una decisión
//     sólo podía mover minutos de refilón, empujando la forma.
//   · 🚫 `sanction` — tarjetas y suspensiones (`player.sanctions`). Los partidos
//     suspendidos entran por el MISMO camino que una lesión (la disponibilidad de
//     la temporada), así que la planilla queda coherente: cuatro partidos menos
//     son cuatro partidos de tackles menos.
//   · 📋 `statBoost` — el premio material se cobra en cancha y no en dinero. En
//     rugby no hay valor de mercado en euros (CLAUDE.md §5) y una decisión que
//     pagaba plata no tenía dónde anotarla.
//
// Y `decisionLog` guarda `outcomeIndex`: sin él la UI sabe qué texto salió pero
// no cuál de los desenlaces fue, así que no puede revelar qué se movió.
//
// Y ASCIENDEN Y DESCIENDEN LOS CLUBES. Si tu club sale primero en segunda, la
// temporada que viene la jugás en primera; si sale último en primera, en segunda.
// El grafo institucional (`MOVEMENTS` en competitions2026.ts) estaba escrito desde
// el primer día y no lo leía nadie: `engine/promotion.ts` es el consumidor que
// faltaba, así que no hay reglas nuevas, sólo la lectura del dato.
//
// El movimiento vive en `CareerState.divisions` (clubId → competición) y no en el
// catálogo, que es un dato congelado y compartido entre partidas. De la
// competición salen solas la banda deportiva, el modelo económico, las copas y el
// techo de contrato, así que ascender cambia la carrera entera sin una sola regla
// extra — y el club ascendido conserva su rating, o sea que pelea abajo.
//
// El digest se mueve ENTERO en los tres casos, y no por la mecánica: hay quince
// decisiones nuevas en el pool (disciplina, el banco, el capitán lesionado, el
// verano con un ex Puma…), así que el sorteo ponderado elige distinto desde la
// primera temporada. Se verificó por separado, antes de agregar el contenido, que
// la mecánica sola movía SÓLO `stateHash` en los tres casos.
// 1.30.0: LA VENTANA DEL AMATEUR NO CRUZA LA FRONTERA.
//
// Encontrado jugando: a un sudafricano de 18 en un club amateur el mercado le
// ofrecía Paraná Rowing Club, Tucumán Lawn Tennis y Berazategui. Medido sobre 60
// carreras `za`, sus primeras ofertas venían 46 de Argentina, 28 de Francia, 12 de
// Inglaterra y 11 de Sudáfrica: el mercado de un pibe sudafricano era, sobre todo,
// argentino.
//
// NO era un peso mal calibrado, era VOLUMEN. `proximityWeight` multiplica ×2,2 el
// país propio y ×0,5 el resto, pero el catálogo argentino tiene ~200 clubes en los
// escalones bajos: doscientos candidatos a 0,5 le ganan a doce a 2,2 sin que
// ninguna constante esté mal. Por eso el arreglo es una PUERTA y no un número —
// subir el multiplicador tapaba el síntoma hasta que entrara el próximo catálogo
// nacional.
//
// Mientras el vínculo sea amateur o compensado, o el jugador esté en la academia,
// la ventana se queda en su sistema: el país de su club actual y el suyo de origen
// (volver a casa nunca deja de ser una opción). El extranjero se alcanza por VÍA
// DECLARADA, que es la puerta que existe en la realidad — un convenio, una
// academia, una franquicia que scoutea— y que el motor ya modelaba con nivel
// mínimo y tolerancia. Se abre sola al profesionalizarse o al graduar a senior.
//
// Con eso entra el CONVENIO SUDÁFRICA → COBRAS (`za-domestic-to-cobras`): la
// franquicia brasileña se nutre de sudafricanos, así que su oferta sigue llegando,
// pero por su puerta y con su piso de nivel (59, el rating de la franquicia) en vez
// de por el mismo mercado abierto que traía clubes de la Tercera de la URBA.
//
// Medido sobre nueve nacionalidades (za, ar, fr, nz, jp, es, gb-eng, fj, gl):
// CERO ofertas extranjeras de ventana siendo amateur, 100-270 al profesionalizarse,
// y 0 de 25 carreras sin mercado en cada nacionalidad — incluidas Groenlandia y
// Fiyi, que no tienen liga propia en el catálogo y por eso el ancla es el país del
// CLUB y no el pasaporte. Clubes por carrera y temporadas quedan igual.
// 1.31.0: A CADA PAÍS LAS OFERTAS DE SU PAÍS, Y EL POZO DE LA ESCALERA TAPADO.
//
// Dos hallazgos de jugar, y el segundo explica media docena de síntomas viejos.
//
// (1) EL SORTEO ES EN DOS ETAPAS: primero el país, después el club. Pesar clubes no
// controla el reparto —la probabilidad de un país es su peso por su CANTIDAD de
// clubes— así que el mercado lo decidía el tamaño de cada catálogo: un japonés de
// 70 recibía el 14% de ofertas japonesas y el resto de España, Chile, Brasil y las
// doscientas divisiones argentinas. Con el país adelante el reparto es cierto por
// construcción: 64-75% propio para el profesional, 72-100% para el amateur.
//
// Y LAS FRANQUICIAS SON DE SU PAÍS (`affinityCountryOf`): el catálogo marca `multi`
// a los Stormers y a los Crusaders —correcto para su liga, falso para la cercanía—
// así que para un sudafricano firmar en los Stormers contaba como emigrar.
//
// (2) EL ESCALÓN SIGUIENTE DE TU ESCALERA SIEMPRE ES ALCANZABLE. Un japonés con 70
// de media pasó SEIS temporadas en las ligas regionales sin una sola oferta para
// salir, y no era mala suerte: el regional japonés está en el escalón 1 y la D3 en
// el 4, la ventana se mueve ±1, y entre los dos no había puente ni con 90 de media.
// Siete países tenían el mismo pozo entre la base de su pirámide y el escalón de
// arriba (nz 1→6, gb-eng 2→6, fr 2→5, za/jp/it 1→4, us 2→5), así que el que
// arrancaba en el sótano quedaba atrapado de por vida.
//
// Eso además movió la aguja de un invariante que estaba en rojo antes de esta
// tanda: la racha plana de 6+ temporadas bajó de 42-43% a 37% (el corte es 35%). El
// resto es del catálogo nuevo, que puso las bases de las pirámides en banda 1: en
// un entorno así nadie crece, y las bandas no las recalibra el mercado.
// 1.32.0: LA DECISION SE VUELVE UNA APUESTA CON REGLAS.
//
// Cuatro cambios que se leen juntos, los cuatro encontrados jugando:
//
//   1. LA ⭐ VA EN PUNTOS ENTEROS (1 a 4) y el motor APLICA ese entero. Antes la
//      ficha decia "+0,2", que no es un premio sino ruido con forma de premio.
//      `apply-decision` corrige los atributos para que el OVR se mueva exactamente
//      lo prometido: la tarjeta no puede prometer una cosa y el motor hacer otra.
//   2. Y VARIA POR PUESTO. Con redondeo, las tres opciones del foco de pretemporada
//      daban +1 las tres —gimnasio mueve 0,94 en un pilar y 0,50 en un wing, y todo
//      eso redondea a 1— asi que la ⭐ escondia justamente lo que la hace
//      interesante. Con tramos (`STAR_BANDS`), el pilar saca +4 del gimnasio y +1 de
//      la tecnica, y el apertura al reves.
//   3. EL RIESGO PAGA. "Ponerte el equipo al hombro" (60/40) y "jugar para el
//      equipo" (seguro) daban las dos +1: la ruleta no tenia sentido. Ahora el
//      desenlace bueno de una apuesta cobra una PRIMA que sale de cuanta chance
//      habia de que saliera peor —uno o dos puntos— y no de un campo que haya que
//      escribir en cada evento.
//   4. LOS PORCENTAJES DEPENDEN DE TU VALORACION. Una ruleta 60/40 era 60/40 para
//      un jugador de 50 y para uno de 85. Ahora se inclina con el nivel: la misma
//      apuesta se lee 78/22 con 85 de media y 39/61 con 50. Se aplica a los dos
//      lados desde la misma funcion (`outcomeWeights`), asi que el porcentaje que
//      muestra la tarjeta es el que usa el sorteo.
//
// Y EL PISO DEL TECHO: nueve de cada diez carreras llegan a 71 o mas. Medido antes,
// el 47% picaba por debajo —el sorteo de potencial dejaba techos de 51— y una
// carrera asi no es una historia distinta, es una partida que no arranca. Se
// resuelve con un piso y un escape declarado del 10% (`POTENTIAL_FLOOR`), no
// subiendo la media: subirla habria empujado la mediana a ~80 y el reparto entero
// con ella. Medido despues: 7% de los picos por debajo de 71, el >=80 queda en 19%
// (era 17%) y el techo se sigue alcanzando (los trece invariantes de progresion en
// verde).
// 1.33.0: LA CURVA DEL TECHO. El sorteo de potencial dejo de ser una formula con
// piso y paso a ser una tabla de bandas (`CEILING_BANDS`). El piso no era un piso:
// era LA distribucion — el 45,8%% de los jugadores salia con techo exactamente 71,
// diez veces la masa de sus vecinos. De ahi venian las carreras iguales, las
// mesetas largas, los picos que no llegaban a 80 y los tres casos del digest sin
// un solo cap. Ahora 8,3 de cada 10 carreras pican en 80+ y la mitad se queda en
// 80-84, que es la carrera profesional normal.
// 1.34.0: LOS TÍTULOS DE SELECCIÓN, que no existían. `TitleWon` asumía que todo
// campeón es un club (`club: string`) y el motor sólo coronaba clubes, así que una
// carrera con 80 caps cerraba sin un torneo internacional en la vitrina — medido:
// 200 carreras tier 1 y 2, 8.881 caps, 349 títulos y CERO de selección, con los
// diecinueve trofeos del calendario declarados y sin lector. Entra
// `engine/international-results.ts` (campeón determinístico por torneo, re-sembrado
// aparte para que el torneo exista con o sin vos) y `TitleWon` pasa a llevar
// `club`/`union` excluyentes. El Grand Slam y la Triple Corona siguen sin darse:
// dependen del resultado partido a partido, que el motor no simula.
export const ENGINE_VERSION = '1.34.0';

export type CareerPhase = 'setup' | 'season' | 'event' | 'retired';

export interface ClubOffer {
    club: string;
    league: string;
    tier: number;
    role: 'starter' | 'rotation' | 'fringe';
    prestige: number; // 0..100
    wageIndex: number; // 0..100 (fama/plata)
    /** Puerta por la que entró la oferta (ventana / vía profesional / regreso). */
    via: 'window' | 'pathway' | 'homecoming';
    /** Id de la vía cuando `via === 'pathway'`. */
    pathwayId: string | null;
    /** Vínculo económico que ofrece el club. Nunca se muestran cifras. */
    offeredEmployment: EmploymentStatus;
    /** Track ofrecido: desarrollo o senior. */
    offeredTrack: SquadTrack;
    /** Naturaleza del movimiento (pase amateur, contrato pro, invitación…). */
    movementKind: MovementKind;
}

/**
 * Snapshot HISTÓRICO de una temporada. Se congela al jugarla: la trayectoria no
 * puede cambiar porque después cambie un club, una competición o la versión del
 * catálogo. La UI lee esto, no resuelve datos actuales al renderizar.
 */
export interface CareerSeasonEntry {
    season: number;
    age: number;
    clubId: string;
    clubName: string;
    competitionId: string;
    competitionName: string;
    /** Banda del CLUB al que perteneció esa temporada. */
    sportingBand: number;
    /** Banda que DISPUTÓ (con aparición senior). Puede ser menor que la del club. */
    competitiveBand: number;
    economicModel: EconomicModel;
    employment: EmploymentStatus;
    squadTrack: SquadTrack;
    /** Lugar en el plantel de ese tramo, congelado. Ver `SeasonResult.squadRole`. */
    squadRole: SquadRole;
    ovr: number;
    ovrDelta: number;
    appearances: number;
    /** Planilla fija de la temporada: se muestra para todos los puestos. */
    points: number;
    tries: number;
    tackles: number;
    /**
     * La CUARTA ranura de la planilla, ya resuelta y congelada. Se guarda el
     * texto y no la clave porque el apertura no tiene un contador sino un
     * porcentaje: si se guardara solo la clave habría que recalcularlo al
     * renderizar, y una temporada vieja podría mostrar otra cosa.
     */
    secondaryStatLabel: string;
    secondaryStat: string;
    caps: number;
    /** Títulos DEL JUGADOR (club campeón + apariciones senior). */
    titlesWon: TitleWon[];
    /** Títulos DEL CLUB (institucionales) — puede incluir alguno que el jugador no sumó. */
    clubTitlesWon: TitleWon[];
    /** Ledger real de competiciones disputadas esta temporada. */
    participations: SeasonCompetitionParticipation[];
    /** Hubo una lesión grave esta temporada (marcador de trayectoria). */
    severeInjury: boolean;
    /**
     * PREMIOS INDIVIDUALES GANADOS ESTA TEMPORADA.
     *
     * Se guarda —y no se deriva— porque `player.flags` sólo lleva el CONTADOR de
     * carrera: sabe que ganaste dos XV ideales, no en qué temporadas. Sin este
     * campo la UI no puede festejar el premio en el momento en que pasa, que era
     * exactamente el agujero: los tres premios se calculaban bien y aparecían
     * recién en el retiro.
     *
     * No compromete el determinismo: `evaluateSeasonAwards` corre con su propio
     * stream de RNG (`semilla:awards:temporada`), así que persistir su resultado
     * no toca el stream de la carrera.
     */
    awardsWon: SeasonAwardId[];
    milestones: CareerMilestone[];
    /**
     * Resumen de carga NORMALIZADO de la temporada. Se congela para que
     * `previousSeasonLoad` de la próxima no dependa del catálogo mutable.
     */
    normalizedLoad: number;
}

/** Hitos de trayectoria. Se detectan al cerrar la temporada. */
export type CareerMilestone =
    | 'senior-debut'
    | 'first-compensated'
    | 'first-semi-professional'
    | 'first-professional'
    | 'first-elite-competition'
    | 'first-call-up'
    | 'national-squad'
    | 'first-title'
    | 'international-transfer'
    | 'return-home';

export const MILESTONE_LABELS: Readonly<Record<CareerMilestone, string>> = {
    'senior-debut': 'Debut senior',
    'first-compensated': 'Primer acuerdo compensado',
    'first-semi-professional': 'Primer contrato semiprofesional',
    'first-professional': 'Primer contrato profesional',
    'first-elite-competition': 'Primera competición de élite',
    'first-call-up': 'Primera convocatoria',
    'national-squad': 'Entrada al plantel principal',
    'first-title': 'Primer título',
    'international-transfer': 'Transferencia internacional',
    'return-home': 'Regreso a casa',
};

// Snapshot serializable de una partida. `rngState` permite reproducir la carrera
// exactamente (clave para el leaderboard con validación server-side).
export interface CareerState {
    version: string;
    clubCatalogVersion: string; // catálogo congelado al empezar (determinismo)
    seed: number;
    rngState: number;

    /** Ruta elegida al crear el jugador. Se sella: define cómo se juega la carrera. */
    startRoute: StartRouteId;

    /**
     * Ritmo elegido al crear. Se sella igual que `startRoute`, y por el mismo
     * motivo: si se pudiera cambiar a mitad de camino, (semilla + decisiones)
     * dejaría de reproducir la carrera —habría que registrar además cuándo se
     * cambió el ritmo— y esa reproducibilidad es la garantía sobre la que se
     * apoya todo el motor.
     */
    paceMode: PaceModeId;

    player: Player;
    seasons: SeasonResult[];
    phase: CareerPhase;

    pendingEventId: string | null; // evento a decidir antes de simular la temporada
    recentEventIds: string[]; // para penalizar repeticiones cercanas
    offers: ClubOffer[]; // ofertas de club vigentes (oportunidades de mercado)

    // Mercado como FASE EXPLÍCITA: se evalúa cada temporada aunque no siempre
    // surja una decisión. `marketEvaluatedSeason` deja rastro para auditar que el
    // mercado se miró de verdad (no depende de un evento aleatorio).
    marketEvaluatedSeason: number;
    /**
     * Última temporada en la que el jugador SE MOVIÓ de club. El cooldown del
     * mercado se ancla acá (no en "vi una oferta"): rechazar una oferta NO
     * silencia el mercado — solo un pase reciente lo hace.
     */
    lastMoveSeason: number;

    // Última posición final del club en su liga: es lo que habilita (o no) las
    // copas de la temporada siguiente. null = usar la tabla de referencia.
    lastStanding: LeagueStanding | null;

    /** Versión de la tabla de niveles/economía sellada al empezar. */
    competitionLevelsVersion: string;

    /**
     * ASCENSOS Y DESCENSOS DE ESTA CARRERA: clubId → competición en la que juega
     * hoy. Vacío mientras nadie se mueva.
     *
     * Vive en el estado y no en el catálogo porque el catálogo es un dato
     * congelado y compartido (`CLUB_CATALOG_VERSION`): dos partidas leen el mismo
     * módulo en memoria, y un club que ascendió en una carrera no ascendió en la
     * otra. Se resuelve al leer, con `engine/promotion.ts:resolveClub`.
     *
     * NO es derivable de la trayectoria: la posición final de una temporada dice
     * si el club se movió, pero la trayectoria sólo guarda las temporadas que el
     * jugador jugó ahí — si se va del club, el club sigue en la división a la que
     * ascendió y el estado tiene que recordarlo.
     */
    divisions: Record<string, string>;

    /** Carga de la temporada anterior. El SALTO es lo que dispara lesiones. */
    previousSeasonLoad: number;

    /**
     * Trayectoria HISTÓRICA congelada, una entrada por temporada jugada.
     * Es lo que renderiza la consola: no se recalcula desde el catálogo.
     */
    history: CareerSeasonEntry[];

    // Modificadores que una decisión deja para la temporada que se está por jugar.
    pendingTitleBoost: number;
    /**
     * Multiplicador sobre la FRACCIÓN de tests que juega con la selección esta
     * temporada. 1 = sin efecto.
     *
     * Reemplaza a `pendingCapBoost` (1.17.0 y anteriores), que era un segundo
     * camino de código para otorgar caps y se desincronizó del primero: un
     * evento con `minOvr: 66` regalaba caps de los All Blacks sin pasar jamás
     * por la convocatoria. Ahora los caps salen de UN SOLO lugar
     * (`evaluateNationalTeam`) y una decisión sólo puede mover cuánto juega el
     * que ya fue convocado.
     */
    pendingTestShare: number;
    /** Puntos que se le descuentan a la valoración de selección mientras dure. */
    selectionPenalty: number;
    /** Temporadas que le quedan al castigo. 0 = sin castigo. */
    selectionPenaltySeasons: number;
    /**
     * 🕒 Escalones de tiempo de juego que dejó la decisión para la temporada que
     * se está por jugar. 0 = sin efecto. Se apaga al cerrarla: un empujón del
     * técnico dura una temporada, no una carrera.
     */
    pendingPlayingTime: number;
    /**
     * 📋 Lo que la decisión le agrega a la planilla de la temporada. Es lo que
     * reemplaza a la plata (ver `Effect.statBoost`).
     */
    pendingStatBoost: { tries: number; tackles: number };

    /**
     * `outcomeIndex` es el desenlace que salió DENTRO de la opción elegida. Se
     * guarda porque el texto no alcanza para reconstruirlo —dos desenlaces pueden
     * compartir narración— y es lo que permite revelar qué se movió.
     */
    decisionLog: { seasonIndex: number; eventId: string; optionId: string; outcomeIndex: number; text: string }[];
}

// Resumen final agrupado, para la pantalla de resultado compartible.
export interface ClubSpell {
    club: string;
    league: string;
    seasons: number;
    matches: number;
    titles: number;
    tries: number;
}

export interface CareerSummary {
    nickname: string;
    position: Position;
    nationality: string;
    debutAge: number;
    retirementAge: number;
    seasons: number;

    totalMatches: number;
    totalMinutes: number;
    caps: number;
    titles: number;
    peakOvr: number;
    avgRating: number;

    totals: SeasonStats;
    byClub: ClubSpell[];
    honours: string[]; // TORNEOS ganados (con repeticiones colapsadas)
    /**
     * Logros que NO son títulos: capitán de la selección, salón de la fama,
     * campeón del mundo. Van aparte porque no salen de ganar una final y
     * mezclados hacían que el contador de títulos no cerrara con la vitrina.
     */
    distinctions: string[];
    retirementReason: string | null;

    careerScore: number; // puntaje para leaderboard
    finalXI: boolean; // si terminó siendo titular indiscutido de la selección

    /**
     * Titular con el que se cierra la carrera. Es DERIVADO (no se guarda en
     * `CareerState`), así que agregarlo no invalida ninguna partida guardada.
     */
    archetype: CareerArchetype;
}
