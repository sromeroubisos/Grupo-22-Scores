'use client';

import Image from 'next/image';
import kit from '@/img/CARRERA KIT.png';
import { kitColorOf, kitInkOf } from './kitColors';
import styles from './carrera.module.css';

interface Props {
    surname: string;
    number: number | null;
    /** Código de país elegido. Pinta la camiseta con el color de esa unión. */
    countryCode: string | null;
}

/**
 * Ancho útil de la espalda, en % del ancho de la imagen.
 *
 * 34 y no 44: el torso mide 47% de la imagen, así que con 44 el apellido llegaba
 * literalmente hasta las costuras laterales y se leía como que se sale de la
 * camiseta. El texto tiene que quedar DENTRO de la tela, con aire a los dos
 * lados, aunque eso lo obligue a ser más chico.
 */
const BACK_WIDTH = 34;
/**
 * Ancho de una letra mayúscula de esta fuente, en múltiplos del cuerpo. MEDIDO
 * en el navegador (`scrollWidth / letras / fontSize`), no estimado. Y medido
 * sobre el PEOR caso, no sobre el promedio: con 0,66 —el promedio— "VILLANUEVA"
 * entraba justo pero "ETCHEGARAY", que tiene las mismas diez letras y todas más
 * anchas, se pasaba un 6%.
 */
const LETTER_WIDTH = 0.72;
/**
 * El cuerpo más grande que se usa. Es exactamente el que le toca a un apellido
 * de OCHO letras, que es el largo del placeholder: así todo lo que va de una a
 * ocho letras mide igual y el texto no salta al escribir la primera.
 */
const NAME_MAX = 5.9;
/** Piso: con 3,1 entran las quince letras que permite `sanitizeSurname`. */
const NAME_MIN = 3.1;

/**
 * Tamaño del apellido: el que entre en la espalda, calculado y no adivinado.
 *
 * Se mide contra el ANCHO DE LA ESPALDA (44% de la imagen), no contra el ancho
 * de la camiseta entera: contra el marco completo el texto terminaba siendo casi
 * el doble de la tela donde tiene que entrar y salía por los hombros.
 *
 * Con el tope en 8,4 los apellidos de hasta ocho letras —el caso típico y el
 * largo del placeholder— miden todos casi lo mismo, así que el texto no pega un
 * salto al escribir la primera letra. Con el piso en 4,4 entran los quince
 * caracteres que permite `sanitizeSurname`; los puntos suspensivos del CSS
 * quedan como última guarda para una cadena de letras anchas.
 *
 * En `cqw` (porcentaje del ancho de la camiseta) para que acompañe cuando la
 * camiseta crece con la columna.
 */
function nameSize(length: number): string {
    const fits = BACK_WIDTH / Math.max(1, length) / LETTER_WIDTH;
    return `${Math.max(NAME_MIN, Math.min(NAME_MAX, fits)).toFixed(2)}cqw`;
}

/**
 * Tamaño del número según cuántos dígitos tiene. Manda él: es el elemento
 * grande de la espalda y el apellido lo acompaña a un tercio de su altura.
 * Dos dígitos piden menos cuerpo para no salirse del torso a lo ancho.
 */
function numberSize(digits: number): string {
    return digits >= 2 ? '26cqw' : '31cqw';
}

/**
 * La camiseta. Es lo único de esta pantalla que no pide nada: devuelve.
 *
 * Mientras el jugador escribe su apellido, elige su número y su país, los ve
 * puestos en una espalda que además se pinta con los colores de esa unión. Es
 * el primer momento en que el que está creando deja de llenar un formulario y
 * empieza a ver a alguien — y sale gratis, porque los tres datos ya estaban.
 *
 * El color se aplica con MÁSCARA sobre la silueta y la imagen encima en
 * `multiply`: así la prenda se tiñe pero el trazo (cuello, mangas, costuras)
 * sigue estando. Teñir con `filter` no sirve — el blanco no vira.
 */
export default function JerseyPreview({ surname, number, countryCode }: Props) {
    const name = surname.trim().toUpperCase();
    const placeholder = name.length === 0;
    // "APELLIDO" y no "TU APELLIDO": ocho letras entran enteras en la espalda al
    // mismo cuerpo que un apellido corto, así que el texto no cambia de tamaño
    // al escribir la primera letra ni aparece recortado antes de empezar.
    const shown = placeholder ? 'APELLIDO' : name;
    const sizeFor = shown.length;
    const color = kitColorOf(countryCode);
    const ink = kitInkOf(color);

    return (
        <div className={styles.jersey}>
            <div
                className={styles.jerseyFrame}
                style={{ ['--kit' as string]: color, ['--kit-ink' as string]: ink }}
            >
                {/* Capa de color, recortada con la silueta de la camiseta. */}
                <span className={styles.jerseyTint} aria-hidden="true" />
                <Image
                    src={kit}
                    alt=""
                    className={styles.jerseyImg}
                    priority
                    sizes="(min-width: 900px) 340px, 200px"
                />
                {/* El NÚMERO manda: centrado en el torso, en los dos ejes. El
                    apellido va DEBAJO y a un tercio de su altura, que es como
                    va en una camiseta de verdad.
                    Sin puesto elegido no se dibuja ninguno: un guion a este
                    tamaño no se lee como "todavía no elegiste", se lee como una
                    barra negra en el medio de la espalda. */}
                {number !== null && (
                    <span className={styles.jerseyNumber} style={{ fontSize: numberSize(String(number).length) }}>
                        {number}
                    </span>
                )}
                <span
                    className={`${styles.jerseyName} ${placeholder ? styles.jerseyNamePlaceholder : ''}`}
                    style={{ fontSize: nameSize(sizeFor) }}
                >
                    {shown}
                </span>
            </div>
        </div>
    );
}
