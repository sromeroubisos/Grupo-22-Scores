-- 1. Instalar extensión para generar UUIDs (si no existe)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Asegurar que las tablas generen sus propios IDs automáticamente
ALTER TABLE public.clubs 
ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE public.tournaments 
ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE public.matches 
ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE public.unions 
ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 3. Habilitar seguridad (RLS)
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unions ENABLE ROW LEVEL SECURITY;

-- 4. Definir función de autorización segura (si no existe)
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin_general'));
$$;

-- 5. Políticas de lectura pública (VITALES)
DROP POLICY IF EXISTS "Public read clubs" ON public.clubs;
CREATE POLICY "Public read clubs" ON public.clubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read matches" ON public.matches;
CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read tournaments" ON public.tournaments;
CREATE POLICY "Public read tournaments" ON public.tournaments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read unions" ON public.unions;
CREATE POLICY "Public read unions" ON public.unions FOR SELECT USING (true);

-- 6. Políticas de escritura para admins
DROP POLICY IF EXISTS "Admins write clubs" ON public.clubs;
CREATE POLICY "Admins write clubs" ON public.clubs FOR ALL USING (public.authorize_admin());

DROP POLICY IF EXISTS "Admins write matches" ON public.matches;
CREATE POLICY "Admins write matches" ON public.matches FOR ALL USING (public.authorize_admin());

DROP POLICY IF EXISTS "Admins write tournaments" ON public.tournaments;
CREATE POLICY "Admins write tournaments" ON public.tournaments FOR ALL USING (public.authorize_admin());

DROP POLICY IF EXISTS "Admins write unions" ON public.unions;
CREATE POLICY "Admins write unions" ON public.unions FOR ALL USING (public.authorize_admin());

-- 7. INSERTAR DATOS DE PRUEBA (¡Con nombres de columna CORRECTOS!)
-- Insertar equipos (si no existen)
INSERT INTO public.clubs (name, logo_url)
VALUES 
  ('San Isidro Club', 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/San_Isidro_Club_logo.svg/1200px-San_Isidro_Club_logo.svg.png'),
  ('CASI', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/CASI_Logo.png/1200px-CASI_Logo.png')
ON CONFLICT DO NOTHING;

-- Insertar un partido de prueba
DO $$
DECLARE
  v_tournament_id UUID;
  v_home_id UUID;
  v_away_id UUID;
BEGIN
  -- Obtener IDs reales
  SELECT id INTO v_tournament_id FROM public.tournaments LIMIT 1;
  SELECT id INTO v_home_id FROM public.clubs WHERE name = 'San Isidro Club' LIMIT 1;
  SELECT id INTO v_away_id FROM public.clubs WHERE name = 'CASI' LIMIT 1;

  -- Insertar partido solo si todo existe (usando home_club_id y away_club_id)
  IF v_tournament_id IS NOT NULL AND v_home_id IS NOT NULL AND v_away_id IS NOT NULL THEN
    INSERT INTO public.matches (
        tournament_id, 
        home_club_id, 
        away_club_id, 
        date_time, 
        status, 
        round_id
    )
    VALUES (
        v_tournament_id, 
        v_home_id, 
        v_away_id, 
        NOW() + INTERVAL '1 day', 
        'scheduled', 
        '1'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
