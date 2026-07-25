CREATE TABLE IF NOT EXISTS public.regras_recorrentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    category_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    person TEXT,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_recorrentes TO authenticated;
GRANT ALL ON public.regras_recorrentes TO service_role;

ALTER TABLE public.regras_recorrentes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy 
        WHERE polname = 'Users can manage their own recurring rules' 
        AND polrelid = 'public.regras_recorrentes'::regclass
    ) THEN
        CREATE POLICY "Users can manage their own recurring rules"
        ON public.regras_recorrentes
        FOR ALL
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;