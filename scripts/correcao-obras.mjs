/**
 * Correção de resultados de obras pelo mestre.
 *
 * A mensagem guarda a entrada exata criada na ficha. Assim, alternar o
 * resultado remove ou recria somente aquela obra, inclusive para opções
 * repetíveis, sem cobrar novamente o custo ou consumir outra ação.
 */
import { MODULO } from "./bases/catalogo.mjs";
import { sincronizarEfeitos as sincronizarBases } from "./bases/efeitos.mjs";
import { sincronizarEfeitos as sincronizarDominios } from "./dominios/efeitos.mjs";
import { sincronizarEfeitos as sincronizarNegocios } from "./negocios/efeitos.mjs";

const TIPOS_ATOR = {
  base: { tipo: `${MODULO}.base-hayd`, rotulo: "uma Base válida" },
  dominio: { tipo: `${MODULO}.dominio`, rotulo: "um Domínio válido" },
  negocio: { tipo: `${MODULO}.negocio`, rotulo: "um Negócio válido" }
};

function escapar(valor) {
  return foundry.utils.escapeHTML(String(valor ?? ""));
}

/** HTML mutável do desfecho; o teste e a rolagem permanecem preservados. */
export function htmlDesfechoObra(obra, alteradoPor = "") {
  const nome = escapar(obra.nome);
  let conteudo;
  if (obra.tipo === "negocio") {
    if (obra.fundacao) {
      conteudo = obra.sucesso
        ? `<p class="t20b-bom"><strong>${nome}</strong> abre as portas como um negócio de nível 1!</p><p>Escolha o primeiro ativo na aba Ativos.</p>`
        : "<p>Não foi possível criar o negócio — o valor foi gasto.</p>";
    } else {
      conteudo = obra.sucesso
        ? `<p class="t20b-bom">O negócio chega ao <strong>${nome}</strong>!</p><p>Escolha o novo ativo na aba Ativos.</p>`
        : "<p>O negócio não cresce desta vez — o valor foi gasto.</p>";
    }
  } else if (obra.tipo === "base") {
    conteudo = obra.sucesso
      ? `<p class="t20b-bom"><strong>${nome}</strong> é construído na base!</p>${obra.configuravel ? "<p>Configure o cômodo pela engrenagem na aba Cômodos.</p>" : ""}`
      : "<p>A obra fracassa e o valor foi gasto.</p>";
  } else {
    conteudo = obra.sucesso
      ? `<p class="t20d-bom"><strong>${nome}</strong> é erguida no domínio!</p>${obra.configuravel ? "<p>Configure a escolha da construção na aba Construções (ícone de engrenagem).</p>" : ""}`
      : "<p>A obra desmorona antes de ficar pronta — o ouro foi perdido.</p>";
  }
  if (alteradoPor) {
    conteudo += `<p class="t20bd-resultado-alterado"><i class="fa-solid fa-user-shield"></i> Resultado alterado pelo mestre ${escapar(alteradoPor)}.</p>`;
  }
  return `<div data-t20bd-desfecho-obra data-sucesso="${obra.sucesso}">${conteudo}</div>`;
}

async function atualizarBase(base, obra, novoSucesso) {
  const comodos = [...base.system.comodos];
  const indice = comodos.findIndex(comodo => comodo.id === obra.entrada.id);
  let entrada = foundry.utils.deepClone(obra.entrada);
  let mobiliasDesvinculadas = [...(obra.mobiliasDesvinculadas ?? [])];
  const updates = {};

  if (novoSucesso) {
    if (indice < 0) comodos.push(entrada);
    updates["system.comodos"] = comodos;
    if (mobiliasDesvinculadas.length) {
      updates["system.mobilias"] = base.system.mobilias.map(mobilia =>
        mobiliasDesvinculadas.includes(mobilia.id) && !mobilia.comodoId
          ? { ...mobilia, comodoId: entrada.id }
          : mobilia
      );
    }
  } else {
    if (indice >= 0) entrada = foundry.utils.deepClone(comodos[indice]);
    mobiliasDesvinculadas = base.system.mobilias
      .filter(mobilia => mobilia.comodoId === entrada.id)
      .map(mobilia => mobilia.id);
    updates["system.comodos"] = comodos.filter(comodo => comodo.id !== entrada.id);
    if (mobiliasDesvinculadas.length) {
      updates["system.mobilias"] = base.system.mobilias.map(mobilia =>
        mobilia.comodoId === entrada.id ? { ...mobilia, comodoId: null } : mobilia
      );
    }
  }

  await base.update(updates);
  if (game.settings.get(MODULO, "basesSincronizarAuto")) {
    await sincronizarBases(base, { silencioso: true });
  }
  return { ...obra, entrada, mobiliasDesvinculadas, sucesso: novoSucesso };
}

async function atualizarDominio(dominio, obra, novoSucesso) {
  const construcoes = [...dominio.system.construcoes];
  const indice = construcoes.findIndex(construcao => construcao.id === obra.entrada.id);
  let entrada = foundry.utils.deepClone(obra.entrada);

  if (novoSucesso) {
    if (indice < 0) construcoes.push(entrada);
  } else if (indice >= 0) {
    entrada = foundry.utils.deepClone(construcoes[indice]);
    construcoes.splice(indice, 1);
  }

  await dominio.update({ "system.construcoes": construcoes });
  if (game.settings.get(MODULO, "dominiosSincronizarAuto")) {
    await sincronizarDominios(dominio, { silencioso: true });
  }
  return { ...obra, entrada, sucesso: novoSucesso };
}

