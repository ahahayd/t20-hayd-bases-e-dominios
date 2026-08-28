/**
 * t20-hayd-dominios | acoes.mjs
 * Motor de regras de Regência: turnos de domínio, ações, impostos,
 * eventos aleatórios e batalhas simplificadas (Heróis de Arton, pp. 323-327).
 */
import {
  MODULO, CORTES, ORDEM_CORTES, POPULARIDADES, ORDEM_POPULARIDADE,
  IMPOSTOS, UNIDADES, EVENTOS, SUBEVENTOS,
  RESULTADOS_BATALHA, CATEGORIAS_CONSTRUCAO, CONSELHEIROS, labelPericia, temaHayd, corDominio,
  obterConstrucoes
} from "./catalogo.mjs";
import { obterRegente, sincronizarEfeitos } from "./efeitos.mjs";
import { htmlDesfechoObra } from "../correcao-obras.mjs";

const { DialogV2 } = foundry.applications.api;

/* ================================================================== */
/* Utilitários                                                        */
/* ================================================================== */

async function rolar(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll;
}

function fmtLO(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

/** Cria um cartão de chat estilizado do módulo. */
export async function cartao(dominio, titulo, corpo, { rolls = [], subtitulo = "", rollMode = null, flagsModulo = {} } = {}) {
  const content = `
    <div class="t20d-chat${temaHayd() ? " tema-hayd" : ""}"${temaHayd() ? ` style="--t20d-destaque: ${corDominio(dominio)}"` : ""}>
      <header class="t20d-chat-header">
        <img src="${dominio.img}" alt="">
        <div>
          <h3>${titulo}</h3>
          <span>${subtitulo || dominio.name}</span>
        </div>
      </header>
      <div class="t20d-chat-body">${corpo}</div>
    </div>`;
  const dados = {
    content,
    rolls,
    speaker: { alias: dominio.name },
    flags: { [MODULO]: { dominio: dominio.uuid, ...flagsModulo } }
  };
  if (rollMode) ChatMessage.applyRollMode(dados, rollMode);
  return ChatMessage.create(dados);
}

/** Registra uma movimentação no tesouro (delta em LO) e atualiza o saldo. */
export async function movimentarTesouro(dominio, desc, delta) {
  const atual = dominio.system.tesouro.lo;
  const novo = Math.max(0, Math.round((atual + delta) * 100) / 100);
  const historico = [...dominio.system.tesouro.historico];
  historico.push({
    turno: dominio.system.turno.numero,
    data: new Date().toLocaleDateString("pt-BR"),
    desc, delta: Math.round(delta * 100) / 100, saldo: novo
  });
  while (historico.length > 120) historico.shift();
  await dominio.update({ "system.tesouro.lo": novo, "system.tesouro.historico": historico });
  console.debug(`${MODULO} | Tesouro: ${desc} (${delta >= 0 ? "+" : ""}${fmtLO(delta)} LO) → saldo ${fmtLO(novo)} LO`);
  return novo;
}

/**
 * Ajusta a popularidade em N categorias (positivo = melhora).
 * Controla o início e o fim de revoltas. Ignorado em domínios místicos.
 */
export async function ajustarPopularidade(dominio, passos, motivo = "") {
  if (dominio.system.tipo === "mistico" || !passos) return;
  let idx = ORDEM_POPULARIDADE.indexOf(dominio.system.popularidade);
  if (idx < 0) idx = 2;
  let novoIdx = idx - passos; // índice menor = mais popular
  const updates = {};
  let extra = "";

  if (novoIdx > ORDEM_POPULARIDADE.length - 1) {
    novoIdx = ORDEM_POPULARIDADE.length - 1;
    if (!dominio.system.emRevolta) {
      updates["system.emRevolta"] = true;
      extra = `<p class="t20d-ruim"><strong>Uma revolta se inicia!</strong> Impostos caem a 0 LO e uma construção aleatória é destruída no fim de cada turno até a popularidade voltar a Impopular ou melhor.</p>`;
    }
  }
  novoIdx = Math.max(0, novoIdx);
  updates["system.popularidade"] = ORDEM_POPULARIDADE[novoIdx];

  if (dominio.system.emRevolta && novoIdx <= ORDEM_POPULARIDADE.indexOf("impopular")) {
    updates["system.emRevolta"] = false;
    extra = `<p class="t20d-bom"><strong>A revolta termina!</strong> A ordem retorna ao domínio.</p>`;
  }

  await dominio.update(updates);
  const nome = POPULARIDADES[ORDEM_POPULARIDADE[novoIdx]].nome;
  await cartao(dominio, "Popularidade",
    `<p>${motivo ? motivo + " " : ""}A popularidade ${passos > 0 ? "aumenta" : "diminui"} para <strong>${nome}</strong>.</p>${extra}`);
}

export async function ajustarCorte(dominio, passos, motivo = "") {
  let idx = ORDEM_CORTES.indexOf(dominio.system.corte.categoria);
  const novoIdx = Math.clamp(idx + passos, 0, ORDEM_CORTES.length - 1);
  if (novoIdx === idx) return;
  await dominio.update({ "system.corte.categoria": ORDEM_CORTES[novoIdx] });
  await cartao(dominio, "Corte",
    `<p>${motivo ? motivo + " " : ""}A corte ${passos > 0 ? "sobe" : "desce"} para <strong>${CORTES[ORDEM_CORTES[novoIdx]].nome}</strong>.</p>`);
}

/** Remove uma construção aleatória (evento, batalha, revolta). */
export async function perderConstrucaoAleatoria(dominio, motivo = "") {
  const lista = dominio.system.construcoes;
  if (!lista.length) return null;
  const alvo = lista[Math.floor(Math.random() * lista.length)];
  await dominio.update({ "system.construcoes": lista.filter(c => c.id !== alvo.id) });
  await sincronizarEfeitos(dominio, { silencioso: true });
  const nome = obterConstrucoes(dominio)[alvo.key]?.nome ?? alvo.key;
  await cartao(dominio, "Construção Destruída", `<p>${motivo ? motivo + " " : ""}O domínio perde: <strong>${nome}</strong>.</p>`);
  return nome;
}

/** Remove N unidades aleatórias (cada ponto de quantidade conta como uma). */
export async function perderUnidades(dominio, n, motivo = "") {
  if (n <= 0) return;
  const plano = [];
  for (const u of dominio.system.unidades) {
    for (let i = 0; i < (u.qtd ?? 1); i++) plano.push(u.key + "|" + (u.temporaria ? 1 : 0));
  }
  if (!plano.length) {
    await cartao(dominio, "Baixas", `<p>${motivo} O domínio perderia ${n} unidade(s), mas não possui tropas.</p>`);
    return;
  }
  const perdidas = [];
  for (let i = 0; i < n && plano.length; i++) {
    const idx = Math.floor(Math.random() * plano.length);
    perdidas.push(plano.splice(idx, 1)[0]);
  }
  const contagem = {};
  for (const p of plano) contagem[p] = (contagem[p] ?? 0) + 1;
  const novas = Object.entries(contagem).map(([chave, qtd]) => {
    const [key, temp] = chave.split("|");
    return { id: foundry.utils.randomID(), key, qtd, temporaria: temp === "1" };
  });
  await dominio.update({ "system.unidades": novas });
  const resumo = {};
  for (const p of perdidas) {
    const key = p.split("|")[0];
    resumo[key] = (resumo[key] ?? 0) + 1;
  }
  const txt = Object.entries(resumo).map(([k, q]) => `${q}× ${UNIDADES[k]?.nome ?? k}`).join(", ");
  await cartao(dominio, "Baixas nas Tropas", `<p>${motivo ? motivo + " " : ""}O domínio perde: <strong>${txt}</strong>.</p>`);
}

/* ================================================================== */
/* Testes do regente                                                  */
/* ================================================================== */

/**
 * Prepara um teste de perícia do regente, com os modificadores de ação de
 * domínio (corte, popularidade, turno) e o bônus de treinamento de
 * conselheiros quando aplicável.
 *
 * Abre a janela de configuração de uso do sistema Tormenta20
 * (AbilityUseDialog: bônus situacional, melhor/pior de 2d20, aprimoramentos
 * e modo de rolagem) ANTES de qualquer gasto de ação ou tesouro — cancelar a
 * janela cancela a ação sem consumir recursos.
 *
 * Retorna null se não houver regente ou se a janela for cancelada; caso
 * contrário, retorna { regente, rollMode, rolar }, onde rolar() executa a
 * rolagem e devolve { roll, sucesso, margem, total, regente, cd, rollMode }.
 */
export async function prepararTesteRegente(dominio, periciaKey, cd, {
  rotulo = "", bonusExtra = 0, rotuloExtra = "", evento = null, incluirModificadores = true
} = {}) {
  const regente = await obterRegente(dominio);
  if (!regente) {
    ui.notifications.warn("Vincule um regente ao domínio (arraste um ator para a aba Domínio).");
    return null;
  }

  const nomePericia = labelPericia(periciaKey);
  const per = regente.system.pericias?.[periciaKey];
  const valor = per?.value ?? 0;
  const partes = [`1d20`, `${valor}[${nomePericia}]`];

  if (incluirModificadores) {
    // Conselheiro fornece o bônus de treinamento se o regente for destreinado
    const treinado = !!(per?.treinado || (per?.treino ?? 0) > 0);
    const conselheiros = dominio.system.corte.conselheiros ?? [];
    const cobre = conselheiros.some(c => CONSELHEIROS[c]?.pericia === periciaKey);
    if (!treinado && cobre) {
      const conselheiro = regente.system.attributes?.treino ?? 2;
      partes.push(`${conselheiro}[Conselheiro]`);
    }

    const modAcoes = dominio.system.modAcoes;
    if (modAcoes) partes.push(`${modAcoes}[Ações de domínio]`);
  }
  if (bonusExtra) partes.push(`${bonusExtra}[${rotuloExtra || "Bônus"}]`);

  let rollMode = game.settings.get("core", "rollMode");
  let rConfig = {};
  let itemData = null;

  /* Janela de configuração de uso do sistema (mesmo fluxo do rollPericia) */
  const api = game.tormenta20;
  const usarSistema = !!(api?.applications?.AbilityUseDialog && api?.dice?.d20Roll);
  if (usarSistema) {
    itemData = {
      ...(per ?? {}),
      name: nomePericia,
      label: nomePericia,
      type: "pericia",
      parts: partes,
      id: periciaKey,
      actor: regente,
      system: { ativacao: { custo: 0 } },
      isOwned: true
    };
    // Respeita a preferência do sistema: por padrão abre a janela; Shift inverte
    const usoPadrao = game.settings.get("tormenta20", "UsageConfig") === "default";
    const shift = evento?.shiftKey ?? false;
    const abrirJanela = usoPadrao ? !shift : shift;
    if (abrirJanela) {
      const configuracao = await api.applications.AbilityUseDialog.create(itemData);
      if (!configuracao) return null; // jogador cancelou a janela
      rConfig = configuracao;
      rollMode = configuracao.rollMode ?? rollMode;
    }
  }

  const rolarTeste = async () => {
    let roll;
    if (usarSistema) {
      const rollConfig = foundry.utils.mergeObject({
        parts: itemData.parts,
        actor: regente,
        event: evento ?? {},
        data: regente.getRollData(),
        title: rotulo || nomePericia,
        flavor: rotulo || nomePericia
      }, rConfig);
      // Custo em PM de aprimoramentos aplicados na janela
      const custoPM = itemData.system?.ativacao?.custo ?? 0;
      if (custoPM > 0 && game.settings.get("tormenta20", "automaticManaSpend")) {
        await regente.spendMana(custoPM, 0, false);
      }
      roll = await api.dice.d20Roll(rollConfig);
    } else {
      roll = await rolar(partes.join(" + ").replace(/\+ -/g, "- "));
    }
    if (!roll) return null;

    const sucesso = cd != null ? roll.total >= cd : null;
    const margem = cd != null ? roll.total - cd : 0;
    console.debug(`${MODULO} | Teste ${rotulo || periciaKey}: ${roll.formula} = ${roll.total} vs CD ${cd} → ${sucesso ? "sucesso" : "falha"} (margem ${margem})`);
    return { roll, sucesso, margem, total: roll.total, regente, cd, rollMode };
  };

  return { regente, rollMode, rolar: rolarTeste };
}

/** Prepara e executa o teste em um único passo (janela + rolagem). */
export async function testeRegente(dominio, periciaKey, cd, opcoes = {}) {
  const prep = await prepararTesteRegente(dominio, periciaKey, cd, opcoes);
  return prep ? prep.rolar() : null;
}

function htmlResultadoTeste(t, nomePericia) {
  if (!t) return "";
  const classe = t.sucesso ? "t20d-bom" : "t20d-ruim";
  const texto = t.sucesso ? "SUCESSO" : "FALHA";
  return `<p>Teste de <strong>${nomePericia}</strong> (${t.regente.name}): <strong>${t.total}</strong> vs CD ${t.cd} — <span class="${classe}" data-t20bd-resultado-teste><strong>${texto}</strong></span></p>`;
}

/* ================================================================== */
/* Controle de ações do turno                                         */
/* ================================================================== */

async function gastarAcao(dominio) {
  const s = dominio.system;
  if (s.turno.bloqueado) {
    ui.notifications.error("Mortos vagam pela terra: nenhuma ação de domínio pode ser feita neste turno.");
    return false;
  }
  if (s.turno.acoesGastas >= s.acoesPorTurno) {
    ui.notifications.warn(`Limite de ${s.acoesPorTurno} ações de domínio por turno atingido.`);
    return false;
  }
  await dominio.update({ "system.turno.acoesGastas": s.turno.acoesGastas + 1 });
  return true;
}

async function pagarLO(dominio, custo, desc) {
  if (custo <= 0) return true;
  if (dominio.system.tesouro.lo < custo) {
    ui.notifications.error(`Tesouro insuficiente: são necessários ${fmtLO(custo)} LO.`);
    return false;
  }
  await movimentarTesouro(dominio, desc, -custo);
  return true;
}

/* ================================================================== */
/* Ações de Domínio                                                   */
/* ================================================================== */

export async function acaoAumentarCorte(dominio, evento = null) {
  const idx = ORDEM_CORTES.indexOf(dominio.system.corte.categoria);
  const modo = await DialogV2.wait({
    window: { title: "Aumentar Corte" },
    content: `<p>Teste de Nobreza (CD 20). O custo é pago mesmo em caso de falha.</p>`,
    buttons: [
      { action: "subir", label: `Subir categoria (1 LO)`, default: true },
      { action: "descer", label: "Diminuir categoria (0 LO)" },
      { action: "trocar", label: "Trocar conselheiro (0 LO)" },
      { action: "cancelar", label: "Cancelar" }
    ]
  });
  if (!modo || modo === "cancelar") return;
  if (modo === "subir" && idx >= ORDEM_CORTES.length - 1) return ui.notifications.warn("A corte já é Rica.");
  if (modo === "descer" && idx <= 0) return ui.notifications.warn("A corte já é Inexistente.");

  const prep = await prepararTesteRegente(dominio, "nobr", 20, { rotulo: "Aumentar Corte", evento });
  if (!prep) return;

  if (!(await gastarAcao(dominio))) return;
  const custo = modo === "subir" ? 1 : 0;
  if (!(await pagarLO(dominio, custo, "Ação: Aumentar Corte"))) return;

  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, "Nobreza");
  if (t.sucesso) {
    if (modo === "subir") await ajustarCorte(dominio, +1);
    else if (modo === "descer") await ajustarCorte(dominio, -1);
    else corpo += `<p>Você pode trocar um conselheiro na aba Domínio.</p>`;
  } else {
    corpo += `<p>A corte permanece como está${custo ? " e o ouro foi gasto" : ""}.</p>`;
  }
  await cartao(dominio, "Ação: Aumentar Corte", corpo, { rolls: [t.roll], rollMode: t.rollMode });
}

