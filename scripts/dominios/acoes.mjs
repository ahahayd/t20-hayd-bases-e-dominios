/**
 * t20-hayd-dominios | acoes.mjs
 * Motor de regras de Regência: turnos de domínio, ações, impostos,
 * eventos aleatórios e batalhas simplificadas (Heróis de Arton, pp. 323-327).
 */
import {
  MODULO, CORTES, ORDEM_CORTES, POPULARIDADES, ORDEM_POPULARIDADE,
  IMPOSTOS, UNIDADES, EVENTOS, SUBEVENTOS,
  RESULTADOS_BATALHA, CATEGORIAS_CONSTRUCAO, CONSELHEIROS, labelPericia, temaHayd, corDominio,
  obterConstrucoes, unidadeDoDominio, formulaImpostos
} from "./catalogo.mjs";
import { obterRegente, sincronizarEfeitos } from "./efeitos.mjs";
import { htmlDesfechoObra } from "../correcao-obras.mjs";
import { pedirTeste, escolherPericia } from "../teste-remoto.mjs";
import { totalDecimos } from "../bases/acoes.mjs";
import { modoPadrao, modoDaJanela, aplicarModo, prepararJanelaDePericia } from "../versao.mjs";

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
  if (rollMode) aplicarModo(dados, rollMode);
  return ChatMessage.create(dados);
}

