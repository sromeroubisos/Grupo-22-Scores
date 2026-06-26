import styles from '../../page.module.css';
import ProdePlaySkeleton from '@/components/prode/ProdePlaySkeleton';

// Se muestra al instante al navegar a la liga (mientras el server component
// resuelve datos + sync), en vez de dejar la pantalla congelada.
export default function ProdeLeagueLoading() {
    return (
        <div className={styles.page}>
            <ProdePlaySkeleton />
        </div>
    );
}
