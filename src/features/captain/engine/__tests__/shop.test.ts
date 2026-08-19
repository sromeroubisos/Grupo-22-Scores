// LA TIENDA: que lo que promete sea lo que hace, y que lo que acota acote.
//
// Este archivo se escribió con la disciplina del §2 del CLAUDE de captain —
// verificar que el canal exista antes de diseñar encima— y con la del §1.3: cada
// banda dice QUÉ MUNDO AFIRMA, no qué número da hoy.
//
// Las cuatro premisas que vigila, y son las cuatro reglas del sistema:
//
//   1. LA TIENDA ABRE CON EL CONTRATO. En amateur no hay plata, y por lo tanto
//      tampoco se gasta.
//   2. LOS PUNTOS NO PASAN EL TECHO, y de ahí sale el bucle entero del diseño:
//      lo caro sube el techo y recién entonces lo barato entra. Si esto se
//      rompiera, la tienda sería una fábrica de media.
//   3. EL AGUANTE TIENE SU PROPIO TOPE, porque es el único atributo que ningún
//      techo de media acota y el único que el envejecimiento nunca sube.
//   4. UN CONSUMIBLE DEVUELVE EXACTAMENTE LO QUE DIO. No lo que el catálogo
//      promete: lo que entró después del recorte.
//
// Y una que no es del sistema sino del motor entero: COMPRAR NO CONSUME AZAR.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState } from '../../types/captain.ts';
import type { PositionFamilyId } from '../../types/player.ts';
import { ALL_FAMILIES, POSITION_FAMILIES, mainAttributeOf } from '../../data/positions.ts';
import {
    SHOP_ITEMS,
    SHOP_PREFIX,
    getShopItem,
    resolveShopTarget,
} from '../../data/shop.ts';
import { CLUBS } from '../../data/catalogs.ts';
import { salaryFor } from '../clubs.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { applyHeadRegression, applySeriousInjuryRegression } from '../aging.ts';
import { createRng } from '../random.ts';
import { ovrOf, potentialOf, shopCeilingOf } from '../ovr.ts';
import {
    SHOP_AGUANTE_CAP,
    SHOP_BELONGING_CAP,
    aguanteBoughtOf,
    aguanteCapOf,
    belongingBoughtOf,
    buyShopItem,
    canBuy,
    shopPerks,
    shopSpentOf,
    tickShop,
} from '../shop.ts';
import { belongingOf } from '../belonging.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  Un profesional de laboratorio
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un jugador con contrato y plata. La etapa se pisa a mano y no se llega a ella
 * jugando: llegar firmando pediría una carrera entera y este archivo mide la
 * tienda, no el mercado.
 */
function pro(family: PositionFamilyId, money = 3_000_000): CaptainState {
    const state = createInitialCaptain(
        { name: 'Test', surname: 'Jugador', family, countryCode: 'ar' },
        4242,
    );
    state.stage = 'professional';
    state.money = money;
    return state;
}

/** El mismo, pero clavado en su techo: no le queda un punto por crecer. */
function enElTecho(family: PositionFamilyId, money = 3_000_000): CaptainState {
    const state = pro(family, money);
    state.player.potentialBase = state.player.ovr;
    state.player.built = 0;
    return state;
}

const item = (id: string) => getShopItem(id)!;

// ═══════════════════════════════════════════════════════════════════════════
//  0 · LA FORMA DEL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

test('cada ítem lleva el prefijo de su góndola y un id único', () => {
    const vistos = new Set<string>();
    for (const it of SHOP_ITEMS) {
        assert.ok(
            it.id.startsWith(SHOP_PREFIX[it.category]),
            `${it.id} está en la góndola '${it.category}' y su prefijo tendría que ser '${SHOP_PREFIX[it.category]}'`,
        );
        assert.ok(!vistos.has(it.id), `id repetido: ${it.id}`);
        vistos.add(it.id);
        assert.ok(it.price > 0, `${it.id} no tiene precio`);
        assert.ok(it.hint.length > 0, `${it.id} no dice qué hace`);
    }
});

