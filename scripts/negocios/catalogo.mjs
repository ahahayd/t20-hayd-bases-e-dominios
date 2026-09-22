/**
 * t20-hayd-bases-e-dominios | negocios/catalogo.mjs
 * Dados das regras de Negócios — Tormenta20: Fim dos Tempos, Apêndices
 * (pp. 309–312).
 *
 * Os caminhos de Efeitos Ativos seguem os mesmos das Bases (veja
 * bases/catalogo.mjs). Efeitos de uso (efeitosUso) viram opções na janela
 * de rolagem do sistema, como nas Bases.
 */
import { MODULO, MODOS_EFEITO, labelPericia, temaHayd, corDestaqueAtor } from "../bases/catalogo.mjs";

export { MODULO, MODOS_EFEITO, labelPericia, temaHayd, corDestaqueAtor };

export const TIPO_NEGOCIO = `${MODULO}.negocio`;

const { ADD } = MODOS_EFEITO;

function fx(changes, extra = {}) {
  return { changes, ...extra };
}

const pericia = (sigla, valor) => ({ key: `system.pericias.${sigla}.bonus`, mode: ADD, value: String(valor) });

/* ================================================================== */
/* Níveis de negócio                                                  */
/* ================================================================== */

export const NIVEL_MAXIMO = 7;
export const CD_FUNDACAO = 20;
export const CUSTO_FUNDACAO = 1000;

/** Porte descritivo do negócio conforme o nível. */
export function categoriaNivel(nivel) {
  if (nivel <= 0) return { nome: "Não fundado", desc: "O negócio ainda precisa ser criado (1 mês, T$ 1.000 e teste CD 20)." };
  if (nivel <= 2) return { nome: "Pequeno", desc: "Poucos empregados e mercadorias baratas, como uma pequena oficina ou uma tenda de comidas." };
  if (nivel <= 5) return { nome: "Estabelecido", desc: "Vários empregados ou mercadorias valiosas, como uma taverna, um estábulo ou um bazar." };
  return { nome: "Proeminente", desc: "Muitos empregados e mercadorias caras, como um empório abastecido por caravanas inteiras." };
}

export const PERICIAS_NEGOCIO = ["nobr", "ofic"];

/* ================================================================== */
/* Ativos                                                             */
/* ================================================================== */

/*
 * Campos:
 *  - prereqNivel / prereqAtivos: pré-requisitos
 *  - efeito: Efeito Ativo passivo · efeitosUso: opções da janela de rolagem
 *  - escolha: "social" (Diplomacia/Enganação) · "arma" (nome da arma)
 *             "texto" (anotação livre) · "ativo" (Espionagem Industrial)
 *  - conjurador: "arcano" | "divino" — o efeito só vale para esse conjurador
 *  - especial: tratado nas regras do negócio (custos, CD, ações)
 *  - porAventura: lembrete exibido a cada novo mês/aventura
 *  - manual: benefício narrativo ou aplicado à mão
 */
