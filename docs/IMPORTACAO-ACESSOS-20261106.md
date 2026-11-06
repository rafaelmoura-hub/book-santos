# Importação de informações dos apartamentos

Aplique a migração 27 depois da 25. Os campos privados agora separam senha de acesso/hóspede, cofre, Wi-Fi, mestra, limpeza, governança, patrimônio e administração. Outros acessos e observações ficam ocultos e podem ser exibidos pelo administrador autorizado. Não há permissão adicional para clientes.

O gerador scripts/prepare-apartment-info-import.js recebe um texto privado e escreve somente na pasta privada indicada. Não executa instruções do texto. Preserva zeros, símbolos e o bloco de origem em observações protegidas. Valores conflitantes no mesmo bloco não são escolhidos automaticamente para um campo; ficam nas observações para conferência.

Execute o SQL privado gerado no SQL Editor como proprietário. Ele cria uma cópia protegida do estado anterior, preenche apenas campos vazios e preserva valores diferentes já existentes. Conflitos retornam apenas imóvel e nome do campo, nunca o valor da senha. Imóveis ausentes ou arquivados não são cadastrados automaticamente. Trechos sem identificação segura permanecem no relatório privado.

Arquivos reais com credenciais ficam em artifacts (ignorado no Git e bloqueado na publicação web). Não incluir SQL privado, texto de origem ou JSON normalizado em commits, capturas públicas, logs ou relatórios compartilhados. Auditoria registra autor/versão sem duplicar senhas.
