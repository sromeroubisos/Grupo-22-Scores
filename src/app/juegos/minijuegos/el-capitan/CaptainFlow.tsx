'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CaptainAttributeKey, CaptainState, ComodinId, CreateCaptainInput, MomentOutcome } from '@/features/captain';
import { captainReducer, clubLabel, createInitialCaptain, getPendingEvent } from '@/features/captain';
import { clearCaptain, loadCaptain, saveCaptain } from './captainStorage';
import CreatePlayer from './CreatePlayer';
import PlayerHeader from './PlayerHeader';
import TrainingCard from './TrainingCard';
import Shop from './Shop';
import { MomentScreen } from './MomentScreens';
import EventCard from './EventCard';
import SeasonResult, { type ChosenOption, type SeasonResultKind } from './SeasonResult';
import TournamentScreen from './TournamentScreen';
import { decisionImpact, type DecisionImpact } from './decisionImpact';
import HonourPopups from './HonourPopups';
import { newHonours, type Honour } from './honours';
import Retirement from './Retirement';
import { statTierClass } from './statTier';
import styles from './capitan.module.css';

/**
 * El orquestador.
 *
 * Es el ÚNICO lugar del juego con `Math.random`, y solo para sortear la semilla
 * inicial (CLAUDE.md §1). De ahí en adelante todo sale del PRNG sembrado, así
 * que la misma semilla y las mismas decisiones dan la misma carrera.
 *
 * ── Por qué hay un paso de "resultado" ──
 * El reducer resuelve la temporada y abre la decisión en una sola acción. Si la
 * pantalla siguiera al estado sin más, el jugador vería la tarjeta de decisión
 * sin haberse enterado nunca de cómo le fue el año. Por eso el flujo guarda la
 * última temporada jugada y la muestra antes de dejar pasar.
 */
type Step = 'loading' | 'intro' | 'create' | 'career';

/**
 * Cuántas temporadas hacen falta para que la trayectoria valga una columna.
 *
 * Tres y no una: con una fila el panel es un título y un renglón, y en escritorio
 * eso cuesta un tercio del ancho de la pantalla. Con tres ya hay una forma que
 * leer —la media subiendo o no, los partidos, el club que cambió— que es
 * exactamente cuando el panel empieza a contestar algo.
 */
const TIMELINE_MIN_SEASONS = 3;

/**
 * El título del juego, para las pantallas donde no se ve.
 *
 * Cada página lleva UN solo `<h1>` y es el título del juego (CLAUDE.md §6). En
 * la portada se ve; a partir de ahí la pantalla la manda la cabecera del
 * jugador, así que el `<h1>` queda solo para el lector de pantalla y el
 * buscador. Sin esto, todas las pantallas de juego se quedaban sin ninguno.
 */
function GameTitle() {
    return <h1 className={styles.srOnly}>El Capitán</h1>;
}

/**
 * El envoltorio de todas las pantallas, con la salida adentro.
 *
 * Existe porque el juego va camino a ser una pantalla de alto completo —sin
 * footer y sin barra inferior, que hoy son las dos únicas formas de irse de
 * acá— y cuando eso pase esta flecha queda como la única puerta. Un `div`
 * suelto por pantalla garantiza que la próxima se olvide de ponerla.
 *
 * ── Por qué `salida` puede ser `false` ──
 * La barra cuesta 58 px de alto, y en la pantalla de decisión el alto es
 * exactamente lo que falta: medido, la agrega y la primera opción clickeable se
 * corre de 412 px a 460 en una ventana de 900.
 *
 * Y desde que la barra inferior del sitio NO se dibuja en esta ruta
 * (`MobileBottomNav`, para que las cuatro opciones de la pretemporada entren en
 * una pantalla de teléfono), la puerta que queda es la CABECERA DEL SITIO, que
 * es `sticky`: el logo, la búsqueda y el menú están a la vista todo el tiempo,
 * arriba, sin que el jugador tenga que scrollear. El pie sigue abajo de todo.
 *
 * Así que la flecha va donde el espacio sobra —portada, creación, retiro— y en
 * la pantalla de decisión entraría junto con el alto completo, integrada en la
 * cabecera del jugador y sin fila propia. El día que se saque también la
 * cabecera del sitio, esta pantalla se queda sin puerta y la flecha deja de ser
 * opcional.
 */
