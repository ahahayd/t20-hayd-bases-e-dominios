# T20 Hayd Bases e Domínios (Heróis de Arton)

Une, em um único módulo, o **T20 Hayd Bases** e o **T20 Hayd Domínios**: dois tipos de ator independentes, com automação completa das regras de **Bases** (capítulo 3 do *Heróis de Arton*, pp. 244–251) e de **Regência/Domínios** (pp. 314–327) do mesmo suplemento. Os dois subsistemas funcionam de forma totalmente separada — cada um com seu próprio tipo de ator, ficha, catálogo e configurações — e não interferem entre si; eles só passaram a viver no mesmo pacote.

## Requisitos

- FoundryVTT **v13**
- Sistema **Tormenta20**
- *(Opcional)* **t20-hayd-ui** — as fichas adotam o tema visual combinado quando ativo

## Instalação

Em *Configurar → Módulos Complementares → Instalar Módulo*, cole a URL do manifesto:

```
https://github.com/ahahayd/t20-hayd-bases-e-dominios/releases/latest/download/module.json
```

Depois de ativar, crie atores dos tipos **Base — HayD (Heróis de Arton)** e/ou **Domínio (Heróis de Arton)**, conforme a necessidade.

## Substituindo os módulos antigos

Se o mundo já usava o **t20-hayd-bases** e/ou o **t20-hayd-dominios** separadamente, este módulo detecta os dados existentes automaticamente ao carregar o mundo (com o mestre logado):

- Os atores dos tipos antigos são **migrados automaticamente** para os novos tipos deste módulo, preservando todos os dados (moedas, cômodos, mobílias, moradores, construções, unidades, turnos, histórico etc.).
- As **configurações** dos módulos antigos (sincronização automática de efeitos, linhas do histórico do caixa) são herdadas.
- Enquanto os módulos antigos continuarem ativos, uma mensagem é enviada ao chat (visível só para o mestre) pedindo para desativá-los em *Configurar → Módulos Complementares* — isso evita tipos de ator duplicados e qualquer conflito entre a versão antiga e a nova.

Nenhuma ação manual é necessária além de desativar os módulos antigos depois que a migração acontecer.

### Atores "indisponíveis"

Se um módulo antigo for desativado **antes** da migração automática rodar (por exemplo, desativar o t20-hayd-dominios antes de ativar este módulo pela primeira vez), o Foundry deixa de reconhecer o tipo de ator antigo e o exibe como **indisponível** no diretório — nesse estado ele nem aparece para a varredura automática. Para esses casos, use o botão **Migrar agora** em *Configurar → Módulos Complementares → T20 Hayd Bases e Domínios*, que também cobre atores indisponíveis.

## Bases

Novo tipo de ator "Base": portes, tipos, segurança, manutenção, cômodos, mobílias e moradores recebendo os benefícios automaticamente.

### Moradores

Arraste os atores dos personagens (e parceiros) para a ficha da base ou use o seletor manual da aba **Moradores**, que lista os atores do tipo Personagem disponíveis. Cada morador tem um interruptor geral e um botão de lista para habilitar ou desabilitar cada benefício automatizado individualmente. Os benefícios são aplicados como Efeitos Ativos nas fichas — bônus de perícia, PV/PM, Defesa, carga e afins. Benefícios narrativos aparecem como lembretes.

### Aba Base

Defina o tipo e o porte, acompanhe a **segurança** (composta automaticamente pelos cômodos e mobílias, limitada a 20) e use o caixa do grupo para custear as obras.

### Cômodos e mobílias

Catálogos completos das Tabelas 3-7 e 3-8, com validação de pré-requisitos (porte, tipo, cômodos), custo e teste de construção automatizado. Suítes são repetíveis com atribuição de moradores, mobílias respeitam os locais válidos e a capacidade de cada cômodo, e os casos especiais (Ídolo Dourado, Mapa-Múndi, Bigorna, Baú Reforçado…) são automatizados.

