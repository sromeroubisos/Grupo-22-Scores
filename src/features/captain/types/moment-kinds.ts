// EL CAPITÁN — el catálogo de Momentos.
//
// Vive en su propio archivo, sin importar nada, porque lo leen tanto los tipos
// como el motor y la pantalla. Cada Momento nuevo agrega su clave acá y su
// definición en `engine/moment-defs/`: el selector no cambia.
//
// ── Los transversales ──
// `tackle` y `bunker` no dependen del puesto: le tocan a cualquiera. El tackle
// causa la mitad de todas las lesiones del rugby, así que es el Momento que
// más se merece ser el hilo común — y encima es el único que se enchufa
// directo con el sistema disciplinario que el motor ya tiene.
//
// ── Por qué el tackle NO va por el contrato ──
// `tackle` y `bunker` se escribieron ANTES de `types/moment-def.ts` y siguen
// resolviéndose por su carril propio en `engine/moments.ts`. No es deuda
// olvidada: migrarlos movería el veredicto del bunker del stream principal del
// rng a la semilla del Setup, y eso corre la carrera entera de cualquiera que
// alguna vez haya hecho un tackle alto. O sea, movería el digest congelado por
// PLOMERÍA y no por diseño — que es exactamente el ruido que la semilla
// derivada existe para evitar.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CUÁNDO SE MIGRAN — decidido, no pendiente de decidir                      │
// │                                                                            │
// │ JUSTO ANTES DEL ÚLTIMO MOMENTO POR PUESTO. Ni ahora ni al final del todo.  │
// │                                                                            │
// │ El motivo es el digest. Migrarlos mueve la tabla congelada una vez, y esa  │
// │ vez el diff es 100% plomería: mismo diseño, otro stream. Si la migración   │
// │ se hace hoy, ese movimiento queda mezclado con los quince movimientos de   │
// │ contenido que vienen después y ya no se puede leer cuál fue cuál. Si se    │
// │ hace al final del todo, es lo mismo al revés.                              │
// │                                                                            │
// │ Puesta justo antes del último, el commit de migración es el único de toda  │
// │ la feature cuyo diff de digest NO se explica por contenido — y se puede    │
// │ revisar solo. Después entra el Momento quince y su movimiento vuelve a ser │
// │ legible.                                                                   │
// └───────────────────────────────────────────────────────────────────────────┘

/**
 * Los SIETE escritos a mano, cada uno con su mecánica propia.
 *
 * Se llaman «legacy» y no es peyorativo: son los mejores minijuegos del juego y
 * los únicos con un verbo que no se repite en ningún otro —esperar el destello,
 * insistir en el scrum, amagar en la banda—. La palabra marca de qué lado del
 * catálogo vive cada uno, no cuál es mejor.
 */
export type LegacyMomentKind = 'tackle' | 'bunker' | 'jackal' | 'ancla' | 'codigo' | 'palos' | 'banda';

/**
 * Un Momento: uno de los siete escritos a mano, o uno de los cincuenta y nueve
 * del catálogo de minijuegos por dorsal.
 *
 * ── Por qué no es una unión de sesenta y cinco literales ──
 * Porque la lista tendría que existir DOS VECES —acá y en `data/minigames/`— y
 * una lista de sesenta y cinco claves escrita dos veces se desincroniza a la
 * tercera semana. Es exactamente la derivada congelada que CLAUDE.md §1.9
 * prohíbe: correcta el día que se escribe, silenciosamente falsa después.
 *
 * ── Y por qué `string & {}` en vez de `string` a secas ──
 * Porque `'tackle' | string` colapsa a `string` y se pierde el autocompletado de
 * los siete que sí son literales. Con `string & {}` TypeScript mantiene las
 * ramas separadas: sigue aceptando cualquier id del catálogo y sigue sugiriendo
 * los siete al escribir.
 *
 * ── Qué se pierde y con qué se reemplaza ──
 * Se pierde la exhaustividad de un `Record<MomentKind, …>`, que es lo que hacía
 * que agregar un kind sin pantalla no compilara. Se reemplaza por algo más
 * fuerte para el catálogo: la pantalla de un minijuego la decide su VERBO, y los
 * siete verbos tienen pantalla, así que un minijuego mudo es imposible por
 * construcción. Para los siete escritos a mano el `Record` exhaustivo sigue
 * existiendo, indexado por `LegacyMomentKind`.
 */
export type MomentKind = LegacyMomentKind | (string & {});

/**
 * Los que NO van por el contrato, y son estos dos y nada más.
 *
 * Existe como TIPO y no solo como comentario por un bicho concreto: un `switch`
 * sobre `MomentKind` con un `default` que resolvía el tackle. Cuando entró La
 * Banda, ese default le mandó una mano de tackle a una corrida —el tipo sabía
 * que faltaba un caso, el runtime no— y la carrera quedó trabada sin que nada
 * fallara con un mensaje. Es el mismo bicho que el borrado de genéricos del
 * registry, y lleva la misma medicina.
 *
 * Con los dos carriles declarados, `isContractKind` estrecha y el `default` de un
 * switch queda en `never`: agregar un pre-contrato sin escribir su caso deja de
 * compilar.
 */
export type PreContractKind = 'tackle' | 'bunker';

export const PRE_CONTRACT_KINDS: readonly PreContractKind[] = ['tackle', 'bunker'];

/** Los que sí van por el contrato. Se deriva: nadie la mantiene a mano. */
export type ContractKind = Exclude<MomentKind, PreContractKind>;

/**
 * Los siete escritos a mano, en ORDEN CANÓNICO y con el bunker adentro.
 *
 * NO es el catálogo entero desde que existen los minijuegos por dorsal: los
 * cincuenta y nueve del catálogo se recorren desde `data/minigames/`. Esta lista
 * sigue siendo la de los siete, y el nombre lo dice.
 *
 * `LEGACY_SELECTABLE` no sirve para recorrerlos todos —el bunker no se sortea— y
 * `Object.keys(MOMENT_LABEL)` está prohibido por §1. Que la lista esté completa
 * lo verifica `moment-contract.test.ts` contra el `Record` de etiquetas, que es
 * el que ya no compila si aparece un kind nuevo.
 */
export const ALL_MOMENT_KINDS: readonly LegacyMomentKind[] = [
    'tackle',
    'bunker',
    'jackal',
    'ancla',
    'codigo',
    'palos',
    'banda',
];

/**
 * Los siete que puede sortear el selector, en ORDEN CANÓNICO.
 *
 * `bunker` no está: no se sortea, se llega a él. A qué familia le toca cada uno
 * tampoco se decide acá sino en su `MomentDef.families` — este archivo no
 * importa nada y no va a empezar ahora.
 *
 * El pool COMPLETO de una temporada lo arma `engine/moments.ts` juntando esto
 * con el catálogo por dorsal. Vive allá y no acá por la misma razón de siempre:
 * este archivo no importa nada, y el catálogo es un import.
 */
export const LEGACY_SELECTABLE: readonly LegacyMomentKind[] = ['tackle', 'jackal', 'ancla', 'codigo', 'palos', 'banda'];

export const MOMENT_LABEL: Record<LegacyMomentKind, string> = {
    tackle: 'El tackle',
    bunker: 'El bunker',
    jackal: 'El jackal',
    ancla: 'El ancla',
    codigo: 'El código',
    palos: 'Los palos',
    banda: 'La banda',
};
