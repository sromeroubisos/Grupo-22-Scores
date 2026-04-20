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
        <div className="flex items-center justify-between gap-[10px] border-b border-slate-200/80 py-[10px] text-[13px] last:border-b-0">
            <span className="font-semibold text-slate-600">{label}</span>
            <span className={`inline-flex min-w-[72px] items-center justify-end gap-[10px] font-black ${complete ? 'text-emerald-500' : 'text-rose-400'}`}>
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
    const currentRoleLabel = STAFF_ROLES.find(([value]) => value === role)?.[1] || 'STAFF';
    const previewMeta = initialMode === 'player' ? (position || 'Sin posicion').toUpperCase() : currentRoleLabel;
    const assignmentLabel = selectedDivision ? selectedDivision.name : 'Plantel base del club';

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
            setFormError(`Completa nombre y apellido para guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`);
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
                        : { success: false as const, error: result.error || `No se pudo guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.` };
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
                setFormError(res.error || `No se pudo guardar ${initialMode === 'player' ? 'el jugador' : 'el miembro del staff'}.`);
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

    const sectionLabelClass = 'text-[11px] font-black uppercase tracking-[0.28em] text-emerald-400';
    const panelClass = 'rounded-[5px] border border-slate-200/80 bg-white/72 p-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-xl';
    const fieldClass = 'h-12 w-full rounded-[5px] border border-slate-300/85 bg-white/88 px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100';
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[rgba(10,15,25,0.72)] px-3 py-4 backdrop-blur-xl animate-in fade-in duration-200">
            <div className="pointer-events-none fixed left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/15 blur-3xl" />

            <div className="relative w-full max-w-[1180px] overflow-hidden rounded-[5px] border border-white/55 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,247,251,0.9))] text-slate-900 shadow-[0_40px_120px_rgba(2,6,23,0.45)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,222,128,0.12),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.12),transparent_26%)]" />

                <div className="relative border-b border-slate-200/80 px-[10px] py-[10px] md:px-[15px] md:py-[15px]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[5px] border border-emerald-200 bg-emerald-50 text-emerald-500">
                                <UserPlus className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-black uppercase tracking-[0.32em] text-emerald-400">
                                    Ficha de club
                                </div>
                                <div className="mt-[10px] text-[clamp(1.7rem,2.8vw,2.5rem)] font-black tracking-[-0.06em] text-slate-900 leading-none">
                                    {formLabel}
                                </div>
                                <p className="mt-[10px] max-w-2xl text-sm font-medium text-slate-500">
                                    Carga rapida, preview lateral y asignacion opcional a division.
                                </p>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                            <div className="hidden rounded-[5px] border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-sky-500 md:block">
                                {isEditing ? 'Ficha en edicion' : 'Ficha de club v2.4'}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="grid h-12 w-12 place-items-center rounded-[5px] border border-slate-200 bg-white/70 text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-800"
                                aria-label="Cerrar formulario"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <form noValidate onSubmit={handleSubmit} className="relative max-h-[calc(92vh-104px)] overflow-y-auto px-[10px] py-[10px] md:px-[15px] md:py-[15px]">
                    <input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                    />

                    <div className="grid items-start gap-[10px] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)_270px]">
                        <section className={panelClass}>
                            <div className={sectionLabelClass}>Identidad</div>
                            <div className="mt-[10px] grid gap-[10px] md:grid-cols-2">
                                <label className="space-y-[10px]">
                                    <span className="text-xs font-bold text-slate-600">Nombre</span>
                                    <input
                                        autoFocus
                                        value={firstName}
                                        onChange={e => setFirstName(e.target.value)}
                                        className={fieldClass}
                                        placeholder="Ej: Juan"
                                        required
                                    />
                                </label>
                                <label className="space-y-[10px]">
                                    <span className="text-xs font-bold text-slate-600">Apellido</span>
                                    <input
                                        value={lastName}
                                        onChange={e => setLastName(e.target.value)}
                                        className={fieldClass}
                                        placeholder="Ej: Perez"
                                        required
                                    />
                                </label>
                            </div>

                            <div className="mt-[10px]">
                                <div className={sectionLabelClass}>Biometria</div>
                                <div className="mt-[10px] grid gap-[10px] md:grid-cols-2">
                                    {initialMode === 'player' && (
                                        <label className="space-y-[10px] md:col-span-2">
                                            <span className="text-xs font-bold text-slate-600">Fecha de nacimiento</span>
                                            <div className="relative">
                                                <input
                                                    type="date"
                                                    value={birthDate}
                                                    onChange={e => setBirthDate(e.target.value)}
                                                    className={`${fieldClass} pr-11 font-mono`}
                                                />
                                                <Calendar className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            </div>
                                            <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-sky-500">
                                                Edad: {getAgeLabel(birthDate)}
                                            </span>
                                        </label>
                                    )}

                                    {initialMode === 'player' ? (
                                        <>
                                            <label className="space-y-[10px]">
                                                <span className="text-xs font-bold text-slate-600">Peso (KG)</span>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={weight}
                                                        onChange={e => setWeight(e.target.value)}
                                                        className={`${fieldClass} pr-14 font-mono`}
                                                        placeholder="75.5"
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">KG</span>
                                                </div>
                                            </label>
                                            <label className="space-y-[10px]">
                                                <span className="text-xs font-bold text-slate-600">Altura (CM)</span>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={height}
                                                        onChange={e => setHeight(e.target.value)}
                                                        className={`${fieldClass} pr-14 font-mono`}
                                                        placeholder="180"
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">CM</span>
                                                </div>
                                            </label>
                                        </>
                                    ) : (
                                        <label className="space-y-[10px] md:col-span-2">
                                            <span className="text-xs font-bold text-slate-600">Cargo</span>
                                            <select
                                                value={role}
                                                onChange={e => setRole(e.target.value)}
                                                className={fieldClass}
                                            >
                                                {STAFF_ROLES.map(([value, label]) => (
                                                    <option key={value} value={value}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                </div>
                            </div>

                            <div className="mt-[10px] rounded-[5px] border border-sky-200/70 bg-sky-50/70 px-[10px] py-[10px]">
                                <p className="text-xs leading-5 text-sky-700">
                                    <strong>Asignacion:</strong> El alta queda en el plantel base del club. Si mas adelante necesitas otro destino operativo, puedes vincularlo o reasignarlo desde la estructura de planteles.
                                </p>
                            </div>
                        </section>

                        <section className={panelClass}>
                            <div className={sectionLabelClass}>Perfil deportivo</div>

                            {initialMode === 'player' ? (
                                <div className="mt-[10px] space-y-[10px]">
                                    {RUGBY_POSITION_GROUPS.map((group) => (
                                        <div key={group.label}>
                                            <div className="mb-[10px] flex items-center gap-[10px]">
                                                <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">
                                                    {group.label}
                                                </span>
                                                <div className="h-px flex-1 bg-slate-200" />
                                            </div>
                                            <div className="grid gap-[10px] sm:grid-cols-2 xl:grid-cols-3">
                                                {group.positions.map((item) => {
                                                    const selected = position === item;
                                                    return (
                                                        <button
                                                            key={item}
                                                            type="button"
                                                            onClick={() => setPosition(item)}
                                                            className={`min-h-[48px] rounded-[5px] border px-[10px] py-[10px] text-left text-[13px] font-extrabold leading-snug transition ${selected
                                                                ? 'border-sky-500 bg-sky-500 text-white shadow-[0_12px_24px_rgba(59,130,246,0.22)]'
                                                                : 'border-slate-200 bg-white/75 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'
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
                                <div className="mt-[10px] space-y-[10px]">
                                    <label className="space-y-[10px]">
                                        <span className="text-xs font-bold text-slate-600">Perfil del staff</span>
                                        <select
                                            value={role}
                                            onChange={e => setRole(e.target.value)}
                                            className={fieldClass}
                                        >
                                            {STAFF_ROLES.map(([value, label]) => (
                                                <option key={value} value={value}>{label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="rounded-[5px] border border-slate-200 bg-white/70 px-[10px] py-[10px] text-sm text-slate-500">
                                        Se conserva el mismo flujo de alta, pero con una ficha lateral orientada a roles y validacion operativa.
                                    </div>
                                </div>
                            )}
                        </section>

                        <aside className="self-start rounded-[5px] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(244,247,251,0.98))] p-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] xl:row-span-2">
                            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">
                                Preview
                            </div>

                            <div className="mt-[10px] rounded-[5px] border border-slate-200 bg-white/85 p-[10px] text-center shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
                                <div className="mx-auto flex w-full flex-col items-center gap-[10px]">
                                    <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[5px] border border-slate-200 bg-slate-50">
                                        {photoUrl ? (
                                            <img src={photoUrl} alt="Preview" className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-11 w-11 text-slate-400" />
                                        )}
                                    </div>
                                    <label
                                        htmlFor="photo-upload"
                                        className="inline-flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-[5px] border border-emerald-300 bg-emerald-400 px-[10px] text-slate-950 shadow-[0_12px_24px_rgba(74,222,128,0.3)] transition hover:-translate-y-0.5"
                                        title="Subir foto"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </label>
                                </div>

                                <div className="mt-[10px] break-words text-[1.6rem] font-black leading-none tracking-[-0.05em] text-slate-900">
                                    {displayName}
                                </div>
                                <div className="mt-[10px] font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">
                                    {previewMeta}
                                </div>
                                <div className="mt-[10px] text-sm font-medium text-slate-500">
                                    {assignmentLabel}
                                </div>

                                {initialMode === 'player' && (
                                    <div className="mt-[10px] grid grid-cols-2 gap-[10px]">
                                        <div className="rounded-[5px] bg-slate-50 px-[10px] py-[10px]">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Peso</div>
                                            <div className="mt-1 font-mono text-sm font-bold text-slate-700">{weight ? `${weight} KG` : '-- KG'}</div>
                                        </div>
                                        <div className="rounded-[5px] bg-slate-50 px-[10px] py-[10px]">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Altura</div>
                                            <div className="mt-1 font-mono text-sm font-bold text-slate-700">{height ? `${height} CM` : '-- CM'}</div>
                                        </div>
                                    </div>
                                )}

                                {linkedDivisionClubs.length > 0 && (
                                    <div className="mt-[10px] rounded-[5px] border border-sky-200 bg-sky-50 px-[10px] py-[10px] text-left text-[11px] font-bold uppercase tracking-[0.08em] text-sky-600">
                                        Comparte con: {linkedDivisionClubs.map((club) => club.name).join(', ')}
                                    </div>
                                )}
                            </div>

                            <div className="mt-[10px]">
                                <div className="mb-[10px] text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">
                                    Estado
                                </div>
                                <div className="rounded-[5px] border border-slate-200 bg-white/70 px-[10px] py-[10px]">
                                    <CompletionRow label="Identidad" complete={identityComplete} />
                                    <CompletionRow label="Deportivo" complete={sportsComplete} />
                                    <CompletionRow label="Fisico" complete={physicalComplete} />
                                    <CompletionRow label="Asignacion" complete={assignmentComplete} />
                                </div>
                            </div>
                        </aside>

                        <section className={`${panelClass} xl:col-span-2`}>
                            <div className={sectionLabelClass}>Asignacion</div>

                            {!lockDivisionId && divisions && divisions.length > 0 ? (
                                <div className="mt-[10px] grid gap-[10px] lg:grid-cols-[minmax(0,1fr)_260px]">
                                    <label className="space-y-[10px]">
                                        <span className="text-xs font-bold text-slate-600">Division</span>
                                        <select
                                            value={divisionId}
                                            onChange={e => setDivisionId(e.target.value)}
                                            className={fieldClass}
                                        >
                                            <option value="">Plantel base del club</option>
                                            {divisions.map((division) => (
                                                <option key={division.id} value={division.id}>
                                                    {division.name.toUpperCase()} ({division.season})
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <div className="rounded-[5px] border border-slate-200 bg-white/70 px-[10px] py-[10px] text-sm leading-6 text-slate-500">
                                        {linkedDivisionClubs.length > 0 ? (
                                            <div className="space-y-2">
                                                <p className="font-black uppercase tracking-[0.18em] text-sky-500">
                                                    Roster compartido
                                                </p>
                                                <p>Este registro se replica para todos los equipos de la division.</p>
                                                <div className="flex flex-wrap gap-[10px]">
                                                    {linkedDivisionClubs.map((club) => (
                                                        <span key={club.id} className="rounded-[5px] border border-sky-200 bg-sky-50 px-[10px] py-[10px] text-[10px] font-black uppercase tracking-[0.08em] text-sky-600">
                                                            {club.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            'Si no eliges otro plantel, el jugador queda en el plantel base del club.'
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-[10px] rounded-[5px] border border-slate-200 bg-white/70 px-[10px] py-[10px] text-sm leading-6 text-slate-500">
                                    Se registra en el plantel base del club. Cuando existan otros planteles o vinculaciones operativas, vas a poder moverlo sin perder la pertenencia al club.
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="mt-[10px] flex flex-col-reverse gap-[10px] border-t border-slate-200/80 pt-[10px] sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-h-12 flex-1">
                            {formError && (
                                <div className="flex min-h-12 items-center rounded-[5px] border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-500">
                                    {formError}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-[10px] sm:flex-row">
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex min-w-[110px] items-center justify-center rounded-[5px] border border-slate-300 bg-white/80 px-[14px] py-[12px] text-sm font-black uppercase tracking-wide text-slate-800 transition hover:bg-white"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex min-w-[190px] items-center justify-center gap-[10px] rounded-[5px] border border-emerald-300 bg-emerald-400 px-[16px] py-[12px] text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_14px_28px_rgba(74,222,128,0.26)] transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {isEditing ? 'Actualizar' : 'Guardar'} {initialMode === 'player' ? 'jugador' : 'miembro'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
