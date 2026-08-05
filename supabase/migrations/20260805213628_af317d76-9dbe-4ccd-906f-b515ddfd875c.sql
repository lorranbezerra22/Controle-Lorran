ALTER TABLE public.cartao_parcelas ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cartao_parcelas TO authenticated;
GRANT ALL ON public.cartao_parcelas TO service_role;