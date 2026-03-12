'use server';

import { syncStaticTournaments } from '@/lib/services/tournamentImporter';
import { revalidatePath } from 'next/cache';

export async function syncTournamentsAction() {
    try {
        const results = await syncStaticTournaments();
        revalidatePath('/admin/torneos');
        return { success: true, results };
    } catch (error: unknown) {
        console.error('Error in syncTournamentsAction:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
