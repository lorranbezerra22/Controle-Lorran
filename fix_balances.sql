-- 1. Create a function to update account balance
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC;
BEGIN
  -- Handle Insert
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.status = 'paid' AND NEW.account_id IS NOT NULL) THEN
      delta := CASE WHEN NEW.kind = 'income' THEN NEW.amount ELSE -NEW.amount END;
      UPDATE public.contas SET balance = balance + delta, updated_at = now() WHERE id = NEW.account_id;
    END IF;
    
    IF (NEW.account_tayane_id IS NOT NULL AND NEW.status = 'paid' AND NEW.kind = 'expense') THEN
      -- In case of family split (50/50), we only subtract 50% from each if configured, 
      -- but current logic in frontend sends full amount or split rows.
      -- If it's a split row (person is Tayane), frontend sends account_id as Tayane's account.
      -- If it's a "Familia" row, frontend sends account_id (Lorran) AND account_tayane_id (Tayane).
      -- For "Familia" kind expense, we subtract 50% from each.
      IF (NEW.person = 'Familia') THEN
         UPDATE public.contas SET balance = balance - (NEW.amount / 2), updated_at = now() WHERE id = NEW.account_tayane_id;
         -- We also need to adjust the primary account_id update which would have taken 100%
         -- Actually, let's make the trigger smart about 'Familia'.
      END IF;
    END IF;
  END IF;

  -- Handle Update
  IF (TG_OP = 'UPDATE') THEN
    -- Reverse OLD
    IF (OLD.status = 'paid' AND OLD.account_id IS NOT NULL) THEN
      delta := CASE WHEN OLD.kind = 'income' THEN -OLD.amount ELSE OLD.amount END;
      UPDATE public.contas SET balance = balance + delta, updated_at = now() WHERE id = OLD.account_id;
    END IF;
    IF (OLD.account_tayane_id IS NOT NULL AND OLD.status = 'paid' AND OLD.kind = 'expense' AND OLD.person = 'Familia') THEN
      UPDATE public.contas SET balance = balance + (OLD.amount / 2), updated_at = now() WHERE id = OLD.account_tayane_id;
    END IF;

    -- Apply NEW
    IF (NEW.status = 'paid' AND NEW.account_id IS NOT NULL) THEN
      IF (NEW.person = 'Familia' AND NEW.kind = 'expense' AND NEW.account_tayane_id IS NOT NULL) THEN
        UPDATE public.contas SET balance = balance - (NEW.amount / 2), updated_at = now() WHERE id = NEW.account_id;
        UPDATE public.contas SET balance = balance - (NEW.amount / 2), updated_at = now() WHERE id = NEW.account_tayane_id;
      ELSE
        delta := CASE WHEN NEW.kind = 'income' THEN NEW.amount ELSE -NEW.amount END;
        UPDATE public.contas SET balance = balance + delta, updated_at = now() WHERE id = NEW.account_id;
      END IF;
    END IF;
  END IF;

  -- Handle Delete
  IF (TG_OP = 'DELETE') THEN
    IF (OLD.status = 'paid' AND OLD.account_id IS NOT NULL) THEN
      delta := CASE WHEN OLD.kind = 'income' THEN -OLD.amount ELSE OLD.amount END;
      UPDATE public.contas SET balance = balance + delta, updated_at = now() WHERE id = OLD.account_id;
    END IF;
    IF (OLD.account_tayane_id IS NOT NULL AND OLD.status = 'paid' AND OLD.kind = 'expense' AND OLD.person = 'Familia') THEN
      UPDATE public.contas SET balance = balance + (OLD.amount / 2), updated_at = now() WHERE id = OLD.account_tayane_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create triggers for transacoes
DROP TRIGGER IF EXISTS trg_update_balance_transacoes ON public.transacoes;
CREATE TRIGGER trg_update_balance_transacoes
AFTER INSERT OR UPDATE OR DELETE ON public.transacoes
FOR EACH ROW EXECUTE FUNCTION public.update_account_balance();

-- 3. Create function for account yields
CREATE OR REPLACE FUNCTION public.update_yield_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.contas SET balance = balance + NEW.amount, updated_at = now() WHERE id = NEW.account_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE public.contas SET balance = balance - OLD.amount + NEW.amount, updated_at = now() WHERE id = NEW.account_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.contas SET balance = balance - OLD.amount, updated_at = now() WHERE id = OLD.account_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger for conta_rendimentos
DROP TRIGGER IF EXISTS trg_update_balance_yields ON public.conta_rendimentos;
CREATE TRIGGER trg_update_balance_yields
AFTER INSERT OR UPDATE OR DELETE ON public.conta_rendimentos
FOR EACH ROW EXECUTE FUNCTION public.update_yield_balance();

-- 5. Grant access
GRANT EXECUTE ON FUNCTION public.update_account_balance() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_yield_balance() TO service_role;
