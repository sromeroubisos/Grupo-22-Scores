// ARQUETIPO DE RETIRO — el titular con el que se cierra la carrera.
//
// Vive en el motor y no en la UI por tres razones: se puede testear, es
// determinístico (función pura del resumen, sin rng) y lo va a necesitar el
// resumen compartible además de la pantalla de retiro.
//
// El orden de la tabla ES la regla: gana el primero que se cumple. Arriba van
// los logros más raros; abajo, los que casi siempre están disponibles. Los
// arquetipos de la RUTA AMATEUR se ubican alto a propósito: son el premio a
// haber llegado desde abajo, y si quedaran debajo de "Multicampeón" no se verían
// nunca.

import type { StartRouteId } from '../types/career.ts';
import type { EmploymentStatus } from './contracts.ts';

export type CareerArchetypeId =
    | 'campeon-mundo'
    | 'salon-fama'
    | 'de-la-quinta-al-seleccionado'
    | 'un-club-toda-la-vida'
    | 'multicampeon'
    | 'emblema-seleccion'
    | 'se-hizo-solo'
    | 'el-que-llego-tarde'
    | 'crack-generacion'
    | 'jerarquia'
    | 'el-que-estuvo-cerca'
    | 'amateur-de-ley'
    | 'guerrero'
    | 'entrega';

export interface CareerArchetype {
    id: CareerArchetypeId;
    label: string;
    /** Una línea de crónica que explica POR QUÉ le tocó este arquetipo. */
    blurb: string;
}

/**
 * Todo lo que la tabla necesita mirar. Se pasa explícito en vez de recibir el
 * `CareerState` entero para que los tests puedan armar un caso en cuatro líneas.
 */
export interface ArchetypeInput {
    startRoute: StartRouteId;
    flags: Record<string, number>;
    honours: readonly string[];
    seasons: number;
    caps: number;
    titles: number;
    peakOvr: number;
    /** Cantidad de clubes distintos en los que jugó. */
    clubsPlayed: number;
    /** Edad del primer contrato profesional. null si nunca se profesionalizó. */
    firstProfessionalAge: number | null;
    /** Escalón de empleo más alto que alcanzó en toda la carrera. */
    peakEmployment: EmploymentStatus;
}

interface Rule {
    id: CareerArchetypeId;
    label: string;
    blurb: string;
    when: (i: ArchetypeInput) => boolean;
}