function Shell({ children, salida = true }: { children?: React.ReactNode; salida?: boolean }) {
    const caja = useRef<HTMLDivElement>(null);

    /**
     * CUÁNTO CROMO HAY ARRIBA DEL TABLERO, medido y no adivinado.
     *
     * En el teléfono la pantalla de juego deja de ser un documento y pasa a ser
     * un tablero de alto fijo: se queda con lo que hay debajo de la cabecera del
     * sitio y lo que no entre scrollea DENTRO de la carta, no en la página. Para
     * eso hace falta saber dónde empieza el tablero, y eso son dos cosas que
     * cambian solas —el alto de la cabecera y el pie de `main`—, así que un
     * `calc(100dvh - 61px)` escrito a mano envejece en el primer retoque del
     * layout.
     *
     * Se mide la distancia del tablero al tope del DOCUMENTO (no del viewport):
     * así el número no depende de dónde esté el scroll cuando se mide. El
     * respaldo del CSS (61 px) es el valor de hoy, para el primer pintado y para
     * el caso en que esto no llegue a correr.
     */
    useEffect(() => {
        const el = caja.current;
        if (!el) return;

        const medir = () => {
            const arriba = el.getBoundingClientRect().top + window.scrollY;
            // Y lo que queda POR DEBAJO del tablero, que es el pie del
            // contenedor de la página. Sin descontarlo el tablero mide exacto
            // hasta el borde de la ventana y ese pie empuja siete píxeles de
            // scroll — el juego entero entra y la página scrollea igual.
            const padre = el.parentElement;
            const abajo = padre ? parseFloat(getComputedStyle(padre).paddingBottom) || 0 : 0;
            el.style.setProperty('--cap-top', `${Math.round(arriba)}px`);
            el.style.setProperty('--cap-bottom', `${Math.round(abajo)}px`);
        };

        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);

    return (
        <div className={styles.shell} ref={caja}>
            {salida && (
                <div className={styles.topbar}>
                    <Link href="/juegos/minijuegos" className={styles.back}>
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M15 6l-6 6 6 6" />
                        </svg>
                        Juegos
                    </Link>
                </div>
            )}
            {/* El cuerpo va envuelto para poder repartir el alto sin arrastrar
                la barra de salida: en las pantallas de antesala se centra, y es
                donde va a colgarse el scroll interno cuando el shell pase a
                alto fijo. */}
            <div className={styles.shellBody}>{children}</div>
        </div>
    );
}

/**
 * EL FICHAJE, EN UN POP-UP.
 *
 * Es la decisión más grande del juego y la única que el propio juego declara
 * irreversible, así que deja de ser una tarjeta más en la fila para tapar la
 * pantalla: mientras esté abierta no hay otra cosa que hacer.
 *
 * ── Por qué `<dialog>` nativo y no un `div` con `position: fixed` ──
 * Porque las tres cosas que hacen que un modal sea un modal vienen puestas:
 * capa superior —no la recorta el `overflow: hidden` del tablero ni pelea
 * ningún z-index—, foco atrapado adentro y fondo inerte para el lector de
 * pantalla. A mano son cuarenta líneas y siempre falta una.
 *
 * ── Por qué no se puede cerrar ──
 * No hay «después lo veo»: el motor está esperando una opción y la pantalla no
 * avanza sin ella. Por eso `onCancel` bloquea el Escape en vez de dejar al
 * jugador con un juego que no responde y sin tarjeta a la vista.
 *
 * Va DENTRO de `.consoleMain` a propósito: los atajos de teclado buscan
 * `[data-choice]` colgando de ahí, y una tarjeta que se dibuja en otra rama del
 * árbol se quedaría sin el 1-2-3-4.
 */
function FichajePopup({ children }: { children: React.ReactNode }) {
    const caja = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialogo = caja.current;
        if (!dialogo || dialogo.open) return;
        dialogo.showModal();
        return () => { if (dialogo.open) dialogo.close(); };
    }, []);

    return (
        <dialog
            ref={caja}
            className={styles.fichajePopup}
            aria-label="Decisión de pase"
            onCancel={(e) => e.preventDefault()}
        >
            {children}
        </dialog>
    );
}

