# Barbearia Saraiva — app de agendamento + painel

Dois PWAs num projeto só:

| Endereço   | Para quem            | O que faz |
|------------|----------------------|-----------|
| `/`        | Clientes             | Escolher profissional → serviços → dia/horário livre → confirmar. Login por **nome + WhatsApp (código SMS)**. Meus horários, perfil, histórico de cortes, favorito. |
| `/painel`  | Dono e profissionais | Visão geral (faturamento, ocupação, faltas, ranking, gráficos), agenda do dia em tempo real, lista com filtros, bloqueios/folgas, equipe e comissões, serviços/preços/horário de funcionamento, clientes (melhores, sumidos, faltosos). Notificação push de novo agendamento. |

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres, Auth, Realtime, RLS) · Web Push (VAPID) · deploy na Vercel.

---

## Como o banco garante as regras

Tudo está em `supabase/migrations/`:

- **Sem horário duplicado:** uma *exclusion constraint* no Postgres impede dois agendamentos sobrepostos para o mesmo profissional, mesmo se duas pessoas clicarem ao mesmo tempo.
- **Agendar** passa pela função `book_appointment`. Ela confere se o serviço é da área do profissional, se está dentro do horário de funcionamento, se não cai num bloqueio, e calcula preço e duração no servidor (o cliente não consegue mandar outro valor).
- **Horários livres:** `get_available_slots` e `get_available_days`.
- **Painel:** `dashboard` (métricas) e `clients_report` (clientes).
- **Permissões (RLS):**
  - o cliente só vê os próprios agendamentos;
  - o barbeiro só vê e altera a própria agenda e só bloqueia os próprios horários;
  - o dono vê e edita tudo;
  - ninguém altera preço de agendamento existente: só status, forma de pagamento e observação podem mudar.
- **Preço histórico:** o valor de cada serviço é copiado para o agendamento. Mudar a tabela de preços não altera o passado.

---

## Colocar no ar (passo a passo)

### 1. Supabase
1. Crie a conta/organização da barbearia e um projeto na região **South America (São Paulo)**.
2. Em **SQL Editor**, rode na ordem:
   1. `supabase/migrations/20261030000001_schema.sql`
   2. `supabase/migrations/20261030000002_security.sql`
   3. `supabase/migrations/20261030000003_functions.sql`
   4. `supabase/seed.sql` (horários, profissionais e serviços — **preços e durações são exemplos**)

   Se preferir pelo terminal: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. **Authentication → Providers:**
   - **Phone:** ligar e configurar um provedor de SMS (Twilio, MessageBird, Vonage…). Cada SMS tem custo no provedor. Para testar sem gastar, cadastre números de teste em *Phone → Test OTP* (ex.: `5585999998888=123456`).
   - **Email:** deixar ligado (é o login do dono e dos barbeiros).
4. **Conta do dono:**
   1. Em *Authentication → Users → Add user*, crie com e-mail e senha e marque *Auto Confirm*.
   2. No SQL Editor, rode:
   ```sql
   update public.profiles set role = 'owner', name = 'Saraiva'
   where id = (select id from auth.users where email = 'EMAIL_DO_DONO');
   ```
   Os barbeiros o dono cria pelo próprio painel: **Equipe → Editar → Criar acesso**.

### 2. Chaves de notificação
```bash
npm install
npm run vapid      # gera a chave pública e a privada
```

### 3. Vercel
1. Suba o projeto pro GitHub e importe na Vercel.
2. Configure as variáveis de ambiente (modelo em `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: em *Project Settings → API* (chave publishable).
   - `SUPABASE_SERVICE_ROLE_KEY`: chave secreta, **só no servidor**.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`: as chaves do passo 2.
   - `WEBHOOK_SECRET`: um texto longo aleatório.
3. Em *Authentication → URL Configuration* do Supabase, coloque a URL do site em *Site URL*.

### 4. Webhook (dispara o push)
No Supabase: **Database → Webhooks → Create**:
- Tabela `appointments`, eventos **Insert** e **Update**
- Tipo HTTP Request, `POST https://SEU-SITE/api/webhooks/appointment`
- Header `x-webhook-secret: <o mesmo WEBHOOK_SECRET>`

O dono e o barbeiro do horário recebem a notificação quando um cliente agenda pelo app ou cancela.

### 5. Instalar nos celulares
- **Clientes:** abrir o site → *Compartilhar → Adicionar à Tela de Início* (iPhone) ou *Instalar app* (Android).
- **Barbeiros e dono:** abrir `/painel`, entrar, instalar do mesmo jeito, depois ligar **Notificações** (menu lateral ou aba *Mais*).
  - No iPhone, o push **só funciona com o app instalado na tela de início** (iOS 16.4 ou mais novo).

---

## Rodar localmente
```bash
cp .env.example .env.local   # preencha com as chaves do projeto
npm install
npm run dev                  # http://localhost:3000 e http://localhost:3000/painel
```

## Estrutura
```
supabase/migrations/   esquema, segurança (RLS) e funções
supabase/seed.sql      dados iniciais
src/app/(cliente)/     app do cliente: início, horários, perfil, barbearia
src/app/painel/        painel: visão geral, agenda, agendamentos, bloqueios, equipe, serviços, clientes
src/app/api/           criar acesso de barbeiro, excluir conta (LGPD), webhook de push
src/components/        casca do app, agendamento, painel, ícones
src/styles/            visual (escopado: .ca = cliente, .pn = painel)
public/sw.js           service worker (push + cache de imagens)
public/team/           fotos dos profissionais
```

## Pendências antes de lançar
- Nomes reais dos barbeiros 5–8 e da manicure, além de preços, durações e horário de funcionamento. Tudo dá pra ajustar pelo painel.
- Comissões: o seed usa 50% para barbeiros e 60% para a manicure. Confirmar com o dono.
- Instagram da barbearia, se quiser o botão.
- **Fase 2:** lembrete automático no WhatsApp do cliente (API oficial da Meta) e upload de foto pelo painel (Supabase Storage).
