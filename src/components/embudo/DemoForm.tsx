'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { trackEvent } from '@/lib/analytics';
import { hasWhatsapp, MENSAJE_DEMO, whatsappUrl } from '@/lib/contact';
import { erroresPorCampo, leadSchema } from '@/lib/leads/schema';
import { FORMULARIO, RANGOS_EQUIPOS, ROLES, type PromoOrigen } from '@/content/para-clubes';
import styles from './para-clubes.module.css';

/**
 * El formulario de demo.
 *
 * Hoy es el ÚNICO canal activo: no hay número de WhatsApp Business todavía, así
 * que `hasWhatsapp()` devuelve false y el sitio no dibuja un solo botón verde en
 * ninguna parte. El día que se setee `NEXT_PUBLIC_WHATSAPP_NUMBER` en Vercel, el
 * botón aparece solo, arriba del formulario, sin tocar una línea de esto.
 *
 * Valida dos veces y no por desconfianza del usuario: la validación del cliente
 * es para que no mande un formulario roto, la del servidor porque el cliente es
 * del visitante. Las dos leen el mismo schema, así que no pueden divergir.
 */

type Estado = 'idle' | 'enviando' | 'exito' | 'error';

const VALORES_INICIALES = {
    nombre: '',
    organizacion: '',
    rol: '',
    telefono: '',
    email: '',
    equipos: '',
    mensaje: '',
    sitioWeb: '',
};

