'use client';

import { useState, useEffect } from 'react';
import styles from './ExportButton.module.css';

type ExportFormat = '1080x1350' | '1080x1920' | 'auto';

interface ExportButtonProps {
    targetRef: React.RefObject<HTMLElement | null>;
    filename?: string;
    variant?: 'icon' | 'button';
    className?: string;
}

const FORMATS: { value: ExportFormat; label: string; width: number; height: number | null }[] = [
    { value: '1080x1350', label: 'Post (1080×1350)', width: 1080, height: 1350 },
    { value: '1080x1920', label: 'Story (1080×1920)', width: 1080, height: 1920 },
    { value: 'auto', label: 'Automático', width: 1080, height: null },
];

// Standalone table data
const MOCK_DATA = [
    { pos: 1, team: 'Club Atlético', played: 8, won: 7, lost: 1, diff: '+125', points: 32 },
    { pos: 2, team: 'Racing Club', played: 8, won: 6, lost: 1, diff: '+75', points: 28 },
    { pos: 3, team: 'San Lorenzo', played: 8, won: 5, lost: 2, diff: '+47', points: 24 },
    { pos: 4, team: 'CASI', played: 8, won: 5, lost: 3, diff: '+25', points: 22 },
    { pos: 5, team: 'Deportivo FC', played: 8, won: 4, lost: 3, diff: '+5', points: 19 },
    { pos: 6, team: 'Hindu Club', played: 8, won: 4, lost: 4, diff: '-10', points: 17 },
    { pos: 7, team: 'Newman', played: 8, won: 3, lost: 4, diff: '-30', points: 15 },
    { pos: 8, team: 'Belgrano AC', played: 8, won: 3, lost: 5, diff: '-43', points: 13 },
    { pos: 9, team: 'Pucará', played: 8, won: 2, lost: 5, diff: '-65', points: 10 },
    { pos: 10, team: 'La Plata RC', played: 8, won: 2, lost: 6, diff: '-80', points: 8 },
    { pos: 11, team: 'Los Tilos', played: 8, won: 1, lost: 6, diff: '-105', points: 6 },
    { pos: 12, team: 'Universitario', played: 8, won: 0, lost: 8, diff: '-144', points: 0 },
];

const COLUMNS = [
    { key: 'pos', label: 'Pos' },
    { key: 'team', label: 'Equipo' },
    { key: 'played', label: 'PJ' },
    { key: 'won', label: 'G' },
    { key: 'lost', label: 'P' },
    { key: 'diff', label: 'Dif' },
    { key: 'points', label: 'Pts' },
];

