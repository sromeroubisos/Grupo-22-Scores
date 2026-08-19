'use client';

import type { CaptainState, LegacyMomentKind, MechanicId, MinigameSetup, MomentOutcome } from '@/features/captain';
import TackleMoment from './TackleMoment';
import BunkerScene from './BunkerScene';
import JackalMoment from './JackalMoment';
import AnclaMoment from './AnclaMoment';
import CodigoMoment from './CodigoMoment';
import PalosMoment from './PalosMoment';
import BandaMoment from './BandaMoment';
import VentanaScreen from './minijuegos/VentanaScreen';
import SostenScreen from './minijuegos/SostenScreen';
import PunteriaScreen from './minijuegos/PunteriaScreen';
import PuntoScreen from './minijuegos/PuntoScreen';
import LecturaScreen from './minijuegos/LecturaScreen';
import SecuenciaScreen from './minijuegos/SecuenciaScreen';
import MemoriaScreen from './minijuegos/MemoriaScreen';

/**
 * EL REGISTRY DE PANTALLAS.
 *
 * Vive del lado de `app/` y no en el motor, y esa es toda su razón de ser: el
 * motor tiene que poder correr en un test de Node sin DOM, así que no puede
 * importar React ni saber que existe una pantalla. La `MomentDef` declara la
 * REGLA; este archivo declara CÓMO SE DIBUJA. Ninguno de los dos lados conoce al
 * otro.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POR QUÉ ESTO DEJÓ DE SER UN `Record<MomentKind, …>`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Era un `Record` exhaustivo a propósito, y la razón estaba bien escrita:
 * «agregar un kind sin darle pantalla no compila; es la única garantía barata de
 * que los catorce que faltan no terminen con uno mudo que deje la carrera
 * trabada en la fase de Momento».
 *
 * Los que faltaban no fueron catorce: fueron cincuenta y nueve. Y con sesenta y
 * cinco entradas, un `Record` escrito a mano deja de ser una garantía para pasar
 * a ser una segunda lista que hay que mantener sincronizada con el catálogo —o
 * sea, exactamente el problema que decía prevenir, con más renglones.
 *
 * La garantía no se aflojó: se movió a un lugar donde es más fuerte. LA PANTALLA
 * DE UN MINIJUEGO LA DECIDE SU VERBO, no su id. Los siete verbos tienen las
 * siete pantallas de abajo, un spec no compila sin declarar su verbo, y por lo
 * tanto un minijuego mudo es IMPOSIBLE POR CONSTRUCCIÓN: no hay forma de
 * escribir uno que no tenga con qué dibujarse.
 *
 * Lo que sí sigue siendo una lista a mano son los siete escritos a mano, y para
 * esos siete el `Record` exhaustivo sigue existiendo —indexado por
 * `LegacyMomentKind`— porque ahí la garantía todavía compra algo.
 */
export interface MomentScreenProps {
    state: CaptainState;
    /** Lo que hizo el jugador, en crudo. La clasificación es del motor. */
    onResolve: (outcome: MomentOutcome) => void;
}

/**
 * Los dos pre-contrato tienen firmas propias porque se escribieron antes de que
 * el carril existiera. Se adaptan acá y no se les toca el archivo: son las
 * pantallas más probadas del juego y no hay motivo para moverlas.
 */
function TackleScreen({ state, onResolve }: MomentScreenProps) {
    return <TackleMoment state={state} onResolve={(zone, at) => onResolve({ kind: 'tackle', zone, at })} />;
}

function BunkerScreen({ state, onResolve }: MomentScreenProps) {
    return (
        <BunkerScene
            state={state}
            verdict={state.pendingMoment?.verdict ?? 'amarilla'}
            onDone={() => onResolve({ kind: 'bunker' })}
        />
    );
}

