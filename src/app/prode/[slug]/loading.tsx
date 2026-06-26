import styles from '../page.module.css';
import ProdePlaySkeleton from '@/components/prode/ProdePlaySkeleton';

// Skeleton instantáneo al entrar a una competencia del prode.
export default function ProdeCompetitionLoading() {
    return (
        <div className={styles.page}>
            <ProdePlaySkeleton />
        </div>
    );
}
