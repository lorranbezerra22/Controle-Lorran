
CREATE OR REPLACE FUNCTION public.update_yield_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id uuid;
    v_account_name text;
    v_person text;
BEGIN
    -- Busca o user_id e o nome da conta para inferir a pessoa
    SELECT user_id, account_name INTO v_user_id, v_account_name 
    FROM public.contas 
    WHERE id = COALESCE(NEW.account_id, OLD.account_id);

    -- Lógica de inferência de pessoa baseada no nome da conta (mesma do frontend)
    IF v_account_name ILIKE '%tayane%' THEN
        v_person := 'Tayane';
    ELSIF v_account_name ILIKE '%lorran%' OR v_account_name ILIKE '%revolut%' THEN
        v_person := 'Lorran';
    ELSE
        v_person := 'Familia';
    END IF;

    IF (TG_OP = 'INSERT') THEN
        UPDATE public.contas SET balance = balance + NEW.amount WHERE id = NEW.account_id;
        
        INSERT INTO public.transacoes (
            user_id, description, amount, kind, category_id, status, due_at, posted_at, account_id, person
        ) VALUES (
            v_user_id, 'Rendimento Automático', NEW.amount, 'income', '4e981db5-dd01-4b65-aa53-160c47a0cf47', 
            'paid', NEW.date::date, NEW.date::date, NEW.account_id, v_person
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.contas SET balance = balance - OLD.amount + NEW.amount WHERE id = NEW.account_id;
        
        UPDATE public.transacoes
        SET amount = NEW.amount,
            due_at = NEW.date::date,
            posted_at = NEW.date::date,
            person = v_person
        WHERE account_id = NEW.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND (created_at >= (NEW.created_at - interval '30 seconds') AND created_at <= (NEW.created_at + interval '30 seconds'));
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.contas SET balance = balance - OLD.amount WHERE id = OLD.account_id;
        
        DELETE FROM public.transacoes
        WHERE account_id = OLD.account_id 
          AND description = 'Rendimento Automático' 
          AND kind = 'income'
          AND category_id = '4e981db5-dd01-4b65-aa53-160c47a0cf47'
          AND (created_at >= (OLD.created_at - interval '30 seconds') AND created_at <= (OLD.created_at + interval '30 seconds'));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