export async function acaoConvocarCamponeses(dominio) {
  if (!(await gastarAcao(dominio))) return;
  if (!(await pagarLO(dominio, 1, "Ação: Convocar Camponeses"))) return;
  const roll = await rolar("1d6");
  const unidades = [...dominio.system.unidades];
  unidades.push({ id: foundry.utils.randomID(), key: "camponeses", qtd: roll.total, temporaria: true });
  await dominio.update({ "system.unidades": unidades });
  await cartao(dominio, "Ação: Convocar Camponeses",
    `<p>O povo pega em armas: <strong>${roll.total} unidade(s) de camponeses</strong> até o fim do turno.</p>`,
    { rolls: [roll] });
  await ajustarPopularidade(dominio, -1, "Convocar o povo para a guerra não agrada.");
}

export async function acaoExtorquir(dominio, evento = null) {
  const cd = 20 + dominio.system.nivel;
  const prep = await prepararTesteRegente(dominio, "inti", cd, { rotulo: "Extorquir", evento });
  if (!prep) return;
  if (!(await gastarAcao(dominio))) return;
  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, "Intimidação");
  const rolls = [t.roll];
  if (t.sucesso) {
    const ganho = await rolar(`1d6 + ${dominio.system.nivel}`);
    rolls.push(ganho);
    await movimentarTesouro(dominio, "Ação: Extorquir", ganho.total);
    corpo += `<p>Impostos abusivos rendem <strong>+${ganho.total} LO</strong>.</p>`;
  } else {
    corpo += `<p>O povo resiste às cobranças.</p>`;
  }
  await cartao(dominio, "Ação: Extorquir", corpo, { rolls, rollMode: t.rollMode });
  await ajustarPopularidade(dominio, -1, "Cobranças abusivas revoltam o povo.");
}

