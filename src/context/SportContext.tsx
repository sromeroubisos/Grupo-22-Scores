'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useRef } from 'react';
import type { Sport, SportId } from '@/lib/types';
import { SPORTS, getSportById } from '@/lib/data/sports';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { getFavoriteSports } from '@/lib/services/preferencesService';
import { getDeviceSportId } from '@/lib/deviceSportPreference';

interface SportContextType {
    selectedSport: Sport;
    activeSports: Sport[]; // List of currently visible and ordered sports
    setSelectedSport: (sport: Sport) => void;
    selectSportById: (id: SportId) => void;
    isLoading: boolean;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

type SportConfigRow = {
    id: string;
    is_visible: boolean | null;
    display_order: number | null;
};

// Static defaults so the sport selector renders on first paint, even if the
// Supabase `sports` config endpoint is slow or unreachable. Supabase config
// only refines visibility/order; it must never block the UI.
const DEFAULT_SPORTS: Sport[] = (Object.values(SPORTS) as Sport[])
    .map((sport) => ({
        ...sport,
        isVisible: sport.isActive !== false,
        displayOrder: sport.priority,
    }))
    .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

export function SportProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => createClient(), []);
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [allSports, setAllSports] = useState<Sport[]>(DEFAULT_SPORTS);
    const [selectedSport, setSelectedSport] = useState<Sport>(
        DEFAULT_SPORTS.find((sport) => sport.isVisible !== false && !sport.groupKey)
            ?? (Object.values(SPORTS)[0] as Sport)
    );
    const hasAutoSelectedRef = useRef<string | null>(null);
    // Deporte pedido por URL (?sport=field-hockey). Es la puerta por la que un
    // dominio satelite (cornercorto.com -> hockey) aterriza en su deporte sin
    // pasar por el menu. Se lee en un efecto y no en el useState inicial para
    // que el HTML del servidor y el del cliente coincidan (window no existe en SSR).
    const urlSportRef = useRef<string | null>(null);

    useEffect(() => {
        let requested: string | null = null;
        try {
            requested = new URLSearchParams(window.location.search).get('sport');
        } catch {
            return;
        }
        if (requested) {
            const sport = getSportById(requested as SportId);
            if (sport && sport.isActive !== false && !sport.groupKey) {
                urlSportRef.current = sport.id;
                setSelectedSport(sport);
                return;
            }
        }
        // Sin deporte en la URL: el que el visitante eligió en este dispositivo
        // (FirstVisitSportPicker). Si después hay login con favoritos, el
        // efecto de abajo lo pisa; si no, esto es lo que ve.
        const deviceSportId = getDeviceSportId();
        if (!deviceSportId) return;
        const deviceSport = getSportById(deviceSportId);
        if (deviceSport) setSelectedSport(deviceSport);
    }, []);

    // Filter visible sports and sort by display order.
    // Sports with a groupKey (e.g. rugby-union, rugby-league) are managed
    // under their parent (e.g. rugby) and must not appear as separate entries.
    const activeSports = allSports.filter(s => s.isVisible !== false && !s.groupKey);

    useEffect(() => {
        let cancelled = false;
        const fetchConfig = async () => {
            try {
                const { data: configs, error } = await supabase
                    .from('sports')
                    .select('id, is_visible, display_order')
                    .order('display_order', { ascending: true });

                if (cancelled) return;
                if (error) {
                    // Keep the static defaults already rendered; just log.
                    console.warn('[SportContext] Sports config fetch error:', error.message);
                    return;
                }

                const staticList = Object.values(SPORTS) as Sport[];
                const merged = staticList.map(sport => {
                    const config = (configs as SportConfigRow[] | null)?.find((c) => c.id === sport.id);
                    return {
                        ...sport,
                        isVisible: config?.is_visible ?? sport.isActive,
                        displayOrder: config?.display_order ?? sport.priority,
                    };
                }).sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

                // Safety net: if Supabase reports every sport as hidden (likely a
                // misconfiguration), keep showing the static defaults so the UI
                // never goes blank.
                const anyVisible = merged.some((s) => s.isVisible !== false && !s.groupKey);
                setAllSports(anyVisible ? merged : DEFAULT_SPORTS);

                setSelectedSport((currentSelected) => {
                    const source = anyVisible ? merged : DEFAULT_SPORTS;
                    const mergedSelected = source.find((sport) => sport.id === currentSelected.id);
                    if (mergedSelected?.isVisible !== false) {
                        return mergedSelected ?? currentSelected;
                    }

                    return source.find((sport) => sport.isVisible !== false) ?? currentSelected;
                });
            } catch (err) {
                if (cancelled) return;
                console.error('Error loading sports config:', err);
                // Static defaults are already in state; nothing else to do.
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        fetchConfig();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    useEffect(() => {
        if (!user || allSports.length === 0) return;
        if (hasAutoSelectedRef.current === user.id) return;
        hasAutoSelectedRef.current = user.id;
        // Si el deporte vino por URL, el favorito del usuario no lo pisa: el que
        // entro por cornercorto.com quiere ver hockey aunque su favorito sea rugby.
        if (urlSportRef.current) return;

        getFavoriteSports(supabase, user.id).then(favoriteIds => {
            if (favoriteIds.length === 0) return;
            const favSport = favoriteIds
                .map(id => allSports.find(s => s.id === id))
                .find(s => s && s.isVisible !== false && !s.groupKey);
            if (favSport) setSelectedSport(favSport);
        }).catch(() => {});
    }, [allSports, supabase, user]);

    const selectSportById = (id: SportId) => {
        const sport = getSportById(id);
        if (sport) {
            setSelectedSport(sport);
        }
    };

    return (
        <SportContext.Provider value={{ 
            selectedSport, 
            activeSports, 
            setSelectedSport, 
            selectSportById,
            isLoading 
        }}>
            {children}
        </SportContext.Provider>
    );
}

export function useSport() {
    const context = useContext(SportContext);
    if (context === undefined) {
        throw new Error('useSport must be used within a SportProvider');
    }
    return context;
}
