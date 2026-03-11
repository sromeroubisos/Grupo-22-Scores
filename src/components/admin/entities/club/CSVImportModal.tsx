'use client';

import { useState } from 'react';
import { X, Upload, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { importPeopleFromCSV, CSVRow } from '@/lib/services/csvService';
import { Division } from '@/lib/services/divisionService';

interface Props {
    clubId: string;
    divisions: Division[];
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    fixedDivisionId?: string;
}

export function CSVImportModal({ clubId, divisions, isOpen, onClose, onSuccess, fixedDivisionId }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ count: number; errors: string[] } | null>(null);
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>(fixedDivisionId || '');

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const processCSV = async () => {
        if (!file) return;
        setLoading(true);

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(l => l.trim());

            // Asumimos header: nombre,apellido,documento,fecha_nacimiento,rol,posicion
            // Ignoramos la primera línea si parece ser un header
            const startIdx = (lines[0].toLowerCase().includes('nombre') || lines[0].toLowerCase().includes('name')) ? 1 : 0;

            const rows: CSVRow[] = lines.slice(startIdx).map(line => {
                const [first, last, id, birth, role, pos] = line.split(',').map(s => s.trim());
                return {
                    first_name: first,
                    last_name: last,
                    id_number: id,
                    birth_date: birth,
                    role: role || 'player',
                    position: pos,
                    division_id: selectedDivisionId || undefined
                };
            });

            const res = await importPeopleFromCSV(clubId, rows);
            setResult({ count: res.count, errors: res.errors });

            if (res.count > 0) {
                onSuccess();
            }
        } catch (err) {
            alert('Error al leer el archivo: ' + String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="card scale-in w-full max-w-lg p-8 shadow-2xl overflow-hidden border-blue-500/20">
                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Upload className="w-6 h-6 text-blue-500" />
                            Importar masivamente
                        </h2>
                        <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Carga de planillas via CSV / Excel</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
                        <X className="w-5 h-5 text-neutral-500" />
                    </button>
                </div>

                {!result ? (
                    <div className="space-y-6">
                        <div className="p-6 border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/50 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-neutral-500" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-white">Seleccionar archivo CSV o Excel</p>
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono">
                                    Formato: nombre, apellido, id, fecha, rol, posicion
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
                                {file ? file.name : 'Buscar Archivo'}
                            </label>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                                {fixedDivisionId ? 'Plantel de Destino' : 'Asignar a Plantel (Opcional)'}
                            </label>
                            <select
                                value={selectedDivisionId}
                                onChange={e => setSelectedDivisionId(e.target.value)}
                                disabled={!!fixedDivisionId}
                                className="w-full bg-neutral-900 border border-neutral-800 focus:border-blue-500 rounded-lg px-4 py-3 text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {!fixedDivisionId && <option value="">-- CLUB GLOBAL --</option>}
                                {divisions.map(d => (
                                    <option key={d.id} value={d.id}>{d.name.toUpperCase()} ({d.season})</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button onClick={onClose} className="btn flex-1 h-12">Cancelar</button>
                            <button
                                onClick={processCSV}
                                disabled={!file || loading}
                                className="btn btn-primary flex-[2] h-12 gap-3"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {loading ? 'Importando...' : 'Iniciar Importación'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 text-center">
                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <h3 className="text-lg font-black uppercase mb-1">Carga Finalizada</h3>
                            <p className="text-sm text-neutral-400">
                                Se han importado <span className="text-white font-bold">{result.count}</span> registros exitosamente.
                            </p>
                        </div>

                        {result.errors.length > 0 && (
                            <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase tracking-widest">
                                    <AlertCircle className="w-3 h-3" />
                                    Errores detectados ({result.errors.length})
                                </div>
                                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                    {result.errors.map((error, i) => (
                                        <p key={i} className="text-[10px] text-neutral-500 font-mono">{error}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button onClick={onClose} className="btn w-full h-12 !bg-white !text-black border-none font-black">
                            ENTENDIDO
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
