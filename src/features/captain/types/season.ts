// EL CAPITÁN — la temporada: el presupuesto de partidos y lo que queda escrito.

import type { CaptainStage } from './player.ts';
import type { NationalStatus, SquadTrack } from './captain.ts';
import type { SeasonAwardId } from './achievements.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  EL TECHO DE 30 PARTIDOS
// ═══════════════════════════════════════════════════════════════════════════
//
// Va acá y no con las seis monedas porque no es una moneda: es un presupuesto
// que se reparte y se vacía todas las temporadas.
//
// En octubre de 2025 World Rugby aprobó por primera vez directrices globales de
// carga: 30 partidos como máximo por temporada, 6 semanas consecutivas de
// partido, una semana de descanso obligatorio después de la selección. No es un
// número inventado para que el juego tenga tensión — es lo que hizo que en la
// ventana de julio de 2026 Contepomi descansara a casi todos los Pumas del Top
// 14, capitán incluido.
//
// La gracia mecánica es que los compromisos SUMAN MÁS DE 30. Liga, copa, las
// dos ventanas internacionales y el Nacional de Clubes no entran juntos, y
// cada bloque que resignás tiene a alguien del otro lado que se enoja.

export const MATCH_CAP_PER_SEASON = 30;

export type MatchBucket = 'liga' | 'copa' | 'internacional' | 'nacional-de-clubes';

/** Orden canónico: se itera por acá, nunca por `Object.keys(planned)`. */
export const MATCH_BUCKETS: readonly MatchBucket[] = ['liga', 'copa', 'internacional', 'nacional-de-clubes'];

