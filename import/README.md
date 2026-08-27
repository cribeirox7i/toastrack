# Import de dados — Toastrack

O import roda **no próprio app**, na página `/admin` (só quem tem `user_role = 'admin'` entra).
Você sobe a planilha e um `.zip` com as fotos; o app valida tudo, mostra uma prévia e só
grava depois que você confirmar.

> ⚠️ **O import é substituição, não acréscimo.** Ao confirmar, ele **apaga todas as suas
> linhas daquele tipo** (cerveja ou vinho) e insere a planilha inteira no lugar. Os outros
> tipos e os dados de outros usuários não são tocados — o RLS garante isso, e o import não
> usa chave de service_role.

## Colunas

Baixe o template direto no `/admin` (botão "Baixar template") — ele é gerado a partir do
schema real, então nunca fica desatualizado. As mesmas colunas estão em
`beer_template.csv` e `wine_template.csv` aqui nesta pasta, para referência.

**Cervejas:** `beer_nome` (obrigatório), `beer_produtor`, `pais_id`, `beer_ibu`, `beer_abv`,
`beer_nota`, `beer_estilo_livre`, `bjcp21_id`, `beer_data`, `beer_img_nome`

**Vinhos:** `wine_nome` (obrigatório), `wine_safra`, `wine_cor`, `wine_tipo`, `wine_produtor`,
`pais_id`, `wine_regiao`, `wine_uva`, `wine_abv`, `wine_nota`, `wine_data_degustacao`,
`wine_img_nome`

Colunas a mais na planilha são ignoradas. Colunas de menos também, exceto a obrigatória.
Não existe coluna de URL de foto: o `*_img_url` é calculado pelo app a partir do
`*_img_nome` e do caminho no Storage.

## Regras por tipo de campo

- **`pais_id` e `bjcp21_id`:** o **ID numérico** das tabelas `list_pais` e `list_bjcp_21`.
  Como conveniência, o nome exato também é aceito (`Brasil`, `10A - Weissbier`) — acento e
  maiúscula não importam. O que **não** é aceito é um código parcial tipo `10A`, porque
  vários estilos compartilham o mesmo código e adivinhar seria pior que recusar a linha.
- **Datas:** `AAAA-MM-DD` ou `DD/MM/AAAA` — os dois funcionam. Ano de 2 dígitos
  (`03/04/26`) é **recusado** de propósito: é ambíguo demais.
- **Números decimais:** ponto ou vírgula conforme sua planilha exportar, mas o valor
  precisa ser numérico (`5.2`).
- **Avaliação (`*_nota`):** 0 a 5, em passos de 0,5.
- **`wine_cor`:** `Tinto`, `Branco`, `Rosé`, `Verde`, `Laranja`.
- **`wine_tipo`:** `Seco`, `Semi-Seco`, `Suave`, `Brut`. Se sua planilha usa **`Doce`**,
  me avisa — eu adiciono o valor ao enum em vez de forçar em outro.
- **Campos vazios:** pode deixar em branco, exceto o nome.

## Fotos

Um `.zip` com as imagens; o nome do arquivo dentro do zip tem que bater com o
`*_img_nome` da linha (maiúscula/minúscula não importa; pastas dentro do zip são
ignoradas). Formatos: jpg, jpeg, png, webp, gif.

As fotos vão para o **Supabase Storage**, no bucket público `toastrack`, em
`IMG/BEER/<user_id>/` e `IMG/WINE/<user_id>/`. A prévia mostra quantas casaram, quais
linhas ficaram sem foto e quais fotos sobraram sem linha — dá pra conferir antes de gravar.

O zip é opcional: sem ele, os itens entram sem foto e você pode rodar o import de novo
depois com as imagens.

## Passo a passo

1. Exporte a planilha (uma aba/arquivo por tipo) — CSV, XLS ou XLSX servem. Só a
   **primeira aba** de cada arquivo é lida.
2. Abra `/admin` no app, logado com a conta que vai **ser dona** dos dados.
3. Escolha o arquivo. A prévia mostra total de linhas, quantas passaram e a lista de
   problemas (linha, coluna, valor, motivo). Nada foi gravado ainda.
4. Escolha o zip de fotos, se tiver.
5. Marque a confirmação de que a substituição vai apagar os dados atuais e confirme.

## Verificação da regra de parsing

`node scripts/test-import-parse.mjs` (ou `npm run test:import`) exercita as regras de data
e de resolução de país/estilo.
