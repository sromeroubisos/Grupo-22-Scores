'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import {
    Loader2,
    Save,
    User,
    X,
} from 'lucide-react';
import {
    addPersonToClub,
    PersonWithRole,
    type PersonClubInput,
    type PersonIdentityMatch,
    updatePersonInClub,
} from '@/lib/services/personService';
import { Division } from '@/lib/services/divisionService';

const RUGBY_POSITION_GROUPS = [
    {
        label: 'Forwards',
        positions: ['Pilar Izquierdo', 'Hooker', 'Pilar Derecho', 'Segunda Linea', 'Ala', 'Octavo'],
    },
    {
        label: 'Backs',
        positions: ['Medio Scrum', 'Apertura', 'Wing', 'Centro', 'Fullback'],
    },
];

const STAFF_ROLES = [
    ['head_coach', 'ENTRENADOR PRINCIPAL'],
    ['assistant_coach', 'ENTRENADOR ASISTENTE'],
    ['physical_trainer', 'PREPARADOR FISICO'],
    ['physio', 'KINESIOLOGO'],
    ['doctor', 'MEDICO'],
    ['manager', 'MANAGER'],
    ['video_analyst', 'ANALISTA DE VIDEO'],
] as const;

interface Props {
    clubId: string;
    divisions?: Division[];
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void | Promise<void>;
    initialMode: 'player' | 'staff';
    lockDivisionId?: string;
    person?: PersonWithRole | null;
    submitMode?: 'service' | 'club-admin-api';
}

type RosterMutationApiResponse = {
    ok?: boolean;
    data?: unknown;
    error?: string;
    code?: 'identity_confirmation_required';
    matches?: PersonIdentityMatch[];
};

function getAgeLabel(birthDate: string) {
    if (!birthDate) return 'Sin fecha';

    const date = new Date(birthDate);
    if (Number.isNaN(date.getTime())) return 'Fecha invalida';

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDelta = today.getMonth() - date.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
        age -= 1;
    }

    return `${age} anos`;
}

