// LOS PREMIOS INDIVIDUALES Y SU ÍCONO.
//
// El motor entrega los logros como TEXTO (`summary.distinctions`: "Campeón del
// Mundo", "Salón de la Fama"…) porque para él son eso: una frase que se muestra.
// Para colgarles una imagen hace falta un id estable de archivo, y ese id es una
// decisión de presentación — el motor no tiene por qué saber cómo se llama un
// PNG.
//
// Por eso el puente vive acá y no en `statistics.ts`. Y por eso hay una prueba
// (`premios.test.ts`) que lee el motor y falla si aparece un logro que esta
// tabla no conoce: sin ella, agregar un premio nuevo lo dejaría para siempre sin
// ícono y nadie se enteraría — no rompe nada, sólo no se ve.

export interface Premio {
    /** Nombre del archivo: `public/premios/<id>.png`. */
    id: string;
    /** El texto EXACTO que emite el motor. Es la clave del puente. */
    label: string;
}

export const PREMIOS: readonly Premio[] = [
    { id: 'campeon-mundo', label: 'Campeón del Mundo' },
    { id: 'finalista-mundial', label: 'Finalista del Mundial' },
    { id: 'salon-fama', label: 'Salón de la Fama' },
    { id: 'capitan-nacional', label: 'Capitán de la selección' },
    // Los tres de temporada (ver engine/awards.ts). El de la liga local es el
    // único que una carrera amateur puede poner en la vitrina.
    { id: 'mejor-jugador-mundo', label: 'Mejor jugador del mundo' },
    { id: 'xv-ideal', label: 'XV ideal del año' },
    { id: 'mejor-temporada-local', label: 'Mejor de la temporada local' },
];

const POR_LABEL = new Map(PREMIOS.map((p) => [p.label, p.id]));

/** Id de archivo del premio, o `null` si ese texto no es un premio conocido. */
export function premioIdOf(label: string): string | null {
    return POR_LABEL.get(label) ?? null;
}
