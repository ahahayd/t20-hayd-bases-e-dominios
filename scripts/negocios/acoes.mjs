/**
 * t20-hayd-bases-e-dominios | negocios/acoes.mjs
 * Ações de negócios (Tormenta20: Fim dos Tempos, pp. 309–312): criar o
 * negócio, aumentar o nível, escolher ativos, rendimentos, Cassino,
 * Mercado Multinivelado e o início de cada aventura (ou mês).
 *
 * Caixa, cartões de chat e testes reaproveitam as rotinas das Bases.
 */
import {
  MODULO, NIVEL_MAXIMO, PERICIAS_NEGOCIO, OPCOES_SOCIAL,
  obterAtivos, labelPericia, rotuloEscolha
} from "./catalogo.mjs";
import { sincronizarEfeitos, obterFrequentador } from "./efeitos.mjs";
import {
  fmtTS, cartao, movimentarCaixa, saldoCaixaDecimos, pagarCusto,
  executarTeste, htmlTeste, somarNaCarteira, resumoTeste
} from "../bases/acoes.mjs";
import { htmlDesfechoObra } from "../correcao-obras.mjs";

export { fmtTS, movimentarCaixa, saldoCaixaDecimos };

const { DialogV2 } = foundry.applications.api;
const FormData = () => foundry.applications.ux.FormDataExtended;
const escapar = valor => foundry.utils.escapeHTML(String(valor ?? ""));

function sincronizarAuto(negocio) {
  if (!game.settings.get(MODULO, "negociosSincronizarAuto")) return null;
  return sincronizarEfeitos(negocio, { silencioso: true });
}

async function rolar(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll;
}

/* ================================================================== */
/* Testes de Ofício ou Nobreza                                        */
/* ================================================================== */

function opcoesFrequentadores(negocio, selecionado = null) {
  const lista = [...negocio.system.frequentadores]
    .sort((a, b) => Number(!!b.dono) - Number(!!a.dono));
  return lista
    .map(r => `<option value="${r.uuid}" ${r.uuid === selecionado ? "selected" : ""}>${escapar(r.nome ?? r.uuid)}${r.dono ? " (dono)" : ""}</option>`)
    .join("");
}

function opcoesPericiaNegocio() {
  return PERICIAS_NEGOCIO
    .map(k => `<option value="${k}">${labelPericia(k)}</option>`)
    .join("");
}

/** Diálogo de teste: frequentador, Ofício ou Nobreza, CD, ajuda e custo. */
export async function dialogoTeste(negocio, { titulo, descricao, efeito, custoTexto, falha, cd, custo = 0, extra = "" }) {
  if (!negocio.system.frequentadores.length) {
    ui.notifications.warn("Adicione ao menos um frequentador ao negócio (arraste o ator do dono para a ficha).");
    return null;
  }
  const conteudo = `
    <div class="t20b-dialogo-teste">
      ${resumoTeste({ descricao, efeito, custo: custoTexto, falha })}
      <div class="t20b-dialogo-campos">
        <div class="form-group"><label>Quem realiza</label>
          <select name="uuid">${opcoesFrequentadores(negocio)}</select></div>
        <div class="form-group"><label>Perícia</label>
          <select name="pericia">${opcoesPericiaNegocio()}</select></div>
        <div class="form-group"><label>CD</label>
          <input type="number" name="cd" value="${cd}"></div>
      </div>
      ${custo > 0 ? `<label class="t20b-inline t20b-dialogo-check">
        <input type="checkbox" name="doCaixa" checked> Descontar ${fmtTS(custo)} do caixa do negócio</label>` : ""}
      ${extra}
      <p class="notes">Ao rolar, abre a janela de rolagem do personagem — aplique lá os efeitos ativos e outros ajustes da ficha.</p>
    </div>`;
  return DialogV2.prompt({
    window: { title: titulo },
    position: { width: 480 },
    content: conteudo,
    ok: { label: "Rolar", callback: (ev, btn) => new (FormData())(btn.form).object }
  }).catch(() => null);
}

/* ================================================================== */
/* Criar o negócio e aumentar o nível                                 */
/* ================================================================== */

