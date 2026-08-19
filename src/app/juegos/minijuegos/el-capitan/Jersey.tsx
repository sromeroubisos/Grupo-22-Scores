'use client';

import { kitColorOf, kitInkOf, kitTrimOf } from './kitColors';
import styles from './capitan.module.css';

interface Props {
    /** Apellido tal como lo va escribiendo el jugador. */
    surname: string;
    /** Dorsal elegido. `null` mientras no haya puesto: la espalda va limpia. */
    number: number | null;
    /** Código de país del catálogo. Pinta la prenda con el color de esa unión. */
    countryCode: string | null;
    /** Nombre del país, para el texto alternativo. */
    countryName?: string;
}

/**
 * Ancho útil de la espalda, en unidades del `viewBox`. El torso mide 92 y el
 * texto tiene que quedar DENTRO de la tela, con aire a los dos lados.
 */
const BACK_WIDTH = 84;
/**
 * Ancho de una mayúscula de esta fuente, en múltiplos del cuerpo. Es el PEOR
 * caso y no el promedio: con el promedio, un apellido de letras anchas
 * —"ETCHEGARAY" contra "VILLANUEVA", mismas diez letras— se pasa de la costura.
 */
const LETTER_WIDTH = 0.68;
const NAME_MAX = 15;
/** Piso: con 7,5 entran los veinte caracteres que permite el campo. */
const NAME_MIN = 7.5;

/** El cuerpo del apellido: el que entra en la espalda, calculado y no adivinado. */
function nameSize(length: number): number {
    const fits = BACK_WIDTH / Math.max(1, length) / LETTER_WIDTH;
    return Math.max(NAME_MIN, Math.min(NAME_MAX, fits));
}

/**
 * La silueta, en unidades del `viewBox`. Se dibuja DOS veces —el color y el
 * sombreado encima— así que vive en una constante: dos `d` copiados que se
 * desalinean son una camiseta con el borde corrido y nadie lo ve venir.
 */
const SILUETA = `M 76 14
    C 82 34 118 34 124 14
    Q 140 15 150 21
    L 186 50
    L 172 84
    L 148 72
    L 150 190
    Q 150 198 142 198
    L 58 198
    Q 50 198 50 190
    L 52 72
    L 28 84
    L 14 50
    L 50 21
    Q 60 15 76 14
    Z`;

/** Id estable: hay una sola camiseta en pantalla y el degradado es suyo. */
const SHADE_ID = 'capitan-kit-shade';

/**
 * SVG y no una imagen teñida con máscara: la prenda tiene que pintarse de
 * doscientos y pico de colores distintos —ahora se ofrece el catálogo entero de
 * países— y con un PNG eso son dos capas, un `multiply` y un blanco que no vira.
 * Acá el color es un atributo.
 */
export default function Jersey({ surname, number, countryCode, countryName }: Props) {
    const kit = kitColorOf(countryCode);
    const ink = kitInkOf(kit);
    const trim = kitTrimOf(kit);

    const name = surname.trim().toUpperCase();
    // "APELLIDO" y no "TU APELLIDO": ocho letras entran al mismo cuerpo que un
    // apellido corto, así que el texto no pega un salto al escribir la primera.
    const shown = name.length === 0 ? 'APELLIDO' : name;

    const alt = [
        'Camiseta',
        countryName ? `de ${countryName}` : null,
        number !== null ? `con el ${number}` : null,
        name.length > 0 ? `y el apellido ${name}` : null,
    ].filter(Boolean).join(' ');

    return (
        <svg
            viewBox="0 0 200 216"
            className={styles.jersey}
            role="img"
            aria-label={alt}
        >
            <defs>
                {/* Un poco de volumen. Sin esto la prenda es un recorte de papel
                    de color plano, y con una sombra dura deja de ser tela. */}
                <linearGradient id={SHADE_ID} x1="0" y1="0" x2="0.35" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.14" />
                    <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
                </linearGradient>
            </defs>

            {/* La prenda. Un solo trazo cerrado: cuello, hombros, mangas cortas,
                torso y ruedo. */}
            <path
                d={SILUETA}
                fill={kit}
                stroke={trim}
                strokeWidth={2.5}
                strokeLinejoin="round"
            />
            <path d={SILUETA} fill={`url(#${SHADE_ID})`} />

            {/* Cuello y puños. Es la misma tela más honda, así que van con el
                tono del contorno y no con el del dorsal. */}
            <path
                d="M 76 14 C 82 34 118 34 124 14"
                fill="none"
                stroke={trim}
                strokeWidth={6}
                strokeLinecap="round"
            />
            {/* El puño va en la PUNTA de la manga, no en la sisa: dibujado del
                lado de adentro parecía una costura de axila. */}
            <path d="M 186 50 L 172 84" fill="none" stroke={trim} strokeWidth={7} strokeLinecap="round" />
            <path d="M 14 50 L 28 84" fill="none" stroke={trim} strokeWidth={7} strokeLinecap="round" />

            {/* El APELLIDO va arriba y el DORSAL abajo y grande, que es como va
                en una espalda de verdad. Sin puesto elegido no se dibuja
                ningún número: un guion de este tamaño no se lee como "todavía
                no elegiste", se lee como una barra en el medio de la espalda. */}
            <text
                x={100}
                y={62}
                className={`${styles.jerseyName} ${name.length === 0 ? styles.jerseyNameGhost : ''}`}
                fontSize={nameSize(shown.length)}
                fill={ink}
                textAnchor="middle"
            >
                {shown}
            </text>
            {number !== null && (
                <text
                    x={100}
                    y={148}
                    className={styles.jerseyNumber}
                    fontSize={number >= 10 ? 58 : 68}
                    fill={ink}
                    textAnchor="middle"
                >
                    {number}
                </text>
            )}
        </svg>
    );
}
