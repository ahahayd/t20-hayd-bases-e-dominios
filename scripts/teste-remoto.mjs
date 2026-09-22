/**
 * t20-hayd-bases-e-dominios | teste-remoto.mjs
 * Testes de perícia rolados pelo jogador dono do personagem.
 *
 * Quando o mestre (ou outro usuário) dispara uma ação de Base, Negócio ou
 * Domínio e escolhe um personagem cujo jogador está conectado, o pedido de
 * teste vai para a tela desse jogador: ele confirma a perícia (a escolhida
 * pelo mestre vem selecionada), passa pela janela de uso normal do sistema
 * e a rolagem volta ao mestre, que continua a ação.
 *
 * Sem jogador conectado, quem disparou a ação rola como antes.
 */
import { MODULO } from "./bases/catalogo.mjs";
import { labelPericia } from "./bases/catalogo.mjs";

const { DialogV2 } = foundry.applications.api;
const CANAL = `module.${MODULO}`;
const TEMPO_LIMITE_MS = 5 * 60 * 1000;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Pedidos aguardando resposta de um jogador: id → { resolver, userId, timer, aviso }. */
const pendentes = new Map();

/**
 * Jogador conectado que deve rolar pelo ator, ou null quando o próprio
 * usuário atual já é dono do personagem (ou ninguém está conectado).
 */
export function jogadorResponsavel(ator) {
  if (!ator) return null;
  const donos = game.users.filter(u => !u.isGM && ator.testUserPermission(u, "OWNER"));
  if (donos.some(u => u.id === game.user.id)) return null;
  const ativos = donos.filter(u => u.active);
  return ativos.find(u => u.character?.id === ator.id) ?? ativos[0] ?? null;
}

/**
 * Pede o teste ao jogador. Resolve com:
 * - undefined: não há jogador para pedir — role localmente;
 * - null: o jogador recusou ou não respondeu a tempo;
 * - { roll, pericia, rollMode }: rolagem feita (roll pode ser null se o
 *   jogador cancelou a janela de uso depois de escolher a perícia).
 *
 * `modo`: "pericia" rola por actor.rollPericia (Bases/Negócios);
 * "partes" rola pelas partes pré-calculadas por perícia (Domínios).
 */
export async function pedirTeste(ator, { acao, local = "", pericia, cd = null, modo = "pericia", partesPorPericia = null, rotulo = "" }) {
  const jogador = jogadorResponsavel(ator);
  if (!jogador) return undefined;
  const id = foundry.utils.randomID();
  const aviso = ui.notifications.info(`Aguardando ${jogador.name} rolar o teste de ${ator.name}…`, { permanent: true });
  return new Promise((resolver) => {
    const timer = setTimeout(() => concluir(id, null, "O jogador não respondeu a tempo."), TEMPO_LIMITE_MS);
    pendentes.set(id, { resolver, userId: jogador.id, timer, aviso });
    game.socket.emit(CANAL, {
      acao: "pedirTeste", id, destino: jogador.id, origem: game.user.id,
      atorUuid: ator.uuid, textoAcao: acao, local, pericia, cd, modo, partesPorPericia, rotulo
    });
  });
}

function concluir(id, resultado, motivo = null) {
  const p = pendentes.get(id);
  if (!p) return;
  pendentes.delete(id);
  clearTimeout(p.timer);
  if (p.aviso) ui.notifications.remove?.(p.aviso);
  if (motivo) ui.notifications.warn(motivo);
  p.resolver(resultado);
}

/* ------------------------------------------------------------------ */
/* Lado do jogador                                                      */
/* ------------------------------------------------------------------ */

