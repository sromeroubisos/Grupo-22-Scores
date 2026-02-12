
'use client';

import { useMemo, useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

type UserRole = 'owner' | 'admin' | 'prensa' | 'comunicacion' | 'operador' | 'lectura';
type UserStatus = 'invited' | 'active' | 'suspended' | 'archived';
type UserScope = 'club' | 'division';

type PermissionKey = 'view' | 'create' | 'edit' | 'publish' | 'remove';
type ModuleKey = 'comms' | 'bulletins' | 'events' | 'documents' | 'sponsors' | 'users' | 'audit' | 'config';

const mockUsers = [
    {
        id: 1,
        name: 'Roberto Fernandez',
        email: 'rfernandez@sic.com.ar',
        role: 'owner' as UserRole,
        scope: 'club' as UserScope,
        divisions: ['Todas'],
        lastLogin: '2026-02-10 14:22',
        status: 'active' as UserStatus,
    },
    {
        id: 2,
        name: 'Lucia Morales',
        email: 'lucia.morales@club.com',
        role: 'admin' as UserRole,
        scope: 'club' as UserScope,
        divisions: ['Primera', 'Reserva'],
        lastLogin: '2026-02-10 12:05',
        status: 'active' as UserStatus,
    },
    {
        id: 3,
        name: 'Martin Gomez',
        email: 'mgomez@sic.com.ar',
        role: 'prensa' as UserRole,
        scope: 'club' as UserScope,
        divisions: ['Prensa'],
        lastLogin: '2026-02-10 09:30',
        status: 'active' as UserStatus,
    },
    {
        id: 4,
        name: 'Carla Soto',
        email: 'carla.soto@club.com',
        role: 'comunicacion' as UserRole,
        scope: 'division' as UserScope,
        divisions: ['Primera'],
        lastLogin: '2026-02-08 09:15',
        status: 'invited' as UserStatus,
    },
    {
        id: 5,
        name: 'Andres Diaz',
        email: 'andres.diaz@club.com',
        role: 'operador' as UserRole,
        scope: 'division' as UserScope,
        divisions: ['M19'],
        lastLogin: '2026-02-08 10:10',
        status: 'suspended' as UserStatus,
    },
    {
        id: 6,
        name: 'Laura Montes',
        email: 'lmontes@sic.com.ar',
        role: 'lectura' as UserRole,
        scope: 'club' as UserScope,
        divisions: ['Todas'],
        lastLogin: '2026-01-28 10:00',
        status: 'archived' as UserStatus,
    },
];

const roleMeta: Record<UserRole, { label: string; cls: string; desc: string }> = {
    owner: { label: 'Owner Club', cls: 'badgeDanger', desc: 'Control total del club (institucional).' },
    admin: { label: 'Admin Institucional', cls: 'badgeWarning', desc: 'Gestiona usuarios, comunicacion y docs.' },
    prensa: { label: 'Prensa', cls: 'badgeInfo', desc: 'Crea comunicados y boletines.' },
    comunicacion: { label: 'Comunicacion', cls: 'badgeInfo', desc: 'Gestiona contenidos y destacados.' },
    operador: { label: 'Operador', cls: 'badgeNeutral', desc: 'Operacion diaria y soporte interno.' },
    lectura: { label: 'Lectura', cls: 'badgeNeutral', desc: 'Solo lectura institucional.' },
};

const statusMeta: Record<UserStatus, { label: string; cls: string }> = {
    invited: { label: 'Invitado', cls: 'badgeWarning' },
    active: { label: 'Activo', cls: 'badgeSuccess' },
    suspended: { label: 'Suspendido', cls: 'badgeDanger' },
    archived: { label: 'Archivado', cls: 'badgeNeutral' },
};

const scopeMeta: Record<UserScope, string> = {
    club: 'Club',
    division: 'Division',
};
const permissionModules: { key: ModuleKey; label: string }[] = [
    { key: 'comms', label: 'Comunicaciones' },
    { key: 'bulletins', label: 'Boletines' },
    { key: 'events', label: 'Eventos' },
    { key: 'documents', label: 'Documentos' },
    { key: 'sponsors', label: 'Sponsors' },
    { key: 'users', label: 'Usuarios' },
    { key: 'audit', label: 'Auditoria' },
    { key: 'config', label: 'Configuracion institucional' },
];

const rolePermissions: Record<UserRole, Record<ModuleKey, PermissionKey[]>> = {
    owner: {
        comms: ['view', 'create', 'edit', 'publish', 'remove'],
        bulletins: ['view', 'create', 'edit', 'publish', 'remove'],
        events: ['view', 'create', 'edit', 'publish', 'remove'],
        documents: ['view', 'create', 'edit', 'publish', 'remove'],
        sponsors: ['view', 'create', 'edit', 'publish', 'remove'],
        users: ['view', 'create', 'edit', 'publish', 'remove'],
        audit: ['view', 'create', 'edit', 'publish', 'remove'],
        config: ['view', 'create', 'edit', 'publish', 'remove'],
    },
    admin: {
        comms: ['view', 'create', 'edit', 'publish'],
        bulletins: ['view', 'create', 'edit'],
        events: ['view', 'create', 'edit'],
        documents: ['view', 'create', 'edit'],
        sponsors: ['view', 'create', 'edit'],
        users: ['view', 'create', 'edit'],
        audit: ['view'],
        config: ['view', 'edit'],
    },
    prensa: {
        comms: ['view', 'create', 'edit', 'publish'],
        bulletins: ['view', 'create'],
        events: ['view'],
        documents: ['view'],
        sponsors: ['view'],
        users: [],
        audit: [],
        config: [],
    },
    comunicacion: {
        comms: ['view', 'create', 'edit', 'publish'],
        bulletins: ['view', 'create', 'edit'],
        events: ['view', 'create'],
        documents: ['view', 'create'],
        sponsors: ['view', 'edit'],
        users: [],
        audit: [],
        config: [],
    },
    operador: {
        comms: ['view'],
        bulletins: [],
        events: ['view', 'create'],
        documents: ['view'],
        sponsors: ['view'],
        users: [],
        audit: [],
        config: [],
    },
    lectura: {
        comms: ['view'],
        bulletins: ['view'],
        events: ['view'],
        documents: ['view'],
        sponsors: ['view'],
        users: [],
        audit: [],
        config: [],
    },
};

const profiles = [
    { id: 'institucional', label: 'Institucional / No deportivo', desc: 'Gestion interna sin acceso deportivo.' },
    { id: 'prensa', label: 'Prensa', desc: 'Crea noticias y comunicados.' },
    { id: 'comunicacion', label: 'Comunicacion', desc: 'Gestiona boletines y destacados.' },
    { id: 'community', label: 'Community Manager', desc: 'Publica contenidos y redes.' },
    { id: 'administrativo', label: 'Administrativo', desc: 'Operacion diaria y documentos.' },
    { id: 'dirigente', label: 'Dirigente', desc: 'Seguimiento institucional.' },
    { id: 'operador', label: 'Operador', desc: 'Soporte y ejecucion interna.' },
    { id: 'analista', label: 'Analista', desc: 'Lectura de indicadores basicos.' },
    { id: 'invitado', label: 'Invitado', desc: 'Acceso temporal controlado.' },
];

const divisions = ['Primera', 'Reserva', 'M19', 'M17', 'Femenino'];

const moduleActions: PermissionKey[] = ['view', 'create', 'edit', 'publish', 'remove'];
const actionLabels: Record<PermissionKey, string> = {
    view: 'Ver',
    create: 'Crear',
    edit: 'Editar',
    publish: 'Publicar',
    remove: 'Eliminar',
};

type FormStep = 1 | 2 | 3;

interface UserForm {
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string;
    profile: string;
    scope: UserScope;
    divisions: string[];
    readOnly: boolean;
}

const emptyForm: UserForm = {
    firstName: '',
    lastName: '',
    email: '',
    avatarUrl: '',
    profile: 'institucional',
    scope: 'club',
    divisions: [],
    readOnly: false,
};
export default function ClubUsuariosPage() {
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [scopeFilter, setScopeFilter] = useState<string>('all');
    const [users, setUsers] = useState(mockUsers);
    const [selectedId, setSelectedId] = useState<number>(mockUsers[0]?.id ?? 0);
    const [mode, setMode] = useState<'view' | 'create'>('view');
    const [showRoles, setShowRoles] = useState(false);
    const [activeRole, setActiveRole] = useState<UserRole>('prensa');
    const [formStep, setFormStep] = useState<FormStep>(1);
    const [form, setForm] = useState<UserForm>(emptyForm);

    const filtered = useMemo(() => {
        return users.filter((u) => {
            const matchRole = roleFilter === 'all' || u.role === roleFilter;
            const matchStatus = statusFilter === 'all' || u.status === statusFilter;
            const matchScope = scopeFilter === 'all' || u.scope === scopeFilter;
            const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
            return matchRole && matchStatus && matchScope && matchSearch;
        });
    }, [roleFilter, scopeFilter, search, statusFilter, users]);

    const selectedUser = filtered.find((u) => u.id === selectedId) || filtered[0];

    const handleCreate = () => {
        setMode('create');
        setFormStep(1);
        setForm(emptyForm);
    };

    const handleCancelCreate = () => {
        setMode('view');
        setFormStep(1);
        setForm(emptyForm);
    };

    const toggleDivision = (division: string) => {
        setForm((prev) => {
            const exists = prev.divisions.includes(division);
            const next = exists ? prev.divisions.filter((item) => item !== division) : [...prev.divisions, division];
            return { ...prev, divisions: next };
        });
    };

    const resolveRoleFromProfile = (profile: string): UserRole => {
        if (profile === 'prensa') return 'prensa';
        if (profile === 'comunicacion') return 'comunicacion';
        if (profile === 'community') return 'prensa';
        if (profile === 'operador') return 'operador';
        if (profile === 'administrativo') return 'admin';
        return 'lectura';
    };

    const handleCreateInvite = () => {
        if (!form.firstName.trim() || !form.lastName.trim()) {
            alert('Completa nombre y apellido.');
            return;
        }
        if (!form.email.trim()) {
            alert('Completa el email del usuario.');
            return;
        }
        if (form.scope === 'division' && form.divisions.length === 0) {
            alert('Selecciona al menos una division.');
            return;
        }
        const newUser = {
            id: Date.now(),
            name: `${form.firstName.trim()} ${form.lastName.trim()}`,
            email: form.email.trim(),
            role: resolveRoleFromProfile(form.profile),
            scope: form.scope,
            divisions: form.scope === 'division' ? form.divisions : ['Todas'],
            lastLogin: '-',
            status: 'invited' as UserStatus,
        };
        setUsers((prev) => [newUser, ...prev]);
        setSelectedId(newUser.id);
        setMode('view');
        setFormStep(1);
        setForm(emptyForm);
        alert('Invitacion enviada al nuevo usuario.');
    };

    const handleResendInvite = (userId: number) => {
        const user = users.find((u) => u.id === userId);
        if (!user) return;
        alert(`Invitacion reenviada a ${user.email}.`);
    };

    const handleSuspendUser = (userId: number) => {
        const user = users.find((u) => u.id === userId);
        if (!user || user.role === 'owner') return;
        if (!confirm(`Suspender a ${user.name}?`)) return;
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'suspended' as UserStatus } : u)));
    };

    return (
        <SectionShell
            title="Usuarios y permisos"
            subtitle="Separar lo institucional de lo deportivo, con trazabilidad y seguridad."
            actions={
                <>
                    <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setShowRoles(true)}>
                        Roles y permisos
                    </button>
                    <button className={styles.btn} type="button" onClick={handleCreate}>
                        Crear usuario
                    </button>
                </>
            }
        >
            <div className={styles.filtersRow}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Rol</label>
                    <select className={styles.formInput} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                        <option value="all">Todos</option>
                        {Object.entries(roleMeta).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Estado</label>
                    <select className={styles.formInput} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">Todos</option>
                        {Object.entries(statusMeta).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Ambito</label>
                    <select className={styles.formInput} value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
                        <option value="all">Todos</option>
                        <option value="club">Club</option>
                        <option value="division">Division</option>
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Buscar</label>
                    <input
                        className={styles.formInput}
                        placeholder="Nombre o email"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.usersLayout}>
                <div className={styles.userList}>
                    {filtered.map((user) => (
                        <button
                            key={user.id}
                            type="button"
                            className={`${styles.userCard} ${selectedUser?.id === user.id ? styles.userCardActive : ''}`}
                            onClick={() => {
                                setSelectedId(user.id);
                                setMode('view');
                            }}
                        >
                            <div className={styles.userCardHeader}>
                                <div className={styles.avatar}>{user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                                <div>
                                    <div className={styles.userName}>{user.name}</div>
                                    <div className={styles.userEmail}>{user.email}</div>
                                </div>
                            </div>
                            <div className={styles.userCardMeta}>
                                <span className={`${styles.badge} ${styles[roleMeta[user.role].cls as keyof typeof styles] || ''}`}>{roleMeta[user.role].label}</span>
                                <span className={`${styles.badge} ${styles[statusMeta[user.status].cls as keyof typeof styles] || ''}`}>{statusMeta[user.status].label}</span>
                            </div>
                            <div className={styles.userCardMeta}>
                                <span className={styles.scopePill}>{scopeMeta[user.scope]}</span>
                                <span className={styles.userMetaText}>Ultimo acceso: {user.lastLogin}</span>
                            </div>
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <div className={styles.emptyPlaceholder}>
                            <p>No se encontraron usuarios con esos filtros.</p>
                        </div>
                    )}
                </div>

                <div className={styles.userDetail}>
                    {mode === 'create' ? (
                        <div className={styles.glassCard}>
                            <div className={styles.detailHeader}>
                                <div>
                                    <h2 className={styles.cardTitle}>Crear usuario</h2>
                                    <p className={styles.cardMeta}>Email Único, perfil funcional y Ámbito claro.</p>
                                </div>
                                <button className={`${styles.btnSmall} ${styles.btnGhost}`} type="button" onClick={handleCancelCreate}>Cancelar</button>
                            </div>

                            <div className={styles.steps}>
                                {([1, 2, 3] as FormStep[]).map((step) => (
                                    <button
                                        key={step}
                                        type="button"
                                        className={`${styles.stepButton} ${formStep === step ? styles.stepButtonActive : ''}`}
                                        onClick={() => setFormStep(step)}
                                    >
                                        <span className={styles.stepIndex}>{step}</span>
                                        <span className={styles.stepLabel}>
                                            {step === 1 && 'Identidad'}
                                            {step === 2 && 'Perfil'}
                                            {step === 3 && 'Ambito'}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {formStep === 1 && (
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Nombre</label>
                                        <input
                                            className={styles.formInput}
                                            value={form.firstName}
                                            onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                                            placeholder="Ej: Lucia"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Apellido</label>
                                        <input
                                            className={styles.formInput}
                                            value={form.lastName}
                                            onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                                            placeholder="Ej: Morales"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Email</label>
                                        <input
                                            className={styles.formInput}
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                            placeholder="correo@club.com"
                                        />
                                        <span className={styles.helpText}>El email identifica al usuario de forma unica.</span>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Avatar (opcional)</label>
                                        <input
                                            className={styles.formInput}
                                            value={form.avatarUrl}
                                            onChange={(e) => setForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                                            placeholder="URL de imagen"
                                        />
                                    </div>
                                </div>
                            )}

                            {formStep === 2 && (
                                <div>
                                    <p className={styles.stepHint}>Defini para que existe este usuario (no deportivo).</p>
                                    <div className={styles.profileGrid}>
                                        {profiles.map((profile) => (
                                            <button
                                                key={profile.id}
                                                type="button"
                                                className={`${styles.profileCard} ${form.profile === profile.id ? styles.profileCardActive : ''}`}
                                                onClick={() => setForm((prev) => ({ ...prev, profile: profile.id }))}
                                            >
                                                <div className={styles.profileTitle}>{profile.label}</div>
                                                <div className={styles.profileDesc}>{profile.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className={styles.callout}>
                                        <span className={styles.calloutTitle}>Lo deportivo queda protegido</span>
                                        <p>Estos perfiles no acceden a planteles, stats ni fixture.</p>
                                    </div>
                                </div>
                            )}

                            {formStep === 3 && (
                                <div>
                                    <div className={styles.formGrid}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Ambito</label>
                                            <select
                                                className={styles.formInput}
                                                value={form.scope}
                                                onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value as UserScope }))}
                                            >
                                                <option value="club">Club (global)</option>
                                                <option value="division">Division especifica</option>
                                            </select>
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Solo lectura</label>
                                            <label className={styles.checkboxRow}>
                                                <input
                                                    type="checkbox"
                                                    checked={form.readOnly}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, readOnly: e.target.checked }))}
                                                />
                                                <span>Limitar a lectura institucional.</span>
                                            </label>
                                        </div>
                                    </div>

                                    {form.scope === 'division' && (
                                        <div className={styles.formGroup} style={{ marginTop: '16px' }}>
                                            <label className={styles.formLabel}>Divisiones habilitadas</label>
                                            <div className={styles.chipRow}>
                                                {divisions.map((division) => (
                                                    <button
                                                        key={division}
                                                        type="button"
                                                        className={`${styles.chip} ${form.divisions.includes(division) ? styles.chipActive : ''}`}
                                                        onClick={() => toggleDivision(division)}
                                                    >
                                                        {division}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.callout}>
                                        <span className={styles.calloutTitle}>Ambito claro</span>
                                        <p>Prensa suele operar a nivel club. Comunicacion puede limitarse a divisiones.</p>
                                    </div>
                                </div>
                            )}

                            <div className={styles.detailActions}>
                                <button
                                    className={`${styles.btn} ${styles.btnGhost}`}
                                    type="button"
                                    disabled={formStep === 1}
                                    onClick={() => setFormStep((prev) => (prev > 1 ? ((prev - 1) as FormStep) : prev))}
                                >
                                    Anterior
                                </button>
                                {formStep < 3 ? (
                                    <button className={styles.btn} type="button" onClick={() => setFormStep((prev) => (prev + 1) as FormStep)}>
                                        Siguiente
                                    </button>
                                ) : (
                                    <button className={styles.btn} type="button" onClick={handleCreateInvite}>Crear + Enviar invitación</button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.glassCard}>
                            {selectedUser ? (
                                <>
                                    <div className={styles.detailHeader}>
                                        <div className={styles.userDetailTitle}>
                                            <div className={styles.avatarLg}>{selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                                            <div>
                                                <h2 className={styles.cardTitle}>{selectedUser.name}</h2>
                                                <p className={styles.cardMeta}>{selectedUser.email}</p>
                                            </div>
                                        </div>
                                        <div className={styles.detailActions}>
                                            {selectedUser.status === 'invited' && (
                                                <button className={styles.btnSmall} type="button" onClick={() => handleResendInvite(selectedUser.id)}>Reenviar invitación</button>
                                            )}
                                            {selectedUser.role !== 'owner' && (
                                                <button className={`${styles.btnSmall} ${styles.btnDanger}`} type="button" onClick={() => handleSuspendUser(selectedUser.id)}>Suspender</button>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.tagRow}>
                                        <span className={`${styles.badge} ${styles[roleMeta[selectedUser.role].cls as keyof typeof styles] || ''}`}>{roleMeta[selectedUser.role].label}</span>
                                        <span className={`${styles.badge} ${styles[statusMeta[selectedUser.status].cls as keyof typeof styles] || ''}`}>{statusMeta[selectedUser.status].label}</span>
                                        <span className={styles.scopePill}>{scopeMeta[selectedUser.scope]}</span>
                                    </div>

                                    <div className={styles.detailGrid}>
                                        <div>
                                            <span className={styles.formLabel}>Ultimo acceso</span>
                                            <p className={styles.detailValue}>{selectedUser.lastLogin}</p>
                                        </div>
                                        <div>
                                            <span className={styles.formLabel}>Ambito</span>
                                            <p className={styles.detailValue}>{selectedUser.divisions.join(' / ')}</p>
                                        </div>
                                        <div>
                                            <span className={styles.formLabel}>Rol</span>
                                            <p className={styles.detailValue}>{roleMeta[selectedUser.role].desc}</p>
                                        </div>
                                        <div>
                                            <span className={styles.formLabel}>Estado</span>
                                            <p className={styles.detailValue}>{statusMeta[selectedUser.status].label}</p>
                                        </div>
                                    </div>

                                    <div className={styles.permissionsBlock}>
                                        <span className={styles.formLabel}>Accesos permitidos</span>
                                        <div className={styles.inlineList}>
                                            {Object.entries(rolePermissions[selectedUser.role])
                                                .filter(([, perms]) => perms.length > 0)
                                                .map(([moduleKey]) => (
                                                    <span key={moduleKey} className={styles.scopePill}>{permissionModules.find(m => m.key === moduleKey)?.label}</span>
                                                ))}
                                        </div>
                                        <span className={styles.formLabel} style={{ marginTop: '16px' }}>Bloqueado</span>
                                        <div className={styles.inlineListMuted}>
                                            <span className={styles.scopePill}>Planteles</span>
                                            <span className={styles.scopePill}>Estadisticas deportivas</span>
                                            <span className={styles.scopePill}>Convocatorias</span>
                                            <span className={styles.scopePill}>Resultados</span>
                                        </div>
                                    </div>

                                    <div className={styles.callout}>
                                        <span className={styles.calloutTitle}>Regla de oro</span>
                                        <p>Lo deportivo es sagrado. Lo institucional es colaborativo.</p>
                                    </div>
                                </>
                            ) : (
                                <div className={styles.emptyPlaceholder}>
                                    <p>Selecciona un usuario para ver el detalle.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {showRoles && (
                <div className={styles.modalOverlay} onClick={() => setShowRoles(false)}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>Roles y permisos</h2>
                                <p className={styles.cardMeta}>Presets bloqueados y permisos por modulo.</p>
                            </div>
                            <button className={`${styles.btnSmall} ${styles.btnGhost}`} type="button" onClick={() => setShowRoles(false)}>Cerrar</button>
                        </div>

                        <div className={styles.rolesLayout}>
                            <div className={styles.rolesList}>
                                {Object.entries(roleMeta).map(([key, meta]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`${styles.roleItem} ${activeRole === key ? styles.roleItemActive : ''}`}
                                        onClick={() => setActiveRole(key as UserRole)}
                                    >
                                        <div className={styles.roleTitle}>{meta.label}</div>
                                        <div className={styles.roleDesc}>{meta.desc}</div>
                                        <span className={styles.roleTag}>{key === 'owner' || key === 'admin' ? 'Preset' : 'Base'}</span>
                                    </button>
                                ))}
                            </div>

                            <div className={styles.roleMatrix}>
                                <table className={styles.matrixTable}>
                                    <thead>
                                        <tr>
                                            <th>Modulo</th>
                                            {moduleActions.map((action) => (
                                                <th key={action}>{actionLabels[action]}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {permissionModules.map((module) => (
                                            <tr key={module.key}>
                                                <td>{module.label}</td>
                                                {moduleActions.map((action) => (
                                                    <td key={action}>
                                                        {rolePermissions[activeRole][module.key].includes(action) ? 'OK' : '\u2014'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className={styles.callout}>
                                    <span className={styles.calloutTitle}>Cambios criticos</span>
                                    <p>Los roles base no se editan. Solo Admin Institucional puede crear roles custom.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </SectionShell>
    );
}




