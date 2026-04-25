export type ExportProgress = {
    status: 'idle' | 'preparing' | 'recording' | 'finalizing' | 'done' | 'error';
    progress: number;
    message: string;
};

function cloneSvgWithExplicitSize(svgEl: SVGSVGElement): SVGSVGElement {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const rect = svgEl.getBoundingClientRect();
    clone.setAttribute('width', String(Math.round(rect.width)));
    clone.setAttribute('height', String(Math.round(rect.height)));
    if (!clone.getAttribute('xmlns')) {
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // Inline computed opacity for any CSS-driven animations
    const originals = svgEl.querySelectorAll('[class*="pizarra"]');
    const clones = clone.querySelectorAll('[class*="pizarra"]');
    clones.forEach((el, i) => {
        if (originals[i]) {
            const opacity = window.getComputedStyle(originals[i]).opacity;
            if (opacity && opacity !== '1') {
                (el as SVGElement).setAttribute('opacity', opacity);
            }
        }
    });

    return clone;
}

async function svgToCanvas(
    svgEl: SVGSVGElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
) {
    const clone = cloneSvgWithExplicitSize(svgEl);
    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = url;
        });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function exportVideo(
    totalDurationMs: number,
    playbackSpeed: number,
    fps: number,
    onProgress: (p: ExportProgress) => void,
    renderFrame: (time: number) => Promise<void>,
    getSvgElement: () => SVGSVGElement | null
): Promise<Blob> {
    onProgress({ status: 'preparing', progress: 0, message: 'Preparando grabacion...' });

    const svgEl = getSvgElement();
    if (!svgEl) {
        throw new Error('SVG no encontrado');
    }

    const rect = svgEl.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto del canvas');

    // Pre-warm: render first frame so canvas has content before starting MediaRecorder
    await renderFrame(0);
    await svgToCanvas(svgEl, canvas, ctx);

    const stream = canvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    const frameInterval = 1000 / fps;
    const totalFrames = Math.max(1, Math.ceil((totalDurationMs / playbackSpeed) / frameInterval));

    return new Promise((resolve, reject) => {
        recorder.onstop = () => {
            if (chunks.length === 0) {
                reject(new Error('No se generaron frames'));
                return;
            }
            const blob = new Blob(chunks, { type: 'video/webm' });
            resolve(blob);
        };
        recorder.onerror = () => reject(new Error('Error del MediaRecorder'));

        recorder.start();
        onProgress({ status: 'recording', progress: 0, message: 'Grabando...' });

        let frameIndex = 0;
        const startTime = performance.now();

        const tick = async () => {
            if (frameIndex > totalFrames) {
                onProgress({ status: 'finalizing', progress: 1, message: 'Finalizando video...' });
                recorder.stop();
                return;
            }

            const time = Math.min((frameIndex * frameInterval) * playbackSpeed, totalDurationMs);

            try {
                await renderFrame(time);
                await svgToCanvas(svgEl, canvas, ctx);
            } catch (err) {
                recorder.stop();
                reject(err);
                return;
            }

            const progress = totalFrames > 0 ? frameIndex / totalFrames : 1;
            if (frameIndex % Math.max(1, Math.floor(totalFrames / 10)) === 0 || frameIndex === totalFrames) {
                onProgress({
                    status: 'recording',
                    progress,
                    message: `Grabando... ${Math.round(progress * 100)}%`,
                });
            }

            frameIndex++;

            if (frameIndex > totalFrames) {
                onProgress({ status: 'finalizing', progress: 1, message: 'Finalizando video...' });
                recorder.stop();
                return;
            }

            // Schedule next frame to maintain real-time playback speed.
            // This ensures 1 second of animation = 1 second of video.
            const nextFrameTargetTime = frameIndex * frameInterval;
            const elapsed = performance.now() - startTime;
            const delay = Math.max(0, nextFrameTargetTime - elapsed);
            setTimeout(tick, delay);
        };

        tick();
    });
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
