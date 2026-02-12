'use client';

import Link from 'next/link';
import styles from '../page.module.css';

const news = [
    { id: 'n1', title: 'Comunicado oficial de torneo', scope: 'Global', status: 'Publicado', author: 'Superadmin', date: 'Hoy' },
    { id: 'n2', title: 'Fixture confirmado URBA', scope: 'Torneo', status: 'Programado', author: 'Prensa Torneo', date: 'Manana' },
    { id: 'n3', title: 'Anuncio de club', scope: 'Club', status: 'Borrador', author: 'Prensa Club', date: 'Sin fecha' }
];

export default function NoticiasPage() {
    return (
        <>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Noticias</h1>
                    <p className={styles.pageSubtitle}>Publicaciones oficiales y comunicados</p>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.toolbar}>
                        <input className={styles.filterInput} placeholder="Buscar noticia..." />
                        <select className={styles.filterInput} defaultValue="Todos">
                            <option value="Todos">Todos</option>
                            <option value="Publicado">Publicadas</option>
                            <option value="Programado">Programadas</option>
                            <option value="Borrador">Borradores</option>
                        </select>
                    </div>
                    <Link href="/admin/super/noticias" className={styles.viewSiteBtn}>Crear noticia</Link>
                </div>
            </header>

            <div className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Listado de noticias</h2>
                        <button className={styles.btn}>Programar</button>
                    </div>
                    <div className={styles.card}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Titulo</th>
                                    <th>Ambito</th>
                                    <th>Estado</th>
                                    <th>Autor</th>
                                    <th>Fecha</th>
                                    <th>Accion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {news.map((item) => (
                                    <tr key={item.id} className={styles.tableRow}>
                                        <td>{item.title}</td>
                                        <td>{item.scope}</td>
                                        <td>
                                            <span className={`${styles.pill} ${item.status === 'Publicado' ? styles.pillSuccess : item.status === 'Programado' ? styles.pillWarning : styles.pillNeutral}`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td>{item.author}</td>
                                        <td>{item.date}</td>
                                        <td>
                                            <span className={`${styles.pill} ${styles.pillNeutral}`}>Editar</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </>
    );
}
