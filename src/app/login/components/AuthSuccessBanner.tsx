'use client'

import styles from '../login.module.css'

export default function AuthSuccessBanner({ message }: { message: string | null }) {
    if (!message) return null

    return (
        <div className={styles.successBanner}>
            <span>{message}</span>
        </div>
    )
}
