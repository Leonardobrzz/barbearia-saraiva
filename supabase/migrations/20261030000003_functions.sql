-- =====================================================================
-- Funções de negócio (RPC)
-- =====================================================================

-- ---------- horários livres de um profissional num dia ----------
create or replace function public.get_available_slots(
  p_professional uuid,
  p_date date,
  p_duration int
) returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  bh public.business_hours;
begin
  if p_duration is null or p_duration <= 0 then return; end if;
  if not exists (select 1 from professionals where id = p_professional and active) then return; end if;

  select * into bh from business_hours where weekday = extract(dow from p_date)::int;
  if not found or bh.closed then return; end if;

  return query
  with grid as (
    select (gs at time zone tz) as s
    from generate_series(
      p_date + bh.open_time,
      p_date + bh.close_time - make_interval(mins => p_duration),
      interval '30 minutes'
    ) gs
  )
  select g.s
  from grid g
  where g.s > now() + interval '15 minutes'
    and not exists (
      select 1 from appointments a
      where a.professional_id = p_professional
        and a.status not in ('cancelled', 'no_show')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(g.s, g.s + make_interval(mins => p_duration))
    )
    and not exists (
      select 1 from time_blocks b
      where (b.professional_id = p_professional or b.professional_id is null)
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(g.s, g.s + make_interval(mins => p_duration))
    )
  order by g.s;
end $$;

-- ---------- dias com pelo menos um horário livre (para a faixa de datas) ----------
create or replace function public.get_available_days(
  p_professional uuid,
  p_from date,
  p_days int,
  p_duration int
) returns table (day date, free_slots int)
language sql stable security definer set search_path = public as $$
  select d::date, (select count(*)::int from public.get_available_slots(p_professional, d::date, p_duration))
  from generate_series(p_from, p_from + (least(p_days, 31) - 1), interval '1 day') d
$$;

-- ---------- criar agendamento ----------
-- Cliente logado: agenda para si.
-- Equipe (balcão/WhatsApp): informa p_client_name/p_client_phone.
create or replace function public.book_appointment(
  p_professional uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_notes text default '',
  p_client_name text default null,
  p_client_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  uid uuid := auth.uid();
  is_desk boolean;
  pro professionals;
  prof profiles;
  n_req int;
  n_ok int;
  tot_price int;
  tot_dur int;
  ends timestamptz;
  local_start timestamp;
  local_end timestamp;
  bh business_hours;
  new_id uuid;
begin
  if uid is null then raise exception 'Faça login para agendar' using errcode = '28000'; end if;

  is_desk := p_client_name is not null and public.is_staff();
  if p_client_name is not null and not public.is_staff() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select * into pro from professionals where id = p_professional and active;
  if not found then raise exception 'Profissional indisponível'; end if;

  -- barbeiro só lança encaixe na própria agenda
  if is_desk and not public.is_owner() and pro.id is distinct from public.my_professional_id() then
    raise exception 'Você só pode agendar na sua agenda' using errcode = '42501';
  end if;

  n_req := (select count(distinct x) from unnest(p_service_ids) x);
  if n_req = 0 then raise exception 'Escolha pelo menos um serviço'; end if;

  select count(*), coalesce(sum(price_cents), 0), coalesce(sum(duration_min), 0)
    into n_ok, tot_price, tot_dur
  from services
  where id = any (p_service_ids) and active and category = pro.category;
  if n_ok <> n_req then raise exception 'Serviço inválido para este profissional'; end if;

  ends := p_starts_at + make_interval(mins => tot_dur);

  if not is_desk and p_starts_at < now() + interval '10 minutes' then
    raise exception 'Escolha um horário futuro';
  end if;

  -- dentro do horário de funcionamento
  local_start := p_starts_at at time zone tz;
  local_end := ends at time zone tz;
  select * into bh from business_hours where weekday = extract(dow from local_start)::int;
  if not found or bh.closed
     or local_start::time < bh.open_time
     or local_end::date <> local_start::date
     or local_end::time > bh.close_time then
    raise exception 'Fora do horário de funcionamento';
  end if;

  if exists (
    select 1 from time_blocks b
    where (b.professional_id = pro.id or b.professional_id is null)
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, ends)
  ) then
    raise exception 'Horário bloqueado';
  end if;

  if not is_desk then
    select * into prof from profiles where id = uid;
    if coalesce(trim(prof.name), '') = '' then raise exception 'Complete seu nome no perfil'; end if;
  end if;

  begin
    insert into appointments (client_id, client_name, client_phone, professional_id, starts_at, ends_at,
                              total_cents, notes, origin, created_by)
    values (case when is_desk then null else uid end,
            case when is_desk then trim(p_client_name) else prof.name end,
            case when is_desk then coalesce(p_client_phone, '') else coalesce(prof.phone, '') end,
            pro.id, p_starts_at, ends, tot_price, coalesce(p_notes, ''),
            case when is_desk then 'desk'::appointment_origin else 'app'::appointment_origin end,
            uid)
    returning id into new_id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado' using errcode = 'P0001';
  end;

  insert into appointment_services (appointment_id, service_id, name, price_cents, duration_min)
  select new_id, s.id, s.name, s.price_cents, s.duration_min
  from services s where s.id = any (p_service_ids);

  return new_id;