export default function ExportButton({
    filename = 'g22-scores',
    variant = 'button',
    className = '',
}: ExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('1080x1350');
    const [rowCount, setRowCount] = useState<number>(5);
    const [selectedColumns, setSelectedColumns] = useState<string[]>(['pos', 'team', 'played', 'won', 'lost', 'points']);
    const [status, setStatus] = useState<string>('');

    const toggleColumn = (key: string) => {
        setSelectedColumns(prev =>
            prev.includes(key)
                ? prev.filter(k => k !== key)
                : [...prev, key]
        );
    };

    const handleExport = async () => {
        setIsExporting(true);
        setStatus('⏳ Generando...');
        setShowModal(false);

        try {
            const formatConfig = FORMATS.find(f => f.value === format)!;
            const displayData = MOCK_DATA.slice(0, rowCount);

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = formatConfig.width;
            canvas.height = formatConfig.height || 1350;
            const ctx = canvas.getContext('2d')!;

            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#0a0a12');
            gradient.addColorStop(0.5, '#0f0f1a');
            gradient.addColorStop(1, '#0a0a12');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Safe zones for Instagram/TikTok stories
            const topSafeZone = 150; // Space for username/avatar
            const bottomSafeZone = 140; // Space for reply bar

            // Content area (between safe zones)
            const safeAreaTop = topSafeZone;
            const safeAreaBottom = canvas.height - bottomSafeZone;
            const safeAreaHeight = safeAreaBottom - safeAreaTop;

            // Calculate content dimensions
            const titleHeight = 60;
            const subtitleHeight = 40;
            const headerGap = 30;
            const rowHeight = 55;
            const tableHeaderHeight = 40;
            const watermarkHeight = 50;
            const gapBeforeWatermark = 30;

            const tableRowsHeight = displayData.length * rowHeight;
            const totalContentHeight = titleHeight + subtitleHeight + headerGap + tableHeaderHeight + tableRowsHeight + gapBeforeWatermark + watermarkHeight;

            // Center content vertically within safe area
            const contentStartY = safeAreaTop + (safeAreaHeight - totalContentHeight) / 2;

            // Title
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Tabla de Posiciones', canvas.width / 2, contentStartY + titleHeight / 2 + 15);

            // Subtitle  
            ctx.fillStyle = '#71717a';
            ctx.font = '20px system-ui, -apple-system, sans-serif';
            ctx.fillText('Torneo Apertura 2026 • Primera División', canvas.width / 2, contentStartY + titleHeight + subtitleHeight / 2 + 5);

            // Table settings
            const tableTop = contentStartY + titleHeight + subtitleHeight + headerGap;

            const colWidths: Record<string, number> = {
                pos: 80,
                team: 280,
                played: 70,
                won: 70,
                lost: 70,
                diff: 90,
                points: 90,
            };

            // Calculate total width and starting x
            const totalWidth = selectedColumns.reduce((sum, col) => sum + colWidths[col], 0);
            const startX = (canvas.width - totalWidth) / 2;

            // Table background
            const tableBgHeight = tableHeaderHeight + tableRowsHeight + 10;
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.beginPath();
            ctx.roundRect(startX - 15, tableTop - 5, totalWidth + 30, tableBgHeight, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.stroke();

            // Header row
            ctx.font = 'bold 14px system-ui';
            ctx.fillStyle = '#71717a';
            ctx.textAlign = 'center';
            let x = startX;
            selectedColumns.forEach(col => {
                const colDef = COLUMNS.find(c => c.key === col)!;
                ctx.fillText(colDef.label.toUpperCase(), x + colWidths[col] / 2, tableTop + 25);
                x += colWidths[col];
            });

            // Data rows
            displayData.forEach((row, index) => {
                const y = tableTop + 50 + index * rowHeight;

                // Alternating row background
                if (index % 2 === 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.02)';
                    ctx.fillRect(startX - 10, y - 5, totalWidth + 20, rowHeight - 10);
                }

                x = startX;
                selectedColumns.forEach(col => {
                    const value = row[col as keyof typeof row];
                    const centerX = x + colWidths[col] / 2;

                    if (col === 'pos') {
                        // Position badge
                        const posColor = row.pos <= 2 ? '#22c55e' : row.pos <= 4 ? '#3b82f6' : row.pos >= 11 ? '#ef4444' : '#6b7280';
                        ctx.fillStyle = posColor + '30';
                        ctx.beginPath();
                        ctx.roundRect(centerX - 18, y + rowHeight / 2 - 28, 36, 36, 8);
                        ctx.fill();
                        ctx.fillStyle = posColor;
                        ctx.font = 'bold 18px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(String(value), centerX, y + rowHeight / 2 - 5);
                    } else if (col === 'team') {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 20px system-ui';
                        ctx.textAlign = 'left';
                        ctx.fillText(String(value), x + 20, y + rowHeight / 2 - 5);
                    } else if (col === 'won') {
                        ctx.fillStyle = '#22c55e';
                        ctx.font = 'bold 18px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(String(value), centerX, y + rowHeight / 2 - 5);
                    } else if (col === 'lost') {
                        ctx.fillStyle = '#ef4444';
                        ctx.font = 'bold 18px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(String(value), centerX, y + rowHeight / 2 - 5);
                    } else if (col === 'diff') {
                        const diffStr = String(value);
                        ctx.fillStyle = diffStr.startsWith('+') ? '#22c55e' : diffStr.startsWith('-') ? '#ef4444' : '#71717a';
                        ctx.font = '16px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(diffStr, centerX, y + rowHeight / 2 - 5);
                    } else if (col === 'points') {
                        ctx.fillStyle = '#8b5cf6';
                        ctx.font = 'bold 24px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(String(value), centerX, y + rowHeight / 2 - 3);
                    } else {
                        ctx.fillStyle = '#a1a1aa';
                        ctx.font = '16px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(String(value), centerX, y + rowHeight / 2 - 5);
                    }

                    x += colWidths[col];
                });
            });

            // Watermark - positioned below table
            const watermarkY = tableTop + tableBgHeight + gapBeforeWatermark + 10;
            ctx.textAlign = 'center';
            ctx.font = 'bold 26px system-ui';
            ctx.fillStyle = '#8b5cf6';
            ctx.fillText('G22', canvas.width / 2 - 28, watermarkY);
            ctx.fillStyle = '#52525b';
            ctx.font = '18px system-ui';
            ctx.fillText('scores', canvas.width / 2 + 32, watermarkY);

            // Convert to PNG and download
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${filename}-${format}-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = dataUrl;
            link.click();

            setStatus('✅ ¡Descargado!');
            setTimeout(() => setStatus(''), 2000);

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
            setStatus(`❌ ${errorMsg}`);
            console.error('Export error:', err);
        } finally {
            setIsExporting(false);
        }
    };

    if (variant === 'icon') {
        return (
            <button
                className={`${styles.iconButton} ${className}`}
                onClick={() => setShowModal(true)}
                disabled={isExporting}
                title="Exportar como imagen"
                type="button"
            >
                {isExporting ? '⏳' : '📥'}
            </button>
        );
    }

    return (
        <>
            <div className={`${styles.container} ${className}`}>
                <button
                    className={styles.exportButton}
                    onClick={() => setShowModal(true)}
                    disabled={isExporting}
                    type="button"
                >
                    {isExporting ? (
                        <>⏳ Exportando...</>
                    ) : (
                        <>📥 Exportar</>
                    )}
                </button>
                {status && <div className={styles.status}>{status}</div>}
            </div>

            {/* Export Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>Exportar Imagen</h3>

                        {/* Format Selection */}
                        <div className={styles.modalSection}>
                            <label className={styles.modalLabel}>Formato</label>
                            <div className={styles.formatOptions}>
                                {FORMATS.map(f => (
                                    <button
                                        key={f.value}
                                        className={`${styles.formatBtn} ${format === f.value ? styles.active : ''}`}
                                        onClick={() => setFormat(f.value)}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Row Count */}
                        <div className={styles.modalSection}>
                            <label className={styles.modalLabel}>Equipos a mostrar</label>
                            <div className={styles.formatOptions}>
                                {[3, 5, 8, 10, 12].map(n => (
                                    <button
                                        key={n}
                                        className={`${styles.formatBtn} ${rowCount === n ? styles.active : ''}`}
                                        onClick={() => setRowCount(n)}
                                    >
                                        Top {n}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Column Selection */}
                        <div className={styles.modalSection}>
                            <label className={styles.modalLabel}>Columnas</label>
                            <div className={styles.columnOptions}>
                                {COLUMNS.map(col => (
                                    <label key={col.key} className={styles.columnCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns.includes(col.key)}
                                            onChange={() => toggleColumn(col.key)}
                                        />
                                        <span>{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className={styles.modalActions}>
                            <button
                                className={styles.cancelBtn}
                                onClick={() => setShowModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className={styles.exportBtn}
                                onClick={handleExport}
                                disabled={selectedColumns.length < 2}
                            >
                                📥 Exportar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
