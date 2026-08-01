import type { AttributeKey, Attributes, Player, Position } from '../types/player.ts';
import { getPosition } from '../data/positions.ts';
import { getOrigin, ALL_ORIGINS } from '../data/origins.ts';
import { computeEffectiveOvr, clampAttr, ovrExact } from './scoring.ts';
import { marketValue } from './club-offers.ts';
import { playerRoleAt } from './squad-role.ts';
import type { PaceModeId, StartRouteId } from '../types/career.ts';
import { economicModelOf, type EconomicModel } from '../data/competition-levels2026.ts';
import type { ClubDef } from '../data/clubs.ts';
import { pickInitialClub, startClubChoices, type InitialPlacement } from './market-routes.ts';
import { createEligibility } from './eligibility.ts';
import { countryCodeOfNationality, findCountry } from '../data/nations.ts';
import type { Rng } from './random.ts';
import { rollDevelopmentProfile } from './development-profile.ts';

// El usuario solo elige posición y nacionalidad. El origen (y con él el primer
// club y la edad de debut) los resuelve el motor por debajo, según la seed.
export interface CreatePlayerInput {
    position: Position;
    /** Contrato que usa la UI: código de país del catálogo (ej. 'ar', 'gb-eng'). */
    nationalityCountryCode?: string;
    /** Alternativa por nombre (compatibilidad y tests). */
    nationality?: string;
    origin?: string; // opcional: si no viene, lo elige el motor
    nickname?: string; // opcional: si no viene, lo genera el motor
    /** Apellido libre. Se sanea y se acota; si no viene, queda el apodo. */
    surname?: string;
    number?: number;
    /** Desde dónde arranca. Si no viene, la ruta más dura (y la histórica). */
    startRoute?: StartRouteId;
    /**
     * Club donde arranca, ELEGIDO por el jugador. Si no viene, lo sortea el motor
     * (que es el comportamiento histórico y sigue siendo el default de la UI).
     *
     * Tiene que ser uno de `startClubChoices(país)` — si no lo es, se ignora en
     * silencio y arranca el sorteo: un id inválido llega de una partida vieja o de
     * un token manipulado, y ninguna de las dos cosas puede romper una carrera.
     */
    startClubId?: string;
    /**
     * Cuántas temporadas pasan por decisión. `createPlayer` NO lo usa: no es una
     * propiedad del jugador sino de la partida, y vive en `CareerState`. Viaja
     * en este input porque se elige en la misma pantalla que la posición y la
     * ruta, y así hay una sola puerta de entrada a `createInitialCareer`.
     */
    paceMode?: PaceModeId;
}

/**
 * EDAD DE DEBUT, la misma para todos (1.26.0).
 *
 * Antes salía de `origin.startAge + ageShift` y daba 18, 19 o 20 según el origen
 * sorteado y la ruta elegida. Dos partidas no se podían comparar, y la diferencia
 * no era la decisión de nadie: la ruta amateur perdía dos temporadas de
 * crecimiento justo en la franja donde `youthDrive` vale más.
 */
export const START_AGE = 18;

/**
 * BANDA DE OVR A LOS 18 SEGÚN DÓNDE ARRANCÁS.
 *
 * 1.26.0 la sacaba de la rama sorteada y mandaba a todos al mismo club amateur.
 * Eso dejaba el nivel colgado de una etiqueta abstracta: dos jugadores con el
 * mismo club y el mismo contrato podían diferir trece puntos porque una tabla lo
 * decía. Ahora la banda sale del CLUB donde arrancás, que es lo que un juvenil
 * tiene enfrente de verdad.
 *
 *   · Semipro o profesional (`mixed` / `professional`) → 50-55. Si un plantel
 *     pago te abrió la puerta a los 18 es porque ya rendís cerca de ese nivel.
 *     La banda es angosta a propósito: entrar ahí ya es la señal, y el que entra
 *     con 50 y el que entra con 55 son los dos promesas.
 *   · Amateur → 45-55, y ACÁ LA BANDA ES ANCHA porque el club del barrio no
 *     filtra nada. Adentro pesa la PROYECCIÓN: el mismo sorteo de talento que
 *     alimenta el techo decide dónde caés, así que el que va a llegar lejos
 *     arranca arriba de la banda y no en el medio.
 *
 * El techo bajó de 60 a 55: nadie debuta valiendo lo que un profesional hecho.
 */
const OVR_AT_18_BY_MODEL: Readonly<Record<EconomicModel, readonly [number, number]>> = {
    amateur: [45, 55],
    mixed: [50, 55],
    professional: [50, 55],
};

/** Extremos de la banda de arranque, para los invariantes de los tests. */
export const START_OVR_MIN = 45;
export const START_OVR_MAX = 55;

