/**
 * t20-hayd-bases-e-dominios | migracao.mjs
 * Compatibilidade com os módulos descontinuados t20-hayd-bases e
 * t20-hayd-dominios: herda os atores e as configurações que já existirem
 * no mundo (de quando esses módulos eram usados separadamente) e avisa o
 * mestre a desativá-los, evitando qualquer duplicidade de tipos de ator.
 *
 * Não depende dos módulos antigos estarem ativos: os tipos de ator antigos
 * ("t20-hayd-bases.base-hayd", "t20-hayd-dominios.dominio") e os settings
 * salvos no mundo continuam nos dados salvos mesmo com o módulo desativado.
 *
 * Também cobre atores "indisponíveis": ao desativar o módulo antigo antes
 * da migração automática rodar, o Foundry deixa de reconhecer o tipo de
 * ator e passa a tratá-lo como documento inválido — nesse estado ele some
 * da coleção normal (game.actors.filter/find não o encontram) e só aparece
 * via game.actors.invalidDocumentIds/getInvalid. O botão manual em
 * Configurar → Módulos → T20 Hayd Bases e Domínios cobre esse caso.
 */
const MODULO = "t20-hayd-bases-e-dominios";

const ANTIGOS = {
  bases: {
    id: "t20-hayd-bases",
    nome: "t20-hayd-bases",
    tipoAntigo: "t20-hayd-bases.base-hayd",
    tipoNovo: `${MODULO}.base-hayd`,
    config: [["sincronizarAuto", "basesSincronizarAuto"], ["historicoMax", "basesHistoricoMax"]]
  },
  dominios: {
    id: "t20-hayd-dominios",
    nome: "t20-hayd-dominios",
    tipoAntigo: "t20-hayd-dominios.dominio",
    tipoNovo: `${MODULO}.dominio`,
    config: [["sincronizarAuto", "dominiosSincronizarAuto"]]
  }
};

/**
 * Alvos de migração de um tipo antigo: atores normais (válidos) + atores
 * "indisponíveis" (tipo não reconhecido pelo mundo no momento — típico
 * depois de desativar o módulo antigo antes de rodar a migração).
 */
function coletarAlvos(info) {
  const validos = game.actors.filter(a => a.type === info.tipoAntigo);
  const invalidos = [];
  for (const id of game.actors.invalidDocumentIds) {
    let doc;
    try {
      doc = game.actors.getInvalid(id, { strict: false });
    } catch (err) {
      console.warn(`${MODULO} | Não foi possível ler o ator inválido "${id}".`, err);
      continue;
    }
    if (doc?.type === info.tipoAntigo) invalidos.push(doc);
  }
  return [...validos, ...invalidos];
}

/** Muda o "type" dos atores do tipo antigo para o novo — o schema dos dois
 * é idêntico (mesmo DataModel, só registrado sob outro id de módulo), então
 * o "system" inteiro é preservado automaticamente pela conversão. */
async function migrarAtores(info) {
  const alvos = coletarAlvos(info);
  if (!alvos.length) return { migrados: 0, falhas: 0 };
  let migrados = 0, falhas = 0;
  for (const ator of alvos) {
    try {
      await ator.update({ type: info.tipoNovo });
      migrados++;
    } catch (err) {
      falhas++;
      console.error(`${MODULO} | Falha ao migrar o ator "${ator.name ?? ator.id}" (${ator.id}).`, err);
    }
  }
  console.debug(`${MODULO} | ${migrados} ator(es) de "${info.tipoAntigo}" migrado(s) para "${info.tipoNovo}" (${falhas} falha(s)).`);
  return { migrados, falhas };
}

/** Lê um Setting salvo no mundo diretamente do storage, sem exigir que o
 * módulo dono ainda esteja ativo (game.settings.get exige o registro). */
function lerSettingBruta(moduleId, key) {
  const doc = game.settings.storage.get("world")?.find(s => s.key === `${moduleId}.${key}`);
  if (!doc) return undefined;
  const bruto = doc.value;
  if (typeof bruto !== "string") return bruto;
  try { return JSON.parse(bruto); } catch (_err) { return bruto; }
}

async function migrarConfiguracoes(info) {
  let migrou = false;
  for (const [chaveAntiga, chaveNova] of info.config) {
    const valor = lerSettingBruta(info.id, chaveAntiga);
    if (valor === undefined) continue;
    await game.settings.set(MODULO, chaveNova, valor);
    migrou = true;
  }
  return migrou;
}

