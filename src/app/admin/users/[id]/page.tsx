'use client';

import styles from './page.module.css';
import layout from '../../super/page.module.css';

const claims = [
    'canEditFixture',
    'canEditResults',
    'canPublishTournament',
    'canEditRules',
    'canInviteOperators',
    'canManageRoles'
];

const auditItems = [
    { message: 'Editó fase de grupos en', highlight: 'Torneo Regional', time: 'Hoy, 14:20' },
    { message: 'Cargó resultado: Tala RC vs La Tablada', time: 'Ayer, 18:05' },
    { message: 'Publicó nuevo torneo: Seven de la Unión', time: '12 Oct, 11:30' }
];

export default function UserProfilePage() {
    return (
        <div className={layout.page}>
            <div className={layout.main} style={{ marginLeft: 0 }}>
                <div className={layout.header}>
                    <div className={layout.headerLeft}>
                        <h1 className={layout.pageTitle}>Perfil de usuario</h1>
                        <p className={layout.pageSubtitle}>Identidad, seguridad y preferencias</p>
                    </div>
                    <div className={layout.headerRight}>
                        <button className={`${layout.viewSiteBtn} ${styles.saveDisabled}`} disabled>
                            Guardar cambios
                        </button>
                    </div>
                </div>

                <div className={layout.content}>
                    <div className={styles.profileWrapper}>
                        <section className={`${styles.card} ${styles.summaryCard}`}>
                            <div className={styles.summaryLeft}>
                                <div className={styles.avatar}>JD</div>
                                <div className={styles.identity}>
                                    <div className={styles.name}>Juan Diego Córdoba</div>
                                    <div className={styles.meta}>
                                        <span className={`${styles.badge} ${styles.badgeRole}`}>Admin General</span>
                                        <span className={styles.badge}>Unión Cordobesa</span>
                                        <span className={`${styles.badge} ${styles.badgeActive}`}>Activa</span>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.summaryRight}>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Último acceso</span>
                                    <span className={styles.summaryValue}>Hoy, 14:20</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Sesiones</span>
                                    <span className={styles.summaryValue}>2 activas</span>
                                </div>
                            </div>
                        </section>

                        <div className={styles.profileGrid}>
                            <div className={styles.profileCol}>
                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Datos personales</h2>
                                            <p className={styles.cardSubtitle}>Identidad y contacto</p>
                                        </div>
                                    </div>
                                    <div className={styles.cardBody}>
                                        <div className={styles.formGrid}>
                                            <div className={styles.field}>
                                                <label className={styles.label}>Nombre</label>
                                                <input type="text" className={styles.input} defaultValue="Juan Diego" />
                                            </div>
                                            <div className={styles.field}>
                                                <label className={styles.label}>Apellido</label>
                                                <input type="text" className={styles.input} defaultValue="Córdoba" />
                                            </div>
                                            <div className={`${styles.field} ${styles.spanFull}`}>
                                                <label className={styles.label}>Display name</label>
                                                <input type="text" className={styles.input} defaultValue="J. Córdoba (Admin)" />
                                            </div>
                                            <div className={styles.field}>
                                                <label className={styles.label}>Teléfono</label>
                                                <input type="text" className={styles.input} placeholder="+54 9 ..." />
                                            </div>
                                            <div className={styles.field}>
                                                <label className={styles.label}>Zona horaria</label>
                                                <input
                                                    type="text"
                                                    className={`${styles.input} ${styles.inputReadonly}`}
                                                    defaultValue="America/Argentina/Cordoba"
                                                    readOnly
                                                />
                                            </div>
                                        </div>

                                        <div className={styles.metaGrid}>
                                            <div>
                                                <span className={styles.label}>ID usuario</span>
                                                <div className={styles.mono}>usr_992834771</div>
                                            </div>
                                            <div>
                                                <span className={styles.label}>Miembro desde</span>
                                                <div className={styles.mono}>12 Oct 2023</div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Seguridad y acceso</h2>
                                            <p className={styles.cardSubtitle}>Protección de cuenta y sesiones</p>
                                        </div>
                                    </div>
                                    <div className={styles.cardBody}>
                                        <div className={styles.toggle}>
                                            <div className={styles.toggleText}>
                                                <div className={styles.toggleTitle}>Autenticación de dos factores (2FA)</div>
                                                <div className={styles.toggleDesc}>No configurado</div>
                                            </div>
                                            <button className={styles.badgeAction} type="button">Configurar</button>
                                        </div>

                                        <div className={styles.sectionDivider}>
                                            <span className={styles.label}>Sesiones activas</span>
                                            <div className={styles.feed}>
                                                <div className={styles.feedItem}>
                                                    <div className={styles.feedMessage}>Chrome en macOS • Córdoba, AR</div>
                                                    <div className={styles.feedTime}>Actual</div>
                                                </div>
                                                <div className={styles.feedItem}>
                                                    <div className={styles.feedMessage}>Safari en iPhone • Buenos Aires, AR</div>
                                                    <div className={styles.feedTime}>Hace 2 horas</div>
                                                </div>
                                            </div>
                                            <button className={styles.linkDanger} type="button">
                                                Cerrar todas las sesiones
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <div className={styles.profileCol}>
                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Preferencias de interfaz</h2>
                                            <p className={styles.cardSubtitle}>Personaliza tu experiencia visual</p>
                                        </div>
                                    </div>
                                    <div className={styles.cardBody}>
                                        <div className={styles.field}>
                                            <label className={styles.label}>Tema del sistema</label>
                                            <select className={styles.select}>
                                                <option>Oscuro (Obsidian)</option>
                                                <option>Claro</option>
                                                <option>Auto (Sistema)</option>
                                            </select>
                                        </div>

                                        <div className={styles.toggleList}>
                                            <div className={styles.toggle}>
                                                <div className={styles.toggleText}>
                                                    <div className={styles.toggleTitle}>Densidad compacta</div>
                                                    <div className={styles.toggleDesc}>Mostrar más datos en menos espacio</div>
                                                </div>
                                                <button className={styles.switch} aria-pressed="false" type="button" />
                                            </div>
                                            <div className={styles.toggle}>
                                                <div className={styles.toggleText}>
                                                    <div className={styles.toggleTitle}>Formato 24hs</div>
                                                    <div className={styles.toggleDesc}>Reloj en formato militar</div>
                                                </div>
                                                <button className={`${styles.switch} ${styles.switchOn}`} aria-pressed="true" type="button" />
                                            </div>
                                            <div className={styles.toggle}>
                                                <div className={styles.toggleText}>
                                                    <div className={styles.toggleTitle}>Toasts de notificación</div>
                                                    <div className={styles.toggleDesc}>Alertas visuales en tiempo real</div>
                                                </div>
                                                <button className={`${styles.switch} ${styles.switchOn}`} aria-pressed="true" type="button" />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Notificaciones</h2>
                                            <p className={styles.cardSubtitle}>Eventos y alertas de sistema</p>
                                        </div>
                                    </div>
                                    <div className={styles.cardBody}>
                                        <div className={styles.toggle}>
                                            <div className={styles.toggleText}>
                                                <div className={styles.toggleTitle}>Asignación de casos</div>
                                            </div>
                                            <button className={`${styles.switch} ${styles.switchOn}`} aria-pressed="true" type="button" />
                                        </div>
                                        <div className={styles.toggle}>
                                            <div className={styles.toggleText}>
                                                <div className={styles.toggleTitle}>Cambios de estado en seguidos</div>
                                            </div>
                                            <button className={`${styles.switch} ${styles.switchOn}`} aria-pressed="true" type="button" />
                                        </div>
                                        <div className={styles.toggle}>
                                            <div className={styles.toggleText}>
                                                <div className={styles.toggleTitle}>Resultados cargados/editados</div>
                                            </div>
                                            <button className={styles.switch} aria-pressed="false" type="button" />
                                        </div>
                                        <div className={styles.toggle}>
                                            <div className={styles.toggleText}>
                                                <div className={styles.toggleTitle}>Resumen semanal por email</div>
                                            </div>
                                            <button className={styles.switch} aria-pressed="false" type="button" />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>

                        <section className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div>
                                    <h2 className={styles.cardTitle}>Permisos y ámbitos</h2>
                                    <p className={styles.cardSubtitle}>Capacidades efectivas de tu rol actual</p>
                                </div>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.claimsGrid}>
                                    {claims.map((claim) => (
                                        <div key={claim} className={styles.claimCard}>
                                            <span className={styles.claimDot} />
                                            <span>{claim}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.scopeBox}>
                                    <span className={styles.label}>Ámbitos asignados:</span>
                                    <div className={styles.scopeText}>
                                        <strong>Unión:</strong> Córdoba • <strong>Torneos:</strong> Regional Centro, Super 8, M19
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div>
                                    <h2 className={styles.cardTitle}>Auditoría de actividad</h2>
                                    <p className={styles.cardSubtitle}>Últimas acciones en la plataforma</p>
                                </div>
                            </div>
                            <div className={styles.cardBody}>
                                <div className={styles.feed}>
                                    {auditItems.map((item, index) => (
                                        <div key={`${item.message}-${index}`} className={styles.feedItem}>
                                            <div className={styles.feedMessage}>
                                                {item.message}
                                                {item.highlight ? (
                                                    <span className={styles.accent}> {item.highlight}</span>
                                                ) : null}
                                            </div>
                                            <div className={styles.feedTime}>{item.time}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
