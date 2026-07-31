import type { Metadata } from 'next';
import CareerFlow from './CareerFlow';
import LaunchGate from './LaunchGate';
import { CareerLocaleProvider } from './LocaleContext';

// Los metadatos salen del SERVIDOR y ahí no se sabe qué idioma eligió este
// jugador: la preferencia vive en `localStorage`. Se declaran en español —el
// idioma canónico del juego— y el provider corrige el título de la pestaña en el
// cliente cuando corresponde. La alternativa real sería partir la ruta en
// `/en/...`, que es otra decisión de producto.
export const metadata: Metadata = {
    title: 'Carrera de Rugby | G22 Scores',
    description: 'Simulá una carrera completa de rugby: posición, club y selección, decisiones por temporada y un retiro para el recuerdo.',
};

export default function CarreraRugbyPage() {
    return (
        <CareerLocaleProvider>
            {/* La puerta se abre sola a la hora declarada en `LaunchGate`. Después
                de eso este envoltorio deja de hacer nada y se puede sacar. */}
            <LaunchGate>
                <CareerFlow />
            </LaunchGate>
        </CareerLocaleProvider>
    );
}
