BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF lower(NEW.email) = 'superadmin@g22scores.com' THEN
        user_role := 'super_admin';
    ELSIF lower(NEW.email) = 'sromeroubisos@gmail.com' THEN
        user_role := 'admin_general';
    ELSE
        user_role := 'user';
    END IF;

    INSERT INTO public.users (id, email, name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        user_role
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login_at = NOW(),
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        role = CASE
            WHEN lower(EXCLUDED.email) = 'superadmin@g22scores.com' THEN 'super_admin'
            WHEN lower(EXCLUDED.email) = 'sromeroubisos@gmail.com' THEN 'admin_general'
            ELSE public.users.role
        END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

UPDATE public.users
SET role = 'fan'
WHERE lower(email) = 'deportesgrupo@gmail.com'
  AND role = 'super_admin';

UPDATE public.users
SET role = 'admin_general'
WHERE lower(email) = 'sromeroubisos@gmail.com'
  AND role <> 'admin_general';

COMMIT;
