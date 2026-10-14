// El FORMATO de cada división, edición por edición.
//
// El grafo (quién sube a dónde, quién baja a dónde) sale del canon
// (`competitions.ts`). Lo que este archivo declara es CÓMO se juega cada año:
// cuántas ruedas, cómo se define el campeón, quién asciende directo, quién va a
// un reducido y quién desciende. Es catálogo, no lógica: el motor
// (`engine/season.ts`, `engine/run-season.ts`, `engine/world.ts`) lee esto y no
// tiene un solo `if` por torneo.
//
// Las reglas cambian entre temporadas —la URBA cambió las de 2026 con un año de
// anticipación—, así que cada división lleva una LISTA de ediciones con el año
// desde el que rige cada una. `formatFor(id, year)` devuelve la última edición
// que ya empezó. Una carrera que llega a 2031 juega con la última edición
// conocida hasta que alguien cargue la siguiente.
//
// Fuentes (2026-10-14):
//   · URBA: reglamento "Campeonato 2026" de la URBA y su comunicado de formatos
//     2025-2026 (urba.org.ar); Capital Rugby, 9/3/2026.
//   · Interior: las temporadas 2026 cargadas en G22 Scores (fases, cantidad de
//     partidos, cruces) y, donde 2026 todavía no tiene la fase final cargada, la
//     edición 2025 de G22 y la nota del canon. Esas van marcadas `aproximado` y
//     dicen qué parte del formato real el motor todavía no juega.
//
// Si cambiás una edición, subí `FORMATS_VERSION`: cambia quién asciende con la
// misma semilla, igual que un cambio de catálogo.

export const FORMATS_VERSION = '2026.1';

/** El año desde el que el juego tiene formatos declarados. */
export const FORMAT_BASE_YEAR = 2026;

/** Cómo se define el campeón de la división. */
export type TitleRule =
    /** El primero de la tabla es el campeón. */
    | { kind: 'table' }
    /**
     * Playoff con los `size` primeros. 2: final. 4: semis 1°-4° y 2°-3°. 6: los
     * dos primeros esperan en semis y 3°-6° / 4°-5° juegan cuartos. 8: cuartos
     * 1-8, 4-5, 2-7, 3-6. En semis se re-siembra: el mejor contra el peor.
     */
    | { kind: 'playoff'; size: 2 | 4 | 6 | 8 };

export interface PromotionRule {
    /** Asciende el campeón (el de la tabla o el del playoff, según `title`). */
    champion: boolean;
    /** Plazas directas MÁS, para los mejor ubicados que todavía no ascendieron. */
    direct: number;
    /**
     * Una plaza más en un reducido entre esas posiciones de la tabla (2°-5° en
     * la URBA: 2° vs 5° y 3° vs 4°, y la final). Si alguno ya ascendió, entra el
     * siguiente: el reducido siempre se juega completo.
     */
    reducido: { from: number; to: number } | null;
}

export interface RelegationRule {
    /** Los últimos N de la tabla descienden directo. */
    direct: number;
}

export interface FormatEdition {
    /** Primera temporada en la que rige. */
    fromYear: number;
    /** 1 = todos contra todos; 2 = ida y vuelta. */
    rounds: 1 | 2;
    title: TitleRule;
    /** null = no asciende nadie (es el techo de la rama, o no tiene vuelta). */
    promotion: PromotionRule | null;
    relegation: RelegationRule | null;
    /** `verificado` contra el reglamento; `aproximado` si el motor simplifica algo. */
    status: 'verificado' | 'aproximado';
    /** Lo que el motor no juega del formato real, dicho sin vueltas. Se muestra. */
    caveat: string | null;
    source: string;
}

const URBA_2026 = 'Reglamento URBA "Campeonato 2026" y comunicado de formatos 2025-2026 (urba.org.ar)';
const G22_2026 = 'Temporada 2026 cargada en G22 Scores';
const G22_2025 = 'Temporada 2025 cargada en G22 Scores (la fase final de 2026 todavía no está)';
const CANON = 'Canon 2026 (arSystem2026)';

const CHAMPION_ONLY: PromotionRule = { champion: true, direct: 0, reducido: null };
const CHAMPION_PLUS_REDUCIDO: PromotionRule = { champion: true, direct: 0, reducido: { from: 2, to: 5 } };
const CHAMPION_PLUS_SECOND: PromotionRule = { champion: true, direct: 1, reducido: null };

