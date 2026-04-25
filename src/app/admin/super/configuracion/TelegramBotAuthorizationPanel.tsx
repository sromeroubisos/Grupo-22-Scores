'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import styles from '../page.module.css';

type TelegramAdminUser = {
  id: string;
  telegram_user_id: string;
  telegram_phone_number: string | null;
  user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  permissions: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string | null;
};

type TelegramUsersResponse =
  | { ok: true; data: { users: TelegramAdminUser[] } }
  | { ok: false; error?: string; details?: unknown };

type TelegramUserMutationResponse =
  | { ok: true; data: TelegramAdminUser }
  | { ok: false; error?: string; details?: unknown };

type TelegramUserForm = {
  telegram_user_id: string;
  telegram_phone_number: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  permissions: string;
  is_active: boolean;
};

const emptyForm: TelegramUserForm = {
  telegram_user_id: '',
  telegram_phone_number: '',
  user_id: '',
  username: '',
  first_name: '',
  last_name: '',
  role: 'superadmin',
  permissions: '{}',
  is_active: true,
};

const inputStyle = {
  width: '100%',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  padding: '0.75rem 0.85rem',
  fontSize: '0.9rem',
  outline: 'none',
} as const;

const labelStyle = {
  display: 'grid',
  gap: 8,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: 'var(--color-text-tertiary)',
} as const;

