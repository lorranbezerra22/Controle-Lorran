create table if not exists public.cartao_recorrentes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  templates jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cartao_recorrentes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cartao_recorrentes'
      and policyname = 'Users manage their own card recurring templates'
  ) then
    create policy "Users manage their own card recurring templates"
      on public.cartao_recorrentes for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end;
$$;

revoke all on public.cartao_recorrentes from anon;
grant select, insert, update, delete on public.cartao_recorrentes to authenticated;

create or replace function public.atualizar_versao_compra_planejada()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.atualizar_versao_compra_planejada() from public, anon, authenticated;
create or replace trigger atualizar_versao_compra_planejada
  before update on public.cartao_recorrentes
  for each row execute function public.atualizar_versao_compra_planejada();

create or replace function public.confirmar_compra_planejada(
  p_id text, p_mes text, p_remover boolean default false
)
returns public.cartao_recorrentes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_account public.cartao_recorrentes;
  v_plan jsonb;
  v_index integer;
  v_months jsonb;
  v_launches jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_card uuid;
  v_due_day integer;
  v_invoice date;
  v_purchase_month date;
  v_purchase_date date;
  v_people text[];
  v_person text;
  v_count integer;
  v_amount numeric;
  v_split numeric;
  v_remaining numeric;
  v_installment numeric;
  v_month date;
  v_purchase uuid;
  v_legacy_ids uuid[];
begin
  if v_user is null or p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Selecione um mês válido e entre na sua conta.';
  end if;

  select * into v_account from public.cartao_recorrentes where user_id = v_user for update;
  if not found then raise exception 'Compra planejada não encontrada.'; end if;

  select item.value, item.ordinality::integer - 1 into v_plan, v_index
    from jsonb_array_elements(v_account.templates) with ordinality as item(value, ordinality)
    where item.value->>'id' = p_id and coalesce((item.value->>'active')::boolean, true);
  if not found then raise exception 'Compra planejada não encontrada.'; end if;

  v_months := coalesce(v_plan->'confirmedMonths', '[]'::jsonb);
  v_launches := coalesce(v_plan->'launchIds', '{}'::jsonb);
  if p_remover is distinct from (v_months ? p_mes) then
    return v_account;
  end if;

  v_invoice := (p_mes || '-01')::date;
  v_purchase_month := (v_invoice - interval '1 month')::date;
  v_purchase_date := v_purchase_month + (
    least((v_plan->>'purchaseDay')::integer,
      extract(day from v_invoice - 1)::integer) - 1);
  v_card := (v_plan->>'cardId')::uuid;
  v_amount := (v_plan->>'amount')::numeric;
  v_count := (v_plan->>'installments')::integer;
  select coalesce(nullif(due_day, 0), 10) into v_due_day from public.cartoes where id = v_card;
  if not found then raise exception 'O cartão deste lançamento não está disponível.'; end if;

  select array_agg(value) into v_people
    from jsonb_array_elements_text(coalesce(v_plan->'splitPeople', '[]'::jsonb));
  v_people := coalesce(v_people, array[nullif(v_plan->>'person', '')]);

  if p_remover then
    if v_launches ? p_mes then
      delete from public.cartao_compras
        where user_id = v_user and id::text in (select jsonb_array_elements_text(v_launches->p_mes));
    else
      -- Registros anteriores à migração ainda não guardavam o ID do lançamento.
      select array_agg(compra.id) into v_legacy_ids from public.cartao_compras as compra
        where compra.user_id = v_user and compra.card_id = v_card
          and compra.description = v_plan->>'description'
          and compra.purchase_date = v_purchase_date
          and exists (select from unnest(v_people) as p(person)
            where p.person is not distinct from compra.person)
          and exists (select from public.cartao_parcelas as parcela
            where parcela.purchase_id = compra.id and parcela.installment_number = 1
              and parcela.due_at >= v_invoice and parcela.due_at < v_invoice + interval '1 month');
      if coalesce(cardinality(v_legacy_ids), 0) <> cardinality(v_people) then
        raise exception 'Não foi possível identificar esta compra com segurança. Confira o lançamento na fatura.';
      end if;
      delete from public.cartao_compras where user_id = v_user and id = any(v_legacy_ids);
    end if;
    v_months := v_months - p_mes;
    v_launches := v_launches - p_mes;
  else
    if v_amount is null or v_amount <= 0 or v_count is null or v_count < 1
      or (v_plan->>'purchaseDay')::integer not between 1 and 31 then
      raise exception 'Revise o valor, as parcelas e o dia da compra.';
    end if;

    v_remaining := v_amount;
    for i in 1..cardinality(v_people) loop
      v_person := v_people[i];
      v_split := case
        when coalesce((v_plan->>'splitCustom')::boolean, false)
          then coalesce((v_plan->'splitAmounts'->>v_person)::numeric, 0)
        when i = cardinality(v_people) then v_remaining
        else round(v_amount / cardinality(v_people), 2)
      end;
      v_remaining := v_remaining - v_split;
      insert into public.cartao_compras (
        user_id, card_id, description, purchase_date, total_amount, installments_count,
        category_id, person, brand
      ) values (
        v_user, v_card, v_plan->>'description', v_purchase_date, v_split, v_count,
        coalesce(nullif(v_plan->'splitCategoryIds'->>v_person, ''),
          nullif(v_plan->>'categoryId', ''))::uuid,
        v_person, nullif(v_plan->>'brand', '')
      ) returning id into v_purchase;
      v_ids := v_ids || to_jsonb(v_purchase);

      v_installment := round(v_split / v_count, 2);
      for j in 0..v_count - 1 loop
        v_month := (v_invoice + make_interval(months => j))::date;
        insert into public.cartao_parcelas (
          user_id, purchase_id, card_id, installment_number, amount, due_at, status
        ) values (
          v_user, v_purchase, v_card, j + 1,
          case when j = v_count - 1 then v_split - v_installment * j else v_installment end,
          v_month + (least(v_due_day,
            extract(day from v_month + interval '1 month' - interval '1 day')::integer) - 1),
          'pending'
        );
      end loop;
    end loop;
    v_months := v_months || to_jsonb(p_mes);
    v_launches := jsonb_set(v_launches, array[p_mes], v_ids);
  end if;

  v_plan := v_plan - 'launchedMonth' || jsonb_build_object(
    'confirmedMonths', v_months, 'launchIds', v_launches
  );
  update public.cartao_recorrentes
    set templates = jsonb_set(templates, array[v_index::text], v_plan)
    where user_id = v_user returning * into v_account;
  return v_account;
end;
$$;

revoke all on function public.confirmar_compra_planejada(text, text, boolean) from public, anon;
grant execute on function public.confirmar_compra_planejada(text, text, boolean) to authenticated;
notify pgrst, 'reload schema';
