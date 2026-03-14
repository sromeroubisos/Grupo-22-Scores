'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    DndContext, 
    closestCenter, 
    KeyboardSensor, 
    PointerSensor, 
    useSensor, 
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import { 
    arrayMove, 
    SortableContext, 
    sortableKeyboardCoordinates, 
    verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { createClient } from '@/lib/supabase/client';
import { SPORTS } from '@/lib/data/sports';
import styles from '../page.module.css';
import { SortableSportItem } from './SortableSportItem';

// Sports that are grouped under a parent (e.g. rugby-union, rugby-league → rugby)
// are not shown as independent admin entries.
const GROUPED_SPORT_IDS = new Set(
    Object.values(SPORTS)
        .filter(s => s.groupKey)
        .map(s => s.id)
);

// Define the shape of the database record
interface DbSport {
    id: string;
    name: string;
    icon: string;
    is_visible: boolean;
    display_order: number;
    updated_at: string;
}

// Which admin columns are actually present in the DB (detected at fetch time)
interface ColumnFlags {
    hasIsVisible: boolean;
    hasDisplayOrder: boolean;
}

export default function SportsManagementPage() {
    const [sports, setSports] = useState<DbSport[]>([]);
    const [columnFlags, setColumnFlags] = useState<ColumnFlags>({ hasIsVisible: false, hasDisplayOrder: false });
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const supabase = createClient();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        fetchSports();
    }, []);

    const fetchSports = async () => {
        try {
            setLoading(true);
            setErrorMessage(null);
            
            const REAL_TABLE_NAME = 'sports';
            console.log(`[DEBUG] Attempting fetch from table: "public"."${REAL_TABLE_NAME}"`);
            
            // Fetch everything to understand the schema and preserve identifiers
            const { data, error, status, statusText } = await supabase
                .from(REAL_TABLE_NAME)
                .select('*');

            // 1. Handle Supabase Query Errors
            if (error) {
                console.group('[DIAGNOSTIC] Supabase Query Error');
                console.error('Code:', error.code);
                console.error('Message:', error.message);
                console.error('Details:', error.details);
                console.error('Hint:', error.hint);
                console.error('HTTP Status:', status, statusText);
                console.groupEnd();
                
                setErrorMessage(`Error de base de datos [${error.code}]: ${error.message}. Ver consola para detalles.`);
                return;
            }

            // 2. Handle Empty Result
            if (!data) {
                console.warn('[DEBUG] Supabase returned null data');
                setErrorMessage('No se recibió información de la base de datos.');
                return;
            }

            console.log(`[DEBUG] Received ${data.length} records from "${REAL_TABLE_NAME}"`);
            
            if (data.length > 0) {
                const sample = data[0];
                console.group('[DEBUG] Database Schema Verification');
                console.log('Available Columns:', Object.keys(sample));
                console.log('Record Sample:', sample);
                console.groupEnd();

                // Detect which admin columns actually exist in the DB
                setColumnFlags({
                    hasIsVisible: 'is_visible' in sample,
                    hasDisplayOrder: 'display_order' in sample,
                });

                // Adaptive mapping preserving all fields (including api_code, external_id, etc.)
                // Exclude sports that are grouped under a parent (e.g. rugby-union, rugby-league)
                const normalized: DbSport[] = data
                    .filter((record: any) => !GROUPED_SPORT_IDS.has(record.id))
                    .map((record: any) => {
                    // Logic for Visibility column (fallback to is_active if is_visible missing)
                    const isVisible = record.is_visible !== undefined ? record.is_visible :
                                     (record.is_active !== undefined ? record.is_active : true);

                    // Logic for Order column (fallback to priority if display_order missing)
                    const displayOrder = record.display_order !== undefined ? record.display_order :
                                        (record.priority !== undefined ? record.priority : 100);

                    // We keep everything into the sport object to preserve all metadata
                    return {
                        ...record,
                        is_visible: isVisible,
                        display_order: displayOrder,
                    };
                });

                // Sort: visible sports first, then hidden — each group by display_order ASC
                const sorted = [
                    ...normalized.filter(s => s.is_visible).sort((a, b) => a.display_order - b.display_order),
                    ...normalized.filter(s => !s.is_visible).sort((a, b) => a.display_order - b.display_order),
                ];
                setSports(sorted);
            } else {
                console.warn('[DEBUG] The sports table is currently empty.');
                setSports([]);
            }
            
        } catch (runtimeError: any) {
            // 3. Handle Runtime Exceptions (mapping, state, etc.)
            console.error('[RUNTIME EXCEPTION] Error in fetchSports:', runtimeError);
            setErrorMessage(`Error de ejecución: ${runtimeError.message || 'Error desconocido'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setSports((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const reordered = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
                    ...item,
                    display_order: index + 1,
                }));
                // Re-apply visible-first sort to prevent dragging hidden above visible
                return [
                    ...reordered.filter(i => i.is_visible).sort((a, b) => a.display_order - b.display_order),
                    ...reordered.filter(i => !i.is_visible).sort((a, b) => a.display_order - b.display_order),
                ];
            });
        }
    };

    const toggleVisibility = (id: string) => {
        setSports(prev => {
            const target = prev.find(i => i.id === id)!;
            const becomingHidden = target.is_visible;

            let newOrder: number;
            if (becomingHidden) {
                // Move to end of entire list
                newOrder = Math.max(...prev.map(i => i.display_order)) + 1;
            } else {
                // Move to end of visible block
                const visibleOrders = prev.filter(i => i.is_visible).map(i => i.display_order);
                newOrder = visibleOrders.length > 0 ? Math.max(...visibleOrders) + 1 : 1;
            }

            const updated = prev.map(item =>
                item.id === id
                    ? { ...item, is_visible: !item.is_visible, display_order: newOrder }
                    : item
            );

            return [
                ...updated.filter(i => i.is_visible).sort((a, b) => a.display_order - b.display_order),
                ...updated.filter(i => !i.is_visible).sort((a, b) => a.display_order - b.display_order),
            ];
        });
    };

    const saveChanges = async () => {
        try {
            setSaving(true);

            // Build payload with only columns that actually exist in the DB
            const results = await Promise.all(
                sports.map(sport => {
                    const payload: Record<string, unknown> = {};
                    if (columnFlags.hasIsVisible) payload.is_visible = sport.is_visible;
                    if (columnFlags.hasDisplayOrder) payload.display_order = sport.display_order;
                    return (supabase as any)
                        .from('sports')
                        .update(payload)
                        .eq('id', sport.id);
                })
            );

            const firstError = results.find(r => r.error)?.error;
            if (firstError) {
                console.error('[SUPABASE ERROR] Update failed:', firstError);
                alert(`Error al guardar cambios: ${firstError.message}`);
                return;
            }

            alert('Configuración guardada correctamente. Cambios aplicados globalmente.');
            await fetchSports();
        } catch (err: any) {
            console.error('[RUNTIME EXCEPTION] Error in saveChanges:', err);
            alert(`Error inesperado: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const filteredSports = useMemo(() => {
        return sports.filter(s => 
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [sports, searchTerm]);

    return (
        <div className={styles.tectonicPage} style={{ padding: '40px' }}>
            <div className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>System / Core / Discovery</p>
                    <h1>Gestión de Deportes</h1>
                </div>
                <div className={styles.statusSync}>
                    <div className={styles.statusPill}>
                        <div className={styles.statusIndicator}></div>
                        <span>DB CONECTADA</span>
                    </div>
                    <button 
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={saveChanges}
                        disabled={saving || loading}
                    >
                        {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                    </button>
                </div>
            </div>

            <div className={styles.tectonicGrid}>
                <div className={styles.col12}>
                    <div className={styles.slab}>
                        <div className={styles.slabHeader}>
                            <div>
                                <span className={styles.slabLabel}>Configuración Global</span>
                                <h2 className={styles.slabTitle}>Orden y Visibilidad</h2>
                            </div>
                            <div className={styles.slabActions}>
                                <input 
                                    className={styles.filterInput}
                                    style={{ width: '250px' }}
                                    placeholder="FILTRAR DEPORTES..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <button className={styles.btn} onClick={fetchSports}>
                                    RECARGAR
                                </button>
                            </div>
                        </div>

                        {errorMessage && (
                            <div className={styles.errorBanner} style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', marginBottom: '20px' }}>
                                <p style={{ color: '#ef4444', fontWeight: 600 }}>Error al cargar los deportes:</p>
                                <p style={{ color: '#ef4444', fontSize: '14px' }}>{errorMessage}</p>
                            </div>
                        )}

                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
                                <p className={styles.mono}>CARGANDO DATOS DEL SISTEMA...</p>
                            </div>
                        ) : !errorMessage && sports.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
                                <p className={styles.mono}>NO SE ENCONTRARON DEPORTES EN LA BASE DE DATOS.</p>
                            </div>
                        ) : (
                            <DndContext 
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                                modifiers={[restrictToVerticalAxis]}
                            >
                                <SortableContext 
                                    items={filteredSports.map(s => s.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className={styles.sportsList} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {filteredSports.map((sport) => (
                                            <SortableSportItem 
                                                key={sport.id} 
                                                sport={sport} 
                                                onToggleVisibility={() => toggleVisibility(sport.id)}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}

                        <div className={styles.conflictAlert} style={{ marginTop: '32px' }}>
                            <div className={styles.alertIcon}>!</div>
                            <div className={styles.alertText}>
                                El orden definido aquí afectará a todos los menús, filtros y pantallas públicas de la aplicación.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
