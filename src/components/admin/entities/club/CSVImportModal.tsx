'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, Upload, X } from 'lucide-react';
import {
    importPeopleFromCSV,
    previewPeopleImportConflicts,
    type CSVImportConflict,
    type CSVRow,
} from '@/lib/services/csvService';
import { Division } from '@/lib/services/divisionService';

interface Props {
    clubId: string;
    divisions: Division[];
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    fixedDivisionId?: string;
}

type ImportResult = {
    count: number;
    errors: string[];
};

type ConflictDecision = {
    mode: 'reuse' | 'create';
    personId?: string;
};

const PLAYER_IMPORT_HEADERS = [
    'nombre',
    'apellido',
    'fecha_nacimiento',
    'posicion',
    'peso',
] as const;

const PLAYER_IMPORT_SAMPLE_ROWS = [
    ['Juan', 'Perez', '2004-05-11', 'Wing', '82.5'],
    ['Tomas', 'Gomez', '2002-08-20', 'Apertura', '79.3'],
];

const HEADER_ALIASES: Record<string, keyof CSVRow> = {
    nombre: 'first_name',
    first_name: 'first_name',
    firstname: 'first_name',
    firstName: 'first_name',
    apellido: 'last_name',
    last_name: 'last_name',
    lastname: 'last_name',
    lastName: 'last_name',
    documento: 'id_number',
    dni: 'id_number',
    id_number: 'id_number',
    birth_date: 'birth_date',
    fecha_nacimiento: 'birth_date',
    fecha_de_nacimiento: 'birth_date',
    'fecha de nacimiento': 'birth_date',
    'fecha nacimiento': 'birth_date',
    role: 'role',
    rol: 'role',
    posicion: 'position',
    position: 'position',
    division_id: 'division_id',
    division: 'division_id',
    plantel: 'division_id',
    jersey_number: 'jersey_number',
    dorsal: 'jersey_number',
    numero: 'jersey_number',
    squad_role: 'squad_role',
    rol_plantel: 'squad_role',
    lineup_role: 'squad_role',
    status: 'status',
    estado: 'status',
    photo_url: 'photo_url',
    foto: 'photo_url',
    avatar_url: 'photo_url',
    weight: 'weight',
    peso: 'weight',
    peso_kg: 'weight',
    height: 'height',
    altura: 'height',
};

function normalizeHeader(value: unknown) {
    return String(value || '').trim().toLowerCase();
}

function toOptionalString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
}

function toOptionalNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return undefined;
    const normalized = Number(String(value).replace(',', '.').trim());
    return Number.isFinite(normalized) ? normalized : undefined;
}

function splitFullName(value: string) {
    const normalized = value.trim();
    if (!normalized) return { firstName: '', lastName: '' };
    const parts = normalized.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return {
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts.slice(-1).join(' '),
    };
}

function buildTemplateCsv() {
    const rows = [
        PLAYER_IMPORT_HEADERS.join(','),
        ...PLAYER_IMPORT_SAMPLE_ROWS.map((row) => row.join(',')),
    ];
    return rows.join('\n');
}

function parseInlineTextInput(rawInput: string) {
    const trimmed = rawInput.trim();
    if (!trimmed) return [];

    const lines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return [];

    const firstLine = lines[0].toLowerCase();
    const hasHeader = ['nombre', 'apellido', 'fecha_nacimiento', 'posicion', 'peso', 'first_name', 'last_name']
        .some((token) => firstLine.includes(token));
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line) => {
        const delimiter = line.includes('\t')
            ? '\t'
            : line.includes(';')
                ? ';'
                : ',';

        const [nombre = '', apellido = '', fecha_nacimiento = '', posicion = '', peso = ''] = line
            .split(delimiter)
            .map((value) => value.trim());

        return {
            nombre,
            apellido,
            fecha_nacimiento,
            posicion,
            peso,
        };
    });
}

