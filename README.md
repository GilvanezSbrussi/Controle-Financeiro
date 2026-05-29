# Controle sua Fortuna

Foram preparadas duas versoes do aplicativo:

- `pwa`: versao instalavel pelo navegador do celular.
- `android-capacitor`: versao preparada para gerar APK Android com Capacitor.

O app possui receitas, despesas, transferencias entre conta corrente e investimentos, totalizadores, graficos e backup/importacao de dados.

## Licencas

A chave de teste `FINANCAS-2026` vence 1 dia apos a ativacao.

Para abrir a tela do gerador, de dois cliques em:

```text
abrir-gerador-licencas.bat
```

Ele abre o navegador em `http://127.0.0.1:8789`. Cadastre o cliente com nome e CPF/CNPJ, pesquise pelo cliente, selecione na lista, escolha os dias de validade e clique em `Gerar licenca`.

Se quiser gerar pelo terminal, ainda pode usar:

```powershell
node .\license-admin\generate-license.js --cliente "Nome do cliente" --documento "000.000.000-00" --dias 30
```

Nao publique a pasta `license-admin` junto com a PWA e nao copie essa pasta para o celular do usuario.

## Teste rapido local

Na pasta principal, voce pode abrir com um servidor local:

```powershell
npx serve .
```

Depois acesse o endereco mostrado no navegador.
