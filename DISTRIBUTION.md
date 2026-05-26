# Distribuição

Como o MESP Pet ainda não tem code signing, Windows e Mac vão alertar o usuário ao instalar. Aqui está como contornar.

## Windows

1. Baixe o `.exe` do release
2. Ao executar, o **SmartScreen** pode bloquear: "Windows protegeu seu PC"
3. Clique em **Mais informações** → **Executar assim mesmo**
4. Confirme o prompt de UAC

Para evitar este aviso permanentemente, o desenvolvedor precisaria comprar um certificado EV (~$300/ano).

## macOS

1. Baixe o `.dmg`
2. Arraste o app para Applications
3. Ao abrir pela primeira vez, vai aparecer: "não pode ser aberto porque o desenvolvedor não pode ser verificado"
4. Vá em **Configurações do Sistema → Privacidade e Segurança**
5. Role até embaixo e clique **Abrir mesmo assim**

Alternativa via terminal:
```bash
xattr -cr /Applications/MESP\ Pet.app
```

Para evitar, o desenvolvedor precisaria de Apple Developer ID (~$99/ano) + notarização.

## Linux

Baixe o `.AppImage`, dê permissão de execução e rode:

```bash
chmod +x MESP-Pet-*.AppImage
./MESP-Pet-*.AppImage
```

## Auto-start

Após instalar, abra o app, clique direito no pet e selecione **"Iniciar com o sistema"**. O MESP vai abrir automaticamente quando você ligar o computador.

Para desabilitar, repita o processo (o item vira "Não iniciar com o sistema").

## Atualização

O app **não tem auto-update**. Para atualizar, baixe a nova versão do release e reinstale.
