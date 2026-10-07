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
import {
    findPlayerPosition,
    getPlayerPositionsForSport,
    resolveRosterSport,
    sportHasFrontRow,
} from '@/lib/data/playerPositions';

// El modal trae sus estilos: lo abre la página de plantel y también el gestor
// de club, que no pasa por ClubAccessHub (el único que importaba la hoja).
import './vitreous-club.css';

/**
 * Sugerencias para el país emisor del documento. El campo acepta cualquier
 * código: la identidad de un jugador es (país, número), así que un DNI
 * argentino repetido es la misma persona y el mismo número de otro país no.
 */
const DOC_COUNTRY_SUGGESTIONS = [
    'AR', 'UY', 'CL', 'PY', 'BR', 'PE', 'CO', 'VE', 'BO', 'EC',
    'ZA', 'NZ', 'AU', 'FJ', 'GB', 'IE', 'FR', 'IT', 'ES', 'PT', 'GE', 'US', 'JP',
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
    /** Deporte del club, para elegir el puesto cuando la ficha va al plantel base. */
    clubSport?: string | null;
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
    if (Number.isNaN(date.getTime())) return 'Fecha inválida';

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDelta = today.getMonth() - date.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
        age -= 1;
    }

    return `${age} años`;
}

export function PersonManagementModal({ clubId, divisions, isOpen, onClose, onSuccess, initialMode, lockDivisionId, person, submitMode = 'club-admin-api', clubSport }: Props) {
    const [loading, setLoading] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [docCountry, setDocCountry] = useState('AR');
    const [frontRowCertified, setFrontRowCertified] = useState(false);
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
    // El puesto depende del deporte de la categoría (un club polideportivo tiene
    // categorías de rugby y de hockey); si va al plantel base, del deporte del club.
    const rosterSport = resolveRosterSport(selectedDivision?.sport, clubSport);
    const positionCatalog = useMemo(() => getPlayerPositionsForSport(rosterSport), [rosterSport]);
    const showFrontRow = initialMode === 'player' && sportHasFrontRow(rosterSport);
    const identityComplete = Boolean(firstName && lastName);
    const sportsComplete = initialMode === 'staff' ? Boolean(role) : Boolean(position);
    const assignmentComplete = Boolean(lockDivisionId || divisionId);
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
        setIdNumber(person?.id_number ?? '');
        setDocCountry(person?.doc_country ?? 'AR');
        setFrontRowCertified(person?.front_row_certified === true);
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
    }, [firstName, lastName, idNumber, docCountry, birthDate, position, role, divisionId, photoUrl, weight, height, hasIdentityPrompt]);

    // Una ficha vieja puede traer "Medio Scrum" o "Segunda Linea": se lleva a la
    // etiqueta del catálogo para que el botón se marque y se guarde canónica. Si
    // no matchea nada (texto libre de otro deporte), se deja como está.
    useEffect(() => {
        if (!positionCatalog || !position) return;
        const canonical = findPlayerPosition(rosterSport, position);
        if (canonical && canonical.label !== position) setPosition(canonical.label);
    }, [positionCatalog, rosterSport, position]);

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
            setIdNumber('');
            setDocCountry('AR');
            setFrontRowCertified(false);
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
                id_number: idNumber.trim() || undefined,
                doc_country: docCountry.trim() || undefined,
                position,
                photo_url: photoUrl || undefined,
                weight: weight ? parseFloat(weight) : undefined,
                height: height ? parseFloat(height) : undefined,
                role,
                division_id: divisionId || undefined,
                status: 'active',
                // La marca ① solo existe en rugby: en otro deporte no se manda.
                ...(showFrontRow ? { front_row_certified: frontRowCertified } : {}),
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
                        <p>Nombre y apellido alcanzan para guardar. El resto se completa cuando se tenga.</p>
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
                            <div className="registry-biometry-grid">
                                <div className="registry-field-group">
                                    <label>N&deg; de documento</label>
                                    <input
                                        value={idNumber}
                                        onChange={(e) => setIdNumber(e.target.value)}
                                        placeholder="Ej: 40123456"
                                        inputMode="numeric"
                                    />
                                </div>
                                <div className="registry-field-group">
                                    <label>País del doc.</label>
                                    <input
                                        list="doc-country-suggestions"
                                        value={docCountry}
                                        onChange={(e) => setDocCountry(e.target.value.toUpperCase())}
                                        placeholder="AR"
                                        maxLength={3}
                                    />
                                    <datalist id="doc-country-suggestions">
                                        {DOC_COUNTRY_SUGGESTIONS.map((code) => (
                                            <option key={code} value={code} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>
                            <div className="registry-age-indicator">
                                El documento identifica al jugador dentro de su país: mismo país y mismo número es la misma persona.
                            </div>

                            <div className="registry-column-title" style={{ marginTop: '2.5rem' }}>Datos físicos</div>
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
                            ) : null}
                        </section>

                        {/* COL 2: PERFIL DEPORTIVO */}
                        <section className="registry-column registry-column-alt">
                            <div className="registry-column-title">Perfil deportivo</div>

                            {/* La categoría va ANTES del puesto: de ella sale el deporte, y del
                                deporte la lista de puestos. */}
                            <div className="registry-field-group registry-division-selector">
                                <label htmlFor="person-division">Categoría</label>
                                {!lockDivisionId && divisions && divisions.length > 0 ? (
                                    <>
                                        <select
                                            id="person-division"
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
                                        <p className="registry-division-hint">
                                            Si no se elige categoría, queda en el plantel base y se puede asignar después.
                                        </p>
                                    </>
                                ) : (
                                    <select id="person-division" disabled>
                                        <option>{assignmentLabel}</option>
                                    </select>
                                )}
                            </div>

                            {initialMode === 'player' ? (
                                <div className="registry-rugby-section">
                                    {positionCatalog ? (
                                        positionCatalog.groups.map((group) => (
                                            <div key={group.id} role="radiogroup" aria-label={`Puesto: ${group.label}`}>
                                                <h3>{group.label}</h3>
                                                <div className="registry-pos-grid">
                                                    {positionCatalog.positions
                                                        .filter((item) => item.group === group.id)
                                                        .map((item) => (
                                                            <button
                                                                key={item.code}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={position === item.label}
                                                                onClick={() => setPosition(position === item.label ? '' : item.label)}
                                                                className={`registry-pos-btn ${position === item.label ? 'active' : ''}`}
                                                            >
                                                                {item.label}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="registry-field-group">
                                            <label htmlFor="person-position">Puesto</label>
                                            <input
                                                id="person-position"
                                                value={position}
                                                onChange={(e) => setPosition(e.target.value)}
                                                placeholder="Opcional"
                                            />
                                            <p className="registry-division-hint">
                                                {rosterSport
                                                    ? 'Este deporte todavía no tiene lista de puestos: se escribe a mano.'
                                                    : 'Cargá el deporte del club para elegir el puesto de una lista.'}
                                            </p>
                                        </div>
                                    )}
                                    {showFrontRow && (
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginTop: '1rem',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={frontRowCertified}
                                                onChange={(e) => setFrontRowCertified(e.target.checked)}
                                            />
                                            <span>
                                                Curso de primeras líneas aprobado
                                                <span style={{ display: 'block', opacity: 0.6, fontSize: 11 }}>
                                                    Sale como &#9312; en la planilla oficial del partido.
                                                </span>
                                            </span>
                                        </label>
                                    )}
                                </div>
                            ) : (
                                <div className="registry-field-group">
                                    <label htmlFor="person-staff-role">Cargo</label>
                                    <select
                                        id="person-staff-role"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                    >
                                        {STAFF_ROLES.map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </section>

                        {/* COL 3: PREVIEW */}
                        <section className="registry-column registry-preview-panel">
                            <div className="registry-column-title">Vista previa</div>

                            <label htmlFor="photo-upload" className="registry-avatar-container">
                                {photoUrl ? (
                                    <img src={photoUrl} alt="Preview" />
                                ) : (
                                    <>
                                        <User className="w-8 h-8 text-[var(--ca-text-muted)]" />
                                        <span className="registry-upload-text">Subir foto</span>
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
                                <div className="registry-preview-row">
                                    <span className="registry-preview-label">Documento</span>
                                    <span className="registry-preview-val">
                                        {idNumber ? `${docCountry || '?'} ${idNumber}` : '—'}
                                        {initialMode === 'player' && frontRowCertified ? ' ①' : ''}
                                    </span>
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

                            {/* Solo nombre y apellido son obligatorios: el resto se marca en
                                verde cuando está, y apagado cuando no, nunca en rojo. */}
                            <div className="registry-checklist">
                                <div className="registry-check-item">
                                    Nombre y apellido
                                    <span className={`registry-status-led ${identityComplete ? 'ok' : 'fail'}`} />
                                </div>
                                <div className="registry-check-item">
                                    {initialMode === 'player' ? 'Puesto (opcional)' : 'Cargo'}
                                    <span className={`registry-status-led ${sportsComplete ? 'ok' : ''}`} />
                                </div>
                                <div className="registry-check-item">
                                    Categoría (opcional)
                                    <span className={`registry-status-led ${assignmentComplete ? 'ok' : ''}`} />
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
                                Encontramos fichas con el mismo nombre. Elegí una para vincularla a este club, o creá una nueva si no es la misma persona.
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
