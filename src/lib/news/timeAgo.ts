// "hace 8 horas": la antigüedad de una nota como se lee en una lista.
// Pasada una semana devuelve null y quien llama escribe la fecha.

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
    if (!iso) return null;
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return null;

    const minutes = Math.floor((now - time) / 60_000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;

    return null;
}
