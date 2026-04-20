'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import {
    Calendar,
    CheckCircle2,
    Loader2,
    Save,
    Upload,
    User,
    UserPlus,
    X,
    XCircle,
} from 'lucide-react';
import { addPersonToClub, PersonWithRole, updatePersonInClub } from '@/lib/services/personService';
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

function CompletionRow({ complete, label }: { complete: boolean; label: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs">
            <span className="font-semibold text-[var(--color-text-secondary)]">{label}</span>
            <span className={`inline-flex items-center gap-1.5 font-black ${complete ? 'text-emerald-300' : 'text-red-300'}`}>
                {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {complete ? 'OK' : 'Falta'}
            </span>
        </div>
    );
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

    useEffect(() => {
        if (!isOpen) return;

        setFormError(null);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!firstName.trim() || !lastName.trim()) {
            setFormError('Completa nombre y apellido para guardar el jugador.');
            return;
        }

        setLoading(true);
        setFormError(null);

        try {
            const payload = {
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
            const res = submitMode === 'club-admin-api'
                ? await (async () => {
                    const response = await fetch('/api/club-admin/roster', {
                        method: isEditing && person?.id ? 'PATCH' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({
                            clubId,
                            personId: person?.id,
                            ...payload,
                        }),
                    });
                    const result = await response.json() as { ok?: boolean; data?: unknown; error?: string };

                    return response.ok && result.ok
                        ? { success: true as const, data: result.data }
                        : { success: false as const, error: result.error || 'No se pudo guardar el jugador.' };
                })()
                : isEditing && person?.id
                    ? await updatePersonInClub(clubId, person.id, payload)
                    : await addPersonToClub(clubId, payload);

            if (res.success) {
                setFirstName('');
                setLastName('');
                setBirthDate('');
                setPosition('');
                setPhotoUrl('');
                setWeight('');
                setHeight('');
                onClose();
                await onSuccess();
            } else {
                setFormError(res.error || 'No se pudo guardar el jugador.');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error inesperado al guardar el jugador.';
            setFormError(message);
        } finally {
            setLoading(false);
        }
    };

    const formLabel = isEditing
        ? initialMode === 'player' ? 'Editar jugador' : 'Editar staff'
        : initialMode === 'player' ? 'Nuevo jugador' : 'Nuevo staff';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 px-3 py-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[0_28px_90px_rgba(0,0,0,0.32)] scale-in">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
                <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 bg-emerald-400/10 blur-3xl" />

                <div className="relative flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-7 py-6 md:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                            <UserPlus className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">
                                Ficha de club
                            </div>
                            <div className="mt-0.5 truncate text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
                                {formLabel}
                            </div>
                            <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
                                Carga rapida, preview lateral y asignacion opcional a division.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-light)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                        aria-label="Cerrar formulario"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form noValidate onSubmit={handleSubmit} className="relative max-h-[calc(90vh-88px)] overflow-y-auto px-7 py-6 md:px-8">
                    <input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                    />

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
                        <div className="space-y-5">
                            <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <div className="mb-4 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
                                    Identidad
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold text-[var(--color-text-secondary)]">Nombre</span>
                                        <input
                                            autoFocus
                                            value={firstName}
                                            onChange={e => setFirstName(e.target.value)}
                                            className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 text-sm font-semibold text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-emerald-300/80"
                                            placeholder="Ej: Juan"
                                            required
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold text-[var(--color-text-secondary)]">Apellido</span>
                                        <input
                                            value={lastName}
                                            onChange={e => setLastName(e.target.value)}
                                            className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 text-sm font-semibold text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-emerald-300/80"
                                            placeholder="Ej: Perez"
                                            required
                                        />
                                    </label>
                                </div>
                            </section>

                            <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <div className="mb-4 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
                                    Datos deportivos
                                </div>
                                <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold text-[var(--color-text-secondary)]">Fecha de nacimiento</span>
                                        <div className="relative">
                                            <input
                                                type="date"
                                                value={birthDate}
                                                onChange={e => setBirthDate(e.target.value)}
                                                className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 pr-11 font-mono text-sm font-semibold text-[var(--color-text-primary)] outline-none transition focus:border-emerald-300/80"
                                            />
                                            <Calendar className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                                        </div>
                                        <span className="block text-xs font-medium text-[var(--color-text-muted)]">Edad: {getAgeLabel(birthDate)}</span>
                                    </label>

                                    {initialMode === 'player' ? (
                                        <div className="space-y-4">
                                            {RUGBY_POSITION_GROUPS.map((group) => (
                                                <div key={group.label}>
                                                    <div className="mb-3 flex items-center justify-between">
                                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                                                            {group.label}
                                                        </span>
                                                        <span className="h-px flex-1 bg-white/10 ml-3" />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                        {group.positions.map((item) => {
                                                            const selected = position === item;
                                                            return (
                                                                <button
                                                                    key={item}
                                                                    type="button"
                                                                    onClick={() => setPosition(item)}
                                                                    className={`min-h-12 rounded-2xl border px-4 py-3 text-left text-xs font-black transition ${selected
                                                                        ? 'border-emerald-300/70 bg-emerald-400 text-neutral-950 shadow-lg shadow-emerald-500/20'
                                                                        : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-light)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                                                                        }`}
                                                                >
                                                                    {item}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <label className="space-y-2">
                                            <span className="text-xs font-bold text-[var(--color-text-secondary)]">Cargo en staff</span>
                                            <select
                                                value={role}
                                                onChange={e => setRole(e.target.value)}
                                                className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 text-sm font-bold text-[var(--color-text-primary)] outline-none transition focus:border-emerald-300/80"
                                            >
                                                {STAFF_ROLES.map(([value, label]) => (
                                                    <option key={value} value={value}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                </div>
                            </section>

                            {initialMode === 'player' && (
                                <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                    <div className="mb-4 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
                                        Datos fisicos
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-xs font-bold text-[var(--color-text-secondary)]">Peso</span>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={weight}
                                                    onChange={e => setWeight(e.target.value)}
                                                    className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 pr-14 font-mono text-sm font-semibold text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-emerald-300/80"
                                                    placeholder="75.5"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--color-text-muted)]">KG</span>
                                            </div>
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-xs font-bold text-[var(--color-text-secondary)]">Altura</span>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={height}
                                                    onChange={e => setHeight(e.target.value)}
                                                    className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 pr-14 font-mono text-sm font-semibold text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-emerald-300/80"
                                                    placeholder="180"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--color-text-muted)]">CM</span>
                                            </div>
                                        </label>
                                    </div>
                                </section>
                            )}

                            <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <div className="mb-4 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
                                    Asignacion
                                </div>
                                {!lockDivisionId && divisions && divisions.length > 0 ? (
                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                                        <label className="space-y-2">
                                            <span className="text-xs font-bold text-[var(--color-text-secondary)]">Division</span>
                                            <select
                                                value={divisionId}
                                                onChange={e => setDivisionId(e.target.value)}
                                                className="h-12 w-full rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-4 text-sm font-bold text-[var(--color-text-primary)] outline-none transition focus:border-emerald-300/80"
                                            >
                                                <option value="">Club global</option>
                                                {divisions.map(d => (
                                                    <option key={d.id} value={d.id}>{d.name.toUpperCase()} ({d.season})</option>
                                                ))}
                                            </select>
                                        </label>
                                        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 text-xs font-medium leading-5 text-[var(--color-text-secondary)]">
                                            {linkedDivisionClubs.length > 0 ? (
                                                <div className="space-y-2">
                                                    <p className="font-black uppercase tracking-[0.12em] text-emerald-300">
                                                        Roster compartido
                                                    </p>
                                                    <p>
                                                        Este jugador se carga para todos los equipos de la division:
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {linkedDivisionClubs.map((club) => (
                                                            <span key={club.id} className="border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-200">
                                                                {club.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                'Si no elegis division, el registro queda asociado al club.'
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 text-xs font-medium leading-5 text-[var(--color-text-secondary)]">
                                        Se registra a nivel club. Cuando existan divisiones, vas a poder asignarlo a un plantel especifico.
                                    </div>
                                )}
                            </section>
                        </div>

                        <aside className="h-fit rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:sticky lg:top-2">
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                                Preview
                            </div>
                            <div className="mt-4 flex flex-col items-center text-center">
                                <div className="relative">
                                    <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[22px] border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                                        {photoUrl ? (
                                            <img src={photoUrl} alt="Preview" className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-11 w-11 text-[var(--color-text-muted)]" />
                                        )}
                                    </div>
                                    <label
                                        htmlFor="photo-upload"
                                        className="absolute -bottom-2 -right-2 grid h-10 w-10 cursor-pointer place-items-center rounded-2xl border border-emerald-200/50 bg-emerald-400 text-neutral-950 shadow-lg transition hover:-translate-y-0.5"
                                        title="Subir foto"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </label>
                                </div>
                                <div className="mt-5 max-w-full truncate text-lg font-black text-[var(--color-text-primary)]">{displayName}</div>
                                <div className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                                    {initialMode === 'player'
                                        ? position || 'Sin posicion'
                                        : STAFF_ROLES.find(([value]) => value === role)?.[1] || 'Staff'}
                                </div>
                                <div className="mt-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                                    {selectedDivision ? selectedDivision.name : 'Club global'}
                                </div>
                                {linkedDivisionClubs.length > 0 && (
                                    <div className="mt-3 w-full rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-200">
                                        Comparte con: {linkedDivisionClubs.map((club) => club.name).join(', ')}
                                    </div>
                                )}
                            </div>

                            <div className="my-5 h-px bg-[var(--color-border)]" />
                            <div className="space-y-2">
                                <div className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                                    Estado
                                </div>
                                <CompletionRow label="Identidad" complete={identityComplete} />
                                <CompletionRow label="Deportivo" complete={sportsComplete} />
                                <CompletionRow label="Fisico" complete={physicalComplete} />
                                <CompletionRow label="Asignacion" complete={assignmentComplete} />
                            </div>
                        </aside>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-4 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:justify-end">
                        {formError && (
                            <div className="flex min-h-12 flex-1 items-center border border-red-400/30 bg-red-500/10 px-4 text-sm font-bold text-red-200">
                                {formError}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-12 rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] px-7 text-sm font-black uppercase tracking-wide text-[var(--color-text-primary)] transition hover:bg-[var(--color-bg-hover)]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex h-12 items-center justify-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400 px-8 text-sm font-black uppercase tracking-wide text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {isEditing ? 'Actualizar' : 'Guardar'} {initialMode === 'player' ? 'jugador' : 'miembro'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
