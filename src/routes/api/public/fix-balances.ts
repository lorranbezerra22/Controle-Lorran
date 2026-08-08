import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/api/public/fix-balances')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { data: accounts } = await supabase.from('contas').select('id, account_name, balance, bank')
          console.log('Contas encontradas:', accounts)
          
          // Tentar encontrar as contas principais de cada um
          const lorranAcc = accounts?.find(a => 
            (a.account_name || '').toLowerCase().includes('lorran') || 
            (a.bank || '').toLowerCase().includes('nubank') ||
            (a.bank || '').toLowerCase().includes('revolut')
          )
          
          const tayaneAcc = accounts?.find(a => 
            (a.account_name || '').toLowerCase().includes('tayane') || 
            (a.bank || '').toLowerCase().includes('mercado')
          )
          
          if (!lorranAcc || !tayaneAcc) {
            return new Response(`Contas não encontradas. IDs: Lorran=${lorranAcc?.id}, Tayane=${tayaneAcc?.id}. Disponíveis: ${accounts?.map(a => a.account_name + ' (' + a.bank + ')').join(', ')}`, { status: 404 })
          }

          const amountToTransfer = 131.10 / 2; // 65.55
          
          const { error: errL } = await supabase.from('contas').update({ 
            balance: Number(lorranAcc.balance) - amountToTransfer 
          }).eq('id', lorranAcc.id)
          
          const { error: errT } = await supabase.from('contas').update({ 
            balance: Number(tayaneAcc.balance) + amountToTransfer 
          }).eq('id', tayaneAcc.id)

          if (errL || errT) throw new Error(`Erro ao atualizar saldos: ${errL?.message || errT?.message}`)

          return new Response(`Sucesso: R$ ${amountToTransfer.toFixed(2)} transferidos de ${lorranAcc.account_name} (${lorranAcc.bank}) para ${tayaneAcc.account_name} (${tayaneAcc.bank}).`)
        } catch (error: any) {
          return new Response(error.message, { status: 500 })
        }
      }
    }
  }
})
