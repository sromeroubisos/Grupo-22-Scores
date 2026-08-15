// EL CAPITÁN — comprar.
//
// El catálogo está en `data/shop.ts`; acá viven las reglas, que son cuatro y
// ninguna es negociable:
//
//   1. LA TIENDA ABRE CON EL CONTRATO. En amateur la plata no se mueve —el rugby
//      de club no paga, el jugador paga la cuota— y por lo tanto tampoco se
//      gasta. La puerta es la misma de siempre (`engine/money.ts`) y no una
//      segunda condición escrita acá: si `applyMoney` ignora el delta en
//      amateur, una compra que no la respetara regalaría el ítem.
//   2. LOS PUNTOS NO PASAN EL TECHO. Un ítem que promete +4 de Visión sobre un
//      jugador que ya está en su techo entrega lo que quepa y NO más, igual que
//      una decisión de evento (`applyAttrs`). Lo que entró de verdad se guarda,
//      porque es lo único con lo que se puede devolver un consumible al vencer.
//   3. EL AGUANTE TIENE SU PROPIO TOPE. Es el único atributo que ningún techo de
//      media acota —no está en la media de nadie— y encima el envejecimiento
//      NUNCA lo sube: la tienda es su única fuente. Sin tope, veintidós puntos
//      de aguante comprables alargarían todas las carreras. Ver `SHOP_AGUANTE_CAP`.
//   4. LA PERTENENCIA COMPRADA TIENE TOPE CONJUNTO. Las tres obras del club
//      suman veinte y el tope es doce: se puede comprar el vestuario, no el
//      escudo.
//
// ── Y la regla que las ordena a todas ───────────────────────────────────────
// LO BARATO TE DA PUNTOS, LO CARO TE SUBE EL TECHO. Los puntos se los come la
// edad; el techo no. De ahí sale que el orden correcto de compra sea techo
// primero y puntos después — y que la pantalla tenga que decir, antes de cobrar,
// cuánto va a entrar de verdad.

import type { CaptainState } from '../types/captain.ts';
import type { CaptainAttributeKey, CaptainPlayer, ShopGain, ShopPurchase } from '../types/player.ts';
import type { ShopHarm, ShopItem, ShopRuleId } from '../data/shop.ts';
import { BELONGING_TIERS, FAME_MAX, FAME_MIN } from '../types/currencies.ts';
import { ATTRIBUTE_LABEL, getFamily } from '../data/positions.ts';
import { SHOP_ITEMS, getShopItem, resolveShopTarget } from '../data/shop.ts';
import { applyBelonging, belongingOf } from './belonging.ts';
import { belongingSituation } from './contracts.ts';
import { canEarnMoney } from './money.ts';
import { ovrOf, potentialOf } from './ovr.ts';

/** Piso y techo de un atributo. Los mismos que usa `aging.ts`. */
const ATTR_MIN = 5;
const ATTR_MAX = 99;

/**
 * CUÁNTO AGUANTE SE PUEDE COMPRAR. PARÁMETRO LIBRE, y de los que definen el
 * tamaño de la tienda.
 *
 * El catálogo ofrece VEINTIDÓS puntos de aguante entre el kinesiólogo, la
 * recuperación, la nutrición, el fisio, el gimnasio, la camioneta y la chacra.
 * Comprarlos todos bajaría el desgaste por partido alrededor de un 11% y
 * alargaría todas las carreras profesionales del juego — o sea, la tienda
 * dejaría de ser una decisión para ser una lista de compras.
 *
 * Con doce hay que elegir cuáles, que es lo que se quiere. Y el número muerde de
 * verdad: doce puntos sobre una base típica bajan el desgaste de la temporada
 * cerca de un 6%, que es medio año de carrera.
 *
 * El gimnasio del club lo levanta a quince, y ese es el único techo que el
 * aguante tiene: `engine/ovr.ts` explica por qué el techo de la media no puede
 * hacer este trabajo.
 */
export const SHOP_AGUANTE_CAP = 12;

