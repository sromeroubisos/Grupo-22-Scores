// EL CAPITÁN — la tienda. Prefijos `cue-`, `car-`, `tem-`, `clu-`, `vid-`.
//
// Veinte cosas para comprar con la plata del contrato, y una sola regla de
// reparto que las ordena a todas:
//
//   LO BARATO TE DA PUNTOS. LO CARO TE SUBE EL TECHO.
//   Los puntos se los come la edad; el techo no.
//
// De ahí sale la estrategia entera del sistema: el techo primero, los puntos
// después. Comprar puntos estando en el techo no hace nada —`engine/shop.ts` los
// recorta, no los regala— y la pantalla lo dice antes de cobrar.
//
// ── Las tres cosas que este archivo NO decide ───────────────────────────────
// Es DATO y nada más, igual que `data/events/` y `data/trainings.ts`. Quién
// puede comprar, cuánto entra de verdad después del techo y qué pasa cuando un
// consumible vence viven en `engine/shop.ts`. Acá solo está QUÉ HAY.
//
// ── Por qué el aguante es el más barato de subir ────────────────────────────
// Porque no entra en la media de ninguna familia (`data/positions.ts` lo deja
// afuera por construcción), así que las compras de cuerpo NO inflan el OVR: te
// dan AÑOS. Esa separación es la que evita que la tienda se convierta en una
// fábrica de media — y es también la razón de que el aguante necesite un tope
// propio, porque es el único atributo que ningún techo de media acota. El tope
// vive en `engine/shop.ts` (`SHOP_AGUANTE_CAP`) y el gimnasio lo levanta.
//
// ── Y por qué el mismo precio vale distinto según el puesto ─────────────────
// Un apertura pondera Pegada 30 / Visión 30 / Tackle 15 / Liderazgo 25, así que
// la clínica de contacto (+3 Tackle) le mueve 0,45 de media; a un ala le mueve
// el triple. NINGÚN ÍTEM ES EL MEJOR PARA LOS QUINCE PUESTOS, y con los pesos
// que ya declara el catálogo eso pasa solo, sin una tabla por familia.

import type { BelongingTierId } from '../types/currencies.ts';
import type { CaptainAttributeKey, PositionFamilyId } from '../types/player.ts';
import { getFamily, mainAttributeOf } from './positions.ts';

/**
 * Versión del catálogo de la tienda. Se sella en el guardado APARTE del motor,
 * por el mismo motivo que los minijuegos y el calendario internacional: esto es
 * catálogo, no lógica.
 *
 * Cambiar un precio o el efecto de un ítem no toca una línea de motor, pero
 * cambia qué compró una partida en curso y con qué atributos la sigue jugando —
 * o sea, la invalida igual que un cambio de reglas. Metido adentro de
 * `CAPTAIN_ENGINE_VERSION` habría que subir la versión del motor cada vez que se
 * corrige un texto.
 */
export const CAPTAIN_SHOP_VERSION = '2026-08.2';

// ═══════════════════════════════════════════════════════════════════════════
//  LOS TIPOS
// ═══════════════════════════════════════════════════════════════════════════

/** Las cinco góndolas. El orden es el de la pantalla. */
export type ShopCategory = 'cuerpo' | 'carrera' | 'temporada' | 'club' | 'vida';

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['cuerpo', 'carrera', 'temporada', 'club', 'vida'];

export const SHOP_CATEGORY_LABEL: Record<ShopCategory, string> = {
    cuerpo: 'El cuerpo',
    carrera: 'La carrera',
    temporada: 'La temporada',
    club: 'El club',
    vida: 'La vida',
};

export const SHOP_CATEGORY_HINT: Record<ShopCategory, string> = {
    cuerpo: 'Lo que te mantiene entero. El aguante no entra en la media: te da años, no media.',
    carrera: 'Lo que mueve el techo. Caro, y es lo único que la edad no se come.',
    temporada: 'Dura dos temporadas y se apaga solo. Barato, y hay que volver a comprarlo.',
    club: 'Se lo ponés al club y el club se acuerda. También suma Pertenencia.',
    vida: 'Fuera de la cancha. Se nota adentro igual.',
};

