/**
 * t20-hayd-dominios | catalogo.mjs
 * Catálogo de regras de Regência (Heróis de Arton, pp. 314-327).
 * Todos os dados de referência do módulo vivem aqui.
 */

export const MODULO = "t20-hayd-bases-e-dominios";

/**
 * true quando o módulo de tema "t20-hayd-ui" está ativo no mundo.
 * Com ele ativo, a ficha, os diálogos e os cartões de chat usam o visual
 * dark glassmorphic (classe .tema-hayd); sem ele, o visual padrão do Foundry.
 */
export function temaHayd() {
  return game.modules?.get("t20-hayd-ui")?.active === true;
}

/**
 * Cor padrão do t20-hayd-ui (configuração "Cor padrão" do mundo —
 * alterável de vermelho para qualquer outra nas opções do módulo).
 */
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
 * Cor de destaque do domínio: a mesma cor que o t20-hayd-ui daria à
 * ficha do REGENTE (modo "padrao" → cor padrão; senão a cor do primeiro
 * dono jogador do regente). Sem regente, usa a cor padrão configurada.
 */
export function corDominio(dominio) {
  try {
    const uuid = dominio?.system?.regenteUuid;
    const regente = uuid ? fromUuidSync(uuid) : null;
    if (regente) {
      const bruto = regente.getFlag?.("t20-hayd-ui", "configCor");
      const modo = (bruto && typeof bruto === "object")
        ? (bruto.mode === "custom" ? "padrao" : "auto")
        : (bruto ?? "auto");
      if (modo !== "padrao") {
        const donos = game.users
          .filter(u => !u.isGM && regente.testUserPermission?.(u, "OWNER"))
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
        for (const dono of donos) {
          const c = corCSSDoUsuario(dono);
          if (c) return c;
        }
      }
    }
  } catch (err) {
    console.debug(`${MODULO} | falha ao resolver a cor do regente`, err);
  }
  return corPadraoTema();
}

/* Modos de Efeito Ativo (CONST.ACTIVE_EFFECT_MODES) */
const ADD = 2;
const OVERRIDE = 5;

/* ------------------------------------------------------------------ */
/* Terrenos — Tabela 4-9                                              */
/* ------------------------------------------------------------------ */
export const TERRENOS = {
  colinas:     { nome: "Colinas",     nivelMaximo: 5, potencialMagico: 5 },
  deserto:     { nome: "Deserto",     nivelMaximo: 4, potencialMagico: 6 },
  floresta:    { nome: "Floresta",    nivelMaximo: 4, potencialMagico: 6, racaAfim: "Raças ligadas à natureza (elfos, sílfides, dahllan…): nível máximo 6" },
  montanha:    { nome: "Montanha",    nivelMaximo: 3, potencialMagico: 7 },
  pantano:     { nome: "Pântano",     nivelMaximo: 3, potencialMagico: 7 },
  planicie:    { nome: "Planície",    nivelMaximo: 6, potencialMagico: 4 },
  subterraneo: { nome: "Subterrâneo", nivelMaximo: 2, potencialMagico: 8, racaAfim: "Raças ligadas ao subterrâneo (anões, trogs, medusas…): nível máximo 6" }
};

/* ------------------------------------------------------------------ */
/* Corte                                                              */
/* ------------------------------------------------------------------ */
export const CORTES = {
  inexistente: { nome: "Inexistente", manutencao: 0, mod: -2, conselheiros: 0, acoesExtras: 0,
    desc: "Governo improvisado, nos fundos de uma taverna ou de uma carroça. –2 em ações de domínio." },
  pobre:       { nome: "Pobre",       manutencao: 1, mod: 0,  conselheiros: 0, acoesExtras: 0,
    desc: "Um salão com alguns servos. Sem modificadores." },
  comum:       { nome: "Comum",       manutencao: 3, mod: 0,  conselheiros: 1, acoesExtras: 0,
    desc: "Estrutura completa com salas de audiência e escritórios. Fornece 1 conselheiro." },
  rica:        { nome: "Rica",        manutencao: 5, mod: 0,  conselheiros: 3, acoesExtras: 1,
    desc: "Rede de prédios com burocracia própria. Fornece 3 conselheiros e 1 ação de domínio extra por turno." }
};
export const ORDEM_CORTES = ["inexistente", "pobre", "comum", "rica"];

/* Conselheiros e suas perícias */
export const CONSELHEIROS = {
  bispo:      { nome: "Bispo",             pericia: "reli" },
  capitao:    { nome: "Capitão da Guarda", pericia: "guer" },
  embaixador: { nome: "Embaixador",        pericia: "dipl" },
  espiao:     { nome: "Espião",            pericia: "enga" },
  falcoeiro:  { nome: "Falcoeiro",         pericia: "sobr" },
  magistrado: { nome: "Magistrado",        pericia: "inve" },
  mago:       { nome: "Mago da Corte",     pericia: "mist" },
  menestrel:  { nome: "Menestrel",         pericia: "atua" },
  senescal:   { nome: "Senescal",          pericia: "nobr" }
};

