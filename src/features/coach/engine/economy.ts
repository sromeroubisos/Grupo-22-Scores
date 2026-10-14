// La caja del club.
//
// Acá está la adaptación más importante del juego. El simulador de fútbol del
// que viene el formato tiene presupuesto de fichajes, sueldos, valor de mercado
// y deuda. En el rugby de clubes argentino NADA de eso existe: es amateur.
// Copiar esa economía tal cual haría que el juego mienta, y cualquiera que juegue
// al rugby se da cuenta en la primera pantalla.
//
// La traducción:
//
//   presupuesto de fichajes  →  la cuota social, el buffet, la rifa, el sponsor
//   sueldos del plantel      →  canchas, botiquín, indumentaria, arbitrajes
//   valor de mercado         →  no existe: un jugador no se compra
//   comprar un jugador       →  retener al que se va
//   vender al crack          →  el que se va a Europa: no cobrás nada y lo perdés
//
// Y EL GASTO QUE DEFINE LA TEMPORADA ES EL VIAJE. Clasificar al Torneo del
// Interior es deportivamente glorioso y económicamente un problema: hay que
// llevar veintiséis personas a Tucumán tres fines de semana. Esa tensión
// —"ganamos, y ahora cómo pagamos el micro"— no existe en ningún juego de
// deportes y es la médula del rugby de club argentino.

import type { ClubDef } from '../data/clubs.ts';
import { getCompetition } from '../data/competitions.ts';
import { COACHING_STAFF_ANNUAL, statusOf } from '../data/professionalism.ts';
import type { ClubFinances } from '../types/coach.ts';

/** Cuánto paga un socio por año. */
export const CUOTA_ANUAL = 60_000;
/**
 * Lo que deja el buffet por socio y por año. La parte fija es la mayor y la
 * variable es chica a propósito: un club con la gente a pleno vende más
 * choripanes que uno vacío, pero no cinco veces más. Cuando esto escalaba
 * entero con la hinchada, el club grande ganaba 20.000 por socio más que el
 * chico y ninguna estructura de costos alcanzaba para emparejar las dos puntas.
 */
const BUFFET_FIJO_POR_SOCIO = 14_000;
const BUFFET_VARIABLE_POR_SOCIO = 8_000;
/** Lo que pone el sponsoreo por punto de acompañamiento de la gente. */
const SPONSOR_POR_PUNTO = 21_000;
/**
 * Lo que baja la unión por punto de nivel, y va MÁS ABAJO cuanto más abajo está
 * el torneo: la plata de desarrollo se manda al que la necesita, no al Top 14,
 * que se financia solo con su sponsoreo.
 *
 * `nivel` crece hacia abajo (2 es el Top 14, 5 es Primera C), así que el
 * multiplicador es el nivel y no su complemento. Estuvo al revés y se notaba:
 * Primera C entera cerraba el primer año con la caja vacía, dirigiera quien
 * dirigiera.
 */
const SUBSIDIO_POR_NIVEL = 1_300_000;

/**
 * Lo que cuesta sostener al club por socio y por año: los planteles de todas las
 * categorías, el M19, la intermedia, el femenino, la sede.
 *
 * Es el costo que faltaba y sin él la economía no significaba nada: con los
 * costos casi fijos, cualquier club cerraba el año con 30 a 60 millones de
 * superávit sobre una caja inicial de 10 a 21, así que el micro al Interior
 * —trece millones— no le dolía a nadie y el eje económico quedaba de adorno.
 *
 * Bajó de 34.000 a 31.000 en la 2.0.0: el cuerpo técnico de PRIMERA salió de acá
 * y ahora es un egreso propio (`COACHING_STAFF_ANNUAL`), que depende del estatus
 * de la división y no de cuántos socios tiene el club.
 */
const COSTO_POR_SOCIO = 31_000;

/** Mantenimiento de cancha, gimnasio y sede, por punto de estructura. */
const COSTO_ESTRUCTURA = 250_000;
/** Indumentaria de la temporada: dos juegos de camisetas y el resto. */
const COSTO_INDUMENTARIA = 3_500_000;
/** Botiquín, kinesiología y el seguro del plantel. */
const COSTO_SANIDAD = 2_400_000;
/** Arbitrajes por fecha. */
const COSTO_ARBITRAJE = 220_000;

