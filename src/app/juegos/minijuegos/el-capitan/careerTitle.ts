import type { CaptainState } from '@/features/captain';
import { careerTally, getFamily } from '@/features/captain';

/**
 * EL TÍTULO DE LA CARRERA.
 *
 * Lo que un club dice de vos veinte años después, en tres palabras. No es un
 * premio más —los premios ya están en la vitrina— sino el resumen: de todo lo
 * que hiciste, qué fue LO TUYO.
 *
 * ── Por qué vive acá y no en el motor ───────────────────────────────────────
 * Porque es presentación pura: se calcula al dibujar la pantalla de retiro, con
 * la carrera ya cerrada, y no entra en ningún estado guardado ni en ninguna
 * cuenta que el motor haga después. Agregarlo al motor obligaría a subir
 * `engineVersion` cada vez que se corrige una frase (CLAUDE.md §2). Acá, cambiar
 * un texto no invalida ninguna partida.
 *
 * ── Cómo se elige, y por qué no hay azar ────────────────────────────────────
 * La lista se recorre EN ORDEN y gana el primero que cumple. El orden va de lo
 * más raro a lo más común, así que un jugador que es varias cosas se lleva la
 * menos frecuente: el que ganó ocho torneos Y jugó veinte temporadas es «El
 * multicampeón» antes que «El eterno», porque lo primero le pasa a muy pocos.
 *
 * Sin azar a propósito: la misma carrera tiene que terminar con el mismo título
 * hoy y dentro de seis meses, y acá no hay `rng` que pedir —esta función se
 * llama desde React, fuera del motor determinista—.
 */
export interface CareerTitle {
    id: string;
    /** El título, tal como se lee. */
    label: string;
    /** Por qué te lo ganaste. Una línea, en el idioma del jugador. */
    hint: string;
}

/** Lo que se mide de una carrera terminada para decidir su título. */
interface Medidas {
    temporadas: number;
    partidos: number;
    tries: number;
    puntos: number;
    tackles: number;
    caps: number;
    mejorMedia: number;
    titulos: number;
    premios: number;
    clubes: number;
    /** La Pertenencia más alta que alcanzaste en cualquier club. */
    pertenencia: number;
    hia: number;
    desgaste: number;
    cartel: number;
    edad: number;
    profesional: boolean;
    /** Se retiró porque el cuerpo no dio más. */
    porElCuerpo: boolean;
    /** Se fue cuando quiso él. */
    porDecision: boolean;
    /** El puesto: define si los tries o los puntos son «lo suyo». */
    familia: string;
}

/**
 * LOS TREINTA.
 *
 * Cada uno es una carrera que el juego puede dar de verdad; ninguno es
 * decorativo. Van de lo más raro a lo más común y el ÚLTIMO no tiene condición:
 * es la red que garantiza que ninguna carrera termine sin título.
 *
 * Voz: español rioplatense, sin signos de exclamación, crónica deportiva
 * (CLAUDE.md §4). Y vocabulario de rugby: club, caps, plantel, palos.
 */
