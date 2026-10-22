-- 1. Crie a conta em Authentication > Users > Add user > Create new user.
-- 2. Substitua os valores abaixo. Execute somente após a migração book_profiles.
-- O e-mail deve ser o mesmo da conta criada. Não coloque senhas neste arquivo.
insert into public.book_profiles (id, nome, login, funcao, mestre)
select id, 'Nome do administrador', lower(email), 'adm', true
from auth.users
where lower(email) = lower('SUBSTITUA_PELO_SEU_EMAIL');

-- Para outras contas, use o mesmo modelo com funcao='cliente' (ou 'adm') e mestre=false.
-- Se o e-mail não existir, nenhuma linha será criada. Confira em Table Editor > book_profiles.