export async function acaoFestival(dominio, evento = null) {
  const cd = 20 + dominio.system.nivel;
  const prep = await prepararTesteRegente(dominio, "atua", cd, { rotulo: "Festival", evento });
  if (!prep) return;
  if (!(await gastarAcao(dominio))) return;
  if (!(await pagarLO(dominio, 1, "Ação: Festival"))) return;
  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, "Atuação");
  if (t.sucesso) corpo += `<p>A festa é um sucesso!</p>`;
  else corpo += `<p>A festa fracassa, e o ouro foi gasto mesmo assim.</p>`;
  await cartao(dominio, "Ação: Festival", corpo, { rolls: [t.roll], rollMode: t.rollMode });
  if (t.sucesso) await ajustarPopularidade(dominio, +1, "O festival alegra o povo.");
}

export async function acaoFinancas(dominio, evento = null) {
  const regente = await obterRegente(dominio);
  if (!regente) return ui.notifications.warn("Vincule um regente ao domínio.");
  const din = regente.system.dinheiro ?? {};
  const conteudo = `
    <p>Conversão à taxa de <strong>T$ 1.000 = 1 LO</strong>. Teste de Nobreza (CD 20).</p>
    <div class="form-group"><label>Direção</label>
      <select name="direcao">
        <option value="paraLO">Dinheiro do regente → Lingotes do domínio</option>
        <option value="paraTS">Lingotes do domínio → Dinheiro do regente</option>
      </select></div>
    <div class="form-group"><label>Quantidade (em LO)</label>
      <input type="number" name="qtd" value="1" min="1" step="1"></div>
    <div class="form-group"><label>Moeda do regente</label>
      <select name="moeda">
        <option value="prata">T$ (prata) — atual: ${din.prata ?? 0}</option>
        <option value="ouro">TO (ouro, T$ 10) — atual: ${din.ouro ?? 0}</option>
      </select></div>`;
  const dados = await DialogV2.prompt({
    window: { title: "Ação: Finanças" },
    content: conteudo,
    ok: {
      label: "Converter",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  }).catch(() => null);
  if (!dados) return;

  const qtdLO = Math.max(1, Math.floor(dados.qtd));
  const fator = dados.moeda === "ouro" ? 100 : 1000; // 1 LO em moedas
  const qtdMoedas = qtdLO * fator;
  const rotuloMoeda = dados.moeda === "ouro" ? "TO" : "T$ (prata)";

  if (dados.direcao === "paraLO" && (din[dados.moeda] ?? 0) < qtdMoedas)
    return ui.notifications.error(`${regente.name} não possui ${qtdMoedas} ${rotuloMoeda}.`);
  if (dados.direcao === "paraTS" && dominio.system.tesouro.lo < qtdLO)
    return ui.notifications.error(`O tesouro não possui ${qtdLO} LO.`);

  const prep = await prepararTesteRegente(dominio, "nobr", 20, { rotulo: "Finanças", evento });
  if (!prep) return;
  if (!(await gastarAcao(dominio))) return;
  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, "Nobreza");

  if (t.sucesso) {
    if (dados.direcao === "paraLO") {
      await regente.update({ [`system.dinheiro.${dados.moeda}`]: (din[dados.moeda] ?? 0) - qtdMoedas });
      await movimentarTesouro(dominio, `Finanças: conversão de ${qtdMoedas} ${rotuloMoeda} (${regente.name})`, qtdLO);
      corpo += `<p><strong>${qtdMoedas} ${rotuloMoeda}</strong> de ${regente.name} tornam-se <strong>${qtdLO} LO</strong> no tesouro.</p>`;
    } else {
      await movimentarTesouro(dominio, `Finanças: conversão em ${qtdMoedas} ${rotuloMoeda} (${regente.name})`, -qtdLO);
      await regente.update({ [`system.dinheiro.${dados.moeda}`]: (din[dados.moeda] ?? 0) + qtdMoedas });
      corpo += `<p><strong>${qtdLO} LO</strong> do tesouro tornam-se <strong>${qtdMoedas} ${rotuloMoeda}</strong> para ${regente.name}.</p>`;
    }
  } else {
    corpo += `<p>A negociação com os cambistas fracassa; nada é convertido.</p>`;
  }
  await cartao(dominio, "Ação: Finanças", corpo, { rolls: [t.roll], rollMode: t.rollMode });
}

