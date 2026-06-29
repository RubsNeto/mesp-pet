# 21st.dev — Forçar Scroll (Extensão)

Extensão de navegador (Manifest V3) que restaura o scroll vertical no site
https://21st.dev/ removendo as travas de `overflow`/altura aplicadas pelo app.

Funciona no **Google Chrome** e no **Microsoft Edge** (e em qualquer navegador
baseado em Chromium: Brave, Opera, Vivaldi...).

## Conteúdo do pacote

```
21st-scroll-extension/
├── manifest.json     # Manifest V3
├── content.js        # Script que força o scroll
└── icons/            # Ícones 16/32/48/128 px
```

## Instalar localmente (modo desenvolvedor — "carregar pacote")

### Chrome / Brave / Opera
1. Acesse `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação** (Load unpacked)
4. Selecione a pasta `21st-scroll-extension`
5. Abra https://21st.dev/ — o scroll já funciona

### Microsoft Edge
1. Acesse `edge://extensions`
2. Ative **Modo de desenvolvedor** (canto inferior esquerdo)
3. Clique em **Carregar sem pacote**
4. Selecione a pasta `21st-scroll-extension`

## Publicar nas lojas

Use o arquivo **`21st-scroll-extension.zip`** (já gerado nesta pasta).

### Chrome Web Store
- Painel: https://chrome.google.com/webstore/devconsole
- Taxa única de US$ 5 para criar a conta de desenvolvedor
- Faça upload do `.zip`, preencha descrição, screenshots e ícone da loja

### Microsoft Edge Add-ons
- Painel: https://partner.microsoft.com/dashboard/microsoftedge
- Conta de desenvolvedor é **gratuita**
- Faça upload do mesmo `.zip`

## Observação técnica

O 21st.dev é um SPA em React. O script ataca as causas mais comuns de scroll
travado (overflow/height no `html`/`body` e nos containers raiz) e usa um
`MutationObserver` para reaplicar o fix sempre que o React reescreve os estilos
(ex.: ao abrir/fechar modais). Se algum caso específico não rolar, é só ajustar
os seletores em `content.js`.
