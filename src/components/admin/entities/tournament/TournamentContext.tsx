'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MatchEventDefinition } from '@/lib/matchEventCatalog';

export type TournamentDraftSection = 'details' | 'format';

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

    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (!hasDraftContent(drafts, dirtySections, legacyDirty)) {
            window.localStorage.removeItem(storageKey);
            return;
        }

        window.localStorage.setItem(storageKey, JSON.stringify({
            version: STORAGE_VERSION,
            drafts,
            dirtySections,
            legacyDirty,
        }));
    }, [drafts, dirtySections, legacyDirty, storageKey]);

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
