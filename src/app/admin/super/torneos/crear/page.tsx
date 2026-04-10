'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ChevronLeft, Trophy, Globe, Shield, Settings, CheckCircle,
    LayoutGrid, ListOrdered, GitMerge, Search, Loader2
} from 'lucide-react';
import PhaseCreator, { type PhaseConfiguration, type Team as PhaseTeam } from '@/app/admin/components/PhaseCreator';
import LogoUploader from '@/components/LogoUploader';
import { createClient } from '@/lib/supabase/client';
import { createEntitySafe, updateEntitySafe } from '@/app/admin/entities/actions';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { getAllSports } from '@/lib/data/sports';
import { mapExternalSportToInternalSport } from '@/lib/sports';
import {
    buildTournamentCompetitionConfig,
    getTournamentFormatFromPhaseType,
    getTournamentFormatLabel,
    getTournamentFormatPhaseType,
    normalizeTournamentFormat,
    type CircuitChampionMode,
} from '@/lib/utils/tournamentFormat';
import { resolveTournamentAudience, syncAgeGradeWithAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import '../../creation-forms.css';

const sportsCatalog = getAllSports();

const sportDefaults: Record<string, { duration: number; win: number; draw: number; loss: number }> = {
    'football': { duration: 90, win: 3, draw: 1, loss: 0 },
    'rugby': { duration: 80, win: 4, draw: 2, loss: 0 },
    'rugby-union': { duration: 80, win: 4, draw: 2, loss: 0 },
    'rugby-league': { duration: 80, win: 2, draw: 1, loss: 0 },
    'basketball': { duration: 40, win: 2, draw: 0, loss: 1 },
    'hockey': { duration: 60, win: 3, draw: 1, loss: 0 },
    'field-hockey': { duration: 60, win: 3, draw: 1, loss: 0 },
    'volleyball': { duration: 90, win: 3, draw: 0, loss: 0 },
    'beach-volleyball': { duration: 60, win: 3, draw: 0, loss: 0 },
    'tennis': { duration: 120, win: 2, draw: 0, loss: 0 },
    'table-tennis': { duration: 30, win: 2, draw: 0, loss: 0 },
    'badminton': { duration: 45, win: 2, draw: 0, loss: 0 },
    'handball': { duration: 60, win: 2, draw: 1, loss: 0 },
    'futsal': { duration: 40, win: 3, draw: 1, loss: 0 },
    'beach-soccer': { duration: 36, win: 3, draw: 1, loss: 0 },
    'baseball': { duration: 180, win: 1, draw: 0, loss: 0 },
    'cricket': { duration: 300, win: 1, draw: 0, loss: 0 },
    'american-football': { duration: 60, win: 1, draw: 0, loss: 0 },
    'aussie-rules': { duration: 80, win: 4, draw: 2, loss: 0 },
    'snooker': { duration: 60, win: 1, draw: 0, loss: 0 },
    'darts': { duration: 30, win: 1, draw: 0, loss: 0 },
    'boxing': { duration: 36, win: 1, draw: 0, loss: 0 },
    'mma': { duration: 25, win: 1, draw: 0, loss: 0 },
    'esports': { duration: 45, win: 1, draw: 0, loss: 0 },
    'water-polo': { duration: 32, win: 2, draw: 1, loss: 0 },
    'floorball': { duration: 60, win: 3, draw: 1, loss: 0 },
    'bandy': { duration: 90, win: 3, draw: 1, loss: 0 },
    'netball': { duration: 60, win: 2, draw: 0, loss: 0 },
    'kabaddi': { duration: 40, win: 2, draw: 0, loss: 0 },
};

const steps = [
    { id: 1, name: 'Configuración', icon: <Settings size={14} /> },
    { id: 2, name: 'Fases', icon: <Trophy size={14} /> },
    { id: 3, name: 'Participantes', icon: <Shield size={14} /> },
    { id: 4, name: 'Reglas', icon: <CheckCircle size={14} /> },
    { id: 5, name: 'Publicar', icon: <Globe size={14} /> },
] as const;

function slugify(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function normalizeCountryId(value: string | null | undefined, options: TournamentCountryOption[]): string {
    if (!value) return '';
    const normalized = slugify(value);
    const matched = options.find((option) => slugify(option.id) === normalized || slugify(option.label) === normalized);
    return matched?.id || normalized;
}

const AGE_GRADE_OPTIONS = [
    'Mayores (Adults)',
    'Juveniles',
    'U23',
    'U20',
    'U18',
    'U16',
    'Femenino',
    'Mixto',
];

const DEFAULT_PHASE_CRITERIA = [
    { id: 'points', text: 'Puntos obtenidos', value: 'points_table' },
    { id: 'diff_points', text: 'Diferencia de Tantos', value: 'points_diff' },
];

const DEFAULT_PHASE_TAGS = [
    { id: '1', fromPosition: 1, toPosition: 2, label: 'Clasifica', color: '#00a365' },
];

type UnionOption = {
    id: string;
    name: string;
};

type ClubRecord = {
    id: string;
    name: string;
    short_name?: string | null;
    shortName?: string | null;
    city?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
};

type SquadRecord = {
    id: string;
    club_id?: string | null;
    name: string;
    sport?: string | null;
    gender?: string | null;
    category?: string | null;
    season?: string | null;
    status?: string | null;
};

type TournamentRecord = {
    name?: string | null;
    sport_id?: string | null;
    is_visible?: boolean | null;
    season_id?: string | null;
    category?: string | null;
    age_grade?: string | null;
    format?: string | null;
    country_id?: string | null;
    country?: string | null;
    union_id?: string | null;
    logo_url?: string | null;
    ruleset?: {
        pointsWin?: number;
        pointsDraw?: number;
        pointsLoss?: number;
        pointsBonusTry?: number;
        pointsBonusLoss?: number;
    } | null;
};

type ParticipantRow = {
    club_id: string;
    division_id?: string | null;
    division?: SquadRecord | null;
};

function formatSquadLabel(squad: SquadRecord): string {
    const suffix = [squad.sport, squad.gender, squad.category]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ');

    const seasonLabel = squad.season ? ` · ${squad.season}` : '';
    return `${squad.name}${suffix ? ` (${suffix})` : ''}${seasonLabel}`;
}

function sameIdList(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function mapFormatToPhaseType(format: string): PhaseConfiguration['phaseType'] {
    return getTournamentFormatPhaseType(format) as PhaseConfiguration['phaseType'];
}

function mapPhaseTypeToFormat(phaseType: string, preferredFormat?: string): string {
    return getTournamentFormatFromPhaseType(phaseType, preferredFormat);
}

function getPhaseTypeLabel(phaseType: string): string {
    if (phaseType === 'league') return 'Liga';
    if (phaseType === 'playoff') return 'Playoff';
    return 'Fase de grupos';
}

function buildPhaseName(phaseType: string): string {
    if (phaseType === 'league') return 'Regular Season';
    if (phaseType === 'playoff') return 'Playoffs';
    return 'Fase de grupos';
}

function buildGroupNames(count: number): string[] {
    return Array.from({ length: Math.max(1, count) }, (_, index) => `Grupo ${String.fromCharCode(65 + index)}`);
}

function parsePointsValue(value: string | number | undefined, fallback: number): number {
    const numericValue = Number(String(value ?? fallback).replace(/[^\d.-]/g, ''));
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getClubShortName(club: Pick<ClubRecord, 'name' | 'short_name' | 'shortName'>): string {
    if (club.short_name) return String(club.short_name).trim().slice(0, 4).toUpperCase();
    if (club.shortName) return String(club.shortName).trim().slice(0, 4).toUpperCase();

    return String(club.name || '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 3)
        .map((chunk: string) => chunk[0])
        .join('')
        .slice(0, 4)
        .toUpperCase();
}

function createDefaultPhaseConfig(
    phaseType: PhaseConfiguration['phaseType'],
    selectedTeamIds: string[],
    rules: {
        pointsWin: number;
        pointsDraw: number;
        pointsLoss: number;
        pointsBonusTry: number;
        pointsBonusLoss: number;
    }
): PhaseConfiguration {
    return {
        phaseType,
        config: {
            groupsCount: 4,
            teamsPerGroup: 5,
            qualifiersPerGroup: 2,
            pointsWin: String(rules.pointsWin),
            pointsDraw: String(rules.pointsDraw),
            pointsBonusTry: String(rules.pointsBonusTry),
            pointsBonusLoss: String(rules.pointsBonusLoss),
            leagueRounds: 1,
            playoffThirdPlace: false,
        },
        selectedTeamIds,
        fixtureData: [],
        isFixtureGenerated: false,
        activeCriteria: DEFAULT_PHASE_CRITERIA,
        tags: DEFAULT_PHASE_TAGS,
        groupAssignments: {},
    };
}

function buildQuickPhasePayload(config: PhaseConfiguration) {
    const groupsCount = Math.max(1, Number(config.config?.groupsCount) || 1);
    const qualifiersPerGroup = Math.max(0, Number(config.config?.qualifiersPerGroup) || 0);
    const leagueRounds = Math.max(1, Number(config.config?.leagueRounds) || 1);
    const normalizedPhaseType = config.phaseType === 'groups' ? 'group_stage' : config.phaseType;
    const groupNames = normalizedPhaseType === 'group_stage' ? buildGroupNames(groupsCount) : [];

    return {
        name: buildPhaseName(config.phaseType),
        phase_type: normalizedPhaseType,
        order_index: 1,
        is_active: true,
        settings: {
            quickCreator: {
                ...config,
                savedAt: new Date().toISOString(),
            },
            phaseMode: config.phaseType,
            teamsCount: config.selectedTeamIds.length,
            advanceCount: qualifiersPerGroup,
            legs: normalizedPhaseType === 'league' ? leagueRounds : 1,
            group_names: groupNames,
            selectedTeamIds: config.selectedTeamIds,
            groupAssignments: config.groupAssignments,
            fixturePreview: config.fixtureData,
            pointsSystem: {
                win: parsePointsValue(config.config?.pointsWin, 4),
                draw: parsePointsValue(config.config?.pointsDraw, 2),
                loss: 0,
                bonusTry: parsePointsValue(config.config?.pointsBonusTry, 1),
                bonusLoss: parsePointsValue(config.config?.pointsBonusLoss, 1),
            },
            tiebreakers: config.activeCriteria.map((criterion, index) => ({
                metric: criterion.value || criterion.id,
                label: criterion.text,
                enabled: true,
                order: index + 1,
                priority: index + 1,
            })),
            tableTags: config.tags,
            playoffThirdPlace: Boolean(config.config?.playoffThirdPlace),
        },
    };
}

export default function SuperCreateTournament() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tournamentId = searchParams?.get('tournamentId');
    const supabase = createClient();

    const [currentStep, setCurrentStep] = useState(1);
    const [isEdit, setIsEdit] = useState(false);
    const [unions, setUnions] = useState<UnionOption[]>([]);
    const [clubs, setClubs] = useState<ClubRecord[]>([]);
    const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
    const [selectedDivisionByClub, setSelectedDivisionByClub] = useState<Record<string, string>>({});
    const [clubSquadsByClub, setClubSquadsByClub] = useState<Record<string, SquadRecord[]>>({});
    const [loadingSquadsByClub, setLoadingSquadsByClub] = useState<Record<string, boolean>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [saving, setSaving] = useState(false);
    const [countryOptions, setCountryOptions] = useState<TournamentCountryOption[]>(() => getTournamentCountryOptions());
    const [phaseConfig, setPhaseConfig] = useState<PhaseConfiguration | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        sport: 'rugby',
        visibility: 'public',
        season: '2026',
        format: 'league',
        circuitChampionMode: 'accumulation' as CircuitChampionMode,
        category: 'Profesional',
        publicAudience: 'mayores' as TournamentAudience,
        ageGrade: 'Mayores (Adults)',
        country: '',
        unionId: '',
        logoUrl: '',
        rules: {
            pointsWin: 4,
            pointsDraw: 2,
            pointsLoss: 0,
            pointsBonusTry: 1,
            pointsBonusLoss: 1,
        }
    });

    const setClubSelection = (clubId: string, isSelected: boolean) => {
        setSelectedClubs((prev) => {
            if (isSelected) {
                return prev.includes(clubId) ? prev : [...prev, clubId];
            }

            return prev.filter((id) => id !== clubId);
        });

        if (!isSelected) {
            setSelectedDivisionByClub((prev) => {
                if (!(clubId in prev)) return prev;
                const next = { ...prev };
                delete next[clubId];
                return next;
            });
        }
    };

    const toggleAllClubs = () => {
        if (selectedClubs.length === clubs.length) {
            setSelectedClubs([]);
            setSelectedDivisionByClub({});
            return;
        }

        setSelectedClubs(clubs.map((club) => club.id));
    };

    // Load reference data
    useEffect(() => {
        supabase.from('unions').select('*').order('name').then(({ data }) => {
            setUnions(data || []);
        });
        supabase.from('clubs').select('*').order('name').then(({ data }) => {
            setClubs(data || []);
        });
        supabase.from('countries').select('id, name, code, flag_emoji').order('name').then(({ data }) => {
            setCountryOptions(getTournamentCountryOptions(data || []));
        });
    }, [supabase]);

    // Load tournament data when editing
    useEffect(() => {
        if (!tournamentId) return;

        supabase.from('tournaments')
            .select('*')
            .eq('id', tournamentId)
            .single()
            .then(({ data }: { data: TournamentRecord | null }) => {
                if (!data) return;
                setIsEdit(true);

                const sportVal = data.sport_id ? mapExternalSportToInternalSport(data.sport_id) : 'rugby';
                const defaults = sportDefaults[sportVal as string] || {};
                const inferredAudience = resolveTournamentAudience({ ageGrade: data.age_grade, category: data.category });
                const competitionConfig = (data.ruleset as { competition?: { parameters?: { champion_mode?: CircuitChampionMode } } } | null)?.competition;

                setFormData(prev => ({
                    ...prev,
                    name: data.name || '',
                    sport: sportVal,
                    visibility: data.is_visible ? 'public' : 'private',
                    season: data.season_id || '2026',
                    category: data.category || prev.category,
                    publicAudience: inferredAudience,
                    ageGrade: data.age_grade || syncAgeGradeWithAudience(prev.ageGrade, inferredAudience),
                    format: normalizeTournamentFormat(data.format || prev.format),
                    circuitChampionMode: competitionConfig?.parameters?.champion_mode === 'final' ? 'final' : prev.circuitChampionMode,
                    country: normalizeCountryId(data.country_id || data.country || '', countryOptions),
                    unionId: data.union_id || '',
                    logoUrl: data.logo_url || '',
                    rules: {
                        ...prev.rules,
                        pointsWin: data.ruleset?.pointsWin ?? defaults.win ?? prev.rules.pointsWin,
                        pointsDraw: data.ruleset?.pointsDraw ?? defaults.draw ?? prev.rules.pointsDraw,
                        pointsLoss: data.ruleset?.pointsLoss ?? defaults.loss ?? prev.rules.pointsLoss,
                        pointsBonusTry: data.ruleset?.pointsBonusTry ?? prev.rules.pointsBonusTry,
                        pointsBonusLoss: data.ruleset?.pointsBonusLoss ?? prev.rules.pointsBonusLoss,
                    }
                }));
            });

        // Load existing participants
        fetch(`/api/tournaments/${tournamentId}/participants?full=true`, { cache: 'no-store' })
            .then(async (response) => {
                if (!response.ok) return null;
                return response.json();
            })
            .then((participants: ParticipantRow[] | null) => {
                if (!participants) return;

                const nextSelectedClubs = Array.from(
                    new Set(
                        participants
                            .map((participant) => participant.club_id)
                            .filter((clubId): clubId is string => Boolean(clubId))
                    )
                );

                const nextSelectedDivisions = participants.reduce<Record<string, string>>((accumulator, participant) => {
                    if (participant.club_id && participant.division_id) {
                        accumulator[participant.club_id] = participant.division_id;
                    }
                    return accumulator;
                }, {});

                setSelectedClubs(nextSelectedClubs);
                setSelectedDivisionByClub(nextSelectedDivisions);
            })
            .catch((error) => {
                console.error('Error loading tournament participants:', error);
            });

        fetch(`/api/tournaments/${tournamentId}/phases`)
            .then(async (response) => {
                if (!response.ok) return null;
                return response.json();
            })
            .then((payload) => {
                const firstPhase = payload?.data?.[0];
                const savedQuickConfig = firstPhase?.settings?.quickCreator || firstPhase?.settings?.quick_creator;

                if (savedQuickConfig) {
                    setPhaseConfig(savedQuickConfig as PhaseConfiguration);
                    if (Array.isArray(savedQuickConfig.selectedTeamIds) && savedQuickConfig.selectedTeamIds.length > 0) {
                        setSelectedClubs(savedQuickConfig.selectedTeamIds);
                    }
                }
            })
            .catch((error) => {
                console.error('Error loading phase config:', error);
            });
    }, [countryOptions, supabase, tournamentId]);

    const handleSportChange = (sportId: string) => {
        const d = sportDefaults[sportId] || { duration: 60, win: 1, draw: 0, loss: 0 };
        setFormData(prev => ({
            ...prev,
            sport: sportId,
            rules: {
                ...prev.rules,
                ...(d ? { pointsWin: d.win, pointsDraw: d.draw, pointsLoss: d.loss } : {})
            }
        }));
    };

    const handlePublicAudienceChange = (audience: TournamentAudience) => {
        setFormData((prev) => ({
            ...prev,
            publicAudience: audience,
            ageGrade: syncAgeGradeWithAudience(prev.ageGrade, audience),
        }));
    };

    const handleAgeGradeChange = (ageGrade: string) => {
        setFormData((prev) => ({
            ...prev,
            ageGrade,
            publicAudience: resolveTournamentAudience({ ageGrade, category: prev.category }),
        }));
    };

    const phaseTeams: PhaseTeam[] = clubs.map((club) => ({
        id: club.id,
        name: club.name,
        short: getClubShortName(club),
        color: club.primary_color || '#00A365',
    }));

    const resolvedPhaseType = phaseConfig?.phaseType || mapFormatToPhaseType(formData.format);
    const effectivePhaseConfig = phaseConfig || createDefaultPhaseConfig(resolvedPhaseType, selectedClubs, formData.rules);
    const phaseConfigToPersist: PhaseConfiguration = {
        ...effectivePhaseConfig,
        selectedTeamIds: selectedClubs,
    };
    const selectedSport = sportsCatalog.find((sport) => sport.id === formData.sport);
    const selectedCountryOption = countryOptions.find((option) => option.id === formData.country) || null;
    const heroTitle = formData.name.trim() || 'Nuevo torneo';
    const heroStatus = formData.visibility === 'public' ? 'READY' : 'DRAFT';

    useEffect(() => {
        setPhaseConfig((current) => {
            if (!current || sameIdList(current.selectedTeamIds, selectedClubs)) {
                return current;
            }

            return {
                ...current,
                selectedTeamIds: selectedClubs,
            };
        });
    }, [selectedClubs]);

    useEffect(() => {
        let isCancelled = false;
        const missingClubIds = selectedClubs.filter(
            (clubId) => !(clubId in clubSquadsByClub) && !loadingSquadsByClub[clubId]
        );

        if (missingClubIds.length === 0) return;

        missingClubIds.forEach((clubId) => {
            setLoadingSquadsByClub((prev) => ({ ...prev, [clubId]: true }));

            fetch(`/api/admin/clubs/${clubId}/squads`, { cache: 'no-store' })
                .then(async (response) => {
                    const payload = await response.json().catch(() => []);
                    if (!response.ok) {
                        throw new Error(payload?.error || 'No se pudieron cargar los planteles del club');
                    }
                    return Array.isArray(payload) ? payload as SquadRecord[] : [];
                })
                .then((squads) => {
                    if (isCancelled) return;
                    setClubSquadsByClub((prev) => ({ ...prev, [clubId]: squads }));
                })
                .catch((error) => {
                    if (isCancelled) return;
                    console.error(`Error loading squads for club ${clubId}:`, error);
                    setClubSquadsByClub((prev) => ({ ...prev, [clubId]: [] }));
                })
                .finally(() => {
                    if (isCancelled) return;
                    setLoadingSquadsByClub((prev) => ({ ...prev, [clubId]: false }));
                });
        });

        return () => {
            isCancelled = true;
        };
    }, [clubSquadsByClub, loadingSquadsByClub, selectedClubs]);

    useEffect(() => {
        setSelectedDivisionByClub((current) => {
            let changed = false;
            const next = { ...current };

            Object.keys(next).forEach((clubId) => {
                if (!selectedClubs.includes(clubId)) {
                    delete next[clubId];
                    changed = true;
                }
            });

            selectedClubs.forEach((clubId) => {
                const squads = clubSquadsByClub[clubId] || [];
                const selectedDivisionId = next[clubId];

                if (selectedDivisionId && squads.length > 0 && !squads.some((squad) => squad.id === selectedDivisionId)) {
                    delete next[clubId];
                    changed = true;
                }

                if (!next[clubId] && squads.length === 1) {
                    next[clubId] = squads[0].id;
                    changed = true;
                }
            });

            return changed ? next : current;
        });
    }, [clubSquadsByClub, selectedClubs]);

    const applyPhaseConfig = (nextConfig: PhaseConfiguration) => {
        setPhaseConfig(nextConfig);

        const nextFormat = mapPhaseTypeToFormat(nextConfig.phaseType, formData.format);
        setFormData((prev) => (
            prev.format === nextFormat
                ? prev
                : { ...prev, format: nextFormat }
        ));

        if (!sameIdList(selectedClubs, nextConfig.selectedTeamIds)) {
            setSelectedClubs(nextConfig.selectedTeamIds);
        }
    };

    const handleFormatChange = (format: string) => {
        const normalizedFormat = normalizeTournamentFormat(format);
        const nextPhaseType = mapFormatToPhaseType(normalizedFormat);

        setFormData((prev) => ({ ...prev, format: normalizedFormat }));
        setPhaseConfig((current) => {
            const baseConfig = current || createDefaultPhaseConfig(nextPhaseType, selectedClubs, formData.rules);
            return {
                ...baseConfig,
                phaseType: nextPhaseType,
            };
        });
    };

    const saveQuickPhase = async (savedId: string, config: PhaseConfiguration) => {
        const existingPhasesResponse = await fetch(`/api/tournaments/${savedId}/phases`);
        let existingPhaseId: string | null = null;

        if (existingPhasesResponse.ok) {
            const existingPhasesPayload = await existingPhasesResponse.json();
            existingPhaseId = existingPhasesPayload?.data?.[0]?.id || null;
        }

        const phaseResponse = await fetch(
            existingPhaseId
                ? `/api/tournaments/${savedId}/phases/${existingPhaseId}`
                : `/api/tournaments/${savedId}/phases`,
            {
                method: existingPhaseId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildQuickPhasePayload(config)),
            }
        );

        if (!phaseResponse.ok) {
            const phaseError = await phaseResponse.json().catch(() => null);
            throw new Error(phaseError?.error || 'No se pudo guardar la fase inicial.');
        }
    };

    const handleNext = async () => {
        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        setSaving(true);
        try {
            const ruleset = {
                pointsWin: formData.rules.pointsWin,
                pointsDraw: formData.rules.pointsDraw,
                pointsLoss: formData.rules.pointsLoss,
                ...(formData.sport === 'rugby' ? {
                    pointsBonusTry: formData.rules.pointsBonusTry,
                    pointsBonusLoss: formData.rules.pointsBonusLoss,
                } : {})
            };

            const payload: Record<string, unknown> = {
                name: formData.name,
                sport_id: formData.sport,
                season_id: formData.season || '2026',
                category: formData.category || null,
                age_grade: formData.ageGrade || null,
                format: mapPhaseTypeToFormat(phaseConfigToPersist.phaseType, formData.format) || null,
                country: formData.country
                    ? (selectedCountryOption?.label || formData.country)
                    : null,
                country_id: formData.country
                    ? (selectedCountryOption?.id || formData.country)
                    : null,
                union_id: formData.unionId || null,
                logo_url: formData.logoUrl || null,
                status: formData.visibility === 'public' ? 'published' : 'draft',
                is_visible: formData.visibility === 'public',
                ruleset: {
                    ...ruleset,
                    competition: buildTournamentCompetitionConfig(formData.format, {
                        champion_mode: formData.circuitChampionMode,
                    }),
                },
            };

            let savedId: string;

            if (isEdit && tournamentId) {
                // On edit: don't touch the slug
                const result = await updateEntitySafe('tournament', tournamentId, payload);
                if (!result.success) {
                    throw new Error(result.error);
                }
                savedId = tournamentId;
            } else {
                // On create: generate a unique slug
                payload.slug = `${slugify(formData.name)}-${Date.now()}`;
                const result = await createEntitySafe('tournament', payload);
                if (!result.success) {
                    throw new Error(result.error);
                }
                savedId = result.id;
            }

            const participantClubIds = Array.from(new Set(selectedClubs.filter(Boolean)));
            const clubsMissingDivisionSelection = participantClubIds.filter((clubId) => {
                const squads = clubSquadsByClub[clubId] || [];
                return squads.length > 1 && !selectedDivisionByClub[clubId];
            });

            if (clubsMissingDivisionSelection.length > 0) {
                const missingClubNames = clubs
                    .filter((club) => clubsMissingDivisionSelection.includes(club.id))
                    .map((club) => club.name)
                    .slice(0, 3)
                    .join(', ');

                throw new Error(`Selecciona el plantel participante para: ${missingClubNames}`);
            }

            // Persist participants
            if (isEdit) {
                await supabase.from('tournament_participants').delete().eq('tournament_id', savedId);
            }
            if (participantClubIds.length > 0) {
                await Promise.all(
                    participantClubIds.map(async (clubId) => {
                        const selectedDivisionId = selectedDivisionByClub[clubId] || null;
                        const response = await fetch(`/api/tournaments/${savedId}/participants`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                club_id: clubId,
                                division_id: selectedDivisionId,
                                type: 'club',
                                status: 'active',
                            }),
                        });

                        const payload = await response.json().catch(() => null);
                        if (!response.ok) {
                            throw new Error(payload?.error || 'No se pudo agregar un participante al torneo.');
                        }
                    })
                );
            }

            await saveQuickPhase(savedId, phaseConfigToPersist);

            router.push('/admin/super/torneos');
        } catch (err: unknown) {
            alert('Error al guardar el torneo: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="creation-body">
            <div className="creation-container">
                {/* Header */}
                <header className="creation-header">
                    <button
                        onClick={() => router.push('/admin/super/torneos')}
                        className="btn btn-outline"
                        style={{ padding: '8px 16px', marginBottom: '24px', height: 'auto', width: 'auto' }}
                    >
                        <ChevronLeft size={16} /> Volver a Torneos
                    </button>
                    <h1>{isEdit ? 'Editar Torneo' : 'Inaugurar Torneo'}</h1>
                    <p>Define los parámetros globales y la estructura de tu competencia.</p>
                </header>

                <section className="creation-hero">
                    <div className="creation-hero-card">
                        <div className="creation-hero-logo">
                            {formData.logoUrl ? (
                                <img src={formData.logoUrl} alt={heroTitle} />
                            ) : (
                                <span className="creation-hero-logo-placeholder">Logo</span>
                            )}
                        </div>

                        <div className="creation-hero-copy">
                            <h2>{heroTitle}</h2>
                            <p className="creation-hero-subline">
                                El logo se actualiza en vivo aqui arriba y se guarda junto al torneo.
                            </p>

                            <div className="creation-hero-meta">
                                <span className="creation-hero-pill is-accent">Status: <strong>{heroStatus}</strong></span>
                                <span className="creation-hero-pill">Season: <strong>{formData.season || '2026'}</strong></span>
                                <span className="creation-hero-pill">Sport: <strong>{selectedSport?.nameEs || formData.sport}</strong></span>
                                <span className="creation-hero-pill">Fase base: <strong>{getPhaseTypeLabel(phaseConfigToPersist.phaseType)}</strong></span>
                                <span className="creation-hero-pill">ID: <strong>{isEdit ? 'EDIT' : 'NEW'}</strong></span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stepper */}
                <nav className="stepper-nav">
                    {steps.map(step => (
                        <button
                            key={step.id}
                            className={`step-pill ${currentStep === step.id ? 'active' : ''} ${step.id < currentStep ? 'done' : ''}`}
                            onClick={() => {
                                if (step.id < currentStep) setCurrentStep(step.id);
                            }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                {step.id < currentStep ? '✓' : step.icon}
                                {step.name}
                            </span>
                        </button>
                    ))}
                </nav>

                {/* STEP 1: CONFIGURACIÓN */}
                {currentStep === 1 && (
                    <>
                        <article className="partition">
                            <div className="partition-header">
                                <h2>Configuración General</h2>
                                <p>Información de identidad y categorización.</p>
                            </div>
                            <div className="partition-body">
                                <div className="form-grid">
                                    <div className="field-group">
                                        <label>NOMBRE DEL TORNEO *</label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Ej: Torneo del Interior A 2026"
                                        />
                                    </div>

                                    <div className="field-group">
                                        <label>DEPORTE</label>
                                        <div className="choice-grid">
                                            {sportsCatalog.map(sport => (
                                                <button
                                                    key={sport.id}
                                                    type="button"
                                                    className={`choice-btn ${formData.sport === sport.id ? 'selected' : ''}`}
                                                    onClick={() => handleSportChange(sport.id)}
                                                >
                                                    <span className="choice-icon">{sport.icon}</span>
                                                    <span className="choice-label">{sport.nameEs}</span>
                                                    <span className="choice-status">{sport.isActive ? 'Activo' : 'Catalogo web'}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <p className="field-help">Se muestran todos los deportes soportados por la web, no solo los activos.</p>
                                    </div>

                                    <div className="field-group">
                                        <label>SECCION PUBLICA</label>
                                        <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                                            {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                                                <button
                                                    key={audience}
                                                    type="button"
                                                    className={`choice-btn ${formData.publicAudience === audience ? 'selected' : ''}`}
                                                    onClick={() => handlePublicAudienceChange(audience)}
                                                >
                                                    <span className="choice-icon">{audience === 'mayores' ? 'A' : 'U'}</span>
                                                    <span className="choice-label">{audience === 'mayores' ? 'Mayores' : 'Juveniles'}</span>
                                                    <span className="choice-status">
                                                        {audience === 'mayores' ? 'Portada principal' : 'Pagina juvenil'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                        <p className="field-help">Esta seleccion define en que vista publica aparece el torneo local.</p>
                                    </div>

                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>TEMPORADA</label>
                                            <select
                                                className="form-select"
                                                value={formData.season}
                                                onChange={e => setFormData({ ...formData, season: e.target.value })}
                                            >
                                                <option value="2026">2026</option>
                                                <option value="2025">2025</option>
                                                <option value="2024">2024</option>
                                            </select>
                                        </div>
                                        <div className="field-group">
                                            <label>CATEGORÍA</label>
                                            <input
                                                className="form-input"
                                                type="text"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                placeholder="Ej: Primera, Juveniles, etc."
                                            />
                                        </div>
                                    </div>

                                    <div className="field-group">
                                        <label>CLASIFICACION DE EDAD</label>
                                        <select
                                            className="form-select"
                                            value={formData.ageGrade}
                                            onChange={e => handleAgeGradeChange(e.target.value)}
                                        >
                                            {AGE_GRADE_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </article>

                        <article className="partition">
                            <div className="partition-header">
                                <h2>Jurisdicción y Alcance</h2>
                                <p>Define dónde se desarrolla y quién lo rige.</p>
                            </div>
                            <div className="partition-body">
                                <div className="grid-2">
                                    <div className="field-group">
                                        <label>PAÍS / REGIÓN</label>
                                        <select
                                            className="form-select"
                                            value={formData.country}
                                            onChange={e => setFormData({ ...formData, country: e.target.value })}
                                        >
                                            <option value="">No especificado</option>
                                            {countryOptions.map((country) => (
                                                <option key={country.id} value={country.id}>{country.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="field-group">
                                        <label>UNIÓN VINCULADA</label>
                                        <select
                                            className="form-select"
                                            value={formData.unionId}
                                            onChange={e => setFormData({ ...formData, unionId: e.target.value })}
                                        >
                                            <option value="">Independiente (Sin vínculo)</option>
                                            {unions.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </article>

                        <article className="partition">
                            <div className="partition-header">
                                <h2>Identidad Visual</h2>
                                <p>Sube el logo y valida al instante como queda en el banner superior.</p>
                            </div>
                            <div className="partition-body">
                                <div className="grid-2">
                                    <div className="field-group">
                                        <label>URL DEL LOGO</label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            value={formData.logoUrl}
                                            onChange={e => setFormData({ ...formData, logoUrl: e.target.value })}
                                            placeholder="https://.../logo.png"
                                        />
                                        <p className="field-help">
                                            Puedes pegar una URL o subir un archivo. El banner de arriba usa exactamente este mismo logo.
                                        </p>
                                        {formData.logoUrl && (
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                style={{ alignSelf: 'flex-start', padding: '10px 16px', height: 'auto', width: 'auto' }}
                                                onClick={() => setFormData({ ...formData, logoUrl: '' })}
                                            >
                                                Limpiar Logo
                                            </button>
                                        )}
                                    </div>

                                    <div className="logo-card">
                                        <LogoUploader
                                            onUpload={(logoData) => setFormData((prev) => ({ ...prev, logoUrl: logoData }))}
                                            currentLogo={formData.logoUrl}
                                            label="Logo del torneo"
                                            accentColor="var(--accent)"
                                        />
                                    </div>
                                </div>
                            </div>
                        </article>
                    </>
                )}

                {/* STEP 2: FASES */}
                {currentStep === 2 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Estructura de Fases</h2>
                            <p>Configura cómo se organiza la competencia.</p>
                        </div>
                        <div className="partition-body">
                            <div className="field-group">
                                <label>TIPO DE FORMATO</label>
                                <div className="choice-grid">
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'groups' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('groups')}
                                    >
                                        <LayoutGrid className="choice-icon" />
                                        <span className="choice-label">Fase de Grupos + Playoffs</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'league' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('league')}
                                    >
                                        <ListOrdered className="choice-icon" />
                                        <span className="choice-label">Liga (Todos contra todos)</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'knockout' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('knockout')}
                                    >
                                        <GitMerge className="choice-icon" />
                                        <span className="choice-label">Eliminación Directa</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'circuit' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('circuit')}
                                    >
                                        <Trophy className="choice-icon" />
                                        <span className="choice-label">Circuito por eventos</span>
                                    </button>
                                </div>
                            </div>
                            {formData.format === 'circuit' && (
                                <div className="sub-partition" style={{ border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '12px', padding: '20px', background: 'rgba(245, 158, 11, 0.08)', marginTop: '24px' }}>
                                    <div style={{ display: 'grid', gap: '16px' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>Modo Circuito</h3>
                                            <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                                                El circuito usa varias paradas durante la temporada y una tabla acumulada por puntos obtenidos en cada evento.
                                            </p>
                                        </div>
                                        <div className="field-group" style={{ marginBottom: 0 }}>
                                            <label>DEFINICION DEL CAMPEON</label>
                                            <select
                                                className="form-select"
                                                value={formData.circuitChampionMode}
                                                onChange={(e) => setFormData((prev) => ({
                                                    ...prev,
                                                    circuitChampionMode: e.target.value as CircuitChampionMode,
                                                }))}
                                            >
                                                <option value="accumulation">Por acumulacion de puntos</option>
                                                <option value="final">Con final / playoff decisivo</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="sub-partition" style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', background: 'rgba(0,0,0,0.2)', marginTop: '30px' }}>
                                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Trophy size={18} color="var(--accent)" />
                                    <h3 style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configurador de Fases</h3>
                                </div>
                                <PhaseCreator
                                    key={`quick-phase-${formData.format}-${effectivePhaseConfig.phaseType}`}
                                    phaseIndex={1}
                                    totalPhases={1}
                                    teams={phaseTeams}
                                    initialConfig={effectivePhaseConfig}
                                    onPrev={() => setCurrentStep(1)}
                                    onChange={applyPhaseConfig}
                                    onSaveDraft={applyPhaseConfig}
                                    onNext={(config) => {
                                        applyPhaseConfig(config);
                                        setCurrentStep(3);
                                    }}
                                />
                            </div>
                        </div>
                    </article>
                )}

                {/* STEP 3: PARTICIPANTES */}
                {currentStep === 3 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Clubes Participantes</h2>
                            <p>Selecciona los clubes que formarán parte de este torneo.</p>
                        </div>
                        <div className="partition-body">
                            <div className="form-grid">
                                <div className="field-group">
                                    <label>BUSCAR Y AGREGAR CLUBES</label>
                                    <div className="search-box">
                                        <Search className="icon" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Escribe el nombre del club..."
                                            className="form-input"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '40px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={clubs.length > 0 && selectedClubs.length === clubs.length}
                                                        onChange={toggleAllClubs}
                                                    />
                                                </th>
                                                <th>CLUB</th>
                                                <th>PLANTEL</th>
                                                <th>UBICACIÓN</th>
                                                <th style={{ width: '100px' }}>ACCIÓN</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {clubs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                                        Cargando clubes...
                                                    </td>
                                                </tr>
                                            ) : clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(club => (
                                                <tr key={club.id} className={selectedClubs.includes(club.id) ? 'active' : ''}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedClubs.includes(club.id)}
                                                            onChange={() => setClubSelection(club.id, !selectedClubs.includes(club.id))}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            {club.logo_url && <img src={club.logo_url} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />}
                                                            <span>{club.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {selectedClubs.includes(club.id) ? (
                                                            <div style={{ display: 'grid', gap: '6px' }}>
                                                                <select
                                                                    className="form-select"
                                                                    value={selectedDivisionByClub[club.id] || ''}
                                                                    onChange={(e) => setSelectedDivisionByClub((prev) => ({
                                                                        ...prev,
                                                                        [club.id]: e.target.value,
                                                                    }))}
                                                                    disabled={Boolean(loadingSquadsByClub[club.id])}
                                                                >
                                                                    <option value="">
                                                                        {loadingSquadsByClub[club.id]
                                                                            ? 'Cargando planteles...'
                                                                            : (clubSquadsByClub[club.id] || []).length === 0
                                                                                ? 'Sin planteles vinculados'
                                                                                : (clubSquadsByClub[club.id] || []).length === 1
                                                                                    ? 'Plantel detectado automaticamente'
                                                                                    : 'Selecciona el plantel'}
                                                                    </option>
                                                                    {(clubSquadsByClub[club.id] || []).map((squad) => (
                                                                        <option key={squad.id} value={squad.id}>
                                                                            {formatSquadLabel(squad)}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {(clubSquadsByClub[club.id] || []).length === 0 && (
                                                                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                                                        Este club competira en modo legacy hasta que tenga planteles vinculados.
                                                                    </span>
                                                                )}
                                                                {(clubSquadsByClub[club.id] || []).length > 1 && !selectedDivisionByClub[club.id] && (
                                                                    <span style={{ fontSize: '11px', color: 'var(--accent)' }}>
                                                                        Elige que plantel quieres inscribir.
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-dim)' }}>Selecciona el club</span>
                                                        )}
                                                    </td>
                                                    <td>{club.city || club.short_name || 'Sede Central'}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={`btn ${selectedClubs.includes(club.id) ? 'btn-primary' : 'btn-outline'}`}
                                                            style={{ padding: '4px 12px', fontSize: '11px', height: 'auto', minHeight: 'unset' }}
                                                            onClick={() => setClubSelection(club.id, !selectedClubs.includes(club.id))}
                                                        >
                                                            {selectedClubs.includes(club.id) ? '✓ Añadido' : '+ Añadir'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* STEP 4: REGLAS */}
                {currentStep === 4 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Sistema de Puntuación</h2>
                            <p>Define los puntos que se otorgarán por cada resultado.</p>
                        </div>
                        <div className="partition-body">
                            <div className="grid-2">
                                <div className="field-group">
                                    <label>PUNTOS POR GANAR</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={formData.rules.pointsWin}
                                        onChange={e => setFormData({
                                            ...formData,
                                            rules: { ...formData.rules, pointsWin: parseInt(e.target.value) }
                                        })}
                                    />
                                </div>
                                <div className="field-group">
                                    <label>PUNTOS POR EMPATAR</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={formData.rules.pointsDraw}
                                        onChange={e => setFormData({
                                            ...formData,
                                            rules: { ...formData.rules, pointsDraw: parseInt(e.target.value) }
                                        })}
                                    />
                                </div>
                            </div>

                            {formData.sport === 'rugby' && (
                                <div className="sub-partition" style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '15px', color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase' }}>Puntos Bonus (Rugby)</h4>
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>POR 4 O MÁS TRIES</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsBonusTry}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    rules: { ...formData.rules, pointsBonusTry: parseInt(e.target.value) }
                                                })}
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label>POR PERDER POR {'<'} 7</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsBonusLoss}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    rules: { ...formData.rules, pointsBonusLoss: parseInt(e.target.value) }
                                                })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </article>
                )}

                {/* STEP 5: REVISIÓN */}
                {currentStep === 5 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Resumen y Confirmación</h2>
                            <p>Revisa que toda la información sea correcta antes de finalizar.</p>
                        </div>
                        <div className="partition-body">
                            <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Nombre</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.name}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Deporte</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{selectedSport?.nameEs || formData.sport.toUpperCase()}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Temporada</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.season}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Categoría</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.category || 'N/A'}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Edad</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.ageGrade || 'N/A'}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Participantes</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{selectedClubs.length} club{selectedClubs.length !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Formato</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{getTournamentFormatLabel(formData.format)}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Puntos (G/E/P)</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{formData.rules.pointsWin} / {formData.rules.pointsDraw} / {formData.rules.pointsLoss}</span>
                                </div>
                                <div className="summary-item">
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Fase inicial</strong>
                                    <span style={{ fontSize: '16px', color: 'white' }}>{getPhaseTypeLabel(phaseConfigToPersist.phaseType)}</span>
                                </div>
                                {formData.format === 'circuit' && (
                                    <div className="summary-item">
                                        <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-dim)' }}>Campeon del circuito</strong>
                                        <span style={{ fontSize: '16px', color: 'white' }}>
                                            {formData.circuitChampionMode === 'final' ? 'Final / playoff' : 'Tabla acumulada'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <article className="partition" style={{ marginTop: '30px', border: '1px dashed var(--border)' }}>
                                <div className="partition-header">
                                    <h3>Visibilidad Final</h3>
                                </div>
                                <div className="partition-body">
                                    <select
                                        className="form-select"
                                        value={formData.visibility}
                                        onChange={e => setFormData({ ...formData, visibility: e.target.value })}
                                    >
                                        <option value="public">🌍 Público (Vivo en la app)</option>
                                        <option value="private">🔒 Privado (Borrador interno)</option>
                                    </select>
                                </div>
                            </article>
                        </div>
                    </article>
                )}

                {/* Footer Actions */}
                <footer className="actions-footer">
                    <button
                        className="btn btn-outline"
                        disabled={currentStep === 1 || saving}
                        onClick={() => setCurrentStep(p => p - 1)}
                    >
                        Paso Anterior
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleNext}
                        disabled={saving || (currentStep === 1 && !formData.name)}
                    >
                        {saving ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Loader2 className="spinning" size={18} />
                                {isEdit ? 'Guardando...' : 'Creando...'}
                            </span>
                        ) : currentStep === 5 ? (isEdit ? 'Guardar Cambios' : 'Finalizar Torneo') : 'Siguiente Paso'}
                    </button>
                </footer>
            </div>
        </div>
    );
}
