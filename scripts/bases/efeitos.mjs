/**
 * tormenta20-bases | efeitos.mjs
 * Distribui os benefícios da base (tipo, cômodos e mobílias) para os
 * moradores via Efeitos Ativos, usando os caminhos oficiais do sistema.
 *
 * Bônus numéricos de perícia usam SEMPRE system.pericias.X.bonus.
 */
import { MODULO, TIPOS, obterComodos, obterMobilias, MODOS_EFEITO } from "./catalogo.mjs";

const { ADD, OVERRIDE } = MODOS_EFEITO;
const ICONE = `modules/${MODULO}/assets/base.svg`;

/** Resolve um residente registrado para o documento Actor. */
export async function obterMorador(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc instanceof Actor ? doc : null;
  } catch (err) {
    console.debug(`${MODULO} | Morador não encontrado: ${uuid}`, err);
    return null;
  }
}

function novoEfeito(base, nome, descricao, changes, origem) {
  return {
    name: `Base: ${nome}`,
    img: ICONE,
    disabled: false,
    transfer: false,
    description: `<p>${descricao}</p><p><em>Benefício da base ${base.name}.</em></p>`,
    changes,
    flags: {
      [MODULO]: { baseUuid: base.uuid, origem },
      tormenta20: { onuse: false }
    }
  };
}

/* Escopos do catálogo → flags de tipo de rolagem do sistema Tormenta20. */
const ESCOPOS_USO = {
  atributo: "ability", pericia: "skill", ataque: "attack",
  magia: "spell", poder: "power", consumivel: "consumable", equipamento: "equipment"
};

/**
 * Efeito de uso: Efeito Ativo com flag tormenta20.onuse que aparece como
 * opção (desmarcada) na janela de rolagem do sistema para o tipo de
 * rolagem correspondente. Não é aplicado passivamente à ficha.
 */
function novoEfeitoUso(base, nome, descricao, uso, origem) {
  const t20 = { onuse: true, durationScene: false, custo: uso.custo ?? "" };
  for (const esc of uso.escopos ?? []) t20[ESCOPOS_USO[esc] ?? esc] = true;
  if (uso.items) t20.items = uso.items;
  return {
    name: `Base: ${nome}`,
    img: ICONE,
    disabled: true,
    transfer: false,
    origin: base.uuid,
    description: `<p>${descricao}.</p><p><em>Efeito de uso da base ${base.name} — marque-o na janela de rolagem quando se aplicar.</em></p>`,
    changes: uso.changes?.length ? foundry.utils.deepClone(uso.changes) : [],
    flags: {
      [MODULO]: { baseUuid: base.uuid, origem },
      tormenta20: t20
    }
  };
}

/**
 * Calcula a lista de efeitos que UM morador específico deve receber.
 * Casos especiais: suítes (+ colchão, espelho, banheira), ídolo dourado,
 * mapa-múndi, bigorna, relíquia abençoada e homebrews.
 */
