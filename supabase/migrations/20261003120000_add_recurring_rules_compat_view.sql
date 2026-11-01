DO $$
BEGIN
  IF to_regclass('public.regras_recorrentes') IS NULL THEN
    RAISE EXCEPTION 'A tabela public.regras_recorrentes não existe; não foi possível criar a compatibilidade para recurring_rules.';
  END IF;

  IF to_regclass('public.recurring_rules') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW public.recurring_rules
      WITH (security_invoker = true)
      AS
      SELECT
        id,
        user_id,
        description,
        kind,
        amount,
        category_id,
        day_of_month,
        active,
        person,
        notes,
        start_month,
        import_batch_id,
        created_at
      FROM public.regras_recorrentes
    $view$;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.recurring_rules
  TO authenticated, service_role, supabase_auth_admin;