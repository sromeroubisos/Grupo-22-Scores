import { redirect } from 'next/navigation';

// El editor vive ahora en /admin/noticias (fuera de /admin/super, cuya guarda
// solo deja pasar a admins globales). Los links viejos siguen andando.
export default function NuevaNoticiaLegacyPage() {
    redirect('/admin/noticias/nueva');
}
