CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF lower(NEW.email) IN (
        'superadmin@g22scores.com',
        'deportesgrupo@gmail.com',
        'sromeroubisos@gmail.com'
    ) THEN
        user_role := 'super_admin';
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
            WHEN lower(EXCLUDED.email) IN (
                'superadmin@g22scores.com',
                'deportesgrupo@gmail.com',
                'sromeroubisos@gmail.com'
            ) THEN 'super_admin'
            ELSE public.users.role
        END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
