'use client';

/**
 * Asistente de preferencias: deporte → competiciones → clubes → resumen.
 *
 * Sirve para tres casos con el mismo componente:
 *  - visitante sin cuenta en su primera visita (variant "overlay", sobre la home);
 *  - usuario nuevo con cuenta (variant "page", /onboarding/preferences);
 *  - editar los favoritos cuando se quiera (`editing`).
 *
 * Qué se elige no es una lista nueva: deportes de SportContext, competiciones
 * del mismo catálogo que el selector de la portada y clubes del feed de
 * partidos del deporte (lib/catalog/onboardingCatalog).
 *
 * Dónde se guarda: con cuenta, en las tablas de seguidos (vía useFavorites,
 * optimista y con rollback); sin cuenta, en el dispositivo (lib/localPreferences)
 * y pasa a la cuenta cuando inicia sesión. Cada paso se puede saltear.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/context/AuthContext';
import { useSport } from '@/context/SportContext';
import { useFavorites } from '@/hooks/useFavorites';
import { invalidateUserPreferences, useUserPreferences } from '@/hooks/useUserPreferences';
import {
    buildClubTree,
    categoryLabel,
    detectUserCountryId,
    loadClubOptions,
    loadExternalLeagueOptions,
    loadLeagueClubs,
    loadPrimaryLeagueOptions,
    pickRecommendedLeagues,
    type ClubOption,
    type LeagueOption,
} from '@/lib/catalog/onboardingCatalog';
import { getCountryById } from '@/lib/data/countries';
import { dismissDeviceSportPrompt } from '@/lib/deviceSportPreference';
import { readLocalPreferences, writeLocalPreferences } from '@/lib/localPreferences';
import { setOnboardingStorageStatus } from '@/lib/onboardingStatus';

import styles from './PreferencesWizard.module.css';

type StepId = 'sport' | 'leagues' | 'clubs' | 'confirm';
const STEPS: StepId[] = ['sport', 'leagues', 'clubs', 'confirm'];

const TITLES: Record<StepId, { title: string; subtitle: string }> = {
    sport: { title: '¿Qué deporte seguís?', subtitle: 'Es el que vas a ver primero al entrar.' },
    leagues: { title: '¿Qué competiciones te interesan?', subtitle: 'Elegí las que quieras. Podés cambiarlas cuando quieras.' },
    clubs: { title: '¿A qué clubes seguís?', subtitle: 'Los clubes que juegan en tus competiciones. Es opcional.' },
    confirm: { title: 'Revisá tus favoritos', subtitle: 'Si algo no te cierra, tocá Cambiar.' },
};

const RECOMMENDED_MAX = 20;
const RECOMMENDED_FALLBACK = 8;
const MAX_LEAGUES_FOR_CLUBS = 12;
const LEAGUES_PAGE = 30;
const CLUBS_PAGE = 60;

export type WizardResult = 'done' | 'skipped' | 'dismissed';

interface PreferencesWizardProps {
    variant: 'overlay' | 'page';
    /** Abierto para modificar favoritos ya configurados (parte de lo que ya sigue). */
    editing?: boolean;
    onClose: (result: WizardResult) => void;
}

interface Picked {
    name: string;
    logo: string | null;
}

function fold(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function Logo({ src, name, className }: { src: string | null; name: string; className: string }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
        return <span className={`${className} ${styles.logoFallback}`} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
    }
    // Decorativo: el nombre ya está escrito al lado.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className={className} onError={() => setFailed(true)} />;
}

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function OptionRow({ name, sub, logo, selected, onToggle, ariaLabel }: {
    name: string;
    sub?: string;
    logo: string | null;
    selected: boolean;
    onToggle: () => void;
    ariaLabel?: string;
}) {
    return (
        <li>
            <button
                type="button"
                className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
                aria-pressed={selected}
                aria-label={ariaLabel}
                onClick={onToggle}
            >
                <Logo src={logo} name={name} className={styles.logo} />
                <span className={styles.rowText}>
                    <span className={styles.rowName}>{name}</span>
                    {sub ? <span className={styles.rowSub}>{sub}</span> : null}
                </span>
                <span className={styles.check}><CheckIcon /></span>
            </button>
        </li>
    );
}

function LeagueRows({ options, selected, onToggle }: {
    options: LeagueOption[];
    selected: Map<string, Picked>;
    onToggle: (option: LeagueOption) => void;
}) {
    return (
        <ul className={styles.list}>
            {options.map((option) => (
                <OptionRow key={option.id} name={option.name} sub={option.subtitle} logo={option.logo} selected={selected.has(option.id)} onToggle={() => onToggle(option)} />
            ))}
        </ul>
    );
}

