'use client'
import styles from '../login.module.css'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorBanner({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <div className={styles.errorBanner}>
            <AlertCircle size={16} />
            <span>{message}</span>
        </div>
    )
}