function urbaAscenso(): FormatEdition {
    return {
        fromYear: 2026,
        rounds: 2,
        title: { kind: 'table' },
        promotion: CHAMPION_PLUS_REDUCIDO,
        relegation: { direct: 2 },
        status: 'verificado',
        caveat: null,
        source: URBA_2026,
    };
}

function feederOnly(title: TitleRule, caveat: string): FormatEdition {
    return {
        fromYear: 2026,
        rounds: 2,
        title,
        promotion: null,
        relegation: null,
        status: 'aproximado',
        caveat,
        source: CANON,
    };
}

/**
 * Las ediciones, por id de competición. Ordenadas por `fromYear` ascendente
 * (hay un test). Toda división jugable tiene al menos la de `FORMAT_BASE_YEAR`.
 */
export const FORMAT_EDITIONS: Readonly<Record<string, readonly FormatEdition[]>> = {
    // ── URBA ──────────────────────────────────────────────────────────────
    'ar-urba-top14': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 2 },
            status: 'verificado',
            caveat: null,
            source: URBA_2026,
        },
    ],
    // Primera A, B, C y Segunda: el campeón de la fase regular (el primero)
    // asciende DIRECTO, sin playoff por el título. La segunda plaza sale de un
    // reducido del 2° al 5°. Los dos últimos descienden directo.
    'ar-urba-primera-a': [urbaAscenso()],
    'ar-urba-primera-b': [urbaAscenso()],
    'ar-urba-primera-c': [urbaAscenso()],
    'ar-urba-segunda': [urbaAscenso()],
    'ar-urba-tercera': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'table' },
            // Segunda devuelve dos: Tercera manda dos para arriba.
            promotion: CHAMPION_PLUS_REDUCIDO,
            relegation: { direct: 1 },
            status: 'aproximado',
            caveat:
                'El reglamento confirma que en Tercera desciende solo el último. El segundo ascenso se juega con el reducido del 2° al 5°, como en el resto del ascenso.',
            source: URBA_2026,
        },
    ],
    'ar-urba-desarrollo': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'table' },
            promotion: CHAMPION_ONLY,
            relegation: null,
            status: 'aproximado',
            caveat:
                'El campeón asciende si cumple los requisitos de infraestructura y de divisiones formativas. El juego no los evalúa: asciende siempre.',
            source: URBA_2026,
        },
    ],

    // ── Centro ────────────────────────────────────────────────────────────
    'ar-centro-top10': [
        {
            fromYear: 2026,
            rounds: 2,
            // 2025 en G22: 3°-6° y 4°-5° en cuartos, 1° y 2° esperan en semis.
            title: { kind: 'playoff', size: 6 },
            promotion: null,
            relegation: { direct: 1 },
            status: 'aproximado',
            caveat: null,
            source: G22_2025,
        },
    ],
    'ar-centro-super9b': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: CHAMPION_ONLY,
            relegation: null,
            status: 'aproximado',
            caveat: null,
            source: CANON,
        },
    ],

    // ── Litoral ───────────────────────────────────────────────────────────
    'ar-litoral-top10': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 1 },
            status: 'aproximado',
            caveat: 'En 2025 el último jugó una promoción contra el campeón de la Segunda. El juego lo hace descender directo.',
            source: G22_2025,
        },
    ],
    'ar-litoral-segunda': [
        {
            fromYear: 2026,
            rounds: 1,
            // 11 fechas y después la Copa de Oro del 1° al 6°: define el campeón y el ascenso.
            title: { kind: 'playoff', size: 6 },
            promotion: CHAMPION_ONLY,
            relegation: null,
            status: 'aproximado',
            caveat: 'La Copa de Oro (1° al 6°) es una liguilla. El juego la resuelve con una llave de seis.',
            source: CANON,
        },
    ],

    // ── Oeste ─────────────────────────────────────────────────────────────
    'ar-oeste-oro': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 1 },
            status: 'aproximado',
            caveat: 'El Torneo Reubicación entre Oro, Plata y Bronce no se juega. Desciende directo el último.',
            source: G22_2026,
        },
    ],
    'ar-oeste-plata': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: CHAMPION_ONLY,
            relegation: null,
            status: 'aproximado',
            caveat: 'El Torneo Reubicación entre Oro, Plata y Bronce no se juega. Asciende directo el campeón.',
            source: G22_2026,
        },
    ],

    // ── NOA ───────────────────────────────────────────────────────────────
    'ar-noa-a': [
        {
            fromYear: 2026,
            // 2026 en G22: diez clubes, una rueda (45 partidos).
            rounds: 1,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 2 },
            status: 'aproximado',
            caveat: 'En 2025 hubo una liguilla de permanencia con el NOA B. El juego hace descender directo a los dos últimos.',
            source: G22_2026,
        },
    ],
    'ar-noa-b': [
        {
            fromYear: 2026,
            rounds: 1,
            // 2026 en G22: 3°-6° y 4°-5° en el play off, 1° y 2° esperan en semis.
            title: { kind: 'playoff', size: 6 },
            promotion: CHAMPION_PLUS_SECOND,
            relegation: null,
            status: 'aproximado',
            caveat: 'El NOA A devuelve dos. El juego asciende al campeón y al mejor ubicado de los demás.',
            source: G22_2026,
        },
    ],
    'ar-noa-andina': [
        feederOnly(
            { kind: 'playoff', size: 2 },
            'El canon dice que el campeón alimenta al NOA B, pero el NOA B no devuelve descensos: no se mueve nadie.',
        ),
    ],

    // ── NEA ───────────────────────────────────────────────────────────────
    'ar-nea-a': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 2 },
            status: 'aproximado',
            caveat:
                'El real es una rueda de diez y una segunda ronda de ocho con arrastre de puntos. El juego lo juega a dos ruedas, que da casi las mismas fechas. La reválida del 5° al 8° no se juega.',
            source: G22_2026,
        },
    ],
    'ar-nea-bc': [
        {
            fromYear: 2026,
            // 2026 en G22 (Regional del NEA Ascenso): ocho clubes, una rueda.
            rounds: 1,
            title: { kind: 'table' },
            promotion: CHAMPION_PLUS_SECOND,
            relegation: null,
            status: 'aproximado',
            caveat: 'La fase final de 2026 no está cargada. El juego asciende al primero y al segundo.',
            source: G22_2026,
        },
    ],

    // ── Pampeana ──────────────────────────────────────────────────────────
    'ar-pampeana-a': [
        {
            fromYear: 2026,
            // 2026 en G22: ocho clubes, ida y vuelta (56 partidos).
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 2 },
            status: 'aproximado',
            caveat: 'En 2025 hubo una liguilla de permanencia con el Pampeano B. El juego hace descender directo a los dos últimos.',
            source: G22_2026,
        },
    ],
    'ar-pampeana-b': [
        {
            fromYear: 2026,
            rounds: 1,
            // Primera etapa a una rueda y después una Zona Campeonato de cuatro con arrastre.
            title: { kind: 'playoff', size: 4 },
            promotion: CHAMPION_PLUS_SECOND,
            relegation: null,
            status: 'aproximado',
            caveat: 'La Zona Campeonato (1° al 4°) es una liguilla con arrastre. El juego la resuelve con semis y final.',
            source: G22_2026,
        },
    ],
    'ar-pampeana-uroba-sur': [
        feederOnly({ kind: 'playoff', size: 2 }, 'Clasifica al Pampeano B, que no devuelve descensos: no se mueve nadie.'),
    ],

    // ── Patagonia ─────────────────────────────────────────────────────────
    'ar-patagonia-regional': [
        {
            fromYear: 2026,
            rounds: 1,
            title: { kind: 'playoff', size: 4 },
            promotion: null,
            relegation: { direct: 1 },
            status: 'aproximado',
            caveat: 'El real son dos zonas de cuatro y semis cruzadas. El juego lo juega en una sola tabla.',
            source: G22_2025,
        },
    ],
    'ar-patagonia-austral': [
        {
            fromYear: 2026,
            rounds: 2,
            title: { kind: 'playoff', size: 4 },
            promotion: CHAMPION_ONLY,
            relegation: null,
            status: 'aproximado',
            caveat: null,
            source: CANON,
        },
    ],
    'ar-patagonia-alto-valle': [
        feederOnly({ kind: 'playoff', size: 4 }, 'Clasifica al Regional Patagónico, que no devuelve descensos: no se mueve nadie.'),
    ],
    'ar-patagonia-tdf': [
        feederOnly({ kind: 'playoff', size: 4 }, 'Clasifica al Torneo Austral, que no devuelve descensos: no se mueve nadie.'),
    ],
    'ar-patagonia-santacruz': [
        feederOnly({ kind: 'playoff', size: 2 }, 'Clasifica al Torneo Austral, que no devuelve descensos: no se mueve nadie.'),
    ],
    'ar-patagonia-chubut-desarrollo': [
        feederOnly({ kind: 'table' }, 'Clasifica al Torneo Austral, que no devuelve descensos: no se mueve nadie.'),
    ],
};

