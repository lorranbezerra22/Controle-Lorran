
CREATE TABLE public.participacoes_parcelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    installment_id UUID NOT NULL REFERENCES public.cartao_parcelas(id) ON DELETE CASCADE,
    person TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
    paid_at TIMESTAMPTZ,
    account_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(installment_id, person)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participacoes_parcelas TO authenticated;
GRANT ALL ON public.participacoes_parcelas TO service_role;
ALTER TABLE public.participacoes_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participacoes_view" ON public.participacoes_parcelas FOR SELECT TO authenticated USING (public.can_view(user_id));
CREATE POLICY "participacoes_write" ON public.participacoes_parcelas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER participacoes_upd BEFORE UPDATE ON public.participacoes_parcelas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
DECLARE
    r RECORD;
    p RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cartao_parcelas' AND column_name = 'metadata') THEN
        FOR r IN SELECT id, user_id, amount, metadata FROM public.cartao_parcelas WHERE metadata->>'partial_payments' IS NOT NULL LOOP
            FOR p IN SELECT * FROM jsonb_to_recordset(r.metadata->'partial_payments') AS x(person text, amount numeric, date text) LOOP
                INSERT INTO public.participacoes_parcelas (user_id, installment_id, person, amount, status, paid_at)
                VALUES (r.user_id, r.id, p.person, p.amount, 'paid', 
                    CASE WHEN p.date ~ '^\d{4}-\d{2}-\d{2}' THEN p.date::timestamptz ELSE now() END)
                ON CONFLICT (installment_id, person) DO NOTHING;
            END LOOP;
        END LOOP;
    END IF;
END $$;