function mapWorkbookRows(input: Record<string, unknown>[], selectedDivisionId?: string) {
    const errors: string[] = [];
    const rows: CSVRow[] = [];

    input.forEach((rawRow, index) => {
        const mappedEntries = Object.entries(rawRow).reduce<Record<string, unknown>>((acc, [rawHeader, value]) => {
            const normalizedHeader = normalizeHeader(rawHeader);
            const canonicalHeader = HEADER_ALIASES[normalizedHeader];
            if (canonicalHeader) {
                acc[canonicalHeader] = value;
            }
            return acc;
        }, {});

        const directFirstName = toOptionalString(mappedEntries.first_name);
        const directLastName = toOptionalString(mappedEntries.last_name);
        const fullName = toOptionalString((rawRow as Record<string, unknown>).full_name)
            || toOptionalString((rawRow as Record<string, unknown>).name)
            || toOptionalString((rawRow as Record<string, unknown>).nombre_apellido)
            || toOptionalString((rawRow as Record<string, unknown>)['nombre completo'])
            || toOptionalString((rawRow as Record<string, unknown>)['full name']);
        const splitName = fullName ? splitFullName(fullName) : null;
        const firstName = directFirstName || splitName?.firstName || '';
        const lastName = directLastName || splitName?.lastName || '';

        if (!firstName || !lastName) {
            errors.push(`Fila ${index + 2}: falta nombre y/o apellido.`);
            return;
        }

        rows.push({
            first_name: firstName,
            last_name: lastName,
            id_number: toOptionalString(mappedEntries.id_number),
            birth_date: toOptionalString(mappedEntries.birth_date),
            role: toOptionalString(mappedEntries.role) || 'player',
            position: toOptionalString(mappedEntries.position),
            division_id: selectedDivisionId || toOptionalString(mappedEntries.division_id),
            jersey_number: toOptionalNumber(mappedEntries.jersey_number),
            squad_role: toOptionalString(mappedEntries.squad_role),
            status: toOptionalString(mappedEntries.status) || 'active',
            photo_url: toOptionalString(mappedEntries.photo_url),
            weight: toOptionalNumber(mappedEntries.weight),
            height: toOptionalNumber(mappedEntries.height),
        });
    });

    return { rows, errors };
}