/** Registra uma movimentação no tesouro (delta em LO) e atualiza o saldo. */
export async function movimentarTesouro(dominio, desc, delta, reg = null) {
  const atual = dominio.system.tesouro.lo;
  const novo = Math.max(0, Math.round((atual + delta) * 100) / 100);
  reg?.push({ t: "lo", delta: Math.round((novo - atual) * 100) / 100, desc });
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
export async function ajustarPopularidade(dominio, passos, motivo = "", reg = null) {
  if (dominio.system.tipo === "mistico" || !passos) return;
  reg?.push({ t: "pop", popularidade: dominio.system.popularidade, emRevolta: dominio.system.emRevolta });
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

export async function ajustarCorte(dominio, passos, motivo = "", reg = null) {
  let idx = ORDEM_CORTES.indexOf(dominio.system.corte.categoria);
  const novoIdx = Math.clamp(idx + passos, 0, ORDEM_CORTES.length - 1);
  if (novoIdx === idx) return;
  reg?.push({ t: "corte", categoria: dominio.system.corte.categoria });
  await dominio.update({ "system.corte.categoria": ORDEM_CORTES[novoIdx] });
  await cartao(dominio, "Corte",
    `<p>${motivo ? motivo + " " : ""}A corte ${passos > 0 ? "sobe" : "desce"} para <strong>${CORTES[ORDEM_CORTES[novoIdx]].nome}</strong>.</p>`);
}

/** Remove uma construção aleatória (evento, batalha, revolta). */
export async function perderConstrucaoAleatoria(dominio, motivo = "", reg = null) {
  const lista = dominio.system.construcoes;
  if (!lista.length) return null;
  const alvo = lista[Math.floor(Math.random() * lista.length)];
  reg?.push({ t: "construcao", entrada: foundry.utils.deepClone(alvo) });
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

  const montarPartes = (chave) => {
    const per = regente.system.pericias?.[chave];
    const lista = [`1d20`, `${per?.value ?? 0}[${labelPericia(chave)}]`];
    if (incluirModificadores) {
      // Conselheiro fornece o bônus de treinamento se o regente for destreinado
      const treinado = !!(per?.treinado || (per?.treino ?? 0) > 0);
      const conselheiros = dominio.system.corte.conselheiros ?? [];
      const cobre = conselheiros.some(c => CONSELHEIROS[c]?.pericia === chave);
      if (!treinado && cobre) {
        const conselheiro = regente.system.attributes?.treino ?? 2;
        lista.push(`${conselheiro}[Conselheiro]`);
      }

      const modAcoes = dominio.system.modAcoes;
      if (modAcoes) lista.push(`${modAcoes}[Ações de domínio]`);
    }
    if (bonusExtra) lista.push(`${bonusExtra}[${rotuloExtra || "Bônus"}]`);
    return lista;
  };

  /* Regente de um jogador conectado: o teste é rolado na tela dele, antes
   * de qualquer gasto (recusar cancela a ação, como fechar a janela). */
  const partesPorPericia = {};
  for (const chave of new Set([periciaKey, ...Object.keys(regente.system.pericias ?? {})]))
    partesPorPericia[chave] = montarPartes(chave);
  const remoto = await pedirTeste(regente, {
    acao: `realizar a ação de domínio “${rotulo || labelPericia(periciaKey)}”`, local: dominio.name,
    pericia: periciaKey, cd, modo: "partes", partesPorPericia, rotulo
  });
  if (remoto === null) return null;
  if (remoto) {
    const t = resultadoTeste(remoto.roll, regente, cd, remoto.rollMode, remoto.pericia, rotulo);
    return { regente, rollMode: remoto.rollMode, rolar: async () => t };
  }

  /* Teste rolado aqui: a mesma escolha de perícia do teste remoto, porque
   * várias habilidades do Tormenta20 trocam a perícia de um teste. */
  const escolhida = await escolherPericia(regente, {
    textoAcao: `realizar a ação de domínio “${rotulo || labelPericia(periciaKey)}”`, local: dominio.name,
    pericia: periciaKey, cd, rotulo,
    nota: "A perícia da ação já vem selecionada. Troque só se uma habilidade permitir outra."
  });
  if (!escolhida) return null;
  periciaKey = escolhida;

  const nomePericia = labelPericia(periciaKey);
  const per = regente.system.pericias?.[periciaKey];
  const partes = montarPartes(periciaKey);

  let rollMode = modoPadrao();
  let rConfig = {};
  let itemData = null;

  /* Janela de configuração de uso do sistema (mesmo fluxo do rollPericia) */
  const api = game.tormenta20;
  const usarSistema = !!(api?.applications?.AbilityUseDialog && api?.dice?.d20Roll);
  if (usarSistema) {
    itemData = prepararJanelaDePericia({
      ...(per ?? {}),
      name: nomePericia,
      label: nomePericia,
      type: "pericia",
      parts: partes,
      id: periciaKey,
      actor: regente,
      system: { ativacao: { custo: 0 } },
      isOwned: true
    }, regente);
    // Respeita a preferência do sistema: por padrão abre a janela; Shift inverte
    const usoPadrao = game.settings.get("tormenta20", "UsageConfig") === "default";
    const shift = evento?.shiftKey ?? false;
    const abrirJanela = usoPadrao ? !shift : shift;
    if (abrirJanela) {
      const configuracao = await api.applications.AbilityUseDialog.create(itemData);
      if (!configuracao) return null; // jogador cancelou a janela
      rConfig = configuracao;
      rollMode = modoDaJanela(configuracao, rollMode);
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
    return resultadoTeste(roll, regente, cd, rollMode, periciaKey, rotulo);
  };

  return { regente, rollMode, rolar: rolarTeste };
}

function resultadoTeste(roll, regente, cd, rollMode, periciaKey, rotulo) {
  if (!roll) return null;
  const sucesso = cd != null ? roll.total >= cd : null;
  const margem = cd != null ? roll.total - cd : 0;
  console.debug(`${MODULO} | Teste ${rotulo || periciaKey}: ${roll.formula} = ${roll.total} vs CD ${cd} → ${sucesso ? "sucesso" : "falha"} (margem ${margem})`);
  return { roll, sucesso, margem, total: roll.total, regente, cd, rollMode, nomePericia: labelPericia(periciaKey) };
}

/** Prepara e executa o teste em um único passo (janela + rolagem). */
export async function testeRegente(dominio, periciaKey, cd, opcoes = {}) {
  const prep = await prepararTesteRegente(dominio, periciaKey, cd, opcoes);
  return prep ? prep.rolar() : null;
}

function htmlResultadoTeste(t, nomePericia) {
  if (!t) return "";
  nomePericia = t.nomePericia ?? nomePericia; // o jogador pode ter trocado a perícia
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
  await cartaoDesfecho(dominio, "Ação: Aumentar Corte", "aumentarCorte", { modo, custo }, { t });
}

export async function acaoConvocarCamponeses(dominio) {
  if (!(await gastarAcao(dominio))) return;
  if (!(await pagarLO(dominio, 1, "Ação: Convocar Camponeses"))) return;
  const guarda = dominio.system.temConstrucao("guarda-de-karst");
  const roll = await rolar(guarda ? "1d6+1" : "1d6");
  const unidades = [...dominio.system.unidades];
  unidades.push({ id: foundry.utils.randomID(), key: "camponeses", qtd: roll.total, temporaria: true });
  await dominio.update({ "system.unidades": unidades });
  await cartao(dominio, "Ação: Convocar Camponeses",
    `<p>O povo pega em armas: <strong>${roll.total} unidade(s) de camponeses</strong> até o fim do turno.</p>${guarda ? `<p>A Guarda de Karst: +1 unidade, com Defesa 16 e dano 1d8+1.</p>` : ""}`,
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
  const dados = { nivel: dominio.system.nivel, ganho: null };
  const rolls = [];
  if (t.sucesso) {
    const ganho = await rolar(`1d6 + ${dados.nivel}`);
    rolls.push(ganho);
    dados.ganho = ganho.total;
  }
  await cartaoDesfecho(dominio, "Ação: Extorquir", "extorquir", dados, { t, rolls });
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
  await cartaoDesfecho(dominio, "Ação: Festival", "festival", {}, { t });
}

/* Moedas do sistema Tormenta20, da maior para a menor, com o valor em
 * décimos de T$ (TC = T$ 0,1), na mesma escala de totalDecimos. A platina
 * é "TL" (o sistema a abrevia "TP", que se confunde com a prata). */
const MOEDAS = [
  { chave: "tl", valor: 1000, abrev: "TL" },
  { chave: "to", valor: 100, abrev: "TO" },
  { chave: "tp", valor: 10, abrev: "T$" },
  { chave: "tc", valor: 1, abrev: "TC" }
];

const fmtDecimos = (dec) => `T$ ${(dec / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;

/**
 * Desconta um valor (em décimos de T$) de uma carteira gastando sempre as
 * maiores moedas primeiro (platina → ouro → prata → cobre). Como 1 LO
 * (T$ 1.000) é múltiplo de todas as moedas, o valor fecha sem troco sempre
 * que o saldo total basta. Retorna { carteira, gasto }, ou null se faltar.
 */
function gastarMaioresMoedas(d, decimos) {
  const carteira = { tc: d?.tc ?? 0, tp: d?.tp ?? 0, to: d?.to ?? 0, tl: d?.tl ?? 0 };
  const gasto = [];
  let resta = decimos;
  for (const { chave, valor, abrev } of MOEDAS) {
    const usa = Math.min(carteira[chave], Math.floor(resta / valor));
    if (!usa) continue;
    carteira[chave] -= usa;
    resta -= usa * valor;
    gasto.push(`${usa.toLocaleString("pt-BR")} ${abrev}`);
  }
  return resta > 0 ? null : { carteira, gasto };
}

export async function acaoFinancas(dominio, evento = null) {
  const regente = await obterRegente(dominio);
  if (!regente) return ui.notifications.warn("Vincule um regente ao domínio.");
  const saldoRegente = () => totalDecimos(regente.system.dinheiro);
  const cd = dominio.system.temConstrucao("torre-de-loras") ? 15 : 20;
  const conteudo = `
    <p>Conversão à taxa de <strong>T$ 1.000 = 1 LO</strong>. Teste de Nobreza (CD ${cd}${cd === 15 ? ", Torre de Loras" : ""}).</p>
    <p>Dinheiro de ${regente.name}: <strong>${fmtDecimos(saldoRegente())}</strong></p>
    <div class="form-group"><label>Direção</label>
      <select name="direcao">
        <option value="paraLO">Dinheiro do regente → Lingotes do domínio</option>
        <option value="paraTS">Lingotes do domínio → Dinheiro do regente (em TO)</option>
      </select></div>
    <div class="form-group"><label>Quantidade (em LO)</label>
      <input type="number" name="qtd" value="1" min="1" step="1"></div>`;
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
  const custoDec = qtdLO * 10000; // 1 LO = T$ 1.000, em décimos de T$
  const qtdTO = qtdLO * 100;

  if (dados.direcao === "paraLO" && saldoRegente() < custoDec)
    return ui.notifications.error(`${regente.name} não possui ${fmtDecimos(custoDec)} (tem ${fmtDecimos(saldoRegente())}).`);
  if (dados.direcao === "paraTS" && dominio.system.tesouro.lo < qtdLO)
    return ui.notifications.error(`O tesouro não possui ${qtdLO} LO.`);

  const prep = await prepararTesteRegente(dominio, "nobr", cd, { rotulo: "Finanças", evento });
  if (!prep) return;
  if (!(await gastarAcao(dominio))) return;
  const t = await prep.rolar();
  if (!t) return;
  await cartaoDesfecho(dominio, "Ação: Finanças", "financas",
    { direcao: dados.direcao, qtdLO, qtdTO, custoDec, regenteUuid: regente.uuid }, { t });
}

export async function acaoGovernar(dominio, evento = null) {
  const s = dominio.system;
  if (s.turno.governarUsada) return ui.notifications.warn("Governar só pode ser usada uma vez por turno.");

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
  await cartaoDesfecho(dominio, "Ação: Governar", "governar", { proximo, anterior: s.nivel }, { t });
}

/** Verifica os pré-requisitos de uma construção. Retorna string de erro ou null. */
export function validarConstrucao(dominio, key) {
  const catalogo = obterConstrucoes(dominio);
  const def = catalogo[key];
  const s = dominio.system;
  if (!def) return "Construção desconhecida.";
  if (CATEGORIAS_CONSTRUCAO[def.categoria]?.oculta)
    return s.temConstrucao(key) ? "Esta construção já existe no domínio." : null;
  if (s.construcoesOcupadas >= s.maxConstrucoes)
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
  if (cat?.oculta) return concederConstrucao(dominio, key, def);
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

/** Construções de recompensa (seção oculta): entram sem teste, ação nem custo. */
async function concederConstrucao(dominio, key, def) {
  const ok = await DialogV2.confirm({
    window: { title: "Conceder Construção" },
    content: `<p>Adicionar <strong>${def.nome}</strong>${def.npc ? ` (${def.npc})` : ""}?</p>
      <p>${def.beneficio}.</p><p>Gratuita: sem teste, sem ação de domínio e sem ocupar vaga.</p>`
  });
  if (!ok) return;
  const entrada = {
    id: foundry.utils.randomID(), key,
    efeitoAtivo: !!def.efeito, escolha: null,
    turno: dominio.system.turno.numero
  };
  await dominio.update({ "system.construcoes": [...dominio.system.construcoes, entrada] });
  if (game.settings.get(MODULO, "dominiosSincronizarAuto")) await sincronizarEfeitos(dominio, { silencioso: true });
  await cartao(dominio, "Construção Concedida",
    `<p><strong>${def.nome}</strong>${def.npc ? ` — legado de ${def.npc}` : ""}.</p><p>${def.beneficio}.</p>`);
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
  await cartaoDesfecho(dominio, `Evento: ${pend.nome}`, "evento", { pend: foundry.utils.deepClone(pend) }, { t });
}

/** Marca uma pendência como resolvida sem teste (cena jogada, decisão do mestre). */
export async function resolverEventoManual(dominio, id) {
  const s = dominio.system;
  const pend = s.turno.eventosAtivos.find(e => e.id === id);
  if (!pend) return;
  await dominio.update({ "system.turno.eventosAtivos": s.turno.eventosAtivos.filter(e => e.id !== id) });
  await cartao(dominio, `Evento: ${pend.nome}`, `<p>A situação foi resolvida (a critério do mestre).</p>`);
}

async function falharEvento(dominio, pend, { remover = false } = {}, reg = null) {
  const s = dominio.system;
  switch (pend.key) {
    case "monstro":
      await ajustarPopularidade(dominio, -1, "O monstro continua à solta.", reg);
      await perderConstrucaoAleatoria(dominio, "O monstro destrói:", reg);
      break;
    case "intriga":
      await ajustarCorte(dominio, -1, "A intriga corrói a corte.", reg);
      await ajustarPopularidade(dominio, -1, "Os boatos se espalham.", reg);
      break;
    case "questao-de-justica":
      await ajustarPopularidade(dominio, -2, "A justiça falha aos olhos do povo.", reg);
      break;
    case "questao-comercial": {
      const r = await rolar("2d6");
      await movimentarTesouro(dominio, "Questão comercial não resolvida", -r.total, reg);
      await cartao(dominio, "Questão Comercial", `<p class="t20d-ruim">Os ganhos diminuem em ${r.total} LO.</p>`, { rolls: [r] });
      break;
    }
    case "questao-diplomatica":
      await cartao(dominio, "Questão Diplomática",
        `<p class="t20d-ruim">A exigência foi ignorada ou recusada sem sucesso — o mestre decide as consequências (possível ataque no próximo turno).</p>`);
      break;
  }
  if (remover) {
    const ativos = dominio.system.turno.eventosAtivos;
    if (ativos.some(e => e.id === pend.id)) reg?.push({ t: "evento", pend: foundry.utils.deepClone(pend) });
    await dominio.update({ "system.turno.eventosAtivos": ativos.filter(e => e.id !== pend.id) });
  }
}

/* --------------------------- Etapa 2: Impostos -------------------- */

export async function cobrarImpostos(dominio, faixa) {
  const s = dominio.system;
  if (s.turno.impostosCobrados) return ui.notifications.warn("Os impostos deste turno já foram cobrados.");
  await dominio.update({ "system.turno.impostosCobrados": true });

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
    const tab = IMPOSTOS[Math.clamp(s.nivel, 1, 7)];
    const formula = formulaImpostos(s, tab[faixa]);
    const r = await rolar(formula);
    rolls.push(r);
    ganho += r.total;
    const rotulo = { baixos: "baixos", medios: "médios", altos: "altos" }[faixa];
    linhas.push(`<li>Impostos ${rotulo} (${tab[faixa]}): <strong>+${r.total} LO</strong>${htmlNovaRolagem(s, r, formula !== String(tab[faixa]))}</li>`);
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

  /* Corrupção ativa */
  if (s.turno.eventosAtivos.some(e => e.key === "corrupcao")) {
    const r = await rolar("1d6");
    rolls.push(r);
    ganho -= r.total;
    linhas.push(`<li class="t20d-ruim">Corrupção na corte: <strong>–${r.total} LO</strong></li>`);
  }

  /* Popularidade pela carga tributária, aplicada junto com a arrecadação */
  let pop = 0, motivo = "";
  if (!s.emRevolta && s.tipo !== "mistico") {
    if (faixa === "baixos") { pop = +1; motivo = "Impostos baixos aliviam o povo."; }
    if (faixa === "altos") { pop = -1; motivo = "Impostos altos pesam no bolso do povo."; }
  }
  await cartaoDesfecho(dominio, "Etapa 2: Impostos", "impostos",
    { linhas, total: Math.round(ganho * 100) / 100, pop, motivo, turno: s.turno.numero }, { manual: true, rolls });

  await testarPier(dominio);
  await retornarCaravana(dominio);

  if (dominio.system.manutencaoTotal > 0) {
    await cartaoDesfecho(dominio, "Etapa 2: Manutenção", "manutencao",
      { corte: dominio.system.manutencaoCorte, tropas: dominio.system.manutencaoUnidades, turno: s.turno.numero }, { manual: true });
  }
}

/** Linha que mostra cada dado rolado de novo pela Torre de Loras ou pela Filial do Presunto. */
function htmlNovaRolagem(s, roll, aplicada) {
  if (!aplicada) return "";
  const fonte = s.temConstrucao("filial-do-presunto")
    ? "Filial do Presunto: rola de novo cada 1 ou 2, uma vez por dado"
    : "Torre de Loras: rola de novo cada 1, uma vez por dado";
  const partes = [];
  let rerolados = 0;
  for (const dado of roll.dice) {
    const originais = dado.results.slice(0, dado.number);
    const novos = dado.results.slice(dado.number);
    let k = 0;
    for (const r of originais) {
      if (r.rerolled) { rerolados++; partes.push(`<s>${r.result}</s> → <strong>${novos[k++]?.result ?? "?"}</strong>`); }
      else partes.push(String(r.result));
    }
  }
  const detalhe = rerolados ? `dados: ${partes.join(", ")}` : `dados: ${partes.join(", ")} (nenhum precisou rolar de novo)`;
  return `<br><small class="t20d-nova-rolagem"><i class="fa-solid fa-rotate"></i> ${fonte}. ${detalhe}.</small>`;
}

/** Píer dos Piratas: 1 LO e Jogatina (CD 25) para atrair a feira. */
async function testarPier(dominio) {
  const s = dominio.system;
  if (s.emRevolta || !s.temConstrucao("pier-dos-piratas") || s.tesouro.lo < 1) return;
  const apostar = await DialogV2.confirm({
    window: { title: "Píer dos Piratas" },
    content: `<p>Gastar <strong>1 LO</strong> do tesouro e fazer um teste de Jogatina (CD 25)? Se passar, a feira do píer arrecada <strong>+1d4+1 LO</strong>.</p>`
  });
  if (!apostar) return;
  const t = await testeRegente(dominio, "joga", 25, { rotulo: "Píer dos Piratas", incluirModificadores: false });
  if (!t) return;
  await movimentarTesouro(dominio, "Píer dos Piratas: 1 LO investido na feira", -1);
  const dados = { ganho: null };
  const rolls = [];
  if (t.sucesso) {
    const r = await rolar("1d4+1");
    rolls.push(r);
    dados.ganho = r.total;
  }
  await cartaoDesfecho(dominio, "Píer dos Piratas", "pier", dados, { t, manual: true, rolls });
}

/** Caravana em viagem: teste de Nobreza; o retorno vira um cartão para adicionar ao tesouro. */
async function retornarCaravana(dominio) {
  const s = dominio.system;
  if (!s.caravana.ativa) return;
  const k = s.caravana.dados;
  const t = await testeRegente(dominio, "nobr", 20 + k, { rotulo: "Retorno da caravana" });
  if (!t) {
    /* Teste cancelado: a caravana segue em viagem até a próxima etapa de impostos */
    await cartao(dominio, "Caravana", `<p>Teste da caravana cancelado — ela permanece em viagem até a próxima etapa de impostos.</p>`);
    return;
  }
  const dados = { k, margem: t.margem, investido: s.caravana.investido, ganho: null };
  const rolls = [];
  if (t.sucesso) {
    const r = await rolar(formulaCaravana(k, t.margem));
    rolls.push(r);
    dados.ganho = r.total;
  }
  await dominio.update({ "system.caravana": { ativa: false, dados: 0, investido: 0 } });
  await cartaoDesfecho(dominio, "Retorno da Caravana", "caravana", dados, { t, manual: true, rolls });
}

function formulaCaravana(k, margem) {
  const dado = margem >= 10 ? "2d4+1" : margem >= 5 ? "1d6+1" : "1d4+1";
  return Array(k).fill(`(${dado})`).join(" + ");
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


/* ================================================================== */
/* Cartões com desfecho: aplicar, desfazer e correção do mestre       */
/* ================================================================== */
/*
 * Cada cartão de teste ou de arrecadação guarda em flags.<MODULO>.desfecho
 * { acao, atorUuid, dados, sucesso (null = sem teste), manual, aplicado,
 *   reg, por, desfeitoPor, alteradoPor }. "reg" lista o que o desfecho
 * mudou no domínio, para desfazer sem tocar no resto.
 *
 * - Ações (manual: false) aplicam o desfecho na hora; o mestre pode
 *   inverter o resultado do teste, e o desfecho oposto substitui o atual.
 * - Arrecadações (manual: true) esperam alguém clicar em Aplicar; o
 *   cartão registra quem aplicou e permite desfazer.
 * Custos e ações gastos antes do teste nunca são devolvidos.
 */

const CANAL = `module.${MODULO}`;
const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
const sinalLO = (v) => `${v >= 0 ? "+" : "–"}${fmtLO(Math.abs(v))} LO`;

const DESFECHOS = {
  aumentarCorte: {
    texto: (d, ok) => !ok ? `<p>A corte permanece como está${d.custo ? " e o ouro foi gasto" : ""}.</p>`
      : d.modo === "trocar" ? `<p>Você pode trocar um conselheiro na aba Domínio.</p>`
      : `<p class="t20d-bom">A corte ${d.modo === "subir" ? "sobe" : "desce"} uma categoria.</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (ok && d.modo !== "trocar") await ajustarCorte(dominio, d.modo === "subir" ? +1 : -1, "", reg);
    }
  },
  extorquir: {
    texto: (d, ok) => ok ? `<p>Impostos abusivos rendem <strong>+${d.ganho} LO</strong>.</p>` : `<p>O povo resiste às cobranças.</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (!ok) return;
      d.ganho ??= (await rolar(`1d6 + ${d.nivel}`)).total;
      await movimentarTesouro(dominio, "Ação: Extorquir", d.ganho, reg);
    }
  },
  festival: {
    texto: (d, ok) => ok ? `<p>A festa é um sucesso!</p>` : `<p>A festa fracassa, e o ouro foi gasto mesmo assim.</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (ok) await ajustarPopularidade(dominio, +1, "O festival alegra o povo.", reg);
    }
  },
  financas: {
    texto: (d, ok) => d.nota ?? (ok ? "" : `<p>A negociação com os cambistas fracassa; nada é convertido.</p>`),
    async aplicar(dominio, ok, d, reg) {
      if (!ok) { d.nota = null; return; }
      const regente = await fromUuid(d.regenteUuid).catch(() => null);
      if (!regente) { d.nota = `<p class="t20d-ruim">O regente não foi encontrado; nada é convertido.</p>`; return; }
      /* Saldos relidos na hora: o teste remoto pode demorar, e o dinheiro
       * ou o tesouro podem ter mudado nesse meio tempo. */
      if (d.direcao === "paraLO") {
        const antes = { ...regente.system.dinheiro };
        const pagamento = gastarMaioresMoedas(antes, d.custoDec);
        if (!pagamento) { d.nota = `<p class="t20d-ruim">${esc(regente.name)} já não possui ${fmtDecimos(d.custoDec)}; nada é convertido.</p>`; return; }
        await regente.update({ "system.dinheiro": pagamento.carteira });
        const delta = {};
        for (const k of Object.keys(pagamento.carteira)) delta[k] = pagamento.carteira[k] - (antes[k] ?? 0);
        reg.push({ t: "dinheiro", atorUuid: regente.uuid, delta });
        await movimentarTesouro(dominio, `Finanças: conversão de ${fmtDecimos(d.custoDec)} (${regente.name})`, d.qtdLO, reg);
        const gasto = new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(pagamento.gasto);
        d.nota = `<p><strong>${gasto}</strong> de ${esc(regente.name)} tornam-se <strong>${d.qtdLO} LO</strong> no tesouro.</p>`;
      } else {
        if (dominio.system.tesouro.lo < d.qtdLO) { d.nota = `<p class="t20d-ruim">O tesouro já não possui ${d.qtdLO} LO; nada é convertido.</p>`; return; }
        await movimentarTesouro(dominio, `Finanças: conversão em ${d.qtdTO.toLocaleString("pt-BR")} TO (${regente.name})`, -d.qtdLO, reg);
        await regente.update({ "system.dinheiro.to": (regente.system.dinheiro?.to ?? 0) + d.qtdTO });
        reg.push({ t: "dinheiro", atorUuid: regente.uuid, delta: { to: d.qtdTO } });
        d.nota = `<p><strong>${d.qtdLO} LO</strong> do tesouro tornam-se <strong>${d.qtdTO.toLocaleString("pt-BR")} TO</strong> para ${esc(regente.name)}.</p>`;
      }
    }
  },
  governar: {
    texto: (d, ok) => ok ? `<p class="t20d-bom">O domínio prospera e alcança o <strong>nível ${d.proximo}</strong>!</p>`
      : `<p>As demandas dos súditos superam seus esforços — o domínio permanece no nível ${d.anterior}.</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (!ok) return;
      reg.push({ t: "nivel", nivel: dominio.system.nivel });
      await dominio.update({ "system.nivel": d.proximo }, { t20dSkipSync: true });
      await sincronizarEfeitos(dominio, { silencioso: true });
    }
  },
  evento: {
    texto: (d, ok) => ok ? `<p class="t20d-bom">A situação <strong>${esc(d.pend.nome)}</strong> é resolvida!</p>` : `<p class="t20d-ruim">O problema persiste.</p>`,
    async aplicar(dominio, ok, d, reg) {
      const pend = d.pend;
      if (ok) {
        const ativos = dominio.system.turno.eventosAtivos;
        if (ativos.some(e => e.id === pend.id)) {
          reg.push({ t: "evento", pend });
          await dominio.update({ "system.turno.eventosAtivos": ativos.filter(e => e.id !== pend.id) });
        }
        if (pend.key === "corrupcao") await ajustarCorte(dominio, -1, "As demissões (ou execuções) necessárias reduzem a corte.", reg);
      } else if (!pend.persistente) {
        await falharEvento(dominio, pend, { remover: true }, reg);
      }
    }
  },
  impostos: {
    rotulo: (d) => d.total >= 0 ? `Adicionar ${fmtLO(d.total)} LO ao tesouro` : `Descontar ${fmtLO(-d.total)} LO do tesouro`,
    texto: (d) => `<ul class="t20d-lista">${d.linhas.join("")}</ul>
      <p>Arrecadação: <strong class="${d.total >= 0 ? "t20d-bom" : "t20d-ruim"}">${sinalLO(d.total)}</strong>${d.pop ? ` · popularidade ${d.pop > 0 ? "+1" : "–1"} categoria` : ""}</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (d.total) await movimentarTesouro(dominio, `Etapa de impostos (turno ${d.turno})`, d.total, reg);
      if (d.pop) await ajustarPopularidade(dominio, d.pop, d.motivo, reg);
    }
  },
  pier: {
    rotulo: (d, ok) => ok ? `Adicionar ${d.ganho ?? "1d4+1"} LO ao tesouro` : null,
    texto: (d, ok) => ok ? `<p class="t20d-bom">A feira do píer lota! Arrecada <strong>${d.ganho != null ? `+${d.ganho} LO` : "+1d4+1 LO (rolado ao aplicar)"}</strong>.</p>`
      : `<p class="t20d-ruim">Pouco movimento no píer: o 1 LO investido foi gasto.</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (!ok) return;
      d.ganho ??= (await rolar("1d4+1")).total;
      await movimentarTesouro(dominio, "Píer dos Piratas: feira", d.ganho, reg);
    }
  },
  caravana: {
    rotulo: (d, ok) => ok ? `Adicionar ${d.ganho ?? "o retorno"} LO ao tesouro` : null,
    texto: (d, ok) => ok ? `<p class="t20d-bom">A caravana retorna! Rende <strong>${d.ganho != null ? `+${d.ganho} LO` : `${formulaCaravana(d.k, d.margem)} LO (rolado ao aplicar)`}</strong>.</p>`
      : `<p class="t20d-ruim">A caravana se perdeu. Investimento de ${fmtLO(d.investido)} LO perdido.</p>`,
    async aplicar(dominio, ok, d, reg) {
      if (!ok) return;
      d.ganho ??= (await rolar(formulaCaravana(d.k, d.margem))).total;
      await movimentarTesouro(dominio, "Retorno da caravana", d.ganho, reg);
    }
  },
  manutencao: {
    rotulo: () => "Pagar manutenção",
    texto: (d) => d.nota ?? `<p>Manutenção do turno: corte ${fmtLO(d.corte)} LO + tropas ${fmtLO(d.tropas)} LO = <strong>${fmtLO(d.corte + d.tropas)} LO</strong>.</p>
      <p class="notes">Adicione a arrecadação antes de pagar. Sem fundos, a corte cai uma categoria (–5 nas ações do turno) e tropas sem soldo abandonam o domínio.</p>`,
    async aplicar(dominio, ok, d, reg) {
      const s = dominio.system;
      const unidadesAntes = foundry.utils.deepClone(s.unidades);
      const categoriaAntes = s.corte.categoria;
      const modAntes = s.turno.mod ?? 0;
      let saldo = s.tesouro.lo;
      const linhas = [];
      let pago = 0;
      let quebraCorte = false;
      const manutCorte = s.manutencaoCorte;
      if (manutCorte > 0) {
        if (saldo >= manutCorte) { saldo -= manutCorte; pago += manutCorte; linhas.push(`<li>Manutenção da corte: <strong>–${fmtLO(manutCorte)} LO</strong></li>`); }
        else { quebraCorte = true; linhas.push(`<li class="t20d-ruim">Sem fundos para a corte (–${fmtLO(manutCorte)} LO): a corte cai uma categoria e há <strong>–5 em todas as ações neste turno</strong>.</li>`); }
      }
      const unidadesNovas = [];
      const perdidas = [];
      let tropas = 0;
      for (const u of s.unidades) {
        if (u.temporaria) { unidadesNovas.push(u); continue; }
        const custoU = (unidadeDoDominio(s, u.key)?.manutencao ?? 0) * (u.qtd ?? 1);
        if (saldo >= custoU) { saldo -= custoU; tropas += custoU; unidadesNovas.push(u); }
        else perdidas.push(u);
      }
      tropas = Math.round(tropas * 100) / 100;
      if (tropas > 0) linhas.push(`<li>Manutenção das tropas: <strong>–${fmtLO(tropas)} LO</strong></li>`);
      for (const u of perdidas) linhas.push(`<li class="t20d-ruim">Sem soldo, <strong>${u.qtd}× ${UNIDADES[u.key]?.nome}</strong> abandonam o domínio.</li>`);
      pago += tropas;

      if (pago > 0) await movimentarTesouro(dominio, `Manutenção (turno ${d.turno})`, -pago, reg);
      const updates = {};
      if (perdidas.length) {
        reg.push({ t: "unidades", unidades: unidadesAntes });
        updates["system.unidades"] = unidadesNovas;
      }
      if (quebraCorte) {
        const idx = ORDEM_CORTES.indexOf(categoriaAntes);
        reg.push({ t: "corte", categoria: categoriaAntes }, { t: "turnoMod", mod: modAntes });
        if (idx > 0) updates["system.corte.categoria"] = ORDEM_CORTES[idx - 1];
        updates["system.turno.mod"] = modAntes - 5;
      }
      if (Object.keys(updates).length) await dominio.update(updates);
      if (!linhas.length) linhas.push(`<li>Nada a pagar neste turno.</li>`);
      d.nota = `<ul class="t20d-lista">${linhas.join("")}</ul><p>Tesouro após a manutenção: <strong>${fmtLO(dominio.system.tesouro.lo)} LO</strong></p>`;
    }
  }
};

/** Desfaz, em ordem inversa, o que um desfecho registrou. */
async function desfazerRegistro(dominio, reg) {
  for (const op of [...reg].reverse()) {
    const s = dominio.system;
    switch (op.t) {
      case "lo":
        if (op.delta) await movimentarTesouro(dominio, `Desfeito: ${op.desc}`, -op.delta);
        break;
      case "pop":
        await dominio.update({ "system.popularidade": op.popularidade, "system.emRevolta": op.emRevolta });
        break;
      case "corte":
        await dominio.update({ "system.corte.categoria": op.categoria });
        break;
      case "turnoMod":
        await dominio.update({ "system.turno.mod": op.mod });
        break;
      case "nivel":
        await dominio.update({ "system.nivel": op.nivel }, { t20dSkipSync: true });
        await sincronizarEfeitos(dominio, { silencioso: true });
        break;
      case "unidades":
        await dominio.update({ "system.unidades": op.unidades });
        break;
      case "construcao":
        if (!s.construcoes.some(c => c.id === op.entrada.id)) {
          await dominio.update({ "system.construcoes": [...s.construcoes, op.entrada] });
          await sincronizarEfeitos(dominio, { silencioso: true });
        }
        break;
      case "evento":
        if (!s.turno.eventosAtivos.some(e => e.id === op.pend.id))
          await dominio.update({ "system.turno.eventosAtivos": [...s.turno.eventosAtivos, op.pend] });
        break;
      case "dinheiro": {
        const ator = await fromUuid(op.atorUuid).catch(() => null);
        if (!ator) break;
        const updates = {};
        for (const [k, v] of Object.entries(op.delta)) updates[`system.dinheiro.${k}`] = (ator.system.dinheiro?.[k] ?? 0) - v;
        await ator.update(updates);
        break;
      }
    }
  }
}

function htmlDesfecho(def, flag) {
  let status = "";
  if (flag.alteradoPor) status += `<p class="t20bd-resultado-alterado"><i class="fa-solid fa-user-shield"></i> Resultado alterado pelo mestre ${esc(flag.alteradoPor)}.</p>`;
  if (flag.manual && flag.aplicado) status += `<p class="t20bd-resultado-alterado"><i class="fa-solid fa-check"></i> Aplicado ao domínio por ${esc(flag.por)}.</p>`;
  else if (flag.manual && flag.desfeitoPor) status += `<p class="t20bd-resultado-alterado"><i class="fa-solid fa-rotate-left"></i> Desfeito por ${esc(flag.desfeitoPor)}.</p>`;
  return `<div data-t20bd-desfecho-acao>${def.texto(flag.dados, flag.sucesso)}${status}</div>`;
}

function conteudoAtualizado(conteudo, def, flag) {
  const div = document.createElement("div");
  div.innerHTML = conteudo;
  const res = div.querySelector("[data-t20bd-resultado-teste]");
  if (res && flag.sucesso !== null) {
    res.classList.remove("t20d-bom", "t20d-ruim");
    res.classList.add(flag.sucesso ? "t20d-bom" : "t20d-ruim");
    res.innerHTML = `<strong>${flag.sucesso ? "SUCESSO" : "FALHA"}</strong>`;
  }
  const alvo = div.querySelector("[data-t20bd-desfecho-acao]");
  if (alvo) alvo.outerHTML = htmlDesfecho(def, flag);
  return div.innerHTML;
}

/**
 * Cria o cartão de um desfecho. Ações aplicam o desfecho logo após o
 * cartão (os cartões de efeito, como Popularidade, aparecem depois dele).
 */
async function cartaoDesfecho(dominio, titulo, acao, dados, { t = null, manual = false, rolls = [] } = {}) {
  const def = DESFECHOS[acao];
  const flag = {
    acao, atorUuid: dominio.uuid, dados, sucesso: t ? t.sucesso : null, manual,
    aplicado: false, reg: [], por: null, desfeitoPor: null, alteradoPor: null
  };
  const corpo = (t ? htmlResultadoTeste(t) : "") + htmlDesfecho(def, flag);
  const mensagem = await cartao(dominio, titulo, corpo, {
    rolls: t ? [t.roll, ...rolls] : rolls, rollMode: t?.rollMode ?? null, flagsModulo: { desfecho: flag }
  });
  if (!manual) await operarCartao(mensagem, "aplicar", game.user.name);
  return mensagem;
}

/** aplicar | desfazer | inverter — executado por quem pode alterar a mensagem e o domínio. */
async function operarCartao(mensagem, op, nomeUsuario) {
  const atual = game.messages.get(mensagem.id) ?? mensagem;
  const flag = foundry.utils.deepClone(atual.getFlag(MODULO, "desfecho"));
  const def = DESFECHOS[flag?.acao];
  if (!def) return;
  const dominio = await fromUuid(flag.atorUuid).catch(() => null);
  if (!dominio) return ui.notifications.error("O domínio deste cartão não foi encontrado.");

  const aplicar = async () => {
    flag.reg = [];
    await def.aplicar(dominio, flag.sucesso, flag.dados, flag.reg);
    flag.aplicado = true;
    flag.por = nomeUsuario;
    flag.desfeitoPor = null;
  };
  const desfazer = async () => {
    await desfazerRegistro(dominio, flag.reg ?? []);
    flag.reg = [];
    flag.aplicado = false;
    flag.dados.nota = null;
  };

  if (op === "aplicar") {
    if (flag.aplicado) return;
    await aplicar();
  } else if (op === "desfazer") {
    if (!flag.aplicado) return;
    await desfazer();
    flag.por = null;
    flag.desfeitoPor = nomeUsuario;
  } else if (op === "inverter") {
    if (flag.sucesso === null) return;
    const estavaAplicado = flag.aplicado;
    if (estavaAplicado) await desfazer();
    flag.sucesso = !flag.sucesso;
    flag.alteradoPor = nomeUsuario;
    /* Ações reaplicam na hora; arrecadações só se já tinham sido aplicadas
     * e o novo resultado ainda tiver algo a aplicar. */
    if (!flag.manual || (estavaAplicado && def.rotulo?.(flag.dados, flag.sucesso))) await aplicar();
  } else return;

  await atual.update({ content: conteudoAtualizado(atual.content, def, flag), [`flags.${MODULO}.desfecho`]: flag });
}

/** Clique num botão do cartão: executa aqui ou pede ao mestre conectado. */
async function pedirOperacao(mensagem, op) {
  const dominio = fromUuidSync(mensagem.getFlag(MODULO, "desfecho")?.atorUuid);
  if (op === "inverter" && !game.user.isGM) return;
  if (mensagem.isOwner && dominio?.isOwner) return operarCartao(mensagem, op, game.user.name);
  const mestre = game.users.activeGM;
  if (!mestre) return ui.notifications.warn("É preciso um mestre conectado para aplicar este cartão.");
  game.socket.emit(CANAL, { acao: "cartaoDominio", destino: mestre.id, origem: game.user.id, mensagemId: mensagem.id, op });
}

export function registrarCartoesDominio() {
  game.socket.on(CANAL, async (msg) => {
    if (msg?.acao !== "cartaoDominio" || msg.destino !== game.user.id || !game.user.isGM) return;
    const mensagem = game.messages.get(msg.mensagemId);
    const usuario = game.users.get(msg.origem);
    const dominio = fromUuidSync(mensagem?.getFlag(MODULO, "desfecho")?.atorUuid);
    if (!mensagem || !usuario || !dominio?.testUserPermission(usuario, "OWNER") || msg.op === "inverter") return;
    await operarCartao(mensagem, msg.op, usuario.name);
  });
}

Hooks.on("renderChatMessageHTML", (mensagem, html) => {
  const flag = mensagem.getFlag(MODULO, "desfecho");
  const alvo = html.querySelector("[data-t20bd-desfecho-acao]");
  const def = DESFECHOS[flag?.acao];
  if (!def || !alvo || html.querySelector(".t20bd-controle-obra")) return;
  const dominio = fromUuidSync(flag.atorUuid);
  const botoes = [];
  if (flag.manual && (game.user.isGM || dominio?.isOwner)) {
    if (flag.aplicado) botoes.push(["desfazer", "fa-rotate-left", "Desfazer"]);
    else {
      const rotulo = def.rotulo?.(flag.dados, flag.sucesso);
      if (rotulo) botoes.push(["aplicar", "fa-check", rotulo]);
    }
  }
  if (flag.sucesso !== null && game.user.isGM)
    botoes.push(["inverter", "fa-arrow-right-arrow-left", `Alterar para ${flag.sucesso ? "FALHA" : "SUCESSO"}`]);
  if (!botoes.length) return;

  const controle = document.createElement("div");
  controle.className = "t20bd-controle-obra";
  for (const [op, icone, rotulo] of botoes) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.dataset.op = op;
    botao.innerHTML = `<i class="fa-solid ${icone}"></i> ${esc(rotulo)}`;
    botao.addEventListener("click", async () => {
      controle.querySelectorAll("button").forEach(b => b.disabled = true);
      try {
        await pedirOperacao(mensagem, op);
      } catch (erro) {
        console.error(`${MODULO} | Falha ao operar o cartão de domínio.`, erro);
        ui.notifications.error("Não foi possível alterar o cartão. Consulte o console.");
      } finally {
        controle.querySelectorAll("button").forEach(b => { if (b.isConnected) b.disabled = false; });
      }
    });
    controle.append(botao);
  }
  alvo.insertAdjacentElement("afterend", controle);
});