export function montarEfeitosPara(base, uuidMorador) {
  const s = base.system;
  const catC = obterComodos(base);
  const catM = obterMobilias(base);
  const efeitos = [];

  /* ------------------------- Tipo da base ------------------------- */
  const tipo = TIPOS[s.tipo];
  if (tipo?.efeito?.changes?.length) {
    efeitos.push(novoEfeito(base, tipo.nome,
      `${tipo.beneficio}.${tipo.efeito.nota ? ` <em>${tipo.efeito.nota}</em>` : ""}`,
      foundry.utils.deepClone(tipo.efeito.changes), `tipo:${s.tipo}`));
  }

  /* -------------------------- Cômodos ----------------------------- */
  for (const com of s.comodos) {
    if (com.danificado || com.ativo === false) continue;
    const def = catC[com.key];
    if (!def) continue;

    /* Efeitos de uso do cômodo (opções na janela de rolagem) */
    for (const uso of def.efeitosUso ?? []) {
      efeitos.push(novoEfeitoUso(base, uso.nome ?? def.nome, uso.desc ?? def.beneficio, uso, `comodo:${com.id}`));
    }

    /* Suíte: +3 PV (e extras de mobílias) apenas para os moradores atribuídos */
    if (def.escolha === "suite" || com.key === "suite") {
      const dormem = com.suiteResidentes ?? [];
      if (!dormem.includes(uuidMorador)) continue;
      let pv = 3;
      const changes = [];
      const extras = [];
      for (const m of s.mobilias.filter(x => x.comodoId === com.id && x.ativo !== false)) {
        const mDef = catM[m.key];
        if (mDef?.especial === "colchao") { pv += 3; extras.push("Colchão de Penas (+3 PV)"); }
        if (mDef?.efeitoPorLocal?.suite?.especial === "espelho-suite" || mDef?.especial === "espelho-suite") {
          changes.push({ key: "system.modificadores.pericias.atr.car", mode: ADD, value: "+1" });
          extras.push("Espelho de Corpo (+1 em perícias de Carisma)");
        }
        /* Efeitos de uso restritos a quem dorme na suíte (ex.: Banheira) */
        for (const uso of mDef?.efeitosUsoSuite ?? []) {
          efeitos.push(novoEfeitoUso(base, mDef.nome, uso.desc ?? mDef.beneficio, uso, `mobilia:${m.id}`));
          extras.push(`${mDef.nome} (efeito de uso)`);
        }
      }
      changes.unshift({ key: "system.attributes.pv.bonus.total", mode: ADD, value: String(pv) });
      efeitos.push(novoEfeito(base, def.nome,
        `+${pv} PV e descanso confortável.${extras.length ? ` Inclui: ${extras.join(", ")}.` : ""}`,
        changes, `comodo:${com.id}`));
      continue;
    }

    /* Cômodo comum com efeito */
    let changes = def.efeito?.changes ? foundry.utils.deepClone(def.efeito.changes) : [];
    if (def.efeito?.escolha === "pericia") {
      if (!com.escolha) continue;
      changes = [{ key: `system.pericias.${com.escolha}.treinado`, mode: OVERRIDE, value: "true" }];
    }
    if (!changes.length) continue;
    efeitos.push(novoEfeito(base, def.nome,
      `${def.beneficio}.${def.efeito?.nota ? ` <em>${def.efeito.nota}</em>` : ""}`,
      changes, `comodo:${com.id}`));
  }

  /* -------------------------- Mobílias ---------------------------- */
  for (const mob of s.mobilias) {
    if (mob.ativo === false) continue;
    const def = catM[mob.key];
    if (!def) continue;
    if (def.especial === "gargula" || def.especial === "colchao") continue; // tratados alhures

    /* A mobília só funciona se o cômodo em que está estiver íntegro */
    let com = null;
    let localKey = null;
    if (mob.comodoId && mob.comodoId !== "exterior") {
      com = s.comodos.find(c => c.id === mob.comodoId);
      if (!com || com.danificado || com.ativo === false) continue;
      localKey = com.key;
      /* Colchão e espelho de suíte são resolvidos junto ao cômodo; a
       * banheira é manual. Demais mobílias funcionam normalmente. */
    }

    /* Efeitos de uso da mobília (gerais e dependentes do cômodo) */
    for (const uso of def.efeitosUso ?? []) {
      efeitos.push(novoEfeitoUso(base, uso.nome ?? def.nome, uso.desc ?? def.beneficio, uso, `mobilia:${mob.id}`));
    }
    for (const uso of (localKey && def.efeitosUsoPorLocal?.[localKey]) || []) {
      efeitos.push(novoEfeitoUso(base, uso.nome ?? def.nome, uso.desc ?? def.beneficio, uso, `mobilia:${mob.id}`));
    }

    /* Ídolo Dourado: +1 no primeiro bônus de perícia do cômodo */
    if (def.especial === "idolo") {
      const alvo = com ? catC[com.key] : null;
      const perChange = alvo?.efeito?.changes?.find(c => /system\.pericias\..+\.bonus/.test(c.key));
      if (!perChange) continue;
      efeitos.push(novoEfeito(base, `${def.nome} (${alvo.nome})`,
        `${def.beneficio}.`,
        [{ key: perChange.key, mode: ADD, value: "1" }], `mobilia:${mob.id}`));
      continue;
    }

    /* Efeito dependente do cômodo (bigorna, mapa-múndi, espelho, relíquia) */
    let bloco = def.efeito ?? null;
    if (def.efeitoPorLocal && localKey) bloco = def.efeitoPorLocal[localKey] ?? null;
    if (!bloco || bloco.manual || bloco.especial) continue;

    let changes = bloco.changes ? foundry.utils.deepClone(bloco.changes) : [];
    if (bloco.escolha === "pericia") {
      if (!mob.escolha) continue;
      changes = [{ key: `system.pericias.${mob.escolha}.treinado`, mode: OVERRIDE, value: "true" }];
    }
    if (!changes.length) continue;
    efeitos.push(novoEfeito(base, def.nome,
      `${def.beneficio}.${bloco.nota ? ` <em>${bloco.nota}</em>` : ""}`,
      changes, `mobilia:${mob.id}`));
  }

  return efeitos;
}

/** Remove os efeitos desta base de um ator específico. */
async function limparEfeitosDe(base, ator) {
  const antigos = ator.effects.filter(e => e.getFlag(MODULO, "baseUuid") === base.uuid);
  if (antigos.length) await ator.deleteEmbeddedDocuments("ActiveEffect", antigos.map(e => e.id));
  return antigos.length;
}

/**
 * Sincroniza os efeitos da base em todos os moradores marcados para
 * receber benefícios (recria do zero para refletir o estado atual).
 */
export async function sincronizarEfeitos(base, { silencioso = false } = {}) {
  /* Moradores são atores independentes: o trabalho de cada um roda em
   * paralelo (a ordem remover→criar é preservada DENTRO de cada ator).
   * Em série, cada morador somava 2–3 idas ao servidor à espera total. */
  const resultados = await Promise.all(base.system.residentes.map(async (res) => {
    const ator = await obterMorador(res.uuid);
    if (!ator) return null;
    const removidos = await limparEfeitosDe(base, ator);
    if (res.receberEfeitos === false) return { removidos, criados: 0, conta: false };
    const efeitos = montarEfeitosPara(base, res.uuid);
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
  console.debug(`${MODULO} | Sincronização: ${removidos} efeitos removidos, ${criados} criados em ${atores} morador(es).`);
  if (!silencioso) ui.notifications.info(`Base: benefícios sincronizados com ${atores} morador(es) (${criados} efeitos).`);
  return { criados, removidos, atores };
}

/** Remove os efeitos da base de todos os moradores (e de um extra opcional). */
export async function removerEfeitos(base, uuidExtra = null) {
  const uuids = new Set(base.system.residentes.map(r => r.uuid));
  if (uuidExtra) uuids.add(uuidExtra);
  const contagens = await Promise.all([...uuids].map(async (uuid) => {
    const ator = await obterMorador(uuid);
    return ator ? limparEfeitosDe(base, ator) : 0;
  }));
  const removidos = contagens.reduce((t, n) => t + n, 0);
  console.debug(`${MODULO} | ${removidos} efeito(s) removido(s).`);
  return removidos;
}
