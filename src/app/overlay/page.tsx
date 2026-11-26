import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';
import OverlayBuilder from './OverlayBuilder';
import styles from './builder.module.css';

export const metadata: Metadata = {
  title: 'Overlays para transmisión · G22 Scores',
  description: 'Gráficos en vivo de G22 para OBS, vMix y Streamlabs: partido, marcador, fecha, día, playoff y jugador.',
  robots: { index: false, follow: false },
};

/**
 * El generador es para quien tiene el rol `usuario_overlay` (o es admin
 * global). Los overlays en sí (/overlay/partido/…, /overlay/manual/…) siguen
 * públicos: los abre OBS o vMix, que no tienen sesión.
 */
export default async function OverlayBuilderPage() {
  const access = await getOverlayAccess();
  if (access.status === 'signed-out') redirect('/login?returnTo=%2Foverlay');

  if (access.status === 'denied') {
    return (
      <main className={styles.page}>
        <div className={styles.denied}>
          <p className={styles.deniedEyebrow}>Overlays · G22</p>
          <h1 className={styles.h1}>Sin acceso a overlays</h1>
          <p className={styles.lead}>
            Tu cuenta no tiene el rol <b>Usuario con overlays</b>. Pedíselo a un administrador de G22 y, cuando te lo
            asigne, volvé a entrar a esta página.
          </p>
          <Link href="/profile" className={styles.deniedLink}>Volver al perfil</Link>
        </div>
      </main>
    );
  }

  return <OverlayBuilder />;
}