/**
 * Cuánto del reparto dentro de la banda se lo lleva el TALENTO y cuánto el PUESTO.
 *
 * 0,55 y no 0,7. Con 0,7 el puesto se quedaba con 3 puntos de la banda larga y
 * 1,5 de la corta, y las nueve medianas por puesto colapsaban en dos o tres
 * valores: la diferencia entre un pilar y un wing de 18 —que es una regla del
 * deporte y no un adorno— desaparecía al angostar la escala. Con 0,55 el orden
 * vuelve a leerse y el talento sigue mandando.
 */
const TALENT_WEIGHT = 0.55;

/**
 * Reparto del sorteo de rama: qué fracción arranca por la vía rápida.
 *
 * La rápida es MINORÍA a propósito. El pibe de 18 que ya vale lo que un senior es
 * la excepción del deporte, no el camino normal — y si fuera la mitad, la rama
 * larga dejaría de ser el descubrimiento que hace interesante no elegirla.
 */
export const FAST_BRANCH_SHARE = 0.30;

/**
 * Sortea la rama. Vive acá y no en el reducer porque es una propiedad del
 * jugador que se está creando, pero el resultado se SELLA en `CareerState`: es
 * (semilla + decisiones) lo que tiene que reproducir la carrera, y una rama
 * re-sorteada al recargar sería otra carrera.
 *
 * QUÉ SIGNIFICA AHORA, y OJO CON LOS NOMBRES porque acaban de cambiar de sentido:
 *
 *   · `development` → entrás a la ACADEMIA de un club semipro o profesional.
 *     Track `development`, vínculo compensado, banda 50-55.
 *   · `amateur` → entrás al plantel senior de un club amateur. Track `senior`,
 *     vínculo amateur, banda 45-55 pesada por proyección.
 *
 * Hasta 1.27.0 el sorteo devolvía `professional` / `development` y las dos
 * arrancaban en el mismo club amateur: la etiqueta no describía nada y
 * `development` —que en todo el resto del motor significa academia— era
 * justamente la que NO iba a la academia. Un nombre que dice lo contrario de lo
 * que hace es un bug con fecha, así que se alinean: la rama que se llama
 * desarrollo es la que va a desarrollo.
 *
 * `professional` se conserva como entrada válida por compatibilidad —una partida
 * vieja o un test pueden traerla— y se trata igual que `development`.
 *
 * El país manda por encima del sorteo: si no hay clubes semipro ni profesionales
 * alcanzables desde su escalera, la rama de academia cae a un club amateur y lo
 * declara con `routeDowngraded`. Un checo no entra a una franquicia que no existe.
 */
export function drawStartRoute(rng: Rng): StartRouteId {
    return rng.chance(FAST_BRANCH_SHARE) ? 'development' : 'amateur';
}

/** ¿Esta rama arranca en un plantel pago? Las dos etiquetas no-amateur lo hacen. */
export function isAcademyStart(route: StartRouteId): boolean {
    return route === 'development' || route === 'professional';
}

/**
 * Ensanche del sorteo de techo (1.13.0). Ya no depende de la rama.
 *
 * Era 0 en la ruta amateur y 1 en las otras dos, por honestidad: un amateur con
 * techo 88 tenía un número que no iba a tocar nunca. Con la unificación de 1.26.0
 * la ruta amateur dejó de existir como ruta —es el arranque de todos— así que la
 * única que llevaba 0 desapareció. Queda 1 para todo el mundo, que es exactamente
 * el denominador sobre el que se calibró el 40% de picos ≥80 (docs §16).
 */
const CEILING_LIFT = 1;

const ATTR_KEYS: AttributeKey[] = ['power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina'];

// ── Ventana de REFERENCIA por puesto ─────────────────────────────────────────
//
// Hasta 1.25.0 esta tabla ERA el OVR de arranque. Ya no: el arranque sale de
// `BRANCH_OVR_AT_18`. Lo que sigue siendo es LA ESCALA EN LA QUE ESTÁ CALIBRADO
// EL TECHO — `GROWTH_ROOM` de abajo se midió contra estos números (docs §16), y
// el sorteo de potencial se hace contra ellos y no contra el arranque nuevo.
//
// Es la pieza que hace que subir el arranque a los 18 no suba el techo. Medido:
// sorteando el techo contra el arranque nuevo, el 88,9% de las carreras terminaba
// con techo ≥80 y el 54,1% ≥90, contra el 44,2%/7,1% de 1.25.0. Anclado a esta
// ventana, el reparto de techos queda idéntico.
//
// Conserva además el ORDEN entre puestos (un pilar de 18 está más lejos del nivel
// senior que un wing: el scrum se aprende con años, la velocidad ya está), y de
// ese orden sale `POSITION_TILT`.
export const REFERENCE_OVR_MIN = 34;
export const REFERENCE_OVR_MAX = 46;

