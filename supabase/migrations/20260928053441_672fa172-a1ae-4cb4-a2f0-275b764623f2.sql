CREATE OR REPLACE FUNCTION public.update_account_balance()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d NUMERIC;
BEGIN
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.status = 'paid' THEN
    d := CASE WHEN OLD.kind = 'income' THEN -OLD.amount ELSE OLD.amount END;
    IF OLD.person = 'Familia' AND OLD.account_tayane_id IS NOT NULL AND OLD.account_id IS NOT NULL THEN
      UPDATE public.contas SET balance = balance + d/2, updated_at = now() WHERE id = OLD.account_id;
      UPDATE public.contas SET balance = balance + d/2, updated_at = now() WHERE id = OLD.account_tayane_id;
    ELSIF OLD.account_id IS NOT NULL THEN
      UPDATE public.contas SET balance = balance + d, updated_at = now() WHERE id = OLD.account_id;
    END IF;
  END IF;
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status = 'paid' THEN
    d := CASE WHEN NEW.kind = 'income' THEN NEW.amount ELSE -NEW.amount END;
    IF NEW.person = 'Familia' AND NEW.account_tayane_id IS NOT NULL AND NEW.account_id IS NOT NULL THEN
      UPDATE public.contas SET balance = balance + d/2, updated_at = now() WHERE id = NEW.account_id;
      UPDATE public.contas SET balance = balance + d/2, updated_at = now() WHERE id = NEW.account_tayane_id;
    ELSIF NEW.account_id IS NOT NULL THEN
      UPDATE public.contas SET balance = balance + d, updated_at = now() WHERE id = NEW.account_id;
    END IF;
  END IF;
  RETURN NULL;
END; $function$;

UPDATE public.cartao_parcelas SET status='pending', paid_amount=0, paid_by=null
WHERE id='7c9cd850-1162-4776-a0d3-178d75c924b5'
  AND NOT EXISTS (SELECT 1 FROM public.transacoes WHERE card_installment_id='7c9cd850-1162-4776-a0d3-178d75c924b5');