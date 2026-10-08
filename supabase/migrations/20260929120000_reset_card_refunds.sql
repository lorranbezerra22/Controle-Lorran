-- Remove todos os estornos antigos e seus vínculos.
-- O saldo das contas é recalculado pelos gatilhos existentes ao remover
-- eventuais lançamentos financeiros relacionados.
DO $$
DECLARE
  refund_installment_ids uuid[];
  refund_purchase_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(id)
  INTO refund_installment_ids
  FROM public.cartao_parcelas
  WHERE amount < 0;

  SELECT ARRAY_AGG(DISTINCT purchase_id)
  INTO refund_purchase_ids
  FROM public.cartao_parcelas
  WHERE amount < 0;

  IF refund_installment_ids IS NOT NULL THEN
    DELETE FROM public.participacoes_parcelas
    WHERE installment_id = ANY(refund_installment_ids);

    DELETE FROM public.transacoes
    WHERE card_installment_id = ANY(refund_installment_ids);

    DELETE FROM public.cartao_parcelas
    WHERE id = ANY(refund_installment_ids);
  END IF;

  IF refund_purchase_ids IS NOT NULL THEN
    DELETE FROM public.cartao_compras
    WHERE id = ANY(refund_purchase_ids);
  END IF;
END $$;