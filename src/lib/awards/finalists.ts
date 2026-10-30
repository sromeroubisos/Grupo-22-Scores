// La terna sale de los MÁS POSTULADOS: puro, sin base ni reloj, para poder
// probarlo. El apoyo de un candidato es la cantidad de usuarios DISTINTOS que
// lo postularon (la unicidad de la tabla ya evita que uno cuente dos veces,
// pero el conteo no depende de eso).

export interface NominationRow {
    userId: string;
    subjectKey: string;
    subjectName: string;
    personId: string | null;
    clubId: string | null;
    clubName: string | null;
    status: string;
    createdAt: string;
    /** El motivo que escribió quien postuló. */
    note?: string;
}

export interface Candidate {
    subjectKey: string;
    subjectName: string;
    personId: string | null;
    clubId: string | null;
    clubName: string | null;
    support: number;
    /** Hasta tres motivos distintos, para que quien revisa entienda la postulación. */
    notes: string[];
}

/** Clave estable para un nombre escrito a mano: sin tildes, mayúsculas ni espacios de más. */
export function normalizeName(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function subjectKeyFor(input: { personId?: string | null; clubId?: string | null; name: string; club?: boolean }): string {
    if (input.club && input.clubId) return `c:${input.clubId}`;
    if (input.personId) return `p:${input.personId}`;
    return `n:${normalizeName(input.name)}|${input.clubId ?? ''}`;
}

/**
 * Agrupa las postulaciones por candidato y ordena por apoyo. Empate: la
 * postulación más vieja primero, después el nombre. Las rechazadas no cuentan.
 */
export function rankCandidates(rows: readonly NominationRow[]): Candidate[] {
    const groups = new Map<string, { rows: NominationRow[]; users: Set<string>; first: string }>();
    for (const row of rows) {
        if (row.status === 'rejected') continue;
        const group = groups.get(row.subjectKey) ?? { rows: [], users: new Set<string>(), first: row.createdAt };
        group.rows.push(row);
        group.users.add(row.userId);
        if (row.createdAt < group.first) group.first = row.createdAt;
        groups.set(row.subjectKey, group);
    }

    const ranked = [...groups.entries()].map(([subjectKey, group]) => {
        // Si alguien lo cargó con id de la base, ese dato manda sobre el texto libre.
        const best = group.rows.find((row) => row.personId || row.clubId) ?? group.rows[0];
        return {
            candidate: {
                subjectKey,
                subjectName: best.subjectName,
                personId: best.personId,
                clubId: best.clubId,
                clubName: best.clubName,
                support: group.users.size,
                notes: [...new Set(group.rows.map((row) => (row.note ?? '').trim()).filter(Boolean))].slice(0, 3),
            } satisfies Candidate,
            first: group.first,
        };
    });

    ranked.sort((a, b) => (
        b.candidate.support - a.candidate.support
        || a.first.localeCompare(b.first)
        || a.candidate.subjectName.localeCompare(b.candidate.subjectName)
    ));
    return ranked.map((entry) => entry.candidate);
}

export function pickFinalists(rows: readonly NominationRow[], limit: number): Candidate[] {
    return rankCandidates(rows).slice(0, limit);
}

/** Porcentajes enteros que suman 100 (resto mayor). Sin votos: todos en 0. */
export function votePercentages(counts: readonly number[]): number[] {
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return counts.map(() => 0);
    const raw = counts.map((value) => (value / total) * 100);
    const floors = raw.map((value) => Math.floor(value));
    let missing = 100 - floors.reduce((sum, value) => sum + value, 0);
    const order = raw
        .map((value, index) => ({ index, rest: value - Math.floor(value) }))
        .sort((a, b) => b.rest - a.rest || a.index - b.index);
    for (const { index } of order) {
        if (missing <= 0) break;
        floors[index] += 1;
        missing -= 1;
    }
    return floors;
}