/**
 * A QUÉ ATRIBUTO LE PEGA UN ÍTEM.
 *
 * Los tres targets dinámicos existen para que un ítem no tenga que escribirse
 * ocho veces, una por familia:
 *
 *   `principal` — el atributo de MAYOR PESO de tu puesto. Pegada para el 10,
 *                 Tackle para el 7, Empuje para el 1.
 *   `grupo`     — Pegada si sos back, Tackle si sos forward.
 *   `elegido`   — lo elegís vos al comprar. La pantalla ofrece los cuatro de tu
 *                 familia más el aguante, que son los cinco que la ficha muestra.
 *
 * Se resuelven en `engine/shop.ts` y NUNCA por posición en una lista: el
 * principal se pide por identidad —el de mayor peso— y no por índice (CLAUDE de
 * captain §1.5).
 */
export type ShopTarget = CaptainAttributeKey | 'principal' | 'grupo' | 'elegido';

export interface ShopEffect {
    target: ShopTarget;
    points: number;
}

/** De qué se banca un atributo mientras tengas el ítem. */
export type ShopHarm = 'cuerpo' | 'lesion' | 'golpe';

export const SHOP_HARM_LABEL: Record<ShopHarm, string> = {
    cuerpo: 'el cuerpo castigado',
    lesion: 'las lesiones',
    golpe: 'los golpes de cabeza',
};

/**
 * Las reglas que no se pueden escribir con datos.
 *
 * Son TRES y no una lista abierta a propósito: cada una tiene un enganche
 * concreto en el motor y el `switch` que las lee recibe `never` en el default,
 * así que agregar una cuarta sin engancharla no compila.
 */
export type ShopRuleId =
    /** El representante: te llega una oferta más, y de clubes más grandes. */
    | 'representante'
    /** La casa: nunca caés al peor lugar del plantel. */
    | 'piso-de-forma'
    /** El cirujano: devuelve lo que te sacaron las lesiones. */
    | 'cirugia';

export interface ShopRequirement {
    /** Haber pasado por una lesión grave. Sin eso no hay rodilla que operar. */
    injured?: boolean;
    /** Escalón mínimo de Pertenencia con el club donde estás parado. */
    belongingTier?: BelongingTierId;
}

