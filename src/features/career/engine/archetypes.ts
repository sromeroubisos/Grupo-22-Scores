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
    | 'amateur-internacional'
    | 'de-la-quinta-al-seleccionado'
    | 'un-club-toda-la-vida'
    | 'volvio-a-casa'
    | 'hasta-el-ultimo-partido'
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
    /**
     * Caps ganados MIENTRAS seguía siendo amateur o compensado. No es lo mismo
     * que `caps` en una carrera que arrancó amateur: esa puede haberse
     * profesionalizado a los 24 y sumado todo después.
     */
    capsAsAmateur: number;
    /** Edad a la que colgó los botines. Con el retiro elegible, es una decisión. */
    retirementAge: number;
    /** Cerró la carrera en el mismo club donde la empezó, habiéndose ido en el medio. */
    finishedWhereStarted: boolean;
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
        // La mejor historia que puede contar la ruta amateur, y la más rara: no
        // es "empezó abajo y llegó", es que se puso la camiseta del seleccionado
        // SIENDO amateur, laburando de otra cosa. Va antes que
        // `de-la-quinta-al-seleccionado` porque aquel se conforma con haber
        // arrancado amateur, y este exige haberlo seguido siendo.
        //
        // Pasa en el 6-9% de las carreras amateur de naciones de reputación
        // baja (Uruguay, Chile, Portugal, Namibia, Samoa, Georgia) y en 0-1% de
        // las de reputación alta. Medido, no estimado: docs §15.
        id: 'amateur-internacional',
        label: 'El amateur que llegó a la selección',
        blurb: 'Entrenabas después del trabajo y te pusiste la camiseta del seleccionado. Eso no le pasa a casi nadie.',
        when: (i) => i.capsAsAmateur > 0,
    },
    {
        // El arquetipo de la ruta amateur: empezaste sin contrato y terminaste
        // con la camiseta del seleccionado. Solo se desbloquea desde abajo.
        id: 'de-la-quinta-al-seleccionado',
        label: 'De la quinta al seleccionado',
        blurb: 'Empezaste sin contrato, entrenando después del trabajo, y terminaste representando a tu país.',
        // Pedía `startRoute === 'amateur'`, y con el arranque unificado (1.26.0)
        // eso lo cumple TODO el mundo: la condición dejaba de filtrar y este
        // arquetipo se comía al emblema de la selección y al multicampeón, que
        // están más abajo.
        //
        // Lo que distingue la historia no es haber empezado sin contrato —eso ya es
        // universal— sino haber tardado en salir de ahí. Cinco temporadas amateur
        // antes del primer contrato es "de la quinta": el que firma a los 20 llegó
        // por el camino previsto y le corresponde otro titular.
        when: (i) => i.caps >= 8 && i.firstProfessionalAge !== null && i.firstProfessionalAge >= 23,
    },
    {
        id: 'un-club-toda-la-vida',
        label: 'Un club, toda la vida',
        blurb: 'Una sola camiseta de principio a fin. Cada vez que sonó el teléfono, dijiste que no.',
        when: (i) => i.clubsPlayed === 1 && i.seasons >= 12,
    },
    {
        // El final que sólo existe desde que el retiro se elige: te fuiste,
        // diste la vuelta al mundo y volviste a cerrar donde empezaste. Va
        // pegado a `un-club-toda-la-vida` porque es su pariente: no es el que
        // nunca se movió, es el que volvió.
        id: 'volvio-a-casa',
        label: 'Volvió a cerrar donde empezó',
        blurb: 'Te fuiste a buscar la carrera afuera y volviste a colgar los botines en el club que te formó.',
        when: (i) => i.clubsPlayed >= 2 && i.finishedWhereStarted,
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
        // botines. La exclusión de la ruta profesional se fue con la unificación:
        // nadie arranca adentro, así que ya no hay nadie a quien excluir.
        id: 'el-que-llego-tarde',
        label: 'El que llegó tarde',
        blurb: 'Firmaste tu primer contrato cuando muchos ya se estaban retirando. Todavía te quedaba lo mejor.',
        when: (i) => i.firstProfessionalAge !== null && i.firstProfessionalAge >= 27,
    },
    {
        id: 'crack-generacion',
        label: 'Crack de su generación',
        blurb: 'Fuiste, sin discusión, uno de los mejores de tu puesto.',
        when: (i) => i.peakOvr >= 80,
    },
    {
        // El que estiró la carrera hasta el último año permitido. Es el premio a
        // haber dicho "un año más" cinco veces seguidas sabiendo que el OVR
        // bajaba: sin él, seguir jugando sólo tenía finales degradados de los
        // que ya existían.
        //
        // Va ACÁ ABAJO y no arriba, aunque la tentación sea premiarlo fuerte:
        // medido, el 96% de los que no eligen retirarse llegan a los 39, así que
        // arriba se comía al 79% de las carreras largas y tapaba al emblema de
        // la selección, al multicampeón y al crack de su generación. Ahora gana
        // sólo cuando la carrera no tiene otro titular más grande, que es
        // exactamente lo que cuenta: aguantó.
        id: 'hasta-el-ultimo-partido',
        label: 'Jugó hasta el último partido',
        blurb: 'Aguantaste hasta los 39, cuando ya nadie de tu camada seguía en cancha. Te fueron a buscar los años, no las ganas.',
        when: (i) => i.retirementAge >= 39,
    },
    {
        id: 'jerarquia',
        label: 'Un jugador de jerarquía',
        blurb: 'Siempre estuviste a la altura, en cualquier cancha.',
        when: (i) => i.peakOvr >= 72,
    },
    {
        // Llegó al profesionalismo sin que nadie lo viera venir. No exige caps: el
        // logro es el ascenso, no la selección.
        //
        // BAJÓ DE LUGAR en 1.26.0, y es el ajuste que el cambio de significado
        // obligaba. Pedía `startRoute === 'amateur'` y estaba arriba de
        // `crack-generacion` porque la ruta amateur era un tercio de las carreras y
        // casi nunca profesionalizaba. Ahora la rama larga es el 70% y la mayoría
        // llega, así que desde arriba se comía al crack de su generación y al
        // jugador de jerarquía. Sigue exigiendo la rama larga —el de 58 a los 18 no
        // "se hizo solo", se le veía— pero cede ante los dos titulares deportivos.
        id: 'se-hizo-solo',
        label: 'Se hizo solo',
        blurb: 'Nadie te puso en una academia. Subiste escalón por escalón hasta vivir del rugby.',
        when: (i) => i.startRoute === 'development' && i.firstProfessionalAge !== null,
    },
    {
        // Tocó el semiprofesionalismo y ahí se quedó. Es una historia distinta de
        // la del amateur puro: llegaste a vivir a medias del rugby.
        id: 'el-que-estuvo-cerca',
        label: 'El que estuvo cerca',
        blurb: 'Llegaste a vivir a medias del rugby. El contrato grande nunca terminó de aparecer.',
        when: (i) => i.firstProfessionalAge === null && i.peakEmployment === 'semi-professional',
    },
    {
        // La carrera amateur honesta: nunca viviste del rugby y jugaste igual,
        // sábado tras sábado. En el rugby eso no es un fracaso, es una forma de
        // hacer las cosas — y sigue siendo el desenlace más común del que no
        // despega, así que necesita nombre propio en vez de caer en el genérico.
        id: 'amateur-de-ley',
        label: 'Amateur de ley',
        blurb: 'Nunca cobraste un peso por jugar. Igual no te perdiste un sábado.',
        when: (i) => i.firstProfessionalAge === null && i.seasons >= 8,
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

/**
 * Etiqueta de cada arquetipo, por id.
 *
 * Existe por el RECIBO del token compartido: cuando el motor cambió y la carrera
 * no se puede reconstruir, lo único que queda es el titular que se guardó al
 * compartir —una frase en español— y sin esta tabla no hay forma de saber a qué
 * arquetipo correspondía para escribirlo en otro idioma.
 */
export const ARCHETYPE_LABELS: Readonly<Record<CareerArchetypeId, string>> = Object.fromEntries(
    RULES.map((r) => [r.id, r.label]),
) as Record<CareerArchetypeId, string>;
