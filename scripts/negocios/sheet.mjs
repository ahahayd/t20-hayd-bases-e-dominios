/**
 * t20-hayd-bases-e-dominios | negocios/sheet.mjs
 * Ficha do ator Negócio (ApplicationV2 / Foundry v13). Usa o mesmo layout
 * e o mesmo tema das Bases (classes .tormenta20-bases / .t20b-*).
 */
import {
  MODULO, TIPO_NEGOCIO, NIVEL_MAXIMO, CAMINHOS_SUGERIDOS,
  obterAtivos, rotuloEscolha, categoriaNivel, temaHayd, corDestaqueAtor
} from "./catalogo.mjs";
import * as Acoes from "./acoes.mjs";
import {
  sincronizarEfeitos, removerEfeitos, obterFrequentador,
  montarEfeitosPara, caminhosDeOutrasEstruturas
} from "./efeitos.mjs";
import { abrirSeletorCor } from "../cor-ficha.mjs";
import { fmtPeso } from "../bases/acoes.mjs";
import { guardarItem } from "../bases/transferencia.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const T = (p) => `modules/${MODULO}/templates/negocios/${p}`;
const escapar = valor => foundry.utils.escapeHTML(String(valor ?? ""));

const GRUPOS_INVENTARIO = [
  { tipo: "arma", rotulo: "Armas", icone: "fa-hand-fist" },
  { tipo: "equipamento", rotulo: "Equipamentos", icone: "fa-toolbox" },
  { tipo: "consumivel", rotulo: "Consumíveis", icone: "fa-flask" },
  { tipo: "tesouro", rotulo: "Tesouros", icone: "fa-gem" }
];
const TIPOS_ITEM_FISICO = GRUPOS_INVENTARIO.map(g => g.tipo);
const TIPOS_ESTRUTURA = [`${MODULO}.base-hayd`, `${MODULO}.dominio`, TIPO_NEGOCIO];

