-- Estornos confirmados reduzem a fatura, mas não são pagamentos negativos.
UPDATE cartao_parcelas
SET paid_amount = 0
WHERE amount < 0
  AND status = 'paid'
  AND paid_amount <> 0;

-- Mantém qualquer participação de estorno em valor positivo, evitando soma negativa nos painéis.
UPDATE participacoes_parcelas AS p
SET amount = ABS(p.amount)
FROM cartao_parcelas AS i
WHERE p.installment_id = i.id
  AND i.amount < 0
  AND p.amount < 0;
