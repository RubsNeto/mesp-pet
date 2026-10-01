# Auditoria do MESP Top Dock — 1º de outubro de 2026

## Parecer

A variante instalada foi revisada em código e usada como aplicativo Electron.
Foram corrigidos problemas de proporção, personalização, conversa, fila e teclado.
O Auto também recebeu uma resposta real usando as contas do 9Router instalado.
Contas com autenticação pendente precisam ser reconectadas pelo fluxo do provedor.

O resultado permite usar os fluxos validados. Não é uma garantia de ausência de
qualquer falha, de acesso a todos os modelos do catálogo ou de funcionamento de
todos os provedores, nem de operação autônoma contínua em servidor.

## Problemas encontrados e alterações

| Área           | Problema e efeito no uso                                                                                                                      | Alteração aplicada                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proporções     | Com dez MESP, o cabeçalho estreito comprimia o título e a ilha recolhida podia ultrapassar a largura disponível.                              | Largura limitada à janela; personagens acima do título em telas estreitas; opções e rodapé redistribuídos. Verificação em 320, 384, 520, 680 e 1366 px.                                            |
| Primeiro uso   | A altura inicial cortava opções em telas estreitas.                                                                                           | Mais espaço para as sugestões iniciais, com quebra de linha e controles maiores.                                                                                                                   |
| Personalização | O editor anterior ocupava a janela inteira; partes ficavam fora da área acessível e a prévia permitia formatos que o Dock não preservava.     | Editor próprio dentro da ilha, com prévia clássica, cores e acessórios explícitos. Cancelar preserva o estado anterior; salvar altera apenas o personagem escolhido.                               |
| Conversa       | O MESP Code possuía um campo escondido. Sugestões preenchiam esse campo, enquanto o usuário via outro. Parar e enfileirar ficavam escondidos. | Campo nativo único, ligado ao mesmo armazenamento de rascunhos do Dock. Sugestões acrescentam texto ao campo visível; envio, parada e fila ficam acessíveis no chat.                               |
| Rascunhos      | O início de uma tarefa enfileirada podia apagar um novo rascunho.                                                                             | A fila inicia sem limpar texto que ainda não foi enviado. Rascunhos continuam separados por MESP.                                                                                                  |
| Cancelamento   | Um cancelamento do MESP Code podia deixar o personagem marcado como ocupado.                                                                  | O fim por cancelamento libera o personagem e conserva o rascunho.                                                                                                                                  |
| Histórico      | O botão para ir à mensagem mais recente podia cobrir Parar; sugestões vazias começavam roladas ao fim.                                        | Botão colocado no fluxo do chat, separado do campo; conversa vazia inicia no topo. Mais altura útil para o MESP Code em telas estreitas.                                                           |
| Reinício       | O aplicativo voltava ao primeiro MESP, perdendo o ponto de navegação.                                                                         | Seleção e personagem principal salvos, com recuperação segura se um identificador deixar de existir.                                                                                               |
| Teclado        | Esc podia recolher a ilha deixando a lista aberta; o foco do campo nativo dependia da ordem de liberação dos elementos bloqueados.            | Esc fecha primeiro a camada atual. Ctrl+K e o fechamento da personalização devolvem o foco ao chat. Modos e abas de personalização aceitam setas, Home e End; diálogos mantêm o foco dentro deles. |
| Animações      | Todos os personagens faziam o mesmo volume de desenho, inclusive quando a própria ilha os ocultava.                                           | MESP pequenos desenhados a 20 fps, principal a 40 fps; animação do personagem pausada quando oculto pelo estado da ilha. A preferência de movimento reduzido é atualizada sem reiniciar.           |
| Saída          | Um clique em Sair ou fechar a janela podia encerrar trabalho ativo imediatamente.                                                             | Confirmação dentro da ilha para tarefas ativas, compartilhada pelo botão Sair, tray e fechamento da janela. Recolher continua mantendo o trabalho.                                                 |
| Identidade     | O título nativo ainda era MESP Pet e alguns rótulos não tinham acentos.                                                                       | Título MESP Top Dock e revisão dos rótulos da personalização e de instruções do chat.                                                                                                              |