test('LO QUE SE APAGA ES SOLO PUNTOS: un consumible no lleva techo ni regla', () => {
    // Es la invariante que hace posible `tickShop`. Un consumible que levantara
    // el techo o encendiera una regla obligaría, al vencer, a desarmar media
    // carrera: bajar un techo que otros puntos ya persiguieron, o apagar una
    // inmunidad después de que el cuerpo cobró de menos durante dos temporadas.
    for (const it of SHOP_ITEMS) {
        if (it.seasons === undefined) continue;
        assert.equal(it.ceiling, undefined, `${it.id} vence y levanta el techo: eso no se puede deshacer`);
        assert.equal(it.rule, undefined, `${it.id} vence y enciende una regla`);
        assert.equal(it.peakShift, undefined, `${it.id} vence y corre un pico`);
        assert.equal(it.immune, undefined, `${it.id} vence y da una inmunidad`);
    }
});

test('EL PRINCIPAL DE UN PUESTO ES EL QUE MÁS PESA, no el que está primero', () => {
    // La §1.5 hecha assert: si mañana alguien reordena una familia para que se
    // lea mejor, `mainAttributeOf` tiene que seguir dando el de mayor peso.
    for (const id of ALL_FAMILIES) {
        const family = POSITION_FAMILIES[id];
        const principal = mainAttributeOf(id);
        const peso = family.weights[family.attributes.indexOf(principal)];
        assert.equal(
            peso,
            Math.max(...family.weights),
            `en ${id} el principal es ${principal} con peso ${peso}, y el máximo es ${Math.max(...family.weights)}`,
        );
    }
    // Los dos casos que el diseño nombra por su nombre.
    assert.equal(mainAttributeOf('apertura'), 'pegada');
    assert.equal(mainAttributeOf('tercera-linea'), 'tackle');
});

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LA PUERTA DEL CONTRATO
// ═══════════════════════════════════════════════════════════════════════════

test('EN AMATEUR NO HAY TIENDA: el rugby de club no paga y por lo tanto no se gasta', () => {
    const state = pro('apertura');
    state.stage = 'amateur';

    const veredicto = canBuy(state, item('vid-camioneta'));
    assert.equal(veredicto.ok, false);
    assert.match(veredicto.reason ?? '', /profesional/i, 'la razón tiene que decir qué falta');

    const antes = state.money;
    assert.equal(buyShopItem(state, 'vid-camioneta'), null, 'la compra tenía que rebotar');
    assert.equal(state.money, antes, 'se cobró una compra que no correspondía');
    assert.equal(state.player.shop.length, 0);
});

