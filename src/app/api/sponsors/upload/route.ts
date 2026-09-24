// La imagen de un sponsor: POST multipart { ownerType, ownerId, format, file }.
//
// El navegador ya la manda recortada y achicada (el gestor la pasa por un
// canvas), pero el servidor no confía: vuelve a medir la proporción y el
// mínimo con la MISMA regla (checkSponsorImage), la achica al tamaño guardado
// y la re-codifica a WebP. Re-codificar también limpia metadatos y cualquier
// cosa rara que viaje dentro del archivo.
//
// El tope real de lo que llega es 4 MB, por debajo de los 4,5 MB con los que
// Vercel corta el cuerpo del pedido. Los 5 MB que ve el usuario son del archivo
// ORIGINAL, que nunca viaja tal cual.
//
// El nombre sale del hash del contenido (como persistClubLogo y las noticias):
// subir dos veces la misma imagen reescribe el mismo objeto.

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import sharp from 'sharp';

import {
    SPONSOR_ACCEPTED_LABEL,
    SPONSOR_ACCEPTED_MIME,
    SPONSOR_FORMATS,
    checkSponsorImage,
    isSponsorFormat,
    isSponsorOwnerType,
} from '@/lib/sponsors/formats';
import {
    SPONSORS_BUCKET,
    requireSponsorOwnerAccess,
    resolveSponsorOwner,
    sponsorErrorResponseBody,
} from '@/lib/sponsors/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_RECEIVED_BYTES = 4 * 1024 * 1024;
const ACCEPTED = new Set<string>(SPONSOR_ACCEPTED_MIME);

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return fail('El pedido no trae un archivo.', 400);
    }

    const ownerType = form.get('ownerType');
    const format = form.get('format');
    const file = form.get('file');
    if (!isSponsorOwnerType(ownerType)) return fail('ownerType tiene que ser club o tournament.', 400);
    if (!isSponsorFormat(format)) return fail('Elegí si es un banner o un logo.', 400);
    if (!(file instanceof File)) return fail('Elegí un archivo de imagen.', 400);
    if (!ACCEPTED.has(file.type.toLowerCase())) return fail(`Formato no soportado: usá ${SPONSOR_ACCEPTED_LABEL}.`, 415);
    if (file.size === 0) return fail('El archivo llegó vacío.', 400);
    if (file.size > MAX_RECEIVED_BYTES) return fail('La imagen llegó demasiado pesada. Probá con una más chica.', 413);

    try {
        const owner = await resolveSponsorOwner(ownerType, String(form.get('ownerId') ?? ''));
        if (!owner) return fail('No encontramos a quién pertenece este sponsor.', 404);
        await requireSponsorOwnerAccess(owner);

        const input = Buffer.from(await file.arrayBuffer());

        let metadata: sharp.Metadata;
        try {
            metadata = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
        } catch {
            return fail('No pudimos leer la imagen. Probá exportarla de nuevo como PNG o JPG.', 422);
        }

        // Una foto de celular puede venir girada por EXIF: se mide ya derecha.
        const rotated = (metadata.orientation ?? 1) >= 5;
        const width = (rotated ? metadata.height : metadata.width) ?? 0;
        const height = (rotated ? metadata.width : metadata.height) ?? 0;

        const check = checkSponsorImage(format, width, height);
        if (!check.ok) return fail(check.message, 422);

        const spec = SPONSOR_FORMATS[format];
        const { data: output, info } = await sharp(input, { limitInputPixels: 50_000_000 })
            .rotate()
            .resize(spec.stored.width, spec.stored.height, { fit: 'inside', withoutEnlargement: true })
            .webp(format === 'logo'
                ? { quality: 90, alphaQuality: 100, effort: 5 }
                : { quality: 84, effort: 5 })
            .toBuffer({ resolveWithObject: true });

        const digest = createHash('sha256').update(output).digest('hex').slice(0, 20);
        const path = `${owner.type}/${owner.id}/${digest}.webp`;

        const admin = createAdminClient();
        const { error } = await admin.storage
            .from(SPONSORS_BUCKET)
            .upload(path, output, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
        if (error) {
            console.error('[api/sponsors/upload] upload failed:', error);
            return fail(
                /bucket not found/i.test(error.message)
                    ? `El bucket "${SPONSORS_BUCKET}" no existe en Storage: falta correr la migración de sponsors.`
                    : 'Storage rechazó la imagen. Probá de nuevo en un rato.',
                502,
            );
        }

        const { data } = admin.storage.from(SPONSORS_BUCKET).getPublicUrl(path);
        if (!data?.publicUrl) return fail('La imagen se subió pero no se pudo resolver su URL pública.', 502);

        return NextResponse.json({
            data: { url: data.publicUrl, width: info.width, height: info.height, bytes: output.byteLength },
        });
    } catch (error) {
        const { status, body } = sponsorErrorResponseBody(error, 'No se pudo subir la imagen.');
        return NextResponse.json(body, { status });
    }
}