export interface ShopItem {
    id: string;
    category: ShopCategory;
    labelEs: string;
    /**
     * En dólares, y la escala de referencia es la de `salaryFor`.
     *
     * OJO: los precios de este catálogo se escribieron contra la tabla de
     * sueldos anterior a la 0.25.0 —la que pagaba por club y no por jugador— y
     * todavía no se recalibraron. El rojo marcado `ALARMA-VIVA` en
     * `engine/__tests__/shop.test.ts` es el que mide cuánto falta.
     */
    price: number;
    /**
     * Lo que hace, en el idioma del jugador.
     *
     * Cuenta LO QUE LOS DATOS NO PUEDEN CONTAR —la regla, el color, el costo— y
     * nunca repite los puntos ni el techo: esos los dibuja la pantalla leyendo
     * `gain`, `ceiling`, `belonging` y `fame`, así que no pueden mentir. Es la
     * misma disciplina que `costLabel` en la carta de pretemporada.
     */
    hint: string;
    /** Puntos de atributo. Si el ítem tiene `seasons`, se devuelven al vencer. */
    gain?: readonly ShopEffect[];
    /**
     * Cuántas temporadas dura el efecto. Ausente = para siempre.
     *
     * Los consumibles NO llevan techo ni regla: lo que se apaga tiene que ser
     * solo puntos, o el día que venza habría que desarmar media carrera.
     */
    seasons?: number;
    /** Lo que le levanta al techo. Siempre permanente, aunque el ítem no lo sea. */
    ceiling?: readonly ShopEffect[];
    /** Pertenencia con el club donde estás. Tope conjunto en `SHOP_BELONGING_CAP`. */
    belonging?: number;
    fame?: number;
    /**
     * CUÁNTO DESGASTE TE SACA CADA PRETEMPORADA, sumado al descanso de todos.
     *
     * Es el canal que faltaba, y su ausencia era el agujero más grande del
     * catálogo: la góndola se llama «El cuerpo», cuesta hasta 410k, y hasta la
     * 0.29.0 no había un solo ítem que tocara `damage.cuerpo` — compraban
     * inmunidades de atributo y corrimientos de pico, o sea que ninguno movía el
     * reloj que de verdad termina la carrera. Un jugador podía gastar la góndola
     * entera y retirarse el mismo año.
     *
     * Va en puntos de desgaste por temporada, contra un descanso base de
     * `BODY_REST_BASE`. Se suma en `simulate-season.ts` y por eso el ítem no
     * necesita saber cuántos partidos jugaste: el desgaste ya lo sabe.
     */
    recovery?: number;
    /** Años que le corre el declive a un atributo. */
    peakShift?: readonly { attr: CaptainAttributeKey; years: number }[];
    immune?: readonly { to: ShopHarm; attr: CaptainAttributeKey }[];
    rule?: ShopRuleId;
    requires?: ShopRequirement;
    /** Se puede volver a comprar. Hoy solo hay una forma: una por temporada. */
    repeat?: 'por-temporada';
}

// ═══════════════════════════════════════════════════════════════════════════
//  EL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LOS VEINTE. El orden dentro de cada góndola es el de la pantalla, y va de lo
 * más barato a lo más caro salvo donde el relato pide otra cosa.
 */
