import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/fix-balances')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          
          const { data: accounts, error: fetchError } = await supabaseAdmin
            .from('contas')
            .select('id, account_name, balance, bank')
          
          if (fetchError) throw fetchError

          const nrm = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          
          const lorranAcc = accounts?.find(a => 
            nrm(a.account_name).includes('lorran') || 
            nrm(a.bank).includes('nubank') ||
            nrm(a.bank).includes('revolut')
          )
          
          const tayaneAcc = accounts?.find(a => 
            nrm(a.account_name).includes('tayane') || 
            nrm(a.bank).includes('mercado')
          )
          
          if (!lorranAcc || !tayaneAcc) {
            return new Response(JSON.stringify({
              error: 'Contas não encontradas',
              details: {
                lorranFound: !!lorranAcc,
                tayaneFound: !!tayaneAcc,
                available: accounts?.map(a => `${a.account_name} (${a.bank})`)
              }
            }), { status: 404, headers: { 'Content-Type': 'application/json' } })
          }

          const amountToTransfer = 131.10; // User asked to remove 131.10 from Lorran and transfer to Tayane
          
          const { error: errL } = await supabaseAdmin.from('contas').update({ 
            balance: Number(lorranAcc.balance) - amountToTransfer 
          }).eq('id', lorranAcc.id)
          
          const { error: errT } = await supabaseAdmin.from('contas').update({ 
            balance: Number(tayaneAcc.balance) + amountToTransfer 
          }).eq('id', tayaneAcc.id)

          if (errL || errT) throw new Error(`Erro ao atualizar saldos: ${errL?.message || errT?.message}`)

          return new Response(JSON.stringify({
            success: true,
            message: `Transferidos R$ ${amountToTransfer.toFixed(2)} de ${lorranAcc.account_name} para ${tayaneAcc.account_name}.`
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
          })
        }
      }
    }
  }
})