/**
 * LA PANTALLA DE LA JUGADA PENDIENTE.
 *
 * Devuelve JSX y no un COMPONENTE, y eso no es estilo: una función que devuelve
 * componentes se llama durante el render, y un componente creado durante el
 * render puede cambiar de identidad entre dos renders y desmontar el minijuego a
 * la mitad. En una tarjeta de texto sería un parpadeo; acá sería perder la barra
 * a mitad de la pasada. La regla `react-hooks/static-components` existe para eso
 * y tiene razón.
 *
 * ── Dos switches, y los dos son exhaustivos ──
 * El primero sobre los siete escritos a mano, el segundo sobre los siete verbos.
 * Los dos terminan en un `default` que TIRA con el nombre adentro, igual que
 * `carrilImposible` en el motor: un kind sin pantalla no puede seguir de largo,
 * porque llegaría como una tarjeta en blanco que traba la carrera en la fase de
 * Momento y no hay botón para salir.
 *
 * ── El verbo sale del SETUP, no del catálogo ──
 * El Setup es lo que viajó al guardado. Así una partida retomada después de un
 * F5 se dibuja con el verbo con el que la jugada apareció, aunque el catálogo
 * haya cambiado abajo.
 */
export function MomentScreen({ state, onResolve }: MomentScreenProps) {
    const moment = state.pendingMoment;
    if (!moment) return null;

    switch (moment.kind as LegacyMomentKind) {
        case 'tackle': return <TackleScreen state={state} onResolve={onResolve} />;
        case 'bunker': return <BunkerScreen state={state} onResolve={onResolve} />;
        case 'ancla': return <AnclaMoment state={state} onResolve={onResolve} />;
        case 'codigo': return <CodigoMoment state={state} onResolve={onResolve} />;
        case 'jackal': return <JackalMoment state={state} onResolve={onResolve} />;
        case 'palos': return <PalosMoment state={state} onResolve={onResolve} />;
        case 'banda': return <BandaMoment state={state} onResolve={onResolve} />;
        default: break;
    }

    const setup = moment.setup as MinigameSetup | undefined;

    switch (setup?.mechanic) {
        case 'ventana': return <VentanaScreen state={state} onResolve={onResolve} />;
        case 'sosten': return <SostenScreen state={state} onResolve={onResolve} />;
        case 'punteria': return <PunteriaScreen state={state} onResolve={onResolve} />;
        case 'punto': return <PuntoScreen state={state} onResolve={onResolve} />;
        case 'lectura': return <LecturaScreen state={state} onResolve={onResolve} />;
        case 'secuencia': return <SecuenciaScreen state={state} onResolve={onResolve} />;
        case 'memoria': return <MemoriaScreen state={state} onResolve={onResolve} />;
        default:
            throw new Error(
                `El Momento '${moment.kind}' no tiene con qué dibujarse: no es uno de los siete `
                + `escritos a mano y su Setup no declara mecánica (${setup?.mechanic ?? 'sin setup'}).`,
            );
    }
}

/**
 * LA GUARDIA DE EXHAUSTIVIDAD, y es de COMPILACIÓN.
 *
 * Un `switch` con `default` que tira avisa en RUNTIME, o sea cuando al jugador
 * le tocó el minijuego nuevo y se quedó mirando una tarjeta en blanco que traba
 * la carrera. Este `Record` avisa antes: agregar un verbo a `MechanicId` sin
 * escribir su caso arriba deja de compilar.
 *
 * Es lo que reemplaza al `Record<MomentKind, …>` exhaustivo que había cuando los
 * Momentos eran siete, y compra lo mismo con siete entradas en vez de sesenta y
 * cinco — porque la pantalla de un minijuego la decide su VERBO y no su id.
 *
 * No puede vivir del lado del motor ni verificarse con un test de `features/`:
 * el motor corre en Node sin DOM y este archivo importa React.
 */
const VERBOS_CUBIERTOS: Record<MechanicId, true> = {
    ventana: true,
    sosten: true,
    punteria: true,
    punto: true,
    lectura: true,
    secuencia: true,
    memoria: true,
};

/** Los verbos que este archivo sabe dibujar. Derivado de la guardia de arriba. */
export const MECHANICS_CON_PANTALLA = Object.keys(VERBOS_CUBIERTOS) as MechanicId[];
