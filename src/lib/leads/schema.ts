import { z } from 'zod';

/**
 * El contrato del lead, uno solo para el navegador y para el servidor.
 *
 * Compartir el schema no es elegancia: es que la validación del cliente y la
 * del servidor no puedan divergir. El cliente valida para que el dirigente no
 * mande un formulario roto; el servidor valida porque el cliente es del
 * visitante y no se le cree nada.
 *
 * ── Un formulario, dos preguntas distintas ─────────────────────────────────
 *
 * Desde que el embudo tiene dos puertas, el formulario también las tiene. Al
 * que ORGANIZA se le pregunta cuántos equipos maneja: es la medida de su
 * torneo. Al que representa un CLUB esa pregunta no le dice nada —tiene uno—;
 * lo que define su tamaño es qué categorías juegan, y de paso hace falta saber
 * en qué torneo, porque puede no estar todavía en G22.
 *
 * Por eso el schema lleva `embudo` y valida distinto según cuál sea. Los campos
 * de la otra puerta viajan vacíos y no molestan.
 */

export const ROLES_VALIDOS = ['dirigente', 'entrenador', 'prensa', 'jugador', 'otro'] as const;
export const RANGOS_VALIDOS = ['1-4', '5-10', '11-20', '+20'] as const;
export const EMBUDOS_VALIDOS = ['clubes', 'torneos'] as const;

/**
 * Las categorías de un club de rugby, en el orden en que las nombra el club:
 * de la primera para abajo, y después las ramas que no entran en esa escalera.
 */
export const CATEGORIAS_VALIDAS = [
    'primera',
    'intermedia',
    'm19',
    'm17',
    'm16',
    'femenino',
    'infantiles',
] as const;

export type RolLead = (typeof ROLES_VALIDOS)[number];
export type RangoEquipos = (typeof RANGOS_VALIDOS)[number];
export type CategoriaLead = (typeof CATEGORIAS_VALIDAS)[number];
export type EmbudoLead = (typeof EMBUDOS_VALIDOS)[number];

/**
 * Suficiente para atajar el dedazo, no tanto como para rechazar una dirección
 * rara pero real. El email es opcional: no vale la pena perder un lead por
 * discutirle el formato a un dominio con tilde.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const leadSchema = z
    .object({
        /**
         * Por qué puerta entró. Decide qué campos son obligatorios más abajo.
         * Por defecto 'torneos', que es el formulario que ya existía.
         */
        embudo: z.enum(EMBUDOS_VALIDOS).default('torneos'),
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
        /** Sólo /para-torneos. En el embudo de clubes viaja vacío. */
        equipos: z.string().trim().max(20).default(''),
        /** Sólo /para-clubes: en qué torneo juega, que puede no estar en G22. */
        torneo: z.string().trim().max(160).default(''),
        /** Sólo /para-clubes: qué categorías juegan. Es su medida de tamaño. */
        categorias: z.array(z.string().trim().max(20)).max(20).default([]),
        mensaje: z.string().trim().max(2000).default(''),
        /** De dónde vino: `${embudo}:${ubicación}` — ver content/embudo.ts. */
        origen: z.string().trim().max(40).default(''),
        referrer: z.string().trim().max(500).default(''),
        /**
         * Honeypot. Va oculto en el formulario y ninguna persona lo ve, así que si
         * viene con algo adentro lo llenó un bot. Se llama `sitioWeb` porque el
         * autocompletado de los bots busca campos con nombre plausible.
         */
        sitioWeb: z.string().max(0).default(''),
    })
    .superRefine((valores, ctx) => {
        if (valores.embudo === 'clubes') {
            if (!valores.torneo) {
                ctx.addIssue({ code: 'custom', path: ['torneo'], message: 'requerido' });
            }
            if (valores.categorias.length === 0) {
                ctx.addIssue({ code: 'custom', path: ['categorias'], message: 'requerido' });
            }
            const invalida = valores.categorias.find(
                (c) => !(CATEGORIAS_VALIDAS as readonly string[]).includes(c),
            );
            if (invalida) {
                ctx.addIssue({ code: 'custom', path: ['categorias'], message: 'inválida' });
            }
            return;
        }

        if (!(RANGOS_VALIDOS as readonly string[]).includes(valores.equipos)) {
            ctx.addIssue({ code: 'custom', path: ['equipos'], message: 'requerido' });
        }
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
    torneo: 'Decinos en qué torneo juega tu club. Si no está en G22, escribilo igual.',
    categorias: 'Marcá al menos una categoría.',
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
