import type { Metadata } from 'next';
import TrainingZone from '../TrainingZone';

export const metadata: Metadata = {
    title: 'Zona de entrenamiento · El Capitán | G22 Scores',
    description: 'Los 65 minijuegos de rugby de El Capitán, para jugarlos sueltos: los palos, el line-out, el jackal, el tackle. Tres dificultades, récords y un desafío por día.',
};

export default function EntrenamientoPage() {
    return <TrainingZone />;
}