test('sin plata no se compra, y el botón dice cuánto falta', () => {
    // Se mide con el gimnasio y no con la escuelita a propósito: la escuelita
    // además pide ser Referente, y `canBuy` contesta con el corte que encuentra
    // primero. Un test que mezcle las dos puertas no mide ninguna de las dos.
    const state = pro('apertura', 10_000);
    const veredicto = canBuy(state, item('clu-gimnasio'));
    assert.equal(veredicto.ok, false);
    assert.match(veredicto.reason ?? '', /faltan/i);
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · EL BUCLE DEL DISEÑO: lo caro sube el techo, lo barato lo llena
// ═══════════════════════════════════════════════════════════════════════════

test('EN EL TECHO, LOS PUNTOS NO ENTRAN — y la tienda lo dice antes de cobrar', () => {
    // Es la regla que impide que la tienda sea una fábrica de media. Si esto
    // falla, cualquiera compra cuatro ítems de puntos y se saltea el sorteo del
    // material que define la población entera del juego.
    const state = enElTecho('apertura');
    const veredicto = canBuy(state, item('car-analista'));

    assert.equal(veredicto.ok, false, 'se pudo comprar un ítem de puntos estando en el techo');
    assert.match(veredicto.reason ?? '', /techo/i);

    const antes = state.money;
    assert.equal(buyShopItem(state, 'car-analista'), null);
    assert.equal(state.money, antes, 'se cobró algo que no iba a entregar nada');
});

test('EL TECHO PRIMERO Y LOS PUNTOS DESPUÉS: ese orden ES la mecánica', () => {
    const state = enElTecho('apertura');
    const techoAntes = potentialOf(state.player);
    const mediaAntes = ovrOf(state.player);

    // 1 · El entrenador de puesto le sube el techo a la Pegada, que es lo que
    //     más pesa en la media de un apertura.
    assert.ok(buyShopItem(state, 'car-entrenador'), 'el ítem de techo tiene que poder comprarse en el techo');
    const techoDespues = potentialOf(state.player);

    assert.ok(
        techoDespues > techoAntes,
        `el techo no se movió: ${techoAntes} → ${techoDespues}`,
    );
    assert.equal(ovrOf(state.player), mediaAntes, 'el ítem de techo no puede subir la media por su cuenta');

    // 2 · Y recién ahora el analista tiene adónde entrar.
    const veredicto = canBuy(state, item('car-analista'));
    assert.equal(veredicto.ok, true, `el analista sigue sin entrar: ${veredicto.reason}`);

    assert.ok(buyShopItem(state, 'car-analista'));
    assert.ok(
        ovrOf(state.player) > mediaAntes,
        'con el techo levantado, los puntos tenían que mover la media',
    );
    assert.ok(
        ovrOf(state.player) <= potentialOf(state.player),
        'la media pasó el techo: el recorte no corrió',
    );
});

test('el techo comprado depende del PUESTO: el mismo coach no vale lo mismo para todos', () => {
    // Es la consecuencia que el diseño busca y la que hace que ningún ítem sea
    // el mejor para los quince puestos. El coach le sube el techo a la Pegada si
    // sos back y al Tackle si sos forward — y de los ocho puestos, solo algunos
    // tienen ese atributo adentro de su media.
    const aportes = ALL_FAMILIES.map((family) => {
        const state = enElTecho(family);
        buyShopItem(state, 'car-coach');
        return { family, aporte: shopCeilingOf(state.player) };
    });

    assert.ok(
        aportes.some((a) => a.aporte > 0.05),
        'el coach no le mueve el techo a nadie: el canal no transporta',
    );
    assert.ok(
        aportes.some((a) => a.aporte < 0.05),
        'el coach le mueve el techo a los ocho puestos por igual, y entonces el puesto no decide nada',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL AGUANTE, QUE VA POR OTRO LADO
// ═══════════════════════════════════════════════════════════════════════════

test('EL AGUANTE NO INFLA LA MEDIA: por eso es el más barato de subir', () => {
    // Es la separación que evita que las compras de cuerpo se conviertan en
    // media. Si esto fallara, siete ítems de aguante serían siete ítems de OVR.
    const state = pro('apertura');
    const mediaAntes = ovrOf(state.player);
    const aguanteAntes = state.player.attrs.aguante;

    assert.ok(buyShopItem(state, 'cue-kinesiologo'));

    assert.ok(state.player.attrs.aguante > aguanteAntes, 'el aguante no subió');
    assert.equal(ovrOf(state.player), mediaAntes, 'el aguante movió la media, y no está en la media de nadie');
});

test('EL AGUANTE COMPRABLE TIENE TOPE, y el gimnasio del club lo levanta', () => {
    // El catálogo ofrece veintidós puntos de aguante. Sin tope, comprarlos todos
    // alargaría todas las carreras profesionales del juego y la tienda dejaría de
    // ser una decisión para ser una lista de compras.
    const state = pro('apertura');
    assert.equal(aguanteCapOf(state.player), SHOP_AGUANTE_CAP);

    // Los cuatro más baratos del cuerpo suman 4 + 3 + 2 + 2 = 11, y con la
    // camioneta y la chacra se pasan de doce.
    for (const id of ['cue-kinesiologo', 'cue-recuperacion', 'cue-nutricion', 'vid-camioneta', 'vid-chacra']) {
        buyShopItem(state, id);
    }

    assert.ok(
        aguanteBoughtOf(state.player) <= SHOP_AGUANTE_CAP + 1e-9,
        `se compraron ${aguanteBoughtOf(state.player)} puntos de aguante con un tope de ${SHOP_AGUANTE_CAP}`,
    );

    // Y el gimnasio corre el tope, que es lo único que un «techo de aguante»
    // puede querer decir: el aguante no está en la media de nadie, así que el
    // techo de la media no lo puede acotar.
    const gimnasio = pro('apertura');
    buyShopItem(gimnasio, 'clu-gimnasio');
    assert.ok(
        aguanteCapOf(gimnasio.player) > SHOP_AGUANTE_CAP,
        'el gimnasio no levantó el tope del aguante: su ficha de techo no hace nada',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LO QUE SE APAGA
// ═══════════════════════════════════════════════════════════════════════════

test('UN CONSUMIBLE DEVUELVE EXACTAMENTE LO QUE DIO, ni más ni menos', () => {
    // Se devuelve `applied` y no lo que el catálogo promete, y la diferencia es
    // real: unos botines recortados contra el techo entregan menos de dos puntos
    // y devolver dos dejaría al jugador PEOR que antes de comprarlos.
    const state = pro('apertura');
    const pegadaAntes = state.player.attrs.pegada;

    assert.ok(buyShopItem(state, 'tem-botines'));
    assert.ok(state.player.attrs.pegada > pegadaAntes, 'los botines no dieron nada');

    // Primera temporada: siguen puestos.
    assert.deepEqual(tickShop(state.player), []);
    assert.ok(state.player.attrs.pegada > pegadaAntes, 'los botines vencieron una temporada antes');

    // Segunda: se terminan.
    const vencidos = tickShop(state.player);
    assert.equal(vencidos.length, 1, 'el vencimiento no dejó crónica');
    assert.equal(state.player.attrs.pegada, pegadaAntes, 'no devolvió lo mismo que había dado');
    assert.equal(state.player.shop.length, 0, 'el consumible vencido tiene que poder volver a comprarse');
});

test('un consumible que venció se puede volver a comprar', () => {
    const state = pro('apertura');
    buyShopItem(state, 'tem-clinica');
    assert.equal(canBuy(state, item('tem-clinica')).owned, true);

    tickShop(state.player);
    tickShop(state.player);
    assert.equal(canBuy(state, item('tem-clinica')).ok, true, 'vencido y sigue diciendo que ya lo tenés');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LA PERTENENCIA NO SE COMPRA ENTERA
// ═══════════════════════════════════════════════════════════════════════════

test('LAS OBRAS ACELERAN LA PERTENENCIA, NO LA REEMPLAZAN', () => {
    // Las tres obras piden veinte y el tope es doce: alcanza para entrar a
    // Titular antes de tiempo, no alcanza para comprar Referente. La Pertenencia
    // es la moneda que define el final del juego y se gana quedándose.
    const state = pro('apertura');
    // La escuelita pide ser Referente, así que se llega con las otras dos y con
    // lo que el club ya tenía: lo que se mide acá es el tope, no la puerta.
    buyShopItem(state, 'clu-luces');
    buyShopItem(state, 'clu-gimnasio');

    assert.ok(
        belongingBoughtOf(state.player) <= SHOP_BELONGING_CAP,
        `las obras dieron ${belongingBoughtOf(state.player)} y el tope es ${SHOP_BELONGING_CAP}`,
    );
    assert.ok(
        belongingOf(state.belonging, state.player.clubId) > 0,
        'las obras no movieron la Pertenencia: el canal no transporta',
    );
});

test('la escuelita pide ser Referente, y lo dice', () => {
    const state = pro('apertura');
    const veredicto = canBuy(state, item('clu-escuelita'));
    assert.equal(veredicto.ok, false);
    assert.match(veredicto.reason ?? '', /Referente/);
});

// ═══════════════════════════════════════════════════════════════════════════
//  6 · EL CUERPO: lo que se evita y lo que se devuelve
// ═══════════════════════════════════════════════════════════════════════════

test('EL KINESIÓLOGO EVITA LO QUE LA LESIÓN SE LLEVA DEL AGUANTE, y la tirada se hace igual', () => {
    // La segunda mitad importa tanto como la primera: si la tirada dependiera de
    // lo comprado, comprar el ítem correría el stream del rng en vez de cambiar
    // un número, y dos partidas con la misma semilla dejarían de ser comparables.
    const sin = pro('tercera-linea');
    const con = pro('tercera-linea');
    buyShopItem(con, 'cue-kinesiologo');

    const aguanteSin = sin.player.attrs.aguante;
    const aguanteCon = con.player.attrs.aguante;

    applySeriousInjuryRegression(sin.player, createRng(7), shopPerks(sin.player));
    applySeriousInjuryRegression(con.player, createRng(7), shopPerks(con.player));

    assert.ok(sin.player.attrs.aguante < aguanteSin, 'la lesión no cobró aguante');
    assert.equal(con.player.attrs.aguante, aguanteCon, 'el kinesiólogo no evitó la pérdida de aguante');

    // Y las dos ramas siguen igual de castigadas en lo que el ítem NO cubre: la
    // tirada es la misma porque se hizo igual.
    assert.equal(
        sin.player.attrs.velocidad,
        con.player.attrs.velocidad,
        'el ítem corrió el stream del rng: las dos ramas recibieron tiradas distintas',
    );
});

test('EL CIRUJANO DEVUELVE LO QUE LA LESIÓN SACÓ, y solo si hay algo que operar', () => {
    const state = pro('tercera-linea');

    // Sin lesión previa no hay rodilla que operar, y el botón lo dice.
    const cerrado = canBuy(state, item('cue-cirujano'));
    assert.equal(cerrado.ok, false);
    assert.match(cerrado.reason ?? '', /rompiste/i);

    const velocidadAntes = state.player.attrs.velocidad;
    applySeriousInjuryRegression(state.player, createRng(11), shopPerks(state.player));
    assert.ok(state.player.attrs.velocidad < velocidadAntes, 'la lesión no cobró');

    assert.equal(canBuy(state, item('cue-cirujano')).ok, true, 'con lesión encima, el cirujano tiene que estar');
    assert.ok(buyShopItem(state, 'cue-cirujano'));

    assert.equal(state.player.attrs.velocidad, velocidadAntes, 'no devolvió lo que la lesión sacó');
    assert.deepEqual(state.player.injuryLoss, {}, 'el saldo pendiente tenía que quedar en cero');
});

test('EL SEGUIMIENTO NEUROLÓGICO EVITA EL GOLPE QUE VIENE, nunca el que ya pasó', () => {
    // Es la única pérdida del juego que no se puede deshacer, y tiene que
    // seguirlo siendo: el cirujano devuelve lo de la rodilla, la cabeza no.
    const sin = pro('apertura');
    const con = pro('apertura');
    buyShopItem(con, 'cue-neuro');

    const visionSin = sin.player.attrs.vision;
    const visionCon = con.player.attrs.vision;

    applyHeadRegression(sin.player, 3, shopPerks(sin.player));
    applyHeadRegression(con.player, 3, shopPerks(con.player));

    assert.ok(sin.player.attrs.vision < visionSin, 'los HIA no cuestan visión: la cuenta de la cabeza sigue sin leerse');
    assert.equal(con.player.attrs.vision, visionCon, 'el seguimiento no evitó la pérdida');
});

// ═══════════════════════════════════════════════════════════════════════════
//  7 · EL MOTOR
// ═══════════════════════════════════════════════════════════════════════════

test('COMPRAR NO CONSUME AZAR', () => {
    // Si comprar tirara un dado, dos partidas con la misma semilla que compran
    // distinto recibirían Momentos distintos, y la diferencia entre ellas dejaría
    // de ser lo que la tienda hizo para pasar a ser el stream corrido. Es la
    // condición que hace medible el sistema entero (CLAUDE de captain §1.10).
    const state = pro('apertura');
    const rngAntes = state.rngState;

    const next = captainReducer(state, { type: 'BUY', itemId: 'vid-camioneta' });

    assert.notEqual(next, state, 'la compra no se aplicó');
    assert.equal(next.rngState, rngAntes, 'comprar movió el estado del rng');
});

test('la tienda solo abre en la pretemporada', () => {
    const state = pro('apertura');
    state.phase = 'season';
    assert.equal(
        captainReducer(state, { type: 'BUY', itemId: 'vid-camioneta' }),
        state,
        'se pudo comprar fuera de la pretemporada',
    );
});

test('lo gastado sale del catálogo y coincide con lo que se descontó', () => {
    const state = pro('apertura', 1_000_000);
    const antes = state.money;

    buyShopItem(state, 'vid-camioneta');
    buyShopItem(state, 'car-analista');

    assert.equal(shopSpentOf(state.player), antes - state.money, 'el gasto derivado no coincide con el saldo');
});

test('un ítem de elección no hace nada hasta que se elige', () => {
    const state = pro('apertura');
    const sinElegir = canBuy(state, item('tem-pretemporada'));
    assert.equal(sinElegir.ok, false);
    assert.match(sinElegir.reason ?? '', /eleg/i);

    assert.equal(buyShopItem(state, 'tem-pretemporada'), null);
    assert.ok(buyShopItem(state, 'tem-pretemporada', 'liderazgo'));
    assert.equal(state.player.shop[0].attr, 'liderazgo');

    // Y es una por temporada: la segunda del mismo año rebota con su razón.
    const segunda = canBuy(state, item('tem-pretemporada'), 'vision');
    assert.equal(segunda.ok, false);
    assert.match(segunda.reason ?? '', /temporada/i);
});

test('LA GÓNDOLA ES MÁS CARA QUE UNA CARRERA DE ESCALÓN MEDIO', () => {
    // ── QUÉ MUNDO AFIRMA (CLAUDE de captain §1.3) ───────────────────────────
    // Que el precio de las cosas está atado a la ESCALERA DE SUELDOS del rugby y
    // no a un número de gusto: el que hace carrera en el segundo escalón
    // profesional —Championship inglés, Pro D2— tiene que poder comprar la
    // góndola barata y mirar la cara desde afuera. Si el catálogo entero entrara
    // en una carrera de ese nivel, la tienda dejaría de ser una decisión.
    //
    // Se mide contra `salaryFor` y no contra un número escrito acá, así que
    // tocar la tabla de sueldos mueve este test solo. La carrera de referencia
    // son doce temporadas, que es el largo típico según `damage.ts`.
    //
    // ── LO QUE ESTE TEST NO DICE, Y HAY QUE SABERLO ─────────────────────────
    // Que la carrera de ÉLITE compra todo. Medido sobre 40 carreras simuladas a
    // nivel `bien`: pico de saldo mediano 8,1 millones contra 5,3 del catálogo
    // entero. No se convierte en un rojo acá porque ese número está tomado sobre
    // un motor cuya pirámide está declarada rota —las tres `ALARMA-VIVA` de
    // `calibration.test.ts` y `agency.test.ts` miden que llegar arriba dejó de
    // ser raro— y calibrar el precio contra esa medición sería codificar el mundo
    // roto en la tienda. Cuando la pirámide vuelva a su banda, esto se vuelve a
    // medir.
    const CARRERA_TIPICA = 12;

    // DERIVADA, y hasta la 0.25.0 era un número escrito acá —95.000, «el centro
    // de la banda pro-second»— que el comentario de arriba ya prometía que no
    // existía. Dejó de ser cierto en cuanto el sueldo pasó a depender también de
    // la media del jugador: el centro de una banda no es lo que cobra nadie.
    //
    // El jugador de referencia es el que está A LA ALTURA de su club, que es la
    // carrera típica de este escalón, y el club es el de rating MEDIANO entre los
    // del nivel —una estadística, no un club elegido a dedo—.
    const escalonMedio = CLUBS
        .filter((c) => c.level === 'pro-second')
        .sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
    const mediano = escalonMedio[Math.floor(escalonMedio.length / 2)];
    assert.ok(mediano, 'el catálogo se quedó sin clubes de `pro-second`');
    const SUELDO_ESCALON_MEDIO = salaryFor(mediano, mediano.rating);

    const catalogo = SHOP_ITEMS.reduce((a, it) => a + it.price, 0);
    const ganaEnLaCarrera = SUELDO_ESCALON_MEDIO * CARRERA_TIPICA;

    assert.ok(
        catalogo > ganaEnLaCarrera * 2,
        `el catálogo cuesta ${catalogo} y una carrera de escalón medio junta ${ganaEnLaCarrera}: `
        + 'la góndola entra en un solo bolsillo y elegir dejó de costar algo',
    );

    // Y del otro lado: la góndola barata TIENE que entrar, o el que no llegó a
    // Europa se queda mirando una pantalla que no puede tocar.
    //
    // ── POR QUÉ ESTÁ EN ROJO (CLAUDE de captain §1.1) ───────────────────────
    // La premisa no se movió y por eso la banda tampoco: el que hace carrera en
    // el segundo escalón tiene que poder comprar el extremo barato. Lo que se
    // movió es el mundo. Hasta la 0.24.0 el escalón medio cobraba 95.000 al año
    // porque el sueldo salía SOLO del club —el centro de la banda `pro-second`—
    // y esos 95.000 no eran lo que cobraba nadie: eran el promedio de un tramo.
    // Con `salaryFor(club, ovr)` el que está a la altura de su club de
    // `pro-second` cobra 33.000, que es lo que cobra de verdad un jugador de
    // Pro D2, y la carrera de doce temporadas junta 396.000 en vez de 1.140.000.
    //
    // Falla por UN ítem y por 11.000 pesos: entran cinco (16.000 a 55.000) y el
    // sexto, `car-analista`, sale 110.000 contra un techo de 99.000. Los precios
    // de `data/shop.ts` están anclados a la escala de sueldos vieja y hay que
    // recalibrarlos contra la nueva — que es el mismo trabajo pendiente que el
    // bloque de arriba ya declara para la punta de arriba de la góndola, y que
    // espera a que la pirámide vuelva a su banda por el mismo motivo.
    const baratos = SHOP_ITEMS.filter((it) => it.price <= ganaEnLaCarrera / 4);
    assert.ok(
        // ALARMA-VIVA: los precios de la tienda siguen anclados a la escala de sueldos anterior a la 0.25.0
        baratos.length >= 6,
        `solo ${baratos.length} ítems entran en un cuarto de lo que junta una carrera media: la tienda es de pocos`,
    );
});

test('los targets dinámicos se resuelven contra el puesto, no contra una lista', () => {
    for (const family of ALL_FAMILIES) {
        assert.equal(resolveShopTarget('principal', family, null), mainAttributeOf(family));
        assert.equal(
            resolveShopTarget('grupo', family, null),
            POSITION_FAMILIES[family].group === 'back' ? 'pegada' : 'tackle',
        );
        assert.equal(resolveShopTarget('elegido', family, null), null, 'un elegido sin elección no le pega a nada');
        assert.equal(resolveShopTarget('vision', family, null), 'vision');
    }
});
