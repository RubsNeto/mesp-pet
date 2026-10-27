; MESP installer pages (pt-BR). electron-builder includes this file before its own pages.
; Keep the UTF-8 BOM: without it NSIS reads the accents with the system code page.

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_TITLE "Tudo pronto"
  !define MUI_FINISHPAGE_TEXT "O MESP foi instalado e aparece como uma ilha no topo da tela.$\r$\n$\r$\nUse Ctrl+Shift+M para mostrar ou esconder. Na primeira conversa, conecte uma conta ou uma chave de API em Configurações."
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir o MESP agora"
!endif

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao MESP"
  !define MUI_WELCOMEPAGE_TEXT "O MESP vive no topo da tela e coloca um agente de código em cada projeto: ele lê, edita, executa e pede sua aprovação antes de agir.$\r$\n$\r$\nA instalação leva menos de um minuto. Seus dados ficam neste computador.$\r$\n$\r$\nClique em Avançar para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Desinstalar o MESP"
  !define MUI_WELCOMEPAGE_TEXT "O MESP será removido deste computador.$\r$\n$\r$\nSeus projetos, conversas e contas conectadas continuam guardados caso você instale de novo.$\r$\n$\r$\nClique em Avançar para continuar."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