/**
 * Fundação (nível 0 → 1) e aumento de nível usam o mesmo fluxo: um mês de
 * trabalho, o custo e um teste de Ofício ou Nobreza. Em caso de falha, o
 * dinheiro é gasto e é possível tentar de novo.
 */
export async function acaoAumentarNivel(negocio) {
  const s = negocio.system;
  const prox = s.proximoNivel;
  if (!prox) return ui.notifications.warn(`O negócio já está no nível máximo (${NIVEL_MAXIMO}).`);
  const fundando = !s.fundado;

  const ajustes = [];
  if (!fundando && s.temBeneficio("estudio")) ajustes.push("Estúdio: CD –5");
  if (!fundando && s.temBeneficio("escritorio")) ajustes.push("Escritório: custo pela metade");

  const titulo = fundando ? "Criar o Negócio" : `Aumentar para o Nível ${prox.nivel}`;
  const efeito = fundando
    ? "Procurar um lugar, conseguir os alvarás, contratar empregados e comprar mercadorias: o negócio abre no nível 1."
    : `<strong>${escapar(negocio.name)}</strong> sobe do nível ${s.nivel} para o <strong>${prox.nivel}</strong> e ganha um novo ativo.`;
  const custoTexto = fundando
    ? `<strong>${fmtTS(prox.custo)}</strong> · CD ${prox.cd} · 1 mês de trabalho.`
    : `<strong>${fmtTS(prox.custo)}</strong> · CD ${prox.cd} (20 + 2 × próximo nível${s.temBeneficio("estudio") ? " – 5" : ""}) · 1 mês de trabalho.${ajustes.length ? `<br><span class="notes">${ajustes.join(" · ")}</span>` : ""}`;
  const falha = fundando
    ? `O negócio não é criado e o valor é gasto. Dá para tentar de novo com mais um mês e ${fmtTS(prox.custo)}.`
    : "O valor é gasto e o negócio continua no mesmo nível.";

  const dados = await dialogoTeste(negocio, { titulo, efeito, custoTexto, falha, cd: prox.cd, custo: prox.custo });
  if (!dados) return;
  if (!(await pagarCusto(negocio, prox.custo, fundando ? "Criação do negócio" : `Nível ${prox.nivel} do negócio`, dados.doCaixa))) return;

  const t = await executarTeste(negocio, dados, { rotulo: titulo });
  if (!t) return;

  const obra = {
    tipo: "negocio", atorUuid: negocio.uuid,
    nome: fundando ? negocio.name : `Nível ${prox.nivel}`,
    fundacao: fundando, sucesso: t.sucesso,
    entrada: { id: foundry.utils.randomID(), nivelAnterior: s.nivel, nivelNovo: prox.nivel }
  };
  if (t.sucesso) {
    await negocio.update({ "system.nivel": prox.nivel }, { t20nSemSync: true });
    await sincronizarAuto(negocio);
  }
  const corpo = htmlTeste(t, dados.pericia) + htmlDesfechoObra(obra);
  await cartao(negocio, fundando ? "Ação: Criar Negócio" : "Ação: Aumentar Nível", corpo, {
    rolls: [t.roll], flagsModulo: { obra }
  });
  return t.sucesso;
}

/* ================================================================== */
/* Ativos                                                             */
/* ================================================================== */

/** Valida um novo ativo. Retorna string de erro ou null. */
export function validarAtivo(negocio, key, { ignorarLimite = false } = {}) {
  const s = negocio.system;
  const cat = obterAtivos(negocio);
  const def = cat[key];
  if (!def) return "Ativo desconhecido.";
  if (!s.fundado) return "Crie o negócio antes de escolher ativos.";
  if (!ignorarLimite && s.qtdAtivos >= s.maxAtivos)
    return `Limite de ativos atingido (${s.maxAtivos} — um por nível).`;
  if (s.possuiAtivo(key)) return "O negócio já possui este ativo.";
  return validarPrerequisitos(negocio, def);
}

function validarPrerequisitos(negocio, def) {
  const s = negocio.system;
  const cat = obterAtivos(negocio);
  if (def.prereqNivel && s.nivel < def.prereqNivel) return `Requer negócio de nível ${def.prereqNivel}.`;
  for (const p of def.prereqAtivos ?? []) {
    if (!s.possuiAtivo(p)) return `Requer: ${cat[p]?.nome ?? p}.`;
  }
  return null;
}

