'use client';

import {
    ArrowRight,
    BadgeCheck,
    CalendarDays,
    CalendarPlus,
    Handshake,
    IdCard,
    MapPin,
    Network,
    UserCog,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { ClubManagerTabId } from '@/lib/club-admin/manageTabs';

interface HomeTabProps {
    onOpen: (tab: ClubManagerTabId) => void;
}

type Shortcut = {
    tab: ClubManagerTabId;
    title: string;
    detail: string;
    icon: LucideIcon;
    /** Ocupa dos columnas: la sección que más se usa después de cargar partidos. */
    wide?: boolean;
};

/**
 * Lo que un club hace seguido va primero: cargar partidos, armar categorías y
 * planteles, ver su familia. Lo que se toca una vez (datos, sedes, accesos,
 * sponsors, publicar) va después. El orden es el de uso, no el de las pestañas.
 *
 * Ocho accesos a ancho simple son ocho celdas: cuatro filas justas en dos
 * columnas y dos en cuatro, sin un hueco al final de la grilla. Si se suma un
 * noveno, alguno tiene que pasar a doble ancho (`wide`).
 */
const SHORTCUTS: readonly Shortcut[] = [
    { tab: 'partidos', title: 'Partidos y Hoy', detail: 'Lo que se juega hoy, lo que viene y los resultados.', icon: CalendarDays },
    { tab: 'jugadores', title: 'Categorías y jugadores', detail: 'Primera, Intermedia, juveniles y sus planteles.', icon: Users },
    { tab: 'relacionados', title: 'Clubes de la familia', detail: 'El club, sus categorías y sus ramas.', icon: Network },
    { tab: 'general', title: 'Datos del club', detail: 'Escudo, nombre, colores y unión.', icon: IdCard },
    { tab: 'sedes', title: 'Sedes', detail: 'Canchas donde juega el club.', icon: MapPin },
    { tab: 'usuarios', title: 'Usuarios', detail: 'Quién más puede administrar.', icon: UserCog },
    { tab: 'sponsors', title: 'Sponsors', detail: 'Marcas que acompañan al club.', icon: Handshake },
    { tab: 'publicar', title: 'Publicar', detail: 'Qué falta para que el club se vea.', icon: BadgeCheck },
];

/**
 * La portada del gestor de club: accesos rápidos a cada sección.
 *
 * Es lo primero que ve un club al entrar y adonde lleva "Volver al panel". La
 * barra de pestañas sigue existiendo para moverse entre secciones, pero desde
 * el teléfono una fila de seis pestañas que scrollea esconde la mitad: acá todo
 * está a la vista y con área de toque de sobra.
 */
export function HomeTab({ onOpen }: HomeTabProps) {
    return (
        <div className="cm-home">
            <button type="button" className="cm-home-hero" onClick={() => onOpen('partido')}>
                <span className="cm-home-hero-icon" aria-hidden="true">
                    <CalendarPlus size={24} />
                </span>
                <span className="cm-home-hero-copy">
                    <span className="cm-home-hero-title">Crear partido</span>
                    <span className="cm-home-hero-detail">
                        Elegí la categoría y el rival. Queda en la agenda del club.
                    </span>
                </span>
                <ArrowRight size={20} className="cm-home-hero-arrow" aria-hidden="true" />
            </button>

            <nav className="cm-home-grid" aria-label="Secciones del club">
                {SHORTCUTS.map(({ tab, title, detail, icon: Icon, wide }) => (
                    <button
                        key={tab}
                        type="button"
                        className={`cm-home-tile${wide ? ' cm-home-tile-wide' : ''}`}
                        onClick={() => onOpen(tab)}
                    >
                        <span className="cm-home-tile-icon" aria-hidden="true">
                            <Icon size={18} />
                        </span>
                        <span className="cm-home-tile-title">{title}</span>
                        <span className="cm-home-tile-detail">{detail}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}
