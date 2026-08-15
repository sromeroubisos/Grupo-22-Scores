/**
 * TEMPORAL — diagnóstico del proveedor externo en produccion.
 *
 * Rugby y basquet fallan en produccion y andan en local con la misma clave, asi
 * que hay que ver el estado REAL que devuelve RapidAPI desde el servidor que
 * atiende, no desde una maquina de desarrollo. Esta ruta hace un pedido directo
 * y reporta el codigo, los headers de cuota y el principio del cuerpo.
 *
 * No devuelve la clave: solo si existe, cuanto mide y sus cuatro primeros y
 * ultimos caracteres, que alcanza para comparar contra la que funciona.
 *
 * Se borra apenas quede diagnosticado.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TOKEN = '8b870df26e569f54afd02ab5';

async function probe(host: string, key: string, sportId: number) {
    const url = `https://${host}/api/flashscore/v2/matches/list?day=0&sport_id=${sportId}`;
    const startedAt = Date.now();
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': key },
        });
        const body = await response.text();
        return {
            sportId,
            status: response.status,
            ms: Date.now() - startedAt,
            cuota: {
                limite: response.headers.get('x-ratelimit-requests-limit'),
                restante: response.headers.get('x-ratelimit-requests-remaining'),
            },
            cuerpo: body.slice(0, 200),
        };
    } catch (error) {
        return {
            sportId,
            status: null,
            ms: Date.now() - startedAt,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
    }
}

export async function GET(request: Request) {
    if (new URL(request.url).searchParams.get('t') !== TOKEN) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const key = process.env.RAPIDAPI_KEY || '';
    const publicKeyPresente = Boolean(process.env.NEXT_PUBLIC_RAPIDAPI_KEY);
    const host = process.env.RAPIDAPI_HOST || process.env.NEXT_PUBLIC_RAPIDAPI_HOST || 'flashscore4.p.rapidapi.com';

    return NextResponse.json({
        entorno: {
            vercelEnv: process.env.VERCEL_ENV || null,
            region: process.env.VERCEL_REGION || null,
        },
        clave: {
            presente: Boolean(key),
            largo: key.length,
            huella: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null,
            fuente: process.env.RAPIDAPI_KEY ? 'RAPIDAPI_KEY' : null,
            hayVariablePublica: publicKeyPresente,
        },
        host: {
            usado: host,
            fuente: process.env.RAPIDAPI_HOST
                ? 'RAPIDAPI_HOST'
                : (process.env.NEXT_PUBLIC_RAPIDAPI_HOST ? 'NEXT_PUBLIC_RAPIDAPI_HOST' : 'default del codigo'),
        },
        // 8 = rugby union, 3 = basquet: los dos que fallan.
        pedidos: await Promise.all([probe(host, key, 8), probe(host, key, 3)]),
    });
}
