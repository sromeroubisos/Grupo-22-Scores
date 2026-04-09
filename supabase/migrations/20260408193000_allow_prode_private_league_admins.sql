ALTER TABLE public.prode_private_league_members
    DROP CONSTRAINT IF EXISTS prode_private_league_members_role_check;

ALTER TABLE public.prode_private_league_members
    ADD CONSTRAINT prode_private_league_members_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'moderator'));