async function atualizarNegocio(negocio, obra, novoSucesso) {
  const { nivelAnterior, nivelNovo } = obra.entrada;
  await negocio.update(
    { "system.nivel": novoSucesso ? nivelNovo : nivelAnterior },
    { t20nSemSync: true }
  );
  if (game.settings.get(MODULO, "negociosSincronizarAuto")) {
    await sincronizarNegocios(negocio, { silencioso: true });
  }
  return { ...obra, sucesso: novoSucesso };
}

async function alternarResultado(mensagem) {
  if (!game.user.isGM) return;
  const atual = game.messages.get(mensagem.id) ?? mensagem;
  const obra = atual.getFlag(MODULO, "obra");
  if (!obra?.atorUuid || !obra?.entrada?.id) return;
  const tipoAtor = TIPOS_ATOR[obra.tipo];
  if (!tipoAtor) return;

  const novoSucesso = !obra.sucesso;
  const ator = await fromUuid(obra.atorUuid).catch(() => null);
  if (!ator) return ui.notifications.error("A ficha vinculada a esta obra não foi encontrada.");
  if (ator.type !== tipoAtor.tipo) {
    return ui.notifications.error(`A ficha vinculada não é mais ${tipoAtor.rotulo}.`);
  }
  const temMobilias = obra.tipo === "base" && !novoSucesso
    && ator.system.mobilias.some(mobilia => mobilia.comodoId === obra.entrada.id);
  const confirmado = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Alterar resultado da obra" },
    content: `<p>Alterar o resultado de <strong>${escapar(obra.nome)}</strong> para <strong>${novoSucesso ? "SUCESSO" : "FALHA"}</strong>?</p><p class="notes">O custo e a ação permanecem gastos. ${obra.tipo === "negocio"
      ? `O negócio passará ao nível ${novoSucesso ? obra.entrada.nivelNovo : obra.entrada.nivelAnterior}${novoSucesso ? "" : "; ativos acima do limite deixam de funcionar"}.`
      : `A obra será ${novoSucesso ? "adicionada" : "removida"} da ficha.`}${temMobilias ? " As mobílias instaladas neste cômodo serão desvinculadas e restauradas caso o resultado volte a ser sucesso." : ""}</p>`
  });
  if (!confirmado) return;

  let obraAtualizada;
  if (obra.tipo === "base") obraAtualizada = await atualizarBase(ator, obra, novoSucesso);
  else if (obra.tipo === "negocio") obraAtualizada = await atualizarNegocio(ator, obra, novoSucesso);
  else obraAtualizada = await atualizarDominio(ator, obra, novoSucesso);

  const recipiente = document.createElement("div");
  recipiente.innerHTML = atual.content;
  const resultadoTeste = recipiente.querySelector("[data-t20bd-resultado-teste]");
  if (resultadoTeste) {
    resultadoTeste.classList.remove("t20b-bom", "t20b-ruim", "t20d-bom", "t20d-ruim");
    resultadoTeste.classList.add(
      obra.tipo !== "dominio"
        ? (novoSucesso ? "t20b-bom" : "t20b-ruim")
        : (novoSucesso ? "t20d-bom" : "t20d-ruim")
    );
    resultadoTeste.innerHTML = `<strong>${novoSucesso ? "SUCESSO" : "FALHA"}</strong>`;
  }
  const desfecho = recipiente.querySelector("[data-t20bd-desfecho-obra]");
  if (desfecho) desfecho.outerHTML = htmlDesfechoObra(obraAtualizada, game.user.name);

  await atual.update({
    content: recipiente.innerHTML,
    [`flags.${MODULO}.obra`]: obraAtualizada
  });
  ui.notifications.info(`Resultado da obra alterado para ${novoSucesso ? "sucesso" : "falha"}.`);
}

Hooks.on("renderChatMessageHTML", (mensagem, html) => {
  if (!game.user.isGM) return;
  const obra = mensagem.getFlag(MODULO, "obra");
  const desfecho = html.querySelector("[data-t20bd-desfecho-obra]");
  if (!obra || !desfecho || html.querySelector(".t20bd-controle-obra")) return;

  const controle = document.createElement("div");
  controle.className = "t20bd-controle-obra";
  const botao = document.createElement("button");
  botao.type = "button";
  botao.innerHTML = `<i class="fa-solid fa-arrow-right-arrow-left"></i> Alterar para ${obra.sucesso ? "FALHA" : "SUCESSO"}`;
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    try {
      await alternarResultado(mensagem);
    } catch (erro) {
      console.error(`${MODULO} | Falha ao alterar resultado da obra.`, erro);
      ui.notifications.error("Não foi possível alterar o resultado da obra. Consulte o console.");
    } finally {
      if (botao.isConnected) botao.disabled = false;
    }
  });
  controle.append(botao);
  desfecho.insertAdjacentElement("afterend", controle);
});
