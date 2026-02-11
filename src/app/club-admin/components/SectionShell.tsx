'use client';

import styles from '../page.module.css';

interface SectionShellProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    children?: React.ReactNode;
}

export default function SectionShell({ title, subtitle, actions, children }: SectionShellProps) {
    return (
        <section className={styles.section}>
            <header className={styles.sectionTop}>
                <div>
                    <h1 className={styles.sectionTitle}>{title}</h1>
                    {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
                </div>
                {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
            </header>
            {children}
        </section>
    );
}
