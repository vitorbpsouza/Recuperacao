-- ReCredita: primeira empresa da plataforma.
--
-- Dado de base, não de demonstração: todo ambiente (dev, teste, staging,
-- produção) precisa do tenant para criar o primeiro usuário. O seed sintético
-- continua separado e nunca roda em produção.
--
-- Os tenants seguintes, quando a plataforma virar SaaS, entram pelo onboarding.

insert into tenant (id, nome, sigla) values ('recredita', 'ReCredita', 'RC')
on conflict (id) do nothing;
