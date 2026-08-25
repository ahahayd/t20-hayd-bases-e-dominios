/**
 * t20-hayd-dominios | efeitos.mjs
 * Transferência de benefícios do domínio para o regente via Efeitos Ativos.
 * Usa os caminhos oficiais do sistema Tormenta20 (system.pericias.*.value,
 * system.attributes.pv/pm.bonus.total, system.modificadores.*, etc).
 */
import { MODULO, obterConstrucoes } from "./catalogo.mjs";

const OVERRIDE = 5;

/** Recupera o ator regente vinculado ao domínio (ou null). */
export async function obterRegente(dominio) {
  const uuid = dominio.system.regenteUuid;
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc instanceof Actor ? doc : null;
  } catch (err) {
    console.debug(`${MODULO} | Regente não encontrado para uuid=${uuid}`, err);
    return null;
  }
}

/** Monta a definição de Efeito Ativo de uma construção instalada. */
function montarEfeitoConstrucao(dominio, entrada) {
  const def = obterConstrucoes(dominio)[entrada.key];
  if (!def?.efeito) return null;

  let changes = foundry.utils.deepClone(def.efeito.changes ?? []);

  // Construções com escolha (ex.: Biblioteca → perícia treinada)
  if (def.efeito.escolha === "pericia") {
    if (!entrada.escolha) return null; // sem escolha configurada, sem efeito
    changes = [{ key: `system.pericias.${entrada.escolha}.treinado`, mode: OVERRIDE, value: "true" }];
  }
  if (!changes.length) return null;

  return {
    name: `Domínio: ${def.nome}`,
    img: `modules/${MODULO}/assets/dominio.svg`,
    disabled: false,
    transfer: false,
    description: `<p>${def.beneficio}.${def.efeito.nota ? ` <em>${def.efeito.nota}</em>` : ""}</p><p><em>Benefício concedido pelo domínio ${dominio.name}.</em></p>`,
    changes,
    flags: {
      [MODULO]: { dominioUuid: dominio.uuid, origem: entrada.id },
      tormenta20: { onuse: false }
    }
  };
}

/** Efeito de PM extra de domínio místico (nível²). */
function montarEfeitoMistico(dominio) {
  const pm = dominio.system.pmMistico;
  if (!pm) return null;
  return {
    name: `Domínio Místico: ${dominio.name} (nível ${dominio.system.nivel})`,
    img: `modules/${MODULO}/assets/mistico.svg`,
    disabled: false,
    transfer: false,
    description: `<p>+${pm} pontos de mana (nível do domínio ao quadrado). Recebidos mesmo fora do domínio.</p>`,
    changes: [{ key: "system.attributes.pm.bonus.total", mode: 2, value: String(pm) }],
    flags: {
      [MODULO]: { dominioUuid: dominio.uuid, origem: "mistico" },
      tormenta20: { onuse: false }
    }
  };
}

/**
 * Sincroniza os efeitos do domínio no regente:
 * remove os efeitos antigos deste domínio e recria os atualmente ativos.
 */
export async function sincronizarEfeitos(dominio, { silencioso = false } = {}) {
  const regente = await obterRegente(dominio);
  if (!regente) {
    if (!silencioso) ui.notifications.warn("Nenhum regente vinculado ao domínio.");
    return { criados: 0, removidos: 0 };
  }

  const desejados = [];
  for (const entrada of dominio.system.construcoes) {
    if (entrada.efeitoAtivo === false) continue;
    const ef = montarEfeitoConstrucao(dominio, entrada);
    if (ef) desejados.push(ef);
  }
  const mistico = (dominio.system.tipo === "mistico") ? montarEfeitoMistico(dominio) : null;
  if (mistico) desejados.push(mistico);

  const antigos = regente.effects.filter(e => e.getFlag(MODULO, "dominioUuid") === dominio.uuid);
  if (antigos.length) {
    await regente.deleteEmbeddedDocuments("ActiveEffect", antigos.map(e => e.id));
  }
  if (desejados.length) {
    await regente.createEmbeddedDocuments("ActiveEffect", desejados);
  }

  console.debug(`${MODULO} | Sincronização de efeitos: ${antigos.length} removidos, ${desejados.length} criados em ${regente.name}.`);
  if (!silencioso) {
    ui.notifications.info(`Domínio: ${desejados.length} benefício(s) sincronizado(s) com ${regente.name}.`);
  }
  return { criados: desejados.length, removidos: antigos.length };
}

/** Remove todos os efeitos deste domínio do regente. */
export async function removerEfeitos(dominio) {
  const regente = await obterRegente(dominio);
  if (!regente) return;
  const antigos = regente.effects.filter(e => e.getFlag(MODULO, "dominioUuid") === dominio.uuid);
  if (antigos.length) await regente.deleteEmbeddedDocuments("ActiveEffect", antigos.map(e => e.id));
  ui.notifications.info(`Domínio: ${antigos.length} efeito(s) removido(s) de ${regente.name}.`);
}