/** El plantel que viaja. Veintiséis, o veintidós si se decide viajar corto. */
export const PLANTEL_VIAJANTE = 26;
/**
 * Micro, comida y alojamiento por persona, en un viaje del torneo regional. No
 * es lo mismo cruzar el conurbano que ir de Tucumán a Jujuy: en la URBA el viaje
 * es un micro de ida y vuelta en el día; en el interior son trescientos
 * kilómetros y a veces una noche. Hasta la 1.4.0 era 42.000 para todos, y así el
 * interior cerraba con superávits del 15 al 20 % y la URBA de abajo en rojo.
 * Medido el 2026-10-14 (año 1, entrenador neutro, con sueldos, cuerpo técnico,
 * entradas): con 32.000 / 48.000 el club MEDIANO de cada división cierra entre
 * −7 % (NEA A; Torneo Austral −5 %) y +17 % (Desarrollo Chubut, Pampeano B) de lo
 * que entra; el del Top 14, +3 %; Primera A, +11 %; Primera C, +6 %. Ninguna
 * división tiene un solo club en rojo el año 1 con la caja inicial. Con 56.000
 * en el interior, Alto Valle dejaba 5 de 12 clubes en rojo el primer año.
 */
const VIAJE_URBA = 32_000;
const VIAJE_INTERIOR = 48_000;
/**
 * Las ligas de un solo corredor, donde el viaje es como en la URBA: el Alto
 * Valle son cien kilómetros de ruta 22 entre Neuquén, Cipolletti y Roca. Con la
 * tarifa del interior era la única división con la mediana en −12 % y todos sus
 * clubes iban a la deuda crónica sin que el entrenador hiciera nada mal.
 */
const LIGAS_DE_CORREDOR: ReadonlySet<string> = new Set(['ar-patagonia-alto-valle']);
/** Lo mismo, pero para el Torneo del Interior: son mil kilómetros, no cien. */
const VIAJE_TDI = 165_000;

/**
 * Las entradas de un partido de local: precio y público que paga (el socio entra
 * con la cuota), por escalón económico. El público se mueve con la gente:
 * a la mitad con la hinchada en cero, al 150 % con la hinchada a pleno.
 *
 * Medido el 2026-10-14 con la hinchada inicial: un club medio del Top 14 recauda
 * ~12 M en sus trece partidos de local (el 10 % de lo que entra); uno de Primera
 * A, ~5 M; uno del Pampeano B, ~0,3 M. Es plata que importa arriba y es un
 * detalle abajo, como en la cancha.
 */
const PRECIO_ENTRADA: Readonly<Record<number, number>> = { 2: 2_500, 3: 2_000, 4: 1_500, 5: 1_000 };
const PUBLICO_QUE_PAGA: Readonly<Record<number, number>> = { 2: 300, 3: 180, 4: 100, 5: 60 };

/**
 * Interés anual sobre el descubierto: la deuda corriente con proveedores, la
 * unión y el banco. Es más caro que el préstamo de la unión a propósito: el
 * préstamo existe para pasar deuda cara a deuda ordenada.
 */
export const INTERES_DESCUBIERTO = 0.15;

/**
 * Con deuda, los sponsors piden más garantías y ponen menos: un 10 % menos de
 * atractivo (doc 2.4, estado "ajustada"). Es chico a propósito: una deuda que
 * hunde los ingresos se realimenta sola y el club entra en espiral en un año.
 */
const SPONSOR_CON_DEUDA = 0.9;

/** Cuántos socios tiene un club, derivado de su porte. No se guarda: se deriva. */
export function sociosOf(club: ClubDef): number {
    return Math.round(150 + club.rep * 22 + club.rating * 6);
}

/** La caja con la que arranca una carrera: unos meses de operación, no más. */
export function initialFinances(club: ClubDef): ClubFinances {
    const socios = sociosOf(club);
    return {
        socios,
        // Entre la estructura de un club de Primera C y la de uno del Top 14 hay
        // un factor de 4, no de 4.000: en rugby amateur el rango es chato.
        estructura: clamp(Math.round(18 + club.rating * 1.35), 10, 92),
        hinchada: clamp(Math.round(28 + club.rep * 0.9), 15, 95),
        caja: Math.round(socios * CUOTA_ANUAL * 0.3),
    };
}

export interface SeasonBudget {
    cuotas: number;
    /** Cuotas de esta temporada que ya se cobraron por adelantado el año anterior (ya descontadas de `cuotas`). */
    cuotasAdelantadas: number;
    buffet: number;
    sponsors: number;
    subsidio: number;
    /** Partidos de local por el público que paga. */
    entradas: number;
    /** Lo que suma la subcomisión por los objetivos cumplidos el año anterior. */
    aporteSubcomision: number;
    /**
     * Compensaciones por jugadores que se fueron en la temporada (etapa 3). Entran
     * al cierre, no el día de la venta: son plata del año, como las cuotas.
     */
    compensaciones: number;
    ingresos: number;

