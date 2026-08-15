'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Honour } from './honours';
import ClubBadge from './ClubBadge';
import styles from './capitan.module.css';

/**
 * LOS AVISOS DE LO QUE GANASTE.
 *
 * Una copa y un premio individual son las dos cosas más raras que le pasan a una
 * carrera, y hasta acá llegaban como un renglón gris al pie del cierre del año.
 * Esto los saca de ahí: caen AL MEDIO DE LA PANTALLA, de a uno, con su golpe de
 * entrada, y se van solos.
 *
 * ── Al medio y no en un rincón ──────────────────────────────────────────────
 * Un aviso arrinconado es una notificación —se puede no mirar, y eso es lo que
 * un rincón promete—; al medio es un premio que te entregan. La contra es que
 * tapa lo que hay atrás, y de ahí salen las tres decisiones que siguen: la pila
 * es corta (tres), cada aviso dura poco (`LIFE_MS`) y cualquiera se cierra de un
 * toque.
 *
 * ── La cascada, y por qué no es un `animationDelay` ─────────────────────────
 * Los avisos entran ESCALONADOS —uno cada medio segundo— y la tentación es
 * dibujarlos todos juntos y repartir el retraso en el CSS. No sirve: la lista se
 * consume salteada (uno se va, otro entra) y el retraso quedaría atado al índice
 * de la lista, que se corre en cada baja. Es la trampa del §1.5 del CLAUDE de
 * captain con otra ropa. Acá la cola la maneja el componente y cada aviso se
 * monta cuando le toca, así que su animación arranca sola y su reloj de vida
 * arranca con ella.
 *
 * ── El tope de tres, y qué pasa con el resto ────────────────────────────────
 * Una temporada grande puede dejar liga, copa, el torneo de la unión y dos
 * premios. Cinco avisos apilados no entran en un teléfono, así que se muestran
 * de a tres: el cuarto entra cuando el primero se va. Nada se pierde —la cola se
 * vacía entera— y nada se recorta en silencio.
 *
 * ── No se persiste, y eso es deliberado ─────────────────────────────────────
 * Un F5 a mitad de carrera no vuelve a anunciar la vitrina: quien decide qué es
 * nuevo es `CaptainFlow` restando dos estados, y una partida recién cargada no
 * tiene contra qué restar. El aviso es del momento en que pasó.
 */

/** Cuántos avisos conviven en pantalla. El resto espera su turno en la cola. */
const MAX_VISIBLE = 3;

/** El escalón entre uno y el siguiente: llegan de a uno, no de golpe. */
const ENTER_STEP_MS = 480;

/**
 * Lo que se queda cada aviso antes de irse solo.
 *
 * Más corto que el de un aviso de rincón, y por lo mismo que están al medio:
 * acá el aviso tapa la tarjeta que el jugador estaba leyendo. Alcanza para leer
 * tres renglones dos veces; pasado eso, es un estorbo.
 */
const LIFE_MS = 4600;

/** Lo que tarda en salir. Va acompasado con `capHonourOut` en el CSS. */
const EXIT_MS = 300;