export function PersonManagementModal({ clubId, divisions, isOpen, onClose, onSuccess, initialMode, lockDivisionId, person, submitMode = 'service' }: Props) {
    const [loading, setLoading] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [position, setPosition] = useState('');
    const [role, setRole] = useState(initialMode === 'player' ? 'player' : 'head_coach');
    const [divisionId, setDivisionId] = useState<string>(lockDivisionId || '');
    const [photoUrl, setPhotoUrl] = useState('');
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [identityMatches, setIdentityMatches] = useState<PersonIdentityMatch[]>([]);
    const [pendingPayload, setPendingPayload] = useState<PersonClubInput | null>(null);

    const displayName = `${firstName || 'Juan'} ${lastName || 'Perez'}`.trim();
    const selectedDivision = useMemo(
        () => divisions?.find((division) => division.id === divisionId || division.id === lockDivisionId) ?? null,
        [divisionId, divisions, lockDivisionId],
    );
    const linkedDivisionClubs = selectedDivision?.linked_clubs ?? [];
    const identityComplete = Boolean(firstName && lastName);
    const sportsComplete = initialMode === 'staff' ? Boolean(role) : Boolean(birthDate && position);
    const physicalComplete = initialMode === 'staff' ? true : Boolean(weight && height);
    const assignmentComplete = Boolean(lockDivisionId || divisionId || !divisions || divisions.length === 0);
    const isEditing = Boolean(person?.id);
    const currentRoleLabel = STAFF_ROLES.find(([value]) => value === role)?.[1] || 'STAFF';
    const previewMeta = initialMode === 'player' ? (position || 'Sin posicion').toUpperCase() : currentRoleLabel;
    const assignmentLabel = selectedDivision ? selectedDivision.name : 'Plantel base del club';
    const hasIdentityPrompt = Boolean(identityMatches.length > 0 && pendingPayload && !isEditing);

    const resetIdentityPrompt = () => {
        setIdentityMatches([]);
        setPendingPayload(null);
    };

    useEffect(() => {
        if (!isOpen) return;

        setFormError(null);
        resetIdentityPrompt();
        setFirstName(person?.first_name ?? '');
        setLastName(person?.last_name ?? '');
        setBirthDate(person?.birth_date ?? '');
        setPosition(person?.position ?? '');
        setRole(person?.role ?? (initialMode === 'player' ? 'player' : 'head_coach'));
        setDivisionId(lockDivisionId || person?.division_id || '');
        setPhotoUrl(person?.photo_url ?? person?.avatar_url ?? '');
        setWeight(person?.weight ? String(person.weight) : '');
        setHeight(person?.height ? String(person.height) : '');
    }, [initialMode, isOpen, lockDivisionId, person]);

    useEffect(() => {
        if (!hasIdentityPrompt) return;
        setIdentityMatches([]);
        setPendingPayload(null);
        setFormError(null);
    }, [firstName, lastName, birthDate, position, role, divisionId, photoUrl, weight, height, hasIdentityPrompt]);

    if (!isOpen) return null;

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setPhotoUrl(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const submitPayload = async (payload: PersonClubInput) => {
        const result = submitMode === 'club-admin-api'
            ? await (async () => {
                const response = await fetch('/api/club-admin/roster', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        clubId,
                        ...payload,
                    }),
                });
                const result = await response.json().catch(() => ({})) as RosterMutationApiResponse;

                return response.ok && result.ok
                    ? { success: true as const, data: result.data }
                    : {
                        success: false as const,
                        error: result.error || `No se pudo guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`,
                        code: result.code,
                        matches: result.matches,
                    };
            })()
            : await addPersonToClub(clubId, payload);

        if (result.success) {
            resetIdentityPrompt();
            setFirstName('');
            setLastName('');
            setBirthDate('');
            setPosition('');
            setPhotoUrl('');
            setWeight('');
            setHeight('');
            onClose();
            await onSuccess();
            return;
        }

        if (result.code === 'identity_confirmation_required' && result.matches?.length) {
            setIdentityMatches(result.matches);
            setPendingPayload(payload);
            setFormError(null);
            return;
        }

        setFormError(result.error || `No se pudo guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`);
    };

    const handleUseExistingPerson = async (existingPersonId: string) => {
        if (!pendingPayload) return;

        setLoading(true);
        setFormError(null);
        try {
            await submitPayload({
                ...pendingPayload,
                existing_person_id: existingPersonId,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo vincular la ficha existente.';
            setFormError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNewPerson = async () => {
        if (!pendingPayload) return;

        setLoading(true);
        setFormError(null);
        try {
            await submitPayload({
                ...pendingPayload,
                force_create_new: true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear la nueva ficha.';
            setFormError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!firstName.trim() || !lastName.trim()) {
            setFormError(`Completa nombre y apellido para guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`);
            return;
        }

        setLoading(true);
        setFormError(null);
        resetIdentityPrompt();

        try {
            const payload: PersonClubInput = {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                birth_date: birthDate,
                position,
                photo_url: photoUrl || undefined,
                weight: weight ? parseFloat(weight) : undefined,
                height: height ? parseFloat(height) : undefined,
                role,
                division_id: divisionId || undefined,
                status: 'active',
            };

            if (isEditing && person?.id) {
                const res = submitMode === 'club-admin-api'
                    ? await (async () => {
                        const response = await fetch('/api/club-admin/roster', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'same-origin',
                            body: JSON.stringify({
                                clubId,
                                personId: person.id,
                                ...payload,
                            }),
                        });
                        const result = await response.json().catch(() => ({})) as RosterMutationApiResponse;

                        return response.ok && result.ok
                            ? { success: true as const, data: result.data }
                            : { success: false as const, error: result.error || `No se pudo guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.` };
                    })()
                    : await updatePersonInClub(clubId, person.id, payload);

                if (res.success) {
                    onClose();
                    await onSuccess();
                } else {
                    setFormError(res.error || `No se pudo guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`);
                }
            } else {
                await submitPayload(payload);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : `Error inesperado al guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`;
            setFormError(message);
        } finally {
            setLoading(false);
        }
    };

    const formLabel = isEditing
        ? initialMode === 'player' ? 'Editar jugador' : 'Editar staff'
        : initialMode === 'player' ? 'Nuevo jugador' : 'Nuevo staff';

    return (
        <div className="registry-modal-overlay animate-in fade-in duration-200">
            <div className="registry-modal-shell">
                {/* HEADER */}
                <header className="registry-header">
                    <div className="registry-header-info">
                        <h2>Ficha de club</h2>
                        <h1>{formLabel}</h1>
                        <p>Carga rapida con preview lateral y asignacion opcional</p>
                    </div>
                    <div className="flex items-center">
                        <span className="registry-version-badge">
                            {isEditing ? 'FICHA EN EDICION' : 'FICHA DE CLUB V2.4'}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            className="registry-close-btn"
                            aria-label="Cerrar formulario"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="registry-rivet" style={{ top: 10, left: 10 }} />
                    <div className="registry-rivet" style={{ top: 10, right: 10 }} />
                </header>

                <form noValidate onSubmit={handleSubmit} className="registry-modal-scroll">
                    <input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                    />

                    <div className="registry-form-grid">
                        {/* COL 1: IDENTIDAD */}
                        <section className="registry-column">
                            <div className="registry-column-title">Identidad</div>
                            <div className="registry-field-group">
                                <label>Nombre</label>
                                <input
                                    autoFocus
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="Ej: Juan"
                                />
                            </div>
                            <div className="registry-field-group">
                                <label>Apellido</label>
                                <input
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Ej: Perez"
                                />
                            </div>

                            <div className="registry-column-title" style={{ marginTop: '2.5rem' }}>Biometria</div>
                            {initialMode === 'player' && (
                                <div className="registry-field-group">
                                    <label>Fecha de nacimiento</label>
                                    <input
                                        type="date"
                                        value={birthDate}
                                        onChange={(e) => setBirthDate(e.target.value)}
                                    />
                                    <div className="registry-age-indicator">
                                        Edad: {getAgeLabel(birthDate)}
                                    </div>
                                </div>
                            )}

                            {initialMode === 'player' ? (
                                <div className="registry-biometry-grid">
                                    <div className="registry-field-group">
                                        <label>Peso (KG)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                            placeholder="00"
                                        />
                                    </div>
                                    <div className="registry-field-group">
                                        <label>Altura (CM)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={height}
                                            onChange={(e) => setHeight(e.target.value)}
                                            placeholder="000"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="registry-field-group">
                                    <label>Cargo</label>
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                    >
                                        {STAFF_ROLES.map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="registry-info-note">
                                <p>
                                    📌 El jugador queda en el plantel base y puede asignarse luego a otras divisiones.
                                </p>
                            </div>
                        </section>

                        {/* COL 2: PERFIL DEPORTIVO */}
                        <section className="registry-column registry-column-alt">
                            <div className="registry-column-title">Perfil Deportivo</div>

                            {initialMode === 'player' ? (
                                <div className="registry-rugby-section">
                                    {RUGBY_POSITION_GROUPS.map((group) => (
                                        <div key={group.label}>
                                            <h3>🔵 {group.label}</h3>
                                            <div className="registry-pos-grid">
                                                {group.positions.map((item) => (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        onClick={() => setPosition(item)}
                                                        className={`registry-pos-btn ${position === item ? 'active' : ''}`}
                                                    >
                                                        {item}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="registry-field-group">
                                    <label>Perfil del staff</label>
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                    >
                                        {STAFF_ROLES.map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                    <div className="registry-info-note" style={{ marginTop: '1rem' }}>
                                        <p>
                                            Se conserva el mismo flujo de alta, pero con una ficha lateral orientada a roles y validacion operativa.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* COL 3: PREVIEW */}
                        <section className="registry-column registry-preview-panel">
                            <div className="registry-column-title">Live Preview</div>

                            <label htmlFor="photo-upload" className="registry-avatar-container">
                                {photoUrl ? (
                                    <img src={photoUrl} alt="Preview" />
                                ) : (
                                    <>
                                        <User className="w-8 h-8 text-[#666]" />
                                        <span className="registry-upload-text">Upload Photo</span>
                                    </>
                                )}
                            </label>

                            <div className="registry-preview-name">
                                {displayName.toUpperCase()}
                            </div>
                            <div className="registry-preview-status">
                                <span className="registry-live-dot" />
                                {previewMeta}
                            </div>

                            <div className="registry-preview-data">
                                <div className="registry-preview-row">
                                    <span className="registry-preview-label">Plantel</span>
                                    <span className="registry-preview-val">{assignmentLabel}</span>
                                </div>
                                {initialMode === 'player' && (
                                    <div className="registry-preview-row">
                                        <span className="registry-preview-label">Peso / Altura</span>
                                        <span className="registry-preview-val">
                                            {weight ? `${weight}kg` : '—'} / {height ? `${height}cm` : '—'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="registry-checklist">
                                <div className="registry-check-item">
                                    Identidad
                                    <span className={`registry-status-led ${identityComplete ? 'ok' : 'fail'}`} />
                                </div>
                                <div className="registry-check-item">
                                    Deportivo
                                    <span className={`registry-status-led ${sportsComplete ? 'ok' : 'fail'}`} />
                                </div>
                                <div className="registry-check-item">
                                    Fisico
                                    <span className={`registry-status-led ${physicalComplete ? 'ok' : 'fail'}`} />
                                </div>
                                <div className="registry-check-item">
                                    Asignacion
                                    <span className={`registry-status-led ${assignmentComplete ? 'ok' : 'fail'}`} />
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* IDENTITY PROMPT */}
                    {hasIdentityPrompt && (
                        <div className="registry-identity-prompt">
                            <div className="registry-identity-prompt-title">
                                Posible misma persona
                            </div>
                            <p className="registry-identity-prompt-desc">
                                Encontramos fichas con el mismo nombre. Elige una para vincularla a este club o crea una nueva si no es la misma persona.
                            </p>

                            <div className="grid gap-[10px]">
                                {identityMatches.map((match) => (
                                    <div key={match.person_id} className="registry-identity-match">
                                        <div className="flex flex-col gap-[10px] lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="registry-identity-match-name">{match.full_name}</div>
                                                <div className="registry-identity-match-meta">
                                                    {match.birth_date ? `Nacimiento: ${match.birth_date}` : 'Sin fecha de nacimiento'}
                                                    {match.id_number ? ` / DNI: ${match.id_number}` : ' / Sin DNI'}
                                                </div>
                                                <div className="flex flex-wrap gap-[10px]">
                                                    {match.already_linked_to_club ? (
                                                        <span className="registry-identity-tag registry-identity-tag-linked">
                                                            Ya vinculado a este club
                                                        </span>
                                                    ) : null}
                                                    {match.club_links.map((link) => (
                                                        <span key={`${match.person_id}-${link.club_id}-${link.division_id || 'base'}-${link.role || 'role'}`} className="registry-identity-tag">
                                                            {link.club_name}
                                                            {link.division_name ? ` / ${link.division_name}` : ''}
                                                            {link.role ? ` / ${link.role}` : ''}
                                                        </span>
                                                    ))}
                                                    {match.club_links.length === 0 ? (
                                                        <span className="registry-identity-tag">Sin vinculos visibles</span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => void handleUseExistingPerson(match.person_id)}
                                                disabled={loading}
                                                className="registry-btn registry-btn-sky"
                                            >
                                                Usar esta ficha
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-[10px] sm:flex-row sm:justify-end mt-[10px]">
                                <button
                                    type="button"
                                    onClick={() => {
                                        resetIdentityPrompt();
                                        setFormError(null);
                                    }}
                                    disabled={loading}
                                    className="registry-btn registry-btn-cancel"
                                >
                                    Seguir editando
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleCreateNewPerson()}
                                    disabled={loading}
                                    className="registry-btn registry-btn-amber"
                                >
                                    Crear ficha nueva
                                </button>
                            </div>
                        </div>
                    )}

                    {/* FORM ERROR */}
                    {formError && !hasIdentityPrompt && (
                        <div className="registry-form-error">
                            {formError}
                        </div>
                    )}
                {/* FOOTER */}
                <footer className="registry-footer">
                    <div className="registry-division-selector">
                        <div className="flex-1">
                            <label className="registry-field-label" style={{ display: 'block', marginBottom: 6 }}>
                                Asignacion de Division
                            </label>
                            {!lockDivisionId && divisions && divisions.length > 0 ? (
                                <>
                                    <select
                                        value={divisionId}
                                        onChange={(e) => setDivisionId(e.target.value)}
                                    >
                                        <option value="">Plantel base del club</option>
                                        {divisions.map((division) => (
                                            <option key={division.id} value={division.id}>
                                                {division.name.toUpperCase()} ({division.season})
                                            </option>
                                        ))}
                                    </select>
                                    {linkedDivisionClubs.length > 0 && (
                                        <div className="registry-division-shared">
                                            Comparte con: {linkedDivisionClubs.map((club) => club.name).join(', ')}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <select disabled>
                                    <option>Plantel base del club</option>
                                </select>
                            )}
                        </div>
                        <p className="registry-division-hint">
                            Si no se elige plantel, queda en el base.
                        </p>
                    </div>

                    <div className="registry-action-btns">
                        <button
                            type="button"
                            onClick={onClose}
                            className="registry-btn registry-btn-cancel"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="registry-btn registry-btn-save"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isEditing ? 'Actualizar' : 'Guardar'} {initialMode === 'player' ? 'Jugador' : 'Miembro'}
                        </button>
                    </div>
                    <div className="registry-rivet" style={{ bottom: 10, left: 10 }} />
                    <div className="registry-rivet" style={{ bottom: 10, right: 10 }} />
                </footer>
            </form>
            </div>
        </div>
    );
}
