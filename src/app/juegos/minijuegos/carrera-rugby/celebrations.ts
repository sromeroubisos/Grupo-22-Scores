import type { CareerSeasonEntry, CareerState, Locale } from '@/features/career';
import {
    AWARD_LABELS, competitionLabelOf, countryNameIn, distinctionIn, EMPLOYMENT_LABELS,
    employmentLabel, employmentRank, findCountry, getClub, getInternationalCompetition,
    RUGBY_UNIONS, stringsFor,
} from '@/features/career';
import { monogramColor } from './clubCrest';
import { premioIdOf } from './premios';

/**
 * El nombre del torneo tal como se lee en pantalla.
 *
 * Hay DOS catálogos de competiciones y ninguno conoce al otro: `competitionLabelOf`
 * sabe de ligas y copas de clubes, y el calendario internacional sabe de torneos
 * de selecciones. Sin este puente, un título de selección caía en el
 * `?? competitionId` del primero y el festejo mostraba el id crudo —
 * "sudamerica-rugby-championship" en vez de "Sudamérica Rugby Championship".
 *
 * El internacional se pregunta primero porque es el que faltaba; para un id de
 * club devuelve `null` y sigue de largo.
 */
function tournamentLabelOf(competitionId: string): string {
    return getInternationalCompetition(competitionId)?.name ?? competitionLabelOf(competitionId);
}

/** Nombre de la unión campeona. `RUGBY_UNIONS` cubre uniones que no son país seleccionable. */
function unionLabelOf(code: string, locale: Locale): string {
    return countryNameIn(code, findCountry(code)?.nameEs ?? RUGBY_UNIONS[code] ?? code, locale);
}

/**
 * QUÉ merece pantalla completa, leído del estado.
 *
 * Vive aparte del componente a propósito: acá está la REGLA (qué momento se
 * festeja y con qué identidad) y allá el cómo se dibuja. Sumar el debut a los 18
 * o un premio individual es agregar un caso a esta función — la capa no se toca.
 *
 * El orden de la cola importa: primero el título, que es lo más grande.
 */
export interface CelebrationSpec {
    kind: 'title' | 'first-cap' | 'promotion' | 'debut' | 'award';
    key: string;
    eyebrow: string;
    headline: string;
    sub: string;
    accent: string;
    /** Escudo del club, o `null` si el momento lo dibuja con bandera/ícono. */
    clubId: string | null;
    /** Bandera de la unión, para el primer cap. */
    countryCode: string | null;
    /** Ícono del premio individual (`public/premios/<id>.png`), o `null`. */
    awardId: string | null;
}

const ACCENT_NATIONAL = '#2F6FB0';
const ACCENT_STEP = '#00794A';
const ACCENT_AWARD = '#8A6A12';

/**
 * Festejos de la ÚLTIMA temporada jugada. `previous` es la anterior, que hace
 * falta para saber si el escalón subió: un ascenso no es un campo del estado,
 * es una diferencia entre dos temporadas.
 */
/**
 * EL CAMPEONATO VA PRIMERO, aunque haya pasado último.
 *
 * `celebrationsFor` ya devuelve los títulos al principio de SU temporada, pero la
 * cola se arma temporada por temporada: en Normal y en Exprés avanzan dos o tres
 * de una, así que si el título llegó en la última, el jugador veía primero el
 * ascenso de escalón de hace tres años y el debut internacional de hace dos. Para
 * cuando aparecía la copa ya había cerrado tres pantallas y no se enteraba.
 *
 * El orden es de PESO, no cronológico: lo más grande primero. Adentro de cada
 * clase se conserva el orden de temporada, así que dos copas del mismo año siguen
 * apareciendo en el orden en que se ganaron.
 */
const ORDEN_POR_PESO: Readonly<Record<CelebrationSpec['kind'], number>> = {
    title: 0,
    'first-cap': 1,
    award: 2,
    debut: 3,
    promotion: 4,
};

export function orderCelebrations(specs: CelebrationSpec[]): CelebrationSpec[] {
    // `sort` de JS es estable desde ES2019, así que el desempate por temporada
    // sale solo: no hace falta un índice auxiliar.
    return [...specs].sort((a, b) => ORDEN_POR_PESO[a.kind] - ORDEN_POR_PESO[b.kind]);
}