export default function HonourPopups({ honours }: { honours: Honour[] }) {
    const [visibles, setVisibles] = useState<Honour[]>([]);

    /**
     * Cuántos de la cola ya salieron a pantalla.
     *
     * Es un `ref` y no estado porque no dibuja nada: es el cursor de la cola. Y
     * es un CONTADOR y no un `Set` de keys porque `honours` solo crece —
     * `CaptainFlow` agrega al final y nunca saca—, así que la posición alcanza.
     */
    const consumidos = useRef(0);

    /* LA COLA SE VACIÓ: es otra carrera. Sin esto, el cursor viejo se queda
       adelantado y el primer título de la partida nueva no sale nunca — y un
       aviso de la carrera borrada sobrevive al borrado. Hoy el componente se
       desmonta al volver a la creación, así que el `ref` arrancaría limpio
       igual; queda escrito porque eso depende de una rama del árbol y esto no. */
    useEffect(() => {
        if (honours.length > 0) return;
        consumidos.current = 0;
        setVisibles((previos) => (previos.length === 0 ? previos : []));
    }, [honours]);

    useEffect(() => {
        if (consumidos.current >= honours.length) return;
        if (visibles.length >= MAX_VISIBLE) return;

        // El primero de una tanda no hace esperar a nadie; los que siguen entran
        // escalonados para que se lean de a uno.
        const espera = visibles.length === 0 ? 0 : ENTER_STEP_MS;
        const id = setTimeout(() => {
            const siguiente = honours[consumidos.current];
            if (!siguiente) return;
            consumidos.current += 1;
            setVisibles((previos) => [...previos, siguiente]);
        }, espera);

        return () => clearTimeout(id);
    }, [honours, visibles]);

    const cerrar = useCallback((key: string) => {
        setVisibles((previos) => previos.filter((h) => h.key !== key));
    }, []);

    if (visibles.length === 0) return null;

    return (
        /* `aria-live` propio y separado del de la consola: son dos regiones
           distintas —una cuenta la pantalla, esta cuenta lo que ganaste— y
           mezclarlas haría que el lector de pantalla releyera la tarjeta entera
           cada vez que entra un aviso. */
        <div className={styles.honourStack} role="status" aria-live="polite">
            {visibles.map((honour) => (
                <HonourToast key={honour.key} honour={honour} onClose={cerrar} />
            ))}
        </div>
    );
}

/**
 * Un aviso.
 *
 * Se maneja solo: cuenta su vida, se pinta saliendo y recién entonces avisa que
 * se puede sacar de la lista. Si el padre lo desmontara al vencer el reloj, la
 * salida no se vería nunca — desaparecería de un frame al otro.
 */
function HonourToast({ honour, onClose }: { honour: Honour; onClose: (key: string) => void }) {
    const [saliendo, setSaliendo] = useState(false);

    useEffect(() => {
        if (saliendo) return;
        const id = setTimeout(() => setSaliendo(true), LIFE_MS);
        return () => clearTimeout(id);
    }, [saliendo]);

    useEffect(() => {
        if (!saliendo) return;
        const id = setTimeout(() => onClose(honour.key), EXIT_MS);
        return () => clearTimeout(id);
    }, [saliendo, honour.key, onClose]);

    return (
        <div className={`${styles.honourToast} ${saliendo ? styles.honourToastOut : ''}`}>
            {/* EL GOLPE. Dos capas decorativas y nada más: el resplandor que se
                abre detrás del emblema y el brillo que cruza la tarjeta una vez.
                Van con `aria-hidden` porque no dicen nada que el texto no diga, y
                fuera del flujo para no mover una línea de lugar. */}
            <span className={styles.honourGlow} aria-hidden="true" />
            <span className={styles.honourShine} aria-hidden="true" />

            {/* EL ESCUDO CUANDO HAY CLUB. Una copa de club es del club: el
                trofeo genérico sirve para la selección y para el premio, donde no
                hay escudo que poner. Va decorativo porque el nombre del club está
                escrito en la línea de abajo. */}
            {honour.clubId ? (
                <span className={styles.honourCrest}>
                    <ClubBadge clubId={honour.clubId} clubName={honour.clubName ?? ''} size={34} />
                </span>
            ) : (
                <span className={styles.honourIcon} aria-hidden="true">{honour.icon}</span>
            )}

            <span className={styles.honourBody}>
                <span className={styles.honourEyebrow}>{honour.eyebrow}</span>
                <span className={styles.honourLabel}>{honour.label}</span>
                <span className={styles.honourDetail}>{honour.detail}</span>
            </span>

            <button
                type="button"
                className={styles.honourClose}
                aria-label="Cerrar el aviso"
                onClick={() => setSaliendo(true)}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                >
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </div>
    );
}
