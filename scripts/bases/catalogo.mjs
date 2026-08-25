/**
 * tormenta20-bases | catalogo.mjs
 * Dados das regras de Bases — Heróis de Arton, capítulo 3 (pp. 244-251).
 *
 * Caminhos de Efeitos Ativos usam as variáveis oficiais do sistema:
 *  - Perícias (somar/subtrair): system.pericias.X.bonus
 *  - PV/PM máximos: system.attributes.pv.bonus.total / system.attributes.pm.bonus.total
 *  - Defesa: system.attributes.defesa.bonus
 *  - Carga: system.attributes.carga.bonus
 *  - Itens vestidos: system.equipamentos.limiteVestido
 *  - Deslocamento: system.attributes.movement.walk
 *  - Redução de dano: system.tracos.resistencias.X.bonus
 *  - Modificadores gerais (arrays de strings): system.modificadores.*
 */

export const MODULO = "t20-hayd-bases-e-dominios";

/* ================================================================== */
/* Tema (integração com o t20-hayd-ui)                                */
/* ================================================================== */

/** O tema dark só é aplicado com o módulo t20-hayd-ui ativo. */
export function temaHayd() {
  return game.modules?.get("t20-hayd-ui")?.active === true;
}

/** Cor padrão do t20-hayd-ui (alterável nas configurações do mundo). */
export function corPadraoTema() {
  try {
    const v = game.settings.get("t20-hayd-ui", "corPadrao");
    if (typeof v === "string" && v) return v;
  } catch (_err) { /* módulo/configuração ausente */ }
  return "#960505";
}

function corCSSDoUsuario(user) {
  const c = user?.color;
  if (c == null) return null;
  if (typeof c === "string") return c;
  if (typeof c.css === "string") return c.css;
  const s = c.toString?.();
  return (typeof s === "string" && s.startsWith("#")) ? s : null;
}

/**
 * Cor de destaque de um ator seguindo as regras do t20-hayd-ui:
 * modo "padrao" → cor padrão configurada; senão, cor do primeiro dono
 * jogador (ordem alfabética); sem dono jogador → cor padrão.
 */
export function corDestaqueAtor(ator) {
  if (!ator) return corPadraoTema();
  const bruto = ator.getFlag?.("t20-hayd-ui", "configCor");
  const modo = (bruto && typeof bruto === "object")
    ? (bruto.mode === "custom" ? "padrao" : "auto")
    : (bruto ?? "auto");
  if (modo !== "padrao") {
    const donos = game.users
      .filter(u => !u.isGM && ator.testUserPermission?.(u, "OWNER"))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
    for (const dono of donos) {
      const c = corCSSDoUsuario(dono);
      if (c) return c;
    }
  }
  return corPadraoTema();
}

const CUSTOM = 0;
const ADD = 2;
const OVERRIDE = 5;
export const MODOS_EFEITO = { ADD, OVERRIDE, CUSTOM };

/*
 * Efeitos de uso (efeitosUso / efeitosUsoPorLocal / efeitosUsoSuite):
 * viram Efeitos Ativos com flag tormenta20.onuse nos moradores e aparecem
 * como opção na janela de rolagem do sistema (desmarcados por padrão).
 *  - escopos: atributo, pericia, ataque, magia, poder, consumivel, equipamento
 *  - items: restringe por nome do item/perícia (separar com ";")
 *  - custo: ajuste de PM ao aplicar (ex.: "-1")
 *  - chaves de change: "roll" (testes), "ataque", "dano", "cd";
 *    modo CUSTOM aceita "d*1" (+1 por dado) e "kh" (rola 2d20, usa o melhor)
 */

/** Atalho para definir o bloco de efeito de um item do catálogo. */
function fx(changes, extra = {}) {
  return { changes, ...extra };
}

/* ================================================================== */
/* Tabela 3-6: Portes                                                 */
/* ================================================================== */

export const ORDEM_PORTES = ["minima", "modesta", "basica", "formidavel", "grandiosa", "suprema"];