/* ------------------------------------------------------------------ */
/* Popularidade                                                       */
/* ------------------------------------------------------------------ */
export const POPULARIDADES = {
  adorado:   { nome: "Adorado",   mod:  2, desc: "Amado pelos súditos: gritam seu nome e lhe presenteiam com bolos." },
  popular:   { nome: "Popular",   mod:  1, desc: "O povo o cumprimenta com afeto e deferência." },
  tolerado:  { nome: "Tolerado",  mod:  0, desc: "Alguns agradecem pelas obras, outros reclamam dos impostos." },
  impopular: { nome: "Impopular", mod: -2, desc: "Decretos cumpridos de má vontade; piadas com seu nome." },
  odiado:    { nome: "Odiado",    mod: -5, desc: "Xingamentos e ovos podres. Abaixo disto, uma revolta se inicia." }
};
export const ORDEM_POPULARIDADE = ["adorado", "popular", "tolerado", "impopular", "odiado"];

/* ------------------------------------------------------------------ */
/* Impostos — Tabela 4-12 (LO por turno, por nível do domínio)        */
/* ------------------------------------------------------------------ */
export const IMPOSTOS = {
  1: { descricao: "Aldeia",                   baixos: "1",    medios: "1d3",   altos: "1d3+1"  },
  2: { descricao: "Vilarejo",                 baixos: "1d3",  medios: "1d3+1", altos: "2d4"    },
  3: { descricao: "Vila pequena ou feudo",    baixos: "1d4",  medios: "2d4",   altos: "2d6"    },
  4: { descricao: "Vila grande ou baronato",  baixos: "1d6",  medios: "2d4+1", altos: "2d6+2"  },
  5: { descricao: "Cidade pequena ou condado",baixos: "1d8",  medios: "2d6",   altos: "2d8+2"  },
  6: { descricao: "Cidade grande ou ducado",  baixos: "1d10", medios: "2d6+1", altos: "2d10+2" },
  7: { descricao: "Metrópole ou reino pequeno","baixos": "1d12", medios: "2d8+1", altos: "2d12+2" }
};

/* ------------------------------------------------------------------ */
/* Unidades Militares — Tabela 4-11                                   */
/* ------------------------------------------------------------------ */
export const UNIDADES = {
  camponeses: { nome: "Camponeses",     construcao: null,                  custo: 0, manutencao: 0,    poder: 0.5, desl: "9m",  defesa: 10, dano: "1d6",
    nota: "Obtidos com a ação Convocar Camponeses; dispersam no fim do turno." },
  milicia:    { nome: "Milícia",        construcao: "campo-de-treinamento", custo: 1, manutencao: 0.25, poder: 1,   desl: "9m",  defesa: 16, dano: "1d8+1" },
  bandidos:   { nome: "Bandidos",       construcao: "esconderijo",          custo: 2, manutencao: 0.5,  poder: 1,   desl: "9m",  defesa: 15, dano: "2d6" },
  guardas:    { nome: "Guardas",        construcao: "torre-de-guarnicao",   custo: 2, manutencao: 0.5,  poder: 2,   desl: "6m",  defesa: 19, dano: "1d8+2" },
  arqueiros:  { nome: "Arqueiros",      construcao: "pista-de-arquearia",   custo: 2, manutencao: 0.5,  poder: 2,   desl: "9m",  defesa: 15, dano: "1d8",
    nota: "Podem causar dano a criaturas em alcance médio." },
  caes:       { nome: "Cães de Guerra", construcao: "canil",                custo: 2, manutencao: 0.25, poder: 2,   desl: "15m", defesa: 14, dano: "1d6+3" },
  cavaleiros: { nome: "Cavaleiros",     construcao: "pista-de-justa",       custo: 6, manutencao: 1,    poder: 5,   desl: "12m", defesa: 24, dano: "1d8+3",
    nota: "Se causarem dano na mesma rodada em que ficarem adjacentes ao alvo, causam +1d8 pontos de dano." }
};

/* ------------------------------------------------------------------ */
/* Construções — Tabela 4-10                                          */
/*  categoria define a perícia do teste de Construir.                 */
/*  efeito = Efeito Ativo transferível ao regente (null = benefício   */
/*  manual, sem automação limpa possível).                            */
/* ------------------------------------------------------------------ */
export const CATEGORIAS_CONSTRUCAO = {
  nobreza:    { nome: "Nobreza",    pericia: "nobr" },
  guerra:     { nome: "Guerra",     pericia: "guer" },
  enganacao:  { nome: "Enganação",  pericia: "enga" },
  religiao:   { nome: "Religião",   pericia: "reli" },
  misticismo: { nome: "Misticismo", pericia: "mist" }
};

const fx = (changes, extra = {}) => ({ changes, ...extra });

