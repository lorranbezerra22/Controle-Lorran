import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/api/public/fix-balances')({
  server: {
    handlers: {
      POST: async () => {
        try {
          // 1. Buscar transações de "Família" ou estornos recentes com problema de saldo
          // Como o usuário já confirmou, vamos focar em ajustar o saldo das contas Mercado Pago e Nubank/Revolut
          
          // ID da conta Mercado Pago (Tayane) e Nubank/Revolut (Lorran)
          // Vamos buscar as contas dinamicamente para garantir precisão
          const { data: accounts } = await supabase.from('contas').select('id, account_name, balance')
          
          const lorranAcc = accounts?.find(a => (a.account_name || '').toLowerCase().includes('lorran'))
          const tayaneAcc = accounts?.find(a => (a.account_name || '').toLowerCase().includes('tayane'))
          
          if (!lorranAcc || !tayaneAcc) {
            return new Response('Contas não encontradas', { status: 404 })
          }

          // Ajuste manual: R$ 131,10 (o valor do reembolso mencionado anteriormente)
          const amount = 131.10
          
          // O usuário disse que foi 100% para Lorran (precisamos tirar metade de Lorran e dar para Tayane)
          // Saldo Lorran: -65.55
          // Saldo Tayane: +65.55
          
          const { error: errL } = await supabase.from('contas').update({ 
            balance: Number(lorranAcc.balance) - (amount / 2) 
          }).eq('id', lorranAcc.id)
          
          const { error: errT } = await supabase.from('contas').update({ 
            balance: Number(tayaneAcc.balance) + (amount / 2) 
          }).eq('id', tayaneAcc.id)

          if (errL || errT) throw new Error('Erro ao atualizar saldos')

          return new Response('Saldos corrigidos: R$ 65,55 movidos de Lorran para Tayane.')
        } catch (error: any) {
          return new Response(error.message, { status: 500 })
        }
      }
    }
  }
})
