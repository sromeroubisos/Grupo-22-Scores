-- 1. Asegurar función de autorización segura (bypass RLS)
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin_general')
  );
$$;

-- 2. Configurar RLS para Unions (siempre necesarias para torneos)
ALTER TABLE public.unions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read unions" ON public.unions;
DROP POLICY IF EXISTS "Admins write unions" ON public.unions;

CREATE POLICY "Public read unions"
ON public.unions FOR SELECT
USING (true); -- Todo el mundo puede ver uniones

CREATE POLICY "Admins write unions"
ON public.unions FOR ALL
USING ( public.authorize_admin() ); -- Solo admins editan


-- 3. Configurar RLS para Tournaments
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins write tournaments" ON public.tournaments;

CREATE POLICY "Public read tournaments"
ON public.tournaments FOR SELECT
USING (true); -- Todo el mundo puede ver torneos

CREATE POLICY "Admins write tournaments"
ON public.tournaments FOR ALL
USING ( public.authorize_admin() ); -- Solo admins editan

-- 4. Verificar si hay datos (opcional, para depurar)
-- SELECT count(*) FROM tournaments;
