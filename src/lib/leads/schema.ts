import { z } from 'zod';

/**
 * El contrato del lead, uno solo para el navegador y para el servidor.
 *
 * Compartir el schema no es elegancia: es que la validación del cliente y la
 * del servidor no puedan divergir. El cliente valida para que el dirigente no
 * mande un formulario roto; el servidor valida porque el cliente es del
 * visitante y no se le cree nada.
 */

export const ROLES_VALIDOS = ['dirigente', 'entrenador', 'prensa', 'otro'] as const;
export const RANGOS_VALIDOS = ['1-4', '5-10', '11-20', '+20'] as const;

export type RolLead = (typeof ROLES_VALIDOS)[number];
export type RangoEquipos = (typeof RANGOS_VALIDOS)[number];

/**
 * Suficiente para atajar el dedazo, no tanto como para rechazar una dirección
 * rara pero real. El email es opcional: no vale la pena perder un lead por
 * discutirle el formato a un dominio con tilde.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const leadSchema = z.object({
    nombre: z.string().trim().min(2).max(120),
    organizacion: z.string().trim().min(2).max(160),
    rol: z.enum(ROLES_VALIDOS),
    telefono: z
        .string()
        .trim()
        .min(6)
        .max(40)
        // Un teléfono se escribe de mil formas; lo único que se exige es que
        // tenga suficientes dígitos como para poder llamar.
        .refine((valor) => valor.replace(/\D/g, '').length >= 6),
    email: z
        .string()
        .trim()
        .max(160)
        .refine((valor) => valor === '' || EMAIL_RE.test(valor))
        .default(''),
    equipos: z.enum(RANGOS_VALIDOS),
    mensaje: z.string().trim().max(2000).default(''),
    /** De dónde vino: el `?ref=` de la ubicación que generó el click. */
    origen: z.string().trim().max(40).default(''),
    referrer: z.string().trim().max(500).default(''),
    /**
     * Honeypot. Va oculto en el formulario y ninguna persona lo ve, así que si
     * viene con algo adentro lo llenó un bot. Se llama `sitioWeb` porque el
     * autocompletado de los bots busca campos con nombre plausible.
     */
    sitioWeb: z.string().max(0).default(''),
});

export type LeadEntrada = z.input<typeof leadSchema>;
export type LeadValidado = z.output<typeof leadSchema>;

/**
 * Los mensajes de error, por campo y en castellano.
 *
 * Zod habla en inglés y por código de issue. El dirigente no tiene por qué leer
 * "String must contain at least 2 character(s)".
 */
export const MENSAJES_ERROR: Record<string, string> = {
    nombre: 'Escribí tu nombre y apellido.',
    organizacion: 'Poné el nombre del club o del torneo.',
    rol: 'Elegí tu rol.',
    telefono: 'Dejanos un WhatsApp o teléfono con el que podamos escribirte.',
    email: 'Ese email no parece válido. Podés dejarlo vacío.',
    equipos: 'Elegí cuántos equipos son.',
    mensaje: 'El mensaje es demasiado largo.',
};

export const MENSAJE_ERROR_GENERICO = 'Revisá los datos del formulario.';

/**
 * Convierte el error de Zod en `{ campo: mensaje }`, que es lo que el
 * formulario necesita para pintar cada input.
 */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
    const salida: Record<string, string> = {};
    for (const issue of error.issues) {
        const campo = String(issue.path[0] ?? '');
        if (!campo || salida[campo]) continue;
        salida[campo] = MENSAJES_ERROR[campo] ?? MENSAJE_ERROR_GENERICO;
    }
    return salida;
}
