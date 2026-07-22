ALTER TABLE public.cartoes ADD COLUMN IF NOT EXISTS pai_id UUID REFERENCES public.cartoes(id) ON DELETE CASCADE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cartoes TO authenticated;
GRANT ALL ON public.cartoes TO service_role;
COMMENT ON COLUMN public.cartoes.pai_id IS 'ID do cartão principal para centralização de faturas (sub-cartões).';