## Design e comportamento preservados

- Ilha preta, cartões discretos, foco em tons neutros e expansão com mola.
- MESP original azul, formato clássico e olho único. Cores e aparências persistem.
- Novos MESP sem acessórios; cores diferentes das já usadas. Personalização explícita permite acessórios.
- Clique comprime o personagem e ele volta ao normal; carinho mostra a mão e fecha o olho.
- Criação instantânea pelo +, títulos automáticos em segundo plano e respeito à renomeação manual.
- Conclusão promove o personagem e dá acesso ao resultado sem trocar a conversa ou o rascunho em uso.
- Configurações e painel do 9Router continuam na janela flutuante. Tokens não chegam ao renderer.

## Validação executada

| Verificação                       | Resultado                                                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm test                          | 200 testes passaram.                                                                                                                                                                                                                                |
| npm run lint                      | Passou.                                                                                                                                                                                                                                             |
| npm run build                     | TypeScript e bundles compilados.                                                                                                                                                                                                                    |
| npm run test:dock                 | Criação, sessões, títulos, promoção, carinho, compressão, aparências, privacidade e modelos passaram.                                                                                                                                               |
| npm run test:usability            | Rascunhos por MESP, reinício, texto multilinha, ajuda, comandos e atalhos passaram.                                                                                                                                                                 |
| npm run test:history              | Histórico após reinício, cópia, posição de leitura e mensagem recente em janela estreita passaram.                                                                                                                                                  |
| npm run test:router               | Servidor 9Router 0.5.40 real, páginas, formulário nativo, busca, grade de ícones e fluxo na mesma janela passaram em perfil isolado.                                                                                                                |
| npm run test:router:auto          | Adaptador real com provedores simulados: prioridade por reset, exclusão de contas esgotadas, fallback, streaming e consumo por conta passaram.                                                                                                      |
| npm run test:audit                | 35 verificações passaram: responsividade com dez personagens, campo único, fila, cancelamento, saída pelo botão e fechamento nativo, teclado, foco, movimento reduzido, aparências e reinício. Relatórios detalhados são gerados localmente em qa/. |
| Consulta real no perfil instalado | Auto retornou MESP_OK, sem erro e sem ferramentas; projetos, rascunhos e seleção permaneceram intactos.                                                                                                                                             |

Os testes de interação usam agentes/contas simulados e janelas ocultas com perfis
isolados. O teste de conexão real foi separado, utilizou o perfil instalado e
enviou apenas uma mensagem curta pelo modo Rápido. Não executou ferramentas nem
uma alteração de código por um provedor real.

## Preservação e publicação

O código foi copiado da variante instalada para um checkout próprio do repositório.
Os dados pessoais, perfis locais, credenciais, capturas e backups não fazem parte
da publicação. O checkout anterior, suas alterações e as dependências compartilhadas
foram preservados. O novo checkout tem dependências próprias.

A instalação independente também foi verificada. O `postinstall` instala o runtime
do Electron antes de preparar os módulos nativos, evitando um atalho sem executável
em instalações novas. Os testes usam Playwright do próprio projeto e não dependem
de caminhos internos do ambiente de desenvolvimento. Nessa cópia, passaram novamente
os 200 testes unitários, lint, build, as 35 verificações de interface e o teste do Auto.

## Próximas melhorias de produto

Uma validação adicional é realizar uma tarefa real de
desenvolvimento no modo Assistido em um projeto de teste. Depois, vale observar
uma sessão longa com múltiplos agentes e reconexão de rede; os testes atuais não
substituem uma validação de horas de execução.

A base central de contexto e o executor em servidor devem ser uma etapa
separada. O contexto local por projeto pode sustentar a experiência de
desenvolvimento atual, mas não garante contexto compartilhado entre PCs nem
execução 24 horas. Para essa evolução, o MESP pode manter a interface pequena
enquanto o servidor armazena conhecimento, agenda tarefas e integra ferramentas.
Não é necessário transformar a ilha em um editor completo do Obsidian para
entregar esse valor.