function opcoesPericias(ator, selecionada) {
  const chaves = Object.keys(ator.system.pericias ?? {});
  if (selecionada && !chaves.includes(selecionada)) chaves.push(selecionada);
  return chaves
    .map(k => ({ k, rotulo: labelPericia(k), valor: ator.system.pericias?.[k]?.value ?? 0 }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map(({ k, rotulo, valor }) => `<option value="${k}" ${k === selecionada ? "selected" : ""}>${esc(rotulo)} (${valor >= 0 ? "+" : ""}${valor})</option>`)
    .join("");
}

async function escolherPericia(ator, msg) {
  const onde = msg.local ? ` em <strong>${esc(msg.local)}</strong>` : "";
  const cd = msg.cd != null && msg.cd !== "" ? `<p class="notes">Dificuldade: CD ${esc(msg.cd)}</p>` : "";
  const content = `
    <div class="t20bd-teste-remoto">
      <header><img src="${esc(ator.img)}" alt=""><p><strong>${esc(ator.name)}</strong> vai ${esc(msg.textoAcao)}${onde}.</p></header>
      ${cd}
      <div class="form-group"><label>Perícia do teste</label>
        <select name="pericia">${opcoesPericias(ator, msg.pericia)}</select></div>
      <p class="notes">A perícia indicada pelo mestre já vem selecionada. Troque só se ele aprovar outra.</p>
    </div>`;
  return DialogV2.prompt({
    window: { title: `Teste: ${msg.rotulo || msg.textoAcao}`, icon: "fa-solid fa-dice-d20" },
    content,
    ok: { label: "Rolar", icon: "fa-solid fa-dice-d20", callback: (_ev, botao) => botao.form.elements.pericia.value },
    rejectClose: false
  });
}

/** Rola com partes pré-calculadas, passando pela janela de uso do sistema. */
async function rolarPorPartes(ator, pericia, partes, rotulo) {
  const api = game.tormenta20;
  const nome = labelPericia(pericia);
  if (!(api?.applications?.AbilityUseDialog && api?.dice?.d20Roll)) {
    const roll = new Roll(partes.join(" + ").replace(/\+ -/g, "- "));
    await roll.evaluate();
    return { roll, rollMode: game.settings.get("core", "rollMode") };
  }
  const per = ator.system.pericias?.[pericia];
  const itemData = {
    ...(per ?? {}), name: nome, label: nome, type: "pericia", parts: partes, id: pericia,
    actor: ator, system: { ativacao: { custo: 0 } }, isOwned: true
  };
  let rollMode = game.settings.get("core", "rollMode");
  let rConfig = {};
  if (game.settings.get("tormenta20", "UsageConfig") === "default") {
    const configuracao = await api.applications.AbilityUseDialog.create(itemData);
    if (!configuracao) return null;
    rConfig = configuracao;
    rollMode = configuracao.rollMode ?? rollMode;
  }
  const custoPM = itemData.system?.ativacao?.custo ?? 0;
  if (custoPM > 0 && game.settings.get("tormenta20", "automaticManaSpend")) await ator.spendMana(custoPM, 0, false);
  const roll = await api.dice.d20Roll(foundry.utils.mergeObject({
    parts: itemData.parts, actor: ator, event: {}, data: ator.getRollData(),
    title: rotulo || nome, flavor: rotulo || nome
  }, rConfig));
  return roll ? { roll, rollMode } : null;
}

async function atenderPedido(msg) {
  const ator = await fromUuid(msg.atorUuid);
  const responder = (dados) => game.socket.emit(CANAL, { acao: "respostaTeste", id: msg.id, destino: msg.origem, ...dados });
  if (!ator) return responder({ recusado: true });

  const pericia = await escolherPericia(ator, msg);
  if (!pericia) return responder({ recusado: true });

  let resultado = null;
  try {
    if (msg.modo === "partes") {
      const partes = msg.partesPorPericia?.[pericia]
        ?? ["1d20", `${ator.system.pericias?.[pericia]?.value ?? 0}[${labelPericia(pericia)}]`];
      resultado = await rolarPorPartes(ator, pericia, partes, msg.rotulo);
    } else if (typeof ator.rollPericia === "function" && ator.system.pericias?.[pericia]) {
      const roll = await ator.rollPericia(pericia, { message: false });
      resultado = roll ? { roll, rollMode: game.settings.get("core", "rollMode") } : null;
    }
  } catch (err) {
    console.warn(`${MODULO} | Falha ao rolar o teste pedido pelo mestre.`, err);
  }
  responder({ pericia, roll: resultado?.roll?.toJSON() ?? null, rollMode: resultado?.rollMode ?? null });
}

export function registrarTesteRemoto() {
  game.socket.on(CANAL, (msg) => {
    if (msg?.destino !== game.user.id) return;
    if (msg.acao === "pedirTeste") atenderPedido(msg);
    else if (msg.acao === "respostaTeste") {
      if (!pendentes.has(msg.id)) return;
      if (msg.recusado) return concluir(msg.id, null, "O jogador recusou o teste.");
      concluir(msg.id, {
        pericia: msg.pericia,
        roll: msg.roll ? Roll.fromData(msg.roll) : null,
        rollMode: msg.rollMode
      });
    }
  });
  /* Jogador desconectou no meio do pedido: não deixa a ação travada. */
  Hooks.on("userConnected", (user, conectado) => {
    if (conectado) return;
    for (const [id, p] of pendentes) if (p.userId === user.id) concluir(id, null, `${user.name} desconectou antes de rolar.`);
  });
}
