import Link from 'next/link';
import styles from './Footer.module.css';

const footerLinks = {
    plataforma: [
        { href: '/tournaments', label: 'Torneos' },
        { href: '/fixtures', label: 'Fixtures' },
        { href: '/resultados', label: 'Resultados' },
        { href: '/tablas', label: 'Tablas' },
        { href: '/rankings', label: 'Rankings' },
    ],
    recursos: [
        { href: '/clubes', label: 'Clubes' },
        { href: '/jugadores', label: 'Jugadores' },
        { href: '/estadisticas', label: 'Estadísticas' },
        { href: '/exportar', label: 'Exportar contenido' },
    ],
    organizacion: [
        { href: '/admin', label: 'Panel de administración' },
        { href: '/operadores', label: 'Gestión de operadores' },
        { href: '/integraciones', label: 'Integraciones' },
        { href: '/ayuda', label: 'Centro de ayuda' },
    ],
    legal: [
        { href: '/terminos', label: 'Términos de uso' },
        { href: '/privacidad', label: 'Privacidad' },
        { href: '/contacto', label: 'Contacto' },
    ],
};

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={`container ${styles.footerContainer}`}>
                {/* Top Section */}
                <div className={styles.footerTop}>
                    {/* Brand */}
                    <div className={styles.brand}>
                        <Link href="/" className={styles.logo}>
                            <div className={styles.logoIcon}>
                                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="36" height="36" rx="8" stroke="currentColor" strokeWidth="3" />
                                    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="800">G22</text>
                                </svg>
                            </div>
                            <span className={styles.logoText}>
                                G22 <span className={styles.logoAccent}>Scores</span>
                            </span>
                        </Link>
                        <p className={styles.brandDescription}>
                            La plataforma oficial para torneos deportivos. Resultados en tiempo real,
                            estadísticas confiables y experiencia profesional para fans, clubes y federaciones.
                        </p>
                        <div className={styles.socialLinks}>
                            <a href="#" className={styles.socialLink} aria-label="Twitter">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            </a>
                            <a href="#" className={styles.socialLink} aria-label="Instagram">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                                </svg>
                            </a>
                            <a href="#" className={styles.socialLink} aria-label="YouTube">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    {/* Links */}
                    <div className={styles.linksGrid}>
                        <div className={styles.linkColumn}>
                            <h4 className={styles.linkTitle}>Plataforma</h4>
                            <ul className={styles.linkList}>
                                {footerLinks.plataforma.map((link) => (
                                    <li key={link.href}>
                                        <Link href={link.href} className={styles.link}>
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className={styles.linkColumn}>
                            <h4 className={styles.linkTitle}>Recursos</h4>
                            <ul className={styles.linkList}>
                                {footerLinks.recursos.map((link) => (
                                    <li key={link.href}>
                                        <Link href={link.href} className={styles.link}>
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className={styles.linkColumn}>
                            <h4 className={styles.linkTitle}>Organización</h4>
                            <ul className={styles.linkList}>
                                {footerLinks.organizacion.map((link) => (
                                    <li key={link.href}>
                                        <Link href={link.href} className={styles.link}>
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className={styles.linkColumn}>
                            <h4 className={styles.linkTitle}>Legal</h4>
                            <ul className={styles.linkList}>
                                {footerLinks.legal.map((link) => (
                                    <li key={link.href}>
                                        <Link href={link.href} className={styles.link}>
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className={styles.divider}></div>

                {/* Bottom Section */}
                <div className={styles.footerBottom}>
                    <p className={styles.copyright}>
                        © 2026 G22 Scores. Todos los derechos reservados.
                    </p>
                    <p className={styles.tagline}>
                        Hecho con <span className={styles.heart}>♥</span> para el deporte
                    </p>
                </div>
            </div>
        </footer>
    );
}
