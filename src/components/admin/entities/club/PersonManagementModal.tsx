'use client';

import { useState } from 'react';
import { X, UserPlus, Shield, Loader2, Calendar, Upload, User } from 'lucide-react';
import { addPersonToClub } from '@/lib/services/personService';
import { Division } from '@/lib/services/divisionService';

const RUGBY_POSITIONS = [
    'Pilar Izquierdo', 'Hooker', 'Pilar Derecho',
    'Segunda Línea', 'Ala', 'Octavo',
    'Medio Scrum', 'Apertura', 'Wing', 'Centro', 'Fullback'
];

interface Props {
    clubId: string;
    divisions?: Division[];
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialMode: 'player' | 'staff';
    lockDivisionId?: string;
}

export function PersonManagementModal({ clubId, divisions, isOpen, onClose, onSuccess, initialMode, lockDivisionId }: Props) {
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

    if (!isOpen) return null;

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setPhotoUrl(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName || !lastName) return;

        setLoading(true);
        const res = await addPersonToClub(clubId, {
            first_name: firstName,
            last_name: lastName,
            birth_date: birthDate,
            position: position,
            photo_url: photoUrl || undefined,
            weight: weight ? parseFloat(weight) : undefined,
            height: height ? parseFloat(height) : undefined,
            role,
            division_id: divisionId || undefined,
            status: 'active'
        });

        if (res.success) {
            onSuccess();
            onClose();
            // Reset
            setFirstName('');
            setLastName('');
            setBirthDate('');
            setPosition('');
            setPhotoUrl('');
            setWeight('');
            setHeight('');
        } else {
            alert('Error: ' + res.error);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
            <div className="card scale-in w-full max-w-xl shadow-2xl border-blue-500/20">
                {/* Header */}
                <div className="flex items-start justify-between p-8 pb-4">
                    <div className="space-y-1 flex items-center gap-3">
                        <UserPlus className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-white">
                                Nueva Ficha {initialMode === 'player' ? 'Jugador' : 'Staff'}
                            </h2>
                            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-bold mt-0.5">
                                Complete los datos técnicos obligatorios
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded transition flex-shrink-0"
                    >
                        <X className="w-4 h-4 text-neutral-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6">
                    {/* Photo Upload */}
                    <div className="flex justify-center pt-2 pb-3">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full bg-neutral-900/80 border-2 border-neutral-800 flex items-center justify-center overflow-hidden">
                                {photoUrl ? (
                                    <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-9 h-9 text-neutral-700" />
                                )}
                            </div>
                            <label
                                htmlFor="photo-upload"
                                className="absolute -bottom-1 -right-1 p-1.5 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-600 transition shadow-lg"
                                title="Subir foto"
                            >
                                <Upload className="w-3.5 h-3.5 text-white" />
                            </label>
                            <input
                                id="photo-upload"
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="hidden"
                            />
                        </div>
                    </div>

                    {/* Nombre y Apellido */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Nombre</label>
                            <input
                                autoFocus
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 text-sm focus:outline-none transition"
                                placeholder="Ej: Juan"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Apellido</label>
                            <input
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 text-sm focus:outline-none transition"
                                placeholder="Ej: Pérez"
                                required
                            />
                        </div>
                    </div>

                    {/* Fecha de Nacimiento */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-blue-500" /> Fecha de Nacimiento
                        </label>
                        <input
                            type="date"
                            value={birthDate}
                            onChange={e => setBirthDate(e.target.value)}
                            className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 font-mono text-sm focus:outline-none transition"
                        />
                    </div>

                    {/* Peso y Altura */}
                    {initialMode === 'player' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                                    Peso (kg) <span className="text-neutral-700">- Opcional</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={weight}
                                    onChange={e => setWeight(e.target.value)}
                                    className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 font-mono text-sm focus:outline-none transition"
                                    placeholder="75.5"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                                    Altura (cm) <span className="text-neutral-700">- Opcional</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={height}
                                    onChange={e => setHeight(e.target.value)}
                                    className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 font-mono text-sm focus:outline-none transition"
                                    placeholder="180"
                                />
                            </div>
                        </div>
                    )}

                    {/* Posición de Juego */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                            {initialMode === 'player' ? 'Posición de Juego' : 'Cargo en Staff'}
                        </label>
                        {initialMode === 'player' ? (
                            <select
                                value={position}
                                onChange={e => setPosition(e.target.value)}
                                className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 appearance-none text-sm font-bold focus:outline-none transition"
                            >
                                <option value="">-- SELECCIONAR POSICIÓN --</option>
                                {RUGBY_POSITIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                            </select>
                        ) : (
                            <select
                                value={role}
                                onChange={e => setRole(e.target.value)}
                                className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 appearance-none text-sm font-bold focus:outline-none transition"
                            >
                                <option value="head_coach">ENTRENADOR PRINCIPAL</option>
                                <option value="assistant_coach">ENTRENADOR ASISTENTE</option>
                                <option value="physical_trainer">PREPARADOR FÍSICO</option>
                                <option value="physio">KINESIÓLOGO</option>
                                <option value="doctor">MÉDICO</option>
                                <option value="manager">MANAGER</option>
                                <option value="video_analyst">ANALISTA DE VIDEO</option>
                            </select>
                        )}
                    </div>

                    {/* Asignar a Plantel */}
                    {!lockDivisionId && divisions && divisions.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Asignar a Plantel</label>
                            <select
                                value={divisionId}
                                onChange={e => setDivisionId(e.target.value)}
                                className="w-full h-12 bg-neutral-900/50 border border-neutral-800 focus:border-blue-500 rounded px-4 appearance-none text-sm font-bold focus:outline-none transition"
                            >
                                <option value="">-- CLUB GLOBAL --</option>
                                {divisions.map(d => (
                                    <option key={d.id} value={d.id}>{d.name.toUpperCase()} ({d.season})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Botones */}
                    <div className="pt-4 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn flex-1 !h-12 font-black text-[11px] !rounded"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !firstName || !lastName}
                            className="btn btn-primary flex-[2] !h-12 gap-2 font-black text-[11px] !rounded"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                            Registrar Miembro
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
