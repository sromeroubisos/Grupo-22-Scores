'use client';

import { useEffect, useRef } from 'react';
import { playerSprite, SPRITE_H, SPRITE_W, type Frame, type Kit, type Look } from './sprites';

const RUN: Frame[] = ['run0', 'run1', 'run2', 'run3'];

/** Un jugador pixel a escala: quieto, corriendo o festejando (brazos arriba), en loop. Decorativo. */
export default function SpritePreview({ look, kit, scale = 4, running = false, celebrating = false }: { look: Look; kit: Kit; scale?: number; running?: boolean; celebrating?: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const cv = ref.current;
        const ctx = cv?.getContext('2d');
        if (!cv || !ctx) return;
        ctx.imageSmoothingEnabled = false;
        let raf = 0;
        let frame = 0;
        let last = 0;
        const draw = (t: number) => {
            ctx.clearRect(0, 0, cv.width, cv.height);
            const pose: Frame = celebrating ? (frame % 2 ? 'celebrate' : 'idle') : running ? RUN[frame % 4] : 'idle';
            ctx.drawImage(playerSprite(look, kit, pose), 0, 0);
            if (running || celebrating) {
                if (t - last > (celebrating ? 260 : 110)) {
                    frame += 1;
                    last = t;
                }
                raf = requestAnimationFrame(draw);
            }
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [look, kit, running, celebrating]);

    return (
        <canvas
            ref={ref}
            width={SPRITE_W}
            height={SPRITE_H}
            aria-hidden="true"
            style={{ width: SPRITE_W * scale, height: SPRITE_H * scale, imageRendering: 'pixelated' }}
        />
    );
}
