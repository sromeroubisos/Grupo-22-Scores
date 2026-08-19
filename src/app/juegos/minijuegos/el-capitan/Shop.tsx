'use client';

import { useMemo, useState } from 'react';
import type { CaptainAttributeKey, CaptainState, ShopCategory, ShopItem } from '@/features/captain';
import {
    ATTRIBUTE_LABEL,
    SHOP_CATEGORIES,
    SHOP_CATEGORY_HINT,
    SHOP_CATEGORY_LABEL,
    aguanteBoughtOf,
    aguanteCapOf,
    canBuy,
    getFamily,
    money,
    needsPick,
    pickableAttributes,
    previewGain,
    resolveShopTarget,
    shopItemsOf,
} from '@/features/captain';
import styles from './capitan.module.css';

/**
 * LA TIENDA.
 *
 * Vive dentro de la pretemporada y no en una pantalla aparte del ciclo: es el
 * momento del año en que se decide en qué se invierte, al lado de la carta de
 * entrenamiento. El reducer lo garantiza —`BUY` solo corre en `offseason`— así
 * que esto no puede aparecer en el medio de un Mundial aunque alguien lo monte
 * por error.
 *
 * ── Las tres cosas que la pantalla no puede dejar de decir ──────────────────
 *
 * 1. CUÁNTO ENTRA DE VERDAD. Un ítem que promete +4 de Visión sobre un jugador
 *    en su techo entrega cero, y eso hay que decirlo ANTES de cobrar. La cuenta
 *    no se repite acá: se le pregunta a `previewGain`, que es LA MISMA función
 *    que hace la compra. Si se repitiera, el día que cambie un recorte la
 *    pantalla prometería una cosa y la compra haría otra.
 * 2. POR QUÉ NO PODÉS. Cada botón apagado trae su razón, y la razón la produce
 *    `canBuy` —o sea, exactamente lo que apaga el botón (CLAUDE.md §6).
 * 3. QUÉ PASA SI ELEGÍS MAL. El precio, lo que dura y lo que se resigna van a la
 *    vista; nada de esto se descubre después de pagar.
 *
 * ── Y la que le da forma a todo ─────────────────────────────────────────────
 * LO BARATO TE DA PUNTOS, LO CARO TE SUBE EL TECHO. La ficha del techo se dibuja
 * distinta de la de los puntos a propósito: son las dos monedas del sistema y
 * confundirlas es comprar en el orden equivocado.
 *
 * ── POR QUÉ SE MIRA UNA GÓNDOLA POR VEZ ─────────────────────────────────────
 * Las veinte fichas juntas medían 6.126 px en un teléfono de 844: SIETE
 * pantallas y media de scroll para una decisión que se toma entre tres o cuatro
 * cosas. Y no se arregla apretando la ficha —cada una tiene que decir las cinco
 * cosas de arriba— sino mostrando menos a la vez.
 *
 * La góndola ya era la unidad de comparación: los ítems compiten CONTRA LOS DE
 * SU GÓNDOLA —el cuerpo contra el cuerpo, el techo contra el techo—, nunca
 * contra los de otra. Así que la barra no esconde nada: enfoca lo que ya era el
 * grupo, y deja «Todo» para el que quiera recorrer las cinco.
 *
 * Y las pestañas CUENTAN, que es lo que las convierte en información en vez de
 * navegación: «El club 0» ahorra el viaje entero. La cuenta sale de `canBuy` —la
 * misma que apaga los botones de adentro— y no de comparar el precio contra el
 * saldo, que diría que te alcanza algo que la Pertenencia te está negando.
 *
 * NO HAY BARRA PEGAJOSA, y no es un olvido: `html`/`body` llevan
 * `overflow-x: hidden` en `globals.css`, así que `position: sticky` no se activa
 * en ninguna pantalla de este sitio (medido acá mismo: el probe se fue a -171 px
 * con la página scrolleada). La respuesta es que la pantalla sea corta, no que
 * la cabecera persiga al dedo.
 */
