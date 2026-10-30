import type { Metadata } from 'next';
import ManagerFlow from './ManagerFlow.tsx';

export const metadata: Metadata = {
    title: 'Rugby Manager | G22 Scores',
    description:
        'Dirigí un club de rugby en un mundo con más de 130 clubes: armá el plantel, elegí cómo juega tu equipo y llevalo temporada a temporada.',
};

export default function RugbyManagerPage() {
    // El único <h1> de la página es el título del juego y vive en ManagerFlow,
    // que es donde está el resto de la pantalla.
    return <ManagerFlow />;
}
