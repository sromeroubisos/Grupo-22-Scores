/**
 * Sube el escudo de Qompi a Storage y se lo engancha a la ficha del club.
 *
 *   npx tsx src/scripts/qompi-escudo.ts --archivo="<ruta al png>" --plan
 *   npx tsx src/scripts/qompi-escudo.ts --archivo="<ruta al png>" --execute
 *
 * Dos cosas que no son opcionales:
 *
 * · El escudo va a Storage por `persistClubLogo`, NUNCA crudo a
 *   `clubs.logo_url`. La columna ya arrastra ~905 escudos en base64 y de ahi
 *   salen los timeouts de `/api/teams`.
 *
 * · Se escala antes de subir. El original es de 1080x1080 y 651 KB; los escudos
 *   que ya estan en el bucket pesan entre 11 y 35 KB. Un escudo se dibuja en
 *   una lista de veinte clubes, no en pantalla completa.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const EJECUTAR = process.argv.includes('--execute');
const ARCHIVO = arg('archivo');
const CLUB_ID = arg('club') ?? 'qompi';
/** Suficiente para la ficha del club y para cualquier placa de export. */
const LADO = Number(arg('lado') ?? 512);
/**
 * Tamano de la paleta. 64 alcanza para un escudo de arte plana; uno con
 * sombras o degrades pide mas o se le nota el bandeado en las transiciones.
 */
const COLORES = Number(arg('colores') ?? 64);

if (!ARCHIVO) {
    console.error('Falta --archivo="<ruta al escudo>"');
    process.exit(1);
}

/**
 * Color de identidad para la ficha: el mas frecuente entre los pixeles OPACOS,
 * descartando el blanco del fondo y el negro del trazo.
 *
 * No se usa `sharp.stats().dominant`: bucketea el histograma en 4 bits por
 * canal y devuelve el centro del cajon mas poblado, que puede ser un color que
 * en la imagen no esta. En este escudo —oro, rojo, negro y blanco— contestaba
 * `#486878`, un azul pizarra que no aparece en ningun pixel.
 */
async function colorDelEscudo(bytes: Buffer): Promise<string | null> {
    try {
        const sharp = (await import('sharp')).default;
        const { data, info } = await sharp(bytes)
            .resize(160, 160, { fit: 'inside' })
            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        // 4 bits por canal (16 escalones). Con 5 bits los cajones salen
        // demasiado finos y un degradé suave se parte en tres: el oro de
        // Tacuru repartia 14% + 7% + 3% y perdia contra un oxido de 19,7% que
        // era un color menos presente en el escudo.
        const cuenta = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += info.channels) {
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
            if (a < 250) continue;                       // transparente
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max > 232 && min > 210) continue;        // blanco de fondo
            if (max < 45) continue;                      // negro del trazo
            const k = `${r >> 4},${g >> 4},${b >> 4}`;
            const prev = cuenta.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
            cuenta.set(k, { n: prev.n + 1, r: prev.r + r, g: prev.g + g, b: prev.b + b });
        }

        // El promedio de los pixeles del cajon, no el centro del cajon: asi el
        // color que se guarda es uno que en el escudo esta de verdad.
        const top = [...cuenta.values()].sort((a, b) => b.n - a.n)[0];
        if (!top) return null;
        return `#${[top.r / top.n, top.g / top.n, top.b / top.n]
            .map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    } catch {
        return null;
    }
}

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { persistClubLogo } = await import('@/lib/server/persistClubLogo');
    const supabase = createAdminClient();

    const { data: clubes } = await supabase
        .from('clubs').select('id, name, logo_url, primary_color').eq('id', CLUB_ID).limit(1);
    const club = clubes?.[0];
    if (!club) { console.error(`No existe el club "${CLUB_ID}".`); process.exit(1); }

    const original = await fs.readFile(ARCHIVO!);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(original).metadata();

    // PNG con alfa: el escudo tiene que poder ir sobre fondo claro y oscuro.
    //
    // Paleta de 64 colores y `dither: 0`. Un escudo es arte plana —oro, rojo,
    // negro y blanco—: el dithering le mete ruido a las zonas lisas y sextuplica
    // el peso (83 KB contra 13 KB) sin que se vea mejor. De 64 para abajo el
    // archivo ya no baja, asi que 64 es el punto donde deja de pagar recortar.
    const escalado = await sharp(original)
        .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, palette: true, colors: COLORES, dither: 0 })
        .toBuffer();

    const color = await colorDelEscudo(escalado);

    console.log(`Club: ${club.name} (${club.id})`);
    console.log(`  escudo actual: ${club.logo_url ? String(club.logo_url).slice(0, 60) : 'ninguno'}`);
    console.log(`  origen: ${meta.width}x${meta.height} ${meta.format} · ${(original.byteLength / 1024).toFixed(0)} KB`);
    console.log(`  a subir: ${LADO} de lado · paleta de ${COLORES} · ${(escalado.byteLength / 1024).toFixed(1)} KB` +
        ` (${Math.round((1 - escalado.byteLength / original.byteLength) * 100)}% menos)`);
    console.log(`  color dominante: ${color ?? 'no se pudo leer, queda como esta'}`);

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribio nada. Repeti con --execute.');
        return;
    }

    const guardado = await persistClubLogo(
        club.id,
        `data:image/png;base64,${escalado.toString('base64')}`,
        { supabaseClient: supabase },
    );
    if (guardado.warning) console.warn(`  ! ${guardado.warning}`);
    if (guardado.origin !== 'storage') {
        console.error('El escudo no llego a Storage: no se toca la ficha para no dejarlo embebido.');
        process.exit(1);
    }

    const patch: Record<string, unknown> = { logo_url: guardado.url };
    if (color && !club.primary_color) patch.primary_color = color;

    const { error } = await supabase.from('clubs').update(patch).eq('id', club.id);
    if (error) { console.error(`No se pudo guardar la ficha (${error.message})`); process.exit(1); }

    console.log(`\nListo: ${guardado.url}`);
    if (patch.primary_color) console.log(`  color primario: ${patch.primary_color}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
