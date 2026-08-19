/**
 * Formato único para diferencias de puntos/goles.
 *
 * Existía porque la misma métrica se escribía distinto según la pestaña: la
 * tabla de posiciones mostraba `255` y `-48`, y Estadísticas mostraba `+220` y
 * `-96` para los mismos equipos, a un click de distancia. Un positivo sin signo
 * se lee más lento —hay que buscar el guión para saber si es negativo— y hace
 * dudar de si son dos métricas distintas.
 *
 * El signo va SIEMPRE explícito en los positivos. El cero va sin signo: no es
 * ni a favor ni en contra.
 */
export function formatDifference(value: unknown, digits = 0): string {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const abs = Math.abs(num).toLocaleString('es-AR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    if (num > 0) return `+${abs}`;
    if (num < 0) return `-${abs}`;
    return abs;
}