export default function Shop({
    state,
    onBuy,
    onClose,
}: {
    state: CaptainState;
    onBuy: (itemId: string, attr?: CaptainAttributeKey) => void;
    onClose: () => void;
}) {
    /**
     * El atributo elegido, POR ÍTEM.
     *
     * Un `Record` y no un solo valor porque la pretemporada afuera es el único
     * que pregunta hoy, pero nada impide que mañana sean dos — y con un valor
     * único, elegir en uno cambiaría el otro sin que se vea.
     */
    const [picks, setPicks] = useState<Record<string, CaptainAttributeKey>>({});

    /** Qué góndola se está mirando. Arranca en la primera, nunca en «Todo». */
    const [tab, setTab] = useState<ShopCategory | 'todo'>(SHOP_CATEGORIES[0]);

    const { player } = state;
    const aguanteTope = aguanteCapOf(player);
    const aguanteHecho = Math.round(aguanteBoughtOf(player) * 10) / 10;

    /**
     * Cuántas cosas de cada góndola te alcanzan HOY.
     *
     * Se recalcula con cada compra —el saldo baja y las cuentas bajan con él— y
     * por eso depende de `state` y no de un contador guardado.
     */
    const cuentas = useMemo(() => {
        const por = {} as Record<ShopCategory, { alcanza: number; total: number }>;
        for (const cat of SHOP_CATEGORIES) {
            const items = shopItemsOf(cat);
            por[cat] = { alcanza: items.filter((i) => comprable(state, i)).length, total: items.length };
        }
        return por;
    }, [state]);

    const totales = SHOP_CATEGORIES.reduce(
        (a, cat) => ({ alcanza: a.alcanza + cuentas[cat].alcanza, total: a.total + cuentas[cat].total }),
        { alcanza: 0, total: 0 },
    );

    const gondolas = tab === 'todo' ? SHOP_CATEGORIES : [tab];

    return (
        <div className={`${styles.card} ${styles.shopScreen}`}>
            {/* La salida va en la línea de la temporada y no al lado del título:
                compartiendo renglón con el título, en un teléfono le comía la
                mitad del ancho a la frase que ordena la tienda entera. */}
            <div className={styles.shopTop}>
                <span className={styles.eyebrow}>Temporada {state.season}</span>
                <button type="button" className={styles.shopBack} onClick={onClose} data-continue>
                    Volver a la pretemporada
                </button>
            </div>

            <h2 className={styles.cardTitle}>La tienda</h2>
            <p className={styles.shopLead}>
                Lo barato te da puntos y lo caro te sube el techo. Los puntos se los come la edad;
                el techo no.
            </p>

            {/* El saldo se repite acá aunque ya esté en la billetera de arriba: es
                el número contra el que se lee cada precio, y la cabecera queda
                fuera de pantalla apenas se scrollea. */}
            <div className={styles.shopBar}>
                <div className={styles.shopBalance}>
                    <span className={styles.shopBalanceValue}>{money(state.money)}</span>
                    <span className={styles.shopBalanceLabel}>
                        Aguante comprado {aguanteHecho} de {aguanteTope}
                    </span>
                </div>

                <div className={styles.shopTabs} role="radiogroup" aria-label="Qué góndola mirar">
                    {SHOP_CATEGORIES.map((cat) => (
                        <Tab
                            key={cat}
                            label={SHOP_CATEGORY_LABEL[cat]}
                            alcanza={cuentas[cat].alcanza}
                            total={cuentas[cat].total}
                            on={tab === cat}
                            onPick={() => setTab(cat)}
                        />
                    ))}
                    <Tab
                        label="Todo"
                        alcanza={totales.alcanza}
                        total={totales.total}
                        on={tab === 'todo'}
                        onPick={() => setTab('todo')}
                    />
                </div>
            </div>

            {/* La `key` lleva la pestaña adentro a propósito: al pasar de una
                góndola a «Todo», la sección que ya estaba montada se quedaría
                quieta y el desvanecido de entrada solo correría en las otras
                cuatro. Con la pestaña en la clave, la góndola se remonta y las
                cinco entran juntas. */}
            {gondolas.map((cat) => (
                <section key={`${tab}-${cat}`} className={styles.shopSection}>
                    {/* El título solo cuando hay más de una góndola a la vista: con
                        una sola, la pestaña encendida ya lo dice y repetirlo dos
                        renglones más abajo se lee como un error. El nombre no se
                        pierde para quien no ve la pestaña: va en la grilla. */}
                    {tab === 'todo' && (
                        <h3 className={styles.shopSectionTitle}>{SHOP_CATEGORY_LABEL[cat]}</h3>
                    )}
                    <p className={styles.shopSectionHint}>{SHOP_CATEGORY_HINT[cat]}</p>

                    <div className={styles.shopGrid} aria-label={SHOP_CATEGORY_LABEL[cat]}>
                        {ordenados(state, cat).map((item) => (
                            <ShopCard
                                key={item.id}
                                state={state}
                                item={item}
                                pick={picks[item.id] ?? null}
                                onPick={(attr) => setPicks((p) => ({ ...p, [item.id]: attr }))}
                                onBuy={() => onBuy(item.id, picks[item.id])}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

/** Una pestaña de góndola, con lo que te alcanza adentro. */
function Tab({
    label,
    alcanza,
    total,
    on,
    onPick,
}: {
    label: string;
    alcanza: number;
    total: number;
    on: boolean;
    onPick: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label}: te alcanzan ${alcanza} de ${total}`}
            className={`${styles.shopTab} ${on ? styles.shopTabOn : ''}`}
            onClick={onPick}
        >
            {label}
            <span className={styles.shopTabCount} aria-hidden="true" data-cero={alcanza === 0 ? 'si' : undefined}>
                {alcanza}
            </span>
        </button>
    );
}

function ShopCard({
    state,
    item,
    pick,
    onPick,
    onBuy,
}: {
    state: CaptainState;
    item: ShopItem;
    pick: CaptainAttributeKey | null;
    onPick: (attr: CaptainAttributeKey) => void;
    onBuy: () => void;
}) {
    const veredicto = canBuy(state, item, pick);
    const entra = previewGain(state, item, pick);
    const pedido = declaredGain(state, item, pick);

    /**
     * ¿Lo que entra es distinto de lo que el ítem promete?
     *
     * Se compara SUMA CONTRA SUMA y no ficha por ficha: lo que le importa al
     * jugador es si el recorte le come algo, no en cuál de los dos atributos. Y
     * la tolerancia es de una décima porque `previewGain` devuelve el delta real
     * después de redondear los atributos.
     */
    const recortado = pedido > 0 && Math.abs(sum(entra) - pedido) > 0.1;

    return (
        <article className={styles.shopItem} data-owned={veredicto.owned ? 'si' : undefined}>
            <div className={styles.shopItemTop}>
                <h4 className={styles.shopItemName}>{item.labelEs}</h4>
                <span className={styles.shopItemPrice}>{money(item.price)}</span>
            </div>

            <div className={styles.shopChips}>
                {item.gain?.map((effect) => {
                    const attr = resolveShopTarget(effect.target, state.player.family, pick);
                    return (
                        <span key={`g-${effect.target}`} className={styles.shopChip}>
                            +{effect.points} {attr ? ATTRIBUTE_LABEL[attr] : targetLabel(effect.target)}
                        </span>
                    );
                })}
                {item.ceiling?.map((effect) => {
                    const attr = resolveShopTarget(effect.target, state.player.family, pick);
                    return (
                        <span key={`c-${effect.target}`} className={styles.shopChipCeiling}>
                            ↑ Techo {attr ? ATTRIBUTE_LABEL[attr] : targetLabel(effect.target)} +{effect.points}
                            {attr && mediaDelta(state, attr, effect.points) > 0.05
                                ? ` · +${decimal(mediaDelta(state, attr, effect.points))} de media`
                                : ''}
                        </span>
                    );
                })}
                {item.belonging ? (
                    <span key="b" className={styles.shopChipClub}>+{item.belonging} Pertenencia</span>
                ) : null}
                {item.fame ? <span key="f" className={styles.shopChipClub}>+{item.fame} Cartel</span> : null}
                {item.seasons ? (
                    <span key="s" className={styles.shopChipTemp}>{item.seasons} temporadas</span>
                ) : null}
                {item.repeat === 'por-temporada' ? (
                    <span key="r" className={styles.shopChipTemp}>Una por temporada</span>
                ) : null}
            </div>

            <p className={styles.shopItemHint}>{item.hint}</p>

            {/* LO QUE ENTRA DE VERDAD, y sólo cuando difiere de lo prometido:
                repetirlo siempre convertiría la ficha en dos números iguales uno
                al lado del otro y el jugador dejaría de mirar el que importa. */}
            {recortado && (
                <p className={styles.shopClipped}>
                    Con tu techo de hoy te entra{' '}
                    {entra.length === 0
                        ? 'nada'
                        : entra.map((g) => `+${decimal(g.points)} ${ATTRIBUTE_LABEL[g.attr]}`).join(' · ')}
                    .
                </p>
            )}

            {needsPick(item) && (
                <div
                    className={styles.shopPicker}
                    role="radiogroup"
                    aria-label={`Qué trabajar con ${item.labelEs}`}
                >
                    {pickableAttributes(state.player).map((attr) => (
                        <button
                            key={attr}
                            type="button"
                            role="radio"
                            aria-checked={pick === attr}
                            className={`${styles.shopPick} ${pick === attr ? styles.shopPickOn : ''}`}
                            onClick={() => onPick(attr)}
                        >
                            {ATTRIBUTE_LABEL[attr]}
                        </button>
                    ))}
                </div>
            )}

            {/* EL PIE ES UNA FILA Y NO DOS: la razón a la izquierda y el botón a
                la derecha. Antes el botón ocupaba el ancho completo con la razón
                debajo, y eso son veinte barras verdes idénticas en una misma
                pantalla —ninguna jerarquía y cuarenta píxeles de más por ficha—. */}
            <div className={styles.shopItemFoot}>
                {veredicto.owned ? (
                    <span className={styles.shopOwned}>Ya lo tenés</span>
                ) : (
                    <>
                        {veredicto.reason && (
                            <span className={styles.shopWhyNot}>{veredicto.reason}</span>
                        )}
                        <button
                            type="button"
                            className={styles.shopBuy}
                            disabled={!veredicto.ok}
                            aria-label={`Comprar ${item.labelEs} por ${money(item.price)}`}
                            onClick={onBuy}
                        >
                            Comprar
                        </button>
                    </>
                )}
            </div>
        </article>
    );
}

/**
 * Los ítems de una góndola, con LO COMPRADO AL FINAL.
 *
 * El orden del catálogo —de lo barato a lo caro— se conserva entre los que
 * quedan, porque `sort` es estable: lo único que se mueve es lo que ya no se
 * puede volver a comprar, que arriba de todo ocupa el lugar de una decisión sin
 * ser una.
 */
function ordenados(state: CaptainState, cat: ShopCategory): readonly ShopItem[] {
    return [...shopItemsOf(cat)].sort(
        (a, b) => Number(canBuy(state, a, null).owned) - Number(canBuy(state, b, null).owned),
    );
}

/**
 * ¿Se puede comprar HOY?
 *
 * Los que piden elegir atributo se preguntan con cada uno de los elegibles: con
 * `null` `canBuy` contesta «elegí qué querés trabajar», que es verdad pero no es
 * la pregunta —la pestaña cuenta lo que se puede comprar, no lo que ya está
 * elegido—. Y con uno solo, un jugador en el techo de ese atributo vería un cero
 * teniendo otros cuatro para gastar.
 */
function comprable(state: CaptainState, item: ShopItem): boolean {
    if (!needsPick(item)) return canBuy(state, item, null).ok;
    return pickableAttributes(state.player).some((attr) => canBuy(state, item, attr).ok);
}

/** Cuánta MEDIA levanta un punto de techo en este atributo y en este puesto. */
function mediaDelta(state: CaptainState, attr: CaptainAttributeKey, points: number): number {
    const family = getFamily(state.player.family);
    const i = family.attributes.indexOf(attr);
    if (i < 0) return 0;
    const total = family.weights.reduce((a, w) => a + w, 0);
    return (points * family.weights[i]) / total;
}

/** Los puntos que el ítem PROMETE, ya resueltos contra tu puesto. */
function declaredGain(state: CaptainState, item: ShopItem, pick: CaptainAttributeKey | null): number {
    let total = 0;
    for (const effect of item.gain ?? []) {
        if (resolveShopTarget(effect.target, state.player.family, pick)) total += effect.points;
    }
    return total;
}

function sum(gains: readonly { points: number }[]): number {
    return gains.reduce((a, g) => a + g.points, 0);
}

/**
 * Cómo se llama un objetivo que todavía no se resolvió.
 *
 * Solo lo ve `elegido` antes de que el jugador elija: `principal` y `grupo` se
 * resuelven siempre contra el puesto, que existe desde la creación.
 */
function targetLabel(target: string): string {
    return target === 'elegido' ? 'a elección' : target;
}

/** Un decimal, con coma. Igual que en la carta de pretemporada. */
function decimal(n: number): string {
    return n.toFixed(1).replace('.', ',');
}
