DELETE FROM public.transacoes 
WHERE account_id = 'fc79ad15-874f-4821-a12a-73931fcfbef3' 
  AND (description LIKE 'Rendimento%' OR description = 'Lorran');