export const PORTES = {
  minima:     { nome: "Mínima",     custo: 1000,  manutencao: 100,  comodos: 0,
    exemplos: "quarto em uma estalagem, tenda reforçada, carroça coberta" },
  modesta:    { nome: "Modesta",    custo: 3000,  manutencao: 300,  comodos: 3,
    exemplos: "casebre, gruta, barcaça" },
  basica:     { nome: "Básica",     custo: 6000,  manutencao: 600,  comodos: 6,
    exemplos: "casa, torre pequena, caverna, veleiro" },
  formidavel: { nome: "Formidável", custo: 10000, manutencao: 1000, comodos: 9,
    exemplos: "casarão, torre média, complexo de cavernas, nau" },
  grandiosa:  { nome: "Grandiosa",  custo: 15000, manutencao: 1500, comodos: 12,
    exemplos: "forte, torre grande, galeão" },
  suprema:    { nome: "Suprema",    custo: 21000, manutencao: 2100, comodos: 15,
    exemplos: "castelo, cidadela" }
};

export function rankPorte(porte) {
  return ORDEM_PORTES.indexOf(porte);
}

/* ================================================================== */
/* Tipos de Base                                                      */
/* ================================================================== */

export const TIPOS = {
  "centro-de-poder": {
    nome: "Centro de Poder",
    desc: "Construída sobre um centro de energias mágicas, como um bosque feérico, solo sagrado ou intersecção de linhas energéticas.",
    beneficio: "Os residentes recebem +1 PM",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "1" }])
  },
  "empreendimento": {
    nome: "Empreendimento",
    desc: "A base é parte de um negócio. Uma vez a cada intervalo entre aventuras, um residente pode fazer um teste de Inteligência com bônus igual ao número de cômodos que a base pode ter; a base rende tibares de ouro iguais ao resultado (o dobro se o residente gastar sua ação administrando o negócio).",
    beneficio: "Rende TO iguais ao teste de Int + cômodos possíveis (2× se administrado)",
    efeito: null
  },
  "esconderijo": {
    nome: "Esconderijo",
    desc: "A base está em um local oculto ou disfarçado, longe de olhos indiscretos.",
    beneficio: "Os residentes recebem +1 em testes de resistência",
    efeito: fx([{ key: "system.modificadores.pericias.resistencia", mode: ADD, value: "+1" }])
  },
  "fortificacao": {
    nome: "Fortificação",
    desc: "Uma estrutura fortificada, como uma torre ou forte, ou localizada em ponto de difícil acesso.",
    beneficio: "A base recebe +5 em segurança e os residentes recebem +1 na Defesa",
    seguranca: 5,
    efeito: fx([{ key: "system.attributes.defesa.bonus", mode: ADD, value: "1" }])
  },
  "movel": {
    nome: "Móvel",
    desc: "Um veículo terrestre (deslocamento 12m) ou aquático (natação 12m), como carroça ou navio. Veículos aquáticos não podem submergir, a menos que tenham o Domo Protetor.",
    beneficio: "Os residentes recebem +1,5m de deslocamento; a base pode ser movida",
    efeito: fx([{ key: "system.attributes.movement.walk", mode: ADD, value: "1.5" }])
  },
  "residencia": {
    nome: "Residência",
    desc: "Um local confortável e aconchegante, onde os aventureiros podem descansar e relaxar.",
    beneficio: "Cada residente recebe +3 PV e, 1×/aventura, os benefícios de um prato especial",
    efeito: fx([{ key: "system.attributes.pv.bonus.total", mode: ADD, value: "3" }],
      { nota: "O prato especial (1×/aventura) é aplicado manualmente." })
  }
};

/* ================================================================== */
/* Tabela 3-7: Cômodos                                                */
/*  prereqPorte: rank mínimo em ORDEM_PORTES                          */
/*  capacidade: quantas mobílias o cômodo comporta (padrão 1)         */
/* ================================================================== */

