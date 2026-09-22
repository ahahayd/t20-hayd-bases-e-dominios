/**
 * tormenta20-bases | main.mjs
 * Ponto de entrada do módulo.
 */
import { MODULO } from "./catalogo.mjs";
import { registrarDataModel } from "./data.mjs";
import { registrarFicha } from "./sheet.mjs";
import * as Catalogo from "./catalogo.mjs";
import * as Acoes from "./acoes.mjs";
import { sincronizarEfeitos, removerEfeitos, montarEfeitosPara, obterMorador } from "./efeitos.mjs";
import { registrarSocket, registrarArraste } from "./transferencia.mjs";

Hooks.once("init", () => {
  console.debug(`${MODULO} | Inicializando.`);
  registrarDataModel();
  registrarFicha();
  registrarArraste();

  game.settings.register(MODULO, "basesSincronizarAuto", {
    name: "Bases: sincronizar efeitos automaticamente",
    hint: "Recria os Efeitos Ativos nos moradores sempre que a base é alterada (cômodos, mobílias, tipo, suítes).",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULO, "basesHistoricoMax", {
    name: "Bases: Caixa do Grupo — movimentações exibidas",
    hint: "Quantidade máxima de linhas do histórico do caixa carregadas na ficha da base. Valores menores deixam a ficha mais leve quando o histórico é grande.",
    scope: "world", config: true, type: Number, default: 25,
    range: { min: 5, max: 120, step: 5 }
  });
});

Hooks.once("i18nInit", () => {
  /* Garante o rótulo do tipo de ator mesmo quando o idioma do cliente
   * não carrega o lang/pt-BR.json (ex.: cliente em inglês). */
  const key = `TYPES.Actor.${MODULO}.base-hayd`;
  if (!game.i18n.has(key)) {
    foundry.utils.mergeObject(game.i18n.translations, {
      [key]: "Base (t20-hayd)"
    });
  }
});

Hooks.once("ready", async () => {
  registrarSocket();
  /* Migração: o Caixa do Grupo antigo (T$ avulsos em caixa.ts) agora é
   * representado pelas moedas da base — converte o saldo em T$/TC. */
  if (game.user === game.users.activeGM) {
    for (const ator of game.actors) {
      if (ator.type !== `${MODULO}.base-hayd`) continue;
      const dec = Math.round((ator.system.caixa?.ts ?? 0) * 10);
      if (dec > 0) {
        await ator.update({
          "system.caixa.ts": 0,
          "system.dinheiro.tp": (ator.system.dinheiro?.tp ?? 0) + Math.floor(dec / 10),
          "system.dinheiro.tc": (ator.system.dinheiro?.tc ?? 0) + dec % 10
        }, { t20bSemHistorico: true });
        console.log(`${MODULO} | Caixa antigo de "${ator.name}" migrado para as moedas da base (T$ ${dec / 10}).`);
      }
    }
  }

  const api = {
    catalogo: Catalogo,
    acoes: Acoes,
    sincronizarEfeitos, removerEfeitos, montarEfeitosPara, obterMorador
  };
  /* O módulo é compartilhado com o subsistema de Domínios: cada um escreve
   * em seu próprio namespace (api.bases / api.dominios) para não sobrescrever
   * a API um do outro. */
  const mod = game.modules.get(MODULO);
  if (mod) mod.api = Object.assign(mod.api ?? {}, { bases: api });
  globalThis.tormenta20Bases = api;
  console.debug(`${MODULO} | Bases pronto. API disponível em game.modules.get("${MODULO}").api.bases`);
});

/* Mantém os cartões de chat do módulo em sincronia com o tema Hayd:
 * a classe .tema-hayd (texto claro sobre o fundo escuro do t20-hayd-ui)
 * é aplicada na renderização, cobrindo também mensagens antigas criadas
 * antes de o tema ser ativado (e removida se o tema for desativado). */
Hooks.on("renderChatMessageHTML", (mensagem, html) => {
  const cartao = html.querySelector(".t20b-chat");
  if (cartao) cartao.classList.toggle("tema-hayd", Catalogo.temaHayd());
});

/* Edição manual das moedas (aba Inventário): registra a movimentação no
 * histórico do Caixa do Grupo, com o usuário que fez a alteração. Roda no
 * cliente que originou o update (preUpdate), então game.user é o autor.
 * Movimentações via movimentarCaixa já trazem o histórico no próprio
 * update e são ignoradas aqui. */
const TIPOS_COM_CAIXA = new Set([`${MODULO}.base-hayd`, `${MODULO}.negocio`]);

Hooks.on("preUpdateActor", (actor, changes, options) => {
  /* O Negócio usa o mesmo caixa (moedas + histórico) das Bases. */
  if (!TIPOS_COM_CAIXA.has(actor.type)) return;
  if (options?.t20bSemHistorico) return;
  const din = changes.system?.dinheiro;
  if (!din) return;
  if (changes.system?.caixa?.historico) return;

  const atual = actor.system.dinheiro ?? {};
  const novo = {
    tc: Number(din.tc ?? atual.tc ?? 0) || 0,
    tp: Number(din.tp ?? atual.tp ?? 0) || 0,
    to: Number(din.to ?? atual.to ?? 0) || 0,
    tl: Number(din.tl ?? atual.tl ?? 0) || 0
  };
  const deltaDec = Acoes.totalDecimos(novo) - Acoes.totalDecimos(atual);
  if (!deltaDec) return;

  const historico = [...(actor.system.caixa?.historico ?? [])];
  historico.push({
    aventura: actor.system.aventura?.numero ?? 0,
    data: new Date().toLocaleDateString("pt-BR"),
    usuario: game.user.name,
    desc: `Ajuste manual das moedas (${actor.type === `${MODULO}.negocio` ? "Estoque" : "Inventário"})`,
    delta: deltaDec / 10,
    saldo: Acoes.totalDecimos(novo) / 10
  });
  while (historico.length > 120) historico.shift();
  foundry.utils.setProperty(changes, "system.caixa.historico", historico);
});

/* Imagem padrão para novos atores de base. */
Hooks.on("preCreateActor", (actor, dados) => {
  if (actor.type !== `${MODULO}.base-hayd`) return;
  if (!dados.img || dados.img === "icons/svg/mystery-man.svg") {
    actor.updateSource({
      img: `modules/${MODULO}/assets/base.svg`,
      "prototypeToken.texture.src": `modules/${MODULO}/assets/base.svg`
    });
  }
});

/* Ao excluir a base, limpa os efeitos deixados nos moradores. */
Hooks.on("preDeleteActor", (actor) => {
  if (actor.type !== `${MODULO}.base-hayd`) return;
  removerEfeitos(actor).catch(err =>
    console.debug(`${MODULO} | Falha ao limpar efeitos na exclusão`, err));
});