const RULES: readonly Rule[] = [
    {
        id: 'campeon-mundo',
        label: 'Campeón del Mundo',
        blurb: 'Levantaste la copa que se juega una vez cada cuatro años.',
        when: (i) => (i.flags['campeon_mundo'] ?? 0) > 0,
    },
    {
        id: 'salon-fama',
        label: 'Miembro del Salón de la Fama',
        blurb: 'El rugby te puso entre los suyos para siempre.',
        when: (i) => i.honours.includes('Salón de la Fama'),
    },
    {
        // El arquetipo de la ruta amateur: empezaste sin contrato y terminaste
        // con la camiseta del seleccionado. Solo se desbloquea desde abajo.
        id: 'de-la-quinta-al-seleccionado',
        label: 'De la quinta al seleccionado',
        blurb: 'Empezaste sin contrato, entrenando después del trabajo, y terminaste representando a tu país.',
        when: (i) => i.startRoute === 'amateur' && i.caps >= 8,
    },
    {
        id: 'un-club-toda-la-vida',
        label: 'Un club, toda la vida',
        blurb: 'Una sola camiseta de principio a fin. Cada vez que sonó el teléfono, dijiste que no.',
        when: (i) => i.clubsPlayed === 1 && i.seasons >= 12,
    },
    {
        id: 'multicampeon',
        label: 'Multicampeón',
        blurb: 'Ganaste todo lo que se puso en juego, y más de una vez.',
        when: (i) => i.titles >= 4,
    },
    {
        id: 'emblema-seleccion',
        label: 'Emblema de la selección',
        blurb: 'Tu país te llamó una y otra vez, temporada tras temporada.',
        when: (i) => i.caps >= 30,
    },
    {
        // El que se profesionalizó cuando muchos de su camada ya colgaban los
        // botines. Excluye la ruta profesional: el que arrancó adentro y firmó
        // su contrato full-time a los 27 no "llegó tarde", venía en camino.
        // Va ANTES de `se-hizo-solo` porque es el caso más específico.
        id: 'el-que-llego-tarde',
        label: 'El que llegó tarde',
        blurb: 'Firmaste tu primer contrato cuando muchos ya se estaban retirando. Todavía te quedaba lo mejor.',
        when: (i) => i.startRoute !== 'professional'
            && i.firstProfessionalAge !== null
            && i.firstProfessionalAge >= 27,
    },
    {
        // Llegó al profesionalismo desde abajo, sin academia que lo empujara.
        // No exige caps: el logro es el ascenso, no la selección.
        id: 'se-hizo-solo',
        label: 'Se hizo solo',
        blurb: 'Nadie te puso en una academia. Subiste escalón por escalón hasta vivir del rugby.',
        when: (i) => i.startRoute === 'amateur' && i.firstProfessionalAge !== null,
    },
    {
        id: 'crack-generacion',
        label: 'Crack de su generación',
        blurb: 'Fuiste, sin discusión, uno de los mejores de tu puesto.',
        when: (i) => i.peakOvr >= 80,
    },
    {
        id: 'jerarquia',
        label: 'Un jugador de jerarquía',
        blurb: 'Siempre estuviste a la altura, en cualquier cancha.',
        when: (i) => i.peakOvr >= 72,
    },
    {
        // Tocó el semiprofesionalismo y ahí se quedó. Es una historia distinta de
        // la del amateur puro: llegaste a vivir a medias del rugby.
        id: 'el-que-estuvo-cerca',
        label: 'El que estuvo cerca',
        blurb: 'Llegaste a vivir a medias del rugby. El contrato grande nunca terminó de aparecer.',
        when: (i) => i.startRoute === 'amateur'
            && i.firstProfessionalAge === null
            && i.peakEmployment === 'semi-professional',
    },
    {
        // La carrera amateur honesta: nunca viviste del rugby y jugaste igual,
        // sábado tras sábado. En el rugby eso no es un fracaso, es una forma de
        // hacer las cosas — y es el desenlace más común de la ruta amateur, así
        // que necesita nombre propio en vez de caer en el genérico de abajo.
        id: 'amateur-de-ley',
        label: 'Amateur de ley',
        blurb: 'Nunca cobraste un peso por jugar. Igual no te perdiste un sábado.',
        when: (i) => i.startRoute === 'amateur' && i.firstProfessionalAge === null && i.seasons >= 8,
    },
    {
        id: 'guerrero',
        label: 'Un guerrero de mil batallas',
        blurb: 'Aguantaste más temporadas que la mayoría, con el cuerpo al límite.',
        when: (i) => i.seasons >= 12,
    },
    {
        id: 'entrega',
        label: 'Una carrera de pura entrega',
        blurb: 'Dejaste todo lo que tenías cada vez que te tocó entrar.',
        when: () => true, // fallback: la tabla nunca queda sin respuesta
    },
];

/** Arquetipo con el que se cierra la carrera. Gana el primero que se cumple. */
export function careerArchetype(input: ArchetypeInput): CareerArchetype {
    const rule = RULES.find((r) => r.when(input)) ?? RULES[RULES.length - 1];
    return { id: rule.id, label: rule.label, blurb: rule.blurb };
}

/** Todos los arquetipos posibles, en orden de prioridad. Para tests y docs. */
export function allArchetypeIds(): CareerArchetypeId[] {
    return RULES.map((r) => r.id);
}
