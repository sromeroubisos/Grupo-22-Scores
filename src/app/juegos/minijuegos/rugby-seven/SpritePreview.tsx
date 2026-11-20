'use client';

import { useEffect, useRef } from 'react';
import { playerSprite, SPRITE_H, SPRITE_W, type Frame, type Kit, type Look } from './sprites';

const RUN: Frame[] = ['run0', 'run1', 'run2', 'run3'];

/** Un jugador pixel a escala, quieto o corriendo en loop. Decorativo. */
export default function SpritePreview({ look, kit, scale = 4, running = false }: { look: Look; kit: Kit; scale?: number; running?: boolean }) {
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
            ctx.drawImage(playerSprite(look, kit, running ? RUN[frame % 4] : 'idle'), 0, 0);
            if (running) {
                if (t - last > 110) {
                    frame += 1;
                    last = t;
                }
                raf = requestAnimationFrame(draw);
            }
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [look, kit, running]);

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
