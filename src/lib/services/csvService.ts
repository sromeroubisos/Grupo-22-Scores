'use server';

import { addPersonToClub } from './personService';

export interface CSVRow {
    first_name: string;
    last_name: string;
    id_number?: string;
    birth_date?: string;
    role: string;
    position?: string;
    division_id?: string;
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
                status: 'active'
            });

            if (res.success) {
                importedCount++;
            } else {
                errors.push(`Error en ${row.first_name} ${row.last_name}: ${res.error}`);
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