/**
 * LA PERTENENCIA QUE SE PUEDE COMPRAR, sumando las tres obras. PARÁMETRO LIBRE.
 *
 * Doce puntos es medio escalón: alcanza para entrar a Titular antes de tiempo,
 * no alcanza para comprar Referente ni de casualidad. Es a propósito — la
 * Pertenencia es la moneda que define el final del juego y se gana quedándose,
 * no pagando. Las obras aceleran algo que ya estaba pasando; no lo reemplazan.
 */
export const SHOP_BELONGING_CAP = 12;

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE LA TIENDA LE CAMBIA AL MOTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Las reglas que corren mientras tengas los ítems puestos.
 *
 * Se DERIVA de lo comprado en cada lectura y no se guarda: una copia guardada de
 * esto sería una derivada congelada, y alcanzaría un consumible que venza sin
 * refrescarla para que el motor siga aplicando un perk que el jugador ya no
 * tiene (CLAUDE de captain §1.9).
 */
export interface ShopPerks {
    /** Años que se le corren al pico de un atributo. Vacío es lo normal. */
    peakShift: Partial<Record<CaptainAttributeKey, number>>;
    /** Qué atributo se banca qué daño. */
    immune: Record<ShopHarm, readonly CaptainAttributeKey[]>;
    /**
     * Desgaste extra que te saca cada pretemporada, sumando lo comprado.
     *
     * Es el ÚNICO perk que es un número y no una lista, y por eso conviene decir
     * de qué lado cae: se suma al descanso de `simulate-season.ts`, o sea que
     * mueve el reloj del cuerpo y con él la edad de retiro. Los otros dos
     * cambian a quién le pega el daño; este cambia cuánto daño hay.
     */
    recovery: number;
    rules: readonly ShopRuleId[];
}

/**
 * El jugador sin una sola compra, que es el 100% de los amateurs y el arranque
 * de todos los demás. Se devuelve compartido porque NADIE lo muta: los tres
 * campos se leen y se tiran.
 */
export const NO_SHOP_PERKS: ShopPerks = {
    peakShift: {},
    immune: { cuerpo: [], lesion: [], golpe: [] },
    recovery: 0,
    rules: [],
};

/** Los perks de este jugador, leídos de lo que tiene comprado. */
export function shopPerks(player: CaptainPlayer): ShopPerks {
    if (player.shop.length === 0) return NO_SHOP_PERKS;

    const peakShift: Partial<Record<CaptainAttributeKey, number>> = {};
    const immune: Record<ShopHarm, CaptainAttributeKey[]> = { cuerpo: [], lesion: [], golpe: [] };
    const rules: ShopRuleId[] = [];
    let recovery = 0;

    for (const purchase of player.shop) {
        const item = getShopItem(purchase.id);
        if (!item) continue;
        for (const shift of item.peakShift ?? []) {
            peakShift[shift.attr] = (peakShift[shift.attr] ?? 0) + shift.years;
        }
        for (const banca of item.immune ?? []) {
            if (!immune[banca.to].includes(banca.attr)) immune[banca.to].push(banca.attr);
        }
        recovery += item.recovery ?? 0;
        if (item.rule && !rules.includes(item.rule)) rules.push(item.rule);
    }

    return { peakShift, immune, recovery, rules };
}

/** ¿Corre esta regla? Es la única forma de preguntarlo: nada de `includes` sueltos. */
export function hasRule(perks: ShopPerks, rule: ShopRuleId): boolean {
    return perks.rules.includes(rule);
}

