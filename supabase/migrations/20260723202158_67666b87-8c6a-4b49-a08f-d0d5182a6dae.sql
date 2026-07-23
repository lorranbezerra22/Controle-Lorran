
CREATE OR REPLACE FUNCTION public.update_yield_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_name TEXT;
    v_person_name TEXT;
    v_month_start DATE;
    v_month_end DATE;
    v_total_amount DECIMAL(12,2);
    v_existing_id UUID;
    v_description TEXT;
    v_account_id UUID;
    v_date DATE;
    v_user_id UUID;
    v_category_id UUID;
BEGIN
    -- Capturar IDs de forma segura
    v_account_id := COALESCE(NEW.account_id, OLD.account_id);
    v_date := COALESCE(NEW.date, OLD.date);

    -- Obter informações da conta
    SELECT account_name, user_id INTO v_account_name, v_user_id FROM public.contas WHERE id = v_account_id;
    
    -- Tentar encontrar a categoria "Rendimento"
    SELECT id INTO v_category_id FROM public.categorias WHERE name = 'Rendimento' LIMIT 1;
    
    -- Determinar a pessoa com base no nome da conta
    IF v_account_name ILIKE '%Lorran%' THEN
        v_person_name := 'Lorran';
    ELSIF v_account_name ILIKE '%Tayane%' THEN
        v_person_name := 'Tayane';
    ELSE
        v_person_name := 'Familia';
    END IF;

    -- Descrição solicitada: "Rendimento [Nome do Banco]"
    -- Se v_account_name já contém "Lorran" ou "Tayane", vamos limpar para ficar só o banco se possível, 
    -- mas o usuário pediu "Rendimento e o nome do banco".
    -- Vou usar "Rendimento " || v_account_name para garantir.
    v_description := 'Rendimento ' || v_account_name;

    -- Definir o intervalo do mês
    v_month_start := date_trunc('month', v_date)::date;
    v_month_end := (date_trunc('month', v_date) + interval '1 month - 1 day')::date;

    -- Calcular o total de rendimentos para esta conta no mês
    SELECT COALESCE(SUM(amount), 0) INTO v_total_amount 
    FROM public.conta_rendimentos 
    WHERE account_id = v_account_id 
      AND date >= v_month_start 
      AND date <= v_month_end;

    -- Procurar lançamento automático existente
    -- Melhoramos a busca para incluir a nova descrição e a categoria
    SELECT id INTO v_existing_id 
    FROM public.transacoes 
    WHERE account_id = v_account_id
      AND person = v_person_name
      AND (description LIKE 'Rendimento%' OR description = v_description OR category_id = v_category_id)
      AND due_at >= v_month_start
      AND due_at <= v_month_end
      AND kind = 'income'
    LIMIT 1;

    IF v_total_amount > 0 THEN
        IF v_existing_id IS NOT NULL THEN
            UPDATE public.transacoes 
            SET amount = v_total_amount,
                description = v_description,
                posted_at = v_month_start,
                due_at = v_month_start,
                user_id = v_user_id,
                category_id = v_category_id
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO public.transacoes (
                user_id,
                account_id, 
                description, 
                amount, 
                kind, 
                person, 
                status, 
                posted_at,
                due_at,
                category_id
            ) VALUES (
                v_user_id,
                v_account_id,
                v_description,
                v_total_amount,
                'income',
                v_person_name,
                'paid',
                v_month_start,
                v_month_start,
                v_category_id
            );
        END IF;
    ELSIF v_existing_id IS NOT NULL THEN
        DELETE FROM public.transacoes WHERE id = v_existing_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
