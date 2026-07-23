CREATE OR REPLACE FUNCTION public.update_yield_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Busca o user_id da conta
    SELECT user_id INTO v_user_id FROM public.contas WHERE id = COALESCE(NEW.account_id, OLD.account_id);

    IF (TG_OP = 'INSERT') THEN
        -- Atualiza saldo da conta
        UPDATE public.contas 
        SET balance = balance + NEW.amount 
        WHERE id = NEW.account_id;
        
        -- Cria lançamento de receita correspondente
        INSERT INTO public.transacoes (
            user_id,
            description,
            amount,
            kind,
            category_id,
            status,
            due_at,
            account_id,
            person
        ) VALUES (
            v_user_id,
            'Rendimento Automático',
            NEW.amount,
            'income',
            '4e981db5-dd01-4b65-aa53-160c47a0cf47', -- Rendimentos
            'paid',
            NEW.date::date,
            NEW.account_id,
            'Familia'
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Ajusta saldo da conta pela diferença
        UPDATE public.contas 
        SET balance = balance - OLD.amount + NEW.amount 
        WHERE id = NEW.account_id;
        
        -- Tenta atualizar o lançamento de receita vinculado
        UPDATE public.transacoes
        SET amount = NEW.amount,
            due_at = NEW.date::date
        WHERE account_id = NEW.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND created_at >= (NEW.created_at - interval '10 seconds')
          AND created_at <= (NEW.created_at + interval '10 seconds');
    ELSIF (TG_OP = 'DELETE') THEN
        -- Estorna saldo da conta
        UPDATE public.contas 
        SET balance = balance - OLD.amount 
        WHERE id = OLD.account_id;
        
        -- Remove o lançamento de receita vinculado
        DELETE FROM public.transacoes
        WHERE account_id = OLD.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND created_at >= (OLD.created_at - interval '10 seconds')
          AND created_at <= (OLD.created_at + interval '10 seconds');
    END IF;
    RETURN NULL;
END;
$$;