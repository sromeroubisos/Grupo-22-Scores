import Link from 'next/link';
import styles from '../../page.module.css';
import CreatePrivateLeagueWizard from '@/components/prode/CreatePrivateLeagueWizard';
import { listProdeBaseCompetitions } from '@/lib/server/prodeCompetitions';

export default async function ProdeCreateLeaguePage() {
    const { schemaReady: catalogReady, data: competitions } = await listProdeBaseCompetitions();

    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.detailShell}>
                    <Link href="/prode" className={styles.backLink}>Volver al lobby</Link>
                    <CreatePrivateLeagueWizard competitions={competitions} catalogReady={catalogReady} />
                </div>
            </div>
        </div>
    );
}