end $$;

-- ---------- cliente cancela o próprio horário ----------
create or replace function public.cancel_my_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update appointments
     set status = 'cancelled'
   where id = p_id
     and client_id = auth.uid()
     and status = 'confirmed'
     and starts_at > now();
  if not found then raise exception 'Não foi possível cancelar este horário'; end if;
end $$;

-- ---------- métricas do painel ----------
-- Dono vê tudo (ou filtra por profissional); barbeiro vê só os próprios números.
create or replace function public.dashboard(
  p_from date,
  p_to date,
  p_professional uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  pro_filter uuid;
  n_pros int;
  open_min numeric;
  result jsonb;
begin
  if not public.is_staff() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  pro_filter := case when public.is_owner() then p_professional else public.my_professional_id() end;
  if not public.is_owner() and pro_filter is null then raise exception 'Conta sem profissional vinculado'; end if;

  n_pros := case when pro_filter is null then (select count(*) from professionals where active) else 1 end;
  select coalesce(sum(extract(epoch from (bh.close_time - bh.open_time)) / 60), 0)
    into open_min
  from generate_series(p_from, p_to, interval '1 day') d
  join business_hours bh on bh.weekday = extract(dow from d)::int and not bh.closed;

  with base as (
    select a.*, (a.starts_at at time zone tz) as local_start
    from appointments a
    where (a.starts_at at time zone tz)::date between p_from and p_to
      and (pro_filter is null or a.professional_id = pro_filter)
  ),
  done as (select * from base where status = 'done')
  select jsonb_build_object(
    'revenue_cents',   (select coalesce(sum(total_cents), 0) from done),
    'expected_cents',  (select coalesce(sum(total_cents), 0) from base where status in ('confirmed', 'in_service')),
    'done_count',      (select count(*) from done),
    'pending_count',   (select count(*) from base where status in ('confirmed', 'in_service')),
    'no_show_count',   (select count(*) from base where status = 'no_show'),
    'cancelled_count', (select count(*) from base where status = 'cancelled'),
    'booked_minutes',  (select coalesce(sum(extract(epoch from (ends_at - starts_at)) / 60), 0) from base where status <> 'cancelled'),
    'open_minutes',    open_min * n_pros,
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'revenue_cents', coalesce(x.rev, 0), 'count', coalesce(x.n, 0)) order by d), '[]')
      from generate_series(p_from, p_to, interval '1 day') d
      left join (select local_start::date dd, sum(total_cents) rev, count(*) n from done group by 1) x on x.dd = d::date
    ),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'revenue_cents', rev, 'count', n, 'scheduled', sch) order by h), '[]')
      from (
        select extract(hour from local_start)::int h,
               coalesce(sum(total_cents) filter (where status = 'done'), 0) rev,
               count(*) filter (where status = 'done') n,
               count(*) filter (where status in ('confirmed', 'in_service')) sch
        from base group by 1
      ) t
    ),
    'by_professional', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'commission_pct', p.commission_pct,
        'count', coalesce(x.n, 0), 'revenue_cents', coalesce(x.rev, 0),
        'booked_minutes', coalesce(x.mins, 0),
        'commission_cents', round(coalesce(x.rev, 0) * p.commission_pct / 100)
      ) order by coalesce(x.rev, 0) desc, p.sort), '[]')
      from professionals p
      left join (
        select professional_id,
               count(*) filter (where status = 'done') n,
               sum(total_cents) filter (where status = 'done') rev,
               sum(extract(epoch from (ends_at - starts_at)) / 60) filter (where status <> 'cancelled') mins
        from base group by 1
      ) x on x.professional_id = p.id
      where p.active and (pro_filter is null or p.id = pro_filter)
    ),
    'by_service', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n, 'revenue_cents', rev) order by n desc), '[]')
      from (
        select s.name, count(*) n, sum(s.price_cents) rev
        from appointment_services s join done d on d.id = s.appointment_id
        group by s.name order by count(*) desc limit 8
      ) t
    ),
    'by_payment', (
      select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'revenue_cents', rev, 'count', n) order by rev desc), '[]')
      from (select coalesce(payment_method::text, 'nao_informado') payment_method, sum(total_cents) rev, count(*) n from done group by 1) t
    )
  ) into result;

  return result;