export const CONSTRUCOES = {
  /* ---------------- NOBREZA ---------------- */
  "adega": { nome: "Adega", categoria: "nobreza", custo: 4,
    beneficio: "+3 pontos de mana",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "3" }]) },

  "aqueduto": { nome: "Aqueduto", categoria: "nobreza", custo: 15,
    beneficio: "Rola duas vezes para eventos aleatórios e usa o melhor resultado",
    especial: "eventoDuplo", efeito: null },

  "banhos-publicos": { nome: "Banhos Públicos", categoria: "nobreza", custo: 7,
    beneficio: "+5 em testes da ação Governar", especial: "governarBonus", efeito: null },

  "biblioteca": { nome: "Biblioteca", categoria: "nobreza", custo: 10,
    beneficio: "Torna-se treinado em uma perícia (escolha na engrenagem)",
    efeito: fx([], { escolha: "pericia" }) },

  "universidade": { nome: "Universidade", categoria: "nobreza", custo: 25,
    beneficio: "Recebe um poder geral (adicione manualmente à ficha do regente)", efeito: null },

  "botica": { nome: "Botica", categoria: "nobreza", custo: 3,
    beneficio: "+1 em Fortitude",
    efeito: fx([{ key: "system.pericias.fort.bonus", mode: ADD, value: "1" }]) },

  "cabana-de-caca": { nome: "Cabana de Caça", categoria: "nobreza", custo: 2,
    beneficio: "Dano da Marca da Presa aumenta em um passo (ajuste manual)", efeito: null },

  "cadafalso": { nome: "Cadafalso", categoria: "nobreza", custo: 1,
    beneficio: "+2 em Intimidação",
    efeito: fx([{ key: "system.pericias.inti.bonus", mode: ADD, value: "2" }]) },

  "campo-de-treinamento": { nome: "Campo de Treinamento", categoria: "nobreza", custo: 2,
    beneficio: "Permite recrutar milícias", efeito: null },

  "corte-de-lei": { nome: "Corte de Lei", categoria: "nobreza", custo: 5,
    beneficio: "Rola dois dados e usa o melhor em testes de resistência contra efeitos mentais (manual)", efeito: null },

  "curtume": { nome: "Curtume", categoria: "nobreza", custo: 4,
    beneficio: "Capangas recebem +2 na Defesa (manual)", efeito: null },

  "estatua": { nome: "Estátua", categoria: "nobreza", custo: 2,
    beneficio: "Gasto máximo de PM em uma habilidade passa a ser nível +1 (manual)", efeito: null },

  "estrada": { nome: "Estrada", categoria: "nobreza", custo: 10,
    beneficio: "+2 em Iniciativa",
    efeito: fx([{ key: "system.pericias.inic.bonus", mode: ADD, value: "2" }]) },

  "estalagem": { nome: "Estalagem", categoria: "nobreza", custo: 8, prereqs: ["estrada"],
    beneficio: "Uma ação padrão adicional, uma vez por aventura (manual)", efeito: null },

  "fazenda": { nome: "Fazenda", categoria: "nobreza", custo: 2, repetivel: true,
    beneficio: "Fornece 1d6–2 LO por turno de domínio (pode dar prejuízo)", renda: true, efeito: null },

  "celeiro": { nome: "Celeiro", categoria: "nobreza", custo: 3, prereqs: ["fazenda"], repetivel: true,
    beneficio: "Elimina a penalidade da fazenda (ganho vira 1d6 LO; 1d8 LO com moinho)", efeito: null },

  "moinho": { nome: "Moinho", categoria: "nobreza", custo: 5, prereqs: ["fazenda"], repetivel: true,
    beneficio: "Muda o dado de ganho da fazenda para d8", efeito: null },

  "feira": { nome: "Feira", categoria: "nobreza", custo: 5, repetivel: true,
    beneficio: "Fornece 1d4 LO por turno de domínio", renda: true, efeito: null },

  "mercado": { nome: "Mercado", categoria: "nobreza", custo: 10, prereqs: ["feira"], repetivel: true,
    beneficio: "Muda o ganho da feira para 1d8 LO", efeito: null },

  "forja": { nome: "Forja", categoria: "nobreza", custo: 6,
    beneficio: "Capangas recebem +1 nas rolagens de dano (manual)", efeito: null },

  "forte": { nome: "Forte", categoria: "nobreza", custo: 10,
    beneficio: "Fortificação +2", fortificacao: 2, efeito: null },

  "armorial": { nome: "Armorial", categoria: "nobreza", custo: 3, prereqs: ["forte"],
    beneficio: "Custo de Orgulho diminui em –1 PM (manual)", efeito: null },

  "castelo": { nome: "Castelo", categoria: "nobreza", custo: 25, prereqs: ["forte"],
    beneficio: "Muda a Fortificação do forte para +5", efeito: null },

  "ordem-de-cavalaria": { nome: "Ordem de Cavalaria", categoria: "nobreza", custo: 20, prereqs: ["forte"],
    beneficio: "Custo de Baluarte diminui em –1 PM (manual)", efeito: null },

  "sala-do-trono": { nome: "Sala do Trono", categoria: "nobreza", custo: 5, prereqs: ["forte"],
    beneficio: "+2 em Diplomacia",
    efeito: fx([{ key: "system.pericias.dipl.bonus", mode: ADD, value: "2" }]) },

  "madeireira": { nome: "Madeireira", categoria: "nobreza", custo: 15, terrenos: ["floresta"], repetivel: true,
    beneficio: "+1d8 LO por turno, mas –10% nas rolagens de eventos aleatórios",
    renda: true, eventoMod: -10, efeito: null },

  "masmorra": { nome: "Masmorra", categoria: "nobreza", custo: 20,
    beneficio: "+2 na CD de habilidades de classe, exceto magias (manual)", efeito: null },

  "mina": { nome: "Mina", categoria: "nobreza", custo: 20, terrenos: ["montanha", "subterraneo"], repetivel: true,
    beneficio: "+1d12 LO por turno, mas –20% nas rolagens de eventos aleatórios",
    renda: true, eventoMod: -20, efeito: null },

  "obra-de-arte": { nome: "Obra de Arte", categoria: "nobreza", custo: 3,
    beneficio: "+1 em Vontade",
    efeito: fx([{ key: "system.pericias.vont.bonus", mode: ADD, value: "1" }]) },

  "oficina": { nome: "Oficina", categoria: "nobreza", custo: 2,
    beneficio: "+2 em Ofício",
    efeito: fx([{ key: "system.pericias.ofic.bonus", mode: ADD, value: "2" }]) },

  "sede-de-guilda": { nome: "Sede de Guilda", categoria: "nobreza", custo: 15, prereqs: ["oficina"],
    beneficio: "No início de cada aventura, um item recebe uma melhoria (máx. 4; manual)", efeito: null },

  "palacio": { nome: "Palácio", categoria: "nobreza", custo: 100,
    beneficio: "Aumenta o limite de parceiros em +1 (manual)", efeito: null },

  "palicada": { nome: "Paliçada", categoria: "nobreza", custo: 4,
    beneficio: "Fortificação +2", fortificacao: 2, efeito: null },

  "muralha": { nome: "Muralha", categoria: "nobreza", custo: 10, prereqs: ["palicada"],
    beneficio: "Muda a Fortificação da paliçada para +5", efeito: null },

  "poco-de-piche": { nome: "Poço de Piche", categoria: "nobreza", custo: 6, terrenos: ["pantano"],
    beneficio: "+2 na CD de preparados e venenos (manual)", efeito: null },

  "porto": { nome: "Porto", categoria: "nobreza", custo: 10, precisaRio: true, repetivel: true,
    beneficio: "Fornece 1d6 LO por turno de domínio", renda: true, efeito: null },

  "docas": { nome: "Docas", categoria: "nobreza", custo: 4, prereqs: ["porto"],
    beneficio: "Bônus de Audácia +1 e pode ser usado em testes de ataque (manual)", efeito: null },

  "povoado-afastado": { nome: "Povoado Afastado", categoria: "nobreza", custo: 4, repetivel: true,
    beneficio: "Permite erguer uma construção com pré-requisito de terreno diferente do seu", efeito: null },

  "quarto-luxuoso": { nome: "Quarto Luxuoso", categoria: "nobreza", custo: 2,
    beneficio: "+5 pontos de vida",
    efeito: fx([{ key: "system.attributes.pv.bonus.total", mode: ADD, value: "5" }]) },

  "torre-de-vigia": { nome: "Torre de Vigia", categoria: "nobreza", custo: 2,
    beneficio: "+2 em Percepção",
    efeito: fx([{ key: "system.pericias.perc.bonus", mode: ADD, value: "2" }]) },

  /* ---------------- GUERRA ---------------- */
  "canil": { nome: "Canil", categoria: "guerra", custo: 4,
    beneficio: "Permite recrutar cães de guerra", efeito: null },

  "estrebaria": { nome: "Estrebaria", categoria: "guerra", custo: 10,
    beneficio: "Recebe um cavalo de guerra veterano (ou melhora o atual; manual)", efeito: null },

  "pista-de-justa": { nome: "Pista de Justa", categoria: "guerra", custo: 10,
    beneficio: "Permite recrutar cavaleiros", efeito: null },

  "patio-de-treinamento": { nome: "Pátio de Treinamento", categoria: "guerra", custo: 6,
    beneficio: "+1 em testes de ataque (ou uma proficiência, à sua escolha)",
    efeito: fx([{ key: "system.modificadores.pericias.ataque", mode: ADD, value: "+1" }],
      { nota: "Alternativa: uma proficiência (aplique manualmente e desative este efeito)." }) },

  "licas": { nome: "Liças", categoria: "guerra", custo: 2, prereqs: ["patio-de-treinamento"],
    beneficio: "Bônus de Fúria/Fúria Divina aumenta em +1 (manual)", efeito: null },

  "salao-de-guerreiros": { nome: "Salão de Guerreiros", categoria: "guerra", custo: 4,
    beneficio: "Custo de Ataque Especial diminui em –1 PM (manual)", efeito: null },

  "pista-de-arquearia": { nome: "Pista de Arquearia", categoria: "guerra", custo: 2,
    beneficio: "Permite recrutar arqueiros", efeito: null },

  "posto-de-pedagio": { nome: "Posto de Pedágio", categoria: "guerra", custo: 2, prereqs: ["estrada"],
    beneficio: "Ao cobrar impostos altos, recebe +1 LO por nível do domínio", efeito: null },

  "sala-de-mapas": { nome: "Sala de Mapas", categoria: "guerra", custo: 8,
    beneficio: "Uma ação de movimento adicional no primeiro turno de cada combate (manual)", efeito: null },

  "torre-de-guarnicao": { nome: "Torre de Guarnição", categoria: "guerra", custo: 5,
    beneficio: "Permite recrutar guardas", efeito: null },

  /* ---------------- ENGANAÇÃO ---------------- */
  "bazar": { nome: "Bazar", categoria: "enganacao", custo: 5,
    beneficio: "+10% a seu favor ao negociar itens comuns", efeito: null },

  "caravancara": { nome: "Caravançará", categoria: "enganacao", custo: 10, prereqs: ["bazar", "estrada"],
    beneficio: "Permite criar caravanas (ação de domínio; retorno na próxima etapa de impostos)",
    especial: "caravana", efeito: null },

  "emporio": { nome: "Empório", categoria: "enganacao", custo: 10, prereqs: ["bazar"],
    beneficio: "+10% ao negociar um item superior, uma vez por aventura", efeito: null },

  "esconderijo": { nome: "Esconderijo", categoria: "enganacao", custo: 8,
    beneficio: "Permite recrutar bandidos", efeito: null },

  "taverna": { nome: "Taverna", categoria: "enganacao", custo: 10,
    beneficio: "Interrogar como ação livre e sem custo, uma vez por aventura", efeito: null },

  "antro-de-jogatina": { nome: "Antro de Jogatina", categoria: "enganacao", custo: 10, prereqs: ["taverna"],
    beneficio: "+2 em Enganação",
    efeito: fx([{ key: "system.pericias.enga.bonus", mode: ADD, value: "2" }]) },

  "arena-clandestina": { nome: "Arena Clandestina", categoria: "enganacao", custo: 15, prereqs: ["taverna"],
    beneficio: "Recebe Ataque Furtivo +1d6, cumulativo (manual)", efeito: null },

  "casa-de-prazeres": { nome: "Casa de Prazeres", categoria: "enganacao", custo: 10, prereqs: ["taverna"],
    beneficio: "Usa a habilidade Favor uma vez por aventura (ou +5 em Diplomacia para usá-la)", efeito: null },

  "palco": { nome: "Palco", categoria: "enganacao", custo: 4,
    beneficio: "+2 em Atuação",
    efeito: fx([{ key: "system.pericias.atua.bonus", mode: ADD, value: "2" }]) },

  "trupe-de-malabaristas": { nome: "Trupe de Malabaristas", categoria: "enganacao", custo: 4,
    beneficio: "+1 em Reflexos",
    efeito: fx([{ key: "system.pericias.refl.bonus", mode: ADD, value: "1" }]) },

  /* ---------------- RELIGIÃO ---------------- */
  "abadia": { nome: "Abadia", categoria: "religiao", custo: 12,
    beneficio: "Aprende uma magia divina de sua lista (adicione manualmente)", efeito: null },

  "capela": { nome: "Capela", categoria: "religiao", custo: 5,
    beneficio: "+2 em Religião",
    efeito: fx([{ key: "system.pericias.reli.bonus", mode: ADD, value: "2" }]) },

  "relicario": { nome: "Relicário", categoria: "religiao", custo: 8, prereqs: ["capela"],
    beneficio: "+5 em um teste de resistência, uma vez por aventura (manual)", efeito: null },

  "mosteiro": { nome: "Mosteiro", categoria: "religiao", custo: 15,
    beneficio: "+3 pontos de mana (apenas conjuradores divinos)",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "3" }],
      { nota: "Aplique apenas se o regente for conjurador divino (clérigo, druida…)." }) },

  "santuario": { nome: "Santuário", categoria: "religiao", custo: 4,
    beneficio: "Fornece um poder de druida (adicione manualmente)", efeito: null },

  "bosque-sagrado": { nome: "Bosque Sagrado", categoria: "religiao", custo: 5, prereqs: ["santuario"],
    beneficio: "Um companheiro animal não conta no limite de parceiros (manual)", efeito: null },

  "circulo-de-pedras": { nome: "Círculo de Pedras", categoria: "religiao", custo: 10, prereqs: ["santuario"],
    beneficio: "Forma Selvagem: um dos bônus de atributo aumenta em +2 (manual)", efeito: null },

  "templo": { nome: "Templo", categoria: "religiao", custo: 15,
    beneficio: "Fornece um poder de clérigo (adicione manualmente)", efeito: null },

  "altar": { nome: "Altar", categoria: "religiao", custo: 3, prereqs: ["templo"],
    beneficio: "Canalizar Energia passa a usar d8 (manual)", efeito: null },

  "catedral": { nome: "Catedral", categoria: "religiao", custo: 20, prereqs: ["templo"],
    beneficio: "Uma vez por dia, dobra os efeitos de uma de suas Missas (manual)", efeito: null },

  /* ---------------- MISTICISMO ---------------- */
  "estante-de-pergaminhos": { nome: "Estante de Pergaminhos", categoria: "misticismo", custo: 12,
    beneficio: "Aprende uma magia arcana (adicione manualmente)", efeito: null },

  "poco-de-adivinhacao": { nome: "Poço de Adivinhação", categoria: "misticismo", custo: 10,
    beneficio: "Rola 2d20 e usa o melhor num teste, uma vez por aventura (manual)", efeito: null },

  "salao-dos-misterios": { nome: "Salão dos Mistérios", categoria: "misticismo", custo: 15,
    beneficio: "+2 em Misticismo",
    efeito: fx([{ key: "system.pericias.mist.bonus", mode: ADD, value: "2" }]) },

  "pedra-de-maldicoes": { nome: "Pedra de Maldições", categoria: "misticismo", custo: 6, prereqs: ["salao-dos-misterios"],
    beneficio: "Um alvo sofre –5 em sua próxima resistência, uma vez por aventura (manual)", efeito: null },

  "sala-de-meditacao": { nome: "Sala de Meditação", categoria: "misticismo", custo: 5,
    beneficio: "+3 pontos de mana (apenas conjuradores arcanos)",
    efeito: fx([{ key: "system.attributes.pm.bonus.total", mode: ADD, value: "3" }],
      { nota: "Aplique apenas se o regente for conjurador arcano (arcanista, bardo…)." }) },

  "torre-de-estudos": { nome: "Torre de Estudos", categoria: "misticismo", custo: 10,
    beneficio: "Fornece um poder de arcanista (adicione manualmente)", efeito: null },

  "arena-arcana": { nome: "Arena Arcana", categoria: "misticismo", custo: 6, prereqs: ["salao-dos-misterios"],
    beneficio: "+1 de dano por dado do Raio Arcano (manual)", efeito: null },

  "camara-mistica": { nome: "Câmara Mística", categoria: "misticismo", custo: 15, prereqs: ["torre-de-estudos"],
    beneficio: "Usa um poder de magia de aprimoramento sem pagar PM, uma vez por aventura (manual)", efeito: null },

  "circulo-de-poder": { nome: "Círculo de Poder", categoria: "misticismo", custo: 10,
    beneficio: "+1 na CD para resistir às suas magias arcanas",
    efeito: fx([{ key: "system.attributes.cd", mode: ADD, value: "1" }],
      { nota: "O bônus vale apenas para magias arcanas — desative se o regente também for conjurador divino." }) },

  "linhas-misticas": { nome: "Linhas Místicas", categoria: "misticismo", custo: 25,
    beneficio: "Ao descansar, a recuperação de PM aumenta em +1 por nível (manual)", efeito: null }
};