export const SHOP_ITEMS: readonly ShopItem[] = [
    // ── El cuerpo ───────────────────────────────────────────────────────────
    {
        id: 'cue-nutricion',
        category: 'cuerpo',
        labelEs: 'Cocina y nutrición',
        price: 130_000,
        hint: 'Alguien te cocina lo que tenés que comer. El cuerpo castigado deja de bajarte la Pegada.',
        gain: [{ target: 'aguante', points: 2 }],
        immune: [{ to: 'cuerpo', attr: 'pegada' }],
    },
    {
        id: 'cue-neuro',
        category: 'cuerpo',
        labelEs: 'Seguimiento neurológico',
        price: 190_000,
        hint: 'Un neurólogo te sigue cada golpe. Los HIA dejan de comerte la Visión — la cuenta de la cabeza sigue subiendo igual, eso no lo arregla nadie.',
        immune: [{ to: 'golpe', attr: 'vision' }],
    },
    {
        id: 'cue-kinesiologo',
        category: 'cuerpo',
        labelEs: 'Kinesiólogo propio',
        price: 220_000,
        hint: 'Tuyo, no del club: te atiende a vos los doce meses. Llegás a cada pretemporada con menos encima, y las lesiones dejan de restarte Aguante.',
        gain: [{ target: 'aguante', points: 4 }],
        recovery: 1,
        immune: [{ to: 'lesion', attr: 'aguante' }],
    },
    {
        id: 'cue-recuperacion',
        category: 'cuerpo',
        labelEs: 'Recuperación · frío y sueño',
        price: 240_000,
        hint: 'Crioterapia y horas de sueño medidas. Es lo que más desgaste te saca por temporada, y el cuerpo castigado deja de bajarte el Tackle.',
        gain: [{ target: 'aguante', points: 3 }],
        recovery: 1.8,
        immune: [{ to: 'cuerpo', attr: 'tackle' }],
    },
    {
        id: 'cue-preparador',
        category: 'cuerpo',
        labelEs: 'Preparador físico personal',
        price: 320_000,
        hint: 'Trabaja para vos todo el año. El declive del Tackle y del Aguante arranca dos años más tarde.',
        peakShift: [{ attr: 'tackle', years: 2 }, { attr: 'aguante', years: 2 }],
    },
    {
        id: 'cue-cirujano',
        category: 'cuerpo',
        labelEs: 'Cirujano de rodilla',
        price: 410_000,
        hint: 'El mejor que hay, y te opera a vos. Recuperás lo que te sacaron las lesiones.',
        rule: 'cirugia',
        requires: { injured: true },
    },

    // ── La carrera ──────────────────────────────────────────────────────────
    {
        id: 'car-analista',
        category: 'carrera',
        labelEs: 'Analista de video',
        price: 110_000,
        hint: 'Te arma el video del rival y el tuyo. Ves cosas que antes no veías.',
        gain: [{ target: 'vision', points: 4 }],
    },
    {
        id: 'car-coach',
        category: 'carrera',
        labelEs: 'Coach de kicking o de contacto',
        price: 180_000,
        hint: 'Pegada si sos back, Tackle si sos forward. No te da puntos: te sube adónde podés llegar.',
        ceiling: [{ target: 'grupo', points: 4 }],
    },
    {
        id: 'car-entrenador',
        category: 'carrera',
        labelEs: 'Entrenador de tu puesto',
        price: 200_000,
        hint: 'Un tipo que hizo tu puesto durante quince años. Le sube el techo a lo que más pesa en tu media.',
        ceiling: [{ target: 'principal', points: 5 }],
    },
    {
        id: 'car-representante',
        category: 'carrera',
        labelEs: 'Representante de primer nivel',
        price: 260_000,
        hint: 'Te llega una oferta más por temporada, y de clubes más grandes. Jugás donde se te escucha.',
        gain: [{ target: 'liderazgo', points: 3 }],
        rule: 'representante',
    },

    // ── La temporada · consumibles ──────────────────────────────────────────
    {
        id: 'tem-botines',
        category: 'temporada',
        labelEs: 'Botines a medida',
        price: 16_000,
        hint: 'Hechos sobre el molde de tu pie. Duran dos temporadas y después hay que volver a hacerlos.',
        gain: [{ target: 'pegada', points: 2 }],
        seasons: 2,
    },
    {
        id: 'tem-clinica',
        category: 'temporada',
        labelEs: 'Clínica de contacto',
        price: 40_000,
        hint: 'Una semana entera de técnica de tackle. Se aguanta dos temporadas.',
        gain: [{ target: 'tackle', points: 3 }],
        seasons: 2,
    },
    {
        id: 'tem-pretemporada',
        category: 'temporada',
        labelEs: 'Pretemporada afuera',
        price: 48_000,
        hint: 'Seis semanas donde se entrena en serio. Elegís vos qué trabajar, y lo que ganás queda para siempre. Una por temporada.',
        gain: [{ target: 'elegido', points: 3 }],
        repeat: 'por-temporada',
    },
    {
        id: 'tem-fisio',
        category: 'temporada',
        labelEs: 'Fisio dedicado',
        price: 55_000,
        hint: 'Te atiende a vos y no a los treinta. Dos temporadas.',
        gain: [{ target: 'aguante', points: 2 }],
        seasons: 2,
    },

    // ── El club ─────────────────────────────────────────────────────────────
    {
        id: 'clu-luces',
        category: 'club',
        labelEs: 'Las luces de la cancha',
        price: 300_000,
        hint: 'Se juega de noche por primera vez en la historia del club. Nadie se olvida de quién las puso.',
        gain: [{ target: 'liderazgo', points: 3 }],
        belonging: 4,
    },
    {
        id: 'clu-gimnasio',
        category: 'club',
        labelEs: 'El gimnasio nuevo',
        price: 650_000,
        hint: 'Lo usan las juveniles, la primera y las chicas. Y vos, todos los días.',
        gain: [{ target: 'aguante', points: 4 }],
        ceiling: [{ target: 'aguante', points: 3 }],
        belonging: 6,
    },
    {
        id: 'clu-escuelita',
        category: 'club',
        labelEs: 'La escuelita',
        price: 1_400_000,
        hint: 'Ciento veinte pibes del barrio los sábados a la mañana. Es lo más grande que podés dejarle a un club, y hay que ser alguien adentro para que te dejen hacerlo.',
        gain: [{ target: 'liderazgo', points: 8 }],
        ceiling: [{ target: 'liderazgo', points: 5 }],
        belonging: 10,
        requires: { belongingTier: 'referente' },
    },

    // ── La vida ─────────────────────────────────────────────────────────────
    {
        id: 'vid-camioneta',
        category: 'vida',
        labelEs: 'La camioneta',
        price: 35_000,
        hint: 'Dejás de hacer doscientos kilómetros en colectivo para entrenar.',
        gain: [{ target: 'aguante', points: 2 }],
    },
    {
        id: 'vid-casa',
        category: 'vida',
        labelEs: 'Casa propia',
        price: 165_000,
        hint: 'Se te terminó el problema que no era de rugby. Nunca más caés al fondo del plantel.',
        gain: [{ target: 'vision', points: 2 }, { target: 'liderazgo', points: 2 }],
        rule: 'piso-de-forma',
    },
    {
        id: 'vid-chacra',
        category: 'vida',
        labelEs: 'La chacra',
        price: 340_000,
        hint: 'Tres semanas al año donde no te encuentra nadie. Volvés otro, y afuera se habla de eso.',
        gain: [{ target: 'aguante', points: 5 }],
        fame: 3,
    },
];

