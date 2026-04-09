import Link from 'next/link';
import styles from '../../page.module.css';

export default function ProdeJoinLeaguePage() {
    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.detailShell}>
                    <Link href="/prode" className={styles.backLink}>← Volver al lobby</Link>
                    <section className={styles.privateLeagueCta}>
                        <div>
                            <p className={styles.privateLeagueEyebrow}>Invitación</p>
                            <h1 className={styles.privateLeagueTitle}>Ingresar con código</h1>
                            <p className={styles.privateLeagueText}>
                                Este punto queda reservado para el flujo donde el usuario pega el código único de
                                una liga privada y entra directo a competir con su grupo.
                            </p>
                        </div>
                        <div className={styles.warning}>
                            La parte visual del lobby ya empuja este recorrido. El siguiente paso es conectar el
                            formulario con la búsqueda por `invite_code`.
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