const TITULOS: readonly { id: string; label: string; hint: string; gana: (m: Medidas) => boolean }[] = [
    // ── Lo que casi nadie hace ──────────────────────────────────────────────
    {
        id: 'leyenda',
        label: 'La leyenda del club',
        hint: 'Vitalicio en tu club y campeón del mundo de tu propia carrera.',
        gana: (m) => m.pertenencia >= 95 && m.titulos >= 5 && m.caps >= 20,
    },
    {
        id: 'vitalicio',
        label: 'El vitalicio',
        hint: 'La cancha 1 lleva tu nombre. No hace falta decir más.',
        gana: (m) => m.pertenencia >= 95,
    },
    {
        id: 'mundialista',
        label: 'El mundialista',
        hint: 'Cincuenta caps. Te tocó la camiseta pesada y no la soltaste.',
        gana: (m) => m.caps >= 50,
    },
    {
        id: 'multicampeon',
        label: 'El multicampeón',
        hint: 'Ocho vueltas olímpicas. En algún vestuario todavía se cuenta.',
        gana: (m) => m.titulos >= 8,
    },
    {
        id: 'clase-mundial',
        label: 'De clase mundial',
        hint: 'Noventa de media. De ese material hay tres por generación.',
        gana: (m) => m.mejorMedia >= 90,
    },
    {
        id: 'maquina-de-puntos',
        label: 'La máquina de puntos',
        hint: 'Más de mil quinientos puntos. La cuenta la llevaba el planillero.',
        gana: (m) => m.puntos >= 1500,
    },
    {
        id: 'try-man',
        label: 'El try-man',
        hint: 'Ochenta tries. El ingoal era tu barrio.',
        gana: (m) => m.tries >= 80,
    },
    {
        id: 'eterno',
        label: 'El eterno',
        hint: 'Veinte temporadas. Empezaste con unos y terminaste con los hijos.',
        gana: (m) => m.temporadas >= 20,
    },

    // ── Carreras grandes ────────────────────────────────────────────────────
    {
        id: 'capitan',
        label: 'El capitán',
        hint: 'Te dieron la cinta y te la dejaron puesta diez años.',
        gana: (m) => m.pertenencia >= 75 && m.temporadas >= 10,
    },
    {
        id: 'internacional',
        label: 'El internacional',
        hint: 'Veinte caps. Cantaste el himno más veces de las que te acordás.',
        gana: (m) => m.caps >= 20,
    },
    {
        id: 'campeon',
        label: 'El campeón',
        hint: 'Cuatro títulos. Tu nombre está en cuatro placas.',
        gana: (m) => m.titulos >= 4,
    },
    {
        id: 'figura',
        label: 'La figura',
        hint: 'Ochenta y cinco de media y los premios para probarlo.',
        gana: (m) => m.mejorMedia >= 85 && m.premios >= 2,
    },
    {
        id: 'crack',
        label: 'El crack',
        hint: 'Ochenta y cinco de media. En tu mejor año no había con qué darte.',
        gana: (m) => m.mejorMedia >= 85,
    },
    {
        id: 'goleador',
        label: 'El de los palos',
        hint: 'Ochocientos puntos. Cuando había penal, la pelota era tuya.',
        gana: (m) => m.puntos >= 800,
    },
    {
        id: 'apoyador',
        label: 'El apoyador',
        hint: 'Cuarenta tries. Siempre aparecías del lado bueno de la línea.',
        gana: (m) => m.tries >= 40,
    },
    {
        id: 'obrero',
        label: 'El obrero del scrum',
        hint: 'Mil quinientos tackles. El trabajo que no sale en la foto.',
        gana: (m) => m.tackles >= 1500,
    },

    // ── Formas de hacer una carrera ─────────────────────────────────────────
    {
        id: 'un-solo-club',
        label: 'El de un solo club',
        hint: 'Diez temporadas y una sola camiseta. Ya no se ve.',
        gana: (m) => m.clubes === 1 && m.temporadas >= 10,
    },
    {
        id: 'trotamundos',
        label: 'El trotamundos',
        hint: 'Seis clubes. Aprendiste a decir «vamos» en varios idiomas.',
        gana: (m) => m.clubes >= 6,
    },
    {
        id: 'de-la-casa',
        label: 'El de la casa',
        hint: 'Empezaste y terminaste en el mismo club, con vueltas en el medio.',
        gana: (m) => m.clubes >= 2 && m.pertenencia >= 60 && m.temporadas >= 8,
    },
    {
        id: 'profesional',
        label: 'El que vivió del rugby',
        hint: 'Firmaste, cobraste y aguantaste. No es poco.',
        gana: (m) => m.profesional && m.temporadas >= 10,
    },
    {
        id: 'amateur',
        label: 'El amateur de toda la vida',
        hint: 'Doce temporadas sin cobrar un peso. Jugabas porque sí.',
        gana: (m) => !m.profesional && m.temporadas >= 12,
    },
    {
        id: 'indestructible',
        label: 'El indestructible',
        hint: 'Doscientos partidos y ni una conmoción. El cuerpo te acompañó.',
        gana: (m) => m.partidos >= 200 && m.hia === 0,
    },
    {
        id: 'guerrero',
        label: 'El guerrero',
        hint: 'Cinco conmociones y volviste de todas. Hasta que el cuerpo dijo basta.',
        gana: (m) => m.hia >= 5,
    },
    {
        id: 'roto',
        label: 'El que se dejó todo',
        hint: 'El cuerpo te cortó la carrera antes de tiempo. Sabés por qué.',
        gana: (m) => m.porElCuerpo,
    },
    {
        id: 'se-fue-parado',
        label: 'El que se fue parado',
        hint: 'Colgaste los botines cuando quisiste vos y nadie más.',
        gana: (m) => m.porDecision && m.temporadas >= 8,
    },
    {
        id: 'cartel',
        label: 'El de la tapa',
        hint: 'El cartel te precedía. Los medios te querían más que los rivales.',
        gana: (m) => m.cartel >= 70,
    },
    {
        id: 'titular',
        label: 'El titular indiscutido',
        hint: 'Ciento cincuenta partidos. El equipo se escribía con vos adentro.',
        gana: (m) => m.partidos >= 150,
    },
    {
        id: 'plantel',
        label: 'Uno del plantel',
        hint: 'Ocho temporadas dando el presente. La base que sostiene un club.',
        gana: (m) => m.temporadas >= 8,
    },
    {
        id: 'promesa',
        label: 'La promesa que fue',
        hint: 'Llegaste a primera y jugaste. Hay carreras que empiezan y no siguen.',
        gana: (m) => m.partidos >= 30,
    },

    // La red. Sin condición: el que llega hasta acá jugó poco, y eso también es
    // una carrera que el juego tiene que saber nombrar sin humillarla.
    {
        id: 'del-club',
        label: 'El del club',
        hint: 'Pocas temporadas y un club que te vio pasar. También cuenta.',
        gana: () => true,
    },
];

