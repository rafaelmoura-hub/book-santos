# Catálogo de condomínios

A lista oficial contém 17 condomínios e 126 apartamentos.

Execute no SQL Editor do Supabase a migração `supabase/migrations/202610230007_catalog.sql`, depois das anteriores, e publique os arquivos atualizados. O código local não executa essa alteração no banco remoto automaticamente.

O cadastro de apartamentos de exemplo é substituído. Registros históricos são preservados; o nome antigo Unique continua autorizado para consulta do histórico e anexos. Pessoas com acesso a Unique recebem também acesso a Unique Residence. Os demais condomínios devem ser liberados na tela Usuários pelo administrador mestre.
