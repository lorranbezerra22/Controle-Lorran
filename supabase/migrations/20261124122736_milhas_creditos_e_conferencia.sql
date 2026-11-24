alter table public.milhas_programas
  add column saldo_app numeric,
  add column saldo_app_conferido_em date,
  add constraint milhas_programas_saldo_app_check check (
    (saldo_app is null and saldo_app_conferido_em is null) or
    (saldo_app is not null and saldo_app >= 0 and saldo_app_conferido_em is not null)
  );

alter table public.milhas_ganhos
  add column data_credito date;

create function public.milhas_ajustar_saldo(p_programa_id uuid, p_delta numeric)
returns public.milhas_programas
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_programa public.milhas_programas;
begin
  update public.milhas_programas
  set balance = greatest(0, balance + p_delta)
  where id = p_programa_id and user_id = (select auth.uid())
    and p_delta is not null
  returning * into v_programa;

  if not found then
    raise exception 'Programa indisponível para atualizar o saldo.';
  end if;
  return v_programa;
end;
$$;

create function public.milhas_confirmar_credito_clube(
  p_ganho_id uuid,
  p_data_credito date,
  p_pontos numeric
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_programa_id uuid;
  v_ganho public.milhas_ganhos;
  v_nota text;
begin
  select program_id into v_programa_id
  from public.milhas_ganhos
  where id = p_ganho_id and user_id = v_usuario and source = 'clube';

  perform 1 from public.milhas_programas
  where id = v_programa_id and user_id = v_usuario
  for update;
  if not found then
    raise exception 'Crédito de clube indisponível.';
  end if;

  select * into v_ganho
  from public.milhas_ganhos
  where id = p_ganho_id and program_id = v_programa_id
    and user_id = v_usuario and source = 'clube'
  for update;
  if not found then
    raise exception 'Crédito de clube indisponível.';
  end if;

  if strpos(coalesce(v_ganho.note, ''), '[PENDING]') = 0 then
    return 'ja_confirmado';
  end if;

  if p_pontos is null or p_pontos <= 0 or p_pontos > 1000000000000
    or trunc(p_pontos) <> p_pontos
    or p_data_credito is null
    or p_data_credito < date_trunc('month', v_ganho.month::timestamp)::date
    or p_data_credito > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Confira a quantidade de pontos e a data do crédito no extrato.';
  end if;

  v_nota := regexp_replace(v_ganho.note, '\[PENDING\] • \[DUE:[0-9]{4}-[0-9]{2}-[0-9]{2}\] • ', '');
  if strpos(v_nota, '[PENDING]') > 0 then
    raise exception 'O crédito previsto está sem uma data válida.';
  end if;

  update public.milhas_ganhos
  set points = p_pontos,
      data_credito = p_data_credito,
      note = v_nota
  where id = p_ganho_id and user_id = v_usuario;

  perform public.milhas_ajustar_saldo(v_programa_id, p_pontos);
  return 'confirmado';
end;
$$;

create function public.milhas_salvar_previsao_clube(
  p_programa_id uuid,
  p_serie text,
  p_previsoes jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_marcador text := '[SERIE:' || p_serie || ']';
  v_tem_previsoes boolean;
begin
  if p_serie is null or p_serie !~ '^[a-zA-Z0-9_-]{1,80}$'
    or p_previsoes is null or jsonb_typeof(p_previsoes) <> 'array' then
    raise exception 'Previsões de clube inválidas.';
  end if;
  if jsonb_array_length(p_previsoes) > 120 then
    raise exception 'A agenda do clube comporta até 120 créditos previstos.';
  end if;
  v_tem_previsoes := jsonb_array_length(p_previsoes) > 0;

  perform 1 from public.milhas_programas
  where id = p_programa_id and user_id = v_usuario
  for update;
  if not found then
    raise exception 'Programa indisponível para cadastrar o clube.';
  end if;

  if v_tem_previsoes and exists (
    select 1 from public.milhas_ganhos
    where user_id = v_usuario and program_id = p_programa_id and source = 'clube'
      and strpos(note, v_marcador) > 0 and strpos(note, '[PENDING]') = 0
  ) then
    raise exception 'Este ciclo já tem crédito registrado. Encerre as previsões restantes e cadastre o novo plano.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_previsoes) as p(data_prevista date, pontos numeric, custo numeric, descricao text)
    where p.data_prevista is null or not isfinite(p.data_prevista)
      or p.pontos is null or p.pontos <= 0 or p.pontos > 1000000000000
      or trunc(p.pontos) <> p.pontos or p.custo is null or p.custo < 0
      or p.descricao is null or btrim(p.descricao) = ''
      or p.descricao ~ '\[(PENDING|DUE:|SERIE:)'
  ) then
    raise exception 'Confira as datas, os pontos e os custos previstos.';
  end if;

  delete from public.milhas_ganhos
  where user_id = v_usuario and program_id = p_programa_id and source = 'clube'
    and strpos(note, v_marcador) > 0 and strpos(note, '[PENDING]') > 0;

  insert into public.milhas_ganhos (user_id, program_id, source, month, points, cost, note)
  select v_usuario, p_programa_id, 'clube', date_trunc('month', p.data_prevista::timestamp)::date,
    p.pontos, p.custo, v_marcador || ' • [PENDING] • [DUE:'
      || to_char(p.data_prevista, 'YYYY-MM-DD') || '] • ' || p.descricao
  from jsonb_to_recordset(p_previsoes) as p(data_prevista date, pontos numeric, custo numeric, descricao text);
end;
$$;

revoke execute on function public.milhas_ajustar_saldo(uuid, numeric) from public, anon;
revoke execute on function public.milhas_confirmar_credito_clube(uuid, date, numeric) from public, anon;
revoke execute on function public.milhas_salvar_previsao_clube(uuid, text, jsonb) from public, anon;
grant execute on function public.milhas_ajustar_saldo(uuid, numeric) to authenticated;
grant execute on function public.milhas_confirmar_credito_clube(uuid, date, numeric) to authenticated;
grant execute on function public.milhas_salvar_previsao_clube(uuid, text, jsonb) to authenticated;