/* ------------------------------------------------------------------ */
/* Ações de Domínio                                                   */
/* ------------------------------------------------------------------ */
export const ACOES = {
  aumentarCorte: { nome: "Aumentar Corte", pericia: "nobr", cd: () => 20, custo: 1,
    desc: "Aumenta a corte em uma categoria. Também serve para trocar um conselheiro ou diminuir a corte (sem custo)." },
  construir:     { nome: "Construir", pericia: null, cd: (n) => 20 + n, custo: null,
    desc: "Ergue uma construção. A perícia é definida pela categoria da construção; o custo, pela construção." },
  convocar:      { nome: "Convocar Camponeses", pericia: null, cd: null, custo: 1,
    desc: "Gera 1d6 unidades de camponeses até o fim do turno; popularidade –1 categoria." },
  extorquir:     { nome: "Extorquir", pericia: "inti", cd: (n) => 20 + n, custo: 0,
    desc: "Fornece 1d6 LO + nível do domínio; popularidade –1 categoria." },
  festival:      { nome: "Festival", pericia: "atua", cd: (n) => 20 + n, custo: 1,
    desc: "Popularidade +1 categoria." },
  financas:      { nome: "Finanças", pericia: "nobr", cd: () => 20, custo: 0,
    desc: "Converte T$ 1.000 em 1 LO, ou vice-versa, entre o regente e o tesouro do domínio." },
  governar:      { nome: "Governar", pericia: "nobr", cd: (n) => 20 + 2 * (n + 1), custo: null,
    desc: "O domínio sobe um nível. Custo: 5 LO × o próximo nível. Uma vez por turno." },
  recrutar:      { nome: "Recrutar Tropas", pericia: null, cd: null, custo: null,
    desc: "Recruta unidades militares (até o nível do domínio por ação), pagando o custo de cada uma." },
  caravana:      { nome: "Criar Caravana", pericia: null, cd: null, custo: null,
    desc: "Requer Caravançará. Invista até 1d4 LO por nível; o retorno é resolvido na próxima etapa de impostos." }
};