/** El formato por defecto, para una división nueva del canon que todavía no se declaró acá. */
const FALLBACK: FormatEdition = {
    fromYear: FORMAT_BASE_YEAR,
    rounds: 2,
    title: { kind: 'playoff', size: 4 },
    promotion: null,
    relegation: null,
    status: 'aproximado',
    caveat: 'Esta división todavía no tiene su formato declarado: se juega con el formato genérico y no mueve a nadie.',
    source: 'Formato genérico',
};

/** De una lista de ediciones ordenada, la que rige en `year`. */
export function pickEdition(editions: readonly FormatEdition[], year: number): FormatEdition | null {
    let chosen: FormatEdition | null = null;
    for (const e of editions) {
        if (e.fromYear <= year) chosen = e;
    }
    // Antes de la primera edición conocida (una partida no puede, un test sí): la primera.
    return chosen ?? editions[0] ?? null;
}

/** El formato de una división en una temporada. Nunca null: cae al genérico. */
export function formatFor(competitionId: string, year: number): FormatEdition {
    return pickEdition(FORMAT_EDITIONS[competitionId] ?? [], year) ?? FALLBACK;
}

/** Cuántos ascienden en total: campeón, directos y el ganador del reducido. */
export function promotionSlotsOf(f: FormatEdition): number {
    if (!f.promotion) return 0;
    return (f.promotion.champion ? 1 : 0) + f.promotion.direct + (f.promotion.reducido ? 1 : 0);
}

