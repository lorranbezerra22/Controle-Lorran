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
    v_total_yield numeric;
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

    -- Define o período do mês para o rendimento
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_month_start := date_trunc('month', NEW.date)::date;
        v_month_end := (date_trunc('month', NEW.date) + interval '1 month - 1 day')::date;
    ELSE
        v_month_start := date_trunc('month', OLD.date)::date;
        v_month_end := (date_trunc('month', OLD.date) + interval '1 month - 1 day')::date;
    END IF;

    -- Calcula o total de rendimentos para esta conta/mês (usando o nome correto da tabela: conta_rendimentos)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_yield
    FROM public.conta_rendimentos
    WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
      AND date >= v_month_start
      AND date <= v_month_end;

    -- Gerencia o lançamento na tabela transacoes
    IF v_total_yield > 0 THEN
        -- Tenta atualizar um lançamento existente para o mesmo mês, conta e pessoa
        UPDATE public.transacoes
        SET amount = v_total_yield,
            due_at = v_month_start,
            posted_at = v_month_start
        WHERE account_id = COALESCE(NEW.account_id, OLD.account_id) 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND person = v_person
          AND due_at >= v_month_start 
          AND due_at <= v_month_end;

        -- Se não atualizou nada, insere um novo com o total acumulado
        IF NOT FOUND THEN
            INSERT INTO public.transacoes (
                user_id, description, amount, kind, category_id, status, due_at, posted_at, account_id, person
            ) VALUES (
                v_user_id, 'Rendimento Automático', v_total_yield, 'income', '4e981db5-dd01-4b65-aa53-160c47a0cf47', 
                'paid', v_month_start, v_month_start, COALESCE(NEW.account_id, OLD.account_id), v_person
            );
        END IF;
    ELSE
        -- Se o total for zero (ex: todos deletados), remove o lançamento automático
        DELETE FROM public.transacoes
        WHERE account_id = COALESCE(NEW.account_id, OLD.account_id) 
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