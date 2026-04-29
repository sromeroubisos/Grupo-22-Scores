'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, Loader2, Upload, X } from 'lucide-react';
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
        <div className="csv-modal-overlay">
            <section className="csv-monolith">
                {/* HEADER */}
                <header className="csv-monolith-header">
                    <div className="csv-title-group">
                        <h1>Importacion Masiva</h1>
                        <p>Agrega multiples jugadores al sistema mediante sincronizacion de datos planos.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="csv-monolith-close"
                        aria-label="Cerrar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </header>

                {/* CONTENT */}
                {!result ? conflicts.length > 0 ? (
                    <>
                        <div className="csv-conflict-banner">
                            <div className="csv-conflict-banner-title">Revision de homonimos</div>
                            <p className="csv-conflict-banner-desc">
                                Encontramos jugadores con el mismo nombre en la base. Decide fila por fila si corresponde reutilizar una ficha existente o crear una nueva.
                            </p>
                        </div>

                        <div className="csv-conflict-scroll">
                            {conflicts.map((conflict) => {
                                const decision = conflictDecisions[conflict.rowIndex];
                                const rowLabel = `${conflict.row.first_name} ${conflict.row.last_name}`.trim();

                                return (
                                    <div key={`${conflict.rowIndex}-${rowLabel}`} className="csv-conflict-card">
                                        <div className="csv-conflict-row-header">
                                            <span className="csv-conflict-row-badge">
                                                Fila {conflict.rowIndex + 2}
                                            </span>
                                            <span className="csv-conflict-row-name">
                                                {rowLabel}
                                            </span>
                                        </div>
                                        <p className="csv-conflict-row-meta" style={{ marginBottom: 16 }}>
                                            {conflict.row.birth_date ? `Nacimiento: ${conflict.row.birth_date}` : 'Sin fecha de nacimiento'}
                                            {conflict.row.position ? ` / Posicion: ${conflict.row.position}` : ''}
                                            {conflict.row.id_number ? ` / DNI: ${conflict.row.id_number}` : ''}
                                        </p>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {conflict.matches.map((match) => {
                                                const isSelected = decision?.mode === 'reuse' && decision.personId === match.person_id;

                                                return (
                                                    <div key={match.person_id} className={`csv-conflict-match ${isSelected ? 'selected' : ''}`}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                            <div>
                                                                <div className="csv-conflict-match-name">{match.full_name}</div>
                                                                <div className="csv-conflict-match-meta">
                                                                    {match.birth_date ? `Nacimiento: ${match.birth_date}` : 'Sin fecha de nacimiento'}
                                                                    {match.id_number ? ` / DNI: ${match.id_number}` : ' / Sin DNI'}
                                                                </div>
                                                                <div className="csv-conflict-tags">
                                                                    {match.already_linked_to_club ? (
                                                                        <span className="csv-conflict-tag csv-conflict-tag-linked">
                                                                            Ya vinculado a este club
                                                                        </span>
                                                                    ) : null}
                                                                    {match.club_links.map((link) => (
                                                                        <span key={`${match.person_id}-${link.club_id}-${link.division_id || 'base'}-${link.role || 'role'}`} className="csv-conflict-tag">
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
                                                                className={`csv-btn-small ${isSelected ? 'selected' : ''}`}
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
                                                className={`csv-btn-small ${decision?.mode === 'create' ? 'selected-amber' : ''}`}
                                            >
                                                Crear una ficha nueva para esta fila
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {pendingParseErrors.length > 0 && (
                                <div className="csv-parse-warn">
                                    <div className="csv-parse-warn-title">
                                        <AlertCircle className="w-3 h-3" />
                                        Advertencias de parseo ({pendingParseErrors.length})
                                    </div>
                                    <div style={{ maxHeight: 96, overflowY: 'auto' }}>
                                        {pendingParseErrors.map((error, index) => (
                                            <div key={`${error}-${index}`} className="csv-parse-warn-item">{error}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="csv-footer">
                            <button
                                type="button"
                                onClick={() => {
                                    setConflicts([]);
                                    setPendingRows([]);
                                    setPendingParseErrors([]);
                                    setConflictDecisions({});
                                }}
                                className="csv-btn-cancel"
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleConflictImport}
                                disabled={!allConflictsResolved || loading}
                                className="csv-btn-primary"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {loading ? 'Importando...' : 'Continuar importacion'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="csv-content-grid">
                            {/* MAIN SLAB */}
                            <div className="csv-main-section">
                                <div className="csv-input-block">
                                    <div className="csv-label-row">
                                        <label>Pegar Datos de Origen</label>
                                        <span className="csv-example-hint">nombre, apellido, fecha_nacimiento, posicion, peso</span>
                                    </div>
                                    <textarea
                                        autoFocus
                                        value={rawInput}
                                        onChange={(e) => setRawInput(e.target.value)}
                                        className="csv-monolith-textarea"
                                        placeholder={`Pega aqui las filas de tu Excel o CSV...\nJuan, Perez, 1995-03-20, Delantero, 78`}
                                    />
                                    <div className="csv-action-row">
                                        <input
                                            type="file"
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleFileChange}
                                            className="hidden"
                                            id="csv-upload"
                                        />
                                        <label htmlFor="csv-upload" className="csv-btn-ghost cursor-pointer">
                                            <Upload className="w-3.5 h-3.5" />
                                            {file ? file.name : 'Elegir Archivo'}
                                        </label>
                                        <button type="button" className="csv-btn-ghost" onClick={handleDownloadTemplate}>
                                            <Download className="w-3.5 h-3.5" />
                                            Descargar Plantilla
                                        </button>
                                    </div>
                                </div>

                                <div className="csv-template-block">
                                    <div className="csv-template-label">Plantilla rapida</div>
                                    <pre className="csv-template-pre">{templatePreview}</pre>
                                </div>
                            </div>

                            {/* SIDEBAR */}
                            <aside className="csv-sidebar">
                                <div className="csv-help-group">
                                    <h3>Estructura y Reglas</h3>
                                    <ul className="csv-help-list">
                                        <li><strong>Nombre y Apellido</strong> son estrictamente obligatorios para la creacion.</li>
                                        <li>Formato de fecha recomendado: <code style={{ color: '#fff' }}>AAAA-MM-DD</code>.</li>
                                        <li>Si el <code style={{ color: '#fff' }}>division_id</code> es omitido, el sistema asignara al plantel base.</li>
                                    </ul>
                                </div>

                                <div className="csv-help-group">
                                    <h3>Campos Avanzados</h3>
                                    <div className="csv-tag-list">
                                        <span className="csv-tag">jersey_number</span>
                                        <span className="csv-tag">squad_role</span>
                                        <span className="csv-tag">division_id</span>
                                        <span className="csv-tag">photo_url</span>
                                    </div>
                                </div>

                                <div className="csv-config-block">
                                    <label>Asignacion por defecto</label>
                                    <select
                                        value={selectedDivisionId}
                                        onChange={(e) => setSelectedDivisionId(e.target.value)}
                                        disabled={Boolean(fixedDivisionId)}
                                        className="csv-monolith-select"
                                    >
                                        {!fixedDivisionId && <option value="">Plantel base del club</option>}
                                        {divisions.map((division) => (
                                            <option key={division.id} value={division.id}>
                                                {division.name.toUpperCase()} ({division.season})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </aside>
                        </div>

                        <footer className="csv-footer">
                            <button type="button" onClick={onClose} className="csv-btn-cancel">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={processFile}
                                disabled={(!file && !rawInput.trim()) || loading}
                                className="csv-btn-primary"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {loading ? 'Importando...' : 'Iniciar Importacion'}
                            </button>
                        </footer>
                    </>
                ) : (
                    <>
                        <div className="csv-result-center">
                            <CheckCircle2 className="w-12 h-12 text-green-500" />
                            <div className="csv-result-title">Carga finalizada</div>
                            <p className="csv-result-desc">
                                Se importaron <span className="csv-result-count">{result.count}</span> jugadores correctamente.
                            </p>

                            {result.errors.length > 0 && (
                                <div className="csv-error-box">
                                    <div className="csv-error-box-title">
                                        <AlertCircle className="w-3 h-3" />
                                        Errores detectados ({result.errors.length})
                                    </div>
                                    <div style={{ maxHeight: 192, overflowY: 'auto' }}>
                                        {result.errors.map((error, index) => (
                                            <div key={`${error}-${index}`} className="csv-error-item">{error}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <footer className="csv-footer" style={{ justifyContent: 'center' }}>
                            <button type="button" onClick={onClose} className="csv-btn-primary">
                                Entendido
                            </button>
                        </footer>
                    </>
                )}
            </section>
        </div>
    );
}
