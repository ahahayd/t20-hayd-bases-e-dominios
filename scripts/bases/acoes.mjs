/**
 * tormenta20-bases | acoes.mjs
 * Ações entre aventuras e rotinas da base (Heróis de Arton, cap. 3):
 * fundar/ampliar porte, reformar tipo, construir/reparar cômodos,
 * adquirir mobílias, manutenção no início de aventura e empreendimento.
 */
import {
  MODULO, PORTES, ORDEM_PORTES, TIPOS, CUSTO_COMODO, rankPorte,
  obterComodos, obterMobilias, labelPericia, temaHayd
} from "./catalogo.mjs";
import { sincronizarEfeitos, obterMorador } from "./efeitos.mjs";
import { htmlDesfechoObra } from "../correcao-obras.mjs";
import { pedirTeste } from "../teste-remoto.mjs";

const { DialogV2 } = foundry.applications.api;

/* ================================================================== */
/* Utilitários                                                        */
/* ================================================================== */

async function rolar(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll;
}

export function fmtTS(v) {
  return `T$ ${Number(v).toLocaleString("pt-BR")}`;
}

/** Peso do item no inventário: "espaços por unidade/total" (ex.: 0,5/1,5). */
export function fmtPeso(espacos, qtd) {
  const un = Number(espacos) || 0;
  const f = (v) => Number(v.toFixed(2)).toLocaleString("pt-BR");
  return `${f(un)}/${f(un * (Number(qtd) || 0))}`;
}

export async function cartao(base, titulo, corpo, { rolls = [], flagsModulo = {} } = {}) {
  const content = `
    <div class="t20b-chat${temaHayd() ? " tema-hayd" : ""}">
      <header class="t20b-chat-header">
        <img src="${base.img}" alt="">
        <div><h3>${titulo}</h3><span>${base.name}</span></div>
      </header>
      <div class="t20b-chat-body">${corpo}</div>
    </div>`;
  return ChatMessage.create({
    content, rolls,
    speaker: { alias: base.name },
    flags: { [MODULO]: { base: base.uuid, ...flagsModulo } }
  });
}

/**
 * O Caixa do Grupo É o conjunto de moedas da base (system.dinheiro):
 * o saldo é o valor total de TO/T$/TC e toda movimentação altera as moedas.
 * O histórico continua registrado em system.caixa.historico.
 */

/** Saldo do caixa da base, em décimos de T$. */
export function saldoCaixaDecimos(base) {
  return totalDecimos(base.system.dinheiro);
}

/** Registra uma movimentação no caixa do grupo (delta em T$; aceita décimos). */
export async function movimentarCaixa(base, desc, delta) {
  const deltaDec = Math.round(delta * 10);
  const atual = base.system.dinheiro;
  let nova;
  if (deltaDec >= 0) {
    nova = somarNaCarteira(atual, deltaDec);
  } else {
    nova = subtrairDaCarteira(atual, -deltaDec);
    if (!nova) {
      ui.notifications.error(`Caixa insuficiente: são necessários ${fmtTS(-delta)}.`);
      return null;
    }
  }
  const novoTotal = totalDecimos(nova) / 10;
  const historico = [...base.system.caixa.historico];
  historico.push({
    aventura: base.system.aventura.numero,
    data: new Date().toLocaleDateString("pt-BR"),
    usuario: game.user.name,
    desc, delta: deltaDec / 10, saldo: novoTotal
  });
  while (historico.length > 120) historico.shift();
  await base.update({
    "system.dinheiro": { tc: nova.tc, tp: nova.tp, to: nova.to },
    "system.caixa.historico": historico
  });
  console.debug(`${MODULO} | Caixa: ${desc} (${delta >= 0 ? "+" : ""}${delta}) → ${novoTotal}`);
  return novoTotal;
}

/**
 * Cobra um custo: desconta do caixa se pedido; caso contrário apenas
 * registra que foi pago com recursos externos (dinheiro dos personagens).
 */
export async function pagarCusto(base, custo, desc, doCaixa) {
  if (custo <= 0) return true;
  if (doCaixa) {
    if (saldoCaixaDecimos(base) < custo * 10) {
      ui.notifications.error(`Caixa insuficiente: são necessários ${fmtTS(custo)}.`);
      return false;
    }
    await movimentarCaixa(base, desc, -custo);
  } else {
    await cartao(base, "Custo Pago", `<p>${desc}: <strong>${fmtTS(custo)}</strong> pagos com recursos dos personagens (fora do caixa).</p>`);
  }
  return true;
}

/* ================================================================== */
/* Teste de morador (ação entre aventuras)                            */
/* ================================================================== */

function opcoesMoradores(base) {
  return base.system.residentes
    .map(r => `<option value="${r.uuid}">${r.nome ?? r.uuid}</option>`)
    .join("");
}

