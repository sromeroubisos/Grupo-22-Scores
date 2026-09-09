import { etiquetaCortaDeRonda, etiquetaDeRonda } from '@/lib/tennis/labels';
import type {
    TennisDrawBlock,
    TennisDrawParticipant,
    TennisDrawTree,
} from '@/lib/services/tennis';

/**
 * El cuadro del proveedor, traducido a lo que dibuja la pantalla.
 *
 * La traducción vive acá y no en el componente por dos motivos. Uno: el árbol
 * del proveedor trae campos por participante que no se usan y arrastrarlos
 * hasta el cliente es peso muerto en el payload. Dos: las fechas se formatean
 * ACÁ, en el servidor y con huso fijo, así que el HTML del servidor y el del
 * cliente dicen lo mismo y no hay parpadeo de hidratación.
 */

const USER_TZ = 'America/Argentina/Buenos_Aires';

const FECHA = new Intl.DateTimeFormat('es-AR', {
    timeZone: USER_TZ,
    day: 'numeric',
    month: 'short',
});

// 24 horas explícitas: el `es-AR` de Node resuelve a "09:10 p. m.", que en una
// franja de 10px ocupa el doble y no es como se escribe un horario acá.
const HORA = new Intl.DateTimeFormat('es-AR', {
    timeZone: USER_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

export interface LadoVM {
    /** `null` cuando el lugar todavía no tiene dueño. */
    nombre: string | null;
    codigo: string | null;
    /** "1", "Q", "LL", "WC": el número o la vía de entrada al cuadro. */
    sembrado: string | null;
    ranking: number | null;
    gano: boolean;
    /** Los sets ganados, como los muestra el cuadro. */
    sets: string | null;
    /** Para el buscador: el nombre sin tildes y en minúscula. */
    clave: string;
}

export interface CruceVM {
    id: string;
    /** El id de la ficha del partido, si el proveedor lo trae. */
    matchId: string | null;
    /** El arranque en segundos, para poder comparar. `fecha` ya es texto. */
    inicio: number | null;
    fecha: string | null;
    hora: string | null;
    enVivo: boolean;
    terminado: boolean;
    /** El partido se cortó: uno de los dos no siguió. */
    abandono: boolean;
    /** Los dos lugares del cruce, siempre dos, en el orden del cuadro. */
    lados: [LadoVM, LadoVM];
}

export interface RondaVM {
    id: number;
    order: number;
    nombre: string;
    nombreCorto: string;
    cruces: CruceVM[];
}

export interface CuadroVM {
    id: number;
    nombre: string;
    /** La ronda que se está jugando. `null` cuando el cuadro ya terminó. */
    rondaActual: number | null;
    /** Dónde arranca el árbol al entrar. Siempre hay una, terminado o no. */
    rondaInicial: number;
    esClasificacion: boolean;
    rondas: RondaVM[];
}

export interface ResumenVM {
    rondaActual: string | null;
    /** Quién lo ganó. Solo cuando la final está jugada. */
    campeon: string | null;
    enVivo: number;
    /** "30 ago – 13 sep", o la fecha sola si el torneo dura un día. */
    fechas: string | null;
    jugadores: number | null;
}

const SIN_LADO: LadoVM = {
    nombre: null,
    codigo: null,
    sembrado: null,
    ranking: null,
    gano: false,
    sets: null,
    clave: '',
};

/** Sin tildes y en minúscula: buscar "cerundolo" tiene que encontrar a Cerúndolo. */
export function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

function aLado(participante: TennisDrawParticipant | undefined, sets: string | null): LadoVM {
    const team = participante?.team;
    // Un lugar sin dueño llega como si fuera un jugador: `disabled` y un
    // nombre de relleno ("TBD"). Sin este corte la final del US Open se
    // dibuja "TBD vs TBD".
    if (!team?.name || team.disabled === true) return SIN_LADO;

    const nombre = team.shortName || team.name;
    const sembrado = participante?.teamSeed;

    return {
        nombre,
        codigo: team.nameCode ?? null,
        sembrado: sembrado == null || sembrado === '' ? null : String(sembrado),
        ranking: typeof team.ranking === 'number' ? team.ranking : null,
        gano: participante?.winner === true,
        sets,
        // El nombre completo entra en la clave: el cuadro muestra "A. Zverev",
        // pero el que busca escribe "alexander".
        clave: normalizar(`${team.name} ${nombre}`),
    };
}

function aCruce(bloque: TennisDrawBlock, rondaId: number, indice: number): CruceVM {
    const participantes = [...(bloque.participants ?? [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );

    const eventId = bloque.events?.[0];
    const inicio = bloque.seriesStartDateTimestamp;
    const fecha = inicio ? new Date(inicio * 1000) : null;

    return {
        id: `${rondaId}-${bloque.blockId ?? bloque.order ?? indice}`,
        // El id ya viene con su prefijo: el servicio es el único que sabe
        // cómo se arma.
        matchId: typeof eventId === 'string' && eventId ? eventId : null,
        inicio: inicio ?? null,
        fecha: fecha ? FECHA.format(fecha) : null,
        hora: fecha ? HORA.format(fecha) : null,
        enVivo: bloque.eventInProgress === true,
        terminado: bloque.finished === true,
        abandono: (bloque.result ?? '').toLowerCase() === 'retired',
        lados: [
            aLado(participantes[0], bloque.homeTeamScore ?? null),
            aLado(participantes[1], bloque.awayTeamScore ?? null),
        ],
    };
}

export function aCuadro(tree: TennisDrawTree): CuadroVM {
    const rondas: RondaVM[] = [...(tree.rounds ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((ronda) => ({
            id: ronda.id,
            order: ronda.order,
            nombre: etiquetaDeRonda(ronda.description) ?? ronda.description,
            nombreCorto: etiquetaCortaDeRonda(ronda.description) ?? ronda.description,
            cruces: (ronda.blocks ?? [])
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((bloque, i) => aCruce(bloque, ronda.id, i)),
        }));

    // La ronda en curso se DEDUCE de los partidos, no se lee del `currentRound`
    // del proveedor: ese campo dice 4 en la clasificación del US Open, que tiene
    // tres rondas. La primera con un cruce sin terminar es la que se juega, y si
    // no hay ninguna el cuadro terminó.
    const primera = rondas[0]?.order ?? 1;
    const ultima = rondas.length > 0 ? rondas[rondas.length - 1].order : 1;
    const enCurso = rondas.find((r) => r.cruces.some((c) => !c.terminado));

    // Un cuadro terminado no abre en la primera ronda —64 cruces de hace dos
    // semanas— ni en la final sola: abre en las últimas tres, que es el camino
    // al título. Uno en juego abre en la ronda que se juega.
    const rondaInicial = enCurso ? enCurso.order : Math.max(primera, ultima - 2);

    return {
        id: tree.id,
        nombre: tree.name,
        rondaActual: enCurso?.order ?? null,
        rondaInicial,
        esClasificacion: /qualif|clasific/i.test(tree.name),
        rondas,
    };
}

/**
 * Lo que va arriba de todo: en qué anda el torneo.
 *
 * Sale del cuadro principal y no del de clasificación, que ya terminó cuando
 * el torneo empieza y diría que la última ronda fue hace una semana.
 */
export function resumirCuadro(cuadro: CuadroVM | undefined): ResumenVM {
    if (!cuadro) {
        return { rondaActual: null, campeon: null, enVivo: 0, fechas: null, jugadores: null };
    }

    const enJuego = cuadro.rondas.find((r) => r.order === cuadro.rondaActual);
    const enVivo = cuadro.rondas.reduce(
        (total, ronda) => total + ronda.cruces.filter((c) => c.enVivo).length,
        0,
    );

    const primera = cuadro.rondas[0];
    const final = cuadro.rondas[cuadro.rondas.length - 1]?.cruces[0];
    const campeon = final?.terminado
        ? final.lados.find((l) => l.gano)?.nombre ?? null
        : null;

    return {
        rondaActual: enJuego?.nombre ?? null,
        campeon,
        enVivo,
        fechas: rangoDeFechas(cuadro),
        jugadores: primera ? primera.cruces.length * 2 : null,
    };
}

/**
 * El primer día y el último del cuadro.
 *
 * Se saca del MÍNIMO y el MÁXIMO, no del primer y el último cruce de la lista:
 * una ronda de 64 se juega repartida en tres días y el orden del cuadro no es
 * el del calendario. Tomando las puntas de la lista, el US Open arrancaba el
 * 1 de septiembre cuando en realidad la primera ronda empezó el 30 de agosto.
 */
function rangoDeFechas(cuadro: CuadroVM): string | null {
    const inicios = cuadro.rondas
        .flatMap((ronda) => ronda.cruces.map((cruce) => cruce.inicio))
        .filter((i): i is number => typeof i === 'number');
    if (inicios.length === 0) return null;

    const desde = FECHA.format(new Date(Math.min(...inicios) * 1000));
    const hasta = FECHA.format(new Date(Math.max(...inicios) * 1000));
    return desde === hasta ? desde : `${desde} – ${hasta}`;
}
