/**
 * El afiche de El Entrenador, dibujado en SVG.
 *
 * Los otros dos juegos tienen afiche en píxeles (foto y título). Este no tiene
 * foto todavía, así que el afiche es tipográfico: la cancha de fondo, el título
 * en el mismo tono itálico y pesado que los otros, y la bajada. Se dibuja dos
 * veces —gris y verde— para entrar en el mismo mecanismo de reposo/hover que las
 * portadas de imagen, sin tocar su CSS.
 *
 * Decorativo: el h2 de la tarjeta ya nombra el juego.
 */
export default function EntrenadorPoster({ active, className }: { active: boolean; className: string }) {
    const bg0 = active ? '#04120c' : '#0a0d0b';
    const bg1 = active ? '#0b3d24' : '#1b201d';
    const bg2 = active ? '#15803d' : '#2b312e';
    const line = active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)';
    const accent = active ? '#4ade80' : '#9aa39e';
    const id = active ? 'entrenador-on' : 'entrenador-off';

    return (
        <svg
            viewBox="0 0 1920 1080"
            preserveAspectRatio="xMidYMid slice"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={bg0} />
                    <stop offset="0.55" stopColor={bg1} />
                    <stop offset="1" stopColor={bg2} />
                </linearGradient>
                <radialGradient id={`${id}-glow`} cx="0.78" cy="0.85" r="0.6">
                    <stop offset="0" stopColor={bg2} stopOpacity="0.9" />
                    <stop offset="1" stopColor={bg2} stopOpacity="0" />
                </radialGradient>
            </defs>

            <rect width="1920" height="1080" fill={`url(#${id}-bg)`} />
            <rect width="1920" height="1080" fill={`url(#${id}-glow)`} />

            {/* La cancha, vista desde la tribuna: líneas en perspectiva y los palos. */}
            <g stroke={line} strokeWidth="6" fill="none">
                <path d="M-100 1080 L560 300 L1360 300 L2020 1080" />
                <path d="M120 1080 L640 300" />
                <path d="M1800 1080 L1280 300" />
                <path d="M300 620 L1620 620" />
                <path d="M420 480 L1500 480" />
                <path d="M200 800 L1720 800" />
                <path d="M560 300 L1360 300" strokeWidth="8" />
            </g>
            <g stroke={accent} strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.9">
                <path d="M880 300 L880 150" />
                <path d="M1040 300 L1040 150" />
                <path d="M880 215 L1040 215" />
            </g>

            {/* El silbato, chico y a un costado: el sello del juego. */}
            <g transform="translate(1560 130) scale(1.4)" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
                <path d="M20 60 h90 l40 -28 v56 l-40 -28" />
                <circle cx="52" cy="92" r="34" />
                <path d="M20 60 v32" />
            </g>

            <text
                x="960"
                y="700"
                textAnchor="middle"
                fill="#ffffff"
                fontFamily="inherit"
                fontSize="196"
                fontWeight="900"
                fontStyle="italic"
                letterSpacing="-4"
            >
                EL ENTRENADOR
            </text>
            <text
                x="960"
                y="805"
                textAnchor="middle"
                fill="#ffffff"
                fontFamily="inherit"
                fontSize="60"
                fontWeight="800"
                fontStyle="italic"
                letterSpacing="2"
                opacity="0.95"
            >
                DIRIGÍ UN CLUB ARGENTINO DE RUGBY
            </text>
            <text
                x="960"
                y="880"
                textAnchor="middle"
                fill="#ffffff"
                fontFamily="inherit"
                fontSize="46"
                fontWeight="700"
                fontStyle="italic"
                letterSpacing="1"
                opacity="0.85"
            >
                LA SUBCOMISIÓN, EL M19, LA CAJA Y EL MICRO AL INTERIOR
            </text>

            <g transform="translate(680 940)">
                <rect width="560" height="64" rx="32" fill="rgba(4,18,12,0.7)" stroke={accent} strokeOpacity="0.5" strokeWidth="3" />
                <text x="280" y="43" textAnchor="middle" fill={accent} fontFamily="inherit" fontSize="30" fontWeight="800" letterSpacing="4">
                    554 CLUBES · 25 UNIONES
                </text>
            </g>
        </svg>
    );
}