/** Ativos que a Espionagem Industrial pode fornecer. */
export function alvosEspionagem(negocio) {
  const cat = obterAtivos(negocio);
  return Object.entries(cat)
    .filter(([k, d]) => d.escolha !== "ativo" && !negocio.system.possuiAtivo(k) && !validarPrerequisitos(negocio, d))
    .map(([k, d]) => ({ key: k, nome: d.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Campos do diálogo de escolha de um ativo (sem o <form>). */
function camposEscolha(def, atual = {}, prefixo = "") {
  const nome = `${prefixo}escolha`;
  if (def.escolha === "social") {
    const opcoes = OPCOES_SOCIAL
      .map(k => `<option value="${k}" ${atual.escolha === k ? "selected" : ""}>${labelPericia(k)}</option>`)
      .join("");
    return `<div class="form-group"><label>Perícia</label><select name="${nome}">${opcoes}</select></div>`;
  }
  if (def.escolha === "arma" || def.escolha === "texto") {
    const placeholder = def.escolha === "arma" ? "Espada longa" : "";
    return `<div class="form-group"><label>${escapar(def.rotuloEscolha ?? "Escolha")}</label>
      <input type="text" name="${nome}" value="${escapar(atual.escolha ?? "")}" placeholder="${placeholder}">
      ${def.escolha === "arma" ? `<p class="notes">Use o nome exato da arma na ficha para que o efeito de uso apareça na janela de rolagem.</p>` : ""}</div>`;
  }
  return "";
}

/**
 * Configura a escolha de um ativo (perícia, arma, texto ou ativo
 * espionado). Retorna { escolha, escolhaSub } ou null se cancelado.
 */
export async function dialogoEscolha(negocio, def, atual = {}) {
  if (!def.escolha) return {};
  const cat = obterAtivos(negocio);
  let conteudo = `<p>${def.beneficio}.</p>`;

  if (def.escolha === "ativo") {
    const alvos = alvosEspionagem(negocio);
    if (!alvos.length) {
      ui.notifications.warn("Não há ativos disponíveis para espionar (todos já foram construídos ou faltam pré-requisitos).");
      return null;
    }
    const opcoes = alvos
      .map(a => `<option value="${a.key}" ${atual.escolha === a.key ? "selected" : ""}>${escapar(a.nome)}</option>`)
      .join("");
    const subs = alvos
      .filter(a => cat[a.key]?.escolha)
      .map(a => `<div class="t20n-sub" data-para="${a.key}">${camposEscolha(cat[a.key],
        atual.escolha === a.key ? { escolha: atual.escolhaSub } : {}, `sub-${a.key}-`)}</div>`)
      .join("");
    conteudo += `<div class="form-group"><label>Ativo espionado</label><select name="escolha">${opcoes}</select></div>${subs}`;
  } else {
    conteudo += camposEscolha(def, atual);
  }

  const dados = await DialogV2.prompt({
    window: { title: def.nome },
    position: { width: 480 },
    content: conteudo,
    render: (_ev, dialog) => {
      const seletor = dialog.element.querySelector('select[name="escolha"]');
      const blocos = dialog.element.querySelectorAll(".t20n-sub");
      if (!seletor || !blocos.length) return;
      const atualizar = () => blocos.forEach(b => { b.hidden = b.dataset.para !== seletor.value; });
      seletor.addEventListener("change", atualizar);
      atualizar();
    },
    ok: { label: "Salvar", callback: (ev, btn) => new (FormData())(btn.form).object }
  }).catch(() => null);
  if (!dados) return null;

  const escolha = typeof dados.escolha === "string" ? dados.escolha.trim() : dados.escolha;
  if (def.escolha === "ativo") {
    return { escolha, escolhaSub: String(dados[`sub-${escolha}-escolha`] ?? "").trim() || null };
  }
  return { escolha: escolha || null };
}

export async function acaoAdicionarAtivo(negocio, key) {
  const def = obterAtivos(negocio)[key];
  const erro = validarAtivo(negocio, key);
  if (erro) return ui.notifications.error(erro);

  const escolha = await dialogoEscolha(negocio, def);
  if (escolha === null) return;

  const entrada = {
    id: foundry.utils.randomID(), key, ativo: true,
    escolha: escolha.escolha ?? null, escolhaSub: escolha.escolhaSub ?? null
  };
  await negocio.update({ "system.ativos": [...negocio.system.ativos, entrada] });
  const rot = rotuloEscolha(def, entrada, obterAtivos(negocio));
  await cartao(negocio, "Novo Ativo",
    `<p><strong>${escapar(def.nome)}</strong>${rot ? ` (${escapar(rot)})` : ""} passa a fazer parte do negócio.</p><p>${def.beneficio}.</p>`);
  await sincronizarAuto(negocio);
}

/* ================================================================== */
/* Rendimentos                                                        */
/* ================================================================== */

const DESTINOS = {
  caixa: "Caixa do negócio",
  dono: "Carteira do dono",
  manual: "Entregue manualmente"
};

function donoDoNegocio(negocio) {
  return negocio.system.frequentadores.find(f => f.dono) ?? null;
}

/** Credita um valor (em T$) no destino escolhido. Retorna o texto do destino. */
async function creditar(negocio, valor, desc, destino) {
  if (valor <= 0) return "";
  if (destino === "caixa") {
    await movimentarCaixa(negocio, desc, valor);
    return "depositados no caixa do negócio";
  }
  if (destino === "dono") {
    const dono = donoDoNegocio(negocio);
    const ator = dono ? await obterFrequentador(dono.uuid) : null;
    if (ator?.system?.dinheiro) {
      const nova = somarNaCarteira(ator.system.dinheiro, Math.round(valor * 10));
      await ator.update({ "system.dinheiro": nova });
      return `entregues a ${escapar(ator.name)}`;
    }
    ui.notifications.warn("O negócio não tem um dono com ficha — o valor foi depositado no caixa.");
    await movimentarCaixa(negocio, desc, valor);
    return "depositados no caixa do negócio (sem dono definido)";
  }
  return "entregues manualmente";
}

function opcoesDestino(negocio) {
  const temDono = !!donoDoNegocio(negocio);
  return Object.entries(DESTINOS)
    .map(([k, v]) => `<option value="${k}" ${k === (temDono ? "dono" : "caixa") ? "selected" : ""}>${v}</option>`)
    .join("");
}

/**
 * Rendimento do período: T$ 100 × nível (o Empório soma outro tanto).
 * Quem dedicou o mês inteiro ao negócio pode trocar o valor básico pelo
 * resultado do teste de Ofício ou Nobreza × 10 × nível.
 */
export async function acaoRendimentos(negocio) {
  const s = negocio.system;
  if (!s.fundado) return ui.notifications.warn("O negócio ainda não foi criado.");
  if (s.aventura.rendimentoColetado) {
    const ok = await DialogV2.confirm({
      window: { title: "Rendimentos" },
      content: "<p>Os rendimentos deste mês/aventura já foram coletados. Coletar novamente?</p>"
    });
    if (!ok) return;
  }
  const emporio = s.temBeneficio("emporio");
  const temFreq = s.frequentadores.length > 0;

  const dados = await DialogV2.prompt({
    window: { title: "Rendimentos do Negócio" },
    position: { width: 480 },
    content: `<p>Rendimento básico: <strong>${fmtTS(100 * s.nivel)}</strong> (T$ 100 × nível ${s.nivel})${emporio ? ` + Empório <strong>${fmtTS(100 * s.nivel)}</strong>` : ""}.</p>
      ${temFreq ? `<div class="form-group"><label class="t20b-inline"><input type="checkbox" name="dedicado"> Um personagem dedicou o mês inteiro ao negócio (teste de Ofício ou Nobreza)</label>
        <p class="notes">O rendimento passa a ser o resultado do teste × 10 × nível${emporio ? " (o Empório também usa o resultado)" : ""}.</p></div>
      <div class="form-group"><label>Quem se dedicou</label><select name="uuid">${opcoesFrequentadores(negocio, donoDoNegocio(negocio)?.uuid)}</select></div>
      <div class="form-group"><label>Perícia</label><select name="pericia">${opcoesPericiaNegocio()}</select></div>` : ""}
      <div class="form-group"><label>Destino do dinheiro</label><select name="destino">${opcoesDestino(negocio)}</select></div>`,
    ok: { label: "Coletar", callback: (ev, btn) => new (FormData())(btn.form).object }
  }).catch(() => null);
  if (!dados) return;

  let corpo = "";
  let rolls = [];
  let total;
  if (dados.dedicado && dados.uuid) {
    const t = await executarTeste(negocio, { ...dados, cd: 0, bonus: 0 }, { rotulo: "Rendimentos" });
    if (!t) return;
    rolls = [t.roll];
    const porTeste = Math.max(0, t.total) * 10 * s.nivel;
    total = porTeste * (emporio ? 2 : 1);
    corpo += `<p>Teste de <strong>${labelPericia(dados.pericia)}</strong> (${escapar(t.morador.name)}): <strong>${t.total}</strong></p>
      <p>${t.total} × 10 × nível ${s.nivel} = <strong>${fmtTS(porTeste)}</strong>${emporio ? ` · Empório: +${fmtTS(porTeste)}` : ""}</p>`;
  } else {
    total = s.rendimentoBase;
    corpo += `<p>Rendimento básico: ${fmtTS(100 * s.nivel)}${emporio ? ` + Empório ${fmtTS(100 * s.nivel)}` : ""}.</p>`;
  }

  const onde = await creditar(negocio, total, `Rendimentos (aventura ${s.aventura.numero})`, dados.destino);
  corpo += `<p class="t20b-bom">O negócio rende <strong>${fmtTS(total)}</strong>${onde ? `, ${onde}` : ""}.</p>`;
  await negocio.update({ "system.aventura.rendimentoColetado": true });
  await cartao(negocio, "Rendimentos do Negócio", corpo, { rolls });
}

/* ================================================================== */
/* Cassino                                                            */
/* ================================================================== */

export async function acaoCassino(negocio) {
  const s = negocio.system;
  if (!s.temBeneficio("cassino")) return ui.notifications.warn("O negócio não possui um Cassino ativo.");
  if (s.aventura.cassinoUsado) {
    const ok = await DialogV2.confirm({
      window: { title: "Cassino" },
      content: "<p>A aposta deste mês/aventura já foi feita. Apostar novamente mesmo assim?</p>"
    });
    if (!ok) return;
  }
  const premioTO = 10 * s.nivel * s.nivel;
  const perdaTO = premioTO / 2;
  const dados = await DialogV2.prompt({
    window: { title: "Cassino — Aposta" },
    content: `<p>Role um dado: com resultado <strong>par</strong>, recebe <strong>TO ${premioTO}</strong> (${fmtTS(premioTO * 10)}); com resultado <strong>ímpar</strong>, perde <strong>TO ${perdaTO}</strong> (${fmtTS(perdaTO * 10)}).</p>
      ${s.cassino.divida ? `<p class="t20b-ruim">Dívida pendente: <strong>${fmtTS(s.cassino.divida)}</strong> — será abatida de um eventual prêmio.</p>` : ""}
      <div class="form-group"><label>Movimentar</label><select name="destino">
        <option value="caixa" selected>Caixa do negócio</option>
        <option value="manual">Manualmente (fora do caixa)</option>
      </select></div>`,
    ok: { label: "Rolar", callback: (ev, btn) => new (FormData())(btn.form).object }
  }).catch(() => null);
  if (!dados) return;

  const roll = await rolar("1d6");
  const par = roll.total % 2 === 0;
  let divida = s.cassino.divida ?? 0;
  let corpo = `<p>Resultado: <strong>${roll.total}</strong> — ${par ? '<span class="t20b-bom"><strong>PAR</strong></span>' : '<span class="t20b-ruim"><strong>ÍMPAR</strong></span>'}</p>`;

  if (par) {
    let premio = premioTO * 10;
    const abatido = Math.min(divida, premio);
    divida -= abatido;
    premio -= abatido;
    if (abatido) corpo += `<p>${fmtTS(abatido)} do prêmio quitam a dívida com a casa.</p>`;
    if (premio > 0) {
      if (dados.destino === "caixa") await movimentarCaixa(negocio, "Cassino (prêmio)", premio);
      corpo += `<p class="t20b-bom">A casa paga <strong>${fmtTS(premio)}</strong>${dados.destino === "caixa" ? " ao caixa" : ""}.</p>`;
    }
  } else {
    const perda = perdaTO * 10;
    let pago = 0;
    if (dados.destino === "caixa") {
      pago = Math.min(perda, saldoCaixaDecimos(negocio) / 10);
      pago = Math.floor(pago * 10) / 10;
      if (pago > 0) await movimentarCaixa(negocio, "Cassino (perda)", -pago);
    } else {
      pago = perda;
    }
    const falta = Math.round((perda - pago) * 10) / 10;
    divida += falta;
    corpo += `<p class="t20b-ruim">Perde <strong>${fmtTS(perda)}</strong>${dados.destino === "caixa" ? ` (${fmtTS(pago)} pagos pelo caixa)` : ""}.</p>`;
    if (falta > 0) corpo += `<p class="t20b-ruim">Sem fundos: <strong>${fmtTS(falta)}</strong> ficam devendo para a próxima aposta.</p>`;
  }
  if (divida > 0) corpo += `<p class="notes">Dívida total com a casa: ${fmtTS(divida)}.</p>`;

  await negocio.update({
    "system.cassino.divida": Math.round(divida * 10) / 10,
    "system.aventura.cassinoUsado": true
  });
  await cartao(negocio, "Cassino", corpo, { rolls: [roll] });
}

/* ================================================================== */
/* Mercado Multinivelado                                              */
/* ================================================================== */

export async function acaoMercado(negocio) {
  const s = negocio.system;
  if (!s.temBeneficio("mercado-multinivelado")) return ui.notifications.warn("O negócio não possui um Mercado Multinivelado ativo.");
  if (s.aventura.mercadoUsado) {
    const ok = await DialogV2.confirm({
      window: { title: "Mercado Multinivelado" },
      content: "<p>A comissão deste mês/aventura já foi recebida. Registrar novos associados mesmo assim?</p>"
    });
    if (!ok) return;
  }
  const atuais = s.mercado.recrutados.length;
  const dados = await DialogV2.prompt({
    window: { title: "Mercado Multinivelado" },
    position: { width: 480 },
    content: `<p>Registre os NPCs com nome recrutados neste mês/aventura (um por linha). Cada período com ao menos um recrutamento rende <strong>nível × T$ 100 × associados</strong> (multiplicador máximo ${s.nivel}).</p>
      <p class="notes">Associados até agora: ${atuais}.</p>
      <div class="form-group"><label>Novos associados</label><textarea name="nomes" rows="4" placeholder="Nome do NPC"></textarea></div>
      <div class="form-group"><label>Destino do dinheiro</label><select name="destino">${opcoesDestino(negocio)}</select></div>`,
    ok: { label: "Registrar", callback: (ev, btn) => new (FormData())(btn.form).object }
  }).catch(() => null);
  if (!dados) return;

  const nomes = String(dados.nomes ?? "").split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  if (!nomes.length) return ui.notifications.warn("Nenhum associado informado — sem recrutamento, não há comissão.");

  const recrutados = [...s.mercado.recrutados, ...nomes.map(nome => ({ nome, aventura: s.aventura.numero }))];
  const multiplicador = Math.min(recrutados.length, s.nivel);
  const valor = s.nivel * 100 * multiplicador;
  await negocio.update({
    "system.mercado.recrutados": recrutados,
    "system.aventura.mercadoUsado": true
  });
  const onde = await creditar(negocio, valor, `Mercado Multinivelado (${nomes.length} associado(s))`, dados.destino);
  await cartao(negocio, "Mercado Multinivelado",
    `<p>Novos associados: <strong>${nomes.map(escapar).join(", ")}</strong>.</p>
     <p>Total de associados: ${recrutados.length} · multiplicador ×${multiplicador}.</p>
     <p class="t20b-bom">Comissão: <strong>${fmtTS(valor)}</strong>${onde ? `, ${onde}` : ""}.</p>`);
}

/* ================================================================== */
/* Início de aventura (ou mês)                                        */
/* ================================================================== */

export function lembretes(negocio) {
  const s = negocio.system;
  const cat = obterAtivos(negocio);
  const lista = [];
  for (const entrada of s.ativos) {
    if (entrada.ativo === false || s.ativosExcedentes.has(entrada.id)) continue;
    const def = cat[entrada.key];
    if (def?.porAventura) lista.push({ origem: def.nome, texto: def.porAventura.replace(/^[^:]+:\s*/, "") });
    if (def?.escolha === "ativo") {
      const alvo = cat[entrada.escolha];
      if (alvo?.porAventura && !s.possuiAtivo(entrada.escolha))
        lista.push({ origem: `${alvo.nome} (Espionagem)`, texto: alvo.porAventura.replace(/^[^:]+:\s*/, "") });
    }
  }
  return lista;
}

export async function novoPeriodo(negocio) {
  const s = negocio.system;
  const numero = s.aventura.numero + 1;
  const escolha = await DialogV2.wait({
    window: { title: "Novo Mês/Aventura" },
    content: `<p>Iniciar o período <strong>${numero}</strong> de <strong>${escapar(negocio.name)}</strong>?</p>
      <p class="notes">Os usos por período (rendimentos, Cassino, Mercado Multinivelado e troca da Espionagem Industrial) são renovados.</p>`,
    buttons: [
      { action: "coletar", label: "Iniciar e coletar rendimentos", icon: "fa-solid fa-sack-dollar", default: true },
      { action: "iniciar", label: "Só iniciar", icon: "fa-solid fa-flag-checkered" },
      { action: "cancelar", label: "Cancelar" }
    ]
  }).catch(() => null);
  if (!escolha || escolha === "cancelar") return;

  await negocio.update({
    "system.aventura": {
      numero, rendimentoColetado: false, cassinoUsado: false,
      mercadoUsado: false, espionagemTrocada: false
    }
  });

  const itens = lembretes(negocio);
  let corpo = s.fundado
    ? `<p>Rendimento previsto: <strong>${fmtTS(s.rendimentoBase)}</strong>.</p>`
    : "<p>O negócio ainda não foi criado.</p>";
  if (itens.length) {
    corpo += `<p><strong>Escolhas deste período:</strong></p><ul class="t20b-lista">${itens.map(l => `<li><strong>${escapar(l.origem)}:</strong> ${l.texto}</li>`).join("")}</ul>`;
  }
  const excedentes = s.ativosExcedentes.size;
  if (excedentes) corpo += `<p class="t20b-ruim">${excedentes} ativo(s) acima do limite do nível não fornecem benefícios.</p>`;
  corpo += `<p class="notes">Frequentadores longe do negócio perdem os bônus após 30 dias (ou uma aventura inteira) — desligue-os na aba Frequentadores.</p>`;
  await cartao(negocio, `Início do Período ${numero}`, corpo);

  if (escolha === "coletar" && s.fundado) await acaoRendimentos(negocio);
}

/** Troca o ativo espionado (uma vez por período). */
export async function acaoTrocarEspionagem(negocio, idAtivo) {
  const s = negocio.system;
  const entrada = s.ativos.find(a => a.id === idAtivo);
  const def = obterAtivos(negocio)[entrada?.key];
  if (!entrada || !def) return;
  if (entrada.escolha && s.aventura.espionagemTrocada) {
    const ok = await DialogV2.confirm({
      window: { title: def.nome },
      content: "<p>O ativo espionado já foi trocado neste mês/aventura. Trocar novamente mesmo assim?</p>"
    });
    if (!ok) return;
  }
  const escolha = await dialogoEscolha(negocio, def, entrada);
  if (!escolha) return;
  const mudou = escolha.escolha !== entrada.escolha;
  const ativos = s.ativos.map(a => a.id === idAtivo ? { ...a, ...escolha } : a);
  const updates = { "system.ativos": ativos };
  if (mudou && entrada.escolha) updates["system.aventura.espionagemTrocada"] = true;
  await negocio.update(updates);
  await sincronizarAuto(negocio);
}