export function relegationSlotsOf(f: FormatEdition): number {
    return f.relegation?.direct ?? 0;
}

/** Cuántos van al playoff por el título. 0 = el primero es campeón. */
export function titleSeedsOf(f: FormatEdition): number {
    return f.title.kind === 'playoff' ? f.title.size : 0;
}

/** Las fechas que juega un club en la fase regular. */
export function regularFechas(f: FormatEdition, teams: number): number {
    return (teams - 1) * f.rounds;
}

/** El formato en una línea, para la pantalla del torneo. */
export function formatSummary(f: FormatEdition): string {
    const parts: string[] = [f.rounds === 2 ? 'Ida y vuelta' : 'Una rueda'];
    if (f.title.kind === 'table') parts.push('el primero es campeón');
    else if (f.title.size === 2) parts.push('final entre los dos primeros');
    else if (f.title.size === 6) parts.push('playoff del 1° al 6°, con 1° y 2° esperando en semis');
    else parts.push(`playoff del 1° al ${f.title.size}°`);
    return parts.join(' · ');
}

/** Cómo se asciende, en una línea. null si no asciende nadie. */
export function promotionSummary(f: FormatEdition): string | null {
    const p = f.promotion;
    if (!p) return null;
    const parts: string[] = [];
    if (p.champion) parts.push(f.title.kind === 'table' ? 'El campeón, el 1°, sube directo' : 'Sube el campeón');
    if (p.direct > 0) parts.push(p.direct === 1 ? 'también el mejor ubicado de los demás' : `también los ${p.direct} mejor ubicados de los demás`);
    if (p.reducido) parts.push(`otra plaza sale de un reducido del ${p.reducido.from}° al ${p.reducido.to}°`);
    return `${parts.join('; ')}.`;
}

export function relegationSummary(f: FormatEdition): string | null {
    const n = relegationSlotsOf(f);
    if (n === 0) return null;
    return n === 1 ? 'El último desciende directo.' : `Los ${n} últimos descienden directo.`;
}