export class NegocioSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["tormenta20-bases", "negocio-sheet"],
    position: { width: 920, height: 790 },
    window: { resizable: true, contentClasses: ["t20b-conteudo"] },
    form: { submitOnChange: true },
    actions: {
      trocarAba: NegocioSheet.#trocarAba,
      editarImagem: NegocioSheet.#editarImagem,
      configurarCor: NegocioSheet.#configurarCor,
      ajustarCaixa: NegocioSheet.#ajustarCaixa,
      limparHistorico: NegocioSheet.#limparHistorico,
      sincronizar: NegocioSheet.#sincronizar,
      limparEfeitos: NegocioSheet.#limparEfeitos,
      aumentarNivel: NegocioSheet.#aumentarNivel,
      abrirCatalogoAtivos: NegocioSheet.#abrirCatalogoAtivos,
      alternarAtivo: NegocioSheet.#alternarAtivo,
      configurarAtivo: NegocioSheet.#configurarAtivo,
      removerAtivo: NegocioSheet.#removerAtivo,
      adicionarFrequentadorManual: NegocioSheet.#adicionarFrequentadorManual,
      abrirFrequentador: NegocioSheet.#abrirFrequentador,
      removerFrequentador: NegocioSheet.#removerFrequentador,
      alternarFrequentador: NegocioSheet.#alternarFrequentador,
      definirDono: NegocioSheet.#definirDono,
      verEfeitosFrequentador: NegocioSheet.#verEfeitosFrequentador,
      abrirItem: NegocioSheet.#abrirItem,
      excluirItem: NegocioSheet.#excluirItem,
      novoPeriodo: NegocioSheet.#novoPeriodo,
      rendimentos: NegocioSheet.#rendimentos,
      cassino: NegocioSheet.#cassino,
      mercado: NegocioSheet.#mercado,
      removerAssociado: NegocioSheet.#removerAssociado,
      quitarDivida: NegocioSheet.#quitarDivida,
      criarHomebrew: NegocioSheet.#criarHomebrew,
      excluirHomebrew: NegocioSheet.#excluirHomebrew
    }
  };

  static PARTS = {
    header:         { template: T("parts/header.hbs") },
    nav:            { template: T("parts/nav.hbs") },
    geral:          { template: T("parts/geral.hbs") },
    ativos:         { template: T("parts/ativos.hbs") },
    frequentadores: { template: T("parts/frequentadores.hbs") },
    inventario:     { template: T("parts/inventario.hbs") },
    periodo:        { template: T("parts/periodo.hbs") },
    diario:         { template: T("parts/diario.hbs") }
  };

  tabGroups = { primary: "geral" };
  #elementoComDrop = null;

  _getHeaderControls() {
    const controles = super._getHeaderControls();
    if (temaHayd() && (this.actor.isOwner || game.user.isGM)) {
      controles.unshift({ icon: "fa-solid fa-palette", label: "Cor da Ficha", action: "configurarCor" });
    }
    return controles;
  }

  /* ---------------------------------------------------------------- */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;
    const cat = obterAtivos(actor);

    const abas = [
      { id: "geral", rotulo: "Negócio", icone: "fa-shop" },
      { id: "ativos", rotulo: "Ativos", icone: "fa-cubes" },
      { id: "frequentadores", rotulo: "Frequentadores", icone: "fa-users" },
      { id: "inventario", rotulo: "Estoque", icone: "fa-boxes-stacked" },
      { id: "periodo", rotulo: "Mês/Aventura", icone: "fa-calendar-days" },
      { id: "diario", rotulo: "Diário", icone: "fa-book-open" }
    ].map(a => ({ ...a, ativa: this.tabGroups.primary === a.id }));

    const frequentadores = await Promise.all(s.frequentadores.map(async (freq) => {
      const ator = await obterFrequentador(freq.uuid);
      return {
        ...freq,
        nome: ator?.name ?? freq.nome ?? "(ator não encontrado)",
        img: ator?.img ?? "icons/svg/mystery-man.svg",
        existe: !!ator,
        recebe: freq.receberEfeitos !== false
      };
    }));
    frequentadores.sort((a, b) => Number(!!b.dono) - Number(!!a.dono));
    const uuids = new Set(s.frequentadores.map(f => f.uuid));
    const personagensDisponiveis = game.actors
      .filter(ator => ator.type === "character"
        && !uuids.has(ator.uuid)
        && (game.user.isGM || ator.testUserPermission?.(game.user, "OBSERVER")))
      .map(ator => ({ uuid: ator.uuid, nome: ator.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const ativos = s.ativos.map((a, indice) => {
      const def = cat[a.key] ?? {};
      const excedente = s.ativosExcedentes.has(a.id);
      const espiao = def.escolha === "ativo";
      const alvo = espiao ? cat[a.escolha] : null;
      const temAutomacao = !!(def.efeito || def.efeitosUso?.length || espiao);
      return {
        ...a,
        ordem: indice + 1,
        nome: def.nome ?? a.key,
        beneficio: def.beneficio ?? "",
        nota: def.nota ?? null,
        prereq: [
          def.prereqNivel ? `nível ${def.prereqNivel}` : null,
          ...(def.prereqAtivos ?? []).map(p => cat[p]?.nome ?? p)
        ].filter(Boolean).join(", "),
        manual: !!def.manual && !temAutomacao,
        especial: !!def.especial,
        temEfeito: temAutomacao,
        precisaConfig: !!def.escolha,
        semEscolha: !!def.escolha && !a.escolha,
        escolhaRotulo: rotuloEscolha(def, a, cat),
        espiaoInvalido: espiao && a.escolha && (!alvo || s.possuiAtivo(a.escolha)),
        conjurador: def.conjurador ?? null,
        excedente,
        homebrew: String(a.key).startsWith("hb-"),
        ativoOn: a.ativo !== false
      };
    });

    const inventario = GRUPOS_INVENTARIO.map(g => ({
      ...g,
      itens: actor.items.filter(i => i.type === g.tipo)
        .map(i => ({
          id: i.id, nome: i.name, img: i.img,
          qtd: i.system.qtd ?? 1,
          pesoFmt: fmtPeso(i.system.espacos, i.system.qtd ?? 1)
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    }));
    const din = s.dinheiro ?? { to: 0, tp: 0, tc: 0 };
    const totalMoedas = Acoes.fmtTS((din.to ?? 0) * 10 + (din.tp ?? 0) + (din.tc ?? 0) / 10);

    const niveis = Array.from({ length: NIVEL_MAXIMO + 1 }, (_, n) => ({
      valor: n,
      rotulo: n === 0 ? "— não fundado —" : `Nível ${n} (${categoriaNivel(n).nome})`,
      selecionado: s.nivel === n
    }));
    const tabelaNiveis = Array.from({ length: NIVEL_MAXIMO }, (_, i) => {
      const n = i + 1;
      return {
        nivel: n,
        categoria: categoriaNivel(n).nome,
        cd: n === 1 ? 20 : 20 + 2 * n,
        custo: Acoes.fmtTS(1000 * n),
        rendimento: Acoes.fmtTS(100 * n),
        atual: s.nivel === n
      };
    });

    const dono = frequentadores.find(f => f.dono);
    const periodoFlags = s.aventura;

    return Object.assign(context, {
      actor, system: s, abas, frequentadores, personagensDisponiveis,
      ativos, inventario, totalMoedas, niveis, tabelaNiveis,
      donoNome: dono?.nome ?? null,
      caixaFmt: totalMoedas,
      rendimentoFmt: Acoes.fmtTS(s.rendimentoBase),
      proximo: s.proximoNivel ? {
        ...s.proximoNivel,
        custoFmt: Acoes.fmtTS(s.proximoNivel.custo),
        ajustes: [
          s.fundado && s.temBeneficio("estudio") ? "Estúdio: CD –5" : null,
          s.fundado && s.temBeneficio("escritorio") ? "Escritório: custo pela metade" : null
        ].filter(Boolean).join(" · ")
      } : null,
      podeEscolherAtivo: s.fundado && s.qtdAtivos < s.maxAtivos,
      vagasAtivos: Math.max(0, s.maxAtivos - s.qtdAtivos),
      qtdExcedentes: s.ativosExcedentes.size,
      temCassino: s.temBeneficio("cassino"),
      temMercado: s.temBeneficio("mercado-multinivelado"),
      temEmporio: s.temBeneficio("emporio"),
      premioCassino: `TO ${10 * s.nivel * s.nivel}`,
      dividaFmt: s.cassino.divida ? Acoes.fmtTS(s.cassino.divida) : null,
      associados: s.mercado.recrutados.map((r, indice) => ({ ...r, indice })),
      multiplicadorMercado: Math.min(s.mercado.recrutados.length, s.nivel),
      periodo: periodoFlags,
      lembretes: Acoes.lembretes(actor),
      historico: [...s.caixa.historico].reverse()
        .slice(0, Math.max(1, Number(game.settings.get(MODULO, "negociosHistoricoMax")) || 25))
        .map(h => ({
          ...h,
          positivo: (h.delta ?? 0) >= 0,
          deltaFmt: `${(h.delta ?? 0) >= 0 ? "+" : ""}${Number(h.delta).toLocaleString("pt-BR")}`
        })),
      ehGM: game.user.isGM,
      homebrewAtivos: s.homebrew.ativos,
      campoBiografia: s.schema.getField("detalhes.biography"),
      campoEmpregados: s.schema.getField("detalhes.empregados"),
      campoNotas: s.schema.getField("detalhes.notas"),
      biografiaHTML: await this.#enriquecer("biografia", s.detalhes.biography),
      empregadosHTML: await this.#enriquecer("empregados", s.detalhes.empregados),
      notasHTML: await this.#enriquecer("notas", s.detalhes.notas)
    });
  }

  #cacheEnrich = {};

  async #enriquecer(campo, fonte) {
    const cache = this.#cacheEnrich[campo];
    if (cache && cache.fonte === fonte) return cache.html;
    const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(fonte, { async: true });
    this.#cacheEnrich[campo] = { fonte, html };
    return html;
  }

  /* ---------------------------------------------------------------- */
  _onRender(context, options) {
    super._onRender(context, options);
    const tema = temaHayd();
    this.element.classList.toggle("tema-hayd", tema);
    if (tema) this.element.style.setProperty("--t20b-destaque", corDestaqueAtor(this.actor));
    else this.element.style.removeProperty("--t20b-destaque");

    this.#ativarAba(this.tabGroups.primary);
    if (this.#elementoComDrop !== this.element) {
      this.element.addEventListener("drop", this.#aoSoltar.bind(this));
      this.element.addEventListener("dragover", ev => ev.preventDefault());
      this.#elementoComDrop = this.element;
    }
    for (const inp of this.element.querySelectorAll("input.t20b-inv-qtd")) {
      inp.addEventListener("change", async (ev) => {
        const item = this.actor.items.get(ev.currentTarget.dataset.id);
        if (!item) return;
        await item.update({ "system.qtd": Math.max(0, Math.round(Number(ev.currentTarget.value) || 0)) });
      });
    }
  }

  async _onDropItem(event, item) {
    if (item.parent?.uuid !== this.actor.uuid && !TIPOS_ITEM_FISICO.includes(item.type)) {
      ui.notifications.warn("Somente itens físicos (armas, equipamentos, consumíveis e tesouros) podem ser guardados no estoque.");
      return null;
    }
    /* Vindo de outro ator: pergunta a quantidade e move (subtrai da origem). */
    if (await guardarItem(this.actor, item)) return null;
    return super._onDropItem(event, item);
  }

  /** Jogadores sem posse desta ficha também podem soltar itens de seus
   *  personagens aqui — a transferência é validada pelo mestre. */
  _canDragDrop(selector) {
    return true;
  }

  #ativarAba(id) {
    this.tabGroups.primary = id;
    for (const sec of this.element.querySelectorAll("section.t20b-aba"))
      sec.classList.toggle("ativa", sec.dataset.tab === id);
    for (const nav of this.element.querySelectorAll(".t20b-nav [data-tab]"))
      nav.classList.toggle("ativa", nav.dataset.tab === id);
  }

  async #aoSoltar(event) {
    let dados;
    try {
      dados = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch (_err) {
      try { dados = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
    }
    if (dados?.type !== "Actor") return;
    event.preventDefault();
    event.stopPropagation();
    const ator = await Actor.implementation.fromDropData(dados).catch(() => null);
    if (!ator) return ui.notifications.warn("Não foi possível identificar o ator arrastado.");
    await this.#adicionarFrequentador(ator);
  }

  async #adicionarFrequentador(ator) {
    if (TIPOS_ESTRUTURA.includes(ator.type)) return ui.notifications.warn("Bases, domínios e negócios não podem frequentar um negócio.");
    const lista = this.actor.system.frequentadores;
    if (lista.some(r => r.uuid === ator.uuid))
      return ui.notifications.warn(`${ator.name} já frequenta este negócio.`);
    const primeiroPersonagem = ator.type === "character" && !lista.some(f => f.dono);
    const frequentadores = [...lista, {
      id: foundry.utils.randomID(), uuid: ator.uuid, nome: ator.name,
      dono: primeiroPersonagem, receberEfeitos: true, beneficiosDesativados: []
    }];
    await this.actor.update({ "system.frequentadores": frequentadores });
    ui.notifications.info(primeiroPersonagem
      ? `${ator.name} agora é dono(a) de ${this.actor.name}.`
      : `${ator.name} agora frequenta ${this.actor.name}.`);
    if (game.settings.get(MODULO, "negociosSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  async #sincronizarAuto() {
    if (game.settings.get(MODULO, "negociosSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  /* ------------------------- Ações gerais ------------------------- */

  static #trocarAba(event, alvo) { this.#ativarAba(alvo.dataset.tab); }

  static async #configurarCor() { await abrirSeletorCor(this.actor); }

  static #editarImagem() {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image", current: this.actor.img,
      callback: (caminho) => this.actor.update({ img: caminho })
    });
    fp.render(true);
  }

  static async #ajustarCaixa() {
    const dados = await DialogV2.prompt({
      window: { title: "Ajustar Caixa do Negócio" },
      content: `<div class="form-group"><label>Valor (T$; negativo para gastar; aceita décimos, ex.: 12,5)</label>
        <input type="number" name="valor" value="0" step="0.1"></div>
        <div class="form-group"><label>Descrição</label>
        <input type="text" name="desc" value="Ajuste manual"></div>`,
      ok: { label: "Aplicar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
    }).catch(() => null);
    if (!dados || !Number(dados.valor)) return;
    await Acoes.movimentarCaixa(this.actor, dados.desc || "Ajuste manual", Number(dados.valor));
  }

  static async #limparHistorico() {
    if (!game.user.isGM) return;
    const total = this.actor.system.caixa.historico.length;
    if (!total) return ui.notifications.info("O histórico do caixa já está vazio.");
    const ok = await DialogV2.confirm({
      window: { title: "Limpar Histórico do Caixa" },
      content: `<p>Apagar as <strong>${total}</strong> movimentações registradas do caixa do negócio?</p>
        <p>O saldo não é alterado. Esta ação não pode ser desfeita.</p>`
    });
    if (!ok) return;
    await this.actor.update({ "system.caixa.historico": [] });
  }

  static async #sincronizar() { await sincronizarEfeitos(this.actor); }

  static async #limparEfeitos() {
    const n = await removerEfeitos(this.actor);
    ui.notifications.info(`Negócio: ${n} efeito(s) removido(s) dos frequentadores.`);
  }

  static async #aumentarNivel() {
    const sucesso = await Acoes.acaoAumentarNivel(this.actor);
    if (sucesso && this.actor.system.qtdAtivos < this.actor.system.maxAtivos) {
      this.#ativarAba("ativos");
      await NegocioSheet.#abrirCatalogoAtivos.call(this);
    }
  }

  static async #novoPeriodo() { await Acoes.novoPeriodo(this.actor); }
  static async #rendimentos() { await Acoes.acaoRendimentos(this.actor); }
  static async #cassino() { await Acoes.acaoCassino(this.actor); }
  static async #mercado() { await Acoes.acaoMercado(this.actor); }

  static async #quitarDivida() {
    const divida = this.actor.system.cassino.divida;
    if (!divida) return;
    const escolha = await DialogV2.wait({
      window: { title: "Dívida do Cassino" },
      content: `<p>Dívida atual: <strong>${Acoes.fmtTS(divida)}</strong>.</p>`,
      buttons: [
        { action: "caixa", label: "Pagar com o caixa", icon: "fa-solid fa-coins", default: true },
        { action: "perdoar", label: "Quitada por fora / perdoada" },
        { action: "cancelar", label: "Cancelar" }
      ]
    }).catch(() => null);
    if (!escolha || escolha === "cancelar") return;
    if (escolha === "caixa") {
      const pago = await Acoes.movimentarCaixa(this.actor, "Cassino (quitação de dívida)", -divida);
      if (pago === null) return;
    }
    await this.actor.update({ "system.cassino.divida": 0 });
  }

  static async #removerAssociado(event, alvo) {
    const indice = Number(alvo.dataset.indice);
    const recrutados = this.actor.system.mercado.recrutados.filter((_, i) => i !== indice);
    await this.actor.update({ "system.mercado.recrutados": recrutados });
  }

  /* ------------------------- Ativos ------------------------------- */

  static async #abrirCatalogoAtivos() {
    const actor = this.actor;
    const s = actor.system;
    if (!s.fundado) return ui.notifications.warn("Crie o negócio antes de escolher ativos (aba Negócio).");
    const cat = obterAtivos(actor);
    let html = `<div class="t20b-catalogo"><p>Um ativo por nível — ${s.qtdAtivos}/${s.maxAtivos} escolhidos. Os benefícios valem para o dono e para o grupo enquanto tiverem acesso ao negócio.</p><ul>`;
    const ordenados = Object.entries(cat).sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"));
    for (const [key, def] of ordenados) {
      const erro = Acoes.validarAtivo(actor, key);
      const tags = [
        def.prereqNivel ? `Nível ${def.prereqNivel}` : null,
        ...(def.prereqAtivos ?? []).map(p => cat[p]?.nome ?? p)
      ].filter(Boolean);
      const auto = def.efeito || def.efeitosUso?.length || def.especial || def.escolha === "ativo";
      html += `<li class="${erro ? "desabilitada" : ""}">
        <button type="button" data-key="${key}" ${erro ? "disabled" : ""}>
          <strong>${escapar(def.nome)}${String(key).startsWith("hb-") ? " ★" : ""}</strong>
          <span class="t20b-custo">${auto ? '<i class="fa-solid fa-bolt" title="Automatizado"></i>' : '<i class="fa-solid fa-hand" title="Aplicado manualmente"></i>'}${tags.length ? ` Pré-req.: ${escapar(tags.join(", "))}` : ""}</span>
        </button>
        <span class="t20b-beneficio">${def.beneficio}.</span>
        ${erro ? `<span class="t20b-erro">${erro}</span>` : ""}
      </li>`;
    }
    html += `</ul></div>`;

    const dialog = new DialogV2({
      window: { title: `Catálogo de Ativos — ${s.qtdAtivos}/${s.maxAtivos}`, resizable: true },
      position: { width: 640, height: 640 },
      content: html,
      buttons: [{ action: "fechar", label: "Fechar", default: true }]
    });
    await dialog.render(true);
    dialog.element.querySelectorAll("button[data-key]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await dialog.close();
        await Acoes.acaoAdicionarAtivo(actor, btn.dataset.key);
      });
    });
  }

  static async #alternarAtivo(event, alvo) {
    const id = alvo.dataset.id;
    const ativos = this.actor.system.ativos.map(a => a.id === id ? { ...a, ativo: a.ativo === false } : a);
    await this.actor.update({ "system.ativos": ativos });
    await this.#sincronizarAuto();
  }

  static async #configurarAtivo(event, alvo) {
    const id = alvo.dataset.id;
    const entrada = this.actor.system.ativos.find(a => a.id === id);
    const def = obterAtivos(this.actor)[entrada?.key];
    if (!entrada || !def?.escolha) return;
    if (def.escolha === "ativo") return Acoes.acaoTrocarEspionagem(this.actor, id);
    const escolha = await Acoes.dialogoEscolha(this.actor, def, entrada);
    if (!escolha) return;
    const ativos = this.actor.system.ativos.map(a => a.id === id ? { ...a, ...escolha } : a);
    await this.actor.update({ "system.ativos": ativos });
    await this.#sincronizarAuto();
  }

  static async #removerAtivo(event, alvo) {
    const id = alvo.dataset.id;
    const s = this.actor.system;
    const entrada = s.ativos.find(a => a.id === id);
    if (!entrada) return;
    const cat = obterAtivos(this.actor);
    const nome = cat[entrada.key]?.nome ?? entrada.key;
    const dependentes = s.ativos
      .filter(a => (cat[a.key]?.prereqAtivos ?? []).includes(entrada.key))
      .map(a => cat[a.key]?.nome ?? a.key);
    const ok = await DialogV2.confirm({
      window: { title: "Remover Ativo" },
      content: `<p>Remover <strong>${escapar(nome)}</strong> do negócio? A vaga poderá ser usada por outro ativo.</p>
        ${dependentes.length ? `<p class="t20b-ruim">Atenção: ${escapar(dependentes.join(", "))} tem este ativo como pré-requisito.</p>` : ""}`
    });
    if (!ok) return;
    await this.actor.update({ "system.ativos": s.ativos.filter(a => a.id !== id) });
    await this.#sincronizarAuto();
  }

  /* ------------------------- Frequentadores ------------------------ */

  static async #adicionarFrequentadorManual() {
    const uuid = this.element.querySelector("#t20n-frequentador-manual")?.value;
    if (!uuid) return ui.notifications.warn("Selecione um personagem para adicionar.");
    const ator = await fromUuid(uuid).catch(() => null);
    if (!ator) return ui.notifications.warn("O personagem selecionado não está mais disponível.");
    await this.#adicionarFrequentador(ator);
  }

  static async #abrirFrequentador(event, alvo) {
    const ator = await obterFrequentador(alvo.dataset.uuid);
    ator?.sheet?.render(true);
  }

  static async #removerFrequentador(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const freq = this.actor.system.frequentadores.find(r => r.uuid === uuid);
    if (!freq) return;
    const ok = await DialogV2.confirm({
      window: { title: "Remover Frequentador" },
      content: `<p>Remover <strong>${escapar(freq.nome ?? uuid)}</strong> do negócio? Os efeitos concedidos serão retirados da ficha.</p>`
    });
    if (!ok) return;
    await removerEfeitos(this.actor, uuid);
    await this.actor.update({
      "system.frequentadores": this.actor.system.frequentadores.filter(r => r.uuid !== uuid)
    });
    await this.#sincronizarAuto();
  }

  static async #alternarFrequentador(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const frequentadores = this.actor.system.frequentadores.map(r =>
      r.uuid === uuid ? { ...r, receberEfeitos: r.receberEfeitos === false } : r
    );
    await this.actor.update({ "system.frequentadores": frequentadores });
    await this.#sincronizarAuto();
  }

  static async #definirDono(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const frequentadores = this.actor.system.frequentadores.map(r => ({
      ...r, dono: r.uuid === uuid ? !r.dono : false
    }));
    await this.actor.update({ "system.frequentadores": frequentadores });
  }

  static async #verEfeitosFrequentador(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const freq = this.actor.system.frequentadores.find(r => r.uuid === uuid);
    if (!freq) return;
    const ator = await obterFrequentador(uuid);

    const efeitos = montarEfeitosPara(this.actor, ator);
    if (!efeitos.length) {
      await DialogV2.wait({
        window: { title: "Benefícios deste frequentador" },
        content: `<p>Nenhum efeito automatizável no momento.</p><p class="notes">Ativos marcados como manuais devem ser aplicados à mão. Altar e Círculo de Poder só valem para conjuradores divinos e arcanos, respectivamente.</p>`,
        buttons: [{ action: "ok", label: "Fechar", default: true }]
      });
      return;
    }

    const outras = caminhosDeOutrasEstruturas(ator);
    const desativadosAtuais = new Set(freq.beneficiosDesativados ?? []);
    const linhas = efeitos.map((efeito, indice) => {
      const uso = efeito.flags?.tormenta20?.onuse;
      const beneficioId = efeito.flags?.[MODULO]?.beneficioId;
      const detalhes = efeito.changes.map(change =>
        `${change.key} ${change.mode === 5 ? "=" : change.mode === 0 ? "custom" : "+"} ${change.value}`
      );
      if (uso && efeito.flags.tormenta20.custo) detalhes.push(`custo ${efeito.flags.tormenta20.custo} PM`);
      const conflito = !uso && efeito.changes
        .map(c => outras.get(c.key))
        .find(Boolean);
      return `<li>
        <label>
          <input type="checkbox" data-beneficio-index="${indice}" ${desativadosAtuais.has(beneficioId) ? "" : "checked"}>
          <span class="t20b-beneficio-info">
            <strong>${escapar(efeito.name.replace("Negócio: ", ""))}</strong>
            ${uso ? "<em>(efeito de uso — janela de rolagem)</em>" : ""}
            <small>${escapar(detalhes.join(" · "))}</small>
            ${conflito ? `<small class="t20b-ruim"><i class="fa-solid fa-triangle-exclamation"></i> Mesmo tipo de bônus de ${escapar(conflito)} — benefícios de estruturas não se acumulam.</small>` : ""}
          </span>
        </label>
      </li>`;
    }).join("");
    const avisoGeral = freq.receberEfeitos === false
      ? `<p class="notification warning"><i class="fa-solid fa-triangle-exclamation"></i> Este frequentador está sem acesso ao negócio. As escolhas serão salvas, mas só terão efeito quando o interruptor for ligado.</p>`
      : "";
    const habilitados = await DialogV2.prompt({
      window: { title: "Benefícios deste frequentador" },
      position: { width: 540 },
      classes: ["tormenta20-bases"],
      content: `${avisoGeral}<ul class="t20b-beneficios-lista">${linhas}</ul><p class="notes">Desmarque um benefício para removê-lo apenas deste frequentador.</p>`,
      ok: {
        label: "Aplicar",
        icon: "fa-solid fa-check",
        callback: (_event, button) => new Set(
          [...button.form.querySelectorAll("input[data-beneficio-index]:checked")]
            .map(input => Number(input.dataset.beneficioIndex))
        )
      }
    }).catch(() => null);
    if (!habilitados) return;

    const idsAtuais = new Set(efeitos.map(e => e.flags?.[MODULO]?.beneficioId).filter(Boolean));
    const preservados = [...desativadosAtuais].filter(id => !idsAtuais.has(id));
    const novosDesativados = efeitos
      .filter((e, indice) => !habilitados.has(indice) && e.flags?.[MODULO]?.beneficioId)
      .map(e => e.flags[MODULO].beneficioId);
    const frequentadores = this.actor.system.frequentadores.map(r =>
      r.uuid === uuid ? { ...r, beneficiosDesativados: [...preservados, ...novosDesativados] } : r
    );
    await this.actor.update({ "system.frequentadores": frequentadores });
    await sincronizarEfeitos(this.actor, { silencioso: true });
    ui.notifications.info(`Benefícios de ${freq.nome ?? "frequentador"} atualizados.`);
  }

  /* ------------------------- Estoque ------------------------------- */

  static #abrirItem(event, alvo) {
    this.actor.items.get(alvo.dataset.id)?.sheet?.render(true);
  }

  static async #excluirItem(event, alvo) {
    const item = this.actor.items.get(alvo.dataset.id);
    if (!item) return;
    const ok = await DialogV2.confirm({
      window: { title: "Excluir Item" },
      content: `<p>Excluir <strong>${escapar(item.name)}</strong> do estoque do negócio?</p>`
    });
    if (!ok) return;
    await item.delete();
  }

  /* ------------------------- Homebrews ----------------------------- */

  static async #criarHomebrew() {
    const cat = obterAtivos(this.actor);
    const datalist = CAMINHOS_SUGERIDOS.map(c => `<option value="${c.key}">${c.rotulo}</option>`).join("");
    const opcoesAtivos = Object.entries(cat)
      .sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"))
      .map(([k, d]) => `<option value="${k}">${escapar(d.nome)}</option>`)
      .join("");
    const linhasEfeito = [0, 1, 2, 3].map(i => `
      <div class="t20b-linha-efeito">
        <input type="text" name="chave${i}" list="t20n-caminhos" placeholder="system.pericias.luta.bonus">
        <select name="modo${i}">
          <option value="2">Somar (+)</option>
          <option value="5">Sobrepor (=)</option>
        </select>
        <input type="text" name="valor${i}" placeholder="1 ou +1" style="width:70px">
      </div>`).join("");

    const dados = await DialogV2.prompt({
      window: { title: "Criar Ativo Homebrew" },
      position: { width: 560 },
      content: `
        <div class="t20b-scroll">
        <datalist id="t20n-caminhos">${datalist}</datalist>
        <div class="form-group"><label>Nome</label><input type="text" name="nome" placeholder="Estufa exótica"></div>
        <div class="form-group"><label>Benefício (texto exibido)</label><input type="text" name="beneficio" placeholder="Você recebe…"></div>
        <div class="form-group"><label>Nível mínimo do negócio</label><input type="number" name="prereqNivel" value="0" min="0" max="${NIVEL_MAXIMO}"></div>
        <div class="form-group"><label>Ativo exigido (opcional)</label><select name="prereqAtivo"><option value="">— nenhum —</option>${opcoesAtivos}</select></div>
        <div class="form-group"><label>Lembrete a cada mês/aventura (opcional)</label><input type="text" name="porAventura" placeholder="Uma vez por aventura, …"></div>
        <fieldset class="t20b-fieldset"><legend>Efeitos Ativos nos frequentadores (opcional)</legend>
          <p class="notes">Use os caminhos do sistema (ex.: <code>system.pericias.luta.bonus</code>, <code>system.attributes.pm.bonus.total</code>). Para modificadores gerais, use valores como <code>+1</code>.</p>
          ${linhasEfeito}
        </fieldset>
        </div>`,
      ok: { label: "Criar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
    }).catch(() => null);
    if (!dados?.nome) return;

    const changes = [];
    for (let i = 0; i < 4; i++) {
      const chave = (dados[`chave${i}`] ?? "").trim();
      const valor = String(dados[`valor${i}`] ?? "").trim();
      if (chave && valor) changes.push({ key: chave, mode: Number(dados[`modo${i}`]) || 2, value: valor });
    }
    const entrada = {
      key: `hb-${foundry.utils.randomID(8)}`,
      nome: dados.nome,
      beneficio: dados.beneficio || dados.nome,
      prereqNivel: Math.clamp(Number(dados.prereqNivel) || 0, 0, NIVEL_MAXIMO) || null,
      prereqAtivos: dados.prereqAtivo ? [dados.prereqAtivo] : [],
      porAventura: dados.porAventura ? `${dados.nome}: ${dados.porAventura}` : null,
      efeito: changes.length ? { changes } : null,
      manual: !changes.length
    };
    await this.actor.update({ "system.homebrew.ativos": [...this.actor.system.homebrew.ativos, entrada] });
    ui.notifications.info(`Homebrew "${dados.nome}" criado — disponível no catálogo (★).`);
  }

  static async #excluirHomebrew(event, alvo) {
    const { key } = alvo.dataset;
    if (this.actor.system.ativos.some(a => a.key === key || a.escolha === key))
      return ui.notifications.error("Remova primeiro o ativo (ou a espionagem) que usa este homebrew.");
    const ok = await DialogV2.confirm({
      window: { title: "Excluir Homebrew" },
      content: "<p>Excluir esta definição homebrew do catálogo do negócio?</p>"
    });
    if (!ok) return;
    await this.actor.update({
      "system.homebrew.ativos": this.actor.system.homebrew.ativos.filter(h => h.key !== key)
    });
  }
}

export function registrarFicha() {
  foundry.documents.collections.Actors.registerSheet(MODULO, NegocioSheet, {
    types: [TIPO_NEGOCIO],
    makeDefault: true,
    label: "Ficha de Negócio (Fim dos Tempos)"
  });
}
