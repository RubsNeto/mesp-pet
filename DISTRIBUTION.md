# Distribuição

## Downloads

Os instaladores ficam na release mais recente do GitHub, sempre com o mesmo nome. O site aponta direto para eles.

| Sistema | Arquivo | Atualização |
| --- | --- | --- |
| Windows 10 e 11 (x64) | `MESP-Setup.exe` | Automática |
| macOS Apple Silicon | `MESP-mac-arm64.dmg` | Aviso no app com link |
| macOS Intel | `MESP-mac-x64.dmg` | Aviso no app com link |
| Linux (Ubuntu, Debian) | `MESP-linux.deb` | Aviso no app com link |
| Linux (qualquer distro) | `MESP-linux.AppImage` | Automática |

Link fixo: `https://github.com/RubsNeto/mesp-pet/releases/latest/download/<arquivo>`.

## Primeira abertura sem assinatura digital

Os instaladores ainda não têm certificado pago, então o sistema pede uma confirmação.

- **Windows:** em “O Windows protegeu o computador”, clique em Mais informações › Executar assim mesmo.
- **macOS:** se a abertura for bloqueada, vá em Ajustes do Sistema › Privacidade e Segurança › Abrir mesmo assim. Se aparecer “está danificado”, rode `xattr -cr "/Applications/MESP Top Dock.app"`.
- **Linux:** `sudo apt install ./MESP-linux.deb`. O AppImage precisa de `chmod +x` e, no Ubuntu 22.04 ou mais novo, da `libfuse2`.

Para remover os avisos: certificado de assinatura de código no Windows e Apple Developer ID com notarização no macOS.

## Como publicar uma versão

1. Atualize `version` no `package.json` e `APP_VERSION` em `landing/src/lib/site.ts`.
2. Faça commit, crie a tag `vX.Y.Z` e envie a tag.
3. O workflow `Publicar instaladores` testa, empacota os quatro alvos, roda `--mesp-smoke` em cada pacote e só então publica a release.

`npm run package:smoke` repete localmente a verificação do pacote gerado em `release/`.

## Arte e ícones

`npm run gen:brand` gera ícones, imagem da bandeja, favicon do site e a arte do instalador a partir do sprite oficial do MESP (`src/procedural`). O personagem nunca é redesenhado, só ampliado em fatores inteiros.

## Dados e diagnóstico

Os dados ficam na pasta do usuário e continuam lá após desinstalar. Os logs ficam em `logs/` dentro dessa pasta. Em Configurações › App há “Copiar diagnóstico”, que remove senhas e tokens, e “Relatar problema”.