/** Cuántos títulos hay. El test de forma lo usa para no quedarse corto. */
export const CAREER_TITLE_COUNT = TITULOS.length;

/**
 * El título de esta carrera.
 *
 * Todo sale de la carrera cerrada: los contadores del estado y la planilla
 * derivada (`careerTally`), que es la que sabe traducir la métrica del puesto a
 * tries y puntos —el pilar no anota, y su planilla igual tiene los dos—.
 */
export function careerTitleOf(state: CaptainState): CareerTitle {
    const planilla = careerTally(state);
    const clubes = new Set(state.history.map((h) => h.clubId).filter(Boolean)).size;
    const pertenencias = Object.values(state.belonging.byClub);

    const m: Medidas = {
        temporadas: state.history.length,
        partidos: planilla.matches,
        tries: planilla.tries,
        puntos: planilla.points,
        tackles: planilla.tackles,
        caps: state.national.caps,
        mejorMedia: Math.max(state.player.ovr, ...state.history.map((h) => h.ovr)),
        titulos: state.titles.length,
        premios: state.awards.length,
        clubes: Math.max(1, clubes),
        pertenencia: pertenencias.length > 0 ? Math.max(...pertenencias) : 0,
        hia: state.damage.hia,
        desgaste: state.damage.cuerpo,
        cartel: state.fame,
        edad: state.player.age,
        profesional: state.stage === 'professional',
        porElCuerpo: state.player.retirementReason === 'cuerpo',
        porDecision: state.player.retirementReason === 'decision',
        familia: getFamily(state.player.family).labelEs,
    };

    const ganador = TITULOS.find((t) => t.gana(m)) ?? TITULOS[TITULOS.length - 1];
    return { id: ganador.id, label: ganador.label, hint: ganador.hint };
}
