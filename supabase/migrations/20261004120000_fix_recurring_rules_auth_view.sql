DO $$
DECLARE
  relation_kind "char";
BEGIN
  IF to_regclass('public.regras_recorrentes') IS NULL THEN
    RAISE EXCEPTION 'A tabela public.regras_recorrentes não existe; não foi possível corrigir a compatibilidade do cadastro.';
  END IF;

  IF to_regclass('public.recurring_rules') IS NULL THEN
    EXECUTE '
      CREATE VIEW public.recurring_rules
      WITH (security_invoker = false)
      AS SELECT * FROM public.regras_recorrentes
    ';
  ELSE
    SELECT relkind
      INTO relation_kind
      FROM pg_class
     WHERE oid = to_regclass('public.recurring_rules');

    IF relation_kind = 'v' THEN
      ALTER VIEW public.recurring_rules SET (security_invoker = false);
    END IF;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.recurring_rules
  TO authenticated, service_role, supabase_auth_admin;