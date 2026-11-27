-- Plan de overlays de cada usuario: básico, colores o premium.
--
--   básico   estética de G22, algunos estilos, marca de G22 siempre visible
--   colores  todos los estilos, colores y tipografías propios
--   premium  además logo del torneo, overlay de sponsors y sin marca de G22
--
-- Sin fila = básico. El super admin es premium siempre (lo resuelve el código).
-- Solo la lee y la escribe el servidor (service_role): RLS prendido y sin políticas.

CREATE TABLE IF NOT EXISTS public.overlay_plans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'colores', 'premium')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.overlay_plans ENABLE ROW LEVEL SECURITY;

-- Premium para Santiago y Justina (los dos ya son super admin; queda escrito
-- por si cambia el rol).
INSERT INTO public.overlay_plans (user_id, plan)
SELECT id, 'premium' FROM auth.users
WHERE email IN ('sromeroubisos@gmail.com', 'justivazquez1702@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now();
