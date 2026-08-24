import type { LeadValidado } from './schema';

/**
 * El aviso al equipo cuando entra un lead del embudo comercial.
 *
 * Manda el formulario por mail. La implementación usa la API HTTP de Resend con
 * `fetch` pelado —sin SDK ni dependencia nueva en package.json— y si no hay
 * `RESEND_API_KEY` cae en el notificador de log.
 *
 * **Nunca pierde un lead.** Si el envío falla —sin API key, cuota agotada, la
 * API caída—, el lead se escribe ENTERO en el log del servidor. Un mail que no
 * sale es molesto; un dirigente que llenó el formulario y desapareció sin dejar
 * rastro es plata tirada.
 *
 * El endpoint tampoco le pasa el error al visitante: para él el pedido entró, y
 * entró de verdad (ya está en la base). Lo que se rompió es nuestro aviso.
 */

export type LeadNotificacion = LeadValidado & {
    creadoEn: string;
    persistido: boolean;
};

export interface LeadNotifier {
    notificar(lead: LeadNotificacion): Promise<void>;
}

/** A dónde llega el formulario. La env var pisa el valor por defecto. */
export const DESTINO_NOTIFICACION =
    process.env.LEADS_NOTIFY_EMAIL || 'salidade22info@gmail.com';

/**
 * Quién lo manda.
 *
 * `onboarding@resend.dev` es el remitente compartido de Resend: anda sin
 * verificar un dominio, pero SÓLO entrega al mail dueño de la cuenta de Resend.
 * O sea: alcanza si la cuenta se abre con salidade22info@gmail.com. Para
 * mandarle a cualquier otra dirección hay que verificar g22scores.com en Resend
 * y poner acá algo como 'G22 Scores <leads@g22scores.com>'.
 */
const REMITENTE = process.env.LEADS_FROM_EMAIL || 'G22 Scores <onboarding@resend.dev>';

const ROLES_LEGIBLES: Record<string, string> = {
    dirigente: 'Dirigente',
    entrenador: 'Entrenador',
    prensa: 'Prensa',
    jugador: 'Jugador',
    otro: 'Otro',
};

const CATEGORIAS_LEGIBLES: Record<string, string> = {
    primera: 'Primera',
    intermedia: 'Intermedia',
    m19: 'M19',
    m17: 'M17',
    m16: 'M16',
    femenino: 'Femenino',
    infantiles: 'Infantiles',
};

const EQUIPOS_LEGIBLES: Record<string, string> = {
    '1-4': '1 a 4 equipos',
    '5-10': '5 a 10 equipos',
    '11-20': '11 a 20 equipos',
    '+20': 'Más de 20 equipos',
};

function fechaLegible(iso: string): string {
    // Con `timeZone` explícito: el servidor corre en UTC y sin esto el mail
    // diría una hora que no es la de nadie.
    return new Date(iso).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'short',
        timeStyle: 'short',
        hourCycle: 'h23',
    });
}

/**
 * Por qué puerta entró.
 *
 * `lead.origen` viene como `torneos:feed` o `clubes:nav` — el embudo adelante y
 * la ubicación atrás. Antes había una sola landing y el mail podía nombrarla;
 * ahora son dos y el que lee el aviso necesita saber cuál, porque no se le
 * contesta lo mismo al que organiza un torneo que al que representa a un club.
 */
function puertaLegible(origen: string): string {
    if (origen.startsWith('torneos')) return 'Organiza un torneo (/para-torneos)';
    if (origen.startsWith('clubes')) return 'Representa un club (/para-clubes)';
    return 'Sin identificar';
}

