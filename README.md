[![Apoie no Ko-fi](https://img.shields.io/badge/Apoie_no_Ko--fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/haydgi)

# T20 Hayd Bases e Domínios (Heróis de Arton)

Une, em um único módulo, o **T20 Hayd Bases** e o **T20 Hayd Domínios**: tipos de ator independentes, com automação completa das regras de **Bases** (capítulo 3 do *Heróis de Arton*, pp. 244–251) e de **Regência/Domínios** (pp. 314–327) do mesmo suplemento. Também inclui **Negócios** (*Tormenta20: Fim dos Tempos - Arco 2: Valkaria*, pp. 309–312).

## Requisitos

- FoundryVTT **v13**
- Sistema **Tormenta20**
- *(Opcional)* **t20-hayd-ui** — as fichas adotam o tema visual combinado quando ativo

## Instalação

Em *Configurar → Módulos Complementares → Instalar Módulo*, cole a URL do manifesto:

```
https://github.com/ahahayd/t20-hayd-bases-e-dominios/releases/latest/download/module.json
```

Depois de ativar, crie atores dos tipos **Base (t20-hayd)**, **Domínio (t20-hayd)** e/ou **Negócio (t20-hayd)**, conforme a necessidade.

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

Nos cartões de testes de construção de Bases e Domínios (e de criação ou nível de Negócios), o mestre pode alterar o resultado entre sucesso e falha depois da rolagem. A correção adiciona ou remove a obra correspondente.

### Entre aventuras

**Iniciar nova aventura** cobra a manutenção (ou danifica um cômodo aleatório), lista as escolhas de início de aventura e rola a Ala dos Criados. Bases do tipo Empreendimento têm o botão de administração, que faz o teste e gera a renda em TO.

### Inventário

A aba **Inventário** guarda itens físicos e as moedas do Caixa do Grupo, com o peso de cada item (unidade/total). Arrastar um item da ficha de um personagem para a base pergunta quantas unidades guardar e as retira do personagem. Para tirar itens, use o botão de mão na linha do item: o mestre escolhe o morador e a quantidade; o jogador escolhe a quantidade (e o personagem, se tiver mais de um morando na base). Também dá para arrastar o item da base direto para a ficha de um morador. Quando o jogador não é dono da base, a transferência é feita pelo mestre conectado.

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

## Negócios

Novo tipo de ator "Negócio", com as regras de negócios do *Tormenta20: Fim dos Tempos* (Apêndices, pp. 309–312): níveis de 1 a 7, ativos, rendimentos e benefícios para o dono e o grupo. A ficha tem o mesmo visual e as mesmas facilidades das Bases.

### Frequentadores

Arraste o personagem do dono (e os dos demais jogadores) para a ficha do negócio, ou use o seletor da aba **Frequentadores**. O primeiro personagem adicionado vira o dono (indicado por um ícone de coroa) — é ele quem recebe os rendimentos. Os benefícios dos ativos viram Efeitos Ativos na ficha de cada frequentador. Quando alguém ficar longe do negócio por muito tempo (30 dias ou uma aventura inteira), é só desligar o interruptor dele. Cada frequentador também pode ligar ou desligar benefícios individualmente, e a lista avisa quando um bônus é do mesmo tipo de um que já vem de uma base ou domínio (lembrete: benefícios de estruturas não se acumulam).

### Criar e crescer

Na aba **Negócio**, informe o ramo e a localização e clique em **Criar negócio**. Depois, **Aumentar nível** cobra conforme indicado no suplemento. Estúdio e Escritório já são descontados automaticamente, e o custo pode sair do caixa do negócio ou do bolso dos personagens. Ao subir de nível, o catálogo de ativos abre para você escolher o novo ativo.

### Ativos

O catálogo traz todos os 45 ativos do livro, com os pré-requisitos (nível e outros ativos) conferidos na hora. Ativos com bônus de ficha são aplicados sozinhos (Botica, Clínica, Livraria, Logística, Alfaiataria, Salão de Marah e outros). Altar e Círculo de Poder só valem para conjuradores divinos e arcanos, respectivamente. Dojo, Ginásio, Pátio de Treinamento, Integração, Plano de Carreira e Jardim aparecem como opções na janela de rolagem. Ativos com escolha (Propaganda, Pátio de Treinamento, Arena…) têm um botão de engrenagem, e a Espionagem Industrial fornece os benefícios do ativo espionado, que pode ser trocado uma vez por mês ou aventura. Se o nível do negócio cair, os ativos acima do limite param de funcionar até o negócio voltar a ter espaço.

### Mês ou aventura

A aba **Mês/Aventura** avança o contador, lista as escolhas do período (Ourivesaria, Creche…) e coleta os rendimentos como descrito no suplemento. O dinheiro pode ir para o caixa do negócio ou direto para a carteira do dono. Negócios com **Cassino** têm o botão de aposta (com controle de dívida), e os com **Mercado Multinivelado** registram os NPCs recrutados e calculam a comissão.

### Estoque, diário e homebrews

O negócio tem estoque de itens e moedas próprio (com histórico de movimentações), diário com história, empregados e anotações, e permite criar ativos personalizados (★) com pré-requisitos, lembretes e Efeitos Ativos.

## Detalhes adicionais

- A sincronização dos efeitos com moradores, regente e frequentadores é automática por padrão em cada subsistema (configurável separadamente) e pode ser disparada manualmente; ao remover um morador ou frequentador, ou excluir a base, o domínio ou o negócio, os efeitos são limpos das fichas correspondentes.
- **Testes na tela do jogador:** quando o mestre dispara uma ação de Base, Negócio ou Domínio usando o personagem de um jogador conectado, o teste aparece na tela desse jogador ("Fulano vai realizar a ação…"), com a perícia escolhida pelo mestre já selecionada, e segue para a janela de uso normal do sistema. Sem o jogador conectado, o mestre rola como antes.
- A função de **Negócios** está em fase de testes; um aviso é exibido ao criar um negócio.
- Os testes de perícia de Domínios abrem a janela de configuração de uso do próprio sistema (bônus situacional, 2d20, modo de rolagem); cancelar a janela cancela a ação sem gastar nada, e Shift pula a janela.
- Com o **t20-hayd-ui** ativo, cada ficha de Base ou Domínio pode usar cor automática, a cor padrão do mundo ou uma cor de destaque personalizada individualmente pelo botão de paleta no cabeçalho.
- API para macros em `game.modules.get("t20-hayd-bases-e-dominios").api`:
  - `api.bases`: `catalogo`, `acoes`, `sincronizarEfeitos`, `removerEfeitos`, `montarEfeitosPara`, `obterMorador`
  - `api.dominios`: `catalogo`, `acoes`, `sincronizarEfeitos`, `removerEfeitos`, `obterRegente`, `criarTabelas`
  - `api.negocios`: `catalogo`, `acoes`, `sincronizarEfeitos`, `removerEfeitos`, `montarEfeitosPara`, `obterFrequentador`

---

## ❤️ Apoio e Comissões

Este módulo é totalmente gratuito. Se você gosta de usá-lo e quiser apoiar seu desenvolvimento, qualquer contribuição é muito bem-vinda!

### ☕ Ko-fi

Você pode apoiar meu trabalho pelo Ko-fi:

[![Apoie no Ko-fi](https://img.shields.io/badge/Apoie_no_Ko--fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/haydgi)

Ao apoiar pelo Ko-fi, você também pode deixar uma mensagem com um pedido ou sugestão de automação para Foundry VTT que gostaria de ver. Esses pedidos podem servir de inspiração para futuras funcionalidades, automações ou módulos.

### 🇧🇷 Pix

Se preferir, você também pode apoiar diretamente via Pix.

**Chave Pix aleatória:**

`a8baae96-f4d1-48a5-af25-45bf419fb0fb`

<p align="center">
  <img src="assets/qrcode.png" alt="QR Code Pix" width="220">
</p>

### 🛠️ Comissões para Foundry VTT

Também aceito comissões para desenvolvimento no Foundry VTT, incluindo a implementação de **módulos completos de aventuras**, respeitando os direitos e licenças dos materiais utilizados, com cenas, atores, itens, diários, automações e outros conteúdos necessários para deixar a aventura pronta para uso no Foundry, além de módulos específicos para Tormenta20 e outros sistemas.

Se tiver interesse em contratar uma comissão, você pode entrar em contato comigo pelo Discord `xddyahaha` para conversarmos sobre o projeto e seu escopo.

<p align="center">
  <sub>Todo apoio é opcional e ajuda a continuar desenvolvendo e mantendo meus módulos para Foundry VTT. ❤️</sub>
</p>

## Créditos

Ícones de Bases e Domínios fornecidos por [Game-icons.net](https://game-icons.net/).

## Aviso

Módulo não oficial, criado por fã, sem afiliação com a Jambô Editora ou com os autores de Tormenta20.
