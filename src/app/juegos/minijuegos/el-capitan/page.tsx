import type { Metadata } from 'next';
import CaptainFlow from './CaptainFlow';

// La metadata va en español y no se localiza, igual que en Carrera de Rugby: el
// idioma del jugador vive en el cliente y esto lo lee un buscador.
export const metadata: Metadata = {
    title: 'El Capitán | G22 Scores',
    // Describía "seis fichas de tiempo por temporada", que es el sistema que la
    // carta de pretemporada reemplazó. Un buscador no se entera de que el juego
    // cambió: hay que venir a corregirlo acá.
    description: 'De las juveniles del club a vivir del rugby, si es que llegás y a la edad que llegues. Simulá una carrera de rugby: ocho puestos, un entrenamiento por temporada y dos escaleras que se pelean tus años.',
};

export default function ElCapitanPage() {
    return <CaptainFlow />;
}