export default function CaptainFlow() {
    const [step, setStep] = useState<Step>('loading');
    const [career, setCareer] = useState<CaptainState | null>(null);
    const [saved, setSaved] = useState<CaptainState | null>(null);
    const [outdated, setOutdated] = useState(false);

    /**
     * La temporada que se acaba de jugar y que todavía no se mostró.
     *
     * `kind` distingue las DOS pasadas por la misma fila: `'year'` es el cierre
     * del año, `'aftermath'` es la vuelta después de la decisión. Sin esto las
     * dos pantallas eran idénticas y la segunda se leía como un cuelgue.
     *
     * `impact` y `chosen` son de la segunda pasada y NO SE PERSISTEN, igual que
     * `ovrDelta`: se calculan en el mismo clic que resuelve la decisión, que es
     * el único momento en que existen los dos estados para restar. Recargar a
     * mitad de partida no puede caer acá —el guardado no tiene pendiente— así
     * que no hay pantalla que se quede sin dato.
     */
    const [pendingResult, setPendingResult] = useState<
        {
            index: number;
            ovrDelta: number;
            kind: SeasonResultKind;
            impact?: DecisionImpact;
            chosen?: ChosenOption;
        } | null
    >(null);

    /**
     * El guardado no está andando (modo privado, cuota llena).
     *
     * La partida sigue en memoria —eso ya estaba bien— pero callarse no: el
     * jugador invierte temporadas en una carrera que se le evapora al cerrar la
     * pestaña. Se avisa una vez y sigue jugando si quiere.
     */
    const [saveFailed, setSaveFailed] = useState(false);

    /**
     * LA TIENDA ESTÁ ABIERTA.
     *
     * Es estado de PANTALLA y no del juego, y por eso vive acá y no en
     * `CaptainState`. La diferencia se nota al recargar: un F5 con la tienda
     * abierta devuelve la pretemporada con la plata ya descontada y las compras
     * hechas, que es exactamente lo que corresponde — lo que se perdió es dónde
     * estaba mirando el jugador, y eso no es parte de su carrera.
     *
     * Guardarlo en el estado obligaría a subir el esquema y a migrar partidas
     * para recordar una pestaña abierta.
     */
    const [shopOpen, setShopOpen] = useState(false);

    /**
     * LOS AVISOS DE LO QUE GANASTE, ya soltados a la pantalla.
     *
     * ── Por qué se detectan acá y no en la tarjeta del año ──
     * Porque las copas no salen todas del mismo lado. La liga, las copas del club
     * y el torneo de la unión los escribe `simulate-season`; el Mundial que se
     * juega a mano lo escribe `FINISH_TOURNAMENT`, DESPUÉS de que la fila del año
     * quedó cerrada. Una pantalla colgada de la fila anuncia todo menos la copa
     * que el jugador ganó jugando. Restando dos estados —lo mismo que hace
     * `decisionImpact` con la decisión— da igual de dónde venga el trofeo.
     */
    const [avisos, setAvisos] = useState<Honour[]>([]);

    /**
     * El estado tal como estaba la última vez que se miró la vitrina.
     *
     * Que arranque en `null` es lo que hace que un F5 no vuelva a anunciar los
     * catorce títulos de la carrera: una partida recién cargada no tiene contra
     * qué restar, así que la primera lectura no anuncia nada. El aviso es del
     * momento en que pasó (por eso tampoco se persiste: CLAUDE.md §2).
     */
    const vitrina = useRef<CaptainState | null>(null);

    /**
     * Los que esperan a que el cierre del año termine de contarse.
     *
     * El cierre revela el titular ÚLTIMO a propósito —«Salieron campeones» es el
     * veredicto de los números que vienen antes—, así que soltar la copa en el
     * segundo uno deja sin sentido a los cinco segundos que siguen. Los suelta
     * `onRevealed`, cuando la tarjeta terminó de hablar.
     */
    const enEspera = useRef<Honour[]>([]);

    const soltarAvisos = useCallback(() => {
        if (enEspera.current.length === 0) return;
        const sueltos = enEspera.current;
        enEspera.current = [];
        setAvisos((previos) => [...previos, ...sueltos]);
    }, []);

    useEffect(() => {
        const antes = vitrina.current;
        vitrina.current = career;

        // Sin carrera no hay vitrina: se limpia todo para que la próxima no
        // herede avisos de la anterior.
        if (!career) {
            enEspera.current = [];
            setAvisos([]);
            return;
        }

        if (!antes) return;

        const nuevos = newHonours(antes, career, clubLabel);
        if (nuevos.length === 0) return;

        enEspera.current = [...enEspera.current, ...nuevos];
        // Sin tarjeta de resultado en pantalla no hay nada que esperar: es el
        // caso del Mundial, que se gana con el año ya contado.
        if (!pendingResult) soltarAvisos();
    }, [career, pendingResult, soltarAvisos]);

    // Carga al montar. Nunca avanza el estado: solo mira si hay partida.
    useEffect(() => {
        const result = loadCaptain();
        if (result.kind === 'ok') setSaved(result.state);
        if (result.kind === 'outdated') setOutdated(true);
        setStep('intro');
    }, []);

    const commit = useCallback((next: CaptainState) => {
        setCareer(next);
        if (!saveCaptain(next)) setSaveFailed(true);
    }, []);

    const start = useCallback((input: CreateCaptainInput) => {
        // El único Math.random del juego.
        const seed = Math.floor(Math.random() * 0x7fffffff);
        const fresh = createInitialCaptain(input, seed);
        setSaved(null);
        setPendingResult(null);
        commit(fresh);
        setStep('career');
    }, [commit]);

    /**
     * Resuelve la temporada. Se llama al elegir el entrenamiento y otra vez al
     * salir de un Momento, porque las dos cosas dejan el estado en `season`.
     */
    const resolveSeason = useCallback((listo: CaptainState) => {
        const antes = listo.player.ovr;
        const jugado = captainReducer(listo, { type: 'ADVANCE' });
        const index = jugado.history.length - 1;
        setPendingResult({ index, ovrDelta: jugado.history[index].ovr - antes, kind: 'year' });
        commit(jugado);
    }, [commit]);

    /**
     * Elegir el entrenamiento arranca la temporada: no hay paso de confirmar.
     * Si el año trae una jugada decisiva, el motor frena en `moment` y la
     * pantalla la ofrece antes de simular — el Momento pasa DENTRO del año, así
     * que su suspensión se cobra en este.
     */
    const train = useCallback((trainingId: string) => {
        if (!career) return;
        const elegido = captainReducer(career, { type: 'CHOOSE_TRAINING', trainingId });
        if (elegido.phase === 'moment') { commit(elegido); return; }
        if (elegido.phase !== 'season') return;
        resolveSeason(elegido);
    }, [career, commit, resolveSeason]);

    /**
     * COMPRAR. No cambia de fase ni consume azar: la tienda queda abierta y el
     * jugador sigue gastando si quiere.
     */
    const buy = useCallback((itemId: string, attr?: CaptainAttributeKey) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'BUY', itemId, attr });
        // Una compra que no correspondía —sin plata, ya comprada, sin escalón—
        // devuelve el estado sin tocar. Sin este corte se guardaría igual y el
        // botón parecería haber hecho algo.
        if (next === career) return;
        commit(next);
    }, [career, commit]);

    /** Lo que hiciste en la jugada. Es tu mano, y el motor la trata como tal. */
    const resolveMomentInput = useCallback((outcome: MomentOutcome) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'RESOLVE_MOMENT', outcome });
        if (next.phase === 'moment') { commit(next); return; } // se fue al bunker
        resolveSeason(next);
    }, [career, commit, resolveSeason]);

    /**
     * DESTAPAR LA CELDA QUE EL JUGADOR TOCÓ.
     *
     * Lleva índice: la grilla es una grilla de selección, no un botón que avanza.
     * No hace falta mirar la fase después —el reducer decide solo si abre otra
     * ronda, cierra el torneo o pasa a la decisión— así que acá alcanza con
     * guardar lo que devolvió.
     */
    const revealTournamentMatch = useCallback((index: number) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'REVEAL_MATCH', index });
        // Una celda que no existe, ya destapada o de otra ronda devuelve el
        // estado sin tocar. Sin este corte se guardaría igual.
        if (next === career) return;
        commit(next);
    }, [career, commit]);

    /**
     * UNA CASILLA DE LA FINAL. La única elección real del juego de las casillas,
     * y la que no cambia la probabilidad — que es todo el punto del diseño.
     */
    const pickTournamentCell = useCallback((index: number) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'PICK_CELL', index });
        // Una casilla ya abierta, la tachada o una que no existe devuelven el
        // estado sin tocar. Sin este corte se guardaría igual.
        if (next === career) return;
        commit(next);
    }, [career, commit]);

    /**
     * UNA CELDA DE LA GRILLA DE TREINTA. Una por partido, y esa es tu tarde.
     *
     * Atrás de cada celda hay un resultado, y la proporción de victorias entre
     * las treinta ES la probabilidad de ese cruce. El jugador no ve los números,
     * pero la mano viene con el peso puesto desde antes de tocar.
     */
    const pickTournamentGrid = useCallback((index: number) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'PICK_GRID', index });
        // Una segunda elección o una celda que no existe devuelven el estado sin
        // tocar. Sin este corte se guardaría igual.
        if (next === career) return;
        commit(next);
    }, [career, commit]);

    /**
     * CERRAR EL TORNEO. Es el gesto que el jugador da DESPUÉS de mirar cómo
     * terminó, y por eso es una acción aparte del último destape.
     */
    const finishTournamentPhase = useCallback(() => {
        if (!career) return;
        commit(captainReducer(career, { type: 'FINISH_TOURNAMENT' }));
    }, [career, commit]);

    /** Qué comodín te traés. Una vez por torneo, antes del primer partido. */
    const chooseTournamentComodin = useCallback((comodin: ComodinId) => {
        if (!career) return;
        const next = captainReducer(career, { type: 'CHOOSE_COMODIN', comodin });
        // Un comodín que no correspondía devuelve el estado sin tocar. Sin este
        // corte se guardaría igual y el botón parecería haber hecho algo.
        if (next === career) return;
        commit(next);
    }, [career, commit]);

    /**
     * Quemar el comodín. Qué hace depende de cuál trajiste: la arenga rearma el
     * partido que viene —nunca el que ya salió—, la charla con el árbitro abre
     * la grilla del próximo, y el cambio de plan rehace uno de grupos perdido.
     */
    const useTournamentComodin = useCallback(() => {
        if (!career) return;
        const next = captainReducer(career, { type: 'USE_COMODIN' });
        if (next === career) return;
        commit(next);
    }, [career, commit]);

    const choose = useCallback((optionId: string) => {
        if (!career) return;

        // La tarjeta que el jugador tenía delante, ANTES de que el reducer la
        // consuma: de acá salen el título del evento y la opción que apretó, que
        // después de resolver ya no se pueden reconstruir.
        const tarjeta = getPendingEvent(career);
        const next = captainReducer(career, { type: 'CHOOSE', optionId });
        // Una opción que no existe devuelve el estado sin tocar. Sin este corte
        // la pantalla mostraría un desenlace vacío por una decisión que nunca
        // pasó.
        if (next === career) return;

        const opcion = tarjeta?.options.find((o) => o.id === optionId);

        // El desenlace se escribe sobre la temporada recién jugada, así que se
        // vuelve a la misma fila — pero como `'aftermath'`, que cuenta lo que
        // dejó la decisión en vez de repetir números que no se movieron.
        setPendingResult({
            index: next.history.length - 1,
            ovrDelta: 0,
            kind: 'aftermath',
            // Los DOS estados, restados acá y en ningún otro lado: es el único
            // punto del juego donde el de antes todavía existe.
            impact: decisionImpact(career, next, clubLabel),
            chosen: tarjeta && opcion ? { eventTitle: tarjeta.title, optionLabel: opcion.label } : undefined,
        });
        commit(next);
    }, [career, commit]);

    /**
     * Empezar de nuevo. Es la ÚNICA acción destructiva del juego y estaba a un
     * clic, pegada a "Continuar la carrera": errarle borraba una carrera de
     * catorce temporadas sin preguntar nada.
     *
     * La confirmación es un segundo estado del mismo botón y no un modal: hay una
     * sola cosa que confirmar y el §6 pide agotar lo inline antes de tapar la
     * pantalla.
     */
    const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);

    const restart = useCallback(() => {
        clearCaptain();
        setCareer(null);
        setSaved(null);
        setPendingResult(null);
        setConfirmandoBorrar(false);
        setStep('create');
    }, []);

    /**
     * Los atajos: 1–4 elige, Enter continúa.
     *
     * Casi todo lo que hace el jugador en este juego es "elegí una de cuatro" y
     * "seguí", y hasta acá las dos cosas eran exclusivamente de mouse. Con
     * teclado se podía llegar tabulando, pero atravesando antes la cabecera del
     * sitio entera — o sea que jugar catorce temporadas eran cientos de Tab.
     *
     * Se resuelve por atributo (`data-choice`, `data-continue`) y no llamando a
     * los handlers: así el atajo hace EXACTAMENTE lo mismo que el clic —incluida
     * cualquier guarda que la tarjeta tenga adentro— y una pantalla nueva queda
     * cubierta con sólo marcar sus botones. Los Momentos no llevan marca a
     * propósito: se juegan con el tiempo, no con una lista.
     */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

            const root = document.querySelector(`.${styles.consoleMain}`);
            if (!root) return;

            if (e.key === 'Enter') {
                // Con un botón enfocado, el navegador ya lo activa: meter mano
                // acá dispararía la acción dos veces.
                if (document.activeElement instanceof HTMLButtonElement) return;
                const seguir = root.querySelector<HTMLButtonElement>('[data-continue]');
                if (seguir) { e.preventDefault(); seguir.click(); }
                return;
            }

            if (!/^[1-9]$/.test(e.key)) return;
            const elegido = root.querySelector<HTMLButtonElement>(`[data-choice="${e.key}"]`);
            if (elegido) { e.preventDefault(); elegido.click(); }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Pantallas ───────────────────────────────────────────────────────────

    if (step === 'loading') {
        // Nunca ofrecer "Continuar" antes de saber si hay partida guardada. Pero
        // tampoco devolver una pantalla en blanco: el `<Shell />` pelado dejaba
        // un negro sin una sola señal de que algo estaba pasando, que es la
        // diferencia entre "cargando" y "roto" para el que mira.
        return (
            <Shell>
                <GameTitle />
                <div className={styles.card} aria-busy="true">
                    <span className={styles.eyebrow}>Minijuegos</span>
                    <p className={styles.cardText}>Buscando si tenés una carrera empezada…</p>
                </div>
            </Shell>
        );
    }

    if (step === 'intro') {
        return (
            <Shell>
                <div className={styles.card}>
                    <span className={styles.eyebrow}>Minijuegos</span>
                    <h1 className={styles.finalTitle}>El Capitán</h1>
                    {/* Este párrafo describía las SEIS FICHAS de tiempo, que el
                        juego dejó de tener cuando entró la carta de
                        pretemporada. Era la única explicación de mecánica que
                        recibía alguien nuevo, y era falsa: entraba a buscar un
                        reparto que ya no existe. El `description` de `page.tsx`
                        arrastraba el mismo texto, así que también viajaba a los
                        buscadores y a lo que se comparte. */}
                    {/* ── LA PROMESA DECÍA OTRO JUEGO ────────────────────────
                        Decía «De la M19 a la 1 del club», y eso pinta un techo
                        que el juego no tiene: la primera del club no es el
                        final, es el principio del tramo largo. Y el
                        profesionalismo no llega a una edad — no hay una sola
                        compuerta de edad en `clubs.ts` ni en `market.ts`: llega
                        cuando alguien te ofrece un contrato, y eso puede pasar a
                        los 20 o a los 27.

                        La edad de arranque que se nombra acá tiene que seguir a
                        `START_AGE` y no al revés: hoy dice dieciséis porque el
                        motor arranca ahí, y si mañana la constante se mueve, esta
                        frase se mueve con ella. */}
                    <p className={styles.finalLead}>
                        De las juveniles del club a vivir del rugby. Si es que llegás, y a la edad
                        que llegues.
                    </p>
                    <p className={styles.cardText}>
                        Empezás con dieciséis en un club de tu país, y de ahí no hay un camino sino
                        los que vayas abriendo. Cada pretemporada elegís UNA cosa para trabajar todo
                        el año —y lo que no elegís, no se entrena—, después se juega la temporada y
                        las cosas pasan. El contrato profesional no tiene edad: llega cuando alguien
                        te lo ofrece, y hasta ese día no hay plata. Firmar te saca del plantel de tu
                        club.
                    </p>

                    {outdated && (
                        <p className={styles.note}>
                            Había una partida guardada de una versión anterior del juego y no se puede
                            retomar. Se empieza de nuevo.
                        </p>
                    )}

                    <div style={{ marginTop: 20 }}>
                        {saved ? (
                            <>
                                <button
                                    type="button"
                                    className={styles.primary}
                                    onClick={() => { setCareer(saved); setStep('career'); }}
                                >
                                    Continuar la carrera
                                </button>
                                <span className={styles.primaryHint}>
                                    {saved.player.name} {saved.player.surname} · temporada {saved.season} · {saved.player.age} años
                                </span>
                                {confirmandoBorrar ? (
                                    <>
                                        <p className={styles.note}>
                                            Se borra la carrera de {saved.player.name} {saved.player.surname},
                                            con {saved.season === 1 ? 'una temporada' : `${saved.season} temporadas`} jugadas.
                                            No se puede deshacer.
                                        </p>
                                        <button type="button" className={styles.danger} onClick={restart}>
                                            Sí, borrarla y empezar de nuevo
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.ghost}
                                            onClick={() => setConfirmandoBorrar(false)}
                                        >
                                            Mejor no
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.ghost}
                                        onClick={() => setConfirmandoBorrar(true)}
                                    >
                                        Empezar una nueva
                                    </button>
                                )}
                            </>
                        ) : (
                            <button type="button" className={styles.primary} onClick={() => setStep('create')}>
                                Empezar una carrera
                            </button>
                        )}
                    </div>
                </div>
            </Shell>
        );
    }

    if (step === 'create' || !career) {
        return (
            <Shell>
                <GameTitle />
                <CreatePlayer onStart={start} />
            </Shell>
        );
    }

    if (career.player.retired && !pendingResult) {
        return (
            <Shell>
                <GameTitle />
                {/* ── SIN LA CABECERA DEL JUGADOR ────────────────────────────
                    Acá estaba `PlayerHeader`, y en el retiro no sumaba: la
                    media, el club, los caps, los títulos y las temporadas los
                    dice la propia pantalla de retiro, que además los cuenta
                    mejor —la MEJOR media y no la última, la trayectoria entera y
                    no el club de hoy—. Lo que sí hacía era gastar el alto que la
                    pantalla necesita para entrar de una sola vez: la ficha, la
                    barra de Pertenencia y la billetera miden juntas más de 300
                    px, y la billetera de alguien que se retiró no decide nada. */}
                <Retirement state={career} onRestart={restart} />
                {/* La última temporada también reparte copas, y el retiro llega
                    pisándole los talones: si el aviso viviera solo en la pantalla
                    de juego, el título del año que te retiraste no se anunciaría
                    nunca. Es `position: fixed`, así que estar en dos ramas del
                    árbol no lo dibuja dos veces — se dibuja en la que esté viva. */}
                <HonourPopups honours={avisos} />
            </Shell>
        );
    }

    const evento = getPendingEvent(career);

    // La pantalla de la jugada sale del registry: agregar un Momento no toca el
    // orquestador, que es lo mismo que pasa del lado del motor con `MomentDef`.
    // `MomentScreen` es un componente ESTÁTICO que despacha adentro: cuál
    // minijuego se dibuja lo decide él leyendo el Setup, no esta línea. Antes acá
    // se elegía el componente y se lo guardaba en una variable, y eso es
    // exactamente lo que puede desmontar la barra a mitad de la pasada si la
    // identidad cambia entre dos renders.
    const hayMomento = career.phase === 'moment' && career.pendingMoment !== null;

    // El torneo va DESPUÉS del cierre de temporada y antes de la decisión, igual
    // que en el motor: primero se lee cómo salió el año, después se juega la
    // ventana internacional, y recién ahí te pasa lo que te pasa. `pendingResult`
    // ya lo garantiza —la tarjeta del año se muestra primero— pero el orden del
    // ternario tiene que decir lo mismo, o la pantalla contaría otra historia que
    // el reducer.
    const hayTorneo = career.phase === 'tournament' && career.pendingTournament !== null;

    // LA TIENDA SOLO EXISTE EN LA PRETEMPORADA, y la guarda va acá además de en
    // el reducer: si el jugador la deja abierta y elige entrenamiento con el
    // teclado, la pantalla tiene que volver sola al ciclo en vez de mostrar una
    // góndola sobre una temporada que ya arrancó.
    const enTienda = shopOpen
        && career.phase === 'offseason'
        && !pendingResult
        && !hayMomento
        && !hayTorneo
        && !evento;

    /**
     * QUÉ TARJETA SE ESTÁ MOSTRANDO. La misma cadena que decide el render de
     * abajo, dicha una vez y en un nombre.
     *
     * Va a la cabecera porque en el teléfono el alto se reparte según lo que el
     * jugador está haciendo: en un Momento —que se juega contra un reloj— y en
     * el torneo —una grilla que se toca—, la planilla y los contadores se
     * pliegan y la cancha se queda con esos 130 px. El estado NO alcanza para
     * saberlo: el cierre del año se dibuja con la fase ya movida a la siguiente,
     * así que `career.phase` diría «torneo» mientras la pantalla cuenta la
     * temporada.
     */
    const pantalla = pendingResult ? 'resultado'
        : hayMomento ? 'momento'
        : hayTorneo ? 'torneo'
        : evento ? 'decision'
        : enTienda ? 'tienda'
        : 'pretemporada';

    return (
        // Sin barra de salida: es la pantalla donde el alto falta, y la puerta
        // sigue estando en el footer y en la barra inferior hasta que el juego
        // pase a alto completo. El porqué completo, en `Shell`.
        <Shell salida={false}>
            <GameTitle />
            {/* La billetera cuelga de la cabecera y no de la tarjeta de turno: la
                plata es estado del jugador, como la Pertenencia y el Cartel, y
                tiene que verse mientras se decide cualquier cosa — no solo
                mientras se compra. El botón a la tienda solo aparece en la
                pretemporada, que es cuando se puede comprar. */}
            <PlayerHeader
                state={career}
                pantalla={pantalla}
                onOpenShop={career.phase === 'offseason' && !pendingResult && !enTienda
                    ? () => setShopOpen(true)
                    : undefined}
            />

            {/* La decisión y la trayectoria son hermanas y no una arriba de la
                otra: en escritorio se reparten en dos columnas y la trayectoria
                deja de empujar la decisión fuera de pantalla. En teléfono esto
                es un `div` y no hace nada. El reparto vive entero en el CSS. */}
            <div className={styles.console}>
                {/* `aria-live`: acá adentro se reemplaza la pantalla entera en el
                    lugar —se cierra una temporada, se abre una decisión, se
                    resuelve una jugada— y hasta ahora nada de eso se anunciaba.
                    Para un lector de pantalla el juego era silencio después de
                    cada clic. `polite` y no `assertive` porque el cambio siempre
                    llega DESPUÉS de una acción del jugador: no hay que
                    interrumpirlo, hay que contarle qué pasó.
                    `atomic` porque la tarjeta se lee entera o no se entiende. */}
                <div className={styles.consoleMain} aria-live="polite" aria-atomic="true">
                    {saveFailed && (
                        <p className={styles.warn} role="status">
                            No se puede guardar en este navegador (pasa en modo privado o con el
                            almacenamiento lleno). La carrera sigue mientras no cierres la pestaña.
                        </p>
                    )}
                    {pendingResult ? (
                        /* La `key` no es un detalle de listas: el cierre del año se
                           REVELA de a poco, y sin remontar la tarjeta ni el reloj
                           del revelado ni las animaciones del CSS arrancan de
                           nuevo. Sin esto, la vuelta después de la decisión y la
                           temporada siguiente heredaban el revelado ya terminado
                           de la pasada anterior. */
                        <SeasonResult
                            key={`${pendingResult.index}-${pendingResult.kind}`}
                            entry={career.history[pendingResult.index]}
                            family={career.player.family}
                            ovrDelta={pendingResult.ovrDelta}
                            kind={pendingResult.kind}
                            impact={pendingResult.impact}
                            chosen={pendingResult.chosen}
                            onContinue={() => setPendingResult(null)}
                            onRevealed={soltarAvisos}
                        />
                    ) : hayMomento ? (
                        <MomentScreen state={career} onResolve={resolveMomentInput} />
                    ) : hayTorneo ? (
                        <TournamentScreen
                            state={career}
                            onReveal={revealTournamentMatch}
                            onChooseComodin={chooseTournamentComodin}
                            onUseComodin={useTournamentComodin}
                            onFinish={finishTournamentPhase}
                            onPick={pickTournamentCell}
                            onPickGrid={pickTournamentGrid}
                        />
                    ) : evento ? (
                        /* Un fichaje es cualquier tarjeta cuyas opciones lleven
                           club: el mercado, la vuelta a casa, la franquicia que
                           te scoutea. Se pregunta por el DATO de la opción y no
                           por una lista de ids, así que un evento de pase nuevo
                           entra al pop-up sin tocar el orquestador. */
                        evento.options.some((o) => o.clubId) ? (
                            <FichajePopup>
                                <EventCard event={evento} onChoose={choose} />
                            </FichajePopup>
                        ) : (
                            <EventCard event={evento} onChoose={choose} />
                        )
                    ) : enTienda ? (
                        <Shop state={career} onBuy={buy} onClose={() => setShopOpen(false)} />
                    ) : (
                        <TrainingCard state={career} onChoose={train} />
                    )}
                </div>

                {/* ── Cuándo se abre la segunda columna, y por qué así ──────────
                    Dos cosas se arreglan acá, y son la misma.

                    1 · SE ABRE CON TRES TEMPORADAS, no con una. El §6 del
                        CLAUDE.md dice «nada de layouts que dejen una columna
                        vacía», y con una temporada jugada este aside reservaba
                        452 px de ancho para UNA línea de 18 px de alto. La
                        condición `:has()` del CSS pregunta si el aside existe,
                        no si tiene algo adentro; el que sabe si hay trayectoria
                        que mostrar es este componente.

                    2 · NO SE DESMONTA EN LA PANTALLA DE RESULTADO. Antes se
                        escondía con `!pendingResult`, y como el ancho del shell
                        cuelga de `:has(.consoleAside)`, el contenedor saltaba de
                        780 a 1240 px y de vuelta EN CADA "Continuar": medido, la
                        tarjeta de decisión se corría horizontalmente entre dos
                        pantallas consecutivas. La trayectoria no molesta al lado
                        del resultado —es el mismo dato, un año después— y
                        dejarla montada hace que el ancho deje de moverse. */}
                {career.history.length >= TIMELINE_MIN_SEASONS && (
                    <aside className={styles.consoleAside}>
                        <div className={styles.card}>
                            <h2 className={styles.asideTitle}>Trayectoria</h2>
                            <div className={styles.timeline}>
                                {[...career.history].reverse().slice(0, 6).map((h) => (
                                    <div key={h.season} className={styles.season}>
                                        <span className={styles.seasonAge}>{h.age}</span>
                                        <span className={styles.seasonBody}>
                                            {/* La media de cada año con su escalón: es la
                                                columna donde se ve la carrera subir, y con
                                                una sola tinta todos los años se parecían. */}
                                            <span
                                                className={`${styles.seasonClub} ${styles.statInk} ${styles[statTierClass(h.ovr)]}`}
                                            >
                                                {h.ovr}
                                            </span>
                                            {/* ── POR QUÉ EL RESTO VA ENVUELTO ────────────
                                                En el teléfono la trayectoria deja de ser una
                                                columna y pasa a ser una CINTA de una línea al
                                                pie del tablero: ahí entra la forma de la
                                                carrera —la edad y la media de cada año, que es
                                                lo que se mira para saber si sube— y no la
                                                planilla del año, que la cuenta el cierre de
                                                temporada. Sin este `span` el detalle son nodos
                                                de texto sueltos y el CSS no puede plegarlo sin
                                                apagar también la media. */}
                                            <span className={styles.seasonMeta}>
                                                {' · '}{h.matchesPlayed} partidos
                                                {h.caps > 0 ? ` · ${h.caps} caps` : ''}
                                                {h.titles.length > 0 ? ` · ${h.titles.join(', ')}` : ''}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                )}
            </div>

            {/* Fuera de la consola a propósito: `.consoleMain` es una región
                `aria-live` que se lee ENTERA en cada cambio, y un aviso adentro
                haría que el lector de pantalla repitiera la tarjeta completa cada
                vez que entra una copa. Los avisos tienen su propia región. */}
            <HonourPopups honours={avisos} />
        </Shell>
    );
}