export function CSVImportModal({ clubId, divisions, isOpen, onClose, onSuccess, fixedDivisionId }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [rawInput, setRawInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>(fixedDivisionId || '');
    const [pendingRows, setPendingRows] = useState<CSVRow[]>([]);
    const [pendingParseErrors, setPendingParseErrors] = useState<string[]>([]);
    const [conflicts, setConflicts] = useState<CSVImportConflict[]>([]);
    const [conflictDecisions, setConflictDecisions] = useState<Record<number, ConflictDecision>>({});

    const templatePreview = useMemo(() => buildTemplateCsv(), []);
    const allConflictsResolved = conflicts.length > 0 && conflicts.every((conflict) => Boolean(conflictDecisions[conflict.rowIndex]));

    useEffect(() => {
        if (!isOpen) return;

        setFile(null);
        setRawInput('');
        setResult(null);
        setLoading(false);
        setSelectedDivisionId(fixedDivisionId || '');
        setPendingRows([]);
        setPendingParseErrors([]);
        setConflicts([]);
        setConflictDecisions({});
    }, [fixedDivisionId, isOpen]);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleDownloadTemplate = () => {
        const blob = new Blob([templatePreview], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'jugadores_import_template.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    const finalizeImport = async (rows: CSVRow[], parseErrors: string[]) => {
        const response = await importPeopleFromCSV(clubId, rows);

        setConflicts([]);
        setPendingRows([]);
        setPendingParseErrors([]);
        setConflictDecisions({});
        setResult({
            count: response.count,
            errors: [...parseErrors, ...response.errors],
        });

        if (response.count > 0) {
            onSuccess();
        }
    };

    const processFile = async () => {
        setLoading(true);

        try {
            let rawRows: Record<string, unknown>[] = [];

            if (rawInput.trim()) {
                rawRows = parseInlineTextInput(rawInput);
            } else if (file) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
                    defval: '',
                    raw: false,
                });
            } else {
                setResult({ count: 0, errors: ['Pega datos en el recuadro o selecciona un archivo para importar.'] });
                return;
            }

            if (rawRows.length === 0) {
                setResult({ count: 0, errors: ['El archivo no contiene filas para importar.'] });
                return;
            }

            const parsed = mapWorkbookRows(rawRows, selectedDivisionId || undefined);
            if (parsed.rows.length === 0) {
                setResult({ count: 0, errors: parsed.errors.length > 0 ? parsed.errors : ['No se encontraron filas validas.'] });
                return;
            }

            const nextConflicts = await previewPeopleImportConflicts(clubId, parsed.rows);
            if (nextConflicts.length > 0) {
                setPendingRows(parsed.rows);
                setPendingParseErrors(parsed.errors);
                setConflicts(nextConflicts);
                setConflictDecisions({});
                return;
            }

            await finalizeImport(parsed.rows, parsed.errors);
        } catch (error) {
            setResult({ count: 0, errors: [`Error al leer el archivo: ${String(error)}`] });
        } finally {
            setLoading(false);
        }
    };

    const handleConflictDecision = (rowIndex: number, decision: ConflictDecision) => {
        setConflictDecisions((current) => ({
            ...current,
            [rowIndex]: decision,
        }));
    };

    const handleConflictImport = async () => {
        if (!allConflictsResolved) return;

        setLoading(true);
        try {
            const resolvedRows = pendingRows.map((row, index) => {
                const decision = conflictDecisions[index];
                if (!decision) return row;
                if (decision.mode === 'reuse' && decision.personId) {
                    return {
                        ...row,
                        existing_person_id: decision.personId,
                    };
                }

                return {
                    ...row,
                    force_create_new: true,
                };
            });

            await finalizeImport(resolvedRows, pendingParseErrors);
        } catch (error) {
            setResult({ count: 0, errors: [`Error al resolver la importacion: ${String(error)}`] });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="card scale-in w-full max-w-3xl p-8 shadow-2xl overflow-hidden border-blue-500/20 bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Upload className="w-6 h-6 text-blue-500" />
                            Importacion masiva
                        </h2>
                        <p className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-widest">
                            Pega datos o importa CSV / Excel para alta rapida de jugadores
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--color-bg-hover)] rounded-full transition" type="button">
                        <X className="w-5 h-5 text-[var(--color-text-muted)]" />
                    </button>
                </div>

                {!result ? conflicts.length > 0 ? (
                    <div className="space-y-6">
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-500">Revision de homonimos</p>
                            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                                Encontramos jugadores con el mismo nombre en la base. Decide fila por fila si corresponde reutilizar una ficha existente o crear una nueva.
                            </p>
                        </div>

                        <div className="max-h-[56vh] space-y-4 overflow-y-auto pr-1">
                            {conflicts.map((conflict) => {
                                const decision = conflictDecisions[conflict.rowIndex];
                                const rowLabel = `${conflict.row.first_name} ${conflict.row.last_name}`.trim();

                                return (
                                    <div key={`${conflict.rowIndex}-${rowLabel}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5">
                                        <div className="flex flex-col gap-2 border-b border-[var(--color-border)] pb-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
                                                    Fila {conflict.rowIndex + 2}
                                                </span>
                                                <span className="text-sm font-black uppercase tracking-[0.08em] text-[var(--color-text-primary)]">
                                                    {rowLabel}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[var(--color-text-secondary)]">
                                                {conflict.row.birth_date ? `Nacimiento: ${conflict.row.birth_date}` : 'Sin fecha de nacimiento'}
                                                {conflict.row.position ? ` / Posicion: ${conflict.row.position}` : ''}
                                                {conflict.row.id_number ? ` / DNI: ${conflict.row.id_number}` : ''}
                                            </p>
                                        </div>

                                        <div className="mt-4 space-y-3">
                                            {conflict.matches.map((match) => {
                                                const isSelected = decision?.mode === 'reuse' && decision.personId === match.person_id;

                                                return (
                                                    <div key={match.person_id} className={`rounded-xl border p-4 transition ${isSelected ? 'border-sky-500 bg-sky-500/5' : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]'}`}>
                                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                            <div className="space-y-2">
                                                                <p className="text-sm font-black uppercase tracking-[0.08em] text-[var(--color-text-primary)]">{match.full_name}</p>
                                                                <p className="text-xs text-[var(--color-text-secondary)]">
                                                                    {match.birth_date ? `Nacimiento: ${match.birth_date}` : 'Sin fecha de nacimiento'}
                                                                    {match.id_number ? ` / DNI: ${match.id_number}` : ' / Sin DNI'}
                                                                </p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {match.already_linked_to_club ? (
                                                                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                                                                            Ya vinculado a este club
                                                                        </span>
                                                                    ) : null}
                                                                    {match.club_links.map((link) => (
                                                                        <span key={`${match.person_id}-${link.club_id}-${link.division_id || 'base'}-${link.role || 'role'}`} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-secondary)]">
                                                                            {link.club_name}
                                                                            {link.division_name ? ` / ${link.division_name}` : ''}
                                                                            {link.role ? ` / ${link.role}` : ''}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleConflictDecision(conflict.rowIndex, { mode: 'reuse', personId: match.person_id })}
                                                                className={`btn !h-10 ${isSelected ? '!bg-sky-500 !text-white' : ''}`}
                                                            >
                                                                Usar esta ficha
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            <button
                                                type="button"
                                                onClick={() => handleConflictDecision(conflict.rowIndex, { mode: 'create' })}
                                                className={`btn !h-10 ${decision?.mode === 'create' ? '!bg-amber-400 !text-slate-950' : ''}`}
                                            >
                                                Crear una ficha nueva para esta fila
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-4 pt-2">
                            {pendingParseErrors.length > 0 && (
                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-500">
                                        <AlertCircle className="w-3 h-3" />
                                        Advertencias de parseo ({pendingParseErrors.length})
                                    </div>
                                    <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                                        {pendingParseErrors.map((error, index) => (
                                            <p key={`${error}-${index}`} className="text-[10px] font-mono text-[var(--color-text-secondary)]">{error}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setConflicts([]);
                                        setPendingRows([]);
                                        setPendingParseErrors([]);
                                        setConflictDecisions({});
                                    }}
                                    className="btn flex-1 h-12"
                                    type="button"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleConflictImport}
                                    disabled={!allConflictsResolved || loading}
                                    className="btn btn-primary flex-[2] h-12 gap-3"
                                    type="button"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    {loading ? 'Importando...' : 'Continuar importacion'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="p-6 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-tertiary)] space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-[var(--color-bg-primary)] flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-[var(--color-text-muted)]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-[var(--color-text-primary)]">Pegar datos</p>
                                        <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest font-mono">
                                            Abre directo para escribir o pegar filas
                                        </p>
                                    </div>
                                </div>

                                <textarea
                                    autoFocus
                                    value={rawInput}
                                    onChange={(event) => setRawInput(event.target.value)}
                                    className="min-h-[260px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-4 text-sm leading-6 text-[var(--color-text-primary)] outline-none focus:border-blue-500"
                                    placeholder={`nombre,apellido,fecha_nacimiento,posicion,peso\nJuan,Perez,2004-05-11,Wing,82.5\nTomas,Gomez,,Apertura,\n\nTambien puedes pegar filas sin encabezado en ese mismo orden.`}
                                />

                                <div className="flex flex-wrap gap-3">
                                    <input
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={handleFileChange}
                                        className="hidden"
                                        id="csv-upload"
                                    />
                                    <label
                                        htmlFor="csv-upload"
                                        className="btn cursor-pointer !h-10"
                                    >
                                        {file ? file.name : 'Elegir archivo'}
                                    </label>
                                    <button type="button" className="btn gap-2 !h-10" onClick={handleDownloadTemplate}>
                                        <Download className="w-4 h-4" />
                                        Descargar plantilla
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">Formato soportado</p>
                                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                                        Formato rapido recomendado: <span className="font-mono text-[var(--color-text-primary)]">nombre</span>, <span className="font-mono text-[var(--color-text-primary)]">apellido</span>, <span className="font-mono text-[var(--color-text-primary)]">fecha_nacimiento</span>, <span className="font-mono text-[var(--color-text-primary)]">posicion</span>, <span className="font-mono text-[var(--color-text-primary)]">peso</span>.
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">Reglas</p>
                                    <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                                        <li><span className="font-mono">nombre</span> y <span className="font-mono">apellido</span> son obligatorios.</li>
                                        <li><span className="font-mono">fecha_nacimiento</span>, <span className="font-mono">posicion</span> y <span className="font-mono">peso</span> son opcionales.</li>
                                        <li>Si no envias <span className="font-mono">division_id</span>, queda en el plantel base del club.</li>
                                        <li>Tambien se aceptan columnas avanzadas como <span className="font-mono">division_id</span>, <span className="font-mono">jersey_number</span> y <span className="font-mono">squad_role</span>.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
                                {fixedDivisionId ? 'Plantel de destino' : 'Asignar a plantel por defecto'}
                            </label>
                            <select
                                value={selectedDivisionId}
                                onChange={(e) => setSelectedDivisionId(e.target.value)}
                                disabled={Boolean(fixedDivisionId)}
                                className="w-full rounded-lg px-4 py-3 text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:border-blue-500"
                            >
                                {!fixedDivisionId && <option value="">-- PLANTEL BASE DEL CLUB --</option>}
                                {divisions.map((division) => (
                                    <option key={division.id} value={division.id}>
                                        {division.name.toUpperCase()} ({division.season})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Plantilla rapida</p>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--color-text-secondary)]">{templatePreview}</pre>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button onClick={onClose} className="btn flex-1 h-12" type="button">Cancelar</button>
                            <button
                                onClick={processFile}
                                disabled={(!file && !rawInput.trim()) || loading}
                                className="btn btn-primary flex-[2] h-12 gap-3"
                                type="button"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {loading ? 'Importando...' : 'Iniciar importacion'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="p-6 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-center">
                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <h3 className="text-lg font-black uppercase mb-1">Carga finalizada</h3>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Se importaron <span className="text-[var(--color-text-primary)] font-bold">{result.count}</span> jugadores correctamente.
                            </p>
                        </div>

                        {result.errors.length > 0 && (
                            <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase tracking-widest">
                                    <AlertCircle className="w-3 h-3" />
                                    Errores detectados ({result.errors.length})
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    {result.errors.map((error, index) => (
                                        <p key={`${error}-${index}`} className="text-[10px] text-[var(--color-text-secondary)] font-mono">{error}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button onClick={onClose} className="btn w-full h-12 !bg-[var(--color-bg-primary)] !text-[var(--color-text-primary)] border border-[var(--color-border)] font-black" type="button">
                            Entendido
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