function filas(lead: LeadNotificacion): Array<[string, string]> {
    const esClub = lead.embudo === 'clubes';

    /*
     * La fila que cambia según la puerta. Al que organiza se le preguntó cuántos
     * equipos maneja; al club, qué categorías juegan y en qué torneo. Mostrar
     * las dos con un guión en la que no corresponde ensucia el mail que alguien
     * lee apurado desde el teléfono.
     */
    const especificas: Array<[string, string]> = esClub
        ? [
            ['Torneo', lead.torneo || '—'],
            [
                'Categorías',
                lead.categorias.length > 0
                    ? lead.categorias.map((c) => CATEGORIAS_LEGIBLES[c] ?? c).join(', ')
                    : '—',
            ],
        ]
        : [
            ['Equipos', EQUIPOS_LEGIBLES[lead.equipos] ?? (lead.equipos || '—')],
        ];

    return [
        ['Nombre', lead.nombre],
        [esClub ? 'Club' : 'Club o torneo', lead.organizacion],
        ['Rol', ROLES_LEGIBLES[lead.rol] ?? lead.rol],
        ['WhatsApp / teléfono', lead.telefono],
        ['Email', lead.email || '—'],
        ...especificas,
        ['Mensaje', lead.mensaje || '—'],
        ['Puerta', puertaLegible(lead.origen)],
        ['Vino de', lead.origen || 'directo'],
        ['Página anterior', lead.referrer || '—'],
        ['Fecha', fechaLegible(lead.creadoEn)],
        ['Guardado en la base', lead.persistido ? 'sí' : 'NO — sólo en este mail'],
    ];
}

function escapar(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function cuerpoTexto(lead: LeadNotificacion): string {
    return [
        'Pedido de demo desde g22scores.com',
        '',
        ...filas(lead).map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    ].join('\n');
}

function cuerpoHtml(lead: LeadNotificacion): string {
    const celdas = filas(lead)
        .map(
            ([etiqueta, valor]) =>
                `<tr>
                    <td style="padding:6px 14px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${escapar(etiqueta)}</td>
                    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${escapar(valor)}</td>
                </tr>`,
        )
        .join('');

    return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px">
        <p style="margin:0 0 4px;color:#00794a;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">G22 para clubes y torneos</p>
        <h2 style="margin:0 0 16px;font-size:19px;color:#111827">Pedido de demo</h2>
        <table style="border-collapse:collapse;width:100%">${celdas}</table>
        <p style="margin:20px 0 0;color:#6b7280;font-size:12px">Enviado desde el formulario de g22scores.com</p>
    </div>`;
}

class NotificadorPorLog implements LeadNotifier {
    async notificar(lead: LeadNotificacion): Promise<void> {
        console.info(
            `[leads] pedido de demo — sin RESEND_API_KEY, no se mandó mail. Destino previsto: ${DESTINO_NOTIFICACION}.`,
            `\n${cuerpoTexto(lead)}`,
        );
    }
}

class NotificadorResend implements LeadNotifier {
    constructor(private readonly apiKey: string) { }

    async notificar(lead: LeadNotificacion): Promise<void> {
        const respuesta = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: REMITENTE,
                to: [DESTINO_NOTIFICACION],
                // Responder el mail le escribe al dirigente, no a nosotros.
                ...(lead.email ? { reply_to: lead.email } : {}),
                subject: `Demo G22 ${lead.embudo === 'clubes' ? 'CLUB' : 'TORNEO'} — ${lead.organizacion} (${lead.nombre})`,
                text: cuerpoTexto(lead),
                html: cuerpoHtml(lead),
            }),
        });

        if (!respuesta.ok) {
            const detalle = await respuesta.text().catch(() => '');
            // Se tira para que el llamador lo registre, pero el lead ya está a
            // salvo: el endpoint loguea el error y le contesta que sí al
            // visitante igual.
            throw new Error(`Resend respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
        }
    }
}

const notificadorPorLog = new NotificadorPorLog();

export function hayProveedorDeMail(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
}

export function obtenerNotificador(): LeadNotifier {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return notificadorPorLog;
    return new NotificadorResend(apiKey);
}

/**
 * Lo que llama el endpoint: intenta el mail y, si se cae, deja el lead en el
 * log. Existe para que el "no se pierde nunca" viva en un solo lugar y no
 * dependa de que cada llamador se acuerde del try/catch.
 *
 * Devuelve `true` sólo si SALIÓ un mail de verdad. El notificador de log no
 * manda nada: contar su éxito como envío haría que la respuesta del endpoint
 * dijera `notificado: true` sin que llegue un solo mail, que es exactamente la
 * clase de mentira que después cuesta un lead perdido y una tarde de debug.
 */
export async function notificarLead(lead: LeadNotificacion): Promise<boolean> {
    try {
        await obtenerNotificador().notificar(lead);
        return hayProveedorDeMail();
    } catch (error) {
        console.error(
            `[leads] no se pudo mandar el mail a ${DESTINO_NOTIFICACION}; el lead queda en este log.`,
            error,
            `\n${cuerpoTexto(lead)}`,
        );
        return false;
    }
}
