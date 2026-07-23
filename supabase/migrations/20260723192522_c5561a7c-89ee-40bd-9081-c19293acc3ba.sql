CREATE OR REPLACE FUNCTION public.update_yield_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_account_name text;
    v_person text;
    v_month_start date;
    v_month_end date;
BEGIN
    -- Busca o user_id e o nome da conta para inferir a pessoa
    SELECT user_id, account_name INTO v_user_id, v_account_name 
    FROM public.contas 
    WHERE id = COALESCE(NEW.account_id, OLD.account_id);

    -- Lógica de inferência de pessoa baseada no nome da conta
    IF v_account_name ILIKE '%tayane%' THEN
        v_person := 'Tayane';
    ELSIF v_account_name ILIKE '%lorran%' OR v_account_name ILIKE '%revolut%' THEN
        v_person := 'Lorran';
    ELSE
        v_person := 'Familia';
    END IF;

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_month_start := date_trunc('month', NEW.date)::date;
        v_month_end := (date_trunc('month', NEW.date) + interval '1 month - 1 day')::date;

        -- Tenta atualizar um lançamento existente para o mesmo mês, conta e pessoa
        UPDATE public.transacoes
        SET amount = NEW.amount,
            due_at = NEW.date::date,
            posted_at = NEW.date::date
        WHERE account_id = NEW.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND person = v_person
          AND due_at >= v_month_start 
          AND due_at <= v_month_end;

        -- Se não atualizou nada, insere um novo
        IF NOT FOUND THEN
            INSERT INTO public.transacoes (
                user_id, description, amount, kind, category_id, status, due_at, posted_at, account_id, person
            ) VALUES (
                v_user_id, 'Rendimento Automático', NEW.amount, 'income', '4e981db5-dd01-4b65-aa53-160c47a0cf47', 
                'paid', NEW.date::date, NEW.date::date, NEW.account_id, v_person
            );
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        v_month_start := date_trunc('month', OLD.date)::date;
        v_month_end := (date_trunc('month', OLD.date) + interval '1 month - 1 day')::date;

        DELETE FROM public.transacoes
        WHERE account_id = OLD.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND person = v_person
          AND due_at >= v_month_start 
          AND due_at <= v_month_end;
    END IF;
    RETURN NULL;
END;
$$;