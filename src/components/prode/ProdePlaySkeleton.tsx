import styles from './ProdePlaySkeleton.module.css';

// Skeleton que imita el layout de ProdePlayScreen (hero + tabs + tarjetas) para
// mostrarse al instante mientras el server component trae los datos de la liga.
export default function ProdePlaySkeleton() {
    return (
        <div className="container">
            <div className={styles.shell} aria-busy="true" aria-label="Cargando la liga...">
                <div className={styles.backLink} />

                <div className={styles.hero}>
                    <div className={styles.heroCopy}>
                        <div className={styles.eyebrow} />
                        <div className={styles.title} />
                        <div className={styles.subtitle} />
                        <div className={styles.metaRow}>
                            <div className={styles.metaTag} />
                            <div className={styles.metaTag} />
                            <div className={styles.metaTag} />
                        </div>
                    </div>
                    <div className={styles.rail}>
                        <div className={styles.stat} />
                        <div className={styles.stat} />
                        <div className={styles.stat} />
                    </div>
                </div>

                <div className={styles.tabs}>
                    <div className={styles.tab} />
                    <div className={styles.tab} />
                    <div className={styles.tab} />
                </div>

                <div className={styles.cardList}>
                    <div className={styles.card} />
                    <div className={styles.card} />
                    <div className={styles.card} />
                </div>
            </div>
        </div>
    );
}