/* ------------------------------------------------------------------ */
/* Eventos Aleatórios — Tabela 4-13 (1d%)                             */
/* ------------------------------------------------------------------ */
export const EVENTOS = [
  { min: 1,  max: 2,   key: "ataque-de-dragao", nome: "Ataque de Dragão",
    desc: "Um dragão despeja fúria flamejante sobre a terra. O domínio perde um nível, uma construção aleatória e 1d6 unidades. O mestre pode permitir enfrentá-lo em uma aventura." },
  { min: 3,  max: 7,   key: "invasores", nome: "Invasores",
    desc: "Uma força considerável ataca o domínio. Poder: 1d12 por nível do domínio; líder com Guerra 2d6+10. Resolva na aba Batalha." },
  { min: 8,  max: 11,  key: "monstro", nome: "Monstro", pericia: ["sobr"],
    desc: "Um monstro ataca o domínio. Caçá-lo exige uma ação de domínio e um teste de Sobrevivência. Falha (ou omissão): popularidade –1 e perde uma construção aleatória." },
  { min: 12, max: 15,  key: "peste", nome: "Peste",
    desc: "Uma doença assola o domínio. Popularidade –1 categoria e perde 1d3+1 unidades." },
  { min: 16, max: 20,  key: "fenomeno-natural", nome: "Fenômeno Natural", sub: "natural",
    desc: "Um evento climático. Role 1d6 para determinar a gravidade." },
  { min: 21, max: 22,  key: "fenomeno-magico", nome: "Fenômeno Mágico", sub: "magico",
    desc: "Um evento bizarro e sobrenatural. Role 1d6 para determinar o efeito." },
  { min: 23, max: 26,  key: "questao-diplomatica", nome: "Questão Diplomática", pericia: ["dipl"],
    desc: "Um emissário exige algo (tributo de 2d6 LO, empréstimo de 1d4 tropas…, a critério do mestre). Recusar sem consequências exige uma ação de domínio e um teste de Diplomacia." },
  { min: 27, max: 30,  key: "levante", nome: "Levante",
    desc: "A população se enfurece! Popularidade –2 categorias (pode causar uma revolta)." },
  { min: 31, max: 35,  key: "intriga", nome: "Intriga", pericia: ["enga"],
    desc: "A corte é envolvida em uma intriga. Resolver exige uma ação de domínio e um teste de Enganação. Falha (ou omissão): corte e popularidade –1 categoria." },
  { min: 36, max: 42,  key: "questao-de-justica", nome: "Questão de Justiça", pericia: ["intu", "inve"],
    desc: "Uma questão legal precisa ser julgada: ação de domínio + teste de Intuição ou Investigação. Falha (ou omissão): popularidade –2 categorias." },
  { min: 43, max: 52,  key: "bandidos", nome: "Bandidos", persistente: true,
    desc: "Bandoleiros roubam o povo. Popularidade –1 no fim de cada turno até serem derrotados em batalha (Poder 2d4 + nível; líder com Guerra 2d4+5)." },
  { min: 53, max: 56,  key: "corrupcao", nome: "Corrupção", pericia: ["intu", "inve"], persistente: true,
    desc: "Os ganhos diminuem em 1d6 LO por turno até a corrupção ser desbaratada (ação + Intuição ou Investigação). Sucesso: acaba, mas a corte diminui uma categoria." },
  { min: 57, max: 61,  key: "questao-comercial", nome: "Questão Comercial", pericia: ["dipl"],
    desc: "Um problema econômico. Resolver exige ação de domínio + Diplomacia. Falha (ou omissão): ganhos –2d6 LO neste turno." },
  { min: 62, max: 70,  key: "saqueadores", nome: "Saqueadores",
    desc: "Como Invasores, mas uma força menor. Poder: 1d8 por nível do domínio; líder com Guerra 2d4+10. Resolva na aba Batalha." },
  { min: 71, max: 90,  key: "nenhum", nome: "Nenhum Evento",
    desc: "O turno transcorre sem sobressaltos." },
  { min: 91, max: 100, key: "regalia", nome: "Regalia", sub: "regalia",
    desc: "Um evento favorável! Role 1d6 para determinar a bênção." }
];

