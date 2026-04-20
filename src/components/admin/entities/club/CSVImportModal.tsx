'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, Upload, X } from 'lucide-react';
import { importPeopleFromCSV, type CSVRow } from '@/lib/services/csvService';
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

const PLAYER_IMPORT_HEADERS = [
    'first_name',
    'last_name',
    'id_number',
    'birth_date',
    'role',
    'position',
    'division_id',
    'jersey_number',
    'squad_role',
    'status',
    'photo_url',
    'weight',
    'height',
] as const;

const PLAYER_IMPORT_SAMPLE_ROWS = [
    ['Juan', 'Perez', '32123123', '2004-05-11', 'player', 'Wing', '', '14', 'titular', 'active', '', '82.5', '182'],
    ['Tomas', 'Gomez', '29888777', '2002-08-20', 'player', 'Apertura', '', '10', 'suplente', 'active', '', '79.3', '178'],
];

const HEADER_ALIASES: Record<string, (typeof PLAYER_IMPORT_HEADERS)[number]> = {
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
        const fullName = toOptionalString((rawRow as Record<string, unknown>).full_name) || toOptionalString((rawRow as Record<string, unknown>).name);
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
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>(fixedDivisionId || '');

    const templatePreview = useMemo(() => buildTemplateCsv(), []);

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

    const processFile = async () => {
        if (!file) return;
        setLoading(true);

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
                defval: '',
                raw: false,
            });

            if (rawRows.length === 0) {
                setResult({ count: 0, errors: ['El archivo no contiene filas para importar.'] });
                return;
            }

            const parsed = mapWorkbookRows(rawRows, selectedDivisionId || undefined);
            if (parsed.rows.length === 0) {
                setResult({ count: 0, errors: parsed.errors.length > 0 ? parsed.errors : ['No se encontraron filas validas.'] });
                return;
            }

            const response = await importPeopleFromCSV(clubId, parsed.rows);
            setResult({
                count: response.count,
                errors: [...parsed.errors, ...response.errors],
            });

            if (response.count > 0) {
                onSuccess();
            }
        } catch (error) {
            setResult({ count: 0, errors: [`Error al leer el archivo: ${String(error)}`] });
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
                            Importar jugadores
                        </h2>
                        <p className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-widest">
                            Formato masivo CSV / Excel para club y planteles
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--color-bg-hover)] rounded-full transition" type="button">
                        <X className="w-5 h-5 text-[var(--color-text-muted)]" />
                    </button>
                </div>

                {!result ? (
                    <div className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="p-6 border-2 border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-tertiary)] flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-[var(--color-bg-primary)] flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-[var(--color-text-muted)]" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-[var(--color-text-primary)]">Seleccionar archivo CSV o Excel</p>
                                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest font-mono">
                                        Encabezados nombrados, no dependemos del orden de columnas
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="csv-upload"
                                />
                                <label
                                    htmlFor="csv-upload"
                                    className="btn btn-primary cursor-pointer !h-10"
                                >
                                    {file ? file.name : 'Buscar archivo'}
                                </label>
                                <button type="button" className="btn gap-2 !h-10" onClick={handleDownloadTemplate}>
                                    <Download className="w-4 h-4" />
                                    Descargar plantilla
                                </button>
                            </div>

                            <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">Formato soportado</p>
                                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                                        Columnas recomendadas: <span className="font-mono text-[var(--color-text-primary)]">first_name</span>, <span className="font-mono text-[var(--color-text-primary)]">last_name</span>, <span className="font-mono text-[var(--color-text-primary)]">id_number</span>, <span className="font-mono text-[var(--color-text-primary)]">birth_date</span>, <span className="font-mono text-[var(--color-text-primary)]">position</span>, <span className="font-mono text-[var(--color-text-primary)]">jersey_number</span>, <span className="font-mono text-[var(--color-text-primary)]">division_id</span>.
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">Reglas</p>
                                    <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                                        <li>Se requiere nombre y apellido.</li>
                                        <li>Si no envias <span className="font-mono">division_id</span>, se registra a nivel club.</li>
                                        <li><span className="font-mono">jersey_number</span> y <span className="font-mono">squad_role</span> impactan en el plantel.</li>
                                        <li>Si cargás jugadores desde Match Center, también se crean en el club al guardar.</li>
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
                                {!fixedDivisionId && <option value="">-- CLUB GLOBAL --</option>}
                                {divisions.map((division) => (
                                    <option key={division.id} value={division.id}>
                                        {division.name.toUpperCase()} ({division.season})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Plantilla base</p>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--color-text-secondary)]">{templatePreview}</pre>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button onClick={onClose} className="btn flex-1 h-12" type="button">Cancelar</button>
                            <button
                                onClick={processFile}
                                disabled={!file || loading}
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
