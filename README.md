# Performance Pro — starter v0.2

Aplicativo multiplataforma para iOS, Android e navegador com Expo + React Native + Supabase. Identidade visual oficial incluída em `logo-diego-trapia.jpg`.

## Incluído nesta etapa
- Login por e-mail e senha; cadastro público desativado.
- Fluxo de convite para atletas por e-mail via Supabase Edge Function.
- Perfis de treinador/atleta e isolamento de dados por Row Level Security (RLS).
- Tela inicial por tipo de conta; painel do treinador para convidar e selecionar atletas.
- Monitoramento inicial: PSR/TQR, PSE, duração, UA e saltos pré/pós; histórico de registros.
- Sessão persistente em dispositivos móveis com SecureStore.
- Esquema SQL e Edge Function administrativa.

## Configuração
1. Instale Node.js LTS e entre em um projeto Supabase.
2. `npm install`
3. Copie `.env.example` para `.env` e configure `EXPO_PUBLIC_SUPABASE_URL` e a chave pública (anon/publishable). **Nunca coloque `service_role` no app ou no `.env` exposto ao cliente.**
4. No SQL Editor do Supabase, execute `supabase/schema.sql` em um projeto novo/limpo.
5. Crie a primeira conta do treinador pelo Supabase Dashboard > Authentication > Users > Add user. Use e-mail verificado/senha forte.
6. No SQL Editor, substitua `COACH_USER_UUID` e execute o bloco de bootstrap abaixo. O nome da equipe pode ser ajustado:
```sql
begin;
insert into public.teams(name, owner_id)
values ('Minha equipe', 'COACH_USER_UUID')
returning id;
-- Copie o UUID retornado para TEAM_UUID e então execute:
update public.profiles set role='coach', team_id='TEAM_UUID',
  full_name='Diego Trapiá' where id='COACH_USER_UUID';
commit;
```
Observação: faça o insert e o update no mesmo bloco/transação, preenchendo os UUIDs reais. Como alternativa, execute o insert, copie o ID retornado e depois faça o update da profile em uma transação.
7. Deploy da Edge Function:
```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy invite-athlete
```
8. A função precisa de `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente gerenciado pelo Supabase. Essas variáveis normalmente já estão disponíveis nas Edge Functions. Configure `ATHLETE_INVITE_REDIRECT_URL` como URL de callback/deep link que seu app realmente trate; não invente URL de produção antes de configurar o domínio/app.
9. No Supabase Auth > URL Configuration, configure Site URL e Redirect URLs permitidas para web e deep links do app.
10. Execute `npx expo start`; navegador: `npx expo start --web`.

## Fluxo de convite
- Treinador autenticado envia nome, e-mail e modalidade.
- Edge Function valida o JWT, confirma papel de treinador e propriedade da equipe no servidor, envia o convite e vincula o perfil de atleta ao registro.
- O atleta recebe o e-mail do Supabase para confirmar/definir acesso conforme as configurações de Auth.
- O app não aceita cadastro público nem permite que o cliente altere papel ou equipe no perfil.

## Segurança e privacidade
- A chave `service_role` só deve existir no ambiente da Edge Function.
- As políticas RLS limitam os atletas aos próprios registros de atleta, treinos e monitoramento; treinador autorizado acessa os dados da própria equipe.
- A política de perfil permite ao usuário alterar somente `full_name`, por concessão de coluna.
- Revise e teste políticas em ambiente de homologação antes de usar dados reais. Para menores, obtenha consentimentos e autorizações aplicáveis e limite os dados pessoais coletados.
- Para produção, configure recuperação de senha, rate limits, política de privacidade, exclusão/exportação de dados e auditoria de acesso.

## Próximas entregas
Editor completo de treinos, biblioteca de exercícios e mídia offline, gráficos de evolução, carga aguda/monotonia/strain e análise validada de vídeos de salto. O monitoramento atual é inicial; não substitui avaliação profissional nem gera diagnóstico médico.
