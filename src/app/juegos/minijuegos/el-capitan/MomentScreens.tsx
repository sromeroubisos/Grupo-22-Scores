'use client';

import type { ComponentType } from 'react';
import type { CaptainState, MomentKind, MomentOutcome } from '@/features/captain';
import TackleMoment from './TackleMoment';
import BunkerScene from './BunkerScene';
import JackalMoment from './JackalMoment';

/**
 * EL REGISTRY DE PANTALLAS.
 *
 * Vive del lado de `app/` y no en el motor, y esa es toda su razón de ser: el
 * motor tiene que poder correr en un test de Node sin DOM, así que no puede
 * importar React ni saber que existe una pantalla. La `MomentDef` declara la
 * REGLA; este archivo declara CÓMO SE DIBUJA. Nadie de los dos lados conoce al
 * otro.
 *
 * Es un `Record<MomentKind, …>` A PROPÓSITO: agregar un kind sin darle pantalla
 * no compila. Es la única garantía barata de que los catorce que faltan no
 * terminen con uno mudo que deje la carrera trabada en la fase de Momento.
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

export const MOMENT_SCREENS: Record<MomentKind, ComponentType<MomentScreenProps>> = {
    tackle: TackleScreen,
    bunker: BunkerScreen,
    jackal: JackalMoment,
};