end $$;

-- ---------- relatório de clientes (só o dono) ----------
create or replace function public.clients_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
begin
  if not public.is_owner() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return (
    with v as (
      -- cliente identificado pela conta ou, no balcão, pelo telefone
      select coalesce(client_id::text, nullif(regexp_replace(client_phone, '\D', '', 'g'), ''), lower(client_name)) ckey,
             client_name, client_phone, professional_id, total_cents, status,
             (starts_at at time zone tz)::date d
      from appointments
      where (starts_at at time zone tz)::date <= p_to
    ),
    agg as (
      select ckey,
             (array_agg(client_name order by d desc))[1] name,
             (array_agg(client_phone order by d desc))[1] phone,
             count(*) filter (where status = 'done') visits,
             coalesce(sum(total_cents) filter (where status = 'done'), 0) spent,
             count(*) filter (where status = 'no_show') no_shows,
             max(d) filter (where status = 'done') last_visit,
             min(d) filter (where status = 'done') first_visit,
             bool_or(status = 'confirmed' and d >= current_date) has_future,
             mode() within group (order by professional_id) fav_pro
      from v group by ckey
    )
    select jsonb_build_object(
      'active',  (select count(*) from agg where last_visit >= p_from),
      'new',     (select count(*) from agg where first_visit between p_from and p_to),
      'top',     (select coalesce(jsonb_agg(t), '[]') from (select name, phone, visits, spent, last_visit, fav_pro from agg where visits > 0 order by spent desc limit 10) t),
      'lost',    (select coalesce(jsonb_agg(t), '[]') from (select name, phone, visits, spent, last_visit, fav_pro from agg
                    where visits >= 2 and last_visit < current_date - 30 and not coalesce(has_future, false)
                    order by visits desc limit 15) t),
      'no_shows',(select coalesce(jsonb_agg(t), '[]') from (select name, phone, no_shows from agg where no_shows > 0 order by no_shows desc limit 8) t)
    )
  );
end $$;

-- ---------- permissões das funções ----------
revoke all on function public.get_available_slots(uuid, date, int) from public;
revoke all on function public.get_available_days(uuid, date, int, int) from public;
revoke all on function public.book_appointment(uuid, uuid[], timestamptz, text, text, text) from public;
revoke all on function public.cancel_my_appointment(uuid) from public;
revoke all on function public.dashboard(date, date, uuid) from public;
revoke all on function public.clients_report(date, date) from public;
grant execute on function public.get_available_slots(uuid, date, int) to anon, authenticated;
grant execute on function public.get_available_days(uuid, date, int, int) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid[], timestamptz, text, text, text) to authenticated;
grant execute on function public.cancel_my_appointment(uuid) to authenticated;
grant execute on function public.dashboard(date, date, uuid) to authenticated;
grant execute on function public.clients_report(date, date) to authenticated;
