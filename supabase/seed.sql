-- =====================================================================
-- Dados iniciais da Barbearia Saraiva
-- Preços, durações e horários são EXEMPLOS: confirme com o dono e ajuste
-- pelo painel (Serviços) ou aqui antes de rodar.
-- =====================================================================

insert into public.business_hours (weekday, open_time, close_time, closed) values
  (0, null,    null,    true),   -- domingo
  (1, '09:00', '20:00', false),
  (2, '09:00', '20:00', false),
  (3, '09:00', '20:00', false),
  (4, '09:00', '20:00', false),
  (5, '09:00', '20:00', false),
  (6, '08:00', '18:00', false)
on conflict (weekday) do update
  set open_time = excluded.open_time, close_time = excluded.close_time, closed = excluded.closed;

insert into public.professionals (name, role_label, category, photo_url, commission_pct, sort) values
  ('Jackson',    'Barbeiro',         'barber', '/team/jackson.jpg',  50, 1),
  ('Henrique',   'Barbeiro',         'barber', '/team/henrique.jpg', 50, 2),
  ('Júnior',     'Barbeiro',         'barber', '/team/junior.jpg',   50, 3),
  ('Willian',    'Barbeiro',         'barber', '/team/willian.jpg',  50, 4),
  ('Barbeiro 5', 'Barbeiro',         'barber', '/team/p4.jpg',       50, 5),
  ('Barbeiro 6', 'Barbeiro',         'barber', '/team/p6.jpg',       50, 6),
  ('Barbeiro 7', 'Barbeiro',         'barber', '/team/p7.jpg',       50, 7),
  ('Barbeiro 8', 'Barbeiro',         'barber', '/team/p8.jpg',       50, 8),
  ('Manicure',   'Unhas & Estética', 'beauty', '/team/mulher.jpg',   60, 9);

insert into public.services (name, description, category, price_cents, duration_min, popular, sort) values
  ('Corte masculino',           'Tesoura e/ou máquina, lavagem e finalização', 'barber',  4000,  40, false, 1),
  ('Barba',                     'Toalha quente, navalha e balm',               'barber',  3000,  30, false, 2),
  ('Corte + Barba',             'O combo completo da casa',                    'barber',  6000,  60, true,  3),
  ('Pezinho / Acabamento',      'Contorno e nuca',                             'barber',  1500,  15, false, 4),
  ('Sobrancelha',               'Na navalha ou pinça',                         'barber',  1500,  10, false, 5),
  ('Pigmentação',               'Barba ou cabelo',                             'barber',  2500,  20, false, 6),
  ('Hidratação capilar',        'Tratamento com máscara',                      'barber',  3000,  20, false, 7),
  ('Luzes',                     'Inclui tonalização',                          'barber', 10000,  90, false, 8),
  ('Platinado',                 'Descoloração global',                         'barber', 13000, 120, false, 9),
  ('Progressiva masculina',     'Alinhamento dos fios',                        'barber',  8000,  60, false, 10),
  ('Manicure',                  'Cutilagem e esmaltação',                      'beauty',  3000,  45, false, 1),
  ('Pedicure',                  'Cutilagem, lixa e esmaltação',                'beauty',  3500,  45, false, 2),
  ('Mão + Pé',                  'Combo completo',                              'beauty',  6000,  80, true,  3),
  ('Esmaltação em gel',         'Duração de até 3 semanas',                    'beauty',  7000,  60, false, 4),
  ('Alongamento em gel',        'Fibra ou molde',                              'beauty', 15000, 120, false, 5),
  ('Manutenção do alongamento', 'A cada 15–20 dias',                           'beauty',  9000,  90, false, 6),
  ('Spa dos pés',               'Esfoliação, hidratação e massagem',           'beauty',  5000,  40, false, 7),
  ('Design de sobrancelha',     'Com ou sem henna',                            'beauty',  3500,  30, false, 8);

-- Depois de criar a conta do DONO (Authentication > Users > Add user, com e-mail e senha),
-- rode no SQL Editor trocando o e-mail:
--   update public.profiles set role = 'owner', name = 'Saraiva'
--   where id = (select id from auth.users where email = 'dono@exemplo.com');
-- Os barbeiros o dono cria pelo próprio painel (Equipe > Criar acesso).