export const SUBEVENTOS = {
  natural: [
    { min: 1, max: 1, desc: "Desastre (tornado, terremoto…): o domínio perde 1 nível.", efeito: "nivel-1" },
    { min: 2, max: 3, desc: "Problema maior (inundação, incêndio…): o domínio perde uma construção aleatória.", efeito: "construcao-1" },
    { min: 4, max: 6, desc: "Problema menor (nevasca, seca…): os ganhos diminuem em 1d6 LO neste turno.", efeito: "renda-1d6" }
  ],
  magico: [
    { min: 1, max: 1, desc: "Mortos vagam pela terra! Você não pode fazer ações de domínio neste turno.", efeito: "bloqueio" },
    { min: 2, max: 3, desc: "Uma comitiva feérica traz o caos: –5 nas ações de domínio neste turno.", efeito: "mod-5" },
    { min: 4, max: 6, desc: "Um bruxo amaldiçoa a terra: –2 nas ações de domínio neste turno (e o leite azeda).", efeito: "mod-2" }
  ],
  regalia: [
    { min: 1, max: 2, desc: "Clima bom melhora a colheita: +1d6 LO neste turno.", efeito: "renda+1d6" },
    { min: 3, max: 4, desc: "Um conselheiro tem uma boa ideia: +2 nos testes de ação de domínio neste turno.", efeito: "mod+2" },
    { min: 5, max: 6, desc: "Um festival ocorre e deixa todos felizes: popularidade +1 categoria.", efeito: "pop+1" }
  ]
};

