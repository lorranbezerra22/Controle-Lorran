CREATE OR REPLACE FUNCTION public.update_yield_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.contas 
        SET balance = balance + NEW.amount 
        WHERE id = NEW.account_id;
        
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
            (SELECT user_id FROM public.contas WHERE id = NEW.account_id),
            'Rendimento Automático',
            NEW.amount,
            'income',
            '4e981db5-dd01-4b65-aa53-160c47a0cf47', -- Rendimentos
            'paid',
            NEW.date::text,
            NEW.account_id,
            'Familia'
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.contas 
        SET balance = balance - OLD.amount + NEW.amount 
        WHERE id = NEW.account_id;
        
        UPDATE public.transacoes
        SET amount = NEW.amount,
            due_at = NEW.date::text
        WHERE account_id = NEW.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND (created_at >= NEW.created_at - interval '5 seconds' AND created_at <= NEW.created_at + interval '5 seconds');
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.contas 
        SET balance = balance - OLD.amount 
        WHERE id = OLD.account_id;
        
        DELETE FROM public.transacoes
        WHERE account_id = OLD.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND (created_at >= OLD.created_at - interval '5 seconds' AND created_at <= OLD.created_at + interval '5 seconds');
    END IF;
    RETURN NULL;
END;
$$;