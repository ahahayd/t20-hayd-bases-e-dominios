/**
 * t20-hayd-dominios | tabelas.mjs
 * Gera RollTables no mundo para uso manual do mestre
 * (Tabela 4-13: Eventos Aleatórios e subtabelas 1d6).
 */
import { MODULO, EVENTOS, SUBEVENTOS } from "./catalogo.mjs";

const PASTA = "Heróis de Arton — Domínios";

async function obterPasta() {
  let pasta = game.folders.find(f => f.type === "RollTable" && f.name === PASTA);
  if (!pasta) pasta = await Folder.create({ name: PASTA, type: "RollTable" });
  return pasta;
}

function resultado(range, texto) {
  return {
    type: CONST.TABLE_RESULT_TYPES.TEXT,
    range,
    text: texto,
    weight: 1
  };
}

export async function criarTabelas() {
  if (!game.user.isGM) return ui.notifications.warn("Apenas o mestre pode criar as tabelas.");
  const pasta = await obterPasta();
  const existentes = game.tables.filter(t => t.folder?.id === pasta.id).map(t => t.name);
  const criadas = [];

  const definicoes = [
    {
      name: "Eventos de Domínio (1d%)",
      formula: "1d100",
      description: "Tabela 4-13 do Heróis de Arton. Role na Etapa 1 do turno de domínio (apenas domínios de nível 3+). Madeireiras impõem –10% e minas –20% na rolagem; com um Aqueduto, role duas vezes e use o melhor resultado.",
      results: EVENTOS.map(e => resultado([e.min, e.max], `<strong>${e.nome}.</strong> ${e.desc}`))
    },
    {
      name: "Fenômeno Natural (1d6)",
      formula: "1d6",
      description: "Subtabela do evento Fenômeno Natural.",
      results: SUBEVENTOS.natural.map(e => resultado([e.min, e.max], e.desc))
    },
    {
      name: "Fenômeno Mágico (1d6)",
      formula: "1d6",
      description: "Subtabela do evento Fenômeno Mágico.",
      results: SUBEVENTOS.magico.map(e => resultado([e.min, e.max], e.desc))
    },
    {
      name: "Regalia (1d6)",
      formula: "1d6",
      description: "Subtabela do evento Regalia.",
      results: SUBEVENTOS.regalia.map(e => resultado([e.min, e.max], e.desc))
    }
  ];

  for (const def of definicoes) {
    if (existentes.includes(def.name)) continue;
    await RollTable.create({
      name: def.name,
      folder: pasta.id,
      formula: def.formula,
      replacement: true,
      displayRoll: true,
      description: def.description,
      results: def.results
    });
    criadas.push(def.name);
  }

  if (criadas.length) {
    ui.notifications.info(`Domínios: ${criadas.length} tabela(s) criada(s) na pasta "${PASTA}".`);
    console.debug(`${MODULO} | Tabelas criadas:`, criadas);
  } else {
    ui.notifications.info("As tabelas de domínio já existem no mundo.");
  }
}