export const COMODOS = {
  "adega": { nome: "Adega",
    beneficio: "O efeito de qualquer preparado ou poção ingerido pelos residentes aumenta em +1 por dado",
    efeitosUso: [{ escopos: ["consumivel"],
      changes: [{ key: "dano", mode: CUSTOM, value: "d*1" }],
      desc: "Ao ingerir um preparado ou poção: o efeito aumenta em +1 por dado" }] },
  "ala-dos-criados": { nome: "Ala dos Criados", prereqPorte: "formidavel",
    beneficio: "No início de cada aventura, cada residente recebe 1d4 PM temporários por patamar (duram até serem gastos)",
    porAventura: "Rolar 1d4 PM temporários por patamar para cada residente", manual: true },
  "armorial": { nome: "Armorial",
    beneficio: "Fornece proficiência com um item a sua escolha (pode trocar no início de cada aventura)",
    porAventura: "Escolher a proficiência do Armorial", manual: true },
  "biblioteca": { nome: "Biblioteca",
    beneficio: "Os residentes recebem +1 em Conhecimento",
    efeito: fx([{ key: "system.pericias.conh.bonus", mode: ADD, value: "1" }]) },
  "calabouco": { nome: "Calabouço",
    beneficio: "Os residentes recebem +1 em Intimidação e na CD de seus efeitos de medo",
    efeito: fx([{ key: "system.pericias.inti.bonus", mode: ADD, value: "1" }],
      { nota: "O +1 na CD de efeitos de medo aparece como efeito de uso na janela de rolagem." }),
    efeitosUso: [{ nome: "Calabouço (CD de medo)", escopos: ["magia", "poder"],
      changes: [{ key: "cd", mode: ADD, value: "1" }],
      desc: "+1 na CD dos seus efeitos de medo" }] },
  "camara-de-meditacao": { nome: "Câmara de Meditação",
    beneficio: "Os residentes recebem +1 em Vontade",
    efeito: fx([{ key: "system.pericias.vont.bonus", mode: ADD, value: "1" }]) },
  "casa-da-guarda": { nome: "Casa da Guarda", prereqPorte: "formidavel", prereqComodos: ["guarita"],
    beneficio: "A guarita passa a fornecer +4 de segurança adicionais e os guardas podem acompanhar o grupo como um pelotão de infantaria veterano (parceiro capanga)",
    seguranca: 4, manual: true },
  "chapelaria": { nome: "Chapelaria", prereqPorte: "formidavel",
    beneficio: "Os residentes podem se beneficiar de um item vestido adicional",
    efeito: fx([{ key: "system.equipamentos.limiteVestido", mode: ADD, value: "1" }]) },
  "cozinha": { nome: "Cozinha",
    beneficio: "No início de cada aventura, dois pratos especiais embalados \"para viagem\" (0,5 espaço cada, duram até o fim da aventura)",
    porAventura: "Escolher os dois pratos para viagem da Cozinha", manual: true },
  "despensa": { nome: "Despensa",
    beneficio: "O limite de carga dos residentes aumenta em 2 espaços",
    efeito: fx([{ key: "system.attributes.carga.bonus", mode: ADD, value: "2" }]) },
  "domo-protetor": { nome: "Domo Protetor", prereqComodos: ["gabinete-mistico"],
    beneficio: "A base recebe +2 na segurança e, se for móvel, pode entrar em ambientes inóspitos (como debaixo d'água) sem colocar seus ocupantes em risco",
    seguranca: 2, manual: true },
  "enfermaria": { nome: "Enfermaria",
    beneficio: "Os residentes recebem +1 em Cura e em testes para estancar sangramentos ou testes de morte",
    efeito: fx([{ key: "system.pericias.cura.bonus", mode: ADD, value: "1" }],
      { nota: "O +1 para estancar sangramento/teste de morte aparece como efeito de uso nos testes de atributo." }),
    efeitosUso: [{ nome: "Enfermaria (atributo)", escopos: ["atributo"],
      changes: [{ key: "roll", mode: ADD, value: "1" }],
      desc: "+1 em testes de atributo para estancar sangramento ou testes de morte" }] },
  "estabulo": { nome: "Estábulo",
    beneficio: "Cada parceiro animal ou monstro aumenta um bônus fornecido por ele em +1; montarias podem, em vez disso, receber +3m de deslocamento",
    manual: true },
  "estufa": { nome: "Estufa",
    beneficio: "Fornece +1 na CD de todos os seus preparados e poções",
    efeitosUso: [{ escopos: ["consumivel"],
      changes: [{ key: "cd", mode: ADD, value: "1" }],
      desc: "+1 na CD dos seus preparados e poções" }] },
  "forjaria": { nome: "Forjaria", prereqComodos: ["oficina-de-trabalho"],
    beneficio: "Os residentes recebem +1 nas rolagens de dano com uma arma empunhada a sua escolha (podem trocar no início de cada aventura)",
    porAventura: "Escolher a arma da Forjaria (+1 de dano)",
    efeitosUso: [{ escopos: ["ataque"],
      changes: [{ key: "dano", mode: ADD, value: "1" }],
      desc: "+1 nas rolagens de dano com a arma escolhida no início da aventura" }] },
  "gabinete-mistico": { nome: "Gabinete Místico",
    beneficio: "Os residentes recebem +1 em Misticismo",
    efeito: fx([{ key: "system.pericias.mist.bonus", mode: ADD, value: "1" }]) },
  "ginasio": { nome: "Ginásio",
    beneficio: "Os residentes recebem +1 em Atletismo e nas rolagens de dano com ataques desarmados e armas naturais",
    efeito: fx([{ key: "system.pericias.atle.bonus", mode: ADD, value: "1" }],
      { nota: "O +1 no dano desarmado/armas naturais aparece como efeito de uso na janela de rolagem." }),
    efeitosUso: [{ nome: "Ginásio (dano)", escopos: ["ataque"],
      changes: [{ key: "dano", mode: ADD, value: "1" }],
      desc: "+1 nas rolagens de dano com ataques desarmados e armas naturais" }] },
  "guarita": { nome: "Guarita",
    beneficio: "A base recebe +4 em segurança",
    seguranca: 4 },
  "jardim-ornamental": { nome: "Jardim Ornamental",
    beneficio: "Os residentes recebem +1 em Enganação",
    efeito: fx([{ key: "system.pericias.enga.bonus", mode: ADD, value: "1" }]) },
  "laboratorio-arcano": { nome: "Laboratório Arcano", prereqComodos: ["gabinete-mistico"],
    beneficio: "No início de cada aventura, cada residente escolhe uma magia arcana; até o fim da aventura, o custo dela diminui em –1 PM",
    porAventura: "Escolher a magia arcana com custo –1 PM (Laboratório Arcano)",
    efeitosUso: [{ escopos: ["magia"], custo: "-1", changes: [],
      desc: "Magia arcana escolhida no início da aventura: custo –1 PM (mínimo 1)" }] },
  "lavanderia": { nome: "Lavanderia",
    beneficio: "Cada residente escolhe um item de vestuário que modifique uma perícia; ele fornece +1 adicional nessa perícia (troca no início de cada aventura)",
    porAventura: "Escolher o item de vestuário da Lavanderia", manual: true },
  "memorial": { nome: "Memorial",
    beneficio: "Caso um residente morra, o próximo personagem do mesmo jogador recebe +1 em um atributo",
    manual: true },
  "observatorio": { nome: "Observatório",
    beneficio: "Se for treinado em Misticismo, 1×/aventura você pode rolar dois dados e escolher o melhor em um teste de perícia",
    efeitosUso: [{ escopos: ["pericia"],
      changes: [{ key: "roll", mode: CUSTOM, value: "kh" }],
      desc: "1×/aventura (requer treino em Misticismo): rola dois d20 e usa o melhor" }] },
  "oficina-de-trabalho": { nome: "Oficina de Trabalho",
    beneficio: "Cada residente recebe +1 em um Ofício a sua escolha (pode trocar no início de cada aventura)",
    efeito: fx([{ key: "system.pericias.ofic.bonus", mode: ADD, value: "1" }],
      { nota: "Vale para um Ofício escolhido pelo residente (troca a cada aventura)." }),
    porAventura: "Escolher o Ofício beneficiado pela Oficina" },
  "oratorio": { nome: "Oratório",
    beneficio: "Os residentes recebem +1 em Religião",
    efeito: fx([{ key: "system.pericias.reli.bonus", mode: ADD, value: "1" }]) },
  "patio-de-treinamento": { nome: "Pátio de Treinamento",
    beneficio: "Os residentes recebem +1 nos testes de ataque com uma arma a sua escolha (podem trocar no início de cada aventura)",
    porAventura: "Escolher a arma do Pátio de Treinamento (+1 em ataques)",
    efeitosUso: [{ escopos: ["ataque"],
      changes: [{ key: "ataque", mode: ADD, value: "1" }],
      desc: "+1 nos testes de ataque com a arma escolhida no início da aventura" }] },
  "quarto-do-capitao": { nome: "Quarto do Capitão", prereqComodos: ["casa-da-guarda"],
    beneficio: "A guarita fornece +2 de segurança adicionais (total +10) e o capitão conta como um parceiro veterano (atirador, combatente, fortão ou guardião, definido ao construir)",
    seguranca: 2, escolha: "capitao" },
  "sacada": { nome: "Sacada",
    beneficio: "Cada residente recebe +1 em Diplomacia",
    efeito: fx([{ key: "system.pericias.dipl.bonus", mode: ADD, value: "1" }]) },
  "sala-de-estar": { nome: "Sala de Estar",
    beneficio: "O coração da base: pode possuir e receber os benefícios de até três mobílias diferentes",
    capacidade: 3 },
  "sala-de-guerra": { nome: "Sala de Guerra",
    beneficio: "Os residentes recebem +1 em Guerra e Iniciativa",
    efeito: fx([
      { key: "system.pericias.guer.bonus", mode: ADD, value: "1" },
      { key: "system.pericias.inic.bonus", mode: ADD, value: "1" }
    ]) },
  "sala-de-jogos": { nome: "Sala de Jogos",
    beneficio: "Os residentes recebem +1 em Jogatina e recuperam 1 PM ao rolar um 1 natural em um teste relevante",
    efeito: fx([{ key: "system.pericias.joga.bonus", mode: ADD, value: "1" }],
      { nota: "A recuperação de 1 PM em resultados 1 naturais é aplicada manualmente." }) },
  "sala-de-mapas": { nome: "Sala de Mapas",
    beneficio: "Os residentes recebem +2 em testes de buscas e em perigos complexos relacionados a viagens",
    efeitosUso: [{ escopos: ["pericia"],
      changes: [{ key: "roll", mode: ADD, value: "2" }],
      desc: "+2 em testes de buscas e em perigos complexos relacionados a viagens" }] },
  "sala-de-perigo": { nome: "Sala de Perigo", prereqComodos: ["sistema-de-seguranca"],
    beneficio: "Os residentes recebem +2 em testes da ação treinamento",
    efeitosUso: [{ escopos: ["pericia"],
      changes: [{ key: "roll", mode: ADD, value: "2" }],
      desc: "+2 em testes da ação treinamento (entre aventuras)" }] },
  "sala-do-tesouro": { nome: "Sala do Tesouro",
    beneficio: "Rolagens de d% para definir tesouros aleatórios recebem +5%",
    manual: true },
  "salao-de-baile": { nome: "Salão de Baile",
    beneficio: "Os residentes recebem +1 em Nobreza",
    efeito: fx([{ key: "system.pericias.nobr.bonus", mode: ADD, value: "1" }]) },
  "sauna": { nome: "Sauna", prereqPorte: "formidavel",
    beneficio: "1×/aventura, ao fazer um teste de resistência, cada residente pode rolar dois dados e usar o melhor",
    efeitosUso: [{ escopos: ["pericia"], items: "Fortitude;Reflexos;Vontade",
      changes: [{ key: "roll", mode: CUSTOM, value: "kh" }],
      desc: "1×/aventura, em um teste de resistência: rola dois d20 e usa o melhor" }] },
  "sistema-de-seguranca": { nome: "Sistema de Segurança",
    beneficio: "A base recebe +4 de segurança e os residentes recebem +2 em testes de resistência contra armadilhas",
    seguranca: 4,
    nota: "O +2 contra armadilhas é aplicado manualmente." },
  "suite": { nome: "Suíte", prereqPorte: "basica", repetivel: true, escolha: "suite",
    beneficio: "Até dois residentes (que durmam juntos!) recebem +3 PV, e as condições de descanso na base se tornam confortáveis",
    nota: "Atribua os moradores da suíte pela engrenagem do cômodo." },
  "tabernaculo": { nome: "Tabernáculo", prereqComodos: ["oratorio"],
    beneficio: "No início de cada aventura, cada residente escolhe uma magia divina; até o fim da aventura, o custo dela diminui em –1 PM",
    porAventura: "Escolher a magia divina com custo –1 PM (Tabernáculo)",
    efeitosUso: [{ escopos: ["magia"], custo: "-1", changes: [],
      desc: "Magia divina escolhida no início da aventura: custo –1 PM (mínimo 1)" }] },
  "tablado": { nome: "Tablado",
    beneficio: "Os residentes recebem +1 em Atuação",
    efeito: fx([{ key: "system.pericias.atua.bonus", mode: ADD, value: "1" }]) },
  "vergel": { nome: "Vergel",
    beneficio: "Fornece +1 em Sobrevivência",
    efeito: fx([{ key: "system.pericias.sobr.bonus", mode: ADD, value: "1" }]) }
};