function formatDateTime(value: string | null) {
  if (!value) return 'Sin registro';

  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getDisplayName(user: TelegramAdminUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return fullName || (user.username ? `@${user.username}` : 'Sin nombre');
}

function toForm(user: TelegramAdminUser): TelegramUserForm {
  return {
    telegram_user_id: user.telegram_user_id || '',
    telegram_phone_number: user.telegram_phone_number || '',
    user_id: user.user_id || '',
    username: user.username || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    role: user.role || 'superadmin',
    permissions: JSON.stringify(user.permissions || {}, null, 2),
    is_active: user.is_active,
  };
}

export function TelegramBotAuthorizationPanel() {
  const [users, setUsers] = useState<TelegramAdminUser[]>([]);
  const [form, setForm] = useState<TelegramUserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(() => users.filter((user) => user.is_active).length, [users]);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/super/telegram-users', {
        cache: 'no-store',
        credentials: 'include',
      });

      const payload = await response.json() as TelegramUsersResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'No se pudieron cargar los usuarios autorizados.' : (payload.error || 'No se pudieron cargar los usuarios autorizados.'));
      }

      setUsers(payload.data.users);
    } catch (loadError) {
      setUsers([]);
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los usuarios autorizados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const resetForm = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/admin/super/telegram-users', {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingId,
          telegram_user_id: form.telegram_user_id || null,
          telegram_phone_number: form.telegram_phone_number || null,
          user_id: form.user_id || null,
          username: form.username || null,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          role: form.role || null,
          permissions: form.permissions || '{}',
          is_active: form.is_active,
        }),
      });

      const payload = await response.json() as TelegramUserMutationResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'No se pudo guardar el usuario autorizado.' : (payload.error || 'No se pudo guardar el usuario autorizado.'));
      }

      resetForm();
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el usuario autorizado.');
    } finally {
      setSaving(false);
    }
  }, [editingId, form, loadUsers, resetForm]);

  const handleEdit = useCallback((user: TelegramAdminUser) => {
    setEditingId(user.id);
    setForm(toForm(user));
  }, []);

  const handleToggleActive = useCallback(async (user: TelegramAdminUser) => {
    try {
      setRowActionId(user.id);
      setError(null);

      const response = await fetch('/api/admin/super/telegram-users', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          is_active: !user.is_active,
        }),
      });

      const payload = await response.json() as TelegramUserMutationResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'No se pudo actualizar el estado.' : (payload.error || 'No se pudo actualizar el estado.'));
      }

      await loadUsers();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'No se pudo actualizar el estado.');
    } finally {
      setRowActionId(null);
    }
  }, [loadUsers]);

  const handleDelete = useCallback(async (user: TelegramAdminUser) => {
    const confirmed = window.confirm(`Quitar Telegram ID ${user.telegram_user_id} de la lista autorizada?`);
    if (!confirmed) return;

    try {
      setRowActionId(user.id);
      setError(null);

      const response = await fetch(`/api/admin/super/telegram-users?id=${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const payload = await response.json() as TelegramUserMutationResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'No se pudo quitar el usuario autorizado.' : (payload.error || 'No se pudo quitar el usuario autorizado.'));
      }

      if (editingId === user.id) {
        resetForm();
      }
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo quitar el usuario autorizado.');
    } finally {
      setRowActionId(null);
    }
  }, [editingId, loadUsers, resetForm]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <div>
          <h2 className={styles.sectionTitle}>Bot de Telegram</h2>
          <p style={{ marginTop: 6, color: 'var(--color-text-tertiary)', fontSize: '0.9rem' }}>
            Numeros autorizados para operar el bot desde Telegram.
          </p>
        </div>
        <button
          type="button"
          className={styles.btn}
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          <RefreshCw size={15} />
          {loading ? 'Cargando...' : 'Refrescar'}
        </button>
      </div>

      {error ? (
        <div className={styles.card} style={{ borderColor: 'var(--color-error)', padding: '1rem 1.25rem' }}>
          <div style={{ color: 'var(--color-error)', fontWeight: 700, marginBottom: 6 }}>Error de Telegram</div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{error}</div>
        </div>
      ) : null}

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={(event) => void handleSubmit(event)}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{editingId ? 'Editar autorizacion' : 'Agregar Telegram ID'}</h3>
            <span className={`${styles.pill} ${form.is_active ? styles.pillSuccess : styles.pillNeutral}`}>
              {form.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
            <label style={labelStyle}>
              Telegram user ID
              <input
                style={inputStyle}
                value={form.telegram_user_id}
                onChange={(event) => setForm((current) => ({ ...current, telegram_user_id: event.target.value }))}
                placeholder="6901996199"
                inputMode="numeric"
                required
              />
            </label>

            <label style={labelStyle}>
              Telefono de Telegram
              <input
                style={inputStyle}
                value={form.telegram_phone_number}
                onChange={(event) => setForm((current) => ({ ...current, telegram_phone_number: event.target.value }))}
                placeholder="+5491112345678 opcional"
                autoComplete="tel"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
              <label style={labelStyle}>
                Rol
                <input
                  style={inputStyle}
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  placeholder="superadmin"
                />
              </label>

              <label style={labelStyle}>
                User ID interno
                <input
                  style={inputStyle}
                  value={form.user_id}
                  onChange={(event) => setForm((current) => ({ ...current, user_id: event.target.value }))}
                  placeholder="UUID opcional"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
              <label style={labelStyle}>
                Nombre
                <input
                  style={inputStyle}
                  value={form.first_name}
                  onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                  placeholder="Nombre"
                />
              </label>

              <label style={labelStyle}>
                Apellido
                <input
                  style={inputStyle}
                  value={form.last_name}
                  onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                  placeholder="Apellido"
                />
              </label>
            </div>

            <label style={labelStyle}>
              Username
              <input
                style={inputStyle}
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="sin @"
              />
            </label>

            <label style={labelStyle}>
              Permissions JSON
              <textarea
                style={{ ...inputStyle, minHeight: 92, resize: 'vertical', fontFamily: 'var(--font-mono)' }}
                value={form.permissions}
                onChange={(event) => setForm((current) => ({ ...current, permissions: event.target.value }))}
                placeholder='{"can_update_results": true}'
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--color-text-secondary)',
                fontSize: '0.9rem',
              }}
            >
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Usuario activo
            </label>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="submit" className={styles.viewSiteBtn} disabled={saving}>
                {editingId ? <Save size={15} /> : <Plus size={15} />}
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar Telegram ID'}
              </button>
              {editingId ? (
                <button type="button" className={styles.btn} onClick={resetForm} disabled={saving}>
                  <X size={15} />
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        </form>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Usuarios autorizados</h3>
            <span className={`${styles.pill} ${activeCount > 0 ? styles.pillSuccess : styles.pillWarning}`}>
              {loading ? 'Cargando' : `${activeCount}/${users.length} activos`}
            </span>
          </div>

          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              <ShieldCheck size={18} style={{ color: 'var(--color-success)', flex: '0 0 auto', marginTop: 2 }} />
              <span>
                El workflow actual autoriza comparando <span className={styles.mono}>message.from.id</span> contra <span className={styles.mono}>admin_telegram_users.telegram_user_id</span>.
              </span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Telegram ID</th>
                  <th>Telefono</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Alta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: 'var(--color-text-tertiary)', padding: '1.25rem' }}>
                      {loading ? 'Cargando usuarios autorizados...' : 'Todavia no hay usuarios autorizados.'}
                    </td>
                  </tr>
                ) : users.map((user) => (
                  <tr key={user.id} className={styles.tableRow}>
                    <td className={styles.mono}>{user.telegram_user_id}</td>
                    <td className={styles.mono}>{user.telegram_phone_number || 'Opcional'}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{getDisplayName(user)}</div>
                      {user.username ? (
                        <div className={styles.mono} style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8rem' }}>
                          @{user.username}
                        </div>
                      ) : null}
                    </td>
                    <td>{user.role || 'Sin rol'}</td>
                    <td>
                      <span className={`${styles.pill} ${user.is_active ? styles.pillSuccess : styles.pillNeutral}`}>
                        {user.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{formatDateTime(user.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => handleEdit(user)}
                          disabled={rowActionId === user.id}
                          aria-label={`Editar ${user.telegram_user_id}`}
                        >
                          <Pencil size={14} />
                          Editar
                        </button>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => void handleToggleActive(user)}
                          disabled={rowActionId === user.id}
                        >
                          {user.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => void handleDelete(user)}
                          disabled={rowActionId === user.id}
                          aria-label={`Quitar ${user.telegram_user_id}`}
                        >
                          <Trash2 size={14} />
                          Quitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