/** Los prefijos vigentes, uno por góndola. Los verifica `shop.test.ts`. */
export const SHOP_PREFIX: Record<ShopCategory, string> = {
    cuerpo: 'cue-',
    carrera: 'car-',
    temporada: 'tem-',
    club: 'clu-',
    vida: 'vid-',
};

const BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

/** El ítem por id, o `null` si no existe. Nunca explota: un id viejo se ignora. */
export function getShopItem(id: string): ShopItem | null {
    return BY_ID.get(id) ?? null;
}

/**
 * Los ítems de una góndola, en orden de catálogo.
 *
 * Se filtra sobre `SHOP_ITEMS` —que es orden declarado— y no sobre un `Map`:
 * recorrer las claves de un Map para elegir qué mostrar es orden de inserción
 * disfrazado de orden (CLAUDE.md §1).
 */
export function shopItemsOf(category: ShopCategory): readonly ShopItem[] {
    return SHOP_ITEMS.filter((item) => item.category === category);
}

/**
 * A QUÉ ATRIBUTO LE PEGA ESTE EFECTO, en esta familia y con esta elección.
 *
 * Vive acá —en el catálogo y no en el motor— porque es la traducción de un dato
 * del catálogo a otro dato del catálogo: `principal` y `grupo` se contestan con
 * `data/positions.ts` y con nada más. Que sea una función pura y sin estado es
 * lo que permite que `engine/ovr.ts` la use para el techo sin arrastrarse el
 * motor de la tienda entero.
 *
 * Devuelve `null` cuando el ítem pide una elección que todavía no se hizo: un
 * `elegido` sin atributo no le pega a nada, y eso es lo que la pantalla necesita
 * saber para deshabilitar el botón y decir qué falta (CLAUDE.md §6).
 */
export function resolveShopTarget(
    target: ShopTarget,
    family: PositionFamilyId,
    chosen: CaptainAttributeKey | null,
): CaptainAttributeKey | null {
    if (target === 'elegido') return chosen;
    if (target === 'principal') return mainAttributeOf(family);
    if (target === 'grupo') return getFamily(family).group === 'back' ? 'pegada' : 'tackle';
    return target;
}