export async function acaoGovernar(dominio, evento = null) {
  const s = dominio.system;
  if (s.turno.governarUsada) return ui.notifications.warn("Governar só pode ser usada uma vez por turno.");
  if (s.nivel >= 7) return ui.notifications.warn("O domínio já está no nível máximo (7).");
  if (s.nivel >= s.nivelMaximo)
    return ui.notifications.warn(`O terreno limita o domínio ao nível ${s.nivelMaximo}.`);

  const proximo = s.nivel + 1;
  const custo = 5 * proximo;
  const cd = 20 + 2 * proximo;
  const ok = await DialogV2.confirm({
    window: { title: "Ação: Governar" },
    content: `<p>Subir o domínio para o <strong>nível ${proximo}</strong>?</p><p>Custo: <strong>${custo} LO</strong> · Teste de Nobreza (CD ${cd}).<br>O ouro é gasto mesmo em caso de falha.</p>`
  });
  if (!ok) return;

  const banhos = s.temConstrucao("banhos-publicos");
  const prep = await prepararTesteRegente(dominio, "nobr", cd, {
    rotulo: "Governar",
    bonusExtra: banhos ? 5 : 0,
    rotuloExtra: "Banhos Públicos",
    evento
  });
  if (!prep) return;

  if (!(await gastarAcao(dominio))) return;
  if (!(await pagarLO(dominio, custo, `Ação: Governar (nível ${proximo})`))) return;
  await dominio.update({ "system.turno.governarUsada": true });

  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, "Nobreza");
  if (t.sucesso) {
    await dominio.update({ "system.nivel": proximo }, { t20dSkipSync: true });
    corpo += `<p class="t20d-bom">O domínio prospera e alcança o <strong>nível ${proximo}</strong>!</p>`;
    await sincronizarEfeitos(dominio, { silencioso: true });
  } else {
    corpo += `<p>As demandas dos súditos superam seus esforços — o domínio permanece no nível ${s.nivel}.</p>`;
  }
  await cartao(dominio, "Ação: Governar", corpo, { rolls: [t.roll], rollMode: t.rollMode });
}

/** Verifica os pré-requisitos de uma construção. Retorna string de erro ou null. */
export function validarConstrucao(dominio, key) {
  const catalogo = obterConstrucoes(dominio);
  const def = catalogo[key];
  const s = dominio.system;
  if (!def) return "Construção desconhecida.";
  if (s.construcoes.length >= s.maxConstrucoes)
    return `Limite de construções atingido (${s.maxConstrucoes} = 3 × nível).`;
  if (!def.repetivel && s.temConstrucao(key)) return "Esta construção já existe no domínio.";
  if (s.tipo === "mistico" && !["religiao", "misticismo"].includes(def.categoria))
    return "Domínios místicos só podem ter construções de Religião ou Misticismo.";
  for (const p of def.prereqs ?? []) {
    if (!s.temConstrucao(p)) return `Requer: ${catalogo[p]?.nome ?? p}.`;
  }
  if (def.terrenos && !def.terrenos.includes(s.terreno.tipo) && !s.temConstrucao("povoado-afastado"))
    return `Requer terreno ${def.terrenos.join(" ou ")} (ou um Povoado Afastado).`;
  if (def.precisaRio && !s.terreno.rioOuMar)
    return "Requer que o domínio possua rio ou mar.";
  if (s.tesouro.lo < def.custo) return `Tesouro insuficiente (custo: ${def.custo} LO).`;
  return null;
}

export async function acaoConstruir(dominio, key, evento = null) {
  const def = obterConstrucoes(dominio)[key];
  const erro = validarConstrucao(dominio, key);
  if (erro) return ui.notifications.error(erro);

  const cat = CATEGORIAS_CONSTRUCAO[def.categoria];
  const cd = 20 + dominio.system.nivel;
  const ok = await DialogV2.confirm({
    window: { title: "Ação: Construir" },
    content: `<p>Erguer <strong>${def.nome}</strong>?</p>
      <p>${def.beneficio}.</p>
      <p>Custo: <strong>${def.custo} LO</strong> · Teste de ${cat.nome} (CD ${cd}).<br>O ouro é gasto mesmo em caso de falha.</p>`
  });
  if (!ok) return;

  const prep = await prepararTesteRegente(dominio, cat.pericia, cd, { rotulo: `Construir ${def.nome}`, evento });
  if (!prep) return;

  if (!(await gastarAcao(dominio))) return;
  if (!(await pagarLO(dominio, def.custo, `Construir: ${def.nome}`))) return;

  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, cat.nome);
  const entrada = {
    id: foundry.utils.randomID(), key,
    efeitoAtivo: !!def.efeito, escolha: null,
    turno: dominio.system.turno.numero
  };
  const obra = {
    tipo: "dominio", atorUuid: dominio.uuid, nome: def.nome,
    sucesso: t.sucesso, configuravel: !!def.efeito?.escolha,
    entrada
  };
  if (t.sucesso) {
    const construcoes = [...dominio.system.construcoes];
    construcoes.push(entrada);
    await dominio.update({ "system.construcoes": construcoes });
    if (game.settings.get(MODULO, "dominiosSincronizarAuto")) await sincronizarEfeitos(dominio, { silencioso: true });
  }
  corpo += htmlDesfechoObra(obra);
  await cartao(dominio, "Ação: Construir", corpo, {
    rolls: [t.roll], rollMode: t.rollMode, flagsModulo: { obra }
  });
}

export async function acaoRecrutar(dominio, escolhas) {
  // escolhas: { key: qtd }
  const s = dominio.system;
  const total = Object.values(escolhas).reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  if (total > s.nivel)
    return ui.notifications.error(`Máximo de ${s.nivel} unidades por ação (nível do domínio).`);

  let custo = 0;
  for (const [key, qtd] of Object.entries(escolhas)) {
    const def = UNIDADES[key];
    if (!def) continue;
    if (def.construcao && !s.temConstrucao(def.construcao))
      return ui.notifications.error(`${def.nome} exige a construção ${obterConstrucoes(dominio)[def.construcao]?.nome}.`);
    custo += def.custo * qtd;
  }
  if (!(await gastarAcao(dominio))) return;
  if (!(await pagarLO(dominio, custo, "Ação: Recrutar Tropas"))) return;

  const unidades = [...s.unidades];
  const linhas = [];
  for (const [key, qtd] of Object.entries(escolhas)) {
    if (qtd <= 0) continue;
    const existente = unidades.find(u => u.key === key && !u.temporaria);
    if (existente) existente.qtd = (existente.qtd ?? 1) + qtd;
    else unidades.push({ id: foundry.utils.randomID(), key, qtd, temporaria: false });
    linhas.push(`${qtd}× ${UNIDADES[key].nome}`);
  }
  await dominio.update({ "system.unidades": unidades });
  await cartao(dominio, "Ação: Recrutar Tropas",
    `<p>Novas tropas juram lealdade: <strong>${linhas.join(", ")}</strong>.</p><p>Custo total: ${fmtLO(custo)} LO.</p>`);
}

