import type { Metadata } from 'next';
import CaptainFlow from './CaptainFlow';

// La metadata va en español y no se localiza, igual que en Carrera de Rugby: el
// idioma del jugador vive en el cliente y esto lo lee un buscador.
export const metadata: Metadata = {
    title: 'El Capitán | G22 Scores',
    description: 'De la M14 a la 1 del club. Y si el cuerpo aguanta, a Los Pumas. Simulá una carrera de rugby: ocho puestos, seis fichas de tiempo por temporada y dos escaleras que se pelean tus años.',
};

export default function ElCapitanPage() {
    return <CaptainFlow />;
}