/* Resultados de Batalha Simplificada */
export const RESULTADOS_BATALHA = [
  { margem: 10,   nome: "Vitória Total",    desc: "Invasores repelidos. Você ganha espólios de 1d6 LO." },
  { margem: 5,    nome: "Vitória",          desc: "Invasores repelidos." },
  { margem: 0,    nome: "Vitória Apertada", desc: "Invasores repelidos, ao custo de vidas: o domínio perde 1d3 unidades." },
  { margem: -5,   nome: "Derrota",          desc: "Invasores saqueiam a terra: o domínio perde 1d3+1 unidades e 2d6 LO." },
  { margem: -10,  nome: "Derrota Grave",    desc: "Invasores queimam propriedades: perde 1d4+1 unidades, 3d6 LO e uma construção aleatória." },
  { margem: -999, nome: "Massacre",         desc: "Invasores massacram o povo: perde 2d4+1 unidades, 4d6 LO, uma construção aleatória e um nível." }
];

/* Perícias usadas pelo módulo (rótulos de segurança caso CONFIG.T20 mude) */
export const PERICIAS_FALLBACK = {
  atua: "Atuação", dipl: "Diplomacia", enga: "Enganação", guer: "Guerra",
  inti: "Intimidação", intu: "Intuição", inve: "Investigação", mist: "Misticismo",
  nobr: "Nobreza", reli: "Religião", sobr: "Sobrevivência",
  fort: "Fortitude", refl: "Reflexos", vont: "Vontade", inic: "Iniciativa",
  perc: "Percepção", ofic: "Ofício"
};

