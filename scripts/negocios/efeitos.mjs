/**
 * t20-hayd-bases-e-dominios | negocios/efeitos.mjs
 * Distribui os benefícios dos ativos do negócio para o dono e o grupo
 * (frequentadores) via Efeitos Ativos, com os mesmos caminhos e o mesmo
 * formato de efeitos de uso das Bases.
 */
import { MODULO, MODOS_EFEITO, obterAtivos, tipoConjurador, labelPericia } from "./catalogo.mjs";
import { obterMorador } from "../bases/efeitos.mjs";

const { ADD } = MODOS_EFEITO;
const ICONE = `modules/${MODULO}/assets/negocio.svg`;
const PREFIXO = "Negócio: ";

export { obterMorador as obterFrequentador };

const AVISO_ESTRUTURA = "Benefícios de estruturas não se acumulam com os de bases e domínios.";

function idBeneficio(origem, nome, tipo, detalhes) {
  return `${origem}|${tipo}|${nome}|${JSON.stringify(detalhes)}`;
}

function novoEfeito(negocio, nome, descricao, changes, origem) {
  const beneficioId = idBeneficio(origem, nome, "passivo",
    changes.map(c => ({ key: c.key, mode: c.mode })));
  return {
    name: `${PREFIXO}${nome}`,
    img: ICONE,
    disabled: false,
    transfer: false,
    description: `<p>${descricao}</p><p><em>Benefício do negócio ${negocio.name}. ${AVISO_ESTRUTURA}</em></p>`,
    changes,
    flags: {
      [MODULO]: { negocioUuid: negocio.uuid, origem, beneficioId },
      tormenta20: { onuse: false }
    }
  };
}

const ESCOPOS_USO = {
  atributo: "ability", pericia: "skill", ataque: "attack",
  magia: "spell", poder: "power", consumivel: "consumable", equipamento: "equipment"
};

function novoEfeitoUso(negocio, nome, descricao, uso, items, origem) {
  const t20 = { onuse: true, durationScene: false, custo: uso.custo ?? "" };
  for (const esc of uso.escopos ?? []) t20[ESCOPOS_USO[esc] ?? esc] = true;
  if (items) t20.items = items;
  const changes = uso.changes?.length ? foundry.utils.deepClone(uso.changes) : [];
  const beneficioId = idBeneficio(origem, nome, "uso", {
    changes: changes.map(c => ({ key: c.key, mode: c.mode })),
    escopos: uso.escopos ?? [], items: items ?? "", custo: uso.custo ?? ""
  });
  return {
    name: `${PREFIXO}${nome}`,
    img: ICONE,
    disabled: true,
    transfer: false,
    origin: negocio.uuid,
    description: `<p>${descricao}.</p><p><em>Efeito de uso do negócio ${negocio.name} — marque-o na janela de rolagem quando se aplicar.</em></p>`,
    changes,
    flags: {
      [MODULO]: { negocioUuid: negocio.uuid, origem, beneficioId },
      tormenta20: t20
    }
  };
}

/** Efeitos de um único ativo (a Espionagem Industrial reaproveita esta função). */
function efeitosDoAtivo(negocio, def, escolha, origem, conjurador, sufixo = "") {
  const efeitos = [];
  const nome = `${def.nome}${sufixo}`;

  for (const uso of def.efeitosUso ?? []) {
    const items = uso.itemsDaEscolha ? escolha : uso.items;
    if (uso.itemsDaEscolha && !escolha) continue;
    const rotulo = uso.itemsDaEscolha ? `${nome} (${escolha})` : nome;
    efeitos.push(novoEfeitoUso(negocio, rotulo, uso.desc ?? def.beneficio, uso, items, origem));
  }

  const bloco = def.efeito;
  if (!bloco) return efeitos;
  if (def.conjurador && !conjurador?.[def.conjurador]) return efeitos;

  let changes = bloco.changes ? foundry.utils.deepClone(bloco.changes) : [];
  let rotulo = nome;
  if (bloco.escolha === "social") {
    if (!escolha) return efeitos;
    changes = [{ key: `system.pericias.${escolha}.bonus`, mode: ADD, value: "1" }];
    rotulo = `${nome} (${labelPericia(escolha)})`;
  }
  if (!changes.length) return efeitos;
  efeitos.push(novoEfeito(negocio, rotulo,
    `${def.beneficio}.${bloco.nota ? ` <em>${bloco.nota}</em>` : ""}`,
    changes, origem));
  return efeitos;
}