function opcoesPericias(selecionada = "nobr") {
  const per = CONFIG?.T20?.pericias ?? {};
  const chaves = Object.keys(per).length ? Object.keys(per) : ["nobr"];
  return chaves
    .map(k => ({ k, rotulo: labelPericia(k) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map(({ k, rotulo }) => `<option value="${k}" ${k === selecionada ? "selected" : ""}>${rotulo}</option>`)
    .join("");
}

/**
 * Topo dos diálogos de teste: efeito, custo e falha em blocos separados,
 * para não parecer uma frase só. `descricao` segue aceito para textos livres.
 */
export function resumoTeste({ descricao = "", efeito = "", custo = "", falha = "" }) {
  const bloco = (icone, rotulo, texto, cls = "") => texto
    ? `<div class="t20b-resumo-linha ${cls}"><span class="t20b-resumo-rotulo"><i class="fa-solid ${icone}"></i> ${rotulo}</span><div>${texto}</div></div>`
    : "";
  return `<div class="t20b-resumo">
    ${descricao ? `<p class="t20b-resumo-desc">${descricao}</p>` : ""}
    ${bloco("fa-star", "Efeito", efeito)}
    ${bloco("fa-coins", "Custo", custo)}
    ${bloco("fa-triangle-exclamation", "Se falhar", falha, "t20b-resumo-falha")}
  </div>`;
}

/**
 * Diálogo padrão de teste: escolhe o morador, a perícia (padrão Nobreza,
 * mas as regras permitem outra perícia justificada), CD editável e se o
 * custo sai do caixa.
 */
export async function dialogoTeste(base, {
  titulo, descricao, efeito, custoTexto, falha, cd, custo = 0, pericia = "nobr", permitirPericia = true
}) {
  if (!base.system.residentes.length) {
    ui.notifications.warn("Adicione ao menos um morador à base (arraste um ator para a ficha).");
    return null;
  }
  const conteudo = `
    <div class="t20b-dialogo-teste">
      ${resumoTeste({ descricao, efeito, custo: custoTexto, falha })}
      <div class="t20b-dialogo-campos">
        <div class="form-group"><label>Morador</label>
          <select name="uuid">${opcoesMoradores(base)}</select></div>
        ${permitirPericia ? `<div class="form-group"><label>Perícia</label>
          <select name="pericia">${opcoesPericias(pericia)}</select></div>` : ""}
        <div class="form-group"><label>CD</label>
          <input type="number" name="cd" value="${cd}"></div>
      </div>
      ${custo > 0 ? `<label class="t20b-inline t20b-dialogo-check">
        <input type="checkbox" name="doCaixa" checked> Descontar ${fmtTS(custo)} do caixa da base</label>` : ""}
      <p class="notes">Ao rolar, abre a janela de rolagem do personagem — aplique lá os efeitos ativos e outros ajustes da ficha.</p>
    </div>`;
  return DialogV2.prompt({
    window: { title: titulo },
    position: { width: 480 },
    content: conteudo,
    ok: { label: "Rolar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
}

export async function executarTeste(base, dados, { rotulo }) {
  const morador = await obterMorador(dados.uuid);
  if (!morador) {
    ui.notifications.error("Morador não encontrado.");
    return null;
  }
  const bonus = Number(dados.bonus) || 0;
  let roll = null;

  /* Personagem de um jogador conectado: o teste é rolado na tela dele. */
  const remoto = await pedirTeste(morador, {
    acao: `realizar a ação “${rotulo}”`, local: base.name,
    pericia: dados.pericia, cd: dados.cd, rotulo
  });
  /* Recusa/sem resposta: o custo já foi pago, então quem disparou rola. */
  if (remoto === null) ui.notifications.info(`Rolando o teste de ${morador.name} aqui mesmo.`);
  if (remoto) {
    dados.pericia = remoto.pericia;
    roll = remoto.roll;
  }

  /* Rola pela ficha do personagem: abre a janela de rolagem do sistema,
   * onde o jogador pode aplicar efeitos ativos, modificadores e o modo
   * de rolagem, exatamente como ao rolar a perícia pela ficha. */
  if (!remoto && typeof morador.rollPericia === "function" && morador.system.pericias?.[dados.pericia]) {
    try {
      roll = await morador.rollPericia(dados.pericia, { message: false });
    } catch (err) {
      console.warn(`${MODULO} | Rolagem pela ficha falhou; usando rolagem simples.`, err);
      roll = null;
    }
    if (roll === undefined) {
      ui.notifications.info("Configuração de rolagem cancelada — rolando sem ajustes (o custo já foi pago).");
      roll = null;
    }
  }

  /* Reserva: rolagem simples com o valor da perícia. */
  if (!roll) {
    const valor = morador.system.pericias?.[dados.pericia]?.value ?? 0;
    roll = await rolar(`1d20 + ${valor}[${labelPericia(dados.pericia)}]`.replace(/\+ -/g, "- "));
  }

  const cd = Number(dados.cd) || 0;
  const total = roll.total + bonus;
  const sucesso = total >= cd;
  console.debug(`${MODULO} | ${rotulo}: ${morador.name} rolou ${total} vs CD ${cd} → ${sucesso ? "sucesso" : "falha"}`);
  return { roll, sucesso, cd, morador, bonus, total };
}

export function htmlTeste(t, pericia) {
  const cls = t.sucesso ? "t20b-bom" : "t20b-ruim";
  const conta = t.bonus
    ? `<strong>${t.roll.total}</strong> + ${t.bonus} (ajuda) = <strong>${t.total}</strong>`
    : `<strong>${t.total}</strong>`;
  return `<p>Teste de <strong>${labelPericia(pericia)}</strong> (${t.morador.name}): ${conta} vs CD ${t.cd} — <span class="${cls}" data-t20bd-resultado-teste><strong>${t.sucesso ? "SUCESSO" : "FALHA"}</strong></span></p>`;
}

/* ================================================================== */
/* Porte e reforma                                                    */
/* ================================================================== */

export async function acaoAumentarPorte(base) {
  const s = base.system;
  const rank = rankPorte(s.porte);
  if (rank >= ORDEM_PORTES.length - 1) return ui.notifications.warn("A base já é Suprema.");
  const atual = PORTES[s.porte];
  const proxKey = ORDEM_PORTES[rank + 1];
  const prox = PORTES[proxKey];
  const custo = prox.custo - atual.custo;
  const cd = 20 + prox.comodos;

  const dados = await dialogoTeste(base, {
    titulo: "Ampliar Porte",
    efeito: `A base passa de <strong>${atual.nome}</strong> para <strong>${prox.nome}</strong>: até ${prox.comodos} cômodos, manutenção de ${fmtTS(prox.manutencao)}.`,
    custoTexto: `<strong>${fmtTS(custo)}</strong> (diferença de preço) · CD ${cd} (20 + cômodos do novo porte) · 1 ação entre aventuras.`,
    falha: "O valor dos materiais é gasto. Dá para tentar de novo com outra ação e o mesmo valor.",
    cd, custo
  });
  if (!dados) return;
  if (!(await pagarCusto(base, custo, `Ampliação de porte (${prox.nome})`, dados.doCaixa))) return;

  const t = await executarTeste(base, dados, { rotulo: "Ampliar Porte" });
  if (!t) return;
  let corpo = htmlTeste(t, dados.pericia);
  if (t.sucesso) {
    await base.update({ "system.porte": proxKey });
    corpo += `<p class="t20b-bom">A base agora é <strong>${prox.nome}</strong>! Cômodos: até ${prox.comodos} · Manutenção: ${fmtTS(prox.manutencao)}.</p>`;
  } else {
    corpo += `<p>As obras fracassam e os materiais foram gastos. Tente novamente com outra ação entre aventuras e ${fmtTS(custo)}.</p>`;
  }
  await cartao(base, "Ação: Ampliar Porte", corpo, { rolls: [t.roll] });
}

export async function acaoReformar(base) {
  const s = base.system;
  const atual = TIPOS[s.tipo];
  const custo = Math.floor(PORTES[s.porte].custo / 2);
  const cd = 20 + s.comodos.length;

  const opcoes = Object.entries(TIPOS)
    .filter(([k]) => k !== s.tipo)
    .map(([k, v]) => `<option value="${k}">${v.nome} — ${v.beneficio}</option>`)
    .join("");

  const escolha = await DialogV2.prompt({
    window: { title: "Reformar a Base" },
    content: `<p>Trocar o tipo <strong>${atual.nome}</strong> por outro. Custo: metade do custo de construção do porte (<strong>${fmtTS(custo)}</strong>) · CD 20 + nº de cômodos (${s.comodos.length}).</p>
      <p class="notes">Cômodos que tenham o tipo anterior como pré-requisito são destruídos no processo.</p>
      <div class="form-group"><label>Novo tipo</label><select name="novoTipo">${opcoes}</select></div>`,
    ok: { label: "Continuar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
  if (!escolha?.novoTipo) return;

  const dados = await dialogoTeste(base, {
    titulo: `Reformar para ${TIPOS[escolha.novoTipo].nome}`,
    efeito: `A base deixa de ser <strong>${atual.nome}</strong> e passa a ser <strong>${TIPOS[escolha.novoTipo].nome}</strong>.`,
    custoTexto: `<strong>${fmtTS(custo)}</strong> · CD ${cd} (20 + cômodos construídos).`,
    falha: "O valor dos materiais é gasto.",
    cd, custo
  });
  if (!dados) return;
  if (!(await pagarCusto(base, custo, `Reforma (${TIPOS[escolha.novoTipo].nome})`, dados.doCaixa))) return;

  const t = await executarTeste(base, dados, { rotulo: "Reformar" });
  if (!t) return;
  let corpo = htmlTeste(t, dados.pericia);
  if (t.sucesso) {
    const catC = obterComodos(base);
    const destruidos = s.comodos.filter(c => catC[c.key]?.prereqTipo === s.tipo);
    const restantes = s.comodos.filter(c => catC[c.key]?.prereqTipo !== s.tipo);
    await base.update({ "system.tipo": escolha.novoTipo, "system.comodos": restantes });
    corpo += `<p class="t20b-bom">A base agora é do tipo <strong>${TIPOS[escolha.novoTipo].nome}</strong>.</p>`;
    if (destruidos.length) corpo += `<p class="t20b-ruim">Cômodos destruídos pela reforma: ${destruidos.map(c => catC[c.key]?.nome ?? c.key).join(", ")}.</p>`;
    await sincronizarEfeitos(base, { silencioso: true });
  } else {
    corpo += `<p>A reforma fracassa e os materiais foram gastos.</p>`;
  }
  await cartao(base, "Ação: Reformar a Base", corpo, { rolls: [t.roll] });
}

/* ================================================================== */
/* Cômodos                                                            */
/* ================================================================== */

/** Valida os pré-requisitos de um cômodo. Retorna string de erro ou null. */
export function validarComodo(base, key) {
  const s = base.system;
  const catalogo = obterComodos(base);
  const def = catalogo[key];
  if (!def) return "Cômodo desconhecido.";
  if (s.comodos.length >= s.maxComodos)
    return `Limite de cômodos do porte atingido (${s.maxComodos}).`;
  if (!def.repetivel && s.comodos.some(c => c.key === key))
    return "Este cômodo já existe na base.";
  if (def.prereqPorte && rankPorte(s.porte) < rankPorte(def.prereqPorte))
    return `Requer base ${PORTES[def.prereqPorte].nome} ou melhor.`;
  for (const p of def.prereqComodos ?? []) {
    if (!s.comodos.some(c => c.key === p)) return `Requer: ${catalogo[p]?.nome ?? p}.`;
  }
  if (def.prereqTipo && s.tipo !== def.prereqTipo)
    return `Requer base do tipo ${TIPOS[def.prereqTipo]?.nome ?? def.prereqTipo}.`;
  return null;
}

export async function acaoConstruirComodo(base, key) {
  const def = obterComodos(base)[key];
  const erro = validarComodo(base, key);
  if (erro) return ui.notifications.error(erro);

  const custo = def.custo ?? CUSTO_COMODO;
  const cd = 20 + base.system.maxComodos;
  const dados = await dialogoTeste(base, {
    titulo: `Construir: ${def.nome}`,
    efeito: `${def.beneficio}.`,
    custoTexto: `<strong>${fmtTS(custo)}</strong> · CD ${cd} (20 + cômodos que a base pode ter) · 1 ação entre aventuras.`,
    falha: "O valor é gasto. Dá para tentar de novo com outra ação e o custo do cômodo.",
    cd, custo
  });
  if (!dados) return;
  if (!(await pagarCusto(base, custo, `Construção: ${def.nome}`, dados.doCaixa))) return;

  const t = await executarTeste(base, dados, { rotulo: `Construir ${def.nome}` });
  if (!t) return;
  let corpo = htmlTeste(t, dados.pericia);
  const entrada = {
    id: foundry.utils.randomID(), key,
    danificado: false, ativo: true, escolha: null, suiteResidentes: []
  };
  const obra = {
    tipo: "base", atorUuid: base.uuid, nome: def.nome,
    sucesso: t.sucesso, configuravel: !!(def.escolha || def.efeito?.escolha),
    entrada, mobiliasDesvinculadas: []
  };
  if (t.sucesso) {
    const comodos = [...base.system.comodos];
    comodos.push(entrada);
    await base.update({ "system.comodos": comodos });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(base, { silencioso: true });
  }
  corpo += htmlDesfechoObra(obra);
  await cartao(base, "Ação: Construir Cômodo", corpo, {
    rolls: [t.roll], flagsModulo: { obra }
  });
}

export async function acaoRepararComodo(base, idComodo) {
  const com = base.system.comodos.find(c => c.id === idComodo);
  if (!com?.danificado) return;
  const def = obterComodos(base)[com.key];
  const custo = Math.floor((def?.custo ?? CUSTO_COMODO) / 2);

  const ok = await DialogV2.wait({
    window: { title: "Reparar Cômodo" },
    content: `<p>Reparar <strong>${def?.nome ?? com.key}</strong>? Requer 1 ação entre aventuras e <strong>${fmtTS(custo)}</strong> (metade do custo). Sem teste.</p>`,
    buttons: [
      { action: "caixa", label: `Pagar do caixa (${fmtTS(custo)})`, default: true },
      { action: "fora", label: "Pago pelos personagens" },
      { action: "cancelar", label: "Cancelar" }
    ]
  });
  if (!ok || ok === "cancelar") return;
  if (!(await pagarCusto(base, custo, `Reparo: ${def?.nome ?? com.key}`, ok === "caixa"))) return;

  const comodos = base.system.comodos.map(c => c.id === idComodo ? { ...c, danificado: false } : c);
  await base.update({ "system.comodos": comodos });
  await cartao(base, "Cômodo Reparado", `<p><strong>${def?.nome ?? com.key}</strong> volta a fornecer seus benefícios.</p>`);
  if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(base, { silencioso: true });
}

/* ================================================================== */
/* Mobílias                                                           */
/* ================================================================== */

/** Lista os cômodos válidos e com espaço para receber uma mobília. */
export function locaisDisponiveis(base, keyMobilia, ignorarMobiliaId = null) {
  const def = obterMobilias(base)[keyMobilia];
  if (!def) return [];
  if (def.locais === "exterior") return [{ id: "exterior", nome: "Exterior da base" }];
  const catC = obterComodos(base);
  return base.system.comodos
    .filter(c => !def.locais || def.locais.includes(c.key))
    .filter(c => {
      const cap = catC[c.key]?.capacidade ?? 1;
      const ocupadas = base.system.mobilias.filter(m => m.comodoId === c.id && m.id !== ignorarMobiliaId).length;
      return ocupadas < cap;
    })
    .map(c => ({ id: c.id, nome: `${catC[c.key]?.nome ?? c.key}${catC[c.key]?.repetivel ? ` (${c.id.slice(0, 4)})` : ""}` }));
}

export function validarMobilia(base, key) {
  const def = obterMobilias(base)[key];
  if (!def) return "Mobília desconhecida.";
  if (def.especial === "gargula") {
    if (base.system.gargulas >= base.system.maxGargulas)
      return base.system.maxGargulas <= 0
        ? "Gárgulas exigem base Formidável ou melhor (1 por categoria acima de Básico)."
        : `Limite de gárgulas atingido (${base.system.maxGargulas}).`;
    return null;
  }
  if (!locaisDisponiveis(base, key).length)
    return "Nenhum cômodo válido com espaço disponível.";
  return null;
}

export async function acaoAdquirirMobilia(base, key) {
  const def = obterMobilias(base)[key];
  const erro = validarMobilia(base, key);
  if (erro) return ui.notifications.error(erro);

  const locais = locaisDisponiveis(base, key);
  const opcoes = locais.map(l => `<option value="${l.id}">${l.nome}</option>`).join("");
  const dados = await DialogV2.prompt({
    window: { title: `Adquirir: ${def.nome}` },
    content: `<p>${def.beneficio}.</p>
      <p>Preço: <strong>${fmtTS(def.preco ?? 0)}</strong> (mobílias são itens comuns: podem ser compradas, fabricadas ou encontradas como tesouro).</p>
      <div class="form-group"><label>Instalar em</label><select name="comodoId">${opcoes}</select></div>
      <div class="form-group"><label class="t20b-inline"><input type="checkbox" name="doCaixa" checked> Descontar do caixa da base</label></div>
      <div class="form-group"><label class="t20b-inline"><input type="checkbox" name="gratis"> Obtida sem custo (tesouro, fabricação já paga…)</label></div>`,
    ok: { label: "Adquirir", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
  if (!dados) return;

  if (!dados.gratis && (def.preco ?? 0) > 0) {
    if (!(await pagarCusto(base, def.preco, `Mobília: ${def.nome}`, dados.doCaixa))) return;
  }
  const mobilias = [...base.system.mobilias];
  mobilias.push({ id: foundry.utils.randomID(), key, comodoId: dados.comodoId, ativo: true, escolha: null });
  await base.update({ "system.mobilias": mobilias });
  await cartao(base, "Mobília Adquirida", `<p><strong>${def.nome}</strong> instalada. ${def.beneficio}.</p>`);
  if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(base, { silencioso: true });
}

export async function acaoMoverMobilia(base, idMobilia) {
  const mob = base.system.mobilias.find(m => m.id === idMobilia);
  if (!mob) return;
  const def = obterMobilias(base)[mob.key];
  const locais = locaisDisponiveis(base, mob.key, idMobilia);
  if (!locais.length) return ui.notifications.warn("Nenhum outro cômodo válido com espaço.");
  const opcoes = locais.map(l => `<option value="${l.id}" ${l.id === mob.comodoId ? "selected" : ""}>${l.nome}</option>`).join("");
  const dados = await DialogV2.prompt({
    window: { title: `Mover: ${def.nome}` },
    content: `<p>Mobílias podem ser movidas entre aventuras (uma mesma mobília só afeta um cômodo por aventura).</p>
      <div class="form-group"><label>Novo cômodo</label><select name="comodoId">${opcoes}</select></div>`,
    ok: { label: "Mover", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
  if (!dados) return;
  const mobilias = base.system.mobilias.map(m => m.id === idMobilia ? { ...m, comodoId: dados.comodoId } : m);
  await base.update({ "system.mobilias": mobilias });
  if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(base, { silencioso: true });
}

/* ================================================================== */
/* Dinheiro dos personagens (moedas do sistema Tormenta20)            */
/* ================================================================== */

/* Valor de cada moeda em décimos de T$ (a menor fração é o TC = T$ 0,1),
 * para trabalhar somente com inteiros e evitar erros de ponto flutuante. */
const VALOR_MOEDA = { tc: 1, tp: 10, to: 100, tl: 1000 };

/** Valor total de uma carteira {tc, tp, to, tl}, em décimos de T$. */
export function totalDecimos(d) {
  return Math.round(((d?.tc ?? 0) + (d?.tp ?? 0) * 10 + (d?.to ?? 0) * 100 + (d?.tl ?? 0) * 1000));
}

function carteiraEmDecimos(ator) {
  return totalDecimos(ator.system.dinheiro);
}

function fmtDecimos(dec) {
  return `T$ ${(dec / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;
}

/** Soma um valor (em décimos de T$) a uma carteira, em moedas grandes. */
export function somarNaCarteira(d, decimos) {
  const carteira = { tc: d?.tc ?? 0, tp: d?.tp ?? 0, to: d?.to ?? 0, tl: d?.tl ?? 0 };
  carteira.to += Math.floor(decimos / 100); decimos %= 100;
  carteira.tp += Math.floor(decimos / 10);
  carteira.tc += decimos % 10;
  return carteira;
}

/**
 * Subtrai um valor (em décimos de T$) de uma carteira. Gasta primeiro as
 * moedas menores; quando falta troco exato, quebra a menor moeda maior
 * disponível e devolve a diferença em TO/T$/TC.
 * Retorna a nova carteira, ou null se o saldo for insuficiente.
 */
function subtrairDaCarteira(d, decimos) {
  const carteira = { tc: d?.tc ?? 0, tp: d?.tp ?? 0, to: d?.to ?? 0, tl: d?.tl ?? 0 };
  let resta = decimos;

  for (const moeda of ["tc", "tp", "to", "tl"]) {
    const usa = Math.min(carteira[moeda], Math.floor(resta / VALOR_MOEDA[moeda]));
    carteira[moeda] -= usa;
    resta -= usa * VALOR_MOEDA[moeda];
  }
  if (resta > 0) {
    for (const moeda of ["tp", "to", "tl"]) {
      if (carteira[moeda] > 0 && VALOR_MOEDA[moeda] >= resta) {
        carteira[moeda] -= 1;
        let troco = VALOR_MOEDA[moeda] - resta;
        resta = 0;
        carteira.to += Math.floor(troco / 100); troco %= 100;
        carteira.tp += Math.floor(troco / 10);  troco %= 10;
        carteira.tc += troco;
        break;
      }
    }
  }
  return resta > 0 ? null : carteira;
}

/** Desconta um valor (em décimos de T$) das moedas de um personagem. */
async function descontarDinheiro(ator, decimos) {
  const nova = subtrairDaCarteira(ator.system.dinheiro, decimos);
  if (!nova) return false;
  await ator.update({ "system.dinheiro": nova });
  return true;
}

/**
 * Menu de rateio da manutenção: lista os moradores com ficha, divide o
 * valor igualmente por padrão e só habilita a confirmação quando a soma
 * cobre a manutenção e todos têm saldo. Desconta das fichas ao confirmar.
 * Retorna o HTML do resumo para o cartão de chat, ou null se cancelado.
 */
async function pagarPelosPersonagens(base, custo) {
  const custoDec = Math.round(custo * 10);
  const moradores = [];
  for (const res of base.system.residentes) {
    const ator = await obterMorador(res.uuid);
    if (ator) moradores.push({ uuid: res.uuid, ator, saldo: carteiraEmDecimos(ator) });
  }
  if (!moradores.length) {
    ui.notifications.warn("Nenhum morador com ficha encontrada para dividir a manutenção.");
    return null;
  }

  /* Divisão igual em décimos de T$; a sobra vai aos primeiros da lista. */
  const cota = Math.floor(custoDec / moradores.length);
  const sobra = custoDec - cota * moradores.length;
  moradores.forEach((m, i) => { m.padrao = cota + (i < sobra ? 1 : 0); });

  const linhasHtml = moradores.map(m => `
    <div class="t20b-rateio-linha">
      <img src="${m.ator.img}" alt="">
      <div class="t20b-rateio-info">
        <strong>${m.ator.name}</strong>
        <span class="t20b-rateio-saldo">Disponível: ${fmtDecimos(m.saldo)}</span>
      </div>
      <input type="number" data-uuid="${m.uuid}" data-saldo="${m.saldo}"
             value="${(m.padrao / 10).toFixed(1)}" min="0" step="0.1">
    </div>`).join("");

  const conteudo = `
    <div class="t20b-rateio">
      <p>Manutenção: <strong>${fmtTS(custo)}</strong> — divida o valor entre os personagens.
        O desconto usa as moedas de cada ficha (TO = T$ 10 · TC = T$ 0,1), trocando moedas maiores quando necessário.</p>
      <div class="t20b-rateio-linhas">${linhasHtml}</div>
      <p class="t20b-rateio-total">Total: <strong class="t20b-rateio-soma">—</strong> / ${fmtTS(custo)}
        <span class="t20b-rateio-aviso"></span></p>
    </div>`;

  const pagamentos = await DialogV2.wait({
    window: { title: "Manutenção — Pagar pelos Personagens" },
    position: { width: 500 },
    content: conteudo,
    buttons: [
      {
        action: "confirmar", label: "Confirmar e descontar", icon: "fa-solid fa-coins", default: true,
        callback: (ev, btn) => {
          const mapa = {};
          btn.form.querySelectorAll("input[data-uuid]").forEach(inp => {
            mapa[inp.dataset.uuid] = Math.max(0, Math.round((Number(inp.value) || 0) * 10));
          });
          return mapa;
        }
      },
      { action: "cancelar", label: "Cancelar", callback: () => null }
    ],
    render: (event, dialog) => {
      const raiz = dialog.element;
      const inputs = [...raiz.querySelectorAll("input[data-uuid]")];
      const botao = raiz.querySelector('button[data-action="confirmar"]');
      const soma = raiz.querySelector(".t20b-rateio-soma");
      const aviso = raiz.querySelector(".t20b-rateio-aviso");
      const atualizar = () => {
        let total = 0, semFundos = false;
        for (const inp of inputs) {
          const dec = Math.max(0, Math.round((Number(inp.value) || 0) * 10));
          total += dec;
          const falta = dec > Number(inp.dataset.saldo);
          inp.closest(".t20b-rateio-linha").classList.toggle("t20b-sem-fundos", falta);
          if (falta) semFundos = true;
        }
        soma.textContent = fmtDecimos(total);
        const incompleto = total < custoDec;
        if (botao) botao.disabled = incompleto || semFundos;
        aviso.textContent = incompleto ? "O total precisa cobrir a manutenção."
          : semFundos ? "Personagem sem dinheiro suficiente." : "";
      };
      inputs.forEach(i => i.addEventListener("input", atualizar));
      atualizar();
    }
  }).catch(() => null);
  /* Cancelar/fechar: o DialogV2 converte callbacks que retornam null na
   * string da ação do botão ("cancelar") — só o mapa de pagamentos vale. */
  if (!pagamentos || typeof pagamentos !== "object") return null;

  const linhas = [];
  for (const m of moradores) {
    const valor = pagamentos[m.uuid] ?? 0;
    if (!valor) continue;
    const ok = await descontarDinheiro(m.ator, valor);
    linhas.push(`<li><strong>${m.ator.name}</strong>: ${fmtDecimos(valor)}${ok ? "" : ' — <span class="t20b-ruim">dinheiro insuficiente, desconte manualmente</span>'}</li>`);
  }
  return `<p>Manutenção de <strong>${fmtTS(custo)}</strong> paga pelos personagens:</p>
    <ul class="t20b-lista">${linhas.join("")}</ul>`;
}

/* ================================================================== */
/* Início de aventura: manutenção e rotinas                           */
/* ================================================================== */

export async function iniciarAventura(base) {
  const s = base.system;
  const custo = s.manutencao;
  const modo = await DialogV2.wait({
    window: { title: "Iniciar Aventura" },
    content: `<p>Início de aventura <strong>${s.aventura.numero + 1}</strong>. A manutenção da base (${PORTES[s.porte].nome}) é de <strong>${fmtTS(custo)}</strong>.</p>
      <p class="notes">Se a manutenção não for paga, um cômodo aleatório é danificado e deixa de fornecer bônus até ser reparado (1 ação + metade do custo).</p>`,
    buttons: [
      { action: "caixa", label: `Pagar do caixa (${fmtTS(custo)})`, default: true },
      { action: "personagens", label: "Pagar pelos personagens" },
      { action: "manual", label: "Pago manualmente" },
      { action: "nao", label: "Não pagar (danifica um cômodo)" },
      { action: "cancelar", label: "Cancelar" }
    ]
  });
  if (!modo || modo === "cancelar") return;

  let corpo = "";
  let pagou = modo !== "nao";
  if (modo === "caixa") {
    if (saldoCaixaDecimos(base) < custo * 10) {
      ui.notifications.warn("Caixa insuficiente — a manutenção não foi paga.");
      pagou = false;
    } else {
      await movimentarCaixa(base, "Manutenção da base", -custo);
      corpo += `<p>Manutenção de <strong>${fmtTS(custo)}</strong> paga pelo caixa.</p>`;
    }
  } else if (modo === "personagens") {
    const resumo = await pagarPelosPersonagens(base, custo);
    if (!resumo) return;
    corpo += resumo;
  } else if (modo === "manual") {
    corpo += `<p>Manutenção de <strong>${fmtTS(custo)}</strong> paga manualmente (isenta pelo mestre ou já descontada das fichas).</p>`;
  }

  if (!pagou) {
    const integros = s.comodos.filter(c => !c.danificado);
    if (integros.length) {
      const alvo = integros[Math.floor(Math.random() * integros.length)];
      const comodos = s.comodos.map(c => c.id === alvo.id ? { ...c, danificado: true } : c);
      await base.update({ "system.comodos": comodos });
      const nome = obterComodos(base)[alvo.key]?.nome ?? alvo.key;
      corpo += `<p class="t20b-ruim">Sem manutenção, <strong>${nome}</strong> é danificado e deixa de fornecer seus bônus até ser reparado.</p>`;
    } else {
      corpo += `<p class="t20b-ruim">A manutenção não foi paga, mas não há cômodos para danificar.</p>`;
    }
  }

  /* Lembretes de escolhas por aventura */
  const catC = obterComodos(base);
  const catM = obterMobilias(base);
  const lembretes = [];
  for (const c of s.comodos.filter(x => !x.danificado && x.ativo !== false)) {
    const def = catC[c.key];
    if (def?.porAventura) lembretes.push(def.porAventura);
  }
  for (const m of s.mobilias.filter(x => x.ativo !== false)) {
    const def = catM[m.key];
    if (def?.porAventura) lembretes.push(def.porAventura);
  }
  if (s.tipo === "residencia") lembretes.push("Residência: cada residente pode receber 1 prato especial nesta aventura");
  if (lembretes.length) {
    corpo += `<p><strong>Escolhas do início de aventura:</strong></p><ul class="t20b-lista">${lembretes.map(l => `<li>${l}</li>`).join("")}</ul>`;
  }

  await base.update({
    "system.aventura.numero": s.aventura.numero + 1,
    "system.aventura.manutencaoPaga": pagou
  });
  await cartao(base, `Início da Aventura ${s.aventura.numero + 1}`, corpo || "<p>Tudo em ordem na base.</p>");

  /* Ala dos Criados: 1d4 PM temporários por patamar, por residente */
  if (s.temComodo("ala-dos-criados")) await rolarCriados(base);
}

export async function rolarCriados(base) {
  const s = base.system;
  if (!s.temComodo("ala-dos-criados"))
    return ui.notifications.warn("A base não possui uma Ala dos Criados íntegra.");
  const linhas = [];
  const rolls = [];
  for (const res of s.residentes) {
    if (res.receberEfeitos === false) continue;
    const ator = await obterMorador(res.uuid);
    if (!ator) continue;
    const nivel = ator.system.attributes?.nivel?.value ?? 1;
    const patamar = nivel >= 17 ? 4 : nivel >= 11 ? 3 : nivel >= 5 ? 2 : 1;
    const roll = await rolar(`${patamar}d4`);
    rolls.push(roll);
    linhas.push(`<li><strong>${ator.name}</strong> (patamar ${patamar}): <strong>${roll.total} PM temporários</strong> (${patamar}d4)</li>`);
  }
  if (!linhas.length) return;
  await cartao(base, "Ala dos Criados",
    `<p>Os criados preparam tudo para a partida. PM temporários (duram até serem gastos):</p>
     <ul class="t20b-lista">${linhas.join("")}</ul>
     <p class="notes">Aplique os PM temporários no campo apropriado de cada ficha (system.attributes.pm.temp).</p>`,
    { rolls });
}

/* ================================================================== */
/* Empreendimento                                                     */
/* ================================================================== */

export async function acaoEmpreendimento(base) {
  const s = base.system;
  if (s.tipo !== "empreendimento")
    return ui.notifications.warn("Apenas bases do tipo Empreendimento rendem dinheiro assim.");
  if (!s.residentes.length)
    return ui.notifications.warn("Adicione ao menos um morador à base.");

  const dados = await DialogV2.prompt({
    window: { title: "Administrar o Empreendimento" },
    content: `<p>1× a cada intervalo entre aventuras: teste de <strong>Inteligência</strong> com bônus igual ao número de cômodos que a base pode ter (+${s.maxComodos}). A base rende <strong>TO iguais ao resultado</strong>.</p>
      <div class="form-group"><label>Residente</label><select name="uuid">${opcoesMoradores(base)}</select></div>
      <div class="form-group"><label class="t20b-inline"><input type="checkbox" name="administrando"> O residente gasta sua ação entre aventuras administrando (dobra a renda)</label></div>
      <div class="form-group"><label class="t20b-inline"><input type="checkbox" name="paraCaixa" checked> Depositar a renda no caixa da base</label></div>`,
    ok: { label: "Rolar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
  if (!dados) return;

  const morador = await obterMorador(dados.uuid);
  if (!morador) return;
  const int = morador.system.atributos?.int?.value ?? 0;
  const roll = await rolar(`1d20 + ${int}[Inteligência] + ${s.maxComodos}[Cômodos]`);
  const mult = dados.administrando ? 2 : 1;
  const to = Math.max(0, roll.total) * mult;
  const ts = to * 10;

  let corpo = `<p>Teste de Inteligência (${morador.name}): <strong>${roll.total}</strong>${dados.administrando ? " × 2 (administrando)" : ""}</p>
    <p class="t20b-bom">O negócio rende <strong>${to} TO</strong> (${fmtTS(ts)}).</p>`;
  if (dados.paraCaixa) {
    await movimentarCaixa(base, `Empreendimento (${morador.name}${dados.administrando ? ", administrando" : ""})`, ts);
  } else {
    corpo += `<p class="notes">A renda foi entregue diretamente aos personagens (não entrou no caixa).</p>`;
  }
  await cartao(base, "Empreendimento", corpo, { rolls: [roll] });
}
