/**
 * t20-hayd-bases-e-dominios | bases/transferencia.mjs
 * Retirada de itens do inventário da base para os moradores.
 *
 * - Mestre: escolhe o morador de destino e a quantidade.
 * - Jogador: escolhe a quantidade (e o personagem, se tiver mais de um
 *   morador na base).
 * - Arrastar um item da base para a ficha de outro ator MOVE o item
 *   (retira da base), em vez de apenas copiá-lo.
 *
 * Jogadores normalmente não são donos da base, então a operação é pedida
 * ao mestre ativo via socket, que valida e executa.
 */
import { MODULO } from "./catalogo.mjs";
import { obterMorador } from "./efeitos.mjs";

const { DialogV2 } = foundry.applications.api;
const CANAL = `module.${MODULO}`;
const TIPO_BASE = `${MODULO}.base-hayd`;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Chave que marca, nos dados de arraste, um item vindo do inventário da base. */
export const CHAVE_ARRASTE = "t20bBaseItem";

/* ------------------------------------------------------------------ */
/* Execução (roda em quem tem permissão: o próprio usuário ou o mestre) */
/* ------------------------------------------------------------------ */

/** Moradores da base que o usuário pode receber como destino. */
async function destinosPermitidos(base, user) {
  const lista = [];
  for (const res of base.system.residentes ?? []) {
    const ator = await obterMorador(res.uuid);
    if (!ator || ator.type === TIPO_BASE) continue;
    if (user.isGM || ator.testUserPermission(user, "OWNER")) lista.push(ator);
  }
  return lista;
}

/**
 * Move `qtd` unidades de um item entre atores. Serve aos dois sentidos:
 * base → morador (retirada) e ator → base/negócio (guardar).
 */
async function executar({ itemUuid, destinoUuid, qtd, userId }) {
  const user = game.users.get(userId);
  const item = await fromUuid(itemUuid);
  const origem = item?.parent;
  const destino = await fromUuid(destinoUuid);
  if (!user || !(origem instanceof Actor) || !destino) throw new Error("Item, origem ou destino não encontrado.");
  if (destino.uuid === origem.uuid) throw new Error("O item já está nesta ficha.");

  if (!user.isGM) {
    if (origem.type === TIPO_BASE) {
      if (!destino.testUserPermission(user, "OWNER")) throw new Error("Você não é dono do personagem de destino.");
      const ehMorador = (origem.system.residentes ?? []).some(r => r.uuid === destino.uuid);
      if (!ehMorador) throw new Error(`${destino.name} não é morador desta base.`);
    } else {
      if (!origem.testUserPermission(user, "OWNER")) throw new Error("Você não é dono do ator de origem do item.");
      if (!destino.testUserPermission(user, "OBSERVER")) throw new Error(`Você não tem acesso a ${destino.name}.`);
    }
  }

  const disponivel = Number(item.system.qtd ?? 1);
  const n = Math.min(disponivel, Math.max(1, Math.round(Number(qtd) || 0)));
  if (!(n > 0)) throw new Error("Não há unidades disponíveis deste item.");

  /* Empilha em um item igual já existente no destino. */
  const igual = destino.items.find(i => i.type === item.type && i.name === item.name);
  if (igual) await igual.update({ "system.qtd": Number(igual.system.qtd ?? 1) + n });
  else {
    const dados = item.toObject();
    delete dados._id;
    foundry.utils.setProperty(dados, "system.qtd", n);
    await destino.createEmbeddedDocuments("Item", [dados]);
  }

  if (n >= disponivel) await item.delete();
  else await item.update({ "system.qtd": disponivel - n });

  return `${n}× ${item.name} → ${destino.name}`;
}

/** Faz a transferência localmente ou pede ao mestre ativo. */
async function solicitar(item, destino, qtd) {
  const pedido = { itemUuid: item.uuid, destinoUuid: destino.uuid, qtd, userId: game.user.id };
  if (item.parent.isOwner && destino.isOwner) {
    try {
      ui.notifications.info(`Inventário: ${await executar(pedido)}.`);
    } catch (err) { ui.notifications.warn(err.message); }
    return;
  }
  if (!game.users.activeGM) return ui.notifications.warn("É preciso um mestre conectado para mover este item.");
  game.socket.emit(CANAL, { acao: "transferirItem", ...pedido });
}

