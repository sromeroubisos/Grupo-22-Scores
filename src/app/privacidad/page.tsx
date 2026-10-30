import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Política de privacidad | G22 Scores',
    description: 'Qué datos recopila G22 Scores, para qué los usa, con quién los comparte y cómo eliminarlos.',
};

const UPDATED_AT = '14 de octubre de 2026';
const CONTACT_EMAIL = 'hola@g22scores.com';

/**
 * Política de privacidad de G22 Scores (web) y G22 Gestión (app móvil).
 * La App Store exige que esté publicada y enlazada desde la app (5.1.1).
 * Si se suma un proveedor nuevo (analítica, errores, notificaciones), hay que agregarlo acá.
 */
export default function PrivacidadPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px', maxWidth: '760px' }}>
            <div className="card" style={{ display: 'grid', gap: '20px', lineHeight: 1.6 }}>
                <div>
                    <h1 style={{ marginBottom: '8px' }}>Política de privacidad</h1>
                    <p style={{ opacity: 0.7 }}>Última actualización: {UPDATED_AT}</p>
                </div>

                <p>
                    Esta política explica qué datos personales tratan <strong>G22 Scores</strong> (g22scores.com) y la app
                    móvil <strong>G22 Gestión</strong>, ambas de Grupo 22, para qué se usan y qué podés hacer con ellos.
                    Podés consultar resultados, fixtures y tablas sin crear una cuenta.
                </p>

                <section>
                    <h2>1. Qué datos recopilamos</h2>
                    <ul>
                        <li>
                            <strong>Datos de tu cuenta</strong>, si te registrás: correo electrónico, nombre y foto de perfil
                            (los que entregue Google o Apple si ingresás con ellos), identificador de usuario y, si lo
                            activás, el segundo factor de autenticación.
                        </li>
                        <li>
                            <strong>Lo que cargás o elegís</strong>: clubes y torneos favoritos, deportes de interés,
                            pronósticos del prode, votos y calificaciones, y los partidos, resultados, planteles y eventos que
                            cargues si tenés un rol de gestión.
                        </li>
                        <li>
                            <strong>Roles y permisos</strong>: los clubes, torneos o deportes que administrás.
                        </li>
                        <li>
                            <strong>Pagos</strong>, si contratás un plan: el estado de la suscripción y los identificadores
                            que entrega Mercado Pago. No guardamos números de tarjeta.
                        </li>
                        <li>
                            <strong>Notificaciones</strong>, si las activás: el identificador del navegador o dispositivo
                            para enviarlas.
                        </li>
                        <li>
                            <strong>Datos técnicos</strong>: estadísticas de uso agregadas de la web (páginas visitadas, tipo
                            de dispositivo) y registros del servidor necesarios para operar y proteger el servicio.
                        </li>
                    </ul>
                    <p>
                        La app G22 Gestión guarda en tu celular una copia de los datos que gestionás para poder trabajar sin
                        conexión. No accede a tu ubicación, contactos, cámara ni micrófono, y no te rastrea entre apps o
                        sitios de terceros.
                    </p>
                </section>

                <section>
                    <h2>2. Para qué los usamos</h2>
                    <ul>
                        <li>Darte acceso a tu cuenta y mantener la sesión segura.</li>
                        <li>Mostrar tus favoritos y enviarte las notificaciones que pediste.</li>
                        <li>Publicar los resultados y datos deportivos que cargan los gestores.</li>
                        <li>Cobrar los planes contratados.</li>
                        <li>Mejorar el servicio y detectar errores o abusos.</li>
                    </ul>
                    <p>No vendemos tus datos personales ni los usamos para publicidad personalizada.</p>
                </section>

                <section>
                    <h2>3. Con quién los compartimos</h2>
                    <p>Solo con los proveedores que necesitamos para funcionar, que los tratan por cuenta nuestra:</p>
                    <ul>
                        <li><strong>Supabase</strong>: base de datos y autenticación.</li>
                        <li><strong>Vercel</strong>: alojamiento de la web y estadísticas de uso agregadas.</li>
                        <li><strong>Google</strong> y <strong>Apple</strong>: solo si elegís ingresar con ellos.</li>
                        <li><strong>Mercado Pago</strong>: solo si contratás un plan.</li>
                    </ul>
                    <p>
                        Los datos deportivos (resultados, planteles, estadísticas) son públicos por naturaleza. También
                        podemos revelar datos si lo exige la ley o una autoridad competente.
                    </p>
                </section>

                <section>
                    <h2>4. Cuánto tiempo los guardamos</h2>
                    <p>
                        Mientras tengas la cuenta activa. Si la eliminás, borramos tus datos personales. Los resultados y
                        datos deportivos que hayas cargado siguen publicados, pero sin asociarse a tu cuenta. Podemos
                        conservar registros de pagos el tiempo que exija la ley.
                    </p>
                </section>

                <section>
                    <h2>5. Cómo eliminar tu cuenta</h2>
                    <p>
                        En la app G22 Gestión: <strong>Sync → Cuenta → Eliminar cuenta</strong>. También podés pedirlo
                        escribiendo a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> desde el correo de tu cuenta.
                        Si tenés una suscripción activa, primero hay que cancelarla.
                    </p>
                </section>

                <section>
                    <h2>6. Tus derechos</h2>
                    <p>
                        Podés pedir acceso, corrección o eliminación de tus datos escribiendo a{' '}
                        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Respondemos en un plazo máximo de 10 días
                        hábiles. En Argentina, la Agencia de Acceso a la Información Pública es el órgano de control de la
                        Ley 25.326 de Protección de Datos Personales y atiende denuncias por su incumplimiento.
                    </p>
                </section>

                <section>
                    <h2>7. Menores</h2>
                    <p>
                        Los resultados se pueden consultar a cualquier edad. Para crear una cuenta hay que tener al menos 13
                        años o contar con la autorización de madre, padre o tutor.
                    </p>
                </section>

                <section>
                    <h2>8. Cambios</h2>
                    <p>
                        Si cambiamos esta política, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos
                        en la web o en la app.
                    </p>
                </section>

                <p>
                    ¿Dudas? Escribinos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> o desde{' '}
                    <Link href="/contacto">Contacto</Link>.
                </p>

                <Link href="/" className="btn btn-secondary" style={{ justifySelf: 'start' }}>Volver al inicio</Link>
            </div>
        </div>
    );
}