export interface MatchBudget {
    /** El techo de ESTA temporada. Sale de `MATCH_CAP_PER_SEASON`. */
    cap: number;
    /** Cuántos pensás jugar de cada cosa. Las cuatro claves siempre presentes. */
    planned: Record<MatchBucket, number>;
    /** Cuántos jugaste de verdad. */
    played: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÓNDE TERMINÓ EL CLUB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El puesto final de un club en una competición.
 *
 * Vive en `types/` y no al lado de `engine/clubs.ts`, que es quien lo calcula,
 * porque el ESTADO lo guarda (`CaptainState.lastStanding`) y el árbol de tipos
 * es la raíz que no importa del motor. Misma regla que `DevelopmentProfile` y
 * que los tipos de la vitrina.
 *
 * Es la misma forma que usa `qualifiesFor` en el catálogo de competiciones, y no
 * por casualidad: de acá sale la respuesta a "¿este club entra a la Champions
 * Cup?", y esa pregunta la contesta el catálogo con estos tres campos.
 */
export interface LeagueStanding {
    /**
     * En qué competición se terminó ahí. Va en la fila y no se deduce del club:
     * la posición del año pasado es la que abre la copa de este, y si el club
     * ascendió en el medio, "quinto" quiere decir quinto DE AQUELLA división.
     */
    competitionId: string;
    /** Puesto final, 1 = campeón. 0 cuando la competición no es una tabla. */
    position: number;
    teams: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE QUEDA ESCRITO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Una temporada cerrada. Es la fila de la trayectoria y no se vuelve a tocar.
 *
 * Guarda VALORES, no referencias: el club va por id y se resuelve contra el
 * catálogo, y la media va congelada —el número que el jugador vio esa
 * temporada— aunque los atributos después se muevan.
 */
export interface CaptainSeasonEntry {
    season: number;
    age: number;
    clubId: string | null;
    stage: CaptainStage;
    ovr: number;
    /** La Pertenencia con el club de ESA temporada. */
    belonging: number;
    fame: number;
    /** El SALDO al cerrar la temporada. */
    money: number;
    /**
     * LO QUE ENTRÓ ESE AÑO. Cero mientras seas amateur, que es la mayoría de las
     * carreras: el rugby de club no paga.
     *
     * Se guarda aunque `money` ya esté, y no es una derivada duplicada: el saldo
     * lo mueven también las compras de la tienda, así que restar dos saldos
     * consecutivos NO da el ingreso —da el ingreso menos lo gastado— y la
     * billetera necesita las dos cifras por separado para poder decir «ganaste
     * tanto, te queda tanto».
     */
    income: number;
    matchesPlayed: number;
    /** La métrica-gloria del puesto, en la unidad que declara la familia. */
    glory: number;
    /** La secundaria, si la familia declara una. */
    glorySecondary: number;
    /** Caps con la mayor en ESTA temporada. */
    caps: number;
    /**
     * EN QUÉ ESCALÓN DE LA VÍA REPRESENTATIVA TERMINASTE. EL ID, NO EL RÓTULO.
     *
     * Guardaba el texto —«La mayor», «Seleccionado A»— y eso era dos problemas en
     * un campo. Uno: el rótulo del A-XV pasó a depender del país (`trackLabelOf`),
     * así que una tabla fija ya no lo puede escribir. Dos, y es el de fondo: un
     * texto guardado no se puede contar. Preguntarle al historial «¿cuántas
     * temporadas jugaste con el XV?» obligaba a comparar contra una cadena, que
     * es la misma trampa que este proyecto ya documenta con los premios —«Ids, no
     * textos: la UI traduce»— y que acá se cobró en el retiro.
     */
    trackId: SquadTrack;
    /**
     * QUÉ ERAS PARA TU UNIÓN AL CERRAR ESTA TEMPORADA.
     *
     * Se congela en la fila y de acá salen las cuatro cuentas que la convocatoria
     * del año que viene necesita: si quedaste afuera estando adentro, cuántas
     * temporadas seguidas llevás a prueba, cuántas en el plantel, y hace cuánto
     * perdiste la camiseta. NINGUNA de las cuatro es un contador guardado, y esa
     * es la decisión: el historial ya las contiene, y un contador aparte sería una
     * segunda fuente de verdad que un pase olvidado desincroniza (CLAUDE.md §2).
     */
    nationalStatus: NationalStatus;
    /**
     * Si te convocaron ESTE año. No es `caps > 0` ni sobra: se puede estar en el
     * plantel y no sumar —la unión sin fixture, la lista de la que te bajaste— y
     * la cuenta de «dos temporadas seguidas afuera» necesita distinguirlo.
     */
    calledUp: boolean;
    /** Si en ESTA temporada perdiste la camiseta. Merece su tarjeta. */
    lostShirt: boolean;
    /** Cuánto de la temporada del club jugaste, de 0 a 1. */
    share: number;
    /**
     * EL PUNTAJE DE LA TEMPORADA, de 5,0 a 9,9. Relativo a lo que se esperaba de
     * tu media en tu puesto, no absoluto: un 8,2 en la Tercera de la URBA quiere
     * decir "rendiste más de lo que tu nivel prometía", no "sos bueno".
     *
     * Se congela acá —es el número que el jugador vio ese año— y la fuente de
     * verdad es `engine/season-rating.ts`. De este campo salen dos cosas: los
     * premios individuales y el mérito que empuja el crecimiento del año
     * siguiente.
     */
    rating: number;
    /** Lo que ganaste esta temporada, si algo ganaste. */
    titles: string[];
    /** Premios individuales de esta temporada. Ids, no textos: la UI traduce. */
    awards: SeasonAwardId[];
    /**
     * Dónde terminó tu club y cuántos eran. `0` cuando la competición no es una
     * tabla resoluble —pasa con los paraguas y con el club sin resolver— y en
     * ese caso ni el premio local ni el ascenso se evalúan.
     */
    leaguePosition: number;
    leagueTeams: number;
    /**
     * Si tu club se movió de división al cerrar esta temporada. La fila conserva
     * la competición en la que se JUGÓ; esto cuenta lo que pasó al final.
     */
    divisionMove: 'promotion' | 'relegation' | null;
    /** Se fue de gira, se lesionó, lo suspendieron: lo que le pasó al año. */
    note: string | null;
    /** Qué entrenaste esa pretemporada. Id del catálogo, o `null` si no se eligió. */
    training: string | null;
    headDamage: number;
    bodyDamage: number;
    /**
     * El desenlace de la decisión de la temporada, tal como se leyó en pantalla.
     * Se persiste, así que cambiarlo mueve el estado guardado (CLAUDE.md §2).
     */
    decisionText: string | null;
}

/**
 * Una decisión tomada. El desenlace real sale de `outcomeIndex`, nunca de
 * adivinarlo por el texto: es la lección de `career/CareerFlow.tsx`, donde la
 * tarjeta ya no se puede reconstruir después de resolver.
 */
export interface CaptainDecisionEntry {
    season: number;
    eventId: string;
    optionId: string;
    outcomeIndex: number;
    text: string;
}