const REFERENCE_OVR_WINDOW: Record<Position, [number, number]> = {
    prop: [34, 40],
    lock: [34, 41],
    hooker: [35, 41],
    backrow: [36, 42],
    flyhalf: [37, 44],
    centre: [37, 44],
    scrumhalf: [38, 45],
    fullback: [38, 45],
    wing: [39, 46],
};

/**
 * Dónde cae el puesto DENTRO de la banda de la rama, de 0 (el más lejos del nivel
 * senior) a 1 (el más cerca).
 *
 * Se DERIVA de `REFERENCE_OVR_WINDOW` y no es una tabla nueva: la distancia
 * relativa entre puestos ya está declarada ahí, y escribirla dos veces sería
 * pedir que se contradigan. No hay azar ni iteración con elección acá — se
 * construye una tabla, no se elige un elemento.
 */
const POSITION_TILT: Readonly<Record<Position, number>> = (() => {
    const mid = (p: Position): number => {
        const [lo, hi] = REFERENCE_OVR_WINDOW[p];
        return (lo + hi) / 2;
    };
    const all = (Object.keys(REFERENCE_OVR_WINDOW) as Position[]).map(mid);
    const lowest = Math.min(...all);
    const span = Math.max(...all) - lowest;
    const tilt = {} as Record<Position, number>;
    for (const p of Object.keys(REFERENCE_OVR_WINDOW) as Position[]) {
        tilt[p] = span === 0 ? 0.5 : (mid(p) - lowest) / span;
    }
    return tilt;
})();

// Margen de crecimiento típico hasta el techo. Los puestos que arrancan más
// abajo son los que más recorrido tienen: a los 27 un pilar y un wing valen
// parecido, pero llegaron por caminos distintos.
/**
 * Recorrido de OVR que se le promete al jugador por encima de su nivel inicial.
 *
 * Bajó en 1.9.0 exactamente la `equilibriumHeadroom` de cada puesto. No es un
 * rebalanceo: el objetivo INTERNO de crecimiento sigue valiendo lo mismo que
 * antes (`potential + headroom` = el viejo `potential`), así que los picos
 * logrados quedan donde estaban. Lo que cambió es que el número declarado como
 * techo es ahora el que la carrera alcanza de verdad, en vez de uno 10-15 puntos
 * más alto que nadie tocaba nunca.
 */
/**
 * LA CURVA DEL TECHO, acordada y medida. Es la tabla que decide qué carrera te
 * toca, y está escrita como se lee: de cada 10 partidas, 5 pican en 80-84.
 *
 *   ≤ 74     0,5 de cada 10    la carrera que no llegó
 *   75-79    1                 buen amateur, profesional de liga chica
 *   80-84    5                 EL PROFESIONAL NORMAL — la carrera típica
 *   85-89    2,6               el que destacó de verdad
 *   90-94    0,4               generacional
 *   95-98    0,4               de los mejores del mundo
 *   99+      0,1               una vez cada 125 carreras
 *
 * EL ESCALÓN ENTRE 85-89 Y 90-94 ES A PROPÓSITO: se cae de 2,6 a 0,4. Los 90 son
 * la frontera entre "muy bueno" y "generacional", y si la bajada fuera suave
 * llegar a 90 se sentiría un paso más en vez del momento de la carrera.
 *
 * Y el piso importa tanto como el techo: 8,5 de cada 10 carreras llegan a 80+.
 * El jugador casual toca 81-82 casi siempre, y la mitad se queda ahí — ésa es
 * una buena carrera profesional, no un fracaso. Lo que se corrió no es la
 * dificultad sino el EJE: 80 dejó de ser el logro y pasó a ser el piso; el logro
 * es 85 y la leyenda 90.
 */
const CEILING_BANDS: readonly { from: number; to: number; weight: number }[] = [
    { from: 66, to: 74, weight: 5 },
    { from: 75, to: 79, weight: 10 },
    { from: 80, to: 84, weight: 50 },
    { from: 85, to: 89, weight: 26 },
    { from: 90, to: 94, weight: 4 },
    { from: 95, to: 98, weight: 4.2 },
    { from: 99, to: 99, weight: 0.8 },
];

const GROWTH_ROOM: Record<Position, number> = {
    prop: 32, // 44 − 12
    lock: 33, // 43 − 10
    hooker: 30, // 42 − 12
    backrow: 30, // 41 − 11
    flyhalf: 27, // 39 − 12
    centre: 24, // 39 − 15
    scrumhalf: 24, // 38 − 14
    fullback: 27, // 38 − 11
    wing: 24, // 37 − 13
};

