CREATE OR REPLACE FUNCTION public.update_yield_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
BEGIN
    -- Capturar IDs de forma segura dependendo da operação
    v_account_id := COALESCE(NEW.account_id, OLD.account_id);
    v_date := COALESCE(NEW.date, OLD.date);

    -- Obter informações da conta
    SELECT account_name INTO v_account_name FROM public.contas WHERE id = v_account_id;
    
    -- Determinar a pessoa com base no nome da conta
    IF v_account_name ILIKE '%Lorran%' THEN
        v_person_name := 'Lorran';
    ELSIF v_account_name ILIKE '%Tayane%' THEN
        v_person_name := 'Tayane';
    ELSE
        v_person_name := 'Familia';
    END IF;

    -- Nova descrição: Nome da Conta (conforme solicitado pelo usuário)
    -- Ex: se a conta é "Mercado Pago", a descrição será "Mercado Pago"
    v_description := v_account_name;

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
    -- Buscamos por Rendimento% (legado) ou pela descrição exata da conta
    SELECT id INTO v_existing_id 
    FROM public.transacoes 
    WHERE account_id = v_account_id
      AND person = v_person_name
      AND (description LIKE 'Rendimento%' OR description = v_description)
      AND posted_at >= v_month_start
      AND posted_at <= v_month_end
      AND type = 'income'
    LIMIT 1;

    IF v_total_amount > 0 THEN
        IF v_existing_id IS NOT NULL THEN
            UPDATE public.transacoes 
            SET amount = v_total_amount,
                description = v_description,
                posted_at = v_month_start
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO public.transacoes (
                account_id, 
                description, 
                amount, 
                type, 
                person, 
                status, 
                posted_at
            ) VALUES (
                v_account_id,
                v_description,
                v_total_amount,
                'income',
                v_person_name,
                'paid',
                v_month_start
            );
        END IF;
    ELSIF v_existing_id IS NOT NULL THEN
        -- Se o total for zero, remove o lançamento automático
        DELETE FROM public.transacoes WHERE id = v_existing_id;
    END IF;

    -- Retornar NEW para INSERT/UPDATE, ou OLD para DELETE
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;