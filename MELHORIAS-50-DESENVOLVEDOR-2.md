# Mais 50 melhorias para o desenvolvedor MESP

Esta segunda rodada complementa a anterior e atende ao pedido de retirar os cortes de execução.
As mudanças estão implementadas; a evidência de execução está em `VALIDACAO-AGENTE.md`.

| #   | Melhoria aplicada                                            | Resultado                                                                                                                                             |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Retirar o prazo do agente Autônomo                           | Trabalhos não são interrompidos aos cinco minutos.                                                                                                    |
| 2   | Retirar o orçamento local de tokens                          | O contador mede consumo sem interromper a tarefa.                                                                                                     |
| 3   | Retirar o teto de ferramentas                                | Ler, editar e executar não esgotam uma quantidade fixa de chamadas.                                                                                   |
| 4   | Retirar o relógio da conversa rápida                         | A resposta pode continuar até terminar ou ser cancelada.                                                                                              |
| 5   | Retirar o relógio do modo Assistido                          | A espera por aprovação não consome um prazo de execução.                                                                                              |
| 6   | Migrar limites das conversas existentes                      | Configurações antigas não reativam cortes; mensagens e rascunhos permanecem.                                                                          |
| 7   | Migrar limites das tarefas guardadas na fila                 | Pedidos salvos também executam sem os orçamentos antigos.                                                                                             |
| 8   | Retirar a expiração da espera entre projetos                 | A tarefa aguarda a pasta ficar disponível, mantendo o cancelamento.                                                                                   |
| 9   | Substituir corte por silêncio por atualização de estado      | Três minutos sem saída não encerram o OpenCode.                                                                                                       |
| 10  | Retirar o teto de 90 segundos das verificações automáticas   | Testes e builds longos podem terminar normalmente.                                                                                                    |
| 11  | Retirar cortes de duração das verificações manuais           | A suíte e seus comandos permanecem canceláveis, sem prazo local.                                                                                      |
| 12  | Retirar o teto de duas correções                             | A correção continua enquanto houver progresso.                                                                                                        |
| 13  | Detectar ciclos de correção sem progresso                    | A combinação de arquivos e falhas já observada encerra o ciclo com o motivo real. Tempos variáveis dos testes não mascaram repetições.                |
| 14  | Preservar a contagem real de correções                       | Histórico e relatório exibem também três ou mais tentativas.                                                                                          |
| 15  | Simplificar o controle do chat                               | “Verificações” substitui o formulário de limites.                                                                                                     |
| 16  | Retirar a janela total de 80 segundos do Auto integrado      | A seleção não perde alternativas por causa de um relógio geral.                                                                                       |
| 17  | Consultar todas as alternativas disponíveis do Auto          | Oito tentativas deixam de ser um teto arbitrário; cada alternativa é usada uma vez por consulta.                                                      |
| 18  | Retirar cortes locais da resposta do provedor no broker Auto | A produção não corta a geração em 8, 25 ou 45 segundos. Cancelamento e erros explícitos continuam funcionando.                                        |
| 19  | Reunir falhas de todas as verificações independentes         | O agente recebe os problemas de lint, testes e build juntos.                                                                                          |
| 20  | Executar Vitest simples em modo CI                           | `vitest` recebe `run`; scripts explícitos de observação continuam identificados.                                                                      |
| 21  | Executar Jest simples sem observação                         | `jest` recebe execução serial e `--watchAll=false`.                                                                                                   |
| 22  | Encaminhar argumentos adicionais pelo gerenciador            | npm recebe o separador correto; os arquivos de scripts não são reescritos.                                                                            |
| 23  | Reconhecer workspaces declarados no package.json             | Subprojetos são localizados pelos padrões do próprio projeto.                                                                                         |
| 24  | Reconhecer pacotes declarados pelo pnpm                      | A inspeção também interpreta a lista de `pnpm-workspace.yaml`.                                                                                        |
| 25  | Respeitar exclusões e fixtures intencionalmente inválidas    | Pacotes excluídos e dados de testes não são tratados como aplicativos a corrigir.                                                                     |
| 26  | Verificar subprojetos na pasta e ferramenta corretas         | Scripts usam seu diretório e o gerenciador declarado; a orquestração raiz tem precedência.                                                            |
| 27  | Validar manifests dos workspaces                             | JSON inválido de um pacote real aparece como falha verificável.                                                                                       |
| 28  | Ler instruções AGENTS dos subdiretórios                      | O agente recebe regras locais antes de editar os respectivos módulos.                                                                                 |
| 29  | Incluir documentos de arquitetura e contribuição             | ARCHITECTURE, CONTRIBUTING e DEVELOPMENT entram no contexto inspecionado.                                                                             |
| 30  | Identificar a branch atual                                   | O contexto distingue em qual linha de trabalho o projeto está.                                                                                        |
| 31  | Identificar o commit base                                    | O agente recebe o HEAD observado antes da implementação.                                                                                              |
| 32  | Identificar alterações Git preexistentes                     | O contexto explicita trabalho já modificado e orienta sua preservação, sem reset/stash/stage automáticos.                                             |
| 33  | Distinguir repositório pai do projeto                        | Uma pasta pertencente a um Git maior não autoriza editar os outros projetos.                                                                          |
| 34  | Listar variáveis de ambiente necessárias sem valores         | Templates `.env.example`, `.env.sample` e `.env.template` fornecem somente nomes.                                                                     |
| 35  | Informar se faltam dependências locais                       | A inspeção distingue presença de node_modules e orienta preparar o ambiente do projeto.                                                               |
| 36  | Verificar compilação Rust                                    | Cargo check é selecionado a partir do manifest.                                                                                                       |
| 37  | Executar testes Rust respeitando lockfile                    | Cargo test usa `--locked` quando Cargo.lock já existe.                                                                                                |
| 38  | Executar análise Go                                          | go vet verifica o módulo e seus pacotes.                                                                                                              |
| 39  | Executar testes Go                                           | go test verifica os pacotes do módulo.                                                                                                                |
| 40  | Descobrir build e testes .NET                                | Soluções/projetos usam dotnet; projetos de teste identificados recebem test após build. Runtime ausente é informado.                                  |
| 41  | Escolher pytest ou unittest conforme o projeto               | Configuração e formato dos testes evitam declarar uma execução de zero testes como cobertura útil.                                                    |
| 42  | Priorizar o Python do ambiente virtual do projeto            | `.venv`/`venv` precedem o Python global nas verificações.                                                                                             |
| 43  | Evitar contexto de novos artefatos gerados                   | target, obj e caches Python são ignorados; nomes de diretório são comparados sem diferenciar maiúsculas.                                              |
| 44  | Validar nomes acessíveis de botões e links                   | Controles com somente símbolos recebem uma falha identificável para correção.                                                                         |
| 45  | Validar rótulos dos campos                                   | Inputs, selects e textareas visíveis precisam de nomes acessíveis.                                                                                    |
| 46  | Verificar idioma, título, imagens, IDs e acesso pelo teclado | A auditoria encontra metadados ausentes, alt ausente, IDs duplicados e controles retirados da tabulação.                                              |
| 47  | Testar tablet e tela ampla com viewport preciso              | 768 e 1440 px complementam 320, 390 e 1024; emulação do Chromium evita medir um redimensionamento ainda pendente.                                     |
| 48  | Preservar o endereço da prévia                               | Builds e reinicializações mantêm a origem quando a porta está livre, preservando localStorage/IndexedDB; chaves de acesso são renovadas ao reiniciar. |
| 49  | Retomar e finalizar a entrega com diagnóstico real           | Retomar um projeto aciona ferramentas; erros do servidor incluem saída redigida, e o chat distingue entrega parcial de conclusão sem texto do modelo. |
| 50  | Serializar gravações de memória no Windows                   | Escritas concorrentes do mesmo projeto não disputam o rename atômico nem perdem relatórios por essa corrida.                                          |

O botão **Parar** continua cancelando o agente, a espera e os testes pertencentes à tarefa.
O limite de execuções simultâneas organiza a fila para preservar a capacidade do computador;
ele não expira nem interrompe tarefas. Limites de contexto, cota e geração impostos pelos
provedores continuam sendo características das contas/modelos, não orçamentos locais do MESP.

Os runtimes Python, Go e Rust foram exercitados com testes reais e defeitos intencionais.
.NET/pytest e ferramentas ausentes são descobertos e informados, sem alegar execução inexistente.
As verificações de acessibilidade são automáticas e pontuais; não constituem certificação completa.
