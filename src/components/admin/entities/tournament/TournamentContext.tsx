'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MatchEventDefinition } from '@/lib/matchEventCatalog';

export type TournamentDraftSection = 'details' | 'format' | 'structure';

export interface TournamentDetailsDraft {
    name: string;
    display_name: string;
    slug: string;
    season_id: string;
    priority: number;
    sport_id: string;
    union_id: string;
    country_id: string;
    country_label: string;
    region: string;
    category: string;
    age_grade: string;
    logo_url: string;
    ruleset: Record<string, unknown>;
}

export interface TournamentFormatDraft {
    definitions: MatchEventDefinition[];
}

type TournamentDraftPayloads = {
    details?: TournamentDetailsDraft;
    format?: TournamentFormatDraft;
    // Structure has its own per-action save buttons (model selector, phase
    // wizard) so we do not stash a draft payload here — only the dirty flag
    // is tracked, and the slot is reserved for parity with other sections.
    structure?: { touched: true };
};

type TournamentDirtySections = Partial<Record<TournamentDraftSection, boolean>>;

interface TournamentDirtyCtxType {
    tournamentId: string;
    isDirty: boolean;
    drafts: TournamentDraftPayloads;
    dirtySections: TournamentDirtySections;
    recentlySavedSections: TournamentDirtySections;
    setDirty: (v: boolean) => void;
    getSectionDraft: <T>(section: TournamentDraftSection) => T | undefined;
    setSectionDraft: <T>(section: TournamentDraftSection, value: T) => void;
    clearSectionDraft: (section: TournamentDraftSection) => void;
    clearAllDrafts: () => void;
    markSectionDirty: (section: TournamentDraftSection, value: boolean) => void;
    hasDirtySection: (section: TournamentDraftSection) => boolean;
    triggerSectionSavedFlash: (section: TournamentDraftSection) => void;
    hasRecentlySavedSection: (section: TournamentDraftSection) => boolean;
    flushDraftPersistence: () => void;
}

const STORAGE_VERSION = 1;

const TournamentDirtyCtx = createContext<TournamentDirtyCtxType>({
    tournamentId: '',
    isDirty: false,
    drafts: {},
    dirtySections: {},
    recentlySavedSections: {},
    setDirty: () => { },
    getSectionDraft: () => undefined,
    setSectionDraft: () => { },
    clearSectionDraft: () => { },
    clearAllDrafts: () => { },
    markSectionDirty: () => { },
    hasDirtySection: () => false,
    triggerSectionSavedFlash: () => { },
    hasRecentlySavedSection: () => false,
    flushDraftPersistence: () => { },
});

function getStorageKey(tournamentId: string) {
    return `tournament-manage-draft:${tournamentId}`;
}

function readStoredState(storageKey: string): {
    drafts: TournamentDraftPayloads;
    dirtySections: TournamentDirtySections;
    legacyDirty: boolean;
} {
    if (typeof window === 'undefined') {
        return {
            drafts: {},
            dirtySections: {},
            legacyDirty: false,
        };
    }

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return {
                drafts: {},
                dirtySections: {},
                legacyDirty: false,
            };
        }

        const parsed = JSON.parse(raw) as {
            version?: number;
            drafts?: TournamentDraftPayloads;
            dirtySections?: TournamentDirtySections;
            legacyDirty?: boolean;
        };

        if (parsed.version !== STORAGE_VERSION) {
            window.localStorage.removeItem(storageKey);
            return {
                drafts: {},
                dirtySections: {},
                legacyDirty: false,
            };
        }

        return {
            drafts: parsed.drafts ?? {},
            dirtySections: parsed.dirtySections ?? {},
            legacyDirty: Boolean(parsed.legacyDirty),
        };
    } catch {
        window.localStorage.removeItem(storageKey);
        return {
            drafts: {},
            dirtySections: {},
            legacyDirty: false,
        };
    }
}

function hasDraftContent(drafts: TournamentDraftPayloads, dirtySections: TournamentDirtySections, legacyDirty: boolean) {
    return legacyDirty || Object.values(dirtySections).some(Boolean) || Object.keys(drafts).length > 0;
}