/**
 * Roda a migração completa (atores válidos + indisponíveis, e configurações
 * uma única vez). Usada tanto automaticamente no "ready" quanto pelo botão
 * manual nas configurações do módulo.
 */
export async function executarMigracao({ manual = false } = {}) {
  if (!game.user.isGM) {
    if (manual) ui.notifications.warn("Apenas o mestre pode migrar os atores.");
    return null;
  }

  const configJaMigrada = game.settings.get(MODULO, "migracaoConfigFeita");
  let totalMigrados = 0, totalFalhas = 0, configMigrada = false;

  for (const info of Object.values(ANTIGOS)) {
    const r = await migrarAtores(info);
    totalMigrados += r.migrados;
    totalFalhas += r.falhas;
    if (!configJaMigrada && await migrarConfiguracoes(info)) configMigrada = true;
  }
  if (!configJaMigrada) await game.settings.set(MODULO, "migracaoConfigFeita", true);

  if (manual) {
    if (totalMigrados || configMigrada) {
      ui.notifications.info(
        `T20 Hayd Bases e Domínios: ${totalMigrados} ator(es) migrado(s)${configMigrada ? "; configurações herdadas" : ""}.` +
        (totalFalhas ? ` ${totalFalhas} falha(s) — veja o console (F12).` : "")
      );
    } else {
      ui.notifications.info("T20 Hayd Bases e Domínios: nenhum ator ou configuração pendente de migração.");
    }
  }

  return { totalMigrados, totalFalhas, configMigrada };
}

Hooks.once("init", () => {
  game.settings.register(MODULO, "migracaoConfigFeita", {
    scope: "world", config: false, type: Boolean, default: false
  });

  /* Botão manual em Configurar → Módulos Complementares → T20 Hayd Bases e
   * Domínios: útil quando um ator fica "indisponível" (tipo não reconhecido)
   * por ter sido criado/editado depois que o módulo antigo foi desativado,
   * ou sempre que se quiser forçar uma nova varredura. */
  class BotaoMigrarAgora extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "t20bd-migrar-agora" };
    async render(..._args) {
      await executarMigracao({ manual: true });
      return this;
    }
    async close(..._args) { return this; }
  }

  game.settings.registerMenu(MODULO, "migrarAgoraMenu", {
    name: "Migrar atores dos módulos antigos",
    label: "Migrar agora",
    hint: "Converte atores de Base/Domínio que ainda estejam com o tipo antigo (t20-hayd-bases / t20-hayd-dominios) para o tipo deste módulo — inclusive os que aparecem como \"indisponíveis\" no diretório de atores depois de desativar os módulos antigos.",
    icon: "fa-solid fa-arrows-rotate",
    type: BotaoMigrarAgora,
    restricted: true
  });
});

Hooks.once("ready", async () => {
  if (game.user !== game.users.activeGM) return;

  const { totalMigrados, configMigrada } = await executarMigracao();

  const basesAtivo = game.modules.get("t20-hayd-bases")?.active === true;
  const dominiosAtivo = game.modules.get("t20-hayd-dominios")?.active === true;
  if (!basesAtivo && !dominiosAtivo) return;

  const antigosAtivos = [basesAtivo && "t20-hayd-bases", dominiosAtivo && "t20-hayd-dominios"].filter(Boolean);
  const linhas = [];
  if (totalMigrados > 0) linhas.push(`<li>${totalMigrados} ator(es) migrado(s) automaticamente para o novo tipo deste módulo.</li>`);
  if (configMigrada) linhas.push(`<li>As configurações dos módulos antigos foram herdadas.</li>`);
  linhas.push(`<li>Módulo(s) ainda ativo(s): <strong>${antigosAtivos.join(", ")}</strong>.</li>`);

  await ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    content: `<div>
      <p><strong>T20 Hayd Bases e Domínios</strong> substitui ${antigosAtivos.length > 1 ? "os módulos" : "o módulo"} ${antigosAtivos.map(n => `<strong>${n}</strong>`).join(" e ")} e já herdou os dados e configurações existentes neste mundo.</p>
      <ul>${linhas.join("")}</ul>
      <p>Para evitar tipos de ator duplicados e conflitos, <strong>desative ${antigosAtivos.length > 1 ? "os módulos antigos" : "o módulo antigo"}</strong> em <em>Configurar → Módulos Complementares</em>. Se algum ator ficar "indisponível" no meio do caminho, use o botão <strong>Migrar agora</strong> nas configurações deste módulo.</p>
    </div>`
  });
});
