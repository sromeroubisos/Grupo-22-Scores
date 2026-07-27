import type { Metadata } from 'next';
import CareerFlow from './CareerFlow';

export const metadata: Metadata = {
    title: 'Carrera de Rugby | G22 Scores',
    description: 'Simulá una carrera completa de rugby: posición, club y selección, decisiones por temporada y un retiro para el recuerdo.',
};

export default function CarreraRugbyPage() {
    return <CareerFlow />;
}