export function registrarSocket() {
  game.socket.on(CANAL, async (msg) => {
    if (msg?.acao === "transferirItem") {
      if (game.user !== game.users.activeGM) return;
      let resposta;
      try { resposta = { ok: true, texto: await executar(msg) }; }
      catch (err) { resposta = { ok: false, texto: err.message }; }
      game.socket.emit(CANAL, { acao: "transferenciaResultado", userId: msg.userId, ...resposta });
    } else if (msg?.acao === "transferenciaResultado" && msg.userId === game.user.id) {
      if (msg.ok) ui.notifications.info(`Inventário: ${msg.texto}.`);
      else ui.notifications.warn(msg.texto);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Diálogos                                                             */
/* ------------------------------------------------------------------ */

function campoQtd(max) {
  return `<div class="form-group"><label>Quantidade (máx. ${max})</label>
    <input type="number" name="qtd" value="1" min="1" max="${max}" step="1" autofocus></div>`;
}

/**
 * Pergunta destino e/ou quantidade. `destinos` com um único ator (ou
 * `destinoFixo`) dispensa a escolha do personagem.
 */
async function perguntar(item, destinos, { titulo, destinoFixo = null } = {}) {
  const max = Number(item.system.qtd ?? 1);
  const escolherDestino = !destinoFixo && destinos.length > 1;
  if (!escolherDestino && max <= 1) return { destino: destinoFixo ?? destinos[0], qtd: 1 };

  const opcoes = destinos.map(a => `<option value="${a.uuid}">${esc(a.name)}</option>`).join("");
  const content = `
    <div class="t20b-transferir">
      <p><img src="${esc(item.img)}" alt=""> <strong>${esc(item.name)}</strong></p>
      ${escolherDestino ? `<div class="form-group"><label>Para</label><select name="destino">${opcoes}</select></div>` : ""}
      ${max > 1 ? campoQtd(max) : ""}
    </div>`;
  const r = await DialogV2.prompt({
    window: { title: titulo, icon: "fa-solid fa-hand-holding" },
    content,
    ok: {
      label: "Confirmar", icon: "fa-solid fa-check",
      callback: (_ev, botao) => ({
        destino: botao.form.elements.destino?.value ?? null,
        qtd: botao.form.elements.qtd?.valueAsNumber ?? 1
      })
    },
    rejectClose: false
  });
  if (!r) return null;
  const destino = destinoFixo ?? (r.destino ? destinos.find(a => a.uuid === r.destino) : destinos[0]);
  return { destino, qtd: Math.min(max, Math.max(1, Math.round(r.qtd) || 1)) };
}

/** Botão "retirar" da linha do inventário. */
export async function retirarItem(base, itemId) {
  const item = base.items.get(itemId);
  if (!item) return;
  const destinos = await destinosPermitidos(base, game.user);
  if (!destinos.length) {
    return ui.notifications.warn(game.user.isGM
      ? "Esta base não tem moradores para receber o item."
      : "Você não tem nenhum personagem morando nesta base.");
  }
  const titulo = game.user.isGM ? "Entregar item a um morador" : "Pegar item da base";
  const r = await perguntar(item, destinos, { titulo });
  if (r?.destino) await solicitar(item, r.destino, r.qtd);
}

/**
 * Item arrastado de outro ator para a base (ou negócio): pergunta a
 * quantidade e MOVE as unidades, subtraindo-as do ator de origem.
 * Retorna false quando o item não vem de um ator (compêndio, barra
 * lateral) — aí a ficha segue o fluxo padrão de cópia.
 */
export async function guardarItem(recipiente, item) {
  const origem = item.parent;
  if (!(origem instanceof Actor) || origem.uuid === recipiente.uuid) return false;
  if (!game.user.isGM && !origem.isOwner) {
    ui.notifications.warn(`Você não é dono de ${origem.name}.`);
    return true;
  }
  const r = await perguntar(item, [recipiente], { titulo: `Guardar em ${recipiente.name}`, destinoFixo: recipiente });
  if (r) await solicitar(item, recipiente, r.qtd);
  return true;
}

/* ------------------------------------------------------------------ */
/* Arrastar para outras fichas                                          */
/* ------------------------------------------------------------------ */

/** Hook dropActorSheetData: item vindo da base é movido, não copiado. */
async function aoSoltarEmAtor(destino, dados) {
  const origem = dados[CHAVE_ARRASTE];
  const base = await fromUuid(origem.baseUuid);
  const item = base?.items?.get(origem.itemId);
  if (!item) return;
  if (!game.user.isGM) {
    const permitidos = await destinosPermitidos(base, game.user);
    if (!permitidos.some(a => a.uuid === destino.uuid))
      return ui.notifications.warn(`${destino.name} precisa ser um personagem seu que mora nesta base.`);
  }
  const r = await perguntar(item, [destino], { titulo: `Mover para ${destino.name}`, destinoFixo: destino });
  if (r) await solicitar(item, destino, r.qtd);
}

export function registrarArraste() {
  Hooks.on("dropActorSheetData", (destino, _sheet, dados) => {
    if (!dados?.[CHAVE_ARRASTE]) return;
    if (destino.uuid === dados[CHAVE_ARRASTE].baseUuid) return false; // soltou na própria base
    aoSoltarEmAtor(destino, dados);
    return false;
  });
}
