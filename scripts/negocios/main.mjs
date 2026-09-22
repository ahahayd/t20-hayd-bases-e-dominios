/**
 * t20-hayd-bases-e-dominios | negocios/main.mjs
 * Subsistema de Negócios (Tormenta20: Fim dos Tempos): registra o tipo de
 * ator "negocio", a ficha, as configurações, a API e os hooks.
 */
import { MODULO, TIPO_NEGOCIO } from "./catalogo.mjs";
import * as Catalogo from "./catalogo.mjs";
import * as Acoes from "./acoes.mjs";
import { registrarDataModel } from "./data.mjs";
import { registrarFicha } from "./sheet.mjs";
import {
  sincronizarEfeitos, removerEfeitos, montarEfeitosPara, obterFrequentador
} from "./efeitos.mjs";

Hooks.once("init", () => {
  registrarDataModel();
  registrarFicha();

  game.settings.register(MODULO, "negociosSincronizarAuto", {
    name: "Negócios: sincronizar efeitos automaticamente",
    hint: "Recria os Efeitos Ativos nos frequentadores sempre que o negócio é alterado (nível, ativos, escolhas, frequentadores).",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULO, "negociosHistoricoMax", {
    name: "Negócios: caixa — movimentações exibidas",
    hint: "Quantidade máxima de linhas do histórico do caixa carregadas na ficha do negócio.",
    scope: "world", config: true, type: Number, default: 25,
    range: { min: 5, max: 120, step: 5 }
  });
});

Hooks.once("i18nInit", () => {
  const key = `TYPES.Actor.${TIPO_NEGOCIO}`;
  if (!game.i18n.has(key)) {
    foundry.utils.mergeObject(game.i18n.translations, { [key]: "Negócio (t20-hayd)" });
  }
});

Hooks.once("ready", () => {
  const api = {
    catalogo: Catalogo,
    acoes: Acoes,
    sincronizarEfeitos, removerEfeitos, montarEfeitosPara, obterFrequentador
  };
  const mod = game.modules.get(MODULO);
  if (mod) mod.api = Object.assign(mod.api ?? {}, { negocios: api });
});

/* Nível alterado direto na ficha: ativos podem ficar excedentes (ou voltar
 * a valer), então os efeitos são recriados. As ações do módulo já
 * sincronizam por conta própria e marcam o update com t20nSemSync. */
Hooks.on("updateActor", async (actor, mudancas, options, userId) => {
  if (game.user.id !== userId || options?.t20nSemSync) return;
  if (actor.type !== TIPO_NEGOCIO) return;
  if (!("nivel" in (mudancas.system ?? {}))) return;
  if (!game.settings.get(MODULO, "negociosSincronizarAuto")) return;
  await sincronizarEfeitos(actor, { silencioso: true });
});

Hooks.on("preCreateActor", (actor, dados) => {
  if (actor.type !== TIPO_NEGOCIO) return;
  if (!dados.img || dados.img === "icons/svg/mystery-man.svg") {
    actor.updateSource({
      img: `modules/${MODULO}/assets/negocio.svg`,
      "prototypeToken.texture.src": `modules/${MODULO}/assets/negocio.svg`
    });
  }
});

/* Negócios ainda estão em testes: avisa quem acabou de criar um. O atraso
 * deixa a ficha recém-criada abrir antes, e o aviso aparece por cima dela. */
Hooks.on("createActor", (actor, _options, userId) => {
  if (actor.type !== TIPO_NEGOCIO || userId !== game.user.id) return;
  setTimeout(() => foundry.applications.api.DialogV2.prompt({
    window: { title: "Negócios em testes", icon: "fa-solid fa-flask" },
    content: `<p>A função de <strong>Negócios</strong> ainda está em fase de testes.</p>
      <p>Regras, automações e a ficha podem mudar ou apresentar problemas. Se encontrar algo estranho, reporte!</p>`,
    ok: { label: "OK", icon: "fa-solid fa-check" },
    rejectClose: false
  }), 400);
});

Hooks.on("preDeleteActor", (actor) => {
  if (actor.type !== TIPO_NEGOCIO) return;
  removerEfeitos(actor).catch(err =>
    console.debug(`${MODULO} | Falha ao limpar efeitos na exclusão do negócio`, err));
});
