/**
 * t20-hayd-dominios | main.mjs
 * Ponto de entrada: registra DataModel, ficha, configurações e API.
 */
import { MODULO } from "./catalogo.mjs";
import * as catalogo from "./catalogo.mjs";
import { registrarDataModel } from "./data.mjs";
import { registrarFicha } from "./sheet.mjs";
import * as Acoes from "./acoes.mjs";
import { sincronizarEfeitos, removerEfeitos, obterRegente } from "./efeitos.mjs";
import { criarTabelas } from "./tabelas.mjs";

Hooks.once("init", () => {
  console.debug(`${MODULO} | Inicializando módulo de Domínios (Heróis de Arton).`);

  registrarDataModel();
  registrarFicha();

  game.settings.register(MODULO, "dominiosSincronizarAuto", {
    name: "Domínios: sincronizar efeitos automaticamente",
    hint: "Ao construir, demolir, configurar construções ou mudar o nível do domínio, os Efeitos Ativos do regente são atualizados automaticamente.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("i18nInit", () => {
  /* Garante o rótulo do tipo de ator mesmo quando o idioma do cliente
   * não carrega o lang/pt-BR.json (ex.: cliente em inglês). */
  const key = `TYPES.Actor.${MODULO}.dominio`;
  if (!game.i18n.has(key)) {
    foundry.utils.mergeObject(game.i18n.translations, {
      [key]: "Domínio (t20-hayd)"
    });
  }
});

Hooks.once("ready", () => {
  /* API pública para macros e outros módulos */
  const api = {
    catalogo,
    acoes: Acoes,
    sincronizarEfeitos,
    removerEfeitos,
    obterRegente,
    criarTabelas
  };
  /* O módulo é compartilhado com o subsistema de Bases: cada um escreve
   * em seu próprio namespace (api.bases / api.dominios) para não sobrescrever
   * a API um do outro. */
  const mod = game.modules.get(MODULO);
  if (mod) mod.api = Object.assign(mod.api ?? {}, { dominios: api });
  globalThis.tormenta20Dominios = api;
  console.debug(`${MODULO} | Domínios pronto. API disponível em game.modules.get("${MODULO}").api.dominios`);
});

/* Ressincroniza os efeitos quando o nível ou o tipo do domínio mudarem
 * por edição direta na ficha. As ações (Governar, desastres, batalhas)
 * já sincronizam explicitamente e marcam o update com t20dSkipSync —
 * sem a marca, este hook rodava uma SEGUNDA sincronização em paralelo
 * com a delas (o callAll não espera), duplicando efeitos no regente. */
Hooks.on("updateActor", async (actor, mudancas, options, userId) => {
  if (game.user.id !== userId) return;
  if (options?.t20dSkipSync) return;
  if (actor.type !== `${MODULO}.dominio`) return;
  if (!game.settings.get(MODULO, "dominiosSincronizarAuto")) return;
  const sys = mudancas.system ?? {};
  if (("nivel" in sys) || ("tipo" in sys)) {
    await sincronizarEfeitos(actor, { silencioso: true });
  }
});

/* Mantém os cartões de chat do módulo em sincronia com o tema Hayd:
 * a classe .tema-hayd (texto claro sobre o fundo escuro do t20-hayd-ui)
 * é aplicada na renderização, cobrindo também mensagens antigas criadas
 * antes de o tema ser ativado (e removida se o tema for desativado). */
Hooks.on("renderChatMessageHTML", (mensagem, html) => {
  const cartao = html.querySelector(".t20d-chat");
  if (cartao) cartao.classList.toggle("tema-hayd", catalogo.temaHayd());
});

/* Imagem padrão para novos atores de domínio. */
Hooks.on("preCreateActor", (actor, dados) => {
  if (actor.type !== `${MODULO}.dominio`) return;
  if (!dados.img || dados.img === "icons/svg/mystery-man.svg") {
    actor.updateSource({
      img: `modules/${MODULO}/assets/dominio.svg`,
      "prototypeToken.texture.src": `modules/${MODULO}/assets/dominio.svg`
    });
  }
});

/* Ao excluir o domínio, limpa os efeitos deixados no regente. */
Hooks.on("preDeleteActor", async (actor) => {
  if (actor.type !== `${MODULO}.dominio`) return;
  try {
    await removerEfeitos(actor);
  } catch (err) {
    console.debug(`${MODULO} | Falha ao limpar efeitos na exclusão do domínio.`, err);
  }
});