/**
 * RECORRIDO MÍNIMO por encima del arranque. Reemplaza al viejo `POTENTIAL_MIN`.
 *
 * `POTENTIAL_MIN = 44` era un piso ABSOLUTO y con las bandas de 1.26.0 dejó de
 * poder morder: el sorteo más bajo posible contra la ventana de referencia da ~48,
 * así que el 44 se leía como una protección que no protegía nada. El piso que sí
 * hace falta ahora es RELATIVO: el que arranca en 58 puede sacar un techo de 53, y
 * un techo por debajo del arranque no es "no explotó", es una carrera que sólo
 * baja desde los 18 —`growthScaleFor` devuelve 0 con brecha ≤ 0—.
 *
 * Cuatro puntos alcanzan para que exista un tramo de crecimiento antes de la
 * meseta. No más: la promesa que se queda en lo que ya era a los 18 tiene que
 * seguir siendo un desenlace posible.
 */
export const MIN_HEADROOM = 4;
/**
 * 91 → 95 en 1.13.0, 95 → 99 en 1.28.0. Cada vez por el mismo motivo: el techo
 * que no existe no es improbable, es imposible, y una carrera excepcional que no
 * puede ocurrir no es rara — no está.
 *
 * El objetivo declarado del reparto es 4 de cada 10 carreras con pico ≥80, 1 de
 * cada 20 con ≥90 y 1 de cada 55 con ≥99. Medido con el tope en 95, los dos
 * primeros daban 44,3% y 7,3% —cerca— y el tercero daba 0,0%, porque el techo
 * más alto que el motor podía sortear era exactamente 95.
 *
 * SUBIR EL TOPE NO SUBE EL RESTO DEL REPARTO, y es la parte que importa: el
 * sorteo es `referenceOvr + GROWTH_ROOM × roomFactor + gifted`, y el tope sólo
 * recorta la cola. Lo que cambia es que la cola deje de estar cortada en seco.
 * El 99 sigue necesitando la lotería de talento (4,5%) cayendo cerca de su punta.
 */
export const POTENTIAL_MAX = 99;

/**
 * SORTEO DE TECHO, en dos partes.
 *
 * `ROOM_FACTOR` es el reparto ordinario y `GIFTED_*` es la LOTERÍA: una minoría
 * nace con margen extra. La distinción importa — la estrella tiene que ser rara
 * por sorteo, no por moler. Nadie se gana el techo jugando bien; se gana llegar
 * a él, que es lo que la curva de crecimiento ya modela y acá no se toca.
 *
 * Antes de 1.13.0 el reparto era N(1, 0.22) sin lotería y con tope 1.35, y el
 * resultado medido era que el 97-100% de las carreras que no llegaban a OVR 80
 * se quedaban POR TECHO: nacían sin margen para llegar. La curva estaba sana
 * (brecha media techo−pico de 0,4 puntos), así que la palanca nunca fue cuán
 * rápido crece la gente sino cuánta puede llegar.
 *
 * Calibrado midiendo: ver docs/career-engine.md §16.
 */
const ROOM_BASE = { mean: 1.0, sd: 0.22, min: 0.45, max: 1.35 } as const;
/**
 * Cuánto se corre el reparto ordinario hacia arriba.
 *
 * **0,38 → 0,18.** El objetivo declarado hasta acá era 4 de cada 10 carreras con
 * pico ≥80, y el motor lo cumplía (medido: 39,5% sobre 2160 carreras). El problema
 * es el objetivo, no el cumplimiento: si cuatro de cada diez llegan a 80, llegar a
 * 80 no es una carrera excepcional, es la carrera esperable — y el jugador que
 * mira su primera decena de partidas ve más de la mitad arriba de 80.
 *
 * El objetivo nuevo es **1,5 de cada 10 con pico ≥80**. Se mueve SOLO el reparto
 * ordinario: la lotería de talento (`GIFTED_*`) queda intacta a propósito, así el
 * crack de 90+ sigue existiendo y sigue saliendo de donde tiene que salir —el
 * sorteo, no la acumulación—. Bajar la lotería con el reparto habría hecho las dos
 * cosas a la vez: el 80 raro Y el 90 imposible.
 *
 * Se calibró midiendo el techo sorteado y después el pico real de carreras
 * completas; ver docs/career-engine.md §24.
 */