    /** Sostener las categorías: el M19, la intermedia, el femenino. */
    categorias: number;
    estructuraCosto: number;
    indumentaria: number;
    sanidad: number;
    arbitrajes: number;
    viajesLiga: number;
    viajesCopa: number;
    /** Becas, viáticos y contratos del plantel de primera, por doce meses. */
    sueldos: number;
    /** El staff de primera, según el estatus de la división. */
    cuerpoTecnico: number;
    /** Lo que cuesta mantener las mejoras compradas. */
    mantenimientoMejoras: number;
    /** Del descubierto y del préstamo de la unión. */
    intereses: number;
    /** El capital del préstamo que se devuelve este año. */
    amortizacion: number;
    /** Lo que la subcomisión recorta por los objetivos incumplidos el año anterior. */
    recorteSubcomision: number;
    /** Lo que se pagó por liberar contratos antes de tiempo (etapa 3). */
    indemnizaciones: number;
    egresos: number;

    /** Ingresos menos egresos. Puede ser negativo: eso es una temporada en rojo. */
    resultado: number;
}

export interface BudgetArgs {
    finances: ClubFinances;
    competitionId: string;
    /** Fechas del torneo regular. */
    fechas: number;
    /** Partidos del TDI. Cada uno es un fin de semana lejos. */
    partidosCopa: number;
    /** Viajar con 22 en vez de 26 abarata el micro. */
    bancoCorto: boolean;
    /** Gestión del entrenador, 1..10: lo que consigue de sponsors y de la unión. */
    gestion: number;
    /** Fracción del costo de los viajes que se ahorra con el micro propio. 0 sin mejora. */
    ahorroViajes?: number;
    /** Lo que cobra el plantel en el año (`payrollOf`). 0 si no se pasa. */
    sueldos?: number;
    /** Mantenimiento anual de las mejoras (`upkeepOf`). 0 si no se pasa. */
    mantenimientoMejoras?: number;
    /** El préstamo de la unión vigente, si hay. */
    loan?: { balance: number; rate: number; payment: number } | null;
    /** Cuotas de este año cobradas por adelantado el año anterior. */
    cuotasAdelantadas?: number;
    /** El ajuste de la subcomisión, como fracción de los ingresos propios (−0,1..+0,1). */
    boardBudget?: number;
    /** Mantenimiento diferido: la estructura y las mejoras cuestan menos este año. */
    mantenimientoDiferido?: boolean;
    /** Compensaciones cobradas por jugadores que se fueron. 0 si no se pasa. */
    compensaciones?: number;
    /** Lo pagado por liberar contratos. 0 si no se pasa. */
    indemnizaciones?: number;
}

/** Qué fracción se ahorra al diferir el mantenimiento: de la estructura y de las mejoras. */
export const DIFERIDO_ESTRUCTURA = 0.4;
export const DIFERIDO_MEJORAS = 0.5;

/**
 * El presupuesto de una temporada. `partidosCopa` son los del Torneo del
 * Interior: cero si el club no clasificó, y de ahí sale la tensión.
 *
 * Todo lo nuevo de la 2.0.0 es opcional y vale cero si no se pasa, salvo lo que
 * se DERIVA de la división (el cuerpo técnico y las entradas) y de la caja (el
 * interés del descubierto y el castigo de los sponsors). El presupuesto completo
 * de una partida sale de `budgetOf` en `finance.ts`, que pasa todo.
 */