export const ATIVOS = {
  "academia": { nome: "Academia", prereqNivel: 7,
    beneficio: "Você recebe um parceiro veterano humanoide de um tipo a sua escolha (exceto montaria). Se o parceiro morrer, é substituído na próxima vez que você passar na Academia",
    escolha: "texto", rotuloEscolha: "Tipo do parceiro veterano", manual: true },
  "alfaiataria": { nome: "Alfaiataria", prereqAtivos: ["oficina"],
    beneficio: "Você pode se beneficiar de um item vestido adicional",
    efeito: fx([{ key: "system.equipamentos.limiteVestido", mode: ADD, value: "1" }]) },
  "alojamentos": { nome: "Alojamentos",
    beneficio: "Transforma as condições de descanso no negócio em confortáveis",
    manual: true },
  "altar": { nome: "Altar",
    beneficio: "Você recebe +2 pontos de mana, mas apenas se for um conjurador divino",
    conjurador: "divino",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "2" }]),
    escolha: "texto", rotuloEscolha: "Divindade(s) do altar" },
  "arena": { nome: "Arena",
    beneficio: "Você recebe proficiência em uma arma marcial a sua escolha. Se já for proficiente com armas marciais, pode escolher uma arma exótica",
    escolha: "arma", rotuloEscolha: "Arma da proficiência", manual: true,
    nota: "Marque a proficiência na ficha do personagem." },
  "bazar": { nome: "Bazar",
    beneficio: "Ao comprar ou vender itens mundanos (não superiores e não mágicos), você muda o preço em 10% a seu favor",
    manual: true },
  "botica": { nome: "Botica",
    beneficio: "Você recebe +1 em Fortitude",
    efeito: fx([pericia("fort", 1)]) },
  "cassino": { nome: "Cassino", especial: "cassino",
    beneficio: "Você recebe +1 em Jogatina. Uma vez por aventura (ou mês), você pode rolar um dado: par, recebe TO 10 × nível² do negócio; ímpar, perde metade dessa quantia (fica devendo se não puder pagar)",
    efeito: fx([pericia("joga", 1)]),
    porAventura: "Cassino: uma aposta disponível (aba Mês/Aventura)" },
  "centro-de-pesquisa": { nome: "Centro de Pesquisa", prereqAtivos: ["oficina"],
    beneficio: "A quantidade de engenhocas que você pode manter aumenta em +1",
    manual: true },
  "circulo-de-poder": { nome: "Círculo de Poder",
    beneficio: "Você recebe +2 pontos de mana, mas apenas se for um conjurador arcano",
    conjurador: "arcano",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "2" }]) },
  "clinica": { nome: "Clínica",
    beneficio: "Você recebe +3 PV",
    efeito: fx([{ key: "system.attributes.pv.bonus.total", mode: ADD, value: "3" }]) },
  "cocheira": { nome: "Cocheira",
    beneficio: "Você pode ter até um parceiro montaria que não conta em seu limite de parceiros",
    manual: true },
  "conservatorio": { nome: "Conservatório",
    beneficio: "Você pode usar Atuação no lugar de Diplomacia",
    manual: true },
  "cozinha": { nome: "Cozinha",
    beneficio: "Os bônus em perícias fornecidos pelos alimentos que você cozinha aumentam em +1",
    manual: true },
  "creche": { nome: "Creche",
    beneficio: "Uma vez por aventura (ou mês), você pode sofrer um efeito nocivo no lugar de um aliado adjacente",
    manual: true,
    porAventura: "Creche: cada frequentador pode sofrer um efeito nocivo no lugar de um aliado adjacente" },
  "dojo": { nome: "Dojo",
    beneficio: "Você recebe +1 em testes de ataque com ataques desarmados ou armas naturais",
    efeitosUso: [{ escopos: ["ataque"], changes: [{ key: "ataque", mode: ADD, value: "1" }],
      desc: "+1 no teste de ataque desarmado ou com arma natural" }] },
  "emporio": { nome: "Empório", prereqAtivos: ["bazar"], especial: "emporio",
    beneficio: "O negócio passa a render T$ 100 × seu nível por mês a mais (ou o resultado do teste de Ofício ou Nobreza × 10 × o nível do negócio)" },
  "escritorio": { nome: "Escritório", especial: "escritorio",
    beneficio: "O custo em tibares para aumentar o nível do negócio é metade do normal" },
  "espionagem-industrial": { nome: "Espionagem Industrial", prereqNivel: 3, escolha: "ativo",
    beneficio: "Escolha um ativo que o negócio não tenha, mas cujos pré-requisitos cumpra: o negócio fornece os benefícios desse ativo. Uma vez por aventura (ou mês), você pode trocar o ativo escolhido",
    porAventura: "Espionagem Industrial: o ativo espionado pode ser trocado" },
  "estagiarios": { nome: "Estagiários", prereqAtivos: ["oficina"],
    beneficio: "Ao fabricar um item não consumível, você pode sofrer –5 no teste para fabricar dois itens da mesma categoria, pagando o custo de ambos",
    manual: true },
  "estudio": { nome: "Estúdio", especial: "estudio",
    beneficio: "A CD do teste de Ofício ou Nobreza para aumentar o nível do negócio diminui em –5" },
  "fachada": { nome: "Fachada",
    beneficio: "Você recebe +1 em Furtividade e pode conduzir atividades ilegais no negócio sem que as autoridades venham bater à porta",
    efeito: fx([pericia("furt", 1)], { nota: "A critério do mestre, também anula a \"má fama\" de frequentar o negócio." }) },
  "forjaria": { nome: "Forjaria", prereqAtivos: ["oficina"],
    beneficio: "Você recebe 20% de desconto para comprar ou fabricar itens superiores",
    manual: true },
  "fortificacao": { nome: "Fortificação",
    beneficio: "Caso o negócio seja atacado, seus defensores recebem +2 na Defesa e em testes de resistência",
    manual: true },
  "galeria-de-arte": { nome: "Galeria de Arte",
    beneficio: "Você pode substituir testes de Atuação por testes de Enganação",
    manual: true },
  "ginasio": { nome: "Ginásio",
    beneficio: "Você recebe +1 em rolagens de dano com ataques desarmados e armas naturais",
    efeitosUso: [{ escopos: ["ataque"], changes: [{ key: "dano", mode: ADD, value: "1" }],
      desc: "+1 no dano de ataque desarmado ou com arma natural" }] },
  "guilda-de-aventureiros": { nome: "Guilda de Aventureiros", prereqAtivos: ["salao-comunal"],
    beneficio: "Toda XP que você recebe aumenta em +10%. Com a regra de avanço por marcos, você recebe +2 PV e +2 PM a cada novo patamar que alcança",
    manual: true },
  "integracao": { nome: "Integração", prereqNivel: 3,
    beneficio: "Você recebe +2 em testes de treinamento",
    efeitosUso: [{ escopos: ["pericia"], changes: [{ key: "roll", mode: ADD, value: "2" }],
      desc: "+2 em testes de treinamento" }] },
  "jardim": { nome: "Jardim",
    beneficio: "O custo da habilidade Forma Selvagem diminui em –1 PM",
    efeitosUso: [{ escopos: ["poder"], items: "Forma Selvagem", custo: "-1", changes: [],
      desc: "Forma Selvagem custa –1 PM" }] },
  "laboratorio-alquimico": { nome: "Laboratório Alquímico", prereqAtivos: ["oficina"],
    beneficio: "Os efeitos de seus preparados alquímicos aumentam em um dado (fogo alquímico causa 2d6 em vez de 1d6)",
    manual: true },
  "laboratorio-secreto": { nome: "Laboratório Secreto", prereqNivel: 5, prereqAtivos: ["fachada"],
    beneficio: "Você recebe um poder da Tormenta (que provoca perda de Carisma como normal)",
    escolha: "texto", rotuloEscolha: "Poder da Tormenta", manual: true },
  "livraria": { nome: "Livraria",
    beneficio: "Você recebe +1 em Conhecimento",
    efeito: fx([pericia("conh", 1)]) },
  "logistica": { nome: "Logística",
    beneficio: "Seu limite de carga aumenta em 5 espaços",
    efeito: fx([{ key: "system.attributes.carga.bonus", mode: ADD, value: "5" }]) },
  "mercado-multinivelado": { nome: "Mercado Multinivelado", prereqNivel: 3, especial: "mercado",
    beneficio: "A cada aventura (ou mês) em que recrutar um NPC com nome, você recebe T$ nível × 100 × o número de NPCs recrutados (multiplicador limitado ao nível do negócio)",
    porAventura: "Mercado Multinivelado: recrute um NPC com nome para receber a comissão" },
  "oficina": { nome: "Oficina",
    beneficio: "Você recebe +1 em Ofício",
    efeito: fx([pericia("ofic", 1)]) },
  "ourivesaria": { nome: "Ourivesaria",
    beneficio: "No início de cada aventura (ou mês), um de seus itens recebe os benefícios das melhorias banhado a ouro ou cravejado de gemas (não conta no limite de melhorias)",
    manual: true,
    porAventura: "Ourivesaria: cada frequentador escolhe um item para receber banhado a ouro ou cravejado de gemas" },
  "palco": { nome: "Palco",
    beneficio: "Você pode usar poderes de Música gastando uma ação de movimento (em vez de ação padrão)",
    manual: true },
  "patio-de-treinamento": { nome: "Pátio de Treinamento", escolha: "arma", rotuloEscolha: "Arma escolhida",
    beneficio: "Escolha uma arma. Você recebe +1 em testes de ataque com a arma escolhida",
    efeitosUso: [{ escopos: ["ataque"], changes: [{ key: "ataque", mode: ADD, value: "1" }],
      desc: "+1 no teste de ataque com a arma escolhida", itemsDaEscolha: true }] },
  "plano-de-carreira": { nome: "Plano de Carreira", prereqNivel: 3,
    beneficio: "Você recebe +2 em testes de buscas",
    efeitosUso: [{ escopos: ["pericia"], changes: [{ key: "roll", mode: ADD, value: "2" }],
      desc: "+2 em testes de buscas" }] },
  "propaganda": { nome: "Propaganda", prereqNivel: 2, escolha: "social",
    beneficio: "Você recebe +1 em Diplomacia ou Enganação",
    efeito: { escolha: "social" } },
  "salao-comunal": { nome: "Salão Comunal",
    beneficio: "Você pode usar o poder Mestre dos Sussurros. Se já o possui, soma o nível do negócio nos testes de perícia usando o poder",
    manual: true },
  "salao-de-baile": { nome: "Salão de Baile",
    beneficio: "Você recebe +1 em Nobreza",
    efeito: fx([pericia("nobr", 1)]) },
  "salao-de-marah": { nome: "Salão de Marah",
    beneficio: "Seu total de PM aumenta em +1 por patamar",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "@patamar" }]) },
  "santuario": { nome: "Santuário", prereqAtivos: ["altar"],
    beneficio: "Se for devoto da divindade à qual o santuário é dedicado, você aprende uma magia divina adicional de qualquer círculo que possa lançar",
    escolha: "texto", rotuloEscolha: "Divindade do santuário", manual: true },
  "torre-arcana": { nome: "Torre Arcana", prereqAtivos: ["circulo-de-poder"],
    beneficio: "Você aprende uma magia arcana adicional de qualquer círculo que possa lançar",
    manual: true }
};