export default function DemoForm({ origen }: { origen: PromoOrigen | null }) {
    const [valores, setValores] = useState(VALORES_INICIALES);
    const [errores, setErrores] = useState<Record<string, string>>({});
    const [estado, setEstado] = useState<Estado>('idle');
    const [mensajeError, setMensajeError] = useState('');
    const empezado = useRef(false);
    const exitoRef = useRef<HTMLDivElement | null>(null);

    const enlaceWhatsapp = whatsappUrl(MENSAJE_DEMO);

    const cambiar = (campo: keyof typeof VALORES_INICIALES, valor: string) => {
        // Un solo evento por sesión de formulario, en el primer tecleo real.
        if (!empezado.current) {
            empezado.current = true;
            trackEvent('demo_form_start', { origin: origen ?? 'directo' });
        }

        setValores((previos) => ({ ...previos, [campo]: valor }));
        setErrores((previos) => {
            if (!previos[campo]) return previos;
            const siguiente = { ...previos };
            delete siguiente[campo];
            return siguiente;
        });
    };

    const enviar = async (evento: FormEvent<HTMLFormElement>) => {
        evento.preventDefault();
        if (estado === 'enviando') return;

        setMensajeError('');

        const payload = {
            ...valores,
            origen: origen ?? '',
            // De qué página venía. Junto al `?ref=` es lo que permite atribuir
            // el lead a una ubicación concreta de la promo.
            referrer: typeof document !== 'undefined' ? document.referrer.slice(0, 500) : '',
        };

        const validado = leadSchema.safeParse(payload);
        if (!validado.success) {
            setErrores(erroresPorCampo(validado.error));
            setEstado('error');
            setMensajeError('Revisá los campos marcados.');
            return;
        }

        setErrores({});
        setEstado('enviando');
        trackEvent('demo_form_submit', { origin: origen ?? 'directo' });

        try {
            const respuesta = await fetch('/api/leads/club-demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validado.data),
            });

            const datos = await respuesta.json().catch(() => null);

            if (!respuesta.ok || !datos?.ok) {
                setErrores(datos?.errores ?? {});
                setMensajeError(datos?.error ?? FORMULARIO.errorGenerico);
                setEstado('error');
                return;
            }

            setEstado('exito');
            // El mensaje de éxito reemplaza al formulario: hay que llevar el
            // foco, o quien navega con teclado se queda parado en la nada.
            requestAnimationFrame(() => exitoRef.current?.focus());
        } catch {
            setMensajeError(FORMULARIO.errorGenerico);
            setEstado('error');
        }
    };

    if (estado === 'exito') {
        return (
            <div
                ref={exitoRef}
                className={styles.exito}
                role="status"
                tabIndex={-1}
            >
                <span className={styles.exitoTilde} aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                    </svg>
                </span>
                <p className={styles.exitoTexto}>{FORMULARIO.exito}</p>
            </div>
        );
    }

    const enviando = estado === 'enviando';

    return (
        <div className={styles.formularioCaja}>
            <h3 className={styles.formularioTitulo}>{FORMULARIO.titulo}</h3>

            {/* Sin número configurado, esto no existe. Ver lib/contact.ts. */}
            {hasWhatsapp() && enlaceWhatsapp && (
                <>
                    <a
                        href={enlaceWhatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.botonWhatsapp}
                        onClick={() => trackEvent('clubs_promo_click', { location: 'whatsapp' })}
                    >
                        {FORMULARIO.whatsapp}
                    </a>
                    <p className={styles.formularioAyuda}>{FORMULARIO.whatsappAyuda}</p>
                </>
            )}

            <p className={styles.formularioAyuda}>{FORMULARIO.ayuda}</p>

            <form className={styles.formulario} onSubmit={enviar} noValidate>
                {/*
                 * Honeypot. Fuera de pantalla pero no `display:none`: algunos
                 * bots ignoran los campos ocultos por CSS de esa forma. Sin
                 * label visible, sin tabulación y sin autocompletado.
                 */}
                <div className={styles.trampa} aria-hidden="true">
                    <label htmlFor="lead-sitio-web">No completar</label>
                    <input
                        id="lead-sitio-web"
                        name="sitioWeb"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={valores.sitioWeb}
                        onChange={(e) => setValores((p) => ({ ...p, sitioWeb: e.target.value }))}
                    />
                </div>

                <div className={styles.campo}>
                    <label htmlFor="lead-nombre" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.nombre.label} <span aria-hidden="true">*</span>
                    </label>
                    <input
                        id="lead-nombre"
                        name="nombre"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder={FORMULARIO.campos.nombre.placeholder}
                        className={styles.input}
                        value={valores.nombre}
                        onChange={(e) => cambiar('nombre', e.target.value)}
                        aria-invalid={Boolean(errores.nombre)}
                        aria-describedby={errores.nombre ? 'error-nombre' : undefined}
                        disabled={enviando}
                    />
                    {errores.nombre && (
                        <span id="error-nombre" className={styles.error}>{errores.nombre}</span>
                    )}
                </div>

                <div className={styles.campo}>
                    <label htmlFor="lead-organizacion" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.organizacion.label} <span aria-hidden="true">*</span>
                    </label>
                    <input
                        id="lead-organizacion"
                        name="organizacion"
                        type="text"
                        required
                        autoComplete="organization"
                        placeholder={FORMULARIO.campos.organizacion.placeholder}
                        className={styles.input}
                        value={valores.organizacion}
                        onChange={(e) => cambiar('organizacion', e.target.value)}
                        aria-invalid={Boolean(errores.organizacion)}
                        aria-describedby={errores.organizacion ? 'error-organizacion' : undefined}
                        disabled={enviando}
                    />
                    {errores.organizacion && (
                        <span id="error-organizacion" className={styles.error}>{errores.organizacion}</span>
                    )}
                </div>

                <div className={styles.campo}>
                    <label htmlFor="lead-rol" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.rol.label} <span aria-hidden="true">*</span>
                    </label>
                    <select
                        id="lead-rol"
                        name="rol"
                        required
                        className={styles.input}
                        value={valores.rol}
                        onChange={(e) => cambiar('rol', e.target.value)}
                        aria-invalid={Boolean(errores.rol)}
                        aria-describedby={errores.rol ? 'error-rol' : undefined}
                        disabled={enviando}
                    >
                        <option value="">Elegí una opción</option>
                        {ROLES.map((rol) => (
                            <option key={rol.valor} value={rol.valor}>{rol.label}</option>
                        ))}
                    </select>
                    {errores.rol && <span id="error-rol" className={styles.error}>{errores.rol}</span>}
                </div>

                <div className={styles.campo}>
                    <label htmlFor="lead-telefono" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.telefono.label} <span aria-hidden="true">*</span>
                    </label>
                    <input
                        id="lead-telefono"
                        name="telefono"
                        type="tel"
                        required
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder={FORMULARIO.campos.telefono.placeholder}
                        className={styles.input}
                        value={valores.telefono}
                        onChange={(e) => cambiar('telefono', e.target.value)}
                        aria-invalid={Boolean(errores.telefono)}
                        aria-describedby={errores.telefono ? 'error-telefono' : undefined}
                        disabled={enviando}
                    />
                    {errores.telefono && (
                        <span id="error-telefono" className={styles.error}>{errores.telefono}</span>
                    )}
                </div>

                <div className={styles.campo}>
                    <label htmlFor="lead-email" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.email.label}
                        <span className={styles.opcional}>{FORMULARIO.campos.email.opcional}</span>
                    </label>
                    <input
                        id="lead-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder={FORMULARIO.campos.email.placeholder}
                        className={styles.input}
                        value={valores.email}
                        onChange={(e) => cambiar('email', e.target.value)}
                        aria-invalid={Boolean(errores.email)}
                        aria-describedby={errores.email ? 'error-email' : undefined}
                        disabled={enviando}
                    />
                    {errores.email && (
                        <span id="error-email" className={styles.error}>{errores.email}</span>
                    )}
                </div>

                <div className={styles.campo}>
                    <label htmlFor="lead-equipos" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.equipos.label} <span aria-hidden="true">*</span>
                    </label>
                    <select
                        id="lead-equipos"
                        name="equipos"
                        required
                        className={styles.input}
                        value={valores.equipos}
                        onChange={(e) => cambiar('equipos', e.target.value)}
                        aria-invalid={Boolean(errores.equipos)}
                        aria-describedby={errores.equipos ? 'error-equipos' : undefined}
                        disabled={enviando}
                    >
                        <option value="">Elegí una opción</option>
                        {RANGOS_EQUIPOS.map((rango) => (
                            <option key={rango.valor} value={rango.valor}>{rango.label}</option>
                        ))}
                    </select>
                    {errores.equipos && (
                        <span id="error-equipos" className={styles.error}>{errores.equipos}</span>
                    )}
                </div>

                <div className={`${styles.campo} ${styles.campoAncho}`}>
                    <label htmlFor="lead-mensaje" className={styles.etiquetaCampo}>
                        {FORMULARIO.campos.mensaje.label}
                        <span className={styles.opcional}>{FORMULARIO.campos.mensaje.opcional}</span>
                    </label>
                    <textarea
                        id="lead-mensaje"
                        name="mensaje"
                        rows={3}
                        placeholder={FORMULARIO.campos.mensaje.placeholder}
                        className={`${styles.input} ${styles.textarea}`}
                        value={valores.mensaje}
                        onChange={(e) => cambiar('mensaje', e.target.value)}
                        aria-invalid={Boolean(errores.mensaje)}
                        aria-describedby={errores.mensaje ? 'error-mensaje' : undefined}
                        disabled={enviando}
                    />
                    {errores.mensaje && (
                        <span id="error-mensaje" className={styles.error}>{errores.mensaje}</span>
                    )}
                </div>

                {mensajeError && (
                    <p className={styles.errorGeneral} role="alert">{mensajeError}</p>
                )}

                <button type="submit" className={styles.botonEnviar} disabled={enviando}>
                    {enviando ? FORMULARIO.enviando : FORMULARIO.enviar}
                </button>
            </form>
        </div>
    );
}
