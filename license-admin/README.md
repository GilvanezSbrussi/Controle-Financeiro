# Gerador de licencas

Esta pasta e somente do administrador. Nao publique estes arquivos junto com o app e nao copie para o celular do usuario.

## Abrir com tela

Na pasta principal do projeto, de dois cliques em:

```text
abrir-gerador-licencas.bat
```

Ele abre o navegador com a tela do gerador. Na tela inicial voce pesquisa e seleciona o cliente para gerar a licenca. Para gravar clientes, clique em `Cadastrar cliente`.

## Gerar uma licenca

Exemplo para uma licenca de 30 dias:

```powershell
node .\license-admin\generate-license.js --cliente "Cliente Teste" --documento "000.000.000-00" --dias 30
```

Exemplo para uma licenca de 365 dias:

```powershell
node .\license-admin\generate-license.js --cliente "Cliente Teste" --documento "00.000.000/0001-00" --dias 365
```

Copie apenas o texto grande mostrado depois de `Licenca:` e entregue ao usuario.

## Chave de teste

O app tambem aceita `FINANCAS-2026`, que vence 1 dia apos a ativacao no aparelho.
