// El editor de noticias, fuera de /admin/super: la guarda de ese árbol solo
// deja pasar a los administradores globales, y las noticias las escribe
// cualquier rol de administración (club, torneo, unión, gestores) y la
// redacción. Acá la puerta es el permiso de noticias, y el shell es el mismo
// tono oscuro del admin, sin la barra lateral del super admin.

import { redirect } from 'next/navigation';

import { canManageNewsServer } from '@/lib/auth/newsAccess';
import styles from './layout.module.css';

export default async function NoticiasAdminLayout({ children }: { children: React.ReactNode }) {
    if (!(await canManageNewsServer())) {
        redirect('/noticias');
    }

    return <div className={styles.shell}>{children}</div>;
}
