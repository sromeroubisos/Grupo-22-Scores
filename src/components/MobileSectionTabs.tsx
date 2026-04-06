'use client';

import Link from 'next/link';
import styles from './MobileSectionTabs.module.css';

type MobileSectionTabId = 'news' | 'rankings';

type MobileSectionTabsProps = {
    activeTab: MobileSectionTabId;
    rankingsHref: string;
    newsHref?: string;
};

export default function MobileSectionTabs({
    activeTab,
    rankingsHref,
    newsHref = '/noticias',
}: MobileSectionTabsProps) {
    return (
        <div className={styles.wrapper} aria-label="Cambiar entre noticias y rankings">
            <div className={styles.tabList} role="tablist" aria-orientation="horizontal">
                <Link
                    href={newsHref}
                    className={`${styles.tab} ${activeTab === 'news' ? styles.tabActive : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'news'}
                >
                    Noticias
                </Link>
                <Link
                    href={rankingsHref}
                    className={`${styles.tab} ${activeTab === 'rankings' ? styles.tabActive : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'rankings'}
                >
                    Rankings
                </Link>
            </div>
        </div>
    );
}