export function labelPericia(key) {
  return CONFIG?.T20?.pericias?.[key]?.label ?? PERICIAS_FALLBACK[key] ?? key;
}

/* ------------------------------------------------------------------ */
/* Homebrews                                                          */
/* ------------------------------------------------------------------ */

/** Caminhos comuns para o construtor de homebrews. */
export function caminhosSugeridos() {
  const configPericias = CONFIG?.T20?.pericias ?? {};
  const pericias = Object.keys(configPericias).length
    ? Object.fromEntries(Object.entries(configPericias).map(([k, v]) => [k, v.label ?? k]))
    : PERICIAS_FALLBACK;
  return [
    { key: "system.attributes.pv.bonus.total", rotulo: "PV máximos" },
    { key: "system.attributes.pm.bonus.total", rotulo: "PM máximos" },
    { key: "system.attributes.defesa.bonus", rotulo: "Defesa (bônus)" },
    { key: "system.attributes.cd", rotulo: "CD de habilidades" },
    { key: "system.modificadores.pericias.resistencia", rotulo: "Testes de resistência (use +N)" },
    { key: "system.modificadores.pericias.geral", rotulo: "Todas as perícias (use +N)" },
    { key: "system.modificadores.pericias.ataque", rotulo: "Testes de ataque (use +N)" },
    { key: "system.modificadores.dano.geral", rotulo: "Todo dano (use +N)" },
    ...Object.entries(pericias).map(([k, v]) => ({ key: `system.pericias.${k}.bonus`, rotulo: `Perícia: ${v}` }))
  ];
}

/**
 * Catálogo unificado: construções oficiais + homebrews do domínio (★).
 * Aceita o ator Domínio ou qualquer objeto com { system }.
 *
 * Sem homebrews devolve o catálogo estático direto; com homebrews, a
 * mescla de ~90 entradas fica cacheada por referência do array (o
 * DataModel recria o array a cada update, invalidando sozinho). Antes
 * a mescla rodava a cada prepareDerivedData, render e construção.
 */
const _cacheConstrucoes = new WeakMap();

export function obterConstrucoes(dominio) {
  const homebrews = dominio?.system?.homebrew?.construcoes;
  if (!homebrews?.length) return CONSTRUCOES;
  let mesclado = _cacheConstrucoes.get(homebrews);
  if (!mesclado) {
    const extra = {};
    for (const hb of homebrews) extra[hb.key] = hb;
    mesclado = { ...CONSTRUCOES, ...extra };
    _cacheConstrucoes.set(homebrews, mesclado);
  }
  return mesclado;
}
