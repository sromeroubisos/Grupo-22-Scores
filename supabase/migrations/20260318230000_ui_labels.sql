-- ============================================
-- UI LABELS & TEAM LABEL ASSIGNMENTS
-- Configurable labels for standings rows
-- ============================================

-- ui_labels: definición de etiquetas (nombre + color)
CREATE TABLE IF NOT EXISTS public.ui_labels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,              -- hex color, e.g. "#16a34a"
  scope       TEXT NOT NULL DEFAULT 'standings', -- 'standings' | 'fixture' | 'global'
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- team_labels: asignación de etiquetas a equipos dentro de un contexto de torneo
CREATE TABLE IF NOT EXISTS public.team_labels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id      UUID NOT NULL REFERENCES public.ui_labels(id) ON DELETE CASCADE,
  club_id       TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  phase_id      UUID REFERENCES public.tournament_phases(id) ON DELETE CASCADE,
  group_id      UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (label_id, club_id, tournament_id, phase_id, group_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_team_labels_club
  ON public.team_labels (club_id);

CREATE INDEX IF NOT EXISTS idx_team_labels_tournament
  ON public.team_labels (tournament_id, phase_id, group_id);

CREATE INDEX IF NOT EXISTS idx_team_labels_label
  ON public.team_labels (label_id);

-- RLS
ALTER TABLE public.ui_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_labels ENABLE ROW LEVEL SECURITY;

-- Read: público (para mostrar etiquetas en vistas públicas)
DROP POLICY IF EXISTS "ui_labels_read" ON public.ui_labels;
CREATE POLICY "ui_labels_read" ON public.ui_labels
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "team_labels_read" ON public.team_labels;
CREATE POLICY "team_labels_read" ON public.team_labels
  FOR SELECT USING (true);

-- Write: solo usuarios autenticados (admins)
DROP POLICY IF EXISTS "ui_labels_write" ON public.ui_labels;
CREATE POLICY "ui_labels_write" ON public.ui_labels
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "team_labels_write" ON public.team_labels;
CREATE POLICY "team_labels_write" ON public.team_labels
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
