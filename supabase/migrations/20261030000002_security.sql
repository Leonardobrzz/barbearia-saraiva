-- =====================================================================
-- Regras de acesso (RLS)
--   cliente  -> vê/edita o próprio perfil e vê os próprios agendamentos
--   barbeiro -> vê e atualiza só a própria agenda; cria bloqueios dele
--   dono     -> vê e edita tudo
-- Agendar e cancelar passam por funções (RPC) que validam as regras.
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.professionals        enable row level security;
alter table public.services             enable row level security;
alter table public.business_hours       enable row level security;
alter table public.time_blocks          enable row level security;
alter table public.appointments         enable row level security;
alter table public.appointment_services enable row level security;
alter table public.push_subscriptions   enable row level security;

-- ---------- perfis ----------
create policy "perfil: ler o próprio ou equipe lê" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "perfil: dono edita todos" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------- catálogo público (qualquer um pode ver) ----------
create policy "profissionais: leitura pública" on public.professionals
  for select to anon, authenticated using (active or public.is_staff());
create policy "profissionais: dono gerencia" on public.professionals
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "serviços: leitura pública" on public.services
  for select to anon, authenticated using (active or public.is_staff());
create policy "serviços: dono gerencia" on public.services
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "horários: leitura pública" on public.business_hours
  for select to anon, authenticated using (true);
create policy "horários: dono gerencia" on public.business_hours
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------- bloqueios ----------
create policy "bloqueios: equipe lê" on public.time_blocks
  for select to authenticated using (public.is_staff());
create policy "bloqueios: dono gerencia" on public.time_blocks
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "bloqueios: barbeiro cria os dele" on public.time_blocks
  for insert to authenticated with check (professional_id = public.my_professional_id());
create policy "bloqueios: barbeiro apaga os dele" on public.time_blocks
  for delete to authenticated using (professional_id = public.my_professional_id());

-- ---------- agendamentos ----------
create policy "agendamentos: cliente vê os seus" on public.appointments
  for select to authenticated using (client_id = auth.uid());
create policy "agendamentos: barbeiro vê a própria agenda" on public.appointments
  for select to authenticated using (professional_id = public.my_professional_id());
create policy "agendamentos: dono vê tudo" on public.appointments
  for select to authenticated using (public.is_owner());
create policy "agendamentos: barbeiro atualiza a própria agenda" on public.appointments
  for update to authenticated
  using (professional_id = public.my_professional_id())
  with check (professional_id = public.my_professional_id());
create policy "agendamentos: dono atualiza tudo" on public.appointments
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- só estas colunas podem ser alteradas diretamente (status, pagamento, observação)
revoke insert, update, delete on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;
grant update (status, payment_method, notes) on public.appointments to authenticated;

create policy "itens: visíveis junto com o agendamento" on public.appointment_services
  for select to authenticated using (
    exists (select 1 from public.appointments a where a.id = appointment_id)
  );
revoke insert, update, delete on public.appointment_services from anon, authenticated;

-- ---------- push ----------
create policy "push: cada um gerencia as suas" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- tempo real (agenda do painel atualiza sozinha) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.time_blocks;
  end if;
end $$;
