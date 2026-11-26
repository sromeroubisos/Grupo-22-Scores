-- Rol nuevo: `usuario_overlay` ("Usuario con overlays").
--
-- Le da acceso al generador de overlays de transmisión (/overlay) y a crear
-- marcadores y titulares manuales. Nada más: no ve paneles de administración.
-- Lo asigna el super admin desde Personas y roles.
--
-- `users.role` tiene un CHECK con la lista cerrada de roles: sin sumarlo acá,
-- asignar el rol falla con 23514. Se reescribe el CHECK con la misma lista de
-- antes más el nuevo.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
    role = ANY (ARRAY[
        'fan', 'user', 'super_admin', 'operator', 'club_admin', 'admin_general', 'admin',
        'admin_union', 'admin_torneo', 'admin_club', 'familia_club', 'operador',
        'gestor_deportes', 'gestor_torneos', 'gestor_partidos', 'gestor_clubes',
        'usuario_overlay'
    ]::text[])
);
