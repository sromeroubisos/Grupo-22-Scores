import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import coverIdle from '@/img/7.png';
import coverActive from '@/img/8.png';
import soonIdle from '@/img/9.png';
import soonActive from '@/img/10.png';
import styles from '../juegos.module.css';

export const metadata: Metadata = {
    title: 'Minijuegos | G22 Scores',
    description: 'Partidas rápidas y desafíos de G22 Scores. Jugá el simulador de Carrera de Rugby.',
};

function ChevronRight() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}

function BackArrow() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
        </svg>
    );
}

export default function MinijuegosPage() {
    return (
        <div className={styles.page}>
            <Link href="/juegos" className={styles.backLink}>
                <BackArrow /> Juegos
            </Link>

            <header className={styles.hero}>
                <span className={styles.eyebrow}>Minijuegos</span>
                <h1 className={styles.title}>Elegí un juego</h1>
                <p className={styles.subtitle}>
                    Partidas cortas para pasar el rato. Vamos sumando más con el tiempo.
                </p>
            </header>

            <div className={`${styles.grid} ${styles.gridSingle}`}>
                {/* `?nuevo=1`: la portada entra directo a crear el jugador. Si hay
                    una partida guardada el juego igual muestra la intro, que es el
                    único lugar donde vive "Continuar carrera". */}
                <Link href="/juegos/minijuegos/carrera-rugby?nuevo=1" className={`${styles.card} ${styles.cardPoster}`}>
                    {/* El afiche dice el nombre, pero lo dice en píxeles: el h2 lo
                        deja también en texto, que es lo único que puede leer un
                        lector de pantalla o un buscador. */}
                    <h2 className={styles.srOnly}>Carrera de Rugby</h2>
                    <span className={styles.cover}>
                        {/* Dos afiches, uno encima del otro: en desktop el gris
                            manda y el verde aparece al pasar el mouse; en táctil
                            no hay hover, así que la portada es el verde y punto.
                            Decorativos los dos — el h2 ya nombra el juego. */}
                        <Image
                            src={coverIdle}
                            alt=""
                            className={`${styles.coverImg} ${styles.coverIdle}`}
                            sizes="(max-width: 640px) 100vw, 520px"
                        />
                        <Image
                            src={coverActive}
                            alt=""
                            className={`${styles.coverImg} ${styles.coverActive}`}
                            sizes="(max-width: 640px) 100vw, 520px"
                        />
                    </span>
                    <span className={styles.playBtn}>Jugar <ChevronRight /></span>
                </Link>

                {/* El afiche de lo que viene. No es un enlace ni un botón: no hay
                    adónde ir todavía, así que va como div y sin la pastilla de
                    "Jugar". El único guiño al mouse es el cambio de afiche —
                    levantar una tarjeta que no se puede clickear promete un clic
                    que no existe. */}
                <div className={`${styles.card} ${styles.cardPoster} ${styles.cardStatic}`}>
                    {/* El afiche dice "Próximamente" en píxeles; el h2 lo deja en
                        texto para el lector de pantalla y el buscador. */}
                    <h2 className={styles.srOnly}>Próximamente: más juegos en camino</h2>
                    <span className={styles.cover}>
                        <Image
                            src={soonIdle}
                            alt=""
                            className={`${styles.coverImg} ${styles.coverIdle}`}
                            sizes="(max-width: 640px) 100vw, 520px"
                        />
                        <Image
                            src={soonActive}
                            alt=""
                            className={`${styles.coverImg} ${styles.coverActive}`}
                            sizes="(max-width: 640px) 100vw, 520px"
                        />
                    </span>
                </div>
            </div>
        </div>
    );
}
