'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SuperSidebar.module.css';
import { findActiveSuperNavItem, superNavGroups } from './navigation';

function Icon({ path }: { path: string }) {
    return (
        <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
        </svg>
    );
}

export default function SuperSidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
    const pathname = usePathname();
    const activeItem = findActiveSuperNavItem(pathname);

    return (
        <>
            <div
                className={`${styles.overlay} ${isOpen ? styles.open : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
                <div className={styles.brand}>
                    <span className={styles.brandDot} />
                    TECTONIC <span className={styles.brandTag}>V1</span>
                </div>

                <nav className={styles.nav}>
                    {superNavGroups.map((group) => (
                        <div key={group.id} className={styles.navGroup}>
                            <div className={styles.navLabel}>{group.label}</div>
                            {group.items.map((item) => (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    prefetch={false}
                                    onClick={onClose}
                                    className={`${styles.navItem} ${activeItem?.id === item.id ? styles.navItemActive : ''}`}
                                >
                                    <Icon path={item.iconPath} />
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}
