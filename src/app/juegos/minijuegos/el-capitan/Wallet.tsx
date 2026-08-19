'use client';

import type { CaptainState } from '@/features/captain';
import { SHOP_ITEMS, currentContract, money, seasonsLeftAfter, shopSpentOf } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * CUÁNTO LE QUEDA AL PAPEL, dicho como lo diría un jugador.
 *
 * El año que vence no se cuenta como «1 año»: se dice ÚLTIMO AÑO, que es la
 * única forma en que un vestuario lo nombra y además es la información que
 * importa — es el junio en que hay que sentarse a renovar o escuchar ofertas.
 */
function contractLabel(seasonsLeft: number): string {
    if (seasonsLeft === 0) return 'Último año';
    return `${seasonsLeft} ${seasonsLeft === 1 ? 'año' : 'años'} más`;
}

/**
 * LA BILLETERA.
 *
 * Existe porque la plata de este juego pasó de ser un número decorativo a ser
 * una decisión, y un número que decide algo no puede vivir escondido en una fila
 * de contadores de 11 px al lado de los HIA.
 *
 * Muestra TRES cosas y ninguna es redundante:
 *
 *   · EL SALDO, grande. Es lo que podés gastar hoy.
 *   · LO QUE ENTRÓ ESTE AÑO. Sale de `entry.income` y no de restar dos saldos,
 *     porque restar saldos da «ingreso menos gastos» y eso no es el sueldo. Es
 *     la cifra que el jugador firmó, apareciendo todos los años para que el
 *     contrato se sienta como un contrato.
 *   · CUÁNTO LE QUEDA AL CONTRATO. Desde que los contratos duran dos o tres
 *     años, «cuánto cobrás» sin «hasta cuándo» es medio dato: el sueldo está
 *     congelado hasta que venza, y el junio en que vence es el único en que se
 *     escuchan ofertas.
 *   · LO QUE LLEVÁS INVERTIDO. Es la otra mitad de la historia: sin esto, una
 *     billetera vacía se lee como «no ganaste nada» cuando puede querer decir
 *     «te lo gastaste todo en el gimnasio del club».
 *
 * Y una línea de contexto que convierte el número en una decisión: cuántas de
 * las veinte cosas de la tienda te alcanzan hoy. Un saldo de US$ 240.000 no dice
 * nada solo; «te alcanza para 11 de 20» dice si conviene entrar o esperar.
 *
 * ── Cuándo NO se dibuja ─────────────────────────────────────────────────────
 * En amateur, que es la mayoría de las carreras y buena parte de todas ellas.
 * El rugby de club no paga —el jugador es socio, paga la cuota y paga el
 * fichaje— y una billetera en cero arriba de la pantalla de un pibe de 17
 * miente desde el primer render: sugiere que hay algo que juntar. No hay nada
 * que juntar hasta el contrato.
 */
export default function Wallet({ state, onOpenShop }: { state: CaptainState; onOpenShop?: () => void }) {
    if (state.stage !== 'professional') return null;

    const ultima = state.history[state.history.length - 1];
    const ingreso = ultima?.income ?? 0;
    const invertido = shopSpentOf(state.player);
    const alcanza = SHOP_ITEMS.filter((item) => item.price <= state.money).length;
    // EL CONTRATO ES LA OTRA MITAD DEL SUELDO desde que dura más de un año. Sin
    // esto, la billetera contesta «cuánto cobrás» y deja sin contestar «hasta
    // cuándo», que es lo que decide si conviene gastar hoy o esperar la
    // renovación. Sale de `currentContract` —la misma puerta que usa el motor
    // para pagar— así que no puede desincronizarse de lo que la carrera cobra.
    const contrato = currentContract(state);

    return (
        <div className={styles.wallet}>
            <div className={styles.walletTop}>
                <div>
                    <span className={styles.walletLabel}>Billetera</span>
                    <p className={styles.walletValue}>{money(state.money)}</p>
                </div>
                {onOpenShop && (
                    <button type="button" className={styles.walletShop} onClick={onOpenShop}>
                        Ir a la tienda
                    </button>
                )}
            </div>

            <div className={styles.walletRow}>
                <span className={styles.walletItem}>
                    <span className={styles.walletItemLabel}>Sueldo del año</span>
                    <span className={styles.walletItemValue}>{ingreso > 0 ? money(ingreso) : '—'}</span>
                </span>
                <span className={styles.walletItem}>
                    <span className={styles.walletItemLabel}>Contrato</span>
                    <span className={styles.walletItemValue}>
                        {contrato ? contractLabel(seasonsLeftAfter(contrato, state.season)) : '—'}
                    </span>
                </span>
                <span className={styles.walletItem}>
                    <span className={styles.walletItemLabel}>Invertido</span>
                    <span className={styles.walletItemValue}>{invertido > 0 ? money(invertido) : '—'}</span>
                </span>
                <span className={styles.walletItem}>
                    <span className={styles.walletItemLabel}>Te alcanza para</span>
                    <span className={styles.walletItemValue}>{alcanza} de {SHOP_ITEMS.length}</span>
                </span>
            </div>
        </div>
    );
}
