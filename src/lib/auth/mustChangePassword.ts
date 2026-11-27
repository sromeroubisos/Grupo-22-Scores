/**
 * Marca en `user_metadata` de una cuenta que dio de alta un super admin con
 * una contraseña que el dueño no eligió. Mientras esté en `true`, el sitio le
 * muestra el cartel para elegir una propia (`ForcedPasswordPrompt`).
 */
export const MUST_CHANGE_PASSWORD_FLAG = 'must_change_password';