export async function acaoCaravana(dominio) {
  const s = dominio.system;
  if (!s.temConstrucao("caravancara")) return ui.notifications.error("Requer um Caravançará.");
  if (s.caravana.ativa) return ui.notifications.warn("Já existe uma caravana em viagem.");

  const dados = await DialogV2.prompt({
    window: { title: "Criar Caravana" },
    content: `<p>Invista até <strong>1d4 LO por nível do domínio</strong> (máx. ${s.nivel} dados).
      O retorno é resolvido na sua próxima etapa de impostos com um teste de Nobreza (CD 20 + dados investidos).</p>
      <div class="form-group"><label>Dados de investimento (d4)</label>
      <input type="number" name="dados" value="1" min="1" max="${s.nivel}"></div>`,
    ok: { label: "Investir", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
  }).catch(() => null);
  if (!dados) return;
  const k = Math.clamp(Math.floor(dados.dados), 1, s.nivel);

  const roll = await rolar(`${k}d4`);
  if (s.tesouro.lo < roll.total)
    return ui.notifications.error(`O investimento rolado foi de ${roll.total} LO, mas o tesouro possui apenas ${fmtLO(s.tesouro.lo)} LO.`);

  if (!(await gastarAcao(dominio))) return;
  await movimentarTesouro(dominio, `Caravana: investimento (${k}d4)`, -roll.total);
  await dominio.update({ "system.caravana": { ativa: true, dados: k, investido: roll.total } });
  await cartao(dominio, "Caravana Formada",
    `<p>Uma caravana parte com <strong>${roll.total} LO</strong> em mercadorias (${k}d4).</p>
     <p>Na próxima etapa de impostos, faça o teste de Nobreza (CD ${20 + k}).</p>`, { rolls: [roll] });
}

/* ================================================================== */
/* Turno de Domínio                                                   */
/* ================================================================== */

export async function iniciarTurno(dominio) {
  const s = dominio.system;
  const persistentes = s.turno.eventosAtivos.filter(e => e.persistente);
  const unidades = s.unidades.filter(u => !u.temporaria);
  await dominio.update({
    "system.turno.numero": s.turno.numero + 1,
    "system.turno.acoesGastas": 0,
    "system.turno.governarUsada": false,
    "system.turno.mod": 0,
    "system.turno.bloqueado": false,
    "system.turno.impostosCobrados": false,
    "system.turno.eventoRolado": false,
    "system.turno.eventosAtivos": persistentes,
    "system.unidades": unidades
  });
  const pend = persistentes.length
    ? `<p>Situações pendentes: <strong>${persistentes.map(e => e.nome).join(", ")}</strong>.</p>` : "";
  await cartao(dominio, `Turno de Domínio ${s.turno.numero + 1}`,
    `<p>Um novo turno começa. Siga as etapas:</p>
     <ol><li><strong>Eventos</strong> (domínios de nível 3+)</li>
     <li><strong>Impostos</strong> e manutenção</li>
     <li><strong>Ações</strong> (${s.acoesPorTurno} por turno)</li></ol>${pend}`);
}

/* --------------------------- Etapa 1: Eventos --------------------- */

function encontrarEvento(total) {
  return EVENTOS.find(e => total >= e.min && total <= e.max) ?? EVENTOS.at(-2);
}

export async function rolarEvento(dominio) {
  const s = dominio.system;
  if (s.turno.eventoRolado) return ui.notifications.warn("O evento deste turno já foi rolado.");
  if (s.nivel < 3) {
    await dominio.update({ "system.turno.eventoRolado": true });
    return cartao(dominio, "Etapa 1: Eventos",
      `<p>Domínios de nível 1 ou 2 são pequenos e pacatos demais para eventos aleatórios.</p>`);
  }

  const mod = s.eventoMod; // madeireiras (-10) e minas (-20)
  const formula = mod ? `1d100 + ${mod}` : "1d100";
  const rolls = [await rolar(formula)];
  let totais = [Math.clamp(rolls[0].total, 1, 100)];

  if (s.eventoDuplo) {
    rolls.push(await rolar(formula));
    totais.push(Math.clamp(rolls[1].total, 1, 100));
  }
  const total = Math.max(...totais); // aqueduto: melhor resultado
  const evento = encontrarEvento(total);

  let corpo = `<p>Rolagem: <strong>${totais.join(" / ")}</strong>${mod ? ` (modificador ${mod}%)` : ""}${s.eventoDuplo ? " — Aqueduto: usa o melhor" : ""}</p>
    <h4>${evento.nome}</h4><p>${evento.desc}</p>`;

  await dominio.update({ "system.turno.eventoRolado": true });
  await cartao(dominio, "Etapa 1: Evento Aleatório", corpo, { rolls });
  await aplicarEvento(dominio, evento);
}

async function aplicarEvento(dominio, evento) {
  const s = dominio.system;
  const cdSimples = 25 + 2 * s.nivel;

  switch (evento.key) {
    case "nenhum": return;

    case "ataque-de-dragao": {
      const r = await rolar("1d6");
      await dominio.update({ "system.nivel": Math.max(1, s.nivel - 1) }, { t20dSkipSync: true });
      await cartao(dominio, "Ataque de Dragão",
        `<p class="t20d-ruim">O domínio perde <strong>um nível</strong>, uma construção aleatória e <strong>${r.total} unidade(s)</strong>.</p>`, { rolls: [r] });
      await perderConstrucaoAleatoria(dominio, "A fúria do dragão destrói:");
      await perderUnidades(dominio, r.total, "O fogo do dragão consome as tropas.");
      await sincronizarEfeitos(dominio, { silencioso: true });
      return;
    }

    case "invasores":
    case "saqueadores": {
      const poderF = evento.key === "invasores" ? `${s.nivel}d12` : `${s.nivel}d8`;
      const guerraF = evento.key === "invasores" ? "2d6+10" : "2d4+10";
      const rp = await rolar(poderF);
      const rg = await rolar(guerraF);
      await dominio.update({
        "system.batalha.inimigoNome": evento.nome,
        "system.batalha.inimigoPoder": rp.total,
        "system.batalha.inimigoGuerra": rg.total
      });
      await cartao(dominio, evento.nome,
        `<p class="t20d-ruim">Uma força hostil marcha sobre o domínio!</p>
         <p>Poder: <strong>${rp.total}</strong> (${poderF}) · Guerra do líder: <strong>+${rg.total}</strong> (${guerraF})</p>
         <p>Resolva o confronto na aba <strong>Batalha</strong>.</p>`, { rolls: [rp, rg] });
      return;
    }

    case "peste": {
      const r = await rolar("1d3+1");
      await cartao(dominio, "Peste", `<p class="t20d-ruim">A doença se espalha.</p>`, { rolls: [r] });
      await ajustarPopularidade(dominio, -1, "A peste assola o povo.");
      await perderUnidades(dominio, r.total, "A doença dizima as tropas.");
      return;
    }

    case "levante":
      await ajustarPopularidade(dominio, -2, "A população se enfurece!");
      return;

    case "fenomeno-natural":
    case "regalia":
    case "fenomeno-magico": {
      const r = await rolar("1d6");
      const sub = SUBEVENTOS[evento.sub].find(x => r.total >= x.min && r.total <= x.max);
      await cartao(dominio, evento.nome, `<p>(1d6 = ${r.total}) ${sub.desc}</p>`, { rolls: [r] });
      await aplicarSubEvento(dominio, sub.efeito);
      return;
    }

    default: {
      // Eventos que geram pendências resolvíveis (ou persistentes)
      const eventosAtivos = [...s.turno.eventosAtivos];
      eventosAtivos.push({
        id: foundry.utils.randomID(),
        key: evento.key, nome: evento.nome, desc: evento.desc,
        pericias: evento.pericia ?? [], persistente: !!evento.persistente,
        cd: cdSimples
      });
      await dominio.update({ "system.turno.eventosAtivos": eventosAtivos });
      await cartao(dominio, evento.nome,
        `<p>${evento.desc}</p><p>Resolva na aba <strong>Turno</strong> (custa uma ação de domínio; CD ${cdSimples}) ou trate o evento como uma cena/aventura.</p>`);
      return;
    }
  }
}

async function aplicarSubEvento(dominio, efeito) {
  const s = dominio.system;
  switch (efeito) {
    case "nivel-1":
      await dominio.update({ "system.nivel": Math.max(1, s.nivel - 1) }, { t20dSkipSync: true });
      await cartao(dominio, "Desastre", `<p class="t20d-ruim">O domínio perde um nível (agora ${Math.max(1, s.nivel - 1)}).</p>`);
      await sincronizarEfeitos(dominio, { silencioso: true });
      return;
    case "construcao-1":
      await perderConstrucaoAleatoria(dominio, "O desastre destrói:");
      return;
    case "renda-1d6": {
      const r = await rolar("1d6");
      await movimentarTesouro(dominio, "Fenômeno natural: perdas na produção", -r.total);
      await cartao(dominio, "Perdas", `<p class="t20d-ruim">Os ganhos diminuem em ${r.total} LO neste turno.</p>`, { rolls: [r] });
      return;
    }
    case "renda+1d6": {
      const r = await rolar("1d6");
      await movimentarTesouro(dominio, "Regalia: colheita abençoada", r.total);
      await cartao(dominio, "Regalia", `<p class="t20d-bom">+${r.total} LO neste turno.</p>`, { rolls: [r] });
      return;
    }
    case "bloqueio":
      await dominio.update({ "system.turno.bloqueado": true });
      return;
    case "mod-5":
      await dominio.update({ "system.turno.mod": (s.turno.mod ?? 0) - 5 });
      return;
    case "mod-2":
      await dominio.update({ "system.turno.mod": (s.turno.mod ?? 0) - 2 });
      return;
    case "mod+2":
      await dominio.update({ "system.turno.mod": (s.turno.mod ?? 0) + 2 });
      return;
    case "pop+1":
      await ajustarPopularidade(dominio, +1, "A alegria toma as ruas.");
      return;
  }
}

/** Resolve uma pendência de evento com teste (regra simplificada, CD 25 + 2×nível). */
export async function resolverEvento(dominio, id, periciaKey, evento = null) {
  const s = dominio.system;
  const pend = s.turno.eventosAtivos.find(e => e.id === id);
  if (!pend) return;

  const prep = await prepararTesteRegente(dominio, periciaKey, pend.cd ?? (25 + 2 * s.nivel), { rotulo: `Resolver: ${pend.nome}`, evento });
  if (!prep) return;
  if (!(await gastarAcao(dominio))) return;

  const t = await prep.rolar();
  if (!t) return;
  let corpo = htmlResultadoTeste(t, labelPericia(periciaKey));

  if (t.sucesso) {
    await dominio.update({ "system.turno.eventosAtivos": s.turno.eventosAtivos.filter(e => e.id !== id) });
    corpo += `<p class="t20d-bom">A situação <strong>${pend.nome}</strong> é resolvida!</p>`;
    await cartao(dominio, `Evento: ${pend.nome}`, corpo, { rolls: [t.roll], rollMode: t.rollMode });
    if (pend.key === "corrupcao") {
      await ajustarCorte(dominio, -1, "As demissões (ou execuções) necessárias reduzem a corte.");
    }
  } else {
    corpo += `<p class="t20d-ruim">O problema persiste.</p>`;
    await cartao(dominio, `Evento: ${pend.nome}`, corpo, { rolls: [t.roll], rollMode: t.rollMode });
    if (!pend.persistente) await falharEvento(dominio, pend, { remover: true });
  }
}

/** Marca uma pendência como resolvida sem teste (cena jogada, decisão do mestre). */
export async function resolverEventoManual(dominio, id) {
  const s = dominio.system;
  const pend = s.turno.eventosAtivos.find(e => e.id === id);
  if (!pend) return;
  await dominio.update({ "system.turno.eventosAtivos": s.turno.eventosAtivos.filter(e => e.id !== id) });
  await cartao(dominio, `Evento: ${pend.nome}`, `<p>A situação foi resolvida (a critério do mestre).</p>`);
}

async function falharEvento(dominio, pend, { remover = false } = {}) {
  const s = dominio.system;
  switch (pend.key) {
    case "monstro":
      await ajustarPopularidade(dominio, -1, "O monstro continua à solta.");
      await perderConstrucaoAleatoria(dominio, "O monstro destrói:");
      break;
    case "intriga":
      await ajustarCorte(dominio, -1, "A intriga corrói a corte.");
      await ajustarPopularidade(dominio, -1, "Os boatos se espalham.");
      break;
    case "questao-de-justica":
      await ajustarPopularidade(dominio, -2, "A justiça falha aos olhos do povo.");
      break;
    case "questao-comercial": {
      const r = await rolar("2d6");
      await movimentarTesouro(dominio, "Questão comercial não resolvida", -r.total);
      await cartao(dominio, "Questão Comercial", `<p class="t20d-ruim">Os ganhos diminuem em ${r.total} LO.</p>`, { rolls: [r] });
      break;
    }
    case "questao-diplomatica":
      await cartao(dominio, "Questão Diplomática",
        `<p class="t20d-ruim">A exigência foi ignorada ou recusada sem sucesso — o mestre decide as consequências (possível ataque no próximo turno).</p>`);
      break;
  }
  if (remover) {
    await dominio.update({ "system.turno.eventosAtivos": dominio.system.turno.eventosAtivos.filter(e => e.id !== pend.id) });
  }
}

/* --------------------------- Etapa 2: Impostos -------------------- */

export async function cobrarImpostos(dominio, faixa) {
  const s = dominio.system;
  if (s.turno.impostosCobrados) return ui.notifications.warn("Os impostos deste turno já foram cobrados.");

  const rolls = [];
  const linhas = [];
  let ganho = 0;

  /* Impostos base */
  if (s.emRevolta) {
    linhas.push(`<li class="t20d-ruim">Revolta em curso: os impostos rendem <strong>0 LO</strong>.</li>`);
  } else if (s.tipo === "mistico") {
    ganho += s.nivel;
    linhas.push(`<li>Domínio místico: <strong>+${s.nivel} LO</strong> (1 LO por nível).</li>`);
  } else {
    const tab = IMPOSTOS[s.nivel] ?? IMPOSTOS[1];
    const formula = tab[faixa];
    const r = await rolar(String(formula));
    rolls.push(r);
    ganho += r.total;
    const rotulo = { baixos: "baixos", medios: "médios", altos: "altos" }[faixa];
    linhas.push(`<li>Impostos ${rotulo} (${formula}): <strong>+${r.total} LO</strong></li>`);
    if (faixa === "altos" && s.temConstrucao("posto-de-pedagio")) {
      ganho += s.nivel;
      linhas.push(`<li>Posto de Pedágio: <strong>+${s.nivel} LO</strong></li>`);
    }
  }

  /* Renda de construções (fazendas, feiras, portos, madeireiras, minas) */
  if (!s.emRevolta && s.tipo !== "mistico") {
    const cont = {};
    for (const c of s.construcoes) cont[c.key] = (cont[c.key] ?? 0) + 1;
    const rendaConf = [
      { key: "fazenda", nomeF: (i) => {
          const moinho = i <= (cont["moinho"] ?? 0);
          const celeiro = i <= (cont["celeiro"] ?? 0);
          const dado = moinho ? "1d8" : "1d6";
          return celeiro ? dado : `${dado}-2`;
        }, nome: "Fazenda" },
      { key: "feira", nomeF: (i) => (i <= (cont["mercado"] ?? 0) ? "1d8" : "1d4"), nome: "Feira" },
      { key: "porto", nomeF: () => "1d6", nome: "Porto" },
      { key: "madeireira", nomeF: () => "1d8", nome: "Madeireira" },
      { key: "mina", nomeF: () => "1d12", nome: "Mina" }
    ];
    for (const conf of rendaConf) {
      const n = cont[conf.key] ?? 0;
      for (let i = 1; i <= n; i++) {
        const formula = conf.nomeF(i);
        const r = await rolar(formula);
        rolls.push(r);
        ganho += r.total;
        const cls = r.total < 0 ? "t20d-ruim" : "";
        linhas.push(`<li class="${cls}">${conf.nome}${n > 1 ? ` ${i}` : ""} (${formula}): <strong>${r.total >= 0 ? "+" : ""}${r.total} LO</strong></li>`);
      }
    }

    /* Renda de construções homebrew (★) */
    const catalogo = obterConstrucoes(dominio);
    for (const [key, n] of Object.entries(cont)) {
      const def = catalogo[key];
      if (!def?.homebrew || !def.rendaFormula) continue;
      for (let i = 1; i <= n; i++) {
        const r = await rolar(String(def.rendaFormula));
        rolls.push(r);
        ganho += r.total;
        const cls = r.total < 0 ? "t20d-ruim" : "";
        linhas.push(`<li class="${cls}">${def.nome} ★${n > 1 ? ` ${i}` : ""} (${def.rendaFormula}): <strong>${r.total >= 0 ? "+" : ""}${r.total} LO</strong></li>`);
      }
    }
  }

  /* Caravana em viagem */
  if (s.caravana.ativa) {
    const k = s.caravana.dados;
    const t = await testeRegente(dominio, "nobr", 20 + k, { rotulo: "Retorno da caravana" });
    if (t) {
      rolls.push(t.roll);
      if (t.sucesso) {
        const dado = t.margem >= 10 ? "2d4+1" : t.margem >= 5 ? "1d6+1" : "1d4+1";
        const r = await rolar(Array(k).fill(`(${dado})`).join(" + "));
        rolls.push(r);
        ganho += r.total;
        linhas.push(`<li class="t20d-bom">Caravana retorna! Nobreza ${t.total} vs CD ${20 + k} (margem ${t.margem}): <strong>+${r.total} LO</strong></li>`);
      } else {
        linhas.push(`<li class="t20d-ruim">A caravana se perdeu (Nobreza ${t.total} vs CD ${20 + k}). Investimento de ${fmtLO(s.caravana.investido)} LO perdido.</li>`);
      }
      await dominio.update({ "system.caravana": { ativa: false, dados: 0, investido: 0 } });
    } else {
      /* Teste cancelado: a caravana segue em viagem até a próxima etapa de impostos */
      linhas.push(`<li>Teste da caravana cancelado — ela permanece em viagem até a próxima etapa de impostos.</li>`);
    }
  }

  /* Corrupção ativa */
  if (s.turno.eventosAtivos.some(e => e.key === "corrupcao")) {
    const r = await rolar("1d6");
    rolls.push(r);
    ganho -= r.total;
    linhas.push(`<li class="t20d-ruim">Corrupção na corte: <strong>–${r.total} LO</strong></li>`);
  }

  /* Manutenção */
  let saldo = s.tesouro.lo + ganho;
  const manutCorte = s.manutencaoCorte;
  let manutPaga = 0;
  let quebraCorte = false;
  if (manutCorte > 0) {
    if (saldo >= manutCorte) { saldo -= manutCorte; manutPaga += manutCorte; linhas.push(`<li>Manutenção da corte: <strong>–${fmtLO(manutCorte)} LO</strong></li>`); }
    else { quebraCorte = true; linhas.push(`<li class="t20d-ruim">Sem fundos para a corte (–${fmtLO(manutCorte)} LO): a corte cai uma categoria e há <strong>–5 em todas as ações neste turno</strong>.</li>`); }
  }
  const unidadesPerdidas = [];
  const unidadesNovas = [];
  for (const u of s.unidades) {
    if (u.temporaria) { unidadesNovas.push(u); continue; }
    const custoU = (UNIDADES[u.key]?.manutencao ?? 0) * (u.qtd ?? 1);
    if (saldo >= custoU) { saldo -= custoU; manutPaga += custoU; unidadesNovas.push(u); }
    else unidadesPerdidas.push(u);
  }
  if (manutPaga - manutCorte > 0 || (manutPaga > 0 && !quebraCorte && s.unidades.some(u => !u.temporaria))) {
    const custoTropas = Math.round((manutPaga - (quebraCorte ? 0 : manutCorte)) * 100) / 100;
    if (custoTropas > 0) linhas.push(`<li>Manutenção das tropas: <strong>–${fmtLO(custoTropas)} LO</strong></li>`);
  }
  for (const u of unidadesPerdidas) {
    linhas.push(`<li class="t20d-ruim">Sem soldo, <strong>${u.qtd}× ${UNIDADES[u.key]?.nome}</strong> abandonam o domínio.</li>`);
  }

  /* Aplicar tudo */
  const delta = saldo - s.tesouro.lo;
  await movimentarTesouro(dominio, `Etapa de impostos (turno ${s.turno.numero})`, delta);
  const updates = { "system.turno.impostosCobrados": true, "system.unidades": unidadesNovas };
  if (quebraCorte) {
    const idx = ORDEM_CORTES.indexOf(s.corte.categoria);
    if (idx > 0) updates["system.corte.categoria"] = ORDEM_CORTES[idx - 1];
    updates["system.turno.mod"] = (s.turno.mod ?? 0) - 5;
  }
  await dominio.update(updates);

  await cartao(dominio, "Etapa 2: Impostos e Manutenção",
    `<ul class="t20d-lista">${linhas.join("")}</ul>
     <p>Resultado líquido: <strong class="${delta >= 0 ? "t20d-bom" : "t20d-ruim"}">${delta >= 0 ? "+" : ""}${fmtLO(delta)} LO</strong> · Tesouro: <strong>${fmtLO(saldo)} LO</strong></p>`,
    { rolls });

  /* Popularidade pela carga tributária */
  if (!s.emRevolta && s.tipo !== "mistico") {
    if (faixa === "baixos") await ajustarPopularidade(dominio, +1, "Impostos baixos aliviam o povo.");
    if (faixa === "altos") await ajustarPopularidade(dominio, -1, "Impostos altos pesam no bolso do povo.");
  }
}

/* --------------------------- Encerrar Turno ----------------------- */

export async function encerrarTurno(dominio) {
  const s = dominio.system;

  /* Pendências não resolvidas sofrem as consequências */
  for (const pend of [...s.turno.eventosAtivos]) {
    if (pend.persistente) continue;
    await falharEvento(dominio, pend, { remover: true });
  }

  /* Bandidos ativos: –1 popularidade por turno */
  if (dominio.system.turno.eventosAtivos.some(e => e.key === "bandidos")) {
    await ajustarPopularidade(dominio, -1, "Os bandidos continuam roubando o povo.");
  }

  /* Revolta: destrói uma construção por turno */
  if (dominio.system.emRevolta) {
    await perderConstrucaoAleatoria(dominio, "A revolta incendeia:");
  }

  /* Camponeses dispersam */
  const unidades = dominio.system.unidades.filter(u => !u.temporaria);
  await dominio.update({ "system.unidades": unidades });

  await cartao(dominio, `Fim do Turno ${s.turno.numero}`,
    `<p>O turno de domínio se encerra. Use <strong>Iniciar Novo Turno</strong> quando a próxima aventura terminar.</p>`);
}

/* ================================================================== */
/* Batalhas Simplificadas                                             */
/* ================================================================== */

export async function rolarBatalha(dominio, evento = null) {
  const s = dominio.system;
  const regente = await obterRegente(dominio);
  if (!regente) return ui.notifications.warn("Vincule um regente ao domínio.");
  if (!s.batalha.inimigoNome && !s.batalha.inimigoPoder)
    return ui.notifications.warn("Preencha os dados do inimigo na aba Batalha.");

  const poderNosso = s.poderTotal + (s.batalha.aliadosPoder ?? 0);
  const poderDeles = s.batalha.inimigoPoder ?? 0;
  const dif = Math.abs(poderNosso - poderDeles);
  const bonusNosso = (poderNosso > poderDeles ? dif : 0) + s.fortificacao;
  const bonusDeles = (poderDeles > poderNosso ? dif : 0);

  /* Teste de Guerra do regente com a janela de configuração de uso
   * (sem modificadores de ação de domínio: batalha usa apenas Poder/Fortificação). */
  const t = await testeRegente(dominio, "guer", null, {
    rotulo: "Batalha pelo Domínio",
    bonusExtra: bonusNosso,
    rotuloExtra: "Poder/Fortificação",
    incluirModificadores: false,
    evento
  });
  if (!t) return;
  const nossoRoll = t.roll;
  const delesRoll = await rolar(`1d20 + ${s.batalha.inimigoGuerra}[Guerra] + ${bonusDeles}[Poder]`);
  const margem = nossoRoll.total - delesRoll.total;
  const resultado = RESULTADOS_BATALHA.find(r => margem >= r.margem);

  const corpo = `
    <table class="t20d-tabela">
      <tr><th></th><th>${regente.name}</th><th>${s.batalha.inimigoNome || "Inimigo"}</th></tr>
      <tr><td>Poder</td><td>${poderNosso}</td><td>${poderDeles}</td></tr>
      <tr><td>Bônus</td><td>+${bonusNosso}${s.fortificacao ? ` (Fort. ${s.fortificacao})` : ""}</td><td>+${bonusDeles}</td></tr>
      <tr><td>Guerra</td><td><strong>${nossoRoll.total}</strong></td><td><strong>${delesRoll.total}</strong></td></tr>
    </table>
    <h4 class="${margem >= 0 ? "t20d-bom" : "t20d-ruim"}">${resultado.nome} (margem ${margem >= 0 ? "+" : ""}${margem})</h4>
    <p>${resultado.desc}</p>`;

  await cartao(dominio, "Batalha pelo Domínio", corpo, { rolls: [nossoRoll, delesRoll], rollMode: t.rollMode });

  const aplicar = await DialogV2.confirm({
    window: { title: "Batalha" },
    content: `<p><strong>${resultado.nome}</strong>: ${resultado.desc}</p><p>Aplicar as consequências automaticamente?</p>`
  });
  if (aplicar) await aplicarResultadoBatalha(dominio, margem);
}

export async function aplicarResultadoBatalha(dominio, margem) {
  if (margem >= 10) {
    const r = await rolar("1d6");
    await movimentarTesouro(dominio, "Batalha: espólios da vitória total", r.total);
    await cartao(dominio, "Espólios", `<p class="t20d-bom">+${r.total} LO em espólios!</p>`, { rolls: [r] });
  } else if (margem >= 5) {
    /* vitória limpa: sem consequências */
  } else if (margem >= 0) {
    const r = await rolar("1d3");
    await perderUnidades(dominio, r.total, "A vitória cobra seu preço.");
  } else if (margem >= -5) {
    const ru = await rolar("1d3+1"); const ro = await rolar("2d6");
    await perderUnidades(dominio, ru.total, "Os invasores saqueiam a terra.");
    await movimentarTesouro(dominio, "Batalha: saque dos invasores", -ro.total);
    await cartao(dominio, "Saque", `<p class="t20d-ruim">–${ro.total} LO saqueados.</p>`, { rolls: [ro] });
  } else if (margem >= -10) {
    const ru = await rolar("1d4+1"); const ro = await rolar("3d6");
    await perderUnidades(dominio, ru.total, "Os invasores queimam propriedades.");
    await movimentarTesouro(dominio, "Batalha: pilhagem e incêndios", -ro.total);
    await perderConstrucaoAleatoria(dominio, "As chamas consomem:");
    await cartao(dominio, "Pilhagem", `<p class="t20d-ruim">–${ro.total} LO perdidos.</p>`, { rolls: [ro] });
  } else {
    const ru = await rolar("2d4+1"); const ro = await rolar("4d6");
    await perderUnidades(dominio, ru.total, "O massacre é terrível.");
    await movimentarTesouro(dominio, "Batalha: massacre", -ro.total);
    await perderConstrucaoAleatoria(dominio, "A destruição alcança:");
    await dominio.update({ "system.nivel": Math.max(1, dominio.system.nivel - 1) }, { t20dSkipSync: true });
    await cartao(dominio, "Massacre", `<p class="t20d-ruim">–${ro.total} LO e o domínio <strong>perde um nível</strong>.</p>`, { rolls: [ro] });
    await sincronizarEfeitos(dominio, { silencioso: true });
  }
}