/**
 * Lista de efeitos que UM frequentador deve receber. O ator é usado para
 * saber se ele é conjurador arcano/divino (Altar e Círculo de Poder).
 */
export function montarEfeitosPara(negocio, ator) {
  const s = negocio.system;
  const cat = obterAtivos(negocio);
  const conjurador = tipoConjurador(ator);
  const efeitos = [];

  for (const entrada of s.ativos) {
    if (entrada.ativo === false || s.ativosExcedentes.has(entrada.id)) continue;
    const def = cat[entrada.key];
    if (!def) continue;
    const origem = `ativo:${entrada.id}`;

    if (def.escolha === "ativo") {
      const alvo = cat[entrada.escolha];
      if (!alvo || s.possuiAtivo(entrada.escolha) || alvo.escolha === "ativo") continue;
      efeitos.push(...efeitosDoAtivo(negocio, alvo, entrada.escolhaSub, `${origem}:espionagem`,
        conjurador, " (Espionagem)"));
      continue;
    }
    efeitos.push(...efeitosDoAtivo(negocio, def, entrada.escolha, origem, conjurador));
  }
  return efeitos;
}

async function limparEfeitosDe(negocio, ator) {
  const antigos = ator.effects.filter(e => e.getFlag(MODULO, "negocioUuid") === negocio.uuid);
  if (antigos.length) await ator.deleteEmbeddedDocuments("ActiveEffect", antigos.map(e => e.id));
  return antigos.length;
}

/** Recria os efeitos do negócio em todos os frequentadores com acesso. */
export async function sincronizarEfeitos(negocio, { silencioso = false } = {}) {
  const resultados = await Promise.all(negocio.system.frequentadores.map(async (freq) => {
    const ator = await obterMorador(freq.uuid);
    if (!ator) return null;
    const removidos = await limparEfeitosDe(negocio, ator);
    if (freq.receberEfeitos === false) return { removidos, criados: 0, conta: false };
    const desativados = new Set(freq.beneficiosDesativados ?? []);
    const efeitos = montarEfeitosPara(negocio, ator)
      .filter(efeito => !desativados.has(efeito.flags?.[MODULO]?.beneficioId));
    if (efeitos.length) await ator.createEmbeddedDocuments("ActiveEffect", efeitos);
    return { removidos, criados: efeitos.length, conta: true };
  }));

  let criados = 0, removidos = 0, atores = 0;
  for (const r of resultados) {
    if (!r) continue;
    removidos += r.removidos;
    criados += r.criados;
    if (r.conta) atores++;
  }
  console.debug(`${MODULO} | Negócio: ${removidos} efeitos removidos, ${criados} criados em ${atores} frequentador(es).`);
  if (!silencioso) ui.notifications.info(`Negócio: benefícios sincronizados com ${atores} frequentador(es) (${criados} efeitos).`);
  return { criados, removidos, atores };
}

/** Remove os efeitos do negócio de todos os frequentadores (e de um extra opcional). */
export async function removerEfeitos(negocio, uuidExtra = null) {
  const uuids = new Set(negocio.system.frequentadores.map(r => r.uuid));
  if (uuidExtra) uuids.add(uuidExtra);
  const contagens = await Promise.all([...uuids].map(async (uuid) => {
    const ator = await obterMorador(uuid);
    return ator ? limparEfeitosDe(negocio, ator) : 0;
  }));
  return contagens.reduce((t, n) => t + n, 0);
}

/**
 * Caminhos que o ator já recebe de bases e domínios — usados para avisar,
 * na lista de benefícios, quando um bônus do negócio não se acumularia.
 */
export function caminhosDeOutrasEstruturas(ator) {
  const mapa = new Map();
  for (const efeito of ator?.effects ?? []) {
    const flags = efeito.flags?.[MODULO];
    if (!flags || flags.negocioUuid) continue;
    if (!flags.baseUuid && !flags.dominioUuid) continue;
    if (efeito.flags?.tormenta20?.onuse) continue;
    for (const change of efeito.changes ?? []) {
      if (!mapa.has(change.key)) mapa.set(change.key, efeito.name);
    }
  }
  return mapa;
}
