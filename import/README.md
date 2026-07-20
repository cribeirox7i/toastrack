# Import de dados — Toastrack

Preencha os templates abaixo com seus ~3600 itens e me devolva. Eu cuido da conversão para o banco (resolver país/estilo, importar, ligar fotos depois).

## Arquivos
- `beer_template.csv` — cervejas
- `wine_template.csv` — vinhos
- (drinks/destilados: sem dados ainda, ignorar por enquanto)

Cada um já tem o cabeçalho certo + 1 linha de exemplo (pode apagar a linha de exemplo antes de exportar, ou deixar que eu ignoro).

## Regras gerais
- **Codificação:** UTF-8 (o padrão do Google Sheets ao exportar CSV já é UTF-8, sem problema).
- **Datas:** formato `AAAA-MM-DD` (ex: `2026-03-14`). Se sua planilha tem `DD/MM/AAAA`, me avisa — eu converto na importação, não precisa reformatar manualmente.
- **Números decimais:** use ponto, não vírgula (`5.2`, não `5,2`).
- **Nota (avaliação):** de 0 a 5, passos de 0.5 (`0, 0.5, 1, 1.5 ... 5`).
- **Campos vazios:** pode deixar em branco — não precisa preencher tudo.

## `pais_nome` (ambas as planilhas)
Escreva o nome do país em português, o mais parecido possível com esta lista (já cadastrada no banco):

África do Sul, Alemanha, Argentina, Austrália, Áustria, Bélgica, Brasil, Canadá, Chile, China, Coreia do Sul, Croácia, Cuba, Dinamarca, Escócia, Espanha, Estados Unidos, França, Geórgia, Grécia, Holanda, Hungria, Índia, Inglaterra, Irlanda, Itália, Japão, México, Noruega, Nova Zelândia, Peru, Polônia, Portugal, Reino Unido, República Tcheca, Romênia, Rússia, Suécia, Suíça, Uruguai

**Não se preocupe em bater 100%** — se aparecer um país que falta na lista (ex. "Escócia" vs "Reino Unido", ou um país novo), eu ajusto/adiciono na hora da importação. Só me avisa se tiver muitos casos assim.

## `beer_template.csv` — campos específicos
- `bjcp_cod`: o estilo BJCP, no formato `"01A - American Light Lager"` (código + nome). É uma lista de 129 estilos — **se não souber o código exato, deixe em branco e preencha só o `beer_estilo_livre`** (texto livre, tipo "IPA", "Weiss") que é o que mais importa visualmente.
- `beer_img_nome` / `beer_img_url`: pode deixar como estão na sua planilha atual (ID/nome do arquivo + URL do Drive) — não preciso que mude nada aqui agora. As fotos são um passo separado (ver abaixo).

## `wine_template.csv` — campos específicos
- `wine_cor`: um destes → `Tinto`, `Branco`, `Rosé`, `Verde`, `Laranja`
- `wine_tipo`: um destes → `Seco`, `Semi-Seco`, `Suave`, `Brut`. **Se você usa "Doce"**, me avisa — vou adicionar esse valor ao invés de forçar em outro.
- `wine_img_nome` / `wine_img_url`: mesma lógica das fotos de cerveja — pode deixar como está.

## Sobre as fotos (não precisa resolver agora)
Suas fotos já têm URL pública do Google Drive funcionando (`beer_img_url` / `wine_img_url`). Para o primeiro import, **vou usar essas URLs do Drive diretamente** — o app já sabe exibir imagem por URL, não precisamos re-hospedar ~3600 fotos no Supabase Storage neste momento. Migrar pra Storage próprio fica como melhoria futura, se você quiser (URLs do Drive podem expirar/mudar permissão com o tempo — é o único risco de deixar assim).

## Como me devolver
Quando terminar de mapear, um destes caminhos funciona:
1. **Exportar como CSV** (Arquivo → Fazer download → Valores separados por vírgula) e salvar em `C:\Claude\Toastrack\import\` (sobrescrevendo os templates) — eu leio direto do disco.
2. Ou mudar o compartilhamento da planilha para **"Qualquer pessoa com o link pode visualizar"** e me passar o link — eu leio direto de lá.

## Sobre a conta
Esses ~3600 itens são dados reais seus — faz sentido você **criar sua conta de verdade no app** (signup com seu e-mail real) em vez de usar a conta de teste (`tt1`). Me avisa se quer fazer isso antes, ou se prefiro importar tudo pra `tt1` mesmo por enquanto.