const ROOM_LIFT = { mean: 0.12, sd: 0.05, max: 0.33 } as const;
/**
 * LA LOTERÍA DE TALENTO, que es lo único que produce al jugador de 99.
 *
 * `GIFTED_MAX` 14 → 22 en 1.28.0. Con 14, subir `POTENTIAL_MAX` a 99 no alcanzaba
 * para nada: la ventana de referencia de un puesto ronda 40 y `GROWTH_ROOM` suma
 * unos 30, así que el techo típico cae cerca de 78 y el premio máximo lo dejaba en
 * 92. Medido, el 0,3% de los techos llegaba a 99 y NINGUNA carrera lo alcanzaba.
 * El tope existía y la cola seguía cortada, sólo que un poco más arriba.
 *
 * `GIFTED_SHARE` NO se toca. La cantidad de premiados es la que define cuántos
 * llegan a 90 —hoy 7,6% contra un objetivo de 5%, o sea que ya sobra gente arriba—
 * y subirla movería ese número en la dirección equivocada. Lo que faltaba no era
 * más premiados sino que el premio grande fuera más grande: el reparto del premio
 * es `(1 − tiro/SHARE)`, así que sólo la punta de la punta se lleva los 22 puntos.
 *
 * O sea: mismo 4,5% de tocados por la varita, y adentro de ese grupo una cola que
 * ahora llega hasta el jugador que nace mejor que cualquier plantel del catálogo.
 */
/**
 * PISO DEL TECHO: nueve de cada diez carreras llegan a 71 o más.
 *
 * Medido antes de esto: el 47% de las carreras picaba por debajo de 71, porque el
 * techo salía de `referenceOvr + GROWTH_ROOM × roomFactor` y la cola baja del
 * sorteo (roomFactor 0,45) dejaba techos de 51. Una carrera así no es una historia
 * distinta, es una partida que no arranca: el jugador pasa veinte temporadas en el
 * sótano de su pirámide sin nada que perseguir.
 *
 * Se resuelve con un PISO y un escape declarado, y no subiendo la media del sorteo,
 * a propósito: subir la media para que el percentil 10 quedara en 71 habría empujado
 * la mediana a ~80 y el reparto entero con ella. El piso hace exactamente lo que
 * dice —saca la cola inútil— y deja el resto de la distribución como estaba.
 *
 * EL ESCAPE ES EL 10% y existe porque una carrera que no llega también es una
 * historia del deporte: el que se queda en el club del barrio, juega quince
 * temporadas y cuelga los botines sin haber pasado de la Primera B. Sin escape el
 * juego perdería ese final, que es el más común en la realidad.
 *
 * El tiro se hace SIEMPRE, gane o pierda, por la misma disciplina que la lotería de
 * talento: si sólo se tirara cuando hace falta, el stream del rng dependería del
 * resultado del sorteo anterior y dos carreras con la misma semilla se
 * desalinearían.
 */
export const POTENTIAL_FLOOR = 71;
export const FLOOR_ESCAPE_SHARE = 0.10;

const GIFTED_SHARE = 0.030; // 3% saca algo en la lotería
const GIFTED_MIN = 5;
const GIFTED_MAX = 26;

// Pool de apodos internos (el usuario no elige apodo; el motor asigna uno).
const NICKNAME_POOL = [
    'Mateo', 'Tomás', 'Lucas', 'Benjamín', 'Santino', 'Joaquín', 'Bautista', 'Thiago',
    'Valentín', 'Ramiro', 'Facundo', 'Ignacio', 'Gael', 'Lautaro', 'Dante', 'Bruno',
];

function generateNickname(rng: Rng): string {
    return rng.pick(NICKNAME_POOL);
}

/** Largo máximo del apellido. Más que esto no entra en la cabecera ni en el póster. */
export const SURNAME_MAX = 15;

/**
 * Sanea el apellido que escribe el usuario. Entra texto libre, así que no se
 * guarda crudo: React escapa al renderizar, pero este valor termina también en
 * `localStorage` y —más adelante— en la tarjeta compartible, donde se dibuja en
 * un canvas sin ningún escapado de por medio.
 *
 * Se quitan los caracteres de control y los de formato bidireccional (que pueden
 * dar vuelta el texto que los rodea), se colapsan los espacios y se corta a 15.
 * Devuelve '' si no queda nada usable: el llamador decide el reemplazo.
 */
