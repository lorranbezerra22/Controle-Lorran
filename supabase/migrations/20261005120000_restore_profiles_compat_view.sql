DO $$
BEGIN
  IF to_regclass('public.perfis') IS NULL THEN
    RAISE EXCEPTION 'A tabela public.perfis não existe; não foi possível restaurar a compatibilidade com public.profiles.';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    EXECUTE '
      CREATE VIEW public.profiles
      WITH (security_invoker = false)
      AS SELECT * FROM public.perfis
    ';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.profiles
  TO authenticated, service_role, supabase_auth_admin;