export function celebrationsFor(
    state: CareerState,
    entry: CareerSeasonEntry,
    previous: CareerSeasonEntry | null,
    locale: Locale = 'es',
): CelebrationSpec[] {
    const out: CelebrationSpec[] = [];
    const t = stringsFor(locale);
    // La nacionalidad viaja en el estado como NOMBRE en español (`player.nationality`);
    // el código es el que sirve para traducirla.
    const countryCode = state.player.nationalTeam ?? state.player.eligibility.nationalityCountryCode;
    const countryLabel = countryNameIn(countryCode, state.player.nationality, locale);

    // 1) TÍTULOS. Uno por torneo ganado: dos copas en una temporada son dos
    //    momentos, no una lista.
    for (const title of entry.titlesWon) {
        // UNA COPA GANADA CON EL PAÍS NO ES DEL CLUB. `TitleWon` ya distingue
        // las dos clases —`club` y `union` son excluyentes— y acá se respeta: la
        // copa que ganaste con tu selección va con la bandera y el nombre de la
        // unión, no con el escudo del club en el que jugabas ese año. Antes
        // todas salían con el escudo del club, así que un título internacional
        // aparecía acreditado a un club que no lo jugó.
        if (title.union !== null) {
            out.push({
                kind: 'title',
                key: `title:${entry.season}:${title.competitionId}`,
                eyebrow: t.celebrationChampion,
                headline: tournamentLabelOf(title.competitionId),
                sub: t.celebrationAgeAnd(entry.age, unionLabelOf(title.union, locale)),
                accent: ACCENT_NATIONAL,
                clubId: null,
                countryCode: title.union,
                awardId: null,
            });
            continue;
        }

        // `title.club` y no `entry.clubId`: el campeón es el club que ganó el
        // torneo, que es el dato que el motor guardó en el título.
        const clubId = title.club ?? entry.clubId;
        out.push({
            kind: 'title',
            key: `title:${entry.season}:${title.competitionId}`,
            eyebrow: t.celebrationChampion,
            headline: tournamentLabelOf(title.competitionId),
            sub: t.celebrationAgeAnd(entry.age, getClub(clubId).labelEs),
            accent: monogramColor(clubId),
            clubId,
            countryCode: null,
            awardId: null,
        });
    }

    // 1b) PREMIOS INDIVIDUALES DE LA TEMPORADA. Se calculaban bien desde que
    //     existe `engine/awards.ts`, pero morían en el contador de `flags` y sólo
    //     asomaban en el retiro: la temporada en que los ganabas no decía nada.
    //     Ahora `awardsWon` los deja en la temporada y acá se convierten en
    //     festejo, con el mismo puente de id de archivo que usa la vitrina.
    for (const award of entry.awardsWon) {
        const label = distinctionIn(AWARD_LABELS[award], locale);
        out.push({
            kind: 'award',
            key: `award:${entry.season}:${award}`,
            eyebrow: t.celebrationAward,
            headline: label,
            sub: t.celebrationAgeAnd(entry.age, entry.clubName),
            accent: ACCENT_AWARD,
            clubId: null,
            countryCode: null,
            awardId: premioIdOf(AWARD_LABELS[award]),
        });
    }

    // 2) PRIMERA CONVOCATORIA. En rugby los caps pesan más que los títulos, así
    //    que el debut internacional tiene su propia pantalla desde siempre.
    if (entry.milestones.includes('first-call-up')) {
        out.push({
            kind: 'first-cap',
            key: `cap:${entry.season}`,
            eyebrow: t.celebrationFirstCap,
            headline: countryLabel,
            sub: t.celebrationInternationalDebut(entry.age),
            accent: ACCENT_NATIONAL,
            clubId: null,
            countryCode,
            awardId: null,
        });
    }

    // 2b) ENTRAR AL PLANTEL PRINCIPAL. Es un momento distinto del primer cap: el
    //     debut puede ser una gira de julio contra un rival menor, y esto es el
    //     dia en que dejas de ser una promesa a la que llevan de gira.
    if (entry.milestones.includes('national-squad')) {
        out.push({
            kind: 'first-cap',
            key: `squad:${entry.season}`,
            eyebrow: t.celebrationSeniorSquad,
            headline: countryLabel,
            sub: t.celebrationNoLongerAProspect(entry.age),
            accent: ACCENT_NATIONAL,
            clubId: null,
            countryCode,
            awardId: null,
        });
    }

    // 3) SUBIDA DE ESCALÓN. El momento de la ruta amateur, que hasta ahora
    //    pasaba en silencio detrás de un chip.
    if (previous && employmentRank(entry.employment) > employmentRank(previous.employment)) {
        out.push({
            kind: 'promotion',
            key: `step:${entry.season}:${entry.employment}`,
            eyebrow: t.celebrationStepUp,
            headline: employmentLabel(entry.employment, EMPLOYMENT_LABELS[entry.employment], locale),
            sub: t.celebrationAgeAnd(entry.age, entry.clubName),
            accent: ACCENT_STEP,
            clubId: entry.clubId,
            countryCode: null,
            awardId: null,
        });
    }

    return out;
}