/** ¿Este atributo se banca este daño? */
export function isImmune(perks: ShopPerks, harm: ShopHarm, attr: CaptainAttributeKey): boolean {
    return perks.immune[harm].includes(attr);
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOS TOPES QUE SE DERIVAN DE LO COMPRADO
// ═══════════════════════════════════════════════════════════════════════════

/** El tope de aguante comprable de este jugador: el base más lo que levantó. */
export function aguanteCapOf(player: CaptainPlayer): number {
    let cap = SHOP_AGUANTE_CAP;
    for (const purchase of player.shop) {
        const item = getShopItem(purchase.id);
        for (const effect of item?.ceiling ?? []) {
            if (resolveShopTarget(effect.target, player.family, purchase.attr) === 'aguante') {
                cap += effect.points;
            }
        }
    }
    return cap;
}

/** Cuánto aguante llevás comprado, contando lo que está prestado. */
export function aguanteBoughtOf(player: CaptainPlayer): number {
    let total = 0;
    for (const purchase of player.shop) {
        for (const gain of purchase.applied) {
            if (gain.attr === 'aguante') total += gain.points;
        }
    }
    return total;
}

/** La Pertenencia que pidieron las obras, SIN el tope. Es el insumo del tope. */
function belongingAskedOf(player: CaptainPlayer): number {
    let total = 0;
    for (const purchase of player.shop) total += getShopItem(purchase.id)?.belonging ?? 0;
    return total;
}

/** Cuánta Pertenencia te dieron ya las obras del club, con el tope puesto. */
export function belongingBoughtOf(player: CaptainPlayer): number {
    return Math.min(SHOP_BELONGING_CAP, belongingAskedOf(player));
}

/** Lo que llevás gastado en la tienda. Derivado del catálogo, no guardado. */
export function shopSpentOf(player: CaptainPlayer): number {
    let total = 0;
    for (const purchase of player.shop) total += getShopItem(purchase.id)?.price ?? 0;
    return total;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ¿SE PUEDE COMPRAR?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El veredicto de un ítem, y por qué.
 *
 * `reason` no es para un log: es el texto que la pantalla pone debajo del botón
 * deshabilitado. El §6 del CLAUDE.md pide que un botón apagado diga qué falta
 * para encenderse, y la única manera de que eso no se desincronice es que la
 * razón la produzca la misma función que apaga el botón.
 */
export interface ShopVerdict {
    ok: boolean;
    reason: string | null;
    /** Ya lo tenés puesto. Se distingue de «no podés» porque se dibuja distinto. */
    owned: boolean;
}

/** Si el ítem exige una elección de atributo. */
export function needsPick(item: ShopItem): boolean {
    return (item.gain ?? []).some((e) => e.target === 'elegido')
        || (item.ceiling ?? []).some((e) => e.target === 'elegido');
}

export function canBuy(
    state: CaptainState,
    item: ShopItem,
    chosen: CaptainAttributeKey | null = null,
): ShopVerdict {
    // La puerta del contrato, y sale de `money.ts` para que sea la misma que
    // decide si el sueldo entra. Dos preguntas distintas sobre lo mismo se
    // separan en el primer ajuste.
    if (!canEarnMoney(state.stage)) {
        return { ok: false, reason: 'La tienda abre cuando firmes profesional. Hasta ahí no hay plata.', owned: false };
    }

    const { player } = state;

    if (item.repeat === 'por-temporada') {
        if (player.shop.some((p) => p.id === item.id && p.season === state.season)) {
            return { ok: false, reason: 'Una por temporada. La que viene se puede de nuevo.', owned: false };
        }
    } else if (player.shop.some((p) => p.id === item.id)) {
        return { ok: false, reason: 'Ya lo tenés.', owned: true };
    }

    if (item.requires?.injured && Object.keys(player.injuryLoss).length === 0) {
        return { ok: false, reason: 'No hay nada que operar: todavía no te rompiste.', owned: false };
    }

    if (item.requires?.belongingTier) {
        const pedido = BELONGING_TIERS.find((t) => t.id === item.requires!.belongingTier)!;
        const actual = belongingOf(state.belonging, player.clubId);
        if (actual < pedido.min) {
            return {
                ok: false,
                reason: `Hace falta ser ${pedido.labelEs} en tu club. Vas ${Math.round(actual)} de ${pedido.min}.`,
                owned: false,
            };
        }
    }

    if (needsPick(item) && !chosen) {
        return { ok: false, reason: 'Elegí qué querés trabajar.', owned: false };
    }

    if (state.money < item.price) {
        return { ok: false, reason: `Te faltan ${money(item.price - state.money)}.`, owned: false };
    }

    // El último corte, y es el que más duele: un ítem que SOLO da puntos, sobre
    // un jugador que ya está en su techo, no entrega nada. Cobrarlo igual sería
    // exactamente la promesa incumplida que este motor no se permite. Los que
    // levantan el techo quedan afuera del corte porque siempre hacen algo.
    if (item.gain && !item.ceiling && previewGain(state, item, chosen).length === 0) {
        return { ok: false, reason: 'Estás en tu techo: esto no te sumaría nada. Subí el techo primero.', owned: false };
    }

    return { ok: true, reason: null, owned: false };
}

/** `US$ 1.400.000`. La única forma de escribir plata en este feature. */
export function money(n: number): string {
    return `US$ ${Math.round(n).toLocaleString('es-AR')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  QUÉ ENTRA DE VERDAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los puntos que este ítem entregaría HOY, con los dos recortes ya aplicados.
 *
 * Es LA MISMA FUNCIÓN que hace la compra, corriendo sobre un clon. Si la
 * previsualización repitiera la aritmética, el día que alguien cambie un recorte
 * la pantalla prometería una cosa y la compra haría otra — que es el modo de
 * falla que este feature no puede tener, porque el jugador paga antes de ver.
 */
export function previewGain(
    state: CaptainState,
    item: ShopItem,
    chosen: CaptainAttributeKey | null = null,
): ShopGain[] {
    const clon: CaptainPlayer = {
        ...state.player,
        attrs: { ...state.player.attrs },
        shop: [...state.player.shop],
    };
    return registerAndApply(clon, item, chosen).applied;
}

/**
 * Anota la compra y le aplica los puntos. Devuelve el registro.
 *
 * EL ORDEN NO ES CASUAL Y ES LA MITAD DE LA MECÁNICA: se anota PRIMERO y se
 * aplica DESPUÉS, así que los puntos de un ítem persiguen el techo que ESE MISMO
 * ítem acaba de levantar. El gimnasio da cuatro de aguante contra un tope de
 * quince —el suyo—, no contra el de doce que había antes; la escuelita da ocho
 * de liderazgo contra el techo que sus cinco puntos ya subieron.
 *
 * Al revés, esos dos ítems entregarían menos de lo que dicen y el jugador vería
 * la diferencia en la ficha sin poder explicarla.
 */
function registerAndApply(
    player: CaptainPlayer,
    item: ShopItem,
    chosen: CaptainAttributeKey | null,
): ShopPurchase {
    const purchase: ShopPurchase = {
        id: item.id,
        // La temporada la pone el que llama: acá no hay estado. Se corrige
        // afuera, que es donde se sabe.
        season: 0,
        attr: chosen,
        applied: [],
        seasonsLeft: item.seasons ?? null,
    };
    player.shop.push(purchase);
    purchase.applied = applyGain(player, item, chosen);
    return purchase;
}

/**
 * Aplica los puntos de un ítem sobre el jugador y devuelve LO QUE ENTRÓ.
 *
 * Muta —el reducer trabaja sobre un clon— y hace los dos recortes:
 *
 *   · los atributos de tu media, TODOS JUNTOS y proporcionalmente, contra el
 *     techo. Junto y no de a uno, porque la casa propia da Visión y Liderazgo a
 *     la vez y recortar el primero entero antes de mirar el segundo dejaría el
 *     resultado dependiendo del orden en que se escribieron.
 *   · el aguante, contra su propio tope.
 *
 * Los que no son ni una cosa ni la otra —Pegada para un pilar— entran enteros:
 * no mueven la media, así que no hay techo que puedan pasar.
 */
function applyGain(
    player: CaptainPlayer,
    item: ShopItem,
    chosen: CaptainAttributeKey | null,
): ShopGain[] {
    if (!item.gain) return [];

    const family = getFamily(player.family);
    const deLaMedia = new Set<CaptainAttributeKey>(family.attributes);

    const antes = ovrOf(player);
    const snapshot = new Map<CaptainAttributeKey, number>();
    const pedidos: ShopGain[] = [];

    for (const effect of item.gain) {
        const attr = resolveShopTarget(effect.target, player.family, chosen);
        if (!attr || effect.points <= 0) continue;
        pedidos.push({ attr, points: effect.points });
        if (!snapshot.has(attr)) snapshot.set(attr, player.attrs[attr]);
    }
    if (pedidos.length === 0) return [];

    // 1 · El aguante, contra su tope. Se resuelve aparte porque no interactúa
    //     con el techo de la media: son dos cuentas independientes.
    const libre = Math.max(0, aguanteCapOf(player) - aguanteBoughtOf(player));
    let gastado = 0;

    for (const pedido of pedidos) {
        if (pedido.attr === 'aguante') {
            const cabe = Math.max(0, Math.min(pedido.points, libre - gastado));
            gastado += cabe;
            pedido.points = cabe;
        }
        if (pedido.points > 0) {
            player.attrs[pedido.attr] = clampAttr(player.attrs[pedido.attr] + pedido.points);
        }
    }

    // 2 · Los de la media, todos juntos contra el techo.
    const despues = ovrOf(player);
    const techo = potentialOf(player);
    if (despues > techo && despues > antes) {
        const factor = Math.max(0, techo - antes) / (despues - antes);
        for (const [attr, original] of snapshot) {
            if (!deLaMedia.has(attr)) continue;
            player.attrs[attr] = Math.round(original + (player.attrs[attr] - original) * factor);
        }
    }

    player.ovr = ovrOf(player);

    // Lo que entró DE VERDAD sale de comparar contra la foto de antes, y no de
    // lo que se pidió: después del recorte proporcional los dos números son
    // distintos, y devolver el pedido dejaría al consumible restando al vencer
    // más de lo que había prestado.
    const entregado: ShopGain[] = [];
    for (const [attr, original] of snapshot) {
        const delta = player.attrs[attr] - original;
        if (delta !== 0) entregado.push({ attr, points: delta });
    }
    return entregado;
}

function clampAttr(value: number): number {
    return Math.min(ATTR_MAX, Math.max(ATTR_MIN, Math.round(value)));
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMPRAR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compra un ítem. Muta el estado y devuelve la línea de crónica, o `null` si la
 * compra no correspondía.
 *
 * `null` y no una excepción por la misma razón que una opción de evento que no
 * existe: el reducer devuelve el estado sin tocar y la pantalla no dibuja nada.
 * Una compra inválida no es un error de programa, es un botón que no había que
 * poder apretar.
 *
 * NO CONSUME AZAR. Comprar no tira un dado, así que el stream del rng queda
 * donde estaba: dos partidas con la misma semilla que compran distinto siguen
 * recibiendo los mismos Momentos y las mismas ofertas, y la diferencia entre
 * ellas es exactamente lo que la tienda hizo (CLAUDE de captain §1.10).
 */
export function buyShopItem(
    state: CaptainState,
    itemId: string,
    chosen: CaptainAttributeKey | null = null,
): string | null {
    const item = getShopItem(itemId);
    if (!item) return null;
    if (!canBuy(state, item, chosen).ok) return null;

    const { player } = state;

    // 1 · Los puntos, y el techo que este ítem levanta, en el orden que explica
    //     `registerAndApply`.
    const purchase = registerAndApply(player, item, chosen);
    purchase.season = state.season;

    // 2 · La Pertenencia de las obras, con el tope conjunto y por la puerta de
    //     siempre: el techo del que no ganó nada, el del que se fue al clásico y
    //     el congelamiento del profesional se aplican solos. Escribir el número a
    //     mano saltearía las tres reglas de golpe.
    if (item.belonging && player.clubId) {
        // El tope se mide contra lo pedido ANTES de esta compra: la compra ya
        // está en la lista, así que se le descuenta lo que este ítem trae.
        const previo = belongingAskedOf(player) - item.belonging;
        const cabe = Math.max(0, Math.min(item.belonging, SHOP_BELONGING_CAP - previo));
        if (cabe > 0) {
            state.belonging = applyBelonging(state.belonging, cabe, belongingSituation(state, player.clubId));
        }
    }

    if (item.fame) {
        state.fame = Math.min(FAME_MAX, Math.max(FAME_MIN, Math.round((state.fame + item.fame) * 10) / 10));
    }

    // 3 · La cirugía. Devuelve lo que las lesiones sacaron, con el mismo recorte
    //     de techo que cualquier otro punto: operarse no te deja por encima de lo
    //     que podías ser.
    let extra = '';
    if (item.rule === 'cirugia') {
        const devuelto = restoreInjuryLoss(player);
        if (devuelto.length > 0) {
            extra = ` Recuperaste ${devuelto.map((g) => `${ATTRIBUTE_LABEL[g.attr]} +${round1(g.points)}`).join(' · ')}.`;
        }
    }

    state.money = Math.max(0, Math.round(state.money - item.price));

    return `Compraste ${item.labelEs} por ${money(item.price)}.${extra}`;
}

/** Un decimal. Los puntos entregados pueden no ser enteros después del recorte. */
function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

/**
 * Devuelve lo que las lesiones sacaron y vacía el saldo pendiente.
 *
 * Se recorre `injuryLoss` ORDENADO: es un `Record` de claves dinámicas y el
 * recorte contra el techo depende del orden en que se apliquen (CLAUDE.md §1).
 */
function restoreInjuryLoss(player: CaptainPlayer): ShopGain[] {
    const claves = Object.keys(player.injuryLoss).sort() as CaptainAttributeKey[];
    if (claves.length === 0) return [];

    const family = getFamily(player.family);
    const deLaMedia = new Set<CaptainAttributeKey>(family.attributes);
    const antes = ovrOf(player);
    const snapshot = new Map<CaptainAttributeKey, number>();

    for (const attr of claves) {
        snapshot.set(attr, player.attrs[attr]);
        player.attrs[attr] = clampAttr(player.attrs[attr] + (player.injuryLoss[attr] ?? 0));
    }

    const despues = ovrOf(player);
    const techo = potentialOf(player);
    if (despues > techo && despues > antes) {
        const factor = Math.max(0, techo - antes) / (despues - antes);
        for (const [attr, original] of snapshot) {
            if (!deLaMedia.has(attr)) continue;
            player.attrs[attr] = Math.round(original + (player.attrs[attr] - original) * factor);
        }
    }

    player.injuryLoss = {};
    player.ovr = ovrOf(player);

    const devuelto: ShopGain[] = [];
    for (const [attr, original] of snapshot) {
        const delta = player.attrs[attr] - original;
        if (delta > 0) devuelto.push({ attr, points: delta });
    }
    return devuelto;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE SE APAGA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Descuenta una temporada a los consumibles y devuelve la crónica de los que
 * vencieron.
 *
 * Se llama al CERRAR la temporada, en el mismo lugar donde se apaga la carta de
 * pretemporada: los dos son modificadores con fecha y no puede haber dos lugares
 * distintos donde el tiempo pasa.
 *
 * Lo que se devuelve es `applied` —lo que el ítem dio de verdad— y no lo que el
 * catálogo promete. La diferencia es real: unos botines que entregaron 1,2 por
 * el techo tienen que devolver 1,2, y no 2.
 */
export function tickShop(player: CaptainPlayer): string[] {
    if (player.shop.length === 0) return [];

    const vencidos: string[] = [];
    const siguen: ShopPurchase[] = [];

    for (const purchase of player.shop) {
        if (purchase.seasonsLeft === null) { siguen.push(purchase); continue; }

        const quedan = purchase.seasonsLeft - 1;
        if (quedan > 0) {
            siguen.push({ ...purchase, seasonsLeft: quedan });
            continue;
        }

        for (const gain of purchase.applied) {
            player.attrs[gain.attr] = clampAttr(player.attrs[gain.attr] - gain.points);
        }
        const item = getShopItem(purchase.id);
        if (item) vencidos.push(`Se te terminó lo de ${item.labelEs.toLowerCase()}.`);
    }

    player.shop = siguen;
    player.ovr = ovrOf(player);
    return vencidos;
}

/**
 * Lo que se puede elegir en un ítem de `elegido`: los cuatro de tu puesto más el
 * aguante.
 *
 * Son los CINCO QUE LA FICHA MUESTRA, y esa es la razón de que sean estos y no
 * los diecinueve: ofrecer un atributo que el jugador no ve en ninguna pantalla
 * es pedirle que elija a ciegas.
 */
export function pickableAttributes(player: CaptainPlayer): readonly CaptainAttributeKey[] {
    return [...getFamily(player.family).attributes, 'aguante'];
}

/** Todos los ítems, para la pantalla. Reexportado para no abrir dos puertas. */
export { SHOP_ITEMS };
