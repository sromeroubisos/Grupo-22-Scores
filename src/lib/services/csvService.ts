'use server';

import {
    addPersonToClub,
    findPotentialPersonIdentityMatches,
    type PersonIdentityMatch,
} from './personService';

export interface CSVRow {
    first_name: string;
    last_name: string;
    id_number?: string;
    birth_date?: string;
    role: string;
    position?: string;
    division_id?: string;
    jersey_number?: number;
    squad_role?: string;
    status?: string;
    photo_url?: string;
    weight?: number;
    height?: number;
    existing_person_id?: string;
    force_create_new?: boolean;
}

export interface CSVImportConflict {
    rowIndex: number;
    row: CSVRow;
    matches: PersonIdentityMatch[];
}

function normalizeFullName(row: Pick<CSVRow, 'first_name' | 'last_name'>) {
    return `${String(row.first_name || '').trim().toLowerCase()}::${String(row.last_name || '').trim().toLowerCase()}`;
}

export async function previewPeopleImportConflicts(clubId: string, rows: CSVRow[]): Promise<CSVImportConflict[]> {
    const conflicts: CSVImportConflict[] = [];
    const cache = new Map<string, PersonIdentityMatch[]>();

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const firstName = String(row.first_name || '').trim();
        const lastName = String(row.last_name || '').trim();
        if (!firstName || !lastName || row.existing_person_id || row.force_create_new) {
            continue;
        }

        const cacheKey = normalizeFullName(row);
        let matches = cache.get(cacheKey);
        if (!matches) {
            matches = await findPotentialPersonIdentityMatches(clubId, {
                first_name: firstName,
                last_name: lastName,
            });
            cache.set(cacheKey, matches);
        }

        if (matches.length > 0) {
            conflicts.push({
                rowIndex: index,
                row,
                matches,
            });
        }
    }

    return conflicts;
}

/**
 * Parsea un archivo CSV y carga los datos masivamente en Supabase.
 * Se espera un formato: nombre, apellido, documento, fecha_nacimiento, rol, posicion
 */
export async function importPeopleFromCSV(clubId: string, rows: CSVRow[]): Promise<{
    success: boolean;
    count: number;
    errors: string[]
}> {
    let importedCount = 0;
    const errors: string[] = [];

    // Importamos en serie para evitar rate limits si hay muchos, aunque paralelo sería más rápido.
    // Para simplificar y dar feedback, lo hacemos uno por uno.
    for (const row of rows) {
        try {
            const res = await addPersonToClub(clubId, {
                first_name: row.first_name,
                last_name: row.last_name,
                id_number: row.id_number,
                birth_date: row.birth_date,
                role: row.role || 'player',
                position: row.position,
                division_id: row.division_id,
                status: row.status || 'active',
                jersey_number: row.jersey_number,
                squad_role: row.squad_role,
                photo_url: row.photo_url,
                weight: row.weight,
                height: row.height,
                existing_person_id: row.existing_person_id,
                force_create_new: row.force_create_new,
            });

            if (res.success) {
                importedCount++;
            } else {
                errors.push(
                    res.code === 'identity_confirmation_required'
                        ? `Error en ${row.first_name} ${row.last_name}: requiere confirmacion manual por homonimo.`
                        : `Error en ${row.first_name} ${row.last_name}: ${res.error}`
                );
            }
        } catch (err) {
            errors.push(`Excepción en ${row.first_name} ${row.last_name}: ${String(err)}`);
        }
    }

    return {
        success: errors.length === 0 || importedCount > 0,
        count: importedCount,
        errors
    };
}
