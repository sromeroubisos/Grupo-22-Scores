import { etiquetaDeTemporada } from '@/lib/tournamentSeasonFilter';

/**
 * El año de una edición, al lado del nombre del torneo.
 *
 * No se dibuja para la temporada en curso: si el listado muestra 2026 y las 126
 * tarjetas dicen "2026", el dato deja de distinguir y pasa a ser ruido. Aparece
 * donde desambigua —un torneo de un año anterior entre los de este, o el listado
 * entero cuando se pidió `?season=2025`—.
 *
 * Devuelve `null` en vez de un contenedor vacío, por lo mismo que el menú de
 * navegación: un elemento que no tiene nada que decir no ocupa lugar ni deja un
 * separador colgando.
 */
export default function TournamentSeasonTag({ seasonId }: { seasonId?: string | null }) {
    const etiqueta = etiquetaDeTemporada(seasonId);
    if (!etiqueta) return null;

    return (
        <span
            // El año no es parte del nombre: se lee como dato, no como título.
            style={{
                flexShrink: 0,
                fontSize: '0.72em',
                lineHeight: 1,
                padding: '2px 5px',
                borderRadius: 4,
                border: '1px solid currentColor',
                opacity: 0.6,
                fontVariantNumeric: 'tabular-nums',
            }}
        >
            {etiqueta}
        </span>
    );
}
