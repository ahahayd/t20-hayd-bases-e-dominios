/**
 * Seletor de cor para as fichas ApplicationV2 de Bases e Domínios.
 * Usa exatamente a flag pública adotada pelo t20-hayd-ui.
 */
const UI_ID = "t20-hayd-ui";
const FLAG_COR = "configCor";
const COR_PADRAO = "#960505";

function normalizarHex(cor) {
  if (typeof cor !== "string") return null;
  const valor = cor.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(valor)) return valor;
  if (/^#[0-9a-f]{3}$/.test(valor)) {
    return `#${valor[1]}${valor[1]}${valor[2]}${valor[2]}${valor[3]}${valor[3]}`;
  }
  return null;
}

function corPadrao() {
  try {
    return normalizarHex(game.settings.get(UI_ID, "corPadrao")) ?? COR_PADRAO;
  } catch (_err) {
    return COR_PADRAO;
  }
}

function configuracaoAtual(ator) {
  const raw = ator.getFlag?.(UI_ID, FLAG_COR);
  if (raw && typeof raw === "object" && raw.mode === "custom") {
    return { mode: "custom", cor: normalizarHex(raw.cor) ?? corPadrao() };
  }
  return { mode: raw === "padrao" ? "padrao" : "auto", cor: corPadrao() };
}

export async function abrirSeletorCor(ator) {
  if (!ator || (!ator.isOwner && !game.user.isGM)) return;

  const atual = configuracaoAtual(ator);
  const padrao = corPadrao();
  const checked = mode => atual.mode === mode ? "checked" : "";
  const conteudo = `
    <div class="t20bd-cor-opcoes">
      <p>Escolha como a cor de destaque desta ficha será definida.</p>
      <label>
        <input type="radio" name="mode" value="auto" ${checked("auto")}>
        <span><strong>Cor do jogador (automática)</strong><small>Usa a cor do primeiro jogador dono desta ficha.</small></span>
      </label>
      <label>
        <input type="radio" name="mode" value="custom" ${checked("custom")}>
        <span><strong>Cor personalizada</strong><small>Usa uma cor exclusiva para esta ficha.</small></span>
      </label>
      <div class="t20bd-cor-campos">
        <input type="color" name="corCustom" value="${atual.cor}">
        <input type="text" name="corCustomHex" value="${atual.cor}" maxlength="7" spellcheck="false">
      </div>
      <label>
        <input type="radio" name="mode" value="padrao" ${checked("padrao")}>
        <span><strong>Cor padrão</strong><small>Usa a cor padrão do mundo (${padrao}).</small></span>
      </label>
    </div>`;

  const resultado = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Cor de destaque da ficha", icon: "fa-solid fa-palette" },
    position: { width: 430 },
    classes: ["t20bd-cor-dialog"],
    content: conteudo,
    render: (_event, dialog) => {
      const picker = dialog.element.querySelector('[name="corCustom"]');
      const hex = dialog.element.querySelector('[name="corCustomHex"]');
      const radio = dialog.element.querySelector('[name="mode"][value="custom"]');
      picker?.addEventListener("input", () => {
        hex.value = picker.value;
        radio.checked = true;
      });
      hex?.addEventListener("change", () => {
        const cor = normalizarHex(hex.value) ?? picker.value;
        picker.value = cor;
        hex.value = cor;
        radio.checked = true;
      });
    },
    ok: {
      label: "Aplicar",
      icon: "fa-solid fa-check",
      callback: (_event, button) => {
        const form = button.form;
        return {
          mode: form.elements.mode.value,
          cor: normalizarHex(form.elements.corCustom.value)
        };
      }
    },
    rejectClose: false,
    modal: true
  }).catch(() => null);

  if (!resultado?.mode) return;
  if (resultado.mode === "custom") {
    await ator.setFlag(UI_ID, FLAG_COR, { mode: "custom", cor: resultado.cor ?? padrao });
  } else {
    await ator.setFlag(UI_ID, FLAG_COR, resultado.mode === "padrao" ? "padrao" : "auto");
  }
}
