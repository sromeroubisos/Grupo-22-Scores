import type { ReactNode } from 'react';

import styles from './layout.module.css';

export default function UnionDetailLayout({ children }: { children: ReactNode }) {
    return (
        <div className={styles.fullPageShell}>
            <div className={styles.fullPageInner}>{children}</div>
        </div>
    );
}
