'use client';

import React, { useEffect, useMemo, useState } from 'react';

type LineupPlayer = {
    id: string | null;
    name: string;
    number: number;
    position: string | null;
    role: string | null;
    rating: number | null;
    isCaptain: boolean;
};

type Props = {
    open: boolean;
    matchId: string;
    homeTeamName: string;
    awayTeamName: string;
    homePlayers: LineupPlayer[];
    awayPlayers: LineupPlayer[];
    onClose: () => void;
    onSaved: () => void;
};

function formatRatingInput(value: number | null): string {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '';
}

function parseRatingInput(value: string): number | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed)) return null;
    const clamped = Math.min(10, Math.max(0, parsed));
    return Math.round(clamped * 10) / 10;
}

function emptyPlayer(nextNumber: number): LineupPlayer {
    return {
        id: null,
        name: '',
        number: nextNumber,
        position: null,
        role: null,
        rating: null,
        isCaptain: false,
    };
}

const BULK_LINE_PATTERN = /^\s*(\d{1,3})\s*[-.–—):]?\s+(.+?)\s*$/;

const BULK_NUMBERED_LINE_PATTERN = /^\s*(?:#|n(?:ro|o|um|umber)?\.?)?\s*(\d{1,3})\s*(?:[-.\u2013\u2014):]\s*|\s+)(.+?)\s*$/i;
const BULK_ROLE_VALUES = new Set(['starter', 'titular', 'starting', 'bench', 'suplente', 'substitute', 'finisher', 'reserva']);

function cleanBulkCell(value: unknown): string {
    return String(value ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

function normalizeBulkKey(value: unknown): string {
    return cleanBulkCell(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9#]/g, '');
}

function parseBulkNumber(value: unknown): number | null {
    const normalized = normalizeBulkKey(value);
    const match = /^(?:#|nro|no|num|number|dorsal|camiseta|jersey)?(\d{1,3})$/.exec(normalized);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isInteger(number) && number >= 0 && number <= 999 ? number : null;
}

function splitDelimitedLine(line: string): string[] | null {
    const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : line.includes(',') ? ',' : null;
    if (!delimiter) return null;

    const cells: string[] = [];
    let current = '';
    let quoted = false;

    for (const char of line) {
        if (char === '"') {
            quoted = !quoted;
            continue;
        }
        if (char === delimiter && !quoted) {
            cells.push(cleanBulkCell(current));
            current = '';
            continue;
        }
        current += char;
    }

    cells.push(cleanBulkCell(current));
    const nonEmpty = cells.filter(Boolean);
    return nonEmpty.length >= 2 ? nonEmpty : null;
}

function classifyBulkHeader(value: unknown): 'number' | 'name' | 'position' | 'role' | 'rating' | null {
    const key = normalizeBulkKey(value);
    if (['#', 'n', 'no', 'nro', 'num', 'numero', 'number', 'dorsal', 'camiseta', 'jersey', 'jerseynumber', 'shirt'].includes(key)) return 'number';
    if (['name', 'nombre', 'jugador', 'player', 'displayname', 'fullname', 'athlete'].includes(key)) return 'name';
    if (['position', 'posicion', 'puesto', 'pos'].includes(key)) return 'position';
    if (['role', 'rol', 'tipo', 'lineuprole', 'squadrole'].includes(key)) return 'role';
    if (['rating', 'puntaje', 'score', 'calificacion'].includes(key)) return 'rating';
    return null;
}

function looksLikeHeaderRow(cells: string[]) {
    return cells.map(classifyBulkHeader).filter(Boolean).length >= 2;
}

function buildPlayerFromParts(input: {
    number: number | null;
    name: string;
    position?: string | null;
    role?: string | null;
    rating?: number | null;
}, fallbackNumber: number): { player: LineupPlayer; nextNumber: number } | null {
    const name = cleanBulkCell(input.name);
    if (!name) return null;

    const number = input.number ?? fallbackNumber;
    const position = cleanBulkCell(input.position);
    const role = cleanBulkCell(input.role);

    return {
        player: {
            id: null,
            name,
            number,
            position: position || null,
            role: role || null,
            rating: input.rating ?? null,
            isCaptain: false,
        },
        nextNumber: Math.max(fallbackNumber, number) + 1,
    };
}

function parseDelimitedPlayer(
    cells: string[],
    headers: Array<ReturnType<typeof classifyBulkHeader>> | null,
    fallbackNumber: number,
) {
    const byHeader = (kind: NonNullable<ReturnType<typeof classifyBulkHeader>>) => {
        const index = headers?.findIndex((header) => header === kind) ?? -1;
        return index >= 0 ? cells[index] : '';
    };

    if (headers) {
        return buildPlayerFromParts({
            number: parseBulkNumber(byHeader('number')),
            name: byHeader('name'),
            position: byHeader('position'),
            role: byHeader('role'),
            rating: parseRatingInput(byHeader('rating')),
        }, fallbackNumber);
    }

    const numberIndex = cells.findIndex((cell) => parseBulkNumber(cell) !== null);
    const ratingIndex = cells.findIndex((cell, index) => {
        if (index === numberIndex) return false;
        const rating = parseRatingInput(cell);
        return rating !== null && /^[0-9]+([,.][0-9]+)?$/.test(cleanBulkCell(cell));
    });
    const nameIndex = cells.findIndex((cell, index) => {
        if (index === numberIndex || index === ratingIndex) return false;
        return /[A-Za-zÀ-ÿ]/.test(cell) && !BULK_ROLE_VALUES.has(normalizeBulkKey(cell));
    });

    if (nameIndex < 0) return null;

    const roleIndex = cells.findIndex((cell, index) => (
        index !== numberIndex &&
        index !== nameIndex &&
        index !== ratingIndex &&
        BULK_ROLE_VALUES.has(normalizeBulkKey(cell))
    ));
    const positionIndex = cells.findIndex((cell, index) => (
        index !== numberIndex &&
        index !== nameIndex &&
        index !== ratingIndex &&
        index !== roleIndex &&
        /[A-Za-zÀ-ÿ]/.test(cell)
    ));

    return buildPlayerFromParts({
        number: numberIndex >= 0 ? parseBulkNumber(cells[numberIndex]) : null,
        name: cells[nameIndex],
        position: positionIndex >= 0 ? cells[positionIndex] : null,
        role: roleIndex >= 0 ? cells[roleIndex] : null,
        rating: ratingIndex >= 0 ? parseRatingInput(cells[ratingIndex]) : null,
    }, fallbackNumber);
}

function collectJsonPlayers(value: unknown, depth = 0): Record<string, unknown>[] {
    if (depth > 5 || value == null) return [];
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectJsonPlayers(item, depth + 1));
    }
    if (typeof value !== 'object') return [];

    const record = value as Record<string, unknown>;
    const hasPlayerName = [
        record.name,
        record.displayName,
        record.fullName,
        record.full_name,
        record.player_name,
        record.PLAYER_NAME,
        record.NAME,
    ].some((candidate) => cleanBulkCell(candidate));

    if (hasPlayerName) return [record];

    return ['players', 'items', 'athletes', 'squad', 'list', 'DATA', 'data']
        .flatMap((key) => collectJsonPlayers(record[key], depth + 1));
}

function parseJsonLineup(input: string): LineupPlayer[] {
    const trimmed = input.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return [];

    try {
        const records = collectJsonPlayers(JSON.parse(trimmed));
        const result: LineupPlayer[] = [];
        let fallbackNumber = 1;

        for (const record of records) {
            const parsed = buildPlayerFromParts({
                number: parseBulkNumber(
                    record.number ??
                    record.jerseyNumber ??
                    record.jersey_number ??
                    record.shirtNumber ??
                    record.shirt_number ??
                    record.PLAYER_NUMBER ??
                    record.NUMBER,
                ),
                name:
                    cleanBulkCell(record.name) ||
                    cleanBulkCell(record.displayName) ||
                    cleanBulkCell(record.fullName) ||
                    cleanBulkCell(record.full_name) ||
                    cleanBulkCell(record.player_name) ||
                    cleanBulkCell(record.PLAYER_NAME) ||
                    cleanBulkCell(record.NAME),
                position:
                    cleanBulkCell(record.position) ||
                    cleanBulkCell(record.positionName) ||
                    cleanBulkCell(record.position_name) ||
                    cleanBulkCell(record.POSITION_NAME),
                role:
                    cleanBulkCell(record.role) ||
                    cleanBulkCell(record.lineupRole) ||
                    cleanBulkCell(record.lineup_role) ||
                    cleanBulkCell(record.squad_role),
                rating: parseRatingInput(
                    cleanBulkCell(record.rating) ||
                    cleanBulkCell(record.score) ||
                    cleanBulkCell(record.puntaje),
                ),
            }, fallbackNumber);

            if (!parsed) continue;
            result.push(parsed.player);
            fallbackNumber = parsed.nextNumber;
        }

        return result;
    } catch {
        return [];
    }
}

export function parseBulkLineup(input: string): LineupPlayer[] {
    if (!input) return [];
    const jsonPlayers = parseJsonLineup(input);
    if (jsonPlayers.length > 0) return jsonPlayers;

    const lines = input.split(/\r?\n/);
    const result: LineupPlayer[] = [];
    let fallbackNumber = 1;
    let headers: Array<ReturnType<typeof classifyBulkHeader>> | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^-{3,}$/.test(line)) continue;

        const cells = splitDelimitedLine(line);
        if (cells) {
            if (looksLikeHeaderRow(cells)) {
                headers = cells.map(classifyBulkHeader);
                continue;
            }

            const parsedDelimited = parseDelimitedPlayer(cells, headers, fallbackNumber);
            if (parsedDelimited) {
                result.push(parsedDelimited.player);
                fallbackNumber = parsedDelimited.nextNumber;
                continue;
            }
        }

        const match = BULK_NUMBERED_LINE_PATTERN.exec(line) || BULK_LINE_PATTERN.exec(line);
        let number: number;
        let name: string;

        if (match) {
            number = Number(match[1]);
            name = match[2].trim();
        } else {
            number = fallbackNumber;
            name = line;
        }

        if (!name) continue;
        if (!Number.isFinite(number) || number < 0) number = fallbackNumber;
        fallbackNumber = Math.max(fallbackNumber, number) + 1;

        const parsed = buildPlayerFromParts({ number, name }, fallbackNumber - 1);
        if (parsed) result.push(parsed.player);
    }

    return result;
}

export default function LineupRatingEditorModal({
    open,
    matchId,
    homeTeamName,
    awayTeamName,
    homePlayers,
    awayPlayers,
    onClose,
    onSaved,
}: Props) {
    const [homeDraft, setHomeDraft] = useState<LineupPlayer[]>([]);
    const [awayDraft, setAwayDraft] = useState<LineupPlayer[]>([]);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkHomeText, setBulkHomeText] = useState('');
    const [bulkAwayText, setBulkAwayText] = useState('');
    const [bulkMode, setBulkMode] = useState<'replace' | 'append'>('replace');

    useEffect(() => {
        if (!open) return;
        setHomeDraft(homePlayers.map((p) => ({ ...p })));
        setAwayDraft(awayPlayers.map((p) => ({ ...p })));
        setErrorMsg(null);
        setBulkOpen(false);
        setBulkHomeText('');
        setBulkAwayText('');
        setBulkMode('replace');
    }, [open, homePlayers, awayPlayers]);

    const startedEmpty = useMemo(
        () => homePlayers.length === 0 && awayPlayers.length === 0,
        [homePlayers, awayPlayers],
    );

    if (!open) return null;

    const setSide = (side: 'home' | 'away', next: LineupPlayer[]) => {
        if (side === 'home') setHomeDraft(next);
        else setAwayDraft(next);
    };

    const updateField = <K extends keyof LineupPlayer>(
        side: 'home' | 'away',
        index: number,
        field: K,
        value: LineupPlayer[K],
    ) => {
        const list = side === 'home' ? homeDraft : awayDraft;
        const next = list.map((player, i) => (i === index ? { ...player, [field]: value } : player));
        setSide(side, next);
    };

    const addRow = (side: 'home' | 'away') => {
        const list = side === 'home' ? homeDraft : awayDraft;
        const maxNumber = list.reduce((acc, p) => Math.max(acc, p.number || 0), 0);
        setSide(side, [...list, emptyPlayer(maxNumber + 1)]);
    };

    const removeRow = (side: 'home' | 'away', index: number) => {
        const list = side === 'home' ? homeDraft : awayDraft;
        setSide(side, list.filter((_, i) => i !== index));
    };

    const applyBulk = (side: 'home' | 'away') => {
        const text = side === 'home' ? bulkHomeText : bulkAwayText;
        const parsed = parseBulkLineup(text);
        if (parsed.length === 0) {
            setErrorMsg('No se pudieron leer jugadores. Usá formato "1- Nombre Apellido" por línea.');
            return;
        }
        setErrorMsg(null);
        const current = side === 'home' ? homeDraft : awayDraft;
        if (bulkMode === 'replace') {
            setSide(side, parsed);
        } else {
            const maxNumber = current.reduce((acc, p) => Math.max(acc, p.number || 0), 0);
            const reNumbered = parsed.map((p, i) => ({ ...p, number: p.number > 0 ? p.number : maxNumber + i + 1 }));
            setSide(side, [...current, ...reNumbered]);
        }
        if (side === 'home') setBulkHomeText('');
        else setBulkAwayText('');
    };

    const handleSave = async () => {
        setSaving(true);
        setErrorMsg(null);
        try {
            const cleanSide = (side: LineupPlayer[]) =>
                side
                    .filter((p) => p.name.trim().length > 0)
                    .map((p) => ({
                        id: p.id ?? null,
                        number: p.number,
                        name: p.name.trim(),
                        position: p.position ?? null,
                        role: p.role ?? null,
                        rating: p.rating,
                        isCaptain: p.isCaptain,
                    }));

            const payload = {
                lineups: {
                    home: cleanSide(homeDraft),
                    away: cleanSide(awayDraft),
                },
            };

            if (payload.lineups.home.length === 0 && payload.lineups.away.length === 0) {
                throw new Error('Cargá al menos un jugador antes de guardar.');
            }

            const res = await fetch(`/api/admin/super/matches/${matchId}/lineup-ratings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || `Error ${res.status}`);
            }

            onSaved();
            onClose();
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar.');
        } finally {
            setSaving(false);
        }
    };

    const renderTeamColumn = (
        side: 'home' | 'away',
        teamName: string,
        players: LineupPlayer[],
    ) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            }}>
                <div style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--color-text-secondary, #9aa)',
                }}>
                    {teamName}
                </div>
                <button
                    type="button"
                    onClick={() => addRow(side)}
                    disabled={saving}
                    style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 700,
                        background: 'transparent',
                        border: '1px solid var(--color-accent, #10b981)',
                        color: 'var(--color-accent, #10b981)',
                        borderRadius: 6, cursor: 'pointer',
                    }}
                >
                    + Agregar
                </button>
            </div>
            <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.1))',
                borderRadius: 12, padding: 12,
                display: 'flex', flexDirection: 'column', gap: 6,
                maxHeight: 'min(60vh, 480px)', overflowY: 'auto',
            }}>
                {players.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--color-text-tertiary, #888)', padding: 8 }}>
                        Sin jugadores. Usá &quot;+ Agregar&quot; para empezar.
                    </div>
                ) : players.map((player, index) => (
                    <div key={`${side}-${index}`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '52px 1fr 80px 28px',
                            alignItems: 'center', gap: 8,
                            padding: '6px 6px', borderRadius: 6,
                            background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}>
                        <input
                            type="number"
                            min={0}
                            max={999}
                            value={player.number || ''}
                            onChange={(e) => updateField(side, index, 'number', Number(e.target.value) || 0)}
                            style={{
                                width: '100%', padding: '6px 4px',
                                fontFamily: 'var(--font-mono, monospace)',
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.12))',
                                color: 'var(--color-accent, #10b981)',
                                borderRadius: 4, fontSize: 12, textAlign: 'center', fontWeight: 700,
                            }}
                            aria-label="Número de camiseta"
                        />
                        <input
                            type="text"
                            value={player.name}
                            placeholder="Nombre del jugador"
                            onChange={(e) => updateField(side, index, 'name', e.target.value)}
                            style={{
                                width: '100%', padding: '6px 8px',
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.12))',
                                color: 'var(--color-text-primary, #eee)',
                                borderRadius: 4, fontSize: 13,
                            }}
                            aria-label="Nombre"
                        />
                        <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.1}
                            inputMode="decimal"
                            value={formatRatingInput(player.rating)}
                            placeholder="—"
                            onChange={(e) => updateField(side, index, 'rating', parseRatingInput(e.target.value))}
                            disabled={!player.name.trim()}
                            style={{
                                width: '100%', padding: '6px 4px',
                                fontFamily: 'var(--font-mono, monospace)',
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.12))',
                                color: 'var(--color-text-primary, #eee)',
                                borderRadius: 4, fontSize: 12, textAlign: 'center',
                                opacity: player.name.trim() ? 1 : 0.4,
                            }}
                            aria-label={`Puntaje de ${player.name || 'jugador'}`}
                        />
                        <button
                            type="button"
                            onClick={() => removeRow(side, index)}
                            disabled={saving}
                            aria-label="Quitar jugador"
                            style={{
                                background: 'transparent', border: 'none',
                                color: 'var(--color-text-tertiary, #888)', cursor: 'pointer',
                                fontSize: 16, padding: 0, lineHeight: 1,
                            }}
                        >×</button>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Editar puntajes de alineación"
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
        >
            <div style={{
                width: 'min(960px, 100%)',
                background: 'var(--color-bg-secondary, #111)',
                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.1))',
                borderRadius: 16, padding: 20,
                display: 'flex', flexDirection: 'column', gap: 16,
                maxHeight: '90vh', overflow: 'hidden',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #eee)' }}>
                            {startedEmpty ? 'Cargar alineación y puntajes' : 'Editar puntajes de alineación'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #888)', marginTop: 4 }}>
                            Solo administradores globales. Los cambios sobreescriben cualquier dato del proveedor.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => setBulkOpen((v) => !v)}
                            disabled={saving}
                            style={{
                                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                background: bulkOpen ? 'var(--color-accent, #10b981)' : 'transparent',
                                border: '1px solid var(--color-accent, #10b981)',
                                color: bulkOpen ? '#fff' : 'var(--color-accent, #10b981)',
                                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
                            }}
                        >
                            Importar lista
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            style={{
                                background: 'transparent', border: 'none',
                                color: 'var(--color-text-tertiary, #888)', cursor: 'pointer',
                                fontSize: 20, padding: 4,
                            }}
                            aria-label="Cerrar"
                        >×</button>
                    </div>
                </div>

                {bulkOpen && (
                    <div style={{
                        padding: 12, borderRadius: 10,
                        background: 'rgba(16,185,129,0.06)',
                        border: '1px solid rgba(16,185,129,0.25)',
                        display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #aaa)' }}>
                                Pegá una lista por línea con formato <code style={{ color: 'var(--color-accent, #10b981)' }}>1- Nombre Apellido</code>.
                                También acepta <code style={{ color: 'var(--color-accent, #10b981)' }}>1 Nombre</code>, <code style={{ color: 'var(--color-accent, #10b981)' }}>1. Nombre</code> y <code style={{ color: 'var(--color-accent, #10b981)' }}>1 - Nombre</code>.
                            </div>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--color-text-tertiary, #888)' }}>
                                Modo:
                                <select
                                    value={bulkMode}
                                    onChange={(e) => setBulkMode(e.target.value as 'replace' | 'append')}
                                    style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        color: 'var(--color-text-primary, #eee)',
                                        border: '1px solid var(--color-glass-border, rgba(255,255,255,0.12))',
                                        borderRadius: 4, padding: '3px 6px', fontSize: 11,
                                    }}
                                >
                                    <option value="replace">Reemplazar</option>
                                    <option value="append">Agregar</option>
                                </select>
                            </label>
                        </div>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12,
                        }}>
                            {(['home', 'away'] as const).map((side) => {
                                const label = side === 'home' ? homeTeamName : awayTeamName;
                                const value = side === 'home' ? bulkHomeText : bulkAwayText;
                                const setValue = side === 'home' ? setBulkHomeText : setBulkAwayText;
                                return (
                                    <div key={side} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{
                                            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                                            textTransform: 'uppercase', color: 'var(--color-text-secondary, #9aa)',
                                        }}>{label}</div>
                                        <textarea
                                            value={value}
                                            onChange={(e) => setValue(e.target.value)}
                                            placeholder={'1- Juan Perez\n2- Pedro Garcia\n3- ...'}
                                            rows={6}
                                            style={{
                                                width: '100%', padding: 8,
                                                fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
                                                background: 'rgba(0,0,0,0.4)',
                                                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.12))',
                                                color: 'var(--color-text-primary, #eee)',
                                                borderRadius: 6, resize: 'vertical', minHeight: 100,
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => applyBulk(side)}
                                            disabled={saving || !value.trim()}
                                            style={{
                                                alignSelf: 'flex-end',
                                                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                background: 'var(--color-accent, #10b981)',
                                                border: 'none', color: '#fff', cursor: 'pointer',
                                                opacity: saving || !value.trim() ? 0.5 : 1,
                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                            }}
                                        >
                                            Aplicar a {label}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: 16, overflow: 'auto', minHeight: 0,
                }}>
                    {renderTeamColumn('home', homeTeamName, homeDraft)}
                    {renderTeamColumn('away', awayTeamName, awayDraft)}
                </div>

                {errorMsg && (
                    <div style={{
                        padding: '8px 12px', borderRadius: 6,
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#fca5a5', fontSize: 13,
                    }}>
                        {errorMsg}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '8px 16px', borderRadius: 6,
                            background: 'transparent',
                            border: '1px solid var(--color-glass-border, rgba(255,255,255,0.1))',
                            color: 'var(--color-text-primary, #eee)', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600,
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '8px 16px', borderRadius: 6,
                            background: 'var(--color-accent, #10b981)',
                            border: 'none', color: '#fff', cursor: 'pointer',
                            fontSize: 13, fontWeight: 700,
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
