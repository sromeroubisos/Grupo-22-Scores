'use client';

/**
 * ANDAMIAJE DESCARTABLE — placas del finde 25 al 27 de septiembre de 2026.
 *
 * La pieza se dibuja en un `<canvas>` del navegador, así que no hay forma de
 * generarla desde Node sin reimplementar el renderer. Esta página lee el
 * manifiesto de `public/__lote-manifest.json` —que arma un script aparte desde
 * `/api/matches?date=`—, pide el lienzo a tamaño real y manda el PNG a
 * `/api/lote-finde`, que lo escribe.
 *
 * NO se lee el `<canvas>` de un `<ExportImagePreview>`: ése está reescalado para
 * entrar en su caja y el archivo sale con la proporción correcta y la resolución
 * equivocada. `renderMatchExportPreviewCanvas` devuelve el lienzo a tamaño real.
 *
 * Con `?auto=1` arranca sola; `?limite=N` corta después de N placas y
 * `?solo=<carpeta>` hace un torneo solo. Borrar junto con
 * `src/app/api/lote-finde` y el manifiesto.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    renderMatchExportPreviewCanvas,
    type ExportPreviewRenderOptions,
    type ExportTemplate,
    type ExportData,
} from '@/components/ExportImage';

type PlacaLote = {
    carpeta: string;
    nombre: string;
    // El formato es POR PLACA: la misma tanda entrega post (4:5) e historia (9:16).
    format?: '1080x1350' | '1080x1920';
    // 'schedule' es la pieza de horario; el manifiesto puede pedir otra.
    matchExportMode?: 'schedule' | 'result';
    // 'matchStats' es la placa de un partido; 'dailyMatches', el fixture del
    // torneo entero. El manifiesto lo dice; sin campo, un partido.
    template?: ExportTemplate;
    previewColors: { bgColor: string; accentColor: string };
    // El campo de la placa se pinta con el Acento: con un acento blanco sale un
    // rosa lavado. Los colores pedidos se fuerzan por acá.
    plateOptions: { field?: string; fieldEnd?: string; ink?: string };
    data: ExportData;
    // Solo el fixture: estira filas y escudos para llenar la historia.
    customizationState?: unknown;
};

const OPCIONES_BASE = {
    visualFamily: 'g22Base',
    customizationState: null,
    // Historia, y la pieza es la de HORARIO: sin marcador, con día y hora.
    matchExportMode: 'schedule',
    matchExportLayout: 'classic',
    // El tipo los exige aunque el template 'matchStats' no los mire.
    lineupExportMode: 'both',
    lineupExportLayout: 'classic',
    standingsExportMode: 'table',
    // El fixture muestra la hora de cada partido, no la cuenta regresiva.
    dailyMatchesTimeMode: 'time',
    teamNameMode: 'short',
} as const;

export default function LotePage() {
    const [bitacora, setBitacora] = useState<string[]>([]);
    const [terminado, setTerminado] = useState(false);
    const corriendo = useRef(false);
    const lienzo = useRef<HTMLCanvasElement | null>(null);

    const anotar = useCallback((linea: string) => {
        setBitacora((previo) => [...previo, linea]);
        console.log('[lote]', linea);
    }, []);

    const correr = useCallback(async () => {
        if (corriendo.current) return;
        corriendo.current = true;

        try {
            const parametros = new URLSearchParams(window.location.search);
            const limite = Number(parametros.get('limite')) || Infinity;
            const solo = parametros.get('solo');

            const respuesta = await fetch('/__lote-manifest.json', { cache: 'no-store' });
            const placas: PlacaLote[] = await respuesta.json();
            anotar(`manifiesto: ${placas.length} placas`);

            let hechos = 0;
            let fallados = 0;
            for (const placa of placas) {
                if (solo && placa.carpeta !== solo) continue;
                if (hechos >= limite) break;
                hechos += 1;

                const opciones: ExportPreviewRenderOptions = {
                    ...OPCIONES_BASE,
                    template: placa.template || 'matchStats',
                    format: placa.format || '1080x1920',
                    matchExportMode: placa.matchExportMode || OPCIONES_BASE.matchExportMode,
                    data: placa.data,
                    previewColors: placa.previewColors,
                    plateOptions: placa.plateOptions,
                    // Tal cual: el normalizador rellena los contextos con valores que achican
                    // la cápsula y los nombres. Sin él, lo que no se nombra cae en su base.
                    customizationState: (placa.customizationState ?? null) as ExportPreviewRenderOptions['customizationState'],
                };

                try {
                    // Reusar el lienzo entre formatos distintos deja la placa
                    // anterior abajo: solo se recicla si mide lo mismo.
                    const previo = lienzo.current;
                    const mismoFormato = previo && previo.height === (opciones.format === '1080x1350' ? 1350 : 1920);
                    const canvas = await renderMatchExportPreviewCanvas(opciones, mismoFormato ? previo : null);
                    lienzo.current = canvas;
                    const dataUrl = canvas.toDataURL('image/png');
                    const guardado = await fetch('/api/lote-finde', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ carpeta: placa.carpeta, nombre: placa.nombre, dataUrl }),
                    });
                    const cuerpo = await guardado.json();
                    if (!guardado.ok) fallados += 1;
                    anotar(guardado.ok
                        ? `${placa.carpeta}/${placa.nombre}.png · ${canvas.width}x${canvas.height} · ${Math.round((cuerpo.bytes ?? 0) / 1024)} KB${opciones.customizationState ? ' · filas estiradas' : ''}`
                        : `ERROR ${placa.carpeta}/${placa.nombre}: ${cuerpo.error}`);
                } catch (error) {
                    // Una placa que explota no puede llevarse la tanda entera.
                    fallados += 1;
                    anotar(`EXPLOTÓ ${placa.carpeta}/${placa.nombre}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            anotar(`LISTO · ${hechos - fallados}/${hechos} escritas${fallados ? ` · ${fallados} con error` : ''}`);
        } catch (error) {
            anotar(`EXPLOTÓ: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setTerminado(true);
            corriendo.current = false;
        }
    }, [anotar]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('auto') === '1') {
            void correr();
        }
    }, [correr]);

    return (
        <main style={{ padding: 24, fontFamily: 'monospace', color: '#e5e7eb', background: '#0a0a0b', minHeight: '100vh' }}>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>Placas del finde · 25 al 27 de septiembre</h1>
            <button type="button" onClick={() => void correr()} style={{ padding: '8px 16px', marginBottom: 16 }}>
                Generar
            </button>
            <div data-terminado={terminado ? '1' : '0'} id="bitacora">
                {bitacora.map((linea, indice) => (
                    <div key={indice}>{linea}</div>
                ))}
            </div>
        </main>
    );
}