export function seasonBudget(args: BudgetArgs): SeasonBudget {
    const { finances, fechas, partidosCopa, bancoCorto, gestion } = args;
    const nivel = getCompetition(args.competitionId)?.level ?? 4;
    const status = statusOf(args.competitionId);
    const viajantes = bancoCorto ? 22 : PLANTEL_VIAJANTE;
    const gestionFactor = 0.8 + gestion / 25; // 1..10 → 0,84 .. 1,2
    const viajeFactor = 1 - clamp(args.ahorroViajes ?? 0, 0, 0.5);
    const enRojo = finances.caja < 0;

    const cuotasLlenas = Math.round(finances.socios * CUOTA_ANUAL);
    const cuotasAdelantadas = Math.min(cuotasLlenas, Math.max(0, Math.round(args.cuotasAdelantadas ?? 0)));
    const cuotas = cuotasLlenas - cuotasAdelantadas;
    const buffet = Math.round(
        finances.socios * (BUFFET_FIJO_POR_SOCIO + BUFFET_VARIABLE_POR_SOCIO * (finances.hinchada / 100)),
    );
    const sponsors = Math.round(
        finances.hinchada * SPONSOR_POR_PUNTO * gestionFactor * (enRojo ? SPONSOR_CON_DEUDA : 1),
    );
    const subsidio = Math.round(nivel * SUBSIDIO_POR_NIVEL * gestionFactor);
    const local = Math.floor(fechas / 2);
    const entradas = Math.round(
        local * (PRECIO_ENTRADA[nivel] ?? 1_500) * (PUBLICO_QUE_PAGA[nivel] ?? 100) * (0.5 + finances.hinchada / 100),
    );
    const propios = cuotasLlenas + buffet + sponsors + subsidio;
    const board = clamp(args.boardBudget ?? 0, -0.1, 0.1);
    const aporteSubcomision = board > 0 ? Math.round(propios * board) : 0;
    const recorteSubcomision = board < 0 ? Math.round(propios * -board) : 0;
    // Las compensaciones no entran en los ingresos PROPIOS (de ahí sale el ajuste
    // de la subcomisión): vender un jugador no es recaudar.
    const compensaciones = Math.max(0, Math.round(args.compensaciones ?? 0));
    const indemnizaciones = Math.max(0, Math.round(args.indemnizaciones ?? 0));
    const ingresos = cuotas + buffet + sponsors + subsidio + entradas + aporteSubcomision + compensaciones;

    const diferido = args.mantenimientoDiferido === true;
    const categorias = Math.round(finances.socios * COSTO_POR_SOCIO);
    const estructuraCosto = Math.round(finances.estructura * COSTO_ESTRUCTURA * (diferido ? 1 - DIFERIDO_ESTRUCTURA : 1));
    const arbitrajes = Math.round(fechas * COSTO_ARBITRAJE);
    // La mitad de las fechas se juegan afuera.
    const viajeRegional =
        args.competitionId.startsWith('ar-urba-') || LIGAS_DE_CORREDOR.has(args.competitionId) ? VIAJE_URBA : VIAJE_INTERIOR;
    const viajesLiga = Math.round((fechas / 2) * viajantes * viajeRegional * viajeFactor);
    const viajesCopa = Math.round(partidosCopa * viajantes * VIAJE_TDI * viajeFactor);
    const sueldos = Math.max(0, Math.round(args.sueldos ?? 0));
    const cuerpoTecnico = COACHING_STAFF_ANNUAL[status];
    const mantenimientoMejoras = Math.round(Math.max(0, args.mantenimientoMejoras ?? 0) * (diferido ? 1 - DIFERIDO_MEJORAS : 1));

    // El descubierto paga interés sobre lo que se debe al arrancar el año; el
    // préstamo, sobre lo que queda de capital. La cuota es fija: lo que no es
    // interés es capital que se devuelve.
    const loan = args.loan && args.loan.balance > 0 ? args.loan : null;
    const interesPrestamo = loan ? Math.round(loan.balance * loan.rate) : 0;
    const amortizacion = loan ? Math.min(loan.balance, Math.max(0, loan.payment - interesPrestamo)) : 0;
    const intereses = Math.round((enRojo ? -finances.caja * INTERES_DESCUBIERTO : 0) + interesPrestamo);

    const egresos =
        categorias
        + estructuraCosto
        + COSTO_INDUMENTARIA
        + COSTO_SANIDAD
        + arbitrajes
        + viajesLiga
        + viajesCopa
        + sueldos
        + cuerpoTecnico
        + mantenimientoMejoras
        + intereses
        + amortizacion
        + recorteSubcomision
        + indemnizaciones;

    return {
        cuotas,
        cuotasAdelantadas,
        buffet,
        sponsors,
        subsidio,
        entradas,
        aporteSubcomision,
        compensaciones,
        ingresos,
        categorias,
        estructuraCosto,
        indumentaria: COSTO_INDUMENTARIA,
        sanidad: COSTO_SANIDAD,
        arbitrajes,
        viajesLiga,
        viajesCopa,
        sueldos,
        cuerpoTecnico,
        mantenimientoMejoras,
        intereses,
        amortizacion,
        recorteSubcomision,
        indemnizaciones,
        egresos,
        resultado: ingresos - egresos,
    };
}

/**
 * Meses de deuda: cuánto tarda el club en salir del rojo con lo que entra. Es la
 * medida en la que piensa un tesorero, y la que usa la subcomisión para apretar.
 * Cero si la caja está en positivo.
 */
export function debtMonths(caja: number, ingresosAnuales: number): number {
    if (caja >= 0 || ingresosAnuales <= 0) return 0;
    return Math.round((-caja / ingresosAnuales) * 12);
}

/**
 * Los tres escalones de alarma: a los tres meses la subcomisión levanta la ceja,
 * a los seis te condiciona el plantel, y a los doce el club tiene un problema que
 * ya dejó de ser deportivo.
 */
export function debtLevel(months: number): 'sana' | 'ajustada' | 'complicada' | 'grave' {
    if (months <= 0) return 'sana';
    if (months < 3) return 'ajustada';
    if (months < 6) return 'complicada';
    return 'grave';
}

/** Formatea pesos como los lee alguien: "$ 24,6 M". */
export function formatMoney(pesos: number): string {
    const millones = pesos / 1_000_000;
    const signo = millones < 0 ? '−' : '';
    return `${signo}$ ${Math.abs(millones).toFixed(1).replace('.', ',')} M`;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
