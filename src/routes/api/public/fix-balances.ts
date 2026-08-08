import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/api/public/fix-balances')({
  server: {
    handlers: {
      POST: async () => {
        try {
          // Note: In local development/preview, we might use supabase client if RLS allows
          // or we might need the admin client if it were configured.
          // However, since we don't have the service role key, we'll try to use the public client.
          // If RLS is strict, this might fail, but we can try to find the accounts first.
          
          const { data: accounts, error: fetchError } = await supabase
            .from('contas')
            .select('id, account_name, balance, bank')
          
          if (fetchError) throw fetchError

          const nrm = (s: string | null) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
          
          const lorranAcc = accounts?.find(a => nrm(a.account_name).includes('LORRAN'))
          const tayaneAcc = accounts?.find(a => nrm(a.account_name).includes('TAYANE'))
          
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

          const amountToTransfer = 131.10;
          
          // We'll try to update. If RLS blocks it, we'll know.
          const { error: errL } = await supabase.from('contas').update({ 
            balance: Number(lorranAcc.balance) - amountToTransfer 
          }).eq('id', lorranAcc.id)
          
          const { error: errT } = await supabase.from('contas').update({ 
            balance: Number(tayaneAcc.balance) + amountToTransfer 
          }).eq('id', tayaneAcc.id)

          if (errL || errT) throw new Error(`Erro ao atualizar saldos (provavelmente RLS): ${errL?.message || errT?.message}`)

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
