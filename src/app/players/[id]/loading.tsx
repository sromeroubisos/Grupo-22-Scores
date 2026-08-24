import styles from './PlayerProfile.module.css';
import skeleton from './loading.module.css';

/**
 * El esqueleto tiene que tener LA MISMA FORMA que la ficha: cabecera, cinta de
 * numeros y pestanas. El anterior dibujaba una fila de cuatro numeros que la
 * pagina real no tenia, asi que el contenido saltaba al llegar.
 *
 * Y los colores salen de los tokens. El anterior pedia `var(--bg-primary,
 * #0f1117)` — un token que no existe en `globals.css` (el bueno es
 * `--color-bg-primary`), asi que ganaba siempre el fallback y en tema claro
 * entraba un bloque negro en cada carga.
 */
export default function PlayerLoading() {
    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div className="container">
                    <div className={`${skeleton.bar} ${skeleton.breadcrumb}`} />

                    <div className={styles.identity}>
                        <div className={`${skeleton.block} ${skeleton.avatar}`} />
                        <div className={skeleton.identityBody}>
                            <div className={`${skeleton.bar} ${skeleton.name}`} />
                            <div className={skeleton.chipRow}>
                                <div className={`${skeleton.bar} ${skeleton.chip}`} />
                                <div className={`${skeleton.bar} ${skeleton.chipShort}`} />
                            </div>
                        </div>
                    </div>

                    <div className={skeleton.ribbon}>
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className={`${skeleton.block} ${skeleton.stat}`} />
                        ))}
                    </div>

                    <div className={skeleton.tabs}>
                        {[0, 1, 2].map((i) => (
                            <div key={i} className={`${skeleton.bar} ${skeleton.tab}`} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="container">
                <div className={skeleton.panel}>
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className={`${skeleton.block} ${skeleton.matchRow}`} />
                    ))}
                </div>
            </div>
        </div>
    );
}