export const CUSTO_COMODO = 1000;

/* ================================================================== */
/* Tabela 3-8: Mobílias                                               */
/*  locais: null = qualquer cômodo · array = cômodos válidos ·        */
/*          "exterior" = não ocupa cômodo (gárgula)                   */
/* ================================================================== */

export const MOBILIAS = {
  "armadura-decorativa": { nome: "Armadura Decorativa", preco: 2000, locais: null,
    beneficio: "Os residentes recebem +1 na Defesa",
    efeito: fx([{ key: "system.attributes.defesa.bonus", mode: ADD, value: "1" }]) },
  "armario-de-remedios": { nome: "Armário de Remédios", preco: 2000, locais: ["enfermaria", "estufa"],
    beneficio: "Seus preparados e poções de cura recuperam +1 PV por dado",
    efeitosUso: [{ escopos: ["consumivel"],
      changes: [{ key: "dano", mode: CUSTOM, value: "d*1" }],
      desc: "Preparados e poções de cura: +1 PV por dado" }] },
  "banheira": { nome: "Banheira", preco: 300, locais: ["suite"],
    beneficio: "1×/aventura, os residentes que dormem na suíte podem rolar dois dados em um teste de Fortitude e usar o melhor",
    efeitosUsoSuite: [{ escopos: ["pericia"], items: "Fortitude",
      changes: [{ key: "roll", mode: CUSTOM, value: "kh" }],
      desc: "1×/aventura, em um teste de Fortitude: rola dois d20 e usa o melhor" }] },
  "bar": { nome: "Bar", preco: 1000, locais: ["sala-de-estar", "salao-de-baile", "sala-de-jogos"],
    beneficio: "Fornece +1 PM para os residentes",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "1" }]) },
  "bau-reforcado": { nome: "Baú Reforçado", preco: 300, locais: ["despensa"],
    beneficio: "Aumenta o bônus de limite de carga da despensa para 3 espaços",
    efeito: fx([{ key: "system.attributes.carga.bonus", mode: ADD, value: "1" }]) },
  "bigorna": { nome: "Bigorna", preco: 500, locais: ["oficina-de-trabalho", "forjaria"],
    beneficio: "Na oficina, aumenta o bônus em Ofício para +3; na forjaria, aumenta o bônus em dano para +2",
    efeitoPorLocal: {
      "oficina-de-trabalho": fx([{ key: "system.pericias.ofic.bonus", mode: ADD, value: "2" }]),
      "forjaria": { manual: true, nota: "O +1 adicional de dano aparece como efeito de uso (soma-se ao da Forjaria: total +2)." }
    },
    efeitosUsoPorLocal: {
      "forjaria": [{ nome: "Bigorna (Forjaria)", escopos: ["ataque"],
        changes: [{ key: "dano", mode: ADD, value: "1" }],
        desc: "Soma-se à Forjaria: dano total +2 na arma escolhida" }]
    } },
  "colchao-de-penas": { nome: "Colchão de Penas Exóticas", preco: 500, locais: ["suite"],
    beneficio: "Aumenta os PV extras da suíte em +3 (total +6 para quem dorme nela)",
    especial: "colchao" },
  "colmeia-de-pergaminhos": { nome: "Colmeia de Pergaminhos", preco: 2500, locais: ["biblioteca", "gabinete-mistico"],
    beneficio: "Conjuradores arcanos aprendem uma magia arcana de qualquer círculo que possam lançar",
    manual: true },
  "criatura-empalhada": { nome: "Criatura Empalhada", preco: 1000, locais: null,
    beneficio: "Bônus em rolagens de dano contra criaturas do mesmo tipo, igual ao patamar da criatura empalhada (a carcaça é por sua conta)",
    manual: true },
  "engenho-automatizado": { nome: "Engenho Automatizado", preco: 3000, locais: ["oficina-de-trabalho"],
    beneficio: "Diminui o tempo de fabricação de itens não consumíveis não mágicos na base à metade",
    manual: true },
  "espelho-de-corpo": { nome: "Espelho de Corpo", preco: 2000, locais: ["chapelaria", "suite"],
    beneficio: "Na chapelaria: mais um item vestido adicional (total de dois). Em uma suíte: +1 em perícias de Carisma para quem dorme nela",
    efeitoPorLocal: {
      "chapelaria": fx([{ key: "system.equipamentos.limiteVestido", mode: ADD, value: "1" }]),
      "suite": { especial: "espelho-suite" }
    } },
  "gargula-animada": { nome: "Gárgula Animada", preco: 10000, locais: "exterior",
    beneficio: "+2 cumulativo de segurança; pode acompanhar o grupo como um parceiro fortão e guardião veterano. Máximo de uma gárgula por categoria de porte acima de Básico",
    seguranca: 2, especial: "gargula" },
  "idolo-dourado": { nome: "Ídolo Dourado", preco: 1200, locais: null,
    beneficio: "Aumenta um dos bônus em perícias fornecidos pelo cômodo em +1",
    especial: "idolo" },
  "lareira": { nome: "Lareira", preco: 2500, locais: ["sala-de-estar", "cozinha", "suite"],
    beneficio: "Fornece +1 na CD de efeitos de fogo e redução de fogo 2",
    efeito: fx([{ key: "system.tracos.resistencias.fogo.bonus", mode: ADD, value: "2" }],
      { nota: "O +1 na CD de efeitos de fogo aparece como efeito de uso na janela de rolagem." }),
    efeitosUso: [{ nome: "Lareira (CD de fogo)", escopos: ["magia", "poder"],
      changes: [{ key: "cd", mode: ADD, value: "1" }],
      desc: "+1 na CD dos seus efeitos de fogo" }] },
  "lustre-de-cristal": { nome: "Lustre de Cristal", preco: 2500, locais: ["sala-de-estar", "salao-de-baile"],
    beneficio: "1×/aventura, aumenta um efeito de luz em +1 por dado",
    manual: true },
  "mapa-mundi": { nome: "Mapa-Múndi", preco: 1500, locais: ["sala-de-guerra", "sala-de-mapas"],
    beneficio: "Aumenta os bônus do cômodo em +1",
    efeitoPorLocal: {
      "sala-de-guerra": fx([
        { key: "system.pericias.guer.bonus", mode: ADD, value: "1" },
        { key: "system.pericias.inic.bonus", mode: ADD, value: "1" }
      ]),
      "sala-de-mapas": { manual: true, nota: "Os bônus de buscas/viagens da Sala de Mapas passam a +3 (manual)." }
    } },
  "mesa-de-reunioes": { nome: "Mesa de Reuniões", preco: 2000, locais: ["sala-de-guerra", "sala-de-estar"],
    beneficio: "No início de cada combate, os personagens podem trocar os valores de iniciativa rolados entre si",
    manual: true },
  "obra-de-arte": { nome: "Obra de Arte", preco: 2000, locais: null,
    beneficio: "1×/aventura, cada residente pode curar PM iguais ao seu patamar × a quantidade de obras de arte na base",
    manual: true, repetivel: true },
  "planetario": { nome: "Planetário", preco: 1500, locais: ["observatorio"],
    beneficio: "Permite usar o bônus do observatório uma vez adicional por aventura",
    manual: true },
  "prataria": { nome: "Prataria", preco: 2000, locais: ["cozinha"],
    beneficio: "Permite preparar uma refeição para viagem adicional",
    manual: true },
  "prateleiras-reforcadas": { nome: "Prateleiras Reforçadas", preco: 2000, locais: ["biblioteca"],
    beneficio: "Fornecem uma perícia treinada",
    efeito: { escolha: "pericia" } },
  "quadro-de-diagramas": { nome: "Quadro de Diagramas", preco: 3000, locais: ["oficina-de-trabalho"],
    beneficio: "Fabricar itens mundanos na base custa 1/4 do preço e consertar custa 1/8",
    manual: true },
  "reliquia-abencoada": { nome: "Relíquia Abençoada", preco: 2500, locais: ["oratorio", "sala-de-estar"],
    beneficio: "No oratório: conjuradores divinos aprendem uma magia divina de qualquer círculo. Na sala de estar: +1 nos testes de resistência dos residentes",
    efeitoPorLocal: {
      "oratorio": { manual: true, nota: "A magia divina aprendida é registrada manualmente." },
      "sala-de-estar": fx([{ key: "system.modificadores.pericias.resistencia", mode: ADD, value: "+1" }])
    } },
  "retratos": { nome: "Retratos", preco: 1750, locais: null,
    beneficio: "Os residentes recebem +5 em testes de perícia para ajudar outros residentes",
    efeitosUso: [{ escopos: ["pericia"],
      changes: [{ key: "roll", mode: ADD, value: "5" }],
      desc: "+5 no teste de perícia ao ajudar outro residente" }] },
  "roleta-ahleniense": { nome: "Roleta Ahleniense", preco: 2000, locais: ["sala-de-jogos"],
    beneficio: "Permite rolar novamente um teste de perícia por aventura",
    manual: true }
};