function ClubRows({ options, selected, onToggle }: {
    options: ClubOption[];
    selected: Map<string, Picked>;
    onToggle: (club: ClubOption) => void;
}) {
    return (
        <ul className={styles.list}>
            {options.map((club) => (
                <OptionRow key={club.id} name={club.name} sub={club.context} logo={club.logo} selected={selected.has(club.id)} onToggle={() => onToggle(club)} />
            ))}
        </ul>
    );
}

function Skeleton({ rows = 6 }: { rows?: number }) {
    return (
        <ul className={styles.list} aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => <li key={index} className={styles.skeletonRow} />)}
        </ul>
    );
}

export default function PreferencesWizard({ variant, editing = false, onClose }: PreferencesWizardProps) {
    const { user, refreshOnboardingStatus } = useAuth();
    const { activeSports, selectedSport, setSelectedSport } = useSport();
    const prefs = useUserPreferences();
    const {
        favorites, ready: favoritesReady, isFavorite, isLeagueFavorite, toggleFavorite, toggleLeagueFavorite,
    } = useFavorites();

    const [step, setStep] = useState<StepId>('sport');
    const [sportId, setSportId] = useState<string | null>(null);
    const [leagues, setLeagues] = useState<Map<string, Picked>>(new Map());
    const [clubs, setClubs] = useState<Map<string, Picked>>(new Map());
    const [query, setQuery] = useState('');
    const [showAllLeagues, setShowAllLeagues] = useState(false);
    const [clubsShown, setClubsShown] = useState(CLUBS_PAGE);
    // Pantallita de "versiones de tu club": se muestra después de elegir clubes que tienen categorías o ramas.
    const [reviewing, setReviewing] = useState(false);
    const [reviewedRoots, setReviewedRoots] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [visible, setVisible] = useState(variant === 'page');

    const cardRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const seeded = useRef(false);
    const latest = useRef({ isFavorite, isLeagueFavorite });
    latest.current = { isFavorite, isLeagueFavorite };

    // ── Entrada animada del overlay ───────────────────────────────────────
    useEffect(() => {
        if (variant !== 'overlay') return;
        const frame = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(frame);
    }, [variant]);

    // ── Punto de partida: lo que ya tiene configurado ─────────────────────
    useEffect(() => {
        if (seeded.current || !favoritesReady || prefs.isLoading) return;
        seeded.current = true;

        const initialSport = prefs.favoriteSportIds[0]
            ?? readLocalPreferences().sportIds[0]
            ?? (editing ? selectedSport.id : null);
        // Si la persona ya tocó algo antes de que llegara esto, lo suyo manda.
        if (initialSport && activeSports.some((sport) => sport.id === initialSport)) setSportId((current) => current ?? initialSport);

        const seedLeagues = new Map<string, Picked>();
        const seedClubs = new Map<string, Picked>();
        for (const favorite of favorites) {
            const picked = { name: favorite.name, logo: favorite.logo_url ?? null };
            if (favorite.entity_type === 'league') seedLeagues.set(favorite.id, picked);
            else if (favorite.entity_type === 'club') seedClubs.set(favorite.id, picked);
        }
        // Alguien que ya hizo el recorrido sin cuenta y ahora se registró no lo repite: va directo al resumen.
        if (!editing && initialSport && readLocalPreferences().completedAt !== null) setStep('confirm');
        setLeagues((current) => (current.size > 0 ? current : seedLeagues));
        setClubs((current) => (current.size > 0 ? current : seedClubs));
    }, [activeSports, editing, favorites, favoritesReady, prefs.favoriteSportIds, prefs.isLoading, selectedSport.id]);

    // ── Competiciones: se precargan al elegir el deporte ──────────────────
    // Primera tanda (base + estático): rápida, se muestra completa de una vez tras un
    // esqueleto. Segunda tanda (catálogo externo de rugby): lenta, se agrega por abajo.
    const leagueCache = useRef(new Map<string, { base: LeagueOption[]; extra: LeagueOption[] }>());
    const [leagueState, setLeagueState] = useState<{ base: LeagueOption[]; extra: LeagueOption[]; loading: boolean; loadingMore: boolean; partial: boolean }>(
        { base: [], extra: [], loading: false, loadingMore: false, partial: false },
    );
    const [leagueRetry, setLeagueRetry] = useState(0);

    useEffect(() => {
        if (!sportId) return;
        const cached = leagueCache.current.get(sportId);
        if (cached) {
            setLeagueState({ ...cached, loading: false, loadingMore: false, partial: false });
            return;
        }
        setLeagueState({ base: [], extra: [], loading: true, loadingMore: false, partial: false });

        const controller = new AbortController();
        (async () => {
            const { options: base, partial } = await loadPrimaryLeagueOptions(sportId);
            if (controller.signal.aborted) return;
            setLeagueState({ base, extra: [], loading: false, loadingMore: sportId === 'rugby', partial });

            const { extra, failed } = await loadExternalLeagueOptions(sportId, base, controller.signal);
            if (controller.signal.aborted) return;
            if (!partial && !failed) leagueCache.current.set(sportId, { base, extra });
            setLeagueState({ base, extra, loading: false, loadingMore: false, partial: partial || failed });
        })();
        return () => controller.abort();
    }, [sportId, leagueRetry]);

    // ── Clubes: también se precargan, mientras se eligen las competiciones ─
    const clubCache = useRef(new Map<string, ClubOption[]>());
    const [clubState, setClubState] = useState<{ options: ClubOption[]; loading: boolean; failed: boolean; partial: boolean }>(
        { options: [], loading: false, failed: false, partial: false },
    );
    const [clubRetry, setClubRetry] = useState(0);
    // Los clubes no dependen de las ligas elegidas: se piden apenas hay deporte, así el paso 3 ya está listo.
    const wantClubs = Boolean(sportId);

    useEffect(() => {
        if (!sportId || !wantClubs) return;
        const cached = clubCache.current.get(sportId);
        if (cached) {
            setClubState({ options: cached, loading: false, failed: false, partial: false });
            return;
        }
        setClubState({ options: [], loading: true, failed: false, partial: false });

        const controller = new AbortController();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        loadClubOptions(sportId, timeZone, controller.signal)
            .then(({ options, failed, partial }) => {
                if (!failed && !partial) clubCache.current.set(sportId, options);
                setClubState({ options, loading: false, failed, partial });
            })
            .catch(() => {
                if (!controller.signal.aborted) setClubState({ options: [], loading: false, failed: true, partial: false });
            });
        return () => controller.abort();
    }, [sportId, wantClubs, clubRetry]);

    // ── Clubes de las competiciones elegidas ──────────────────────────────
    // Los inscriptos de cada una (no solo los que juegan en la ventana del feed). Se piden
    // apenas se eligen, mientras todavía se está en el paso de competiciones.
    const participantsCache = useRef(new Map<string, Array<{ id: string; name: string; logo: string | null }> | null>());
    const [participants, setParticipants] = useState<{ ids: Set<string>; extra: ClubOption[]; loading: boolean }>(
        { ids: new Set(), extra: [], loading: false },
    );
    const leagueKey = [...leagues.keys()].sort().join('|');
    const wantParticipants = step === 'leagues' || step === 'clubs';

    useEffect(() => {
        if (!wantParticipants) return;
        const selected = leagueKey ? leagueKey.split('|').slice(0, MAX_LEAGUES_FOR_CLUBS) : [];
        if (selected.length === 0) {
            setParticipants({ ids: new Set(), extra: [], loading: false });
            return;
        }

        const build = () => {
            const ids = new Set<string>();
            const extra = new Map<string, ClubOption>();
            for (const leagueId of selected) {
                for (const club of participantsCache.current.get(leagueId) ?? []) {
                    ids.add(club.id);
                    if (!extra.has(club.id)) {
                        extra.set(club.id, { id: club.id, name: club.name, logo: club.logo, context: '', countryId: null, leagueIds: [leagueId], baseId: null });
                    }
                }
            }
            return { ids, extra: [...extra.values()] };
        };

        const missing = selected.filter((leagueId) => !participantsCache.current.has(leagueId));
        if (missing.length === 0) {
            setParticipants({ ...build(), loading: false });
            return;
        }

        setParticipants((current) => ({ ...current, loading: true }));
        const controller = new AbortController();
        Promise.allSettled(missing.map((leagueId) => loadLeagueClubs(leagueId, controller.signal).then((clubsOfLeague) => {
            participantsCache.current.set(leagueId, clubsOfLeague);
        }))).then(() => {
            if (controller.signal.aborted) return;
            setParticipants({ ...build(), loading: false });
        });
        return () => controller.abort();
    }, [leagueKey, wantParticipants]);

    // ── Navegación ────────────────────────────────────────────────────────
    const stepIndex = STEPS.indexOf(step);

    const goTo = useCallback((next: StepId) => {
        setStep(next);
        setReviewing(false);
        setQuery('');
        setSaveError(null);
        requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    }, []);

    useEffect(() => {
        titleRef.current?.focus({ preventScroll: true });
    }, []);

    const dismiss = useCallback(() => {
        if (variant === 'overlay') {
            dismissDeviceSportPrompt();
            writeLocalPreferences({ completedAt: Date.now(), skipped: true });
        }
        onClose('dismissed');
    }, [onClose, variant]);

    // Escape cierra el overlay; Tab queda adentro del diálogo.
    useEffect(() => {
        if (variant !== 'overlay') return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                dismiss();
                return;
            }
            if (event.key !== 'Tab' || !cardRef.current) return;
            const focusables = Array.from(
                cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input'),
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [dismiss, variant]);

    // ── Selección ─────────────────────────────────────────────────────────
    const togglePicked = useCallback((setter: typeof setLeagues, id: string, picked: Picked) => {
        setter((current) => {
            const next = new Map(current);
            if (next.has(id)) next.delete(id);
            else next.set(id, picked);
            return next;
        });
    }, []);

    const toggleClub = useCallback((club: ClubOption) => {
        togglePicked(setClubs, club.id, { name: club.name, logo: club.logo });
    }, [togglePicked]);

    // "Seguir todas las versiones": si ya estaban todas, las quita.
    const followAllVersions = useCallback((versions: ClubOption[]) => {
        setClubs((current) => {
            const next = new Map(current);
            const allOn = versions.every((version) => next.has(version.id));
            versions.forEach((version) => {
                if (allOn) next.delete(version.id);
                else next.set(version.id, { name: version.name, logo: version.logo });
            });
            return next;
        });
    }, []);

    const chooseSport = useCallback((id: string) => {
        setSportId(id);
        setShowAllLeagues(false);
        setClubsShown(CLUBS_PAGE);
    }, []);

    // ── Guardado ──────────────────────────────────────────────────────────
    const skipAll = useCallback(async () => {
        if (saving) return;
        setSaving(true);
        try {
            writeLocalPreferences({ completedAt: Date.now(), skipped: true });
            dismissDeviceSportPrompt();
            if (user) {
                const response = await fetch('/api/onboarding/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ skipped: true }),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                setOnboardingStorageStatus(user.id, { skipped: true });
                await refreshOnboardingStatus();
            }
            onClose('skipped');
        } catch (error) {
            console.error('[PreferencesWizard] skip error:', error);
            setSaveError('No pudimos guardar el cambio. Revisá tu conexión e intentá de nuevo.');
        } finally {
            setSaving(false);
        }
    }, [onClose, refreshOnboardingStatus, saving, user]);

    const finish = useCallback(async () => {
        if (saving) return;
        setSaving(true);
        setSaveError(null);

        try {
            // 1. Competiciones y clubes: solo lo que cambió respecto de lo que ya seguía.
            const operations: Promise<void>[] = [];
            const currentLeagues = new Set<string>();
            const currentClubs = new Set<string>();
            for (const favorite of favorites) {
                if (favorite.entity_type === 'league') {
                    currentLeagues.add(favorite.id);
                    if (!leagues.has(favorite.id)) operations.push(toggleLeagueFavorite(favorite.id, { forceIsFavorite: false }));
                } else if (favorite.entity_type === 'club') {
                    currentClubs.add(favorite.id);
                    if (!clubs.has(favorite.id)) operations.push(toggleFavorite({ id: favorite.id, entity_type: 'club', forceIsFavorite: false }));
                }
            }
            leagues.forEach((picked, id) => {
                if (currentLeagues.has(id)) return;
                operations.push(toggleLeagueFavorite(id, { name: picked.name, logo_url: picked.logo, sportId, forceIsFavorite: true }));
            });
            clubs.forEach((picked, id) => {
                if (currentClubs.has(id)) return;
                operations.push(toggleFavorite({ id, entity_type: 'club', name: picked.name, logo_url: picked.logo, sport_id: sportId, forceIsFavorite: true }));
            });
            await Promise.all(operations);

            // Las funciones de seguir no lanzan: ante un error deshacen el cambio. Se verifica el resultado.
            await new Promise((resolve) => setTimeout(resolve, 60));
            const missing =
                [...leagues.keys()].filter((id) => !latest.current.isLeagueFavorite(id)).length
                + [...clubs.keys()].filter((id) => !latest.current.isFavorite(id, 'club')).length;
            if (missing > 0) {
                setSaveError(`No pudimos guardar ${missing === 1 ? 'una elección' : `${missing} elecciones`}. Revisá tu conexión e intentá de nuevo.`);
                return;
            }

            // 2. Deporte principal (los demás favoritos se conservan) y marca de onboarding.
            const sportIds = sportId
                ? [sportId, ...prefs.favoriteSportIds.filter((id) => id !== sportId)]
                : prefs.favoriteSportIds;
            if (user) {
                const response = await fetch('/api/onboarding/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ skipped: false, sportIds }),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                setOnboardingStorageStatus(user.id, { skipped: false });
                invalidateUserPreferences(user.id);
                await refreshOnboardingStatus();
            }
            writeLocalPreferences({ sportIds, completedAt: Date.now(), skipped: false });
            const sport = activeSports.find((candidate) => candidate.id === sportId);
            if (sport) setSelectedSport(sport);
            onClose('done');
        } catch (error) {
            console.error('[PreferencesWizard] finish error:', error);
            setSaveError('No pudimos guardar tus preferencias. Revisá tu conexión e intentá de nuevo.');
        } finally {
            setSaving(false);
        }
    }, [
        activeSports, clubs, favorites, leagues, onClose, prefs.favoriteSportIds, refreshOnboardingStatus,
        saving, setSelectedSport, sportId, toggleFavorite, toggleLeagueFavorite, user,
    ]);

    // ── Vistas derivadas ──────────────────────────────────────────────────
    const q = fold(query.trim());
    const userCountryId = useMemo(() => detectUserCountryId(), []);
    const userCountryName = userCountryId ? getCountryById(userCountryId)?.nameEs ?? null : null;

    // Competiciones: primero las del país del visitante ("Recomendadas"), después el resto.
    const leagueOptions = useMemo(() => [...leagueState.base, ...leagueState.extra], [leagueState]);
    const leagueGroups = useMemo(() => {
        const matching = leagueOptions.filter((option) => !q || fold(`${option.name} ${option.subtitle}`).includes(q));
        if (q || !userCountryId) return { recommended: [] as LeagueOption[], rest: matching, total: matching.length };
        // Recomendadas: los regionales de tu país (y los nacionales) que se juegan ESTE año; ver pickRecommendedLeagues.
        const recommended = pickRecommendedLeagues(matching, userCountryId, RECOMMENDED_MAX, RECOMMENDED_FALLBACK);
        const taken = new Set(recommended.map((option) => option.id));
        return { recommended, rest: matching.filter((option) => !taken.has(option.id)), total: matching.length };
    }, [leagueOptions, q, userCountryId]);
    const visibleRest = q || showAllLeagues ? leagueGroups.rest : leagueGroups.rest.slice(0, LEAGUES_PAGE);
    const knownLeagueIds = useMemo(() => new Set(leagueOptions.map((option) => option.id)), [leagueOptions]);
    const otherSelectedLeagues = [...leagues].filter(([id]) => !knownLeagueIds.has(id));

    // Clubes: todos los del deporte, con sus categorías y ramas agrupadas bajo el club base.
    // Se destacan los de las ligas elegidas y los del país del visitante.
    const allClubs = useMemo(() => {
        const known = new Set(clubState.options.map((club) => club.id));
        return [...clubState.options, ...participants.extra.filter((club) => !known.has(club.id))];
    }, [clubState.options, participants.extra]);
    const clubTree = useMemo(() => buildClubTree(allClubs), [allClubs]);
    const nameMatches = useCallback((club: ClubOption) => fold(`${club.name} ${club.context}`).includes(q), [q]);
    // Buscando: del club base se ven solo las categorías que coinciden (salvo que coincida el propio club).
    const childrenFor = useCallback((root: ClubOption) => {
        const categories = clubTree.childrenOf.get(root.id) ?? [];
        return !q || nameMatches(root) ? categories : categories.filter(nameMatches);
    }, [clubTree, nameMatches, q]);
    const clubGroups = useMemo(() => {
        const wanted = new Set(leagues.keys());
        const matching = clubTree.roots.filter((root) => !q || nameMatches(root) || childrenFor(root).length > 0);
        if (q) return { inLeagues: [] as ClubOption[], local: [] as ClubOption[], rest: matching, total: matching.length };
        // Del torneo elegido: está inscripto (la base) o se lo vio jugando en esa competición (el feed).
        const playsInWanted = (root: ClubOption) => [root, ...(clubTree.childrenOf.get(root.id) ?? [])]
            .some((club) => participants.ids.has(club.id) || club.leagueIds.some((id) => wanted.has(id)));
        const inLeagues = wanted.size === 0 ? [] : matching.filter(playsInWanted);
        const taken = new Set(inLeagues.map((club) => club.id));
        const local = userCountryId
            ? matching.filter((club) => !taken.has(club.id) && club.countryId === userCountryId)
            : [];
        local.forEach((club) => taken.add(club.id));
        return { inLeagues, local, rest: matching.filter((club) => !taken.has(club.id)), total: matching.length };
    }, [childrenFor, clubTree, leagues, nameMatches, participants.ids, q, userCountryId]);
    // El tope de filas se reparte en orden de grupo; "Ver más" suma de a CLUBS_PAGE.
    const clubLimit = q ? Infinity : clubsShown;
    const clubSlices = (() => {
        let left = clubLimit;
        const take = (list: ClubOption[]) => {
            const slice = list.slice(0, Math.max(left, 0));
            left -= slice.length;
            return slice;
        };
        return { inLeagues: take(clubGroups.inLeagues), local: take(clubGroups.local), rest: take(clubGroups.rest) };
    })();
    const clubsRemaining = clubGroups.total - clubSlices.inLeagues.length - clubSlices.local.length - clubSlices.rest.length;
    const knownClubIds = useMemo(() => new Set(allClubs.map((club) => club.id)), [allClubs]);
    const otherSelectedClubs = [...clubs].filter(([id]) => !knownClubIds.has(id));

    const clubById = useMemo(() => new Map(allClubs.map((club) => [club.id, club])), [allClubs]);
    const pendingFamilies = [...clubs.keys()]
        .map((id) => clubById.get(id))
        .filter((club): club is ClubOption => Boolean(club) && (clubTree.childrenOf.get(club!.id)?.length ?? 0) > 0 && !reviewedRoots.has(club!.id));

    const sport = activeSports.find((candidate) => candidate.id === sportId) ?? null;

    // ── Pie: el botón dice qué falta, siempre ─────────────────────────────
    const primaryLabel = (() => {
        if (saving) return 'Guardando…';
        if (step === 'sport') return sportId ? 'Continuar' : 'Elegí un deporte para continuar';
        if (step === 'leagues') return leagues.size > 0 ? `Continuar · ${leagues.size} elegida${leagues.size === 1 ? '' : 's'}` : 'Continuar sin elegir';
        if (step === 'clubs') return clubs.size > 0 ? `Continuar · ${clubs.size} elegido${clubs.size === 1 ? '' : 's'}` : 'Continuar sin elegir';
        return 'Finalizar';
    })();
    const primaryDisabled = saving || (step === 'sport' && !sportId);

    const onPrimary = () => {
        if (step === 'confirm') {
            void finish();
        } else if (step === 'clubs' && reviewing) {
            setReviewedRoots((current) => new Set([...current, ...pendingFamilies.map((club) => club.id)]));
            goTo('confirm');
        } else if (step === 'clubs' && pendingFamilies.length > 0) {
            setReviewing(true);
            requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
        } else {
            goTo(STEPS[stepIndex + 1]);
        }
    };

    const showingReview = step === 'clubs' && reviewing;
    const heading = showingReview
        ? {
            title: pendingFamilies.length === 1 ? '¿Seguís todas las versiones de tu club?' : '¿Seguís todas las versiones de tus clubes?',
            subtitle: 'Tienen categorías y ramas. Seguilas todas con un toque o elegí solo algunas.',
        }
        : TITLES[step];

    const content = (
        <div
            ref={cardRef}
            className={`${styles.card} ${visible ? styles.cardVisible : ''}`}
            role={variant === 'overlay' ? 'dialog' : undefined}
            aria-modal={variant === 'overlay' ? 'true' : undefined}
            aria-labelledby="prefs-wizard-title"
        >
            <div className={styles.top}>
                <div className={styles.topRow}>
                    <span className={styles.stepLabel}>Paso {stepIndex + 1} de {STEPS.length}</span>
                    <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={editing ? dismiss : (user ? skipAll : dismiss)}
                        disabled={saving}
                    >
                        {editing ? 'Cerrar' : 'Omitir'}
                    </button>
                </div>
                <div className={styles.progress} aria-hidden="true">
                    {STEPS.map((id, index) => (
                        <span key={id} className={`${styles.progressSeg} ${index <= stepIndex ? styles.progressSegDone : ''}`} />
                    ))}
                </div>
                <h2 id="prefs-wizard-title" className={styles.title} ref={titleRef} tabIndex={-1}>{heading.title}</h2>
                <p className={styles.subtitle}>{heading.subtitle}</p>
            </div>

            <div className={styles.body}>
                <div key={step} className={styles.stepEnter}>
                    {step === 'sport' && (
                        <div className={styles.sportGrid} role="radiogroup" aria-label="Deporte favorito">
                            {activeSports.map((candidate) => {
                                const selected = candidate.id === sportId;
                                return (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        className={`${styles.sportCard} ${selected ? styles.sportCardSelected : ''}`}
                                        onClick={() => chooseSport(candidate.id)}
                                    >
                                        <span className={styles.sportIcon} aria-hidden="true">{candidate.icon}</span>
                                        <span className={styles.sportName}>{candidate.nameEs}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {step === 'leagues' && (
                        <>
                            {leagueOptions.length > 12 && (
                                <div className={styles.search}>
                                    <input
                                        type="search"
                                        className={styles.searchInput}
                                        placeholder={`Buscar competición de ${sport?.nameEs ?? 'este deporte'}`}
                                        aria-label="Buscar competición"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                    />
                                </div>
                            )}

                            {otherSelectedLeagues.length > 0 && !q && (
                                <>
                                    <p className={styles.groupLabel}>Ya seguís</p>
                                    <ul className={styles.list}>
                                        {otherSelectedLeagues.map(([id, picked]) => (
                                            <OptionRow key={id} name={picked.name} logo={picked.logo} selected onToggle={() => togglePicked(setLeagues, id, picked)} />
                                        ))}
                                    </ul>
                                </>
                            )}

                            {leagueState.loading ? (
                                <Skeleton />
                            ) : leagueGroups.total === 0 ? (
                                <p className={styles.empty}>
                                    {q ? 'No encontramos una competición con ese nombre.' : 'Todavía no hay competiciones cargadas para este deporte. Podés continuar.'}
                                </p>
                            ) : (
                                <>
                                    {leagueGroups.recommended.length > 0 && (
                                        <>
                                            <p className={styles.groupLabel}>{userCountryName ? `Recomendadas en ${userCountryName}` : 'Recomendadas para vos'}</p>
                                            <LeagueRows options={leagueGroups.recommended} selected={leagues} onToggle={(option) => togglePicked(setLeagues, option.id, { name: option.name, logo: option.logo })} />
                                        </>
                                    )}
                                    {visibleRest.length > 0 && (
                                        <>
                                            {leagueGroups.recommended.length > 0 && <p className={styles.groupLabel}>Más competiciones</p>}
                                            <LeagueRows options={visibleRest} selected={leagues} onToggle={(option) => togglePicked(setLeagues, option.id, { name: option.name, logo: option.logo })} />
                                        </>
                                    )}
                                </>
                            )}

                            {!q && !showAllLeagues && leagueGroups.rest.length > LEAGUES_PAGE && (
                                <button type="button" className={styles.moreBtn} onClick={() => setShowAllLeagues(true)}>
                                    Ver las {leagueGroups.rest.length - LEAGUES_PAGE} restantes
                                </button>
                            )}
                            {leagueState.loadingMore && (
                                <p className={styles.notice} role="status">Buscando más competiciones…</p>
                            )}
                            {leagueState.partial && !leagueState.loading && !leagueState.loadingMore && (
                                <div className={styles.notice} role="status">
                                    <span>Faltan algunas competiciones por cargar.</span>
                                    <button type="button" className={styles.noticeBtn} onClick={() => setLeagueRetry((count) => count + 1)}>Reintentar</button>
                                </div>
                            )}
                        </>
                    )}

                    {showingReview && (
                        <div className={styles.reviewList}>
                            {pendingFamilies.map((root) => {
                                const versions = clubTree.childrenOf.get(root.id) ?? [];
                                const allOn = versions.every((version) => clubs.has(version.id));
                                return (
                                    <section key={root.id} className={styles.reviewCard} aria-label={`Versiones de ${root.name}`}>
                                        <div className={styles.reviewHead}>
                                            <Logo src={root.logo} name={root.name} className={styles.logo} />
                                            <span className={styles.rowText}>
                                                <span className={styles.rowName}>{root.name}</span>
                                                <span className={styles.rowSub}>{versions.length} {versions.length === 1 ? 'versión' : 'versiones'}</span>
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`${styles.reviewAll} ${allOn ? styles.reviewAllOn : ''}`}
                                            aria-pressed={allOn}
                                            onClick={() => followAllVersions(versions)}
                                        >
                                            {allOn ? 'Siguiendo todas las versiones' : `Seguir todas las versiones (${versions.length})`}
                                        </button>
                                        <p className={styles.groupLabel}>O elegí algunas</p>
                                        <ul className={styles.list}>
                                            {versions.map((version) => (
                                                <OptionRow
                                                    key={version.id}
                                                    name={categoryLabel(version, root)}
                                                    ariaLabel={version.name}
                                                    logo={version.logo}
                                                    selected={clubs.has(version.id)}
                                                    onToggle={() => toggleClub(version)}
                                                />
                                            ))}
                                        </ul>
                                    </section>
                                );
                            })}
                        </div>
                    )}

                    {step === 'clubs' && !reviewing && (
                        <>
                            {clubState.options.length > 12 && (
                                <div className={styles.search}>
                                    <input
                                        type="search"
                                        className={styles.searchInput}
                                        placeholder="Buscar club"
                                        aria-label="Buscar club"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                    />
                                </div>
                            )}

                            {otherSelectedClubs.length > 0 && !q && (
                                <>
                                    <p className={styles.groupLabel}>Ya seguís</p>
                                    <ul className={styles.list}>
                                        {otherSelectedClubs.map(([id, picked]) => (
                                            <OptionRow key={id} name={picked.name} logo={picked.logo} selected onToggle={() => togglePicked(setClubs, id, picked)} />
                                        ))}
                                    </ul>
                                </>
                            )}

                            {clubState.loading ? (
                                <Skeleton />
                            ) : clubState.failed ? (
                                <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                                    <span>No pudimos cargar los clubes. Podés continuar y seguirlos más tarde.</span>
                                    <button type="button" className={styles.noticeBtn} onClick={() => setClubRetry((count) => count + 1)}>Reintentar</button>
                                </div>
                            ) : clubGroups.total === 0 ? (
                                <p className={styles.empty}>
                                    {q
                                        ? 'No encontramos un club con ese nombre.'
                                        : 'Todavía no hay clubes cargados para este deporte. Podés seguirlos más tarde desde la ficha de cada club.'}
                                </p>
                            ) : (
                                <>
                                    {participants.loading && leagues.size > 0 && !q && clubSlices.inLeagues.length === 0 && (
                                        <>
                                            <p className={styles.groupLabel}>En tus competiciones</p>
                                            <Skeleton rows={3} />
                                        </>
                                    )}
                                    {clubSlices.inLeagues.length > 0 && (
                                        <>
                                            <p className={styles.groupLabel}>En tus competiciones</p>
                                            <ClubRows options={clubSlices.inLeagues} selected={clubs} onToggle={toggleClub} />
                                        </>
                                    )}
                                    {clubSlices.local.length > 0 && (
                                        <>
                                            <p className={styles.groupLabel}>{userCountryName ? `Clubes de ${userCountryName}` : 'Recomendados para vos'}</p>
                                            <ClubRows options={clubSlices.local} selected={clubs} onToggle={toggleClub} />
                                        </>
                                    )}
                                    {clubSlices.rest.length > 0 && (
                                        <>
                                            {(clubSlices.inLeagues.length > 0 || clubSlices.local.length > 0) && <p className={styles.groupLabel}>Todos los clubes</p>}
                                            <ClubRows options={clubSlices.rest} selected={clubs} onToggle={toggleClub} />
                                        </>
                                    )}
                                    {clubsRemaining > 0 && (
                                        <button type="button" className={styles.moreBtn} onClick={() => setClubsShown((count) => count + CLUBS_PAGE)}>
                                            Ver {Math.min(CLUBS_PAGE, clubsRemaining)} más · quedan {clubsRemaining}
                                        </button>
                                    )}
                                    {clubState.partial && (
                                        <div className={styles.notice} role="status">
                                            <span>Algunos clubes no cargaron.</span>
                                            <button type="button" className={styles.noticeBtn} onClick={() => setClubRetry((count) => count + 1)}>Reintentar</button>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {step === 'confirm' && (
                        <>
                            <section className={styles.summarySection}>
                                <div className={styles.summaryHead}>
                                    <span className={styles.summaryTitle}>Deporte</span>
                                    <button type="button" className={styles.linkBtn} onClick={() => goTo('sport')}>Cambiar</button>
                                </div>
                                {sport ? (
                                    <div className={styles.chips}><span className={styles.chip}><span aria-hidden="true">{sport.icon}</span>{sport.nameEs}</span></div>
                                ) : (
                                    <p className={styles.summaryEmpty}>Sin elegir. Vas a ver el deporte de siempre.</p>
                                )}
                            </section>

                            <section className={styles.summarySection}>
                                <div className={styles.summaryHead}>
                                    <span className={styles.summaryTitle}>Competiciones · {leagues.size}</span>
                                    <button type="button" className={styles.linkBtn} onClick={() => goTo('leagues')} disabled={!sportId}>Cambiar</button>
                                </div>
                                {leagues.size > 0 ? (
                                    <div className={styles.chips}>
                                        {[...leagues].map(([id, picked]) => (
                                            <span key={id} className={styles.chip}><Logo src={picked.logo} name={picked.name} className={styles.chipLogo} />{picked.name}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={styles.summaryEmpty}>Ninguna. Podés seguirlas con la estrella en cualquier momento.</p>
                                )}
                            </section>

                            <section className={styles.summarySection}>
                                <div className={styles.summaryHead}>
                                    <span className={styles.summaryTitle}>Clubes · {clubs.size}</span>
                                    <button type="button" className={styles.linkBtn} onClick={() => goTo('clubs')} disabled={!sportId}>Cambiar</button>
                                </div>
                                {clubs.size > 0 ? (
                                    <div className={styles.chips}>
                                        {[...clubs].map(([id, picked]) => (
                                            <span key={id} className={styles.chip}><Logo src={picked.logo} name={picked.name} className={styles.chipLogo} />{picked.name}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={styles.summaryEmpty}>Ninguno. Podés seguirlos desde la ficha de cada club.</p>
                                )}
                            </section>

                            {!user && (
                                <p className={styles.deviceNote}>
                                    Tus favoritos quedan guardados en este dispositivo.{' '}
                                    <Link href="/register">Creá una cuenta</Link> para llevarlos a otro.
                                </p>
                            )}
                        </>
                    )}

                    {saveError && <p className={styles.errorLine} role="alert">{saveError}</p>}
                </div>
            </div>

            <div className={styles.footer}>
                {stepIndex > 0 && (
                    <button type="button" className={styles.btnSecondary} onClick={() => (showingReview ? setReviewing(false) : goTo(STEPS[stepIndex - 1]))} disabled={saving}>
                        Atrás
                    </button>
                )}
                <button type="button" className={styles.btnPrimary} onClick={onPrimary} disabled={primaryDisabled}>
                    {primaryLabel}
                </button>
            </div>
        </div>
    );

    if (variant === 'page') return <div className={styles.pageShell}>{content}</div>;
    return <div className={`${styles.backdrop} ${visible ? styles.backdropVisible : ''}`}>{content}</div>;
}