export const OPCOES_SOCIAL = ["dipl", "enga"];

/** Caminhos comuns para o construtor de homebrews (mesmos das Bases). */
export { CAMINHOS_SUGERIDOS } from "../bases/catalogo.mjs";

/* ================================================================== */
/* Acesso unificado (catálogo + homebrews do negócio)                 */
/* ================================================================== */

const _cacheAtivos = new WeakMap();

export function obterAtivos(negocio) {
  const homebrews = negocio?.system?.homebrew?.ativos;
  if (!homebrews?.length) return ATIVOS;
  let mesclado = _cacheAtivos.get(homebrews);
  if (!mesclado) {
    mesclado = { ...ATIVOS };
    for (const hb of homebrews) mesclado[hb.key] = hb;
    _cacheAtivos.set(homebrews, mesclado);
  }
  return mesclado;
}

/** Texto curto da escolha feita em um ativo (para cartões e efeitos). */
export function rotuloEscolha(def, entrada, catalogo) {
  if (!def?.escolha || !entrada?.escolha) return null;
  if (def.escolha === "social") return labelPericia(entrada.escolha);
  if (def.escolha === "ativo") {
    const alvo = catalogo?.[entrada.escolha];
    if (!alvo) return null;
    const sub = rotuloEscolha(alvo, { escolha: entrada.escolhaSub }, catalogo);
    return `Espiona: ${alvo.nome}${sub ? ` (${sub})` : ""}`;
  }
  return String(entrada.escolha);
}

/**
 * Tipo de conjurador de um personagem: pelas classes (nomes) e pelas
 * magias que conhece. Universais não definem o tipo.
 */
const CLASSES_ARCANAS = /arcanista|bardo|bruxo|feiticeir|mago/i;
const CLASSES_DIVINAS = /cl[eé]rig|druida|frade|sacerdo/i;

export function tipoConjurador(ator) {
  const tipos = { arcano: false, divino: false };
  if (!ator?.items) return tipos;
  for (const item of ator.items) {
    if (item.type === "classe") {
      if (CLASSES_ARCANAS.test(item.name)) tipos.arcano = true;
      if (CLASSES_DIVINAS.test(item.name)) tipos.divino = true;
    } else if (item.type === "magia") {
      if (item.system?.tipo === "arc") tipos.arcano = true;
      if (item.system?.tipo === "div") tipos.divino = true;
    }
  }
  return tipos;
}
