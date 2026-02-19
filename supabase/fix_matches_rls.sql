-- 1. Asegurar función de autorización segura (ya deberia estar, pero por si acaso)
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

-- 2. Configurar RLS para Clubs (necesario para ver nombres de equipos)
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read clubs" ON public.clubs;
DROP POLICY IF EXISTS "Admins write clubs" ON public.clubs;

CREATE POLICY "Public read clubs"
ON public.clubs FOR SELECT
USING (true); -- Todo el mundo puede ver clubes

CREATE POLICY "Admins write clubs"
ON public.clubs FOR ALL
USING ( public.authorize_admin() ); -- Solo admins editan


-- 3. Configurar RLS para Matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read matches" ON public.matches;
DROP POLICY IF EXISTS "Admins write matches" ON public.matches;

CREATE POLICY "Public read matches"
ON public.matches FOR SELECT
USING (true); -- Todo el mundo puede ver partidos

CREATE POLICY "Admins write matches"
ON public.matches FOR ALL
USING ( public.authorize_admin() ); -- Solo admins editan

-- 4. Verificar tablas relacionadas (rounds, seasons - si existen como tablas separadas)
-- Asumimos que season y round son columnas en matches o tournaments por ahora.
