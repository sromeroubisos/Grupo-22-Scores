'use client';

import { useCallback, useState } from 'react';
import * as htmlToImage from 'html-to-image';

export type ExportFormat = 'png' | 'jpeg' | 'svg';

export interface ExportOptions {
    format?: ExportFormat;
    quality?: number;
    scale?: number;
    backgroundColor?: string;
    filename?: string;
    watermark?: boolean;
}

export interface UseExportImageReturn {
    exportImage: (element: HTMLElement | null, options?: ExportOptions) => Promise<void>;
    copyToClipboard: (element: HTMLElement | null, options?: ExportOptions) => Promise<void>;
    isExporting: boolean;
    error: string | null;
}

const DEFAULT_OPTIONS: ExportOptions = {
    format: 'png',
    quality: 0.95,
    scale: 2,
    backgroundColor: '#0a0a0f',
    filename: 'g22-scores',
    watermark: false, // Disabled for now to simplify
};

export function useExportImage(): UseExportImageReturn {
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const exportImage = useCallback(async (element: HTMLElement | null, options: ExportOptions = {}) => {
        if (!element) {
            setError('No hay elemento para exportar');
            return;
        }

        setIsExporting(true);
        setError(null);

        try {
            const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

            let dataUrl: string;

            const exportOptions = {
                quality: mergedOptions.quality,
                pixelRatio: mergedOptions.scale,
                backgroundColor: mergedOptions.backgroundColor,
                cacheBust: true,
                skipFonts: true, // Skip fonts to avoid CORS issues
                style: {
                    // Ensure element is visible
                    opacity: '1',
                },
            };

            switch (mergedOptions.format) {
                case 'jpeg':
                    dataUrl = await htmlToImage.toJpeg(element, exportOptions);
                    break;
                case 'svg':
                    dataUrl = await htmlToImage.toSvg(element, exportOptions);
                    break;
                default:
                    dataUrl = await htmlToImage.toPng(element, exportOptions);
            }

            // Create download
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 10);
            const extension = mergedOptions.format === 'jpeg' ? 'jpg' : mergedOptions.format;
            link.download = `${mergedOptions.filename}-${timestamp}.${extension}`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error('Export failed:', err);
            setError(err instanceof Error ? err.message : 'Error al exportar imagen');
        } finally {
            setIsExporting(false);
        }
    }, []);

    const copyToClipboard = useCallback(async (element: HTMLElement | null, options: ExportOptions = {}) => {
        if (!element) {
            setError('No hay elemento para copiar');
            return;
        }

        setIsExporting(true);
        setError(null);

        try {
            const exportOptions = {
                quality: 0.95,
                pixelRatio: 2,
                backgroundColor: '#0a0a0f',
                cacheBust: true,
                skipFonts: true,
            };

            const dataUrl = await htmlToImage.toPng(element, exportOptions);

            // Convert to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // Copy to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

        } catch (err) {
            console.error('Copy to clipboard failed:', err);
            setError(err instanceof Error ? err.message : 'Error al copiar imagen');
        } finally {
            setIsExporting(false);
        }
    }, []);

    return {
        exportImage,
        copyToClipboard,
        isExporting,
        error,
    };
}
