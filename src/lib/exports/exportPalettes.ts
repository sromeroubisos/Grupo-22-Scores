// Paletas predeterminadas de los exports (fondo + acento). Viven fuera de
// ExportImage para que una pantalla pueda mostrarlas sin cargar el motor de
// dibujo, que es la pieza más pesada del bundle.
export type ExportPalette = {
    id: string;
    name: string;
    description: string;
    bg: string;
    accent: string;
};

export const EXPORT_PALETTES: ExportPalette[] = [
    { id: 'g22-dark', name: 'G22 Dark', description: 'Carbono y verde marca', bg: '#0a0a0b', accent: '#00a365' },
    { id: 'g22-light', name: 'G22 Light', description: 'Claro con acento marca', bg: '#f8fafc', accent: '#00a365' },
    { id: 'rugby-navy', name: 'Rugby Navy', description: 'Azul profundo y cian', bg: '#0f172a', accent: '#38bdf8' },
    { id: 'crimson-night', name: 'Crimson Night', description: 'Grafito con rojo intenso', bg: '#111827', accent: '#ef4444' },
    { id: 'gold-ink', name: 'Gold Ink', description: 'Negro con dorado editorial', bg: '#161616', accent: '#eab308' },
    { id: 'silver-sky', name: 'Silver Sky', description: 'Blanco con azul limpio', bg: '#ffffff', accent: '#2563eb' },
    { id: 'ranking-navy', name: 'Ranking Navy', description: 'Azul profundo con puntos dorados', bg: '#050b1f', accent: '#12297d' },
];
