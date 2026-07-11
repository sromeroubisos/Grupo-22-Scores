-- B2 audit fix: enforce one round name per phase.
-- tournament_rounds only had UNIQUE(phase_id, order_index); concurrent round
-- creation could produce duplicated "Fecha N" rows within the same phase.
-- Defensive: if pre-existing duplicates would break the index, skip creation
-- with a NOTICE instead of failing the deploy.

DO $$
BEGIN
    IF to_regclass('public.tournament_rounds') IS NULL THEN
        RAISE NOTICE 'tournament_rounds no existe; se omite tournament_rounds_phase_name_unique.';
    ELSIF EXISTS (
        SELECT 1
        FROM public.tournament_rounds
        GROUP BY phase_id, name
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'tournament_rounds tiene rondas duplicadas por (phase_id, name); no se crea tournament_rounds_phase_name_unique. Depurar duplicados y re-ejecutar.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS tournament_rounds_phase_name_unique
            ON public.tournament_rounds (phase_id, name);
    END IF;
END $$;
