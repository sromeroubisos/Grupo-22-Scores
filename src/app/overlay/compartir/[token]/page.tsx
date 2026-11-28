import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';
import { acceptShare, type AcceptResult } from '@/lib/server/overlayLinksStore';
import styles from '../../builder.module.css';

export const metadata: Metadata = {
  title: 'Overlay compartido · G22 Scores',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * El link para compartir un overlay. Quien lo abre tiene que iniciar sesión en
 * G22 (sin sesión va al login y vuelve acá); con sesión queda como co-gestor y
 * entra directo a editarlo, en Mis overlays. No hace falta el rol de overlays:
 * el permiso es sobre ESTE overlay.
 */
export default async function SharedOverlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await getOverlayAccess();
  if (access.status === 'signed-out') redirect(`/login?returnTo=${encodeURIComponent(`/overlay/compartir/${token}`)}`);

  let result: AcceptResult | { status: 'error' };
  try {
    result = await acceptShare(access.userId, token);
  } catch {
    result = { status: 'error' };
  }

  if (result.status === 'ok' || result.status === 'own') redirect(`/overlay?editar=${result.linkId}`);

  const copy = {
    invalid: {
      title: 'Este link ya no vale',
      text: 'Quien te lo mandó cortó el link o borró el overlay. Pedile uno nuevo.',
    },
    full: {
      title: 'Ya no entra nadie más',
      text: 'Este overlay llegó al tope de personas que lo pueden gestionar. Pedile a quien lo creó que saque a alguien.',
    },
    error: {
      title: 'No pudimos abrir el overlay',
      text: 'Hubo un problema con la base. Probá de nuevo en un rato.',
    },
  }[result.status];

  return (
    <main className={styles.page}>
      <div className={styles.denied}>
        <p className={styles.deniedEyebrow}>Overlay compartido · G22</p>
        <h1 className={styles.h1}>{copy.title}</h1>
        <p className={styles.lead}>{copy.text}</p>
        <Link href="/overlay" className={styles.deniedLink}>Ir a overlays</Link>
      </div>
    </main>
  );
}
