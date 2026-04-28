import Link from 'next/link';
import styles from '../../page.module.css';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TOURNAMENT_REVIEW_STATUS } from '@/lib/tournamentReview';
import {
    linkPendingTournament,
    publishPendingTournament,
    rejectPendingTournament,
    savePendingTournament,
} from './actions';

export const dynamic = 'force-dynamic';

type PendingTournamentRow = {
    id: string;
    name: string;
    display_name: string | null;
    season_id: string | null;
    sport_id: string | null;
    country_id: string | null;
    union_id: string | null;
    category: string | null;
    age_grade: string | null;
    format: string | null;
    status: string | null;
    is_visible: boolean | null;
    review_status: string | null;
    review_notes: string | null;
    created_at: string | null;
    created_by_user_id: string | null;
    created_by_club_id: string | null;
    linked_official_tournament_id: string | null;
};

type LookupRow = {
    id: string;
    name: string;
};

type OfficialTournamentOption = LookupRow & {
    display_name: string | null;
    season_id: string | null;
    status: string | null;
};

type ClubLookupRow = LookupRow & {
    short_name: string | null;
};

type UserLookupRow = {
    id: string;
    email: string | null;
    name: string | null;
};

function createdDate(value: string | null) {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

function officialTournamentLabel(tournament: OfficialTournamentOption) {
    const name = tournament.display_name || tournament.name;
    const season = tournament.season_id ? ` · ${tournament.season_id}` : '';
    const status = tournament.status ? ` · ${tournament.status}` : '';
    return `${name}${season}${status}`;
}

export default async function PendingTournamentsPage() {
    const supabase = await createClient();
    await requireGlobalAdminContext(supabase);

    const admin = createAdminClient();

    const [
        pendingResult,
        officialResult,
        sportsResult,
        unionsResult,
        countriesResult,
    ] = await Promise.all([
        admin
            .from('tournaments')
            .select('id, name, display_name, season_id, sport_id, country_id, union_id, category, age_grade, format, status, is_visible, review_status, review_notes, created_at, created_by_user_id, created_by_club_id, linked_official_tournament_id')
            .eq('review_status', TOURNAMENT_REVIEW_STATUS.pendingLink)
            .order('created_at', { ascending: false }),
        admin
            .from('tournaments')
            .select('id, name, display_name, season_id, status')
            .neq('review_status', TOURNAMENT_REVIEW_STATUS.pendingLink)
            .in('status', ['active', 'published'])
            .order('name', { ascending: true })
            .limit(500),
        admin
            .from('sports')
            .select('id, name')
            .order('priority', { ascending: true }),
        admin
            .from('unions')
            .select('id, name')
            .order('name', { ascending: true }),
        admin
            .from('countries')
            .select('id, name')
            .order('name', { ascending: true }),
    ]);

    if (pendingResult.error) throw new Error(pendingResult.error.message);
    if (officialResult.error) throw new Error(officialResult.error.message);
    if (sportsResult.error) throw new Error(sportsResult.error.message);
    if (unionsResult.error) throw new Error(unionsResult.error.message);
    if (countriesResult.error) throw new Error(countriesResult.error.message);

    const pending = (pendingResult.data || []) as PendingTournamentRow[];
    const officialTournaments = (officialResult.data || []) as OfficialTournamentOption[];
    const sports = (sportsResult.data || []) as LookupRow[];
    const unions = (unionsResult.data || []) as LookupRow[];
    const countries = (countriesResult.data || []) as LookupRow[];

    const clubIds = Array.from(new Set(pending.map((row) => row.created_by_club_id).filter((id): id is string => Boolean(id))));
    const userIds = Array.from(new Set(pending.map((row) => row.created_by_user_id).filter((id): id is string => Boolean(id))));

    const [clubsResult, usersResult] = await Promise.all([
        clubIds.length > 0
            ? admin.from('clubs').select('id, name, short_name').in('id', clubIds)
            : Promise.resolve({ data: [], error: null }),
        userIds.length > 0
            ? admin.from('users').select('id, email, name').in('id', userIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (clubsResult.error) throw new Error(clubsResult.error.message);
    if (usersResult.error) throw new Error(usersResult.error.message);

    const clubsById = new Map(((clubsResult.data || []) as ClubLookupRow[]).map((club) => [club.id, club]));
    const usersById = new Map(((usersResult.data || []) as UserLookupRow[]).map((user) => [user.id, user]));

    return (
        <>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Torneos pendientes de vinculacion</h1>
                    <p className={styles.pageSubtitle}>
                        Revisa torneos creados por Club Admins antes de publicarlos o vincularlos con un torneo oficial.
                    </p>
                </div>
                <div className={styles.headerRight}>
                    <Link href="/admin/super/torneos" className={styles.viewSiteBtn}>
                        Volver a torneos
                    </Link>
                </div>
            </header>

            <main className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <div>
                            <h2 className={styles.sectionTitle}>Pendientes</h2>
                            <p className={styles.pageSubtitle}>
                                {pending.length === 1 ? '1 torneo espera revision.' : `${pending.length} torneos esperan revision.`}
                            </p>
                        </div>
                        <span className={`${styles.pill} ${pending.length > 0 ? styles.pillWarning : styles.pillSuccess}`}>
                            {pending.length > 0 ? 'Requiere accion' : 'Sin pendientes'}
                        </span>
                    </div>

                    {pending.length === 0 ? (
                        <div className={styles.card} style={{ padding: 24 }}>
                            No hay torneos pendientes de vinculacion en este momento.
                        </div>
                    ) : (
                        <div className={styles.cardList}>
                            {pending.map((tournament) => {
                                const club = tournament.created_by_club_id ? clubsById.get(tournament.created_by_club_id) : null;
                                const creator = tournament.created_by_user_id ? usersById.get(tournament.created_by_user_id) : null;

                                return (
                                    <form key={tournament.id} action={savePendingTournament} className={styles.card}>
                                        <input type="hidden" name="id" value={tournament.id} />

                                        <div className={styles.cardHeader}>
                                            <div>
                                                <h3 className={styles.cardTitle}>{tournament.display_name || tournament.name}</h3>
                                                <p className={styles.pageSubtitle}>
                                                    Creado por {creator?.name || creator?.email || 'usuario sin identificar'} · {club?.short_name || club?.name || 'club sin identificar'} · {createdDate(tournament.created_at)}
                                                </p>
                                            </div>
                                            <span className={`${styles.badge} ${styles.badgeConflict}`}>
                                                Pendiente
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gap: 16, padding: 20 }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Nombre oficial</span>
                                                    <input name="name" defaultValue={tournament.name} className={styles.filterInput} style={{ width: '100%' }} />
                                                </label>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Nombre visible</span>
                                                    <input name="displayName" defaultValue={tournament.display_name || ''} className={styles.filterInput} style={{ width: '100%' }} />
                                                </label>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Temporada</span>
                                                    <input name="seasonId" defaultValue={tournament.season_id || ''} className={styles.filterInput} style={{ width: '100%' }} />
                                                </label>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Deporte</span>
                                                    <select name="sportId" defaultValue={tournament.sport_id || ''} className={styles.filterInput} style={{ width: '100%' }}>
                                                        <option value="">Sin deporte</option>
                                                        {sports.map((sport) => (
                                                            <option key={sport.id} value={sport.id}>{sport.name}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Pais</span>
                                                    <select name="countryId" defaultValue={tournament.country_id || ''} className={styles.filterInput} style={{ width: '100%' }}>
                                                        <option value="">Sin pais</option>
                                                        {countries.map((country) => (
                                                            <option key={country.id} value={country.id}>{country.name}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Union</span>
                                                    <select name="unionId" defaultValue={tournament.union_id || ''} className={styles.filterInput} style={{ width: '100%' }}>
                                                        <option value="">Sin union</option>
                                                        {unions.map((union) => (
                                                            <option key={union.id} value={union.id}>{union.name}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Categoria</span>
                                                    <input name="category" defaultValue={tournament.category || ''} className={styles.filterInput} style={{ width: '100%' }} />
                                                </label>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Edad</span>
                                                    <input name="ageGrade" defaultValue={tournament.age_grade || ''} className={styles.filterInput} style={{ width: '100%' }} />
                                                </label>
                                                <label>
                                                    <span className={styles.pageSubtitle}>Formato</span>
                                                    <input name="format" defaultValue={tournament.format || ''} className={styles.filterInput} style={{ width: '100%' }} />
                                                </label>
                                            </div>

                                            <label>
                                                <span className={styles.pageSubtitle}>Vincular con torneo oficial</span>
                                                <select name="officialTournamentId" defaultValue="" className={styles.filterInput} style={{ width: '100%' }}>
                                                    <option value="">Seleccionar torneo oficial...</option>
                                                    {officialTournaments.map((officialTournament) => (
                                                        <option key={officialTournament.id} value={officialTournament.id}>
                                                            {officialTournamentLabel(officialTournament)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            <label>
                                                <span className={styles.pageSubtitle}>Notas de revision</span>
                                                <textarea
                                                    name="reviewNotes"
                                                    defaultValue={tournament.review_notes || ''}
                                                    className={styles.filterInput}
                                                    rows={3}
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </label>

                                            <div className={styles.toolbar}>
                                                <button type="submit" className={styles.btn}>
                                                    Guardar cambios
                                                </button>
                                                <button type="submit" formAction={publishPendingTournament} className={`${styles.btn} ${styles.btnPrimary}`}>
                                                    Publicar como oficial
                                                </button>
                                                <button type="submit" formAction={linkPendingTournament} className={styles.btn}>
                                                    Vincular y mover partidos
                                                </button>
                                                <button type="submit" formAction={rejectPendingTournament} className={styles.btn}>
                                                    Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>
        </>
    );
}
