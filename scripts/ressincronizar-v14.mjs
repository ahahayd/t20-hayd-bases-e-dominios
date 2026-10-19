/**
 * t20-hayd-bases-e-dominios | ressincronizar-v14.mjs
 * Só no Foundry v14 (Tormenta20 1.6), uma vez por mundo.
 *
 * Um mundo que vem do v13 tem os benefícios gravados nos personagens no
 * formato do Tormenta20 1.5. A migração do sistema converte esses efeitos,
 * mas renomeia os efeitos de uso para o nome do item (bug dela). Na primeira
 * carga no v14, depois que a migração do sistema termina, o Mestre refaz os
 * benefícios de todas as bases, domínios e negócios no formato novo.
 */
import { ehV14 } from "./versao.mjs";
import { sincronizarEfeitos as sincronizarBase } from "./bases/efeitos.mjs";
import { sincronizarEfeitos as sincronizarDominio } from "./dominios/efeitos.mjs";
import { sincronizarEfeitos as sincronizarNegocio } from "./negocios/efeitos.mjs";

const MODULO = "t20-hayd-bases-e-dominios";
const SETTING = "efeitosRefeitosV14";

Hooks.once("init", () => {
  game.settings.register(MODULO, SETTING, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
});

/** A migração do sistema terminou? Ela grava a versão do sistema ao concluir. */
function migracaoDoSistemaConcluida() {
  const feita = game.settings.get("tormenta20", "systemMigrationVersion") || "0";
  return !foundry.utils.isNewerVersion(game.system.version, feita);
}

Hooks.once("ready", async () => {
  if (!ehV14() || game.user !== game.users.activeGM) return;
  if (game.settings.get(MODULO, SETTING)) return;

  for (let i = 0; i < 120 && !migracaoDoSistemaConcluida(); i++) {
    await new Promise(r => setTimeout(r, 1000));
  }
  // Sem a migração do sistema concluída, tenta de novo na próxima carga.
  if (!migracaoDoSistemaConcluida()) return;

  const sincronizar = {
    [`${MODULO}.base-hayd`]: sincronizarBase,
    [`${MODULO}.dominio`]: sincronizarDominio,
    [`${MODULO}.negocio`]: sincronizarNegocio
  };
  let estruturas = 0;
  for (const ator of game.actors) {
    const fn = sincronizar[ator.type];
    if (!fn) continue;
    try {
      await fn(ator, { silencioso: true });
      estruturas++;
    } catch (err) {
      console.warn(`${MODULO} | Não foi possível refazer os benefícios de "${ator.name}" no v14.`, err);
    }
  }
  await game.settings.set(MODULO, SETTING, true);
  if (estruturas) console.log(`${MODULO} | Benefícios de ${estruturas} estrutura(s) refeitos no formato do Tormenta20 1.6.`);
});
