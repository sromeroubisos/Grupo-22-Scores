import { useEffect, useState } from 'react';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Verde de la marca: lo que se ve mientras no hay color elegido ni escudo legible. */
export const FALLBACK_BANNER = '#14532d';

// Color medio del escudo, sin blancos ni transparentes. Si el canvas queda
// "tainted" por CORS devuelve null y el banner usa el verde de la marca.
export function crestColor(src: string): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const size = 24;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(null);
                ctx.drawImage(img, 0, 0, size, size);
                const { data } = ctx.getImageData(0, 0, size, size);
                // Promediar todos los píxeles mezcla el rojo con el dorado y el
                // blanco del escudo y da un marrón rosado. Se elige el TONO
                // dominante (36 cubetas de 10°, pesadas por saturación) y se
                // promedia sólo ese: el escudo rojo da rojo.
                const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0, n: 0 }));
                for (let i = 0; i < data.length; i += 4) {
                    const pr = data[i], pg = data[i + 1], pb = data[i + 2], pa = data[i + 3];
                    const max = Math.max(pr, pg, pb);
                    const min = Math.min(pr, pg, pb);
                    if (pa < 200 || min > 225 || max < 40 || max - min < 50) continue;
                    let h: number;
                    const d = max - min;
                    if (max === pr) h = ((pg - pb) / d + 6) % 6;
                    else if (max === pg) h = (pb - pr) / d + 2;
                    else h = (pr - pg) / d + 4;
                    const bin = bins[Math.min(35, Math.floor(h * 60 / 10))];
                    bin.w += d / max;
                    bin.r += pr; bin.g += pg; bin.b += pb; bin.n++;
                }
                const top = bins.reduce((best, cur) => (cur.w > best.w ? cur : best), bins[0]);
                if (!top.n) return resolve(null);
                // Se oscurece apenas para que el texto blanco lea bien encima.
                const k = 0.78;
                resolve(`rgb(${Math.round((top.r / top.n) * k)}, ${Math.round((top.g / top.n) * k)}, ${Math.round((top.b / top.n) * k)})`);
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * Color del banner del torneo: el que se eligió en el editor (`primary_color`,
 * #RRGGBB) manda; si no hay, sale del escudo; si tampoco, el verde de la marca.
 */
export function useBannerColor(chosen?: string | null, logoUrl?: string | null): string {
    const [color, setColor] = useState(FALLBACK_BANNER);

    useEffect(() => {
        if (chosen && HEX.test(chosen)) {
            setColor(chosen);
            return;
        }
        if (!logoUrl) {
            setColor(FALLBACK_BANNER);
            return;
        }
        // El color ya calculado de este escudo se recuerda: la segunda visita
        // arranca con el color bueno en vez de pasar por el verde de la marca.
        const key = `g22:banner:${logoUrl}`;
        try {
            const cached = window.localStorage.getItem(key);
            if (cached) setColor(cached);
        } catch { /* sin storage (modo privado): se calcula igual */ }
        let alive = true;
        crestColor(logoUrl).then((c) => {
            if (!alive || !c) return;
            setColor(c);
            try { window.localStorage.setItem(key, c); } catch { /* cuota o modo privado */ }
        });
        return () => { alive = false; };
    }, [chosen, logoUrl]);

    return color;
}
