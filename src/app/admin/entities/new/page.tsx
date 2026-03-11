import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EntityType } from '@/lib/services/entityResolver';
import { TournamentEditor } from '@/components/admin/entities/editors/TournamentEditor';
import { MatchEditor } from '@/components/admin/entities/editors/MatchEditor';
import { PlayerEditor } from '@/components/admin/entities/editors/PlayerEditor';
import NewClubForm from '@/app/admin/super/clubes/crear/NewClubForm';

const ENTITY_TYPES: EntityType[] = ['tournament', 'club', 'match', 'player', 'union'];

const ENTITY_LABELS: Record<EntityType, { label: string; icon: string; desc: string }> = {
    tournament: { label: 'Torneo', icon: '🏆', desc: 'Crear nuevo torneo' },
    club: { label: 'Club', icon: '🏟️', desc: 'Crear nuevo club' },
    match: { label: 'Partido', icon: '⚽', desc: 'Crear nuevo partido' },
    player: { label: 'Jugador', icon: '👤', desc: 'Crear nuevo jugador' },
    union: { label: 'Unión', icon: '🛡️', desc: 'Crear nueva unión' },
};

interface NewEntityPageProps {
    searchParams: Promise<{ type?: string }>;
}

export default async function NewEntityPage({ searchParams }: NewEntityPageProps) {
    const { type } = await searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const returnTo = `/admin/entities/new${type ? `?type=${type}` : ''}`;
        redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }

    // Redirect match creation to new drafting page
    if (type === 'match') {
        redirect('/admin/super/partidos/crear');
    }

    // ── No type selected: show type selector ─────────────────────────────────
    if (!type || !ENTITY_TYPES.includes(type as EntityType)) {
        return (
            <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <a
                        href="/admin/entities"
                        className="text-system-secondary hover:text-foreground transition-colors text-sm flex items-center gap-1"
                    >
                        ← Volver
                    </a>
                </div>

                <div className="p-12 text-center bg-[#141620]/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] min-h-[60vh] flex flex-col justify-center items-center shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-96 h-96 bg-primary-accent/5 blur-[120px] pointer-events-none" />

                    <div className="w-16 h-16 rounded-2xl bg-primary-accent/10 text-primary-accent flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,255,136,0.1)]">
                        <span className="material-symbols-outlined text-4xl">add_circle</span>
                    </div>

                    <h1 className="text-4xl font-black mb-4 uppercase italic tracking-tighter text-white">¿Qué querés crear?</h1>
                    <p className="text-slate-400 font-medium mb-12 max-w-md">
                        Seleccioná el tipo de entidad para agregar al sistema G22. Todas las configuraciones se pueden editar después.
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full max-w-5xl px-4">
                        {ENTITY_TYPES.map(t => {
                            const meta = ENTITY_LABELS[t];
                            const href = t === 'match' ? '/admin/super/partidos/crear' : `/admin/entities/new?type=${t}`;
                            return (
                                <a
                                    key={t}
                                    href={href}
                                    className="px-4 py-8 bg-white/5 border border-white/5 rounded-3xl hover:border-primary-accent/50 hover:bg-primary-accent/5 transition-all duration-300 flex flex-col items-center gap-4 group hover:scale-105"
                                >
                                    <span className="text-4xl filter grayscale group-hover:grayscale-0 transition-all">{meta.icon}</span>
                                    <div className="text-center">
                                        <span className="block text-xs font-black uppercase tracking-widest text-primary-accent mb-1">{meta.label}</span>
                                        <span className="block text-[10px] text-slate-500 font-bold uppercase">{meta.desc}</span>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    const entityType = type as EntityType;

    const EDITOR_TITLE: Record<EntityType, string> = {
        tournament: 'Nuevo Torneo',
        club: 'Nuevo Club',
        match: 'Nuevo Partido',
        player: 'Nuevo Jugador',
        union: 'Nueva Unión',
    };

    const emptyData: Record<EntityType, any> = {
        tournament: { id: '', name: '', season_id: null, region: null, status: 'draft' },
        club: { id: '', name: '', city: null, union_id: null, logo_url: null },
        match: { id: '', date_time: '', home_club_id: null, away_club_id: null, venue: null, status: 'scheduled' },
        player: { id: '', name: '', club_id: null, position: null, nationality: null },
        union: { id: '', name: '', country: null, branding: {} },
    };

    // New Club Form
    if (entityType === 'club') {
        const { data: unionsData } = await supabase.from('unions').select('id, name, country').order('name');
        return <NewClubForm unions={unionsData ?? []} />;
    }

    const isTournament = entityType === 'tournament';

    // Fetch unions for tournament if needed
    let tUnions: any[] = [];
    if (isTournament) {
        const { data } = await supabase.from('unions').select('id, name').order('name');
        tUnions = data ?? [];
    }

    return (
        <div className={isTournament ? 'w-full' : 'max-w-4xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6'}>
            {!isTournament && (
                <>
                    <div className="flex items-center gap-2 text-sm text-system-secondary">
                        <a href="/admin" className="hover:text-foreground transition-colors">Admin</a>
                        <span>›</span>
                        <a href="/admin/entities/new" className="hover:text-foreground transition-colors">Crear</a>
                        <span>›</span>
                        <span className="text-foreground font-medium">{EDITOR_TITLE[entityType]}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">{EDITOR_TITLE[entityType]}</h1>
                            <p className="text-system-secondary text-sm mt-1">
                                Completá los campos para crear la entidad.
                            </p>
                        </div>
                    </div>
                </>
            )}

            <div className={isTournament ? '' : 'bg-surface border border-divider rounded-xl p-6 shadow-sm'}>
                {entityType === 'tournament' && <TournamentEditor data={emptyData.tournament} id="new" unions={tUnions} />}
                {entityType === 'match' && <MatchEditor data={emptyData.match} id="new" />}
                {entityType === 'player' && <PlayerEditor data={emptyData.player} id="new" />}
                {entityType === 'union' && (
                    <div className="p-8 text-center text-system-secondary">
                        Editor de Uniones en desarrollo. Usar vista de catálogo por ahora.
                    </div>
                )}
            </div>
        </div>
    );
}
