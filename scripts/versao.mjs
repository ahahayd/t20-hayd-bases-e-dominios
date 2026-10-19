/**
 * t20-hayd-bases-e-dominios | versao.mjs
 * O módulo roda no Foundry v13 (Tormenta20 1.5) e no v14 (Tormenta20 1.6)
 * com o mesmo código. Onde os dois diferem, o código pergunta `ehV14()` e
 * segue o caminho de cada um. Cada versão do Tormenta20 só existe numa
 * versão do Foundry, então isto também separa o formato de dados do sistema.
 *
 * Os benefícios continuam sendo montados no formato do v13 (catálogos,
 * diálogos de benefícios). A conversão para o v14 acontece só na hora de
 * gravar, em `efeitosParaOSistema`.
 */

export function ehV14() {
  return (game.release?.generation ?? 13) >= 14;
}

/* ── Efeitos Ativos ────────────────────────────────────────────
   No Tormenta20 1.6 o sistema deixou de ler `flags.tormenta20.*`:
     flags.tormenta20.onuse          → system.onuse
     flags.tormenta20.skill/attack/… → system.abilityUse.types
     flags.tormenta20.items ("a;b")  → system.abilityUse.names
     flags.tormenta20.custo ("2")    → system.abilityUse.custo (número|null)
     !disabled de um efeito de uso   → system.abilityUse.automatic
                                       (efeitos de uso ficam sempre disabled)
   e o Foundry v14 trocou `changes[].mode` (número) por
   `system.changes[].type` (texto). */

const TIPOS_DE_USO = ["self", "ability", "attack", "consumable", "equipment", "power", "skill", "spell"];
const CHAVES_MOVIDAS = ["onuse", "durationScene", "items", "custo", "aumenta"];
const MODO_PARA_TIPO = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };

function efeitoV14(dados) {
  const saida = foundry.utils.deepClone(dados);
  const t = saida.flags?.tormenta20 ?? {};
  saida.system ??= {};

  saida.system.changes = (saida.changes ?? []).map(c => ({
    key: c.key,
    value: String(c.value ?? ""),
    type: MODO_PARA_TIPO[Number(c.mode ?? 2)] ?? "add",
    priority: c.priority ?? null
  }));
  delete saida.changes;

  if ("onuse" in t) {
    saida.system.onuse = !!t.onuse;
    if (t.onuse) {
      const nomes = typeof t.items === "string"
        ? t.items.replaceAll(",", ";").split(";").map(s => s.trim()).filter(Boolean)
        : Array.isArray(t.items) ? t.items : [];
      const custo = t.custo === undefined || t.custo === null || t.custo === "" ? null : Number(t.custo);
      saida.system.abilityUse = {
        automatic: !saida.disabled,
        aumenta: !!t.aumenta,
        custo: Number.isFinite(custo) ? custo : null,
        names: nomes,
        types: TIPOS_DE_USO.filter(k => t[k])
      };
      saida.disabled = true;
    }
  }

  // O cartão do chat do 1.6 lê `parseHTML(description).innerText`, que só
  // funciona com UM elemento raiz: os dois <p> das descrições viram um <div>.
  if (typeof saida.description === "string" && saida.description.trim()) {
    saida.description = `<div>${saida.description}</div>`;
  }

  if (saida.flags?.tormenta20) {
    for (const k of [...CHAVES_MOVIDAS, ...TIPOS_DE_USO]) delete saida.flags.tormenta20[k];
  }
  return saida;
}

/** Dados de efeitos montados no formato do v13, prontos para gravar nesta versão. */
export function efeitosParaOSistema(lista) {
  return ehV14() ? lista.map(efeitoV14) : lista;
}

/** Mudanças de um Efeito Ativo gravado: `system.changes` no v14, `changes` no v13. */
export function mudancasDoEfeito(efeito) {
  return (ehV14() ? efeito?.system?.changes : efeito?.changes) ?? [];
}

/** O Efeito Ativo gravado é um efeito de uso (opção da janela de rolagem)? */
export function ehEfeitoDeUso(efeito) {
  return ehV14() ? !!efeito?.system?.onuse : !!efeito?.flags?.tormenta20?.onuse;
}

/* ── Janela de uso do sistema e modo das mensagens ─────────────
   v14: a janela devolve `messageMode` e o modo vem de core.messageMode;
   ChatMessage.applyRollMode virou ChatMessage.applyMode.
   v13: `rollMode`, core.rollMode e ChatMessage.applyRollMode. */

export function modoPadrao() {
  return game.settings.get("core", ehV14() ? "messageMode" : "rollMode");
}

export function modoDaJanela(configuracao, padrao) {
  return (ehV14() ? configuracao?.messageMode : configuracao?.rollMode) ?? padrao;
}

export function aplicarModo(dados, modo) {
  if (ehV14()) ChatMessage.applyMode(dados, modo);
  else ChatMessage.applyRollMode(dados, modo);
}

/**
 * v14: a janela de uso não procura os aprimoramentos sozinha; lê a lista
 * `applicableOnUseEffects` que o rollPericia do sistema monta. Esta é a
 * mesma regra dele (efeitos de uso de perícia do ator e dos itens). No v13
 * a própria janela monta a lista, então nada é feito.
 */
export function prepararJanelaDePericia(itemData, ator) {
  if (!ehV14()) return itemData;
  itemData.applicableOnUseEffects = [];
  for (const [caminho, doc] of ator.traverseEmbeddedDocuments()) {
    if (doc.documentName !== "ActiveEffect") continue;
    if (doc.isTemporary && caminho !== "effects") continue;
    if (!doc.system.onuse) continue;
    const { types, names } = doc.system.abilityUse;
    if (!types.has("skill")) continue;
    if (names.size && !names.has(itemData.name)) continue;
    itemData.applicableOnUseEffects.push(doc);
  }
  return itemData;
}