export function TournamentDraftProvider({
    tournamentId,
    children,
}: {
    tournamentId: string;
    children: ReactNode;
}) {
    const storageKey = useMemo(() => getStorageKey(tournamentId), [tournamentId]);
    const [drafts, setDrafts] = useState<TournamentDraftPayloads>(() => readStoredState(storageKey).drafts);
    const [dirtySections, setDirtySections] = useState<TournamentDirtySections>(() => readStoredState(storageKey).dirtySections);
    const [legacyDirty, setLegacyDirty] = useState(() => readStoredState(storageKey).legacyDirty);
    const [recentlySavedSections, setRecentlySavedSections] = useState<TournamentDirtySections>({});

    // Persistencia de drafts DEBOUNCED: no escribir localStorage sincrónicamente en cada
    // tecleo. Un ref espeja lo último a persistir para que el flush (beforeunload) sea sync.
    const persistTimeoutRef = useRef<number | null>(null);
    const persistPayloadRef = useRef({ drafts, dirtySections, legacyDirty });
    useEffect(() => {
        persistPayloadRef.current = { drafts, dirtySections, legacyDirty };
    });

    const writePersistNow = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (persistTimeoutRef.current !== null) {
            window.clearTimeout(persistTimeoutRef.current);
            persistTimeoutRef.current = null;
        }
        const snapshot = persistPayloadRef.current;
        if (!hasDraftContent(snapshot.drafts, snapshot.dirtySections, snapshot.legacyDirty)) {
            window.localStorage.removeItem(storageKey);
            return;
        }
        window.localStorage.setItem(storageKey, JSON.stringify({
            version: STORAGE_VERSION,
            drafts: snapshot.drafts,
            dirtySections: snapshot.dirtySections,
            legacyDirty: snapshot.legacyDirty,
        }));
    }, [storageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Transición a "sin draft": limpiar YA y cancelar cualquier escritura pendiente,
        // para que un setItem viejo no re-persista el draft después del removeItem. React
        // corre este cleanup ANTES del cuerpo del efecto siguiente, así que el clearTimeout
        // del cleanup ya cancela lo pendiente antes de llegar a este removeItem.
        if (!hasDraftContent(drafts, dirtySections, legacyDirty)) {
            if (persistTimeoutRef.current !== null) {
                window.clearTimeout(persistTimeoutRef.current);
                persistTimeoutRef.current = null;
            }
            window.localStorage.removeItem(storageKey);
            return;
        }

        if (persistTimeoutRef.current !== null) window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = window.setTimeout(() => {
            persistTimeoutRef.current = null;
            window.localStorage.setItem(storageKey, JSON.stringify({
                version: STORAGE_VERSION,
                drafts,
                dirtySections,
                legacyDirty,
            }));
        }, 400);

        return () => {
            if (persistTimeoutRef.current !== null) {
                window.clearTimeout(persistTimeoutRef.current);
                persistTimeoutRef.current = null;
            }
        };
    }, [drafts, dirtySections, legacyDirty, storageKey]);

    const flushDraftPersistence = useCallback(() => {
        writePersistNow();
    }, [writePersistNow]);

    const setSectionDraft = useCallback(<T,>(section: TournamentDraftSection, value: T) => {
        setDrafts((current) => ({
            ...current,
            [section]: value,
        }));
    }, []);

    const getSectionDraft = useCallback(<T,>(section: TournamentDraftSection) => {
        return drafts[section] as T | undefined;
    }, [drafts]);

    const clearSectionDraft = useCallback((section: TournamentDraftSection) => {
        setDrafts((current) => {
            const next = { ...current };
            delete next[section];
            return next;
        });
        setDirtySections((current) => ({
            ...current,
            [section]: false,
        }));
    }, []);

    const clearAllDrafts = useCallback(() => {
        setDrafts({});
        setDirtySections({});
        setLegacyDirty(false);
    }, []);

    const markSectionDirty = useCallback((section: TournamentDraftSection, value: boolean) => {
        setDirtySections((current) => ({
            ...current,
            [section]: value,
        }));
    }, []);

    const hasDirtySection = useCallback((section: TournamentDraftSection) => {
        return Boolean(dirtySections[section]);
    }, [dirtySections]);

    const triggerSectionSavedFlash = useCallback((section: TournamentDraftSection) => {
        setRecentlySavedSections((current) => ({
            ...current,
            [section]: true,
        }));
    }, []);

    const hasRecentlySavedSection = useCallback((section: TournamentDraftSection) => {
        return Boolean(recentlySavedSections[section]);
    }, [recentlySavedSections]);

    useEffect(() => {
        const activeSections = Object.entries(recentlySavedSections)
            .filter(([, value]) => Boolean(value))
            .map(([section]) => section as TournamentDraftSection);

        if (activeSections.length === 0) return;

        const timeout = window.setTimeout(() => {
            setRecentlySavedSections((current) => {
                const next = { ...current };
                activeSections.forEach((section) => {
                    next[section] = false;
                });
                return next;
            });
        }, 2200);

        return () => window.clearTimeout(timeout);
    }, [recentlySavedSections]);

    const isDirty = legacyDirty || Object.values(dirtySections).some(Boolean);

    const value = useMemo<TournamentDirtyCtxType>(() => ({
        tournamentId,
        isDirty,
        drafts,
        dirtySections,
        recentlySavedSections,
        setDirty: setLegacyDirty,
        getSectionDraft,
        setSectionDraft,
        clearSectionDraft,
        clearAllDrafts,
        markSectionDirty,
        hasDirtySection,
        triggerSectionSavedFlash,
        hasRecentlySavedSection,
        flushDraftPersistence,
    }), [
        tournamentId,
        isDirty,
        drafts,
        dirtySections,
        recentlySavedSections,
        getSectionDraft,
        setSectionDraft,
        clearSectionDraft,
        clearAllDrafts,
        markSectionDirty,
        hasDirtySection,
        triggerSectionSavedFlash,
        hasRecentlySavedSection,
        flushDraftPersistence,
    ]);

    return (
        <TournamentDirtyCtx.Provider value={value}>
            {children}
        </TournamentDirtyCtx.Provider>
    );
}

export function useTournamentDirty() {
    return useContext(TournamentDirtyCtx);
}
