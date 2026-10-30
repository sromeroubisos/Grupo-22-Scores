'use client'
import styles from '../login.module.css'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorBanner({ message }: { message: string | null }) {
    // `.trim()` y no `!message`: un mensaje con solo espacios es truthy y dibuja
    // el cartel rojo vacio, que es peor que no mostrar nada — el usuario ve que
    // algo fallo y no tiene con que seguir.
    if (!message?.trim()) return null
    return (
        <div className={styles.errorBanner}>
            <AlertCircle size={16} />
            <span>{message}</span>
        </div>
    )
}
