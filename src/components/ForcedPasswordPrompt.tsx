'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MUST_CHANGE_PASSWORD_FLAG } from '@/lib/auth/mustChangePassword';

// Regla mínima y propia: este cartel no depende de la política de registro
// para poder vivir en cualquier rama.
function checkNewPassword(password: string, email: string | null): { ok: boolean; problems: string[] } {
    const problems: string[] = [];
    if (password.length < 8) problems.push('Tiene que tener al menos 8 caracteres.');
    const local = email?.split('@')[0]?.toLowerCase();
    if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
        problems.push('No puede contener tu email.');
    }
    return { ok: problems.length === 0, problems };
}

/**
 * Cartel de primer ingreso para cuentas que dio de alta un super admin.
 *
 * Quien crea la cuenta elige (o conoce) la contraseña inicial, así que la
 * cuenta no es del todo de su dueño hasta que la cambia. La marca vive en
 * `user_metadata` y la apaga el mismo `updateUser` que guarda la contraseña
 * nueva: una sola llamada, sin endpoint propio.
 *
 * Es un empujón de UX, no un control de seguridad: el dueño de la cuenta puede
 * editar su propia metadata. Lo que protege es que la contraseña que conoce el
 * admin deje de servir.
 */
const SKIP_PREFIXES = ['/overlay', '/auth/update-password', '/login', '/register'];

type SessionUser = { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined;

export default function ForcedPasswordPrompt() {
    const pathname = usePathname() || '/';
    const supabase = useMemo(() => createClient(), []);
    const [email, setEmail] = useState<string | null>(null);
    const [mustChange, setMustChange] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const apply = (user: SessionUser) => {
            if (!alive) return;
            setEmail(user?.email ?? null);
            setMustChange(user?.user_metadata?.[MUST_CHANGE_PASSWORD_FLAG] === true);
        };
        supabase.auth
            .getSession()
            .then(({ data }: { data: { session: { user: SessionUser } | null } }) => apply(data.session?.user))
            .catch(() => undefined);
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event: string, session: { user: SessionUser } | null) => apply(session?.user),
        );
        return () => {
            alive = false;
            subscription.unsubscribe();
        };
    }, [supabase]);

    const check = useMemo(() => checkNewPassword(password, email), [password, email]);

    if (!mustChange || SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return null;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (!check.ok) {
            setError(check.problems[0]);
            return;
        }
        if (password !== confirm) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        setBusy(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password,
                data: { [MUST_CHANGE_PASSWORD_FLAG]: false },
            });
            if (updateError) throw updateError;
            setMustChange(false);
            setPassword('');
            setConfirm('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar la contraseña.');
        } finally {
            setBusy(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut().catch(() => undefined);
        window.location.href = '/login';
    };

    const pending = !check.ok && password ? check.problems[0] : null;
    const canSubmit = Boolean(password) && Boolean(confirm) && !busy;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forced-password-title"
        >
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1b2d] p-6 text-white shadow-2xl"
            >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                    <KeyRound size={20} aria-hidden="true" />
                </span>
                <h2 id="forced-password-title" className="mt-4 text-lg font-semibold">
                    Elegí tu contraseña
                </h2>
                <p className="mt-1 text-sm leading-snug text-white/75">
                    Tu cuenta la creó un administrador de G22 Scores. Antes de seguir, poné una contraseña
                    nueva que solo sepas vos.
                </p>

                <label htmlFor="forced-new-password" className="mt-5 block text-sm font-medium text-white/85">
                    Nueva contraseña
                </label>
                <div className="relative mt-1">
                    <input
                        id="forced-new-password"
                        type={show ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        autoFocus
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white outline-none focus:border-sky-400"
                    />
                    <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-white/60 hover:text-white"
                    >
                        {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                {pending ? <p className="mt-1 text-xs text-amber-300">{pending}</p> : null}

                <label htmlFor="forced-confirm-password" className="mt-4 block text-sm font-medium text-white/85">
                    Repetir contraseña
                </label>
                <input
                    id="forced-confirm-password"
                    type={show ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
                />

                {error ? (
                    <p role="alert" className="mt-3 text-sm text-red-300">
                        {error}
                    </p>
                ) : null}

                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                    {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                    Guardar contraseña
                </button>
                {!canSubmit && !busy ? (
                    <p className="mt-2 text-center text-xs text-white/55">
                        Escribí la contraseña nueva dos veces para guardarla.
                    </p>
                ) : null}
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-3 w-full text-center text-xs text-white/60 hover:text-white"
                >
                    Cerrar sesión
                </button>
            </form>
        </div>
    );
}
