import type { Metadata } from 'next';
import CoachFlow from './CoachFlow.tsx';

export const metadata: Metadata = {
    title: 'El Entrenador | G22 Scores',
    description:
        'Dirigí un club argentino de rugby: la subcomisión, el M19, la caja y el micro al Torneo del Interior. 554 clubes reales con su unión, su ciudad y sus colores.',
};

export default function ElEntrenadorPage() {
    // El único <h1> de la página es el título del juego y vive en CoachFlow,
    // que es donde está el resto de la pantalla.
    return <CoachFlow />;
}