/* ================================================================== */
/* Perícias e utilidades                                              */
/* ================================================================== */

export const PERICIAS_FALLBACK = {
  acro: "Acrobacia", ades: "Adestramento", atle: "Atletismo", atua: "Atuação",
  cava: "Cavalgar", conh: "Conhecimento", cura: "Cura", dipl: "Diplomacia",
  enga: "Enganação", fort: "Fortitude", furt: "Furtividade", guer: "Guerra",
  inic: "Iniciativa", inti: "Intimidação", intu: "Intuição", inve: "Investigação",
  joga: "Jogatina", ladi: "Ladinagem", luta: "Luta", mist: "Misticismo",
  nobr: "Nobreza", ofic: "Ofício", perc: "Percepção", pilo: "Pilotagem",
  pont: "Pontaria", refl: "Reflexos", reli: "Religião", sobr: "Sobrevivência",
  vont: "Vontade"
};

export function labelPericia(key) {
  return CONFIG?.T20?.pericias?.[key]?.label ?? PERICIAS_FALLBACK[key] ?? key;
}

export const TIPOS_CAPITAO = ["Atirador", "Combatente", "Fortão", "Guardião"];

/** Caminhos comuns para o construtor de homebrews. */
export const CAMINHOS_SUGERIDOS = [
  { key: "system.attributes.pv.bonus.total", rotulo: "PV máximos" },
  { key: "system.attributes.pm.bonus.total", rotulo: "PM máximos" },
  { key: "system.attributes.defesa.bonus", rotulo: "Defesa (bônus)" },
  { key: "system.attributes.carga.bonus", rotulo: "Carga (bônus)" },
  { key: "system.equipamentos.limiteVestido", rotulo: "Itens vestidos" },
  { key: "system.attributes.movement.walk", rotulo: "Deslocamento" },
  { key: "system.attributes.cd", rotulo: "CD de habilidades" },
  { key: "system.modificadores.pericias.resistencia", rotulo: "Testes de resistência (use +N)" },
  { key: "system.modificadores.pericias.geral", rotulo: "Todas as perícias (use +N)" },
  { key: "system.modificadores.ataque.geral", rotulo: "Todos os ataques (use +N)" },
  { key: "system.modificadores.dano.geral", rotulo: "Todo dano (use +N)" },
  { key: "system.tracos.resistencias.fogo.bonus", rotulo: "Redução de fogo" },
  { key: "system.tracos.resistencias.frio.bonus", rotulo: "Redução de frio" },
  ...Object.entries(PERICIAS_FALLBACK).map(([k, v]) => ({ key: `system.pericias.${k}.bonus`, rotulo: `Perícia: ${v}` }))
];

/* ================================================================== */
/* Acesso unificado (catálogo + homebrews da base)                    */
/* ================================================================== */

/* Sem homebrews, devolve o catálogo estático direto; com homebrews, a
 * mescla é cacheada por referência do array (o DataModel recria o array
 * a cada update da base, invalidando o cache automaticamente). Antes, a
 * mescla de ~40 entradas rodava a cada prepareDerivedData e render. */
const _cacheComodos = new WeakMap();
const _cacheMobilias = new WeakMap();

function catalogoMesclado(estatico, homebrews, cache) {
  if (!homebrews?.length) return estatico;
  let mesclado = cache.get(homebrews);
  if (!mesclado) {
    const extra = {};
    for (const hb of homebrews) extra[hb.key] = hb;
    mesclado = { ...estatico, ...extra };
    cache.set(homebrews, mesclado);
  }
  return mesclado;
}

export function obterComodos(base) {
  return catalogoMesclado(COMODOS, base?.system?.homebrew?.comodos, _cacheComodos);
}

export function obterMobilias(base) {
  return catalogoMesclado(MOBILIAS, base?.system?.homebrew?.mobilias, _cacheMobilias);
}
