/**
 * ANDAMIAJE DESCARTABLE — placas del finde 25 al 27 de septiembre de 2026.
 *
 * Recibe un PNG en base64 y lo escribe en disco. Sacar los MB de base64 por el
 * puente del navegador headless en cambio revienta el contexto.
 *
 * Sólo en desarrollo y sólo a las carpetas conocidas: es una ruta que escribe
 * archivos, no algo que deba existir en producción. Borrar junto con
 * `src/app/exportar/lote-finde` y el manifiesto cuando la tanda esté entregada.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';

const CARPETAS = new Set([
    'interior-a', 'urba-top-14', 'noa', 'ascenso',
    'interior-a-historia', 'urba-top-14-historia', 'noa-historia', 'ascenso-historia',
    'grupales-historia', 'uruguayo-historia', 'urba-historia', 'andina-historia',
]);

// Las placas van a Descargas, NO al árbol del proyecto: son entregables, no
// código, y adentro del repo terminan en `git status` o —peor— en un commit.
const DESTINO = path.join(os.homedir(), 'Downloads', 'G22-finde-25-27-sept');

export async function POST(request: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Sólo en desarrollo.' }, { status: 404 });
    }

    const { carpeta, nombre, dataUrl } = await request.json();

    if (!CARPETAS.has(carpeta)) {
        return NextResponse.json({ error: `Carpeta no permitida: ${carpeta}` }, { status: 400 });
    }
    if (typeof nombre !== 'string' || !/^[a-z0-9-]+$/.test(nombre)) {
        return NextResponse.json({ error: `Nombre no permitido: ${nombre}` }, { status: 400 });
    }
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
        return NextResponse.json({ error: 'Falta el PNG.' }, { status: 400 });
    }

    const destino = path.join(DESTINO, carpeta);
    await fs.mkdir(destino, { recursive: true });
    const archivo = path.join(destino, `${nombre}.png`);
    const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    await fs.writeFile(archivo, bytes);

    return NextResponse.json({ ok: true, archivo, bytes: bytes.length });
}
