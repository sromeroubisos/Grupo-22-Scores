import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

/**
 * QUÉ LOGOS HAY EN DISCO, AHORA MISMO.
 *
 * El manifiesto generado (`logo-manifest.generated.ts`) se arma en `prebuild`, y
 * eso alcanza en producción: el build ve los archivos que hay al momento de
 * compilar. En DESARROLLO no alcanza — el servidor ya está levantado cuando el
 * autor arrastra un PNG nuevo a `public/clubs/`, y hasta que alguien corriera el
 * script a mano ese escudo no aparecía.
 *
 * Esta ruta lee las tres carpetas en el momento y devuelve los ids que tienen
 * archivo. El cliente la consulta UNA vez por carga de página y completa el
 * manifiesto compilado. Con eso, el flujo es: soltás el PNG, refrescás, está.
 *
 * SOLO en desarrollo. En producción devuelve vacío y no toca el disco: el
 * manifiesto compilado ya trae todo, y leer `public/` en runtime no es algo con
 * lo que se pueda contar en un serverless.
 */
export const dynamic = 'force-dynamic';

async function pngIdsIn(folder: string): Promise<string[]> {
    try {
        const files = await readdir(join(process.cwd(), 'public', folder));
        return files.filter((f) => f.toLowerCase().endsWith('.png')).map((f) => f.slice(0, -4));
    } catch {
        // La carpeta puede no existir todavía: no es un error, es que no hay logos.
        return [];
    }
}

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ clubs: [], competitions: [], awards: [], dev: false });
    }

    const [clubs, competitions, awards] = await Promise.all([
        pngIdsIn('clubs'), pngIdsIn('competiciones'), pngIdsIn('premios'),
    ]);
    return NextResponse.json(
        { clubs, competitions, awards, dev: true },
        // Sin caché: la gracia es justamente ver el archivo que acabás de soltar.
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
