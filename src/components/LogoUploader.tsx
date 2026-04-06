'use client';

import React, { useRef, useState } from 'react';
import { Upload, Check, Loader2, Image as ImageIcon } from 'lucide-react';
import styles from './LogoUploader.module.css';
import { resolveLogoPreviewSrc } from '@/lib/utils/logoUrl';

interface LogoUploaderProps {
    onUpload: (logoData: string) => void;
    currentLogo?: string;
    label?: string;
    accentColor?: string;
}

export default function LogoUploader({
    onUpload,
    currentLogo,
    label = "Logo o Escudo",
    accentColor = "#00ccff"
}: LogoUploaderProps) {
    const toBase64 = (value: string) => {
        try {
            return window.btoa(unescape(encodeURIComponent(value)));
        } catch {
            return window.btoa(value);
        }
    };

    const svgToDataUrl = (svg: string) => `data:image/svg+xml;base64,${toBase64(svg)}`;

    const normalizeSvg = (svgString: string): string => {
        let processed = svgString
            .replace(/<\?xml[^>]*>/gi, '')
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/fill="(white|#fff|#ffffff|rgb\(255,255,255\))"/gi, 'fill="none"')
            .replace(/<rect[^>]*(fill="(white|#fff|#ffffff|rgb\(255,255,255\))")[^>]*\/?>/gi, '')
            .trim();

        if (!/viewBox=/i.test(processed)) {
            const widthMatch = processed.match(/width="([\d.]+)"/i);
            const heightMatch = processed.match(/height="([\d.]+)"/i);
            if (widthMatch && heightMatch) {
                processed = processed.replace('<svg', `<svg viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`);
            }
        }

        if (!/preserveAspectRatio=/i.test(processed)) {
            processed = processed.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"');
        }

        return processed;
    };

    const normalizeLogoInput = (value?: string) => {
        if (!value) return value;

        const trimmed = value.trim();
        if (trimmed.startsWith('<svg')) {
            return svgToDataUrl(normalizeSvg(trimmed));
        }

        return resolveLogoPreviewSrc(trimmed) || trimmed;
    };

    const normalizedCurrentLogo = normalizeLogoInput(currentLogo);
    const [preview, setPreview] = useState<string | undefined>(normalizedCurrentLogo);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const displayedPreview = normalizedCurrentLogo || preview;

    const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsDataURL(file);
    });

    const resizeImageData = async (dataUrl: string, maxSize: number) => {
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Error loading image'));
        });

        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        if (scale >= 1) return dataUrl;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return dataUrl;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    };

    const handleFile = async (file: File) => {
        if (!file) return;

        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        const isBitmap = file.type.startsWith('image/') && !isSvg;

        if (isBitmap) {
            setIsAnalyzing(true);
            try {
                const rawData = await readAsDataUrl(file);
                const imageData = await resizeImageData(rawData, 600);

                // Guardamos directamente como PNG para mantener la máxima fidelidad
                setPreview(imageData);
                onUpload(imageData);
                setIsAnalyzing(false);
            } catch (error) {
                console.error('Error processing image:', error);
                setIsAnalyzing(false);
            }
        } else if (isSvg) {
            try {
                const svgText = await file.text();
                const processedSvg = normalizeSvg(svgText);
                const svgDataUrl = svgToDataUrl(processedSvg);
                setPreview(svgDataUrl);
                onUpload(svgDataUrl);
            } catch (error) {
                console.error('Error processing SVG:', error);
            }
        } else {
            const dataUrl = await readAsDataUrl(file);
            setPreview(dataUrl);
            onUpload(dataUrl);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className={styles.container}>
            <label className={styles.label}>{label}</label>

            <div
                className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ ['--accent' as string]: accentColor } as React.CSSProperties}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    style={{ display: 'none' }}
                    accept="image/*"
                />

                {isAnalyzing ? (
                    <div className={styles.status}>
                        <Loader2 className={styles.spinner} />
                        <span>Procesando imagen...</span>
                    </div>
                ) : displayedPreview ? (
                    <div className={styles.previewContainer}>
                        <img src={displayedPreview} alt="Logo preview" className={styles.preview} />
                        <div className={styles.changeOverlay}>
                            <Upload size={20} />
                            <span>Cambiar</span>
                        </div>
                    </div>
                ) : (
                    <div className={styles.placeholder}>
                        <div className={styles.iconCircle}>
                            <ImageIcon size={32} />
                        </div>
                        <div className={styles.textMain}>Arrastra tu logo aquí</div>
                        <div className={styles.textSub}>PNG, JPG o SVG</div>
                    </div>
                )}
            </div>

            {displayedPreview && !isAnalyzing && (
                <div className={styles.successTag}>
                    <Check size={14} />
                    <span>Imagen optimizada</span>
                </div>
            )}
        </div>
    );
}
