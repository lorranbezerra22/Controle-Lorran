-- Function to update account balance based on transactions
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  delta_primary NUMERIC := 0;
BEGIN
  -- Handle Delete or Update (Reverse OLD)
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    IF (OLD.status = 'paid') THEN
      IF (OLD.person = 'Familia' AND OLD.kind = 'expense' AND OLD.account_tayane_id IS NOT NULL AND OLD.account_id IS NOT NULL) THEN
        -- Reverse split
        UPDATE public.contas SET balance = balance + (OLD.amount / 2), updated_at = now() WHERE id = OLD.account_id;
        UPDATE public.contas SET balance = balance + (OLD.amount / 2), updated_at = now() WHERE id = OLD.account_tayane_id;
      ELSIF (OLD.account_id IS NOT NULL) THEN
        -- Reverse full
        delta_primary := CASE WHEN OLD.kind = 'income' THEN -OLD.amount ELSE OLD.amount END;
        UPDATE public.contas SET balance = balance + delta_primary, updated_at = now() WHERE id = OLD.account_id;
      END IF;
    END IF;
  END IF;

  -- Handle Insert or Update (Apply NEW)
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF (NEW.status = 'paid') THEN
      IF (NEW.person = 'Familia' AND NEW.kind = 'expense' AND NEW.account_tayane_id IS NOT NULL AND NEW.account_id IS NOT NULL) THEN
        -- Apply split
        UPDATE public.contas SET balance = balance - (NEW.amount / 2), updated_at = now() WHERE id = NEW.account_id;
        UPDATE public.contas SET balance = balance - (NEW.amount / 2), updated_at = now() WHERE id = NEW.account_tayane_id;
      ELSIF (NEW.account_id IS NOT NULL) THEN
        -- Apply full
        delta_primary := CASE WHEN NEW.kind = 'income' THEN NEW.amount ELSE -NEW.amount END;
        UPDATE public.contas SET balance = balance + delta_primary, updated_at = now() WHERE id = NEW.account_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for transacoes
DROP TRIGGER IF EXISTS trg_update_balance_transacoes ON public.transacoes;
CREATE TRIGGER trg_update_balance_transacoes
AFTER INSERT OR UPDATE OR DELETE ON public.transacoes
FOR EACH ROW EXECUTE FUNCTION public.update_account_balance();

-- Function for account yields
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

-- Create trigger for conta_rendimentos
DROP TRIGGER IF EXISTS trg_update_balance_yields ON public.conta_rendimentos;
CREATE TRIGGER trg_update_balance_yields
AFTER INSERT OR UPDATE OR DELETE ON public.conta_rendimentos
FOR EACH ROW EXECUTE FUNCTION public.update_yield_balance();