Nos cartões de testes de construção de Bases e Domínios, o mestre pode alterar o resultado entre sucesso e falha depois da rolagem. A correção adiciona ou remove a obra correspondente sem cobrar novamente o custo.

### Entre aventuras

**Iniciar nova aventura** cobra a manutenção (ou danifica um cômodo aleatório), lista as escolhas de início de aventura e rola a Ala dos Criados. Bases do tipo Empreendimento têm o botão de administração, que faz o teste e gera a renda em TO.

### Homebrews de Bases

Crie cômodos e mobílias personalizados (★) com custo, segurança, locais válidos e Efeitos Ativos usando os caminhos oficiais do sistema, com sugestões automáticas de preenchimento.

## Domínios

Novo tipo de ator "Domínio": turnos de domínio, impostos, construções, unidades militares, eventos aleatórios, batalhas simplificadas, domínios místicos e transferência de benefícios para o regente.

### Primeiros passos

Arraste o ator do personagem para a ficha do domínio para vinculá-lo como regente. Na aba **Domínio**, configure terreno, corte, conselheiros e popularidade; adicione os lingotes iniciais clicando no tesouro (1 LO = T$ 1.000). Para consultar as regras completas, use o suplemento *Heróis de Arton*.

### Turno de domínio

Ao fim de cada aventura, clique em **Iniciar novo turno** e siga as etapas: **eventos** (rolados com os modificadores certos; os de resolução simplificada viram pendências com botões de teste), **impostos** (escolha a faixa e o módulo rola rendas, manutenções e ajusta a popularidade) e **ações** — 2 por turno, como Governar, Construir, Recrutar, Festival e Caravana, usando as perícias do regente com todos os bônus aplicáveis. **Encerrar turno** aplica as consequências pendentes.

### Construções

A aba **Construções** traz o catálogo completo (Tabela 4-10) com validação de pré-requisitos, terreno e tesouro. Construções com benefício de ficha geram Efeitos Ativos no regente, com interruptor individual em cada cartão. Domínios místicos concedem +nível² PM ao regente e seguem suas regras próprias de construção e renda.

### Batalhas

Na aba **Batalha**, preencha o inimigo (eventos de invasores preenchem sozinhos) e clique em **Resolver batalha**: teste oposto de Guerra com os bônus de Poder, Fortificação e aliados, aplicando as consequências pela margem automaticamente.

### Homebrews de Domínios

Crie construções personalizadas (★) com custo, categoria, pré-requisitos e Efeitos Ativos usando os caminhos oficiais do sistema, com sugestões automáticas de preenchimento.

## Detalhes adicionais

- A sincronização dos efeitos com moradores/regente é automática por padrão em cada subsistema (configurável separadamente) e pode ser disparada manualmente; ao remover um morador, excluir a base ou excluir o domínio, os efeitos são limpos das fichas correspondentes.
- Os testes de perícia de Domínios abrem a janela de configuração de uso do próprio sistema (bônus situacional, 2d20, modo de rolagem); cancelar a janela cancela a ação sem gastar nada, e Shift pula a janela.
- Com o **t20-hayd-ui** ativo, cada ficha de Base ou Domínio pode usar cor automática, a cor padrão do mundo ou uma cor de destaque personalizada individualmente pelo botão de paleta no cabeçalho.
- API para macros em `game.modules.get("t20-hayd-bases-e-dominios").api`:
  - `api.bases`: `catalogo`, `acoes`, `sincronizarEfeitos`, `removerEfeitos`, `montarEfeitosPara`, `obterMorador`
  - `api.dominios`: `catalogo`, `acoes`, `sincronizarEfeitos`, `removerEfeitos`, `obterRegente`, `criarTabelas`

## Créditos

Ícones de Bases e Domínios fornecidos por [Game-icons.net](https://game-icons.net/).

## Aviso

Módulo não oficial, criado por fã, sem afiliação com a Jambô Editora ou com os autores de Tormenta20.