export function sanitizeSurname(raw: string): string {
    return [...raw.normalize('NFC')]
        .filter((ch) => {
            const code = ch.codePointAt(0) ?? 0;
            if (code < 0x20 || code === 0x7f) return false; // control
            if (code >= 0x200b && code <= 0x200f) return false; // zero-width / marcas RTL
            if (code >= 0x202a && code <= 0x202e) return false; // overrides bidi
            if (code >= 0x2066 && code <= 0x2069) return false; // aislantes bidi
            return true;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, SURNAME_MAX);
}

/** Número canónico del puesto: el primero de su lista (10 apertura, 2 hooker…). */
export function defaultNumberFor(position: Position): number {
    return getPosition(position).numbers[0];
}

/**
 * Lleva el OVR del prospecto EXACTAMENTE al objetivo desplazando por igual los
 * atributos que puntúan en esa posición. Como esos pesos suman 100, el OVR se
 * mueve lo mismo que el desplazamiento. Los atributos de peso 0 (la patada de
 * un pilar) quedan intactos: no tiene sentido hundirlos.
 * Conserva el PERFIL de la posición: el wing sigue siendo el más rápido.
 */
function shiftToTargetOvr(attributes: Attributes, position: Position, targetOvr: number): void {
    const weights = getPosition(position).weights;
    const shift = targetOvr - ovrExact(attributes, position);
    for (const key of ATTR_KEYS) {
        if (weights[key] > 0) attributes[key] = clampAttr(attributes[key] + shift);
    }
}

/** Código de país de la nacionalidad, con la MISMA precedencia que usa el jugador. */
function nationalityCountryCodeOf(fromCode: { code: string } | null, nationality: string): string | null {
    return fromCode?.code ?? countryCodeOfNationality(nationality);
}

/**
 * El club elegido, si es una opción válida para esa nacionalidad. Se valida
 * contra la misma lista que ve la pantalla: el motor no confía en el id que le
 * llega, porque puede venir de un guardado viejo o de un token editado a mano.
 */
function resolveChosenStartClub(clubId: string | undefined, countryCode: string | null): ClubDef | null {
    if (clubId === undefined || countryCode === null) return null;
    return startClubChoices(countryCode).find((c) => c.id === clubId) ?? null;
}

export function createPlayer(input: CreatePlayerInput, rng: Rng): Player {
    const pos = getPosition(input.position);
    // La rama la SORTEA el reducer y llega sellada (ver `drawStartRoute`). El
    // default es la rama larga y no un sorteo local: `createPlayer` no puede
    // consumir rng por su cuenta para esto sin desalinear el stream de una
    // carrera reproducida desde el token compartible.
    const startRoute: StartRouteId = input.startRoute ?? 'amateur';
    // Origen automático por seed cuando no se especifica (flujo simplificado).
    const origin = getOrigin(input.origin ?? rng.pick(ALL_ORIGINS));

    // La UI manda el CÓDIGO; el nombre queda para mostrar y para compatibilidad.
    // Se resuelve ACÁ ARRIBA, antes que nada, porque el club inicial depende del
    // país y el nivel del jugador depende del club. Ninguna de las dos líneas
    // consume rng, así que subirlas no corre el stream.
    const fromCode = input.nationalityCountryCode ? findCountry(input.nationalityCountryCode) : null;
    const nationality = fromCode?.nameEs ?? input.nationality ?? origin.defaultNationality;

    // PRIMER CLUB ANTES QUE EL NIVEL, y ese orden es el cambio de fondo.
    //
    // Hasta 1.27.0 el nivel salía de una tabla y el club se elegía después, así
    // que el club no podía decir nada sobre el jugador. Ahora la rama decide dónde
    // arrancás —club amateur o plantel semipro/pro— y de ahí sale con cuánto: es
    // el club el que filtra, como en el deporte.
    //
    // Nunca un sorteo global por tier (así no aparece un argentino de 18 debutando
    // en Wellington porque cayó ese tier): el rng elige el club concreto dentro
    // del universo de su país, que es lo que hace que dos carreras del mismo país
    // no sean la misma carrera.
    const drawn = pickInitialClub(nationality, origin.id, origin.startTier, rng, isAcademyStart(startRoute));

    // EL CLUB ELEGIDO PISA AL SORTEADO, PERO EL SORTEO SE HACE IGUAL.
    //
    // `pickInitialClub` consume RNG (la ruta y el club), así que saltearlo cuando
    // hay elección correría el stream y dos carreras con la misma semilla —una
    // eligiendo club y otra no— dejarían de ser comparables. Es la misma
    // disciplina que `drawStartRoute` en el reducer: se tira siempre y se usa lo
    // que corresponda.
    //
    // Y la elección GANA sobre la rama sorteada: si el motor había sacado
    // academia y el jugador eligió un club amateur, arranca amateur en el club que
    // eligió. `routeDowngraded` queda en false a propósito — esa marca significa
    // "tu país no tenía un club de ese nivel", que es una limitación del catálogo,
    // y acá no hubo tal cosa sino una decisión.
    const elegido = resolveChosenStartClub(input.startClubId, nationalityCountryCodeOf(fromCode, nationality));
    const placement: InitialPlacement = elegido === null ? drawn : {
        club: elegido,
        entryMode: 'domestic-senior',
        resolvedModel: economicModelOf(elegido),
        routeDowngraded: false,
    };
    const club = placement.club;

    // Atributos = base de posición + sesgo de origen + ruido de "prospecto".
    // Definen el PERFIL; el NIVEL lo fija después la normalización a la banda.
    const attributes = {} as Attributes;
    for (const key of ATTR_KEYS) {
        const base = pos.base[key];
        const mod = origin.attributeMods[key] ?? 0;
        attributes[key] = clampAttr(base + mod + rng.float(-3, 3));
    }

    // Talento juvenil: una sola tirada, que alimenta las DOS cosas de abajo.
    const talent = rng.normal(0.5, 0.18, 0, 1);

    // NIVEL A LOS 18: la banda del MODELO ECONÓMICO DEL CLUB donde arrancás, no
    // la de la rama. Se lee de `resolvedModel` y no de la intención de la rama, y
    // esa distinción importa: al checo que sacó la rama corta y no tiene ninguna
    // franquicia a la que entrar le corresponde la banda amateur, porque arrancó
    // en un club amateur. La etiqueta no puede prometer un nivel que el club no
    // sostiene.
    //
    // Dentro de la banda pesan el talento (0,55) y el puesto (0,45), así que un
    // wing sigue arrancando por encima de un pilar sin que el puesto le gane al
    // talento. En la banda amateur —que es la ancha— ese talento ES la proyección:
    // es la misma tirada que alimenta el techo unas líneas más abajo.
    const [bandLo, bandHi] = OVR_AT_18_BY_MODEL[placement.resolvedModel];
    const mix = TALENT_WEIGHT * talent + (1 - TALENT_WEIGHT) * POSITION_TILT[input.position];
    const targetOvr = Math.max(
        START_OVR_MIN,
        Math.min(START_OVR_MAX, Math.round(bandLo + (bandHi - bandLo) * mix)),
    );
    shiftToTargetOvr(attributes, input.position, targetOvr);

    // NIVEL DE REFERENCIA del puesto: la escala vieja, en la que está calibrado
    // `GROWTH_ROOM`. El techo se sortea contra esto y NO contra `targetOvr`, que es
    // lo único que impide que subir el arranque suba el techo con él.
    const [refLo, refHi] = REFERENCE_OVR_WINDOW[input.position];
    const referenceOvr = refLo + (refHi - refLo) * talent;

    // Potencial OCULTO: techo alcanzable. Correlaciona con el talento juvenil
    // pero no lo determina — un tardío puede explotar y una promesa quedarse.
    const lift = CEILING_LIFT;
    const roomFactor = rng.normal(
        ROOM_BASE.mean + ROOM_LIFT.mean * lift,
        ROOM_BASE.sd + ROOM_LIFT.sd * lift,
        ROOM_BASE.min,
        ROOM_BASE.max + ROOM_LIFT.max * lift,
    );

    // EL TECHO SALE DE UNA TABLA, no de una fórmula.
    //
    // Acá vivía `referenceOvr + GROWTH_ROOM × roomFactor + gifted`, con un piso
    // (`POTENTIAL_FLOOR`) aplicado encima. Y el piso no era un piso: era LA
    // distribución. Medido sobre 1.500 carreras, 687 jugadores —el 45,8%— salían
    // con techo EXACTAMENTE 71, contra 55-77 jugadores en cada valor vecino. Un
    // sorteo sano no puede tener un valor con diez veces la masa de sus vecinos:
    // eso es un clamp, no un dado.
    //
    // La consecuencia se veía en todo el juego y no parecía tener que ver: casi
    // la mitad de las carreras se sentían iguales, nadie llegaba a las ligas
    // grandes, las mesetas largas disparaban los tests de progresión y los tres
    // casos del digest terminaban sin un solo cap. Era el mismo número.
    //
    // Ahora el techo se sortea de la tabla de abajo, que ES la curva acordada:
    // se lee, se compara con la medición y se cambia en un solo lugar. El motor
    // de crecimiento no se toca — está bien, y la prueba es que la brecha mediana
    // entre techo y pico logrado ya era 0,0.
    const banda = rng.weighted(CEILING_BANDS, (b) => b.weight);
    const sorteado = Math.round(rng.float(banda.from, banda.to));
    // El techo nunca puede quedar por debajo del arranque: el jugador tiene que
    // tener margen para crecer aunque le toque la banda más baja.
    const potential = Math.max(
        targetOvr + MIN_HEADROOM,
        Math.min(POTENTIAL_MAX, sorteado),
    );
    void lift;
    void roomFactor;
    void referenceOvr;

    // El número POR DEFECTO es el canónico del puesto (10 apertura, 2 hooker,
    // 15 fullback), no uno sorteado: la camiseta de un puesto no es azarosa.
    // Para los puestos que comparten varios números (pilar 1/3, segunda 4/5,
    // tercera 6/7/8, centro 12/13, wing 11/14) el jugador puede elegir otro.
    const number = input.number !== undefined && pos.numbers.includes(input.number)
        ? input.number
        : defaultNumberFor(input.position);

    // La UI solo pregunta nacionalidad: el país de nacimiento sale de ahí
    // (8.1(a)) y NO se inventa ascendencia. Una nacionalidad que el motor no
    // modela sigue siendo identidad válida, pero no genera selección ficticia.
    const nationalityCountryCode = fromCode?.code ?? countryCodeOfNationality(nationality);

    // Las dos tiradas del rng se sacan ACÁ y en este orden, no dentro del objeto
    // literal: el orden de evaluación de las propiedades es el del código y
    // dejarlo implícito hace que reordenar campos cambie la carrera entera.
    const nickname = input.nickname ?? generateNickname(rng);
    const developmentProfile = rollDevelopmentProfile(input.position, rng);

    const player: Player = {
        nickname,
        // Si no eligió apellido (o escribió solo basura), se usa el apodo que ya
        // genera el motor: el jugador siempre tiene con qué ser nombrado.
        surname: sanitizeSurname(input.surname ?? '') || nickname,
        position: input.position,
        number,
        nationality,
        origin: origin.id,
        developmentProfile,

        age: START_AGE,
        club: club.id,
        league: club.league,
        role: 'fringe',
        nationalTeam: null,
        nationalStatus: 'uncapped',

        eligibility: createEligibility(nationalityCountryCode),

        // VÍNCULO Y TRACK SALEN DEL CLUB, no de una constante.
        //
        // 1.26.0 los había fijado en amateur/senior para todos, porque todos
        // arrancaban en el mismo club amateur. Con el club variable eso se volvió
        // mentira: un pibe que entra a una franquicia profesional a los 18 no es
        // un senior amateur, es un juvenil de academia con un acuerdo compensado.
        //
        // ES LA ACADEMIA Y NO EL PLANTEL SENIOR, y no es un detalle de etiqueta:
        // el track `development` es lo que hace que juegue pocos partidos de
        // primera mientras se forma. Meterlo como senior lo ponía a competir por
        // el puesto con profesionales hechos desde el día uno.
        employment: placement.resolvedModel === 'amateur' ? 'amateur' : 'amateur-compensated',
        squadTrack: placement.resolvedModel === 'amateur' ? 'senior' : 'development',
        entryMode: placement.entryMode,
        startRouteModel: placement.resolvedModel,
        routeDowngraded: placement.routeDowngraded,
        competitiveBandReached: 0,
        milestonesReached: [],

        attributes,
        potential,
        dynamics: {
            morale: origin.moraleStart,
            form: 50,
            fatigue: 8,
            fame: origin.fameStart,
            injuryRisk: 12,
        },

        caps: 0,
        nationalStats: {},
        titles: 0,
        seasonsPlayed: 0,
        injuries: [],
        sanctions: [],
        usedEventIds: [],
        flags: { ...(origin.flags ?? {}) },
        retired: false,
        retirementReason: null,
    };

    // Rol inicial por la MISMA resta que el resto del motor: valor DEPORTIVO
    // contra el rating del club. Ver la cabecera de `squad-role.ts`.
    const effective = computeEffectiveOvr(player);
    player.role = playerRoleAt(effective, club.rating);

    // EL ESCALAFÓN ARRANCA DONDE ARRANCA EL CLUB, y esto es lo que 1.28.0 vino a
    // arreglar. Acá había un `player.employment = 'amateur'` y un
    // `player.squadTrack = 'senior'` fijos que pisaban lo que el objeto ya había
    // resuelto: con el club variable, esas dos líneas metían al pibe que entró a
    // una franquicia profesional en el plantel senior, amateur, a pelearle el
    // puesto a profesionales hechos desde el primer día.
    //
    // Nadie debuta a los 18 con contrato FULL-TIME, y eso se sigue respetando: el
    // techo del que entra a un club pago es `amateur-compensated`, que es el
    // escalón del juvenil de academia.
    const enClubPago = placement.resolvedModel !== 'amateur';
    player.employment = enClubPago ? 'amateur-compensated' : 'amateur';
    player.squadTrack = enClubPago ? 'development' : 'senior';

    // Un migrante a una liga cuyo piso ya es profesional entra por academia:
    // no debuta como senior full-time (regla de países sin liga propia).
    if (placement.entryMode === 'external-development') {
        player.squadTrack = 'development';
    }
    player.entryMode = placement.entryMode;
    player.startRouteModel = placement.resolvedModel;
    player.routeDowngraded = placement.routeDowngraded;

    return player;
}
