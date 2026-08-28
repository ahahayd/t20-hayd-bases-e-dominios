/**
 * tormenta20-bases | sheet.mjs
 * Ficha do ator Base — HayD (ApplicationV2 / Foundry v13).
 */
import {
  MODULO, PORTES, ORDEM_PORTES, TIPOS, TIPOS_CAPITAO, CUSTO_COMODO,
  CAMINHOS_SUGERIDOS, MODOS_EFEITO, rankPorte,
  obterComodos, obterMobilias, labelPericia,
  temaHayd, corDestaqueAtor
} from "./catalogo.mjs";
import * as Acoes from "./acoes.mjs";
import { sincronizarEfeitos, removerEfeitos, obterMorador, montarEfeitosPara } from "./efeitos.mjs";
import { abrirSeletorCor } from "../cor-ficha.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const T = (p) => `modules/${MODULO}/templates/bases/${p}`;

/* Tipos de item do sistema Tormenta20 aceitos no inventário da base. */
const GRUPOS_INVENTARIO = [
  { tipo: "arma", rotulo: "Armas", icone: "fa-hand-fist" },
  { tipo: "equipamento", rotulo: "Equipamentos", icone: "fa-toolbox" },
  { tipo: "consumivel", rotulo: "Consumíveis", icone: "fa-flask" },
  { tipo: "tesouro", rotulo: "Tesouros", icone: "fa-gem" }
];
const TIPOS_ITEM_FISICO = GRUPOS_INVENTARIO.map(g => g.tipo);

export class BaseSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["tormenta20-bases", "base-sheet"],
    position: { width: 920, height: 790 },
    window: { resizable: true, contentClasses: ["t20b-conteudo"] },
    form: { submitOnChange: true },
    actions: {
      trocarAba: BaseSheet.#trocarAba,
      editarImagem: BaseSheet.#editarImagem,
      ajustarCaixa: BaseSheet.#ajustarCaixa,
      limparHistorico: BaseSheet.#limparHistorico,
      sincronizar: BaseSheet.#sincronizar,
      limparEfeitos: BaseSheet.#limparEfeitos,
      aumentarPorte: BaseSheet.#aumentarPorte,
      reformar: BaseSheet.#reformar,
      abrirCatalogoComodos: BaseSheet.#abrirCatalogoComodos,
      repararComodo: BaseSheet.#repararComodo,
      removerComodo: BaseSheet.#removerComodo,
      alternarComodo: BaseSheet.#alternarComodo,
      configurarComodo: BaseSheet.#configurarComodo,
      abrirCatalogoMobilias: BaseSheet.#abrirCatalogoMobilias,
      moverMobilia: BaseSheet.#moverMobilia,
      removerMobilia: BaseSheet.#removerMobilia,
      alternarMobilia: BaseSheet.#alternarMobilia,
      configurarMobilia: BaseSheet.#configurarMobilia,
      abrirMorador: BaseSheet.#abrirMorador,
      adicionarMoradorManual: BaseSheet.#adicionarMoradorManual,
      removerMorador: BaseSheet.#removerMorador,
      alternarMorador: BaseSheet.#alternarMorador,
      verEfeitosMorador: BaseSheet.#verEfeitosMorador,
      abrirItem: BaseSheet.#abrirItem,
      excluirItem: BaseSheet.#excluirItem,
      iniciarAventura: BaseSheet.#iniciarAventura,
      empreendimento: BaseSheet.#empreendimento,
      rolarCriados: BaseSheet.#rolarCriados,
      configurarCor: BaseSheet.#configurarCor,
      criarHomebrew: BaseSheet.#criarHomebrew,
      excluirHomebrew: BaseSheet.#excluirHomebrew
    }
  };

  static PARTS = {
    header:    { template: T("parts/header.hbs") },
    nav:       { template: T("parts/nav.hbs") },
    geral:     { template: T("parts/geral.hbs") },
    comodos:   { template: T("parts/comodos.hbs") },
    mobilias:  { template: T("parts/mobilias.hbs") },
    moradores: { template: T("parts/moradores.hbs") },
    inventario:{ template: T("parts/inventario.hbs") },
    aventura:  { template: T("parts/aventura.hbs") },
    diario:    { template: T("parts/diario.hbs") }
  };

  tabGroups = { primary: "geral" };
  #elementoComDrop = null;

  _getHeaderControls() {
    const controles = super._getHeaderControls();
    if (temaHayd() && (this.actor.isOwner || game.user.isGM)) {
      controles.unshift({
        icon: "fa-solid fa-palette",
        label: "Cor da Ficha",
        action: "configurarCor"
      });
    }
    return controles;
  }

  /* ---------------------------------------------------------------- */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;
    const catC = obterComodos(actor);
    const catM = obterMobilias(actor);

    const abas = [
      { id: "geral", rotulo: "Base", icone: "fa-house-chimney" },
      { id: "comodos", rotulo: "Cômodos", icone: "fa-door-open" },
      { id: "mobilias", rotulo: "Mobílias", icone: "fa-couch" },
      { id: "moradores", rotulo: "Moradores", icone: "fa-users" },
      { id: "inventario", rotulo: "Inventário", icone: "fa-boxes-stacked" },
      { id: "aventura", rotulo: "Aventura", icone: "fa-person-hiking" },
      { id: "diario", rotulo: "Diário", icone: "fa-book-open" }
    ].map(a => ({ ...a, ativa: this.tabGroups.primary === a.id }));

    /* Moradores enriquecidos (resolvidos em paralelo — antes cada um
     * esperava o anterior, a cada render da ficha) */
    const moradores = await Promise.all(s.residentes.map(async (res) => {
      const ator = await obterMorador(res.uuid);
      return {
        ...res,
        nome: ator?.name ?? res.nome ?? "(ator não encontrado)",
        img: ator?.img ?? "icons/svg/mystery-man.svg",
        existe: !!ator,
        recebe: res.receberEfeitos !== false
      };
    }));
    const moradoresUuids = new Set(s.residentes.map(res => res.uuid));
    const personagensDisponiveis = game.actors
      .filter(ator => ator.type === "character"
        && !moradoresUuids.has(ator.uuid)
        && (game.user.isGM || ator.testUserPermission?.(game.user, "OBSERVER")))
      .map(ator => ({ uuid: ator.uuid, nome: ator.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    /* Cômodos enriquecidos */
    const comodos = s.comodos.map(c => {
      const def = catC[c.key] ?? {};
      const mobiliasAqui = s.mobilias
        .filter(m => m.comodoId === c.id)
        .map(m => catM[m.key]?.nome ?? m.key);
      const suiteNomes = (c.suiteResidentes ?? [])
        .map(u => moradores.find(m => m.uuid === u)?.nome)
        .filter(Boolean);
      return {
        ...c,
        nome: def.nome ?? c.key,
        beneficio: def.beneficio ?? "",
        temEfeito: !!(def.efeito?.changes?.length || def.efeitosUso?.length || def.efeito?.escolha || def.escolha === "suite" || c.key === "suite"),
        manual: !!def.manual,
        seguranca: def.seguranca ?? 0,
        capacidade: def.capacidade ?? 1,
        precisaConfig: !!(def.efeito?.escolha || def.escolha),
        escolhaRotulo: def.efeito?.escolha === "pericia" && c.escolha ? labelPericia(c.escolha)
          : def.escolha === "capitao" && c.escolha ? c.escolha
          : null,
        suiteNomes: suiteNomes.join(" & "),
        ehSuite: c.key === "suite" || def.escolha === "suite",
        mobiliasAqui: mobiliasAqui.join(", "),
        homebrew: String(c.key).startsWith("hb-"),
        ativoOn: c.ativo !== false
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    /* Mobílias enriquecidas */
    const mobilias = s.mobilias.map(m => {
      const def = catM[m.key] ?? {};
      const com = s.comodos.find(c => c.id === m.comodoId);
      const localNome = m.comodoId === "exterior" ? "Exterior"
        : com ? (catC[com.key]?.nome ?? com.key) : "—";
      return {
        ...m,
        nome: def.nome ?? m.key,
        beneficio: def.beneficio ?? "",
        preco: def.preco ?? 0,
        localNome,
        comodoDanificado: !!com?.danificado,
        temEfeito: !!(def.efeito || def.efeitoPorLocal || def.efeitosUso?.length || def.efeitosUsoPorLocal || def.efeitosUsoSuite?.length || def.especial === "idolo" || def.especial === "colchao"),
        precisaConfig: def.efeito?.escolha === "pericia",
        escolhaRotulo: m.escolha ? labelPericia(m.escolha) : null,
        homebrew: String(m.key).startsWith("hb-"),
        ativoOn: m.ativo !== false
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    /* Inventário: itens físicos agrupados por tipo */
    const inventario = GRUPOS_INVENTARIO.map(g => ({
      ...g,
      itens: actor.items.filter(i => i.type === g.tipo)
        .map(i => ({
          id: i.id, nome: i.name, img: i.img,
          qtd: i.system.qtd ?? 1,
          precoFmt: Acoes.fmtTS(i.system.preco ?? 0)
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    }));
    const din = s.dinheiro ?? { to: 0, tp: 0, tc: 0 };
    const totalMoedas = Acoes.fmtTS((din.to ?? 0) * 10 + (din.tp ?? 0) + (din.tc ?? 0) / 10);

    /* Segurança: composição */
    const segFontes = [];
    if (s.tipoInfo?.seguranca) segFontes.push(`${s.tipoInfo.nome} +${s.tipoInfo.seguranca}`);
    for (const c of comodos) if (c.seguranca && !c.danificado && c.ativoOn) segFontes.push(`${c.nome} +${c.seguranca}`);
    if (s.gargulas) segFontes.push(`Gárgulas +${s.gargulas * 2}`);
    if (s.seguranca.outros) segFontes.push(`Outros ${s.seguranca.outros >= 0 ? "+" : ""}${s.seguranca.outros}`);

    return Object.assign(context, {
      actor, system: s, abas, moradores, personagensDisponiveis,
      comodos, mobilias, inventario, totalMoedas,
      tipos: Object.entries(TIPOS).map(([k, v]) => ({ key: k, nome: v.nome, selecionado: s.tipo === k })),
      portes: Object.entries(PORTES).map(([k, v]) => ({ key: k, nome: v.nome, selecionado: s.porte === k })),
      tipoAtual: TIPOS[s.tipo],
      porteAtual: PORTES[s.porte],
      segFontes: segFontes.join(" · ") || "nenhuma fonte",
      historico: [...s.caixa.historico].reverse()
        .slice(0, Math.max(1, Number(game.settings.get(MODULO, "basesHistoricoMax")) || 25))
        .map(h => ({
          ...h,
          positivo: (h.delta ?? 0) >= 0,
          deltaFmt: `${(h.delta ?? 0) >= 0 ? "+" : ""}${Number(h.delta).toLocaleString("pt-BR")}`
        })),
      historicoTotal: s.caixa.historico.length,
      ehGM: game.user.isGM,
      caixaFmt: totalMoedas,
      manutencaoFmt: Acoes.fmtTS(s.manutencao),
      homebrewComodos: s.homebrew.comodos,
      homebrewMobilias: s.homebrew.mobilias,
      ehEmpreendimento: s.tipo === "empreendimento",
      temCriados: s.temComodo("ala-dos-criados"),
      lembretes: this.#coletarLembretes(actor, catC, catM),
      campoBiografia: s.schema.getField("detalhes.biography"),
      campoNotas: s.schema.getField("detalhes.notas"),
      biografiaHTML: await this.#enriquecer("biografia", s.detalhes.biography),
      notasHTML: await this.#enriquecer("notas", s.detalhes.notas)
    });
  }

  /* enrichHTML é o item mais caro do contexto (parse completo + resolução
   * de links) e rodava a CADA render, mesmo sem o texto mudar. Cache por
   * campo, chaveado no texto-fonte exato. */
  #cacheEnrich = {};

  async #enriquecer(campo, fonte) {
    const cache = this.#cacheEnrich[campo];
    if (cache && cache.fonte === fonte) return cache.html;
    const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(fonte, { async: true });
    this.#cacheEnrich[campo] = { fonte, html };
    return html;
  }

  #coletarLembretes(actor, catC, catM) {
    const s = actor.system;
    const lista = [];
    for (const c of s.comodos.filter(x => !x.danificado && x.ativo !== false)) {
      const def = catC[c.key];
      if (def?.porAventura) lista.push({ origem: def.nome, texto: def.porAventura });
    }
    for (const m of s.mobilias.filter(x => x.ativo !== false)) {
      const def = catM[m.key];
      if (def?.porAventura) lista.push({ origem: def.nome, texto: def.porAventura });
    }
    if (s.tipo === "residencia") lista.push({ origem: "Residência", texto: "Cada residente pode receber 1 prato especial por aventura" });
    return lista;
  }

  /* ---------------------------------------------------------------- */
  _onRender(context, options) {
    super._onRender(context, options);

    /* Visual padrão do Foundry; tema dark somente com o t20-hayd-ui
     * ativo, com a cor de destaque resolvida como no t20-hayd-ui. */
    const tema = temaHayd();
    this.element.classList.toggle("tema-hayd", tema);
    if (tema) this.element.style.setProperty("--t20b-destaque", corDestaqueAtor(this.actor));
    else this.element.style.removeProperty("--t20b-destaque");

    this.#ativarAba(this.tabGroups.primary);
    /* O AppV2 pode substituir o elemento raiz ao reabrir a ficha. Liga os
     * eventos uma vez em cada elemento, não apenas uma vez na instância. */
    if (this.#elementoComDrop !== this.element) {
      this.element.addEventListener("drop", this.#aoSoltar.bind(this));
      this.element.addEventListener("dragover", ev => ev.preventDefault());
      this.#elementoComDrop = this.element;
    }
    /* Quantidade dos itens do inventário (inputs sem name, fora do submit). */
    for (const inp of this.element.querySelectorAll("input.t20b-inv-qtd")) {
      inp.addEventListener("change", async (ev) => {
        const item = this.actor.items.get(ev.currentTarget.dataset.id);
        if (!item) return;
        await item.update({ "system.qtd": Math.max(0, Math.round(Number(ev.currentTarget.value) || 0)) });
      });
    }
  }

  /** Só itens físicos podem ser guardados no inventário da base. */
  async _onDropItem(event, item) {
    if (item.parent?.uuid !== this.actor.uuid && !TIPOS_ITEM_FISICO.includes(item.type)) {
      ui.notifications.warn("Somente itens físicos (armas, equipamentos, consumíveis e tesouros) podem ser guardados na base.");
      return null;
    }
    return super._onDropItem(event, item);
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
    await this.#adicionarMorador(ator);
  }

  async #adicionarMorador(ator) {
    if (ator.type === `${MODULO}.base-hayd`) return ui.notifications.warn("Uma base não pode morar em outra base.");
    if (this.actor.system.residentes.some(r => r.uuid === ator.uuid))
      return ui.notifications.warn(`${ator.name} já é morador desta base.`);
    const residentes = [...this.actor.system.residentes];
    residentes.push({
      id: foundry.utils.randomID(), uuid: ator.uuid, nome: ator.name,
      receberEfeitos: true, beneficiosDesativados: []
    });
    await this.actor.update({ "system.residentes": residentes });
    ui.notifications.info(`${ator.name} agora mora em ${this.actor.name}.`);
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  /* ------------------------- Ações gerais ------------------------- */

  static #trocarAba(event, alvo) { this.#ativarAba(alvo.dataset.tab); }

  static async #configurarCor() { await abrirSeletorCor(this.actor); }

  static async #adicionarMoradorManual() {
    const seletor = this.element.querySelector("#t20b-morador-manual");
    const uuid = seletor?.value;
    if (!uuid) return ui.notifications.warn("Selecione um personagem para adicionar como morador.");
    const ator = await fromUuid(uuid).catch(() => null);
    if (!ator || ator.type !== "character") {
      return ui.notifications.warn("O personagem selecionado não está mais disponível.");
    }
    await this.#adicionarMorador(ator);
  }

  static #editarImagem() {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image", current: this.actor.img,
      callback: (caminho) => this.actor.update({ img: caminho })
    });
    fp.render(true);
  }

  static async #ajustarCaixa() {
    const dados = await DialogV2.prompt({
      window: { title: "Ajustar Caixa do Grupo" },
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
      content: `<p>Apagar as <strong>${total}</strong> movimentações registradas do Caixa do Grupo?</p>
        <p>O saldo (moedas da base) não é alterado. Esta ação não pode ser desfeita.</p>`
    });
    if (!ok) return;
    await this.actor.update({ "system.caixa.historico": [] });
    ui.notifications.info("Histórico do Caixa do Grupo apagado.");
  }

  static async #sincronizar() { await sincronizarEfeitos(this.actor); }
  static async #limparEfeitos() {
    const n = await removerEfeitos(this.actor);
    ui.notifications.info(`Base: ${n} efeito(s) removido(s) dos moradores.`);
  }

  static async #aumentarPorte() { await Acoes.acaoAumentarPorte(this.actor); }
  static async #reformar() { await Acoes.acaoReformar(this.actor); }
  static async #iniciarAventura() { await Acoes.iniciarAventura(this.actor); }
  static async #empreendimento() { await Acoes.acaoEmpreendimento(this.actor); }
  static async #rolarCriados() { await Acoes.rolarCriados(this.actor); }

  /* ------------------------- Cômodos ------------------------------ */

  static async #abrirCatalogoComodos() {
    const actor = this.actor;
    const catC = obterComodos(actor);
    const cd = 20 + actor.system.maxComodos;
    let html = `<div class="t20b-catalogo"><p>Construir: 1 ação entre aventuras · ${Acoes.fmtTS(CUSTO_COMODO)} · teste (CD ${cd}).</p><ul>`;
    const ordenados = Object.entries(catC).sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"));
    for (const [key, def] of ordenados) {
      const erro = Acoes.validarComodo(actor, key);
      const custo = def.custo ?? CUSTO_COMODO;
      html += `<li class="${erro ? "desabilitada" : ""}">
        <button type="button" data-key="${key}" ${erro ? "disabled" : ""}>
          <strong>${def.nome}${String(key).startsWith("hb-") ? " ★" : ""}</strong>
          <span class="t20b-custo">${Acoes.fmtTS(custo)}</span>
        </button>
        <span class="t20b-beneficio">${def.beneficio}</span>
        ${erro ? `<span class="t20b-erro">${erro}</span>` : ""}
      </li>`;
    }
    html += `</ul></div>`;

    const dialog = new DialogV2({
      window: { title: `Catálogo de Cômodos — ${actor.system.comodosConstruidos}/${actor.system.maxComodos}`, resizable: true },
      position: { width: 640, height: 640 },
      content: html,
      buttons: [{ action: "fechar", label: "Fechar", default: true }]
    });
    await dialog.render(true);
    dialog.element.querySelectorAll("button[data-key]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await dialog.close();
        await Acoes.acaoConstruirComodo(actor, btn.dataset.key);
      });
    });
  }

  static async #repararComodo(event, alvo) { await Acoes.acaoRepararComodo(this.actor, alvo.dataset.id); }

  static async #removerComodo(event, alvo) {
    const id = alvo.dataset.id;
    const com = this.actor.system.comodos.find(c => c.id === id);
    if (!com) return;
    const nome = obterComodos(this.actor)[com.key]?.nome ?? com.key;
    const ok = await DialogV2.confirm({
      window: { title: "Demolir Cômodo" },
      content: `<p>Remover <strong>${nome}</strong>? Mobílias instaladas nele ficarão sem cômodo.</p>`
    });
    if (!ok) return;
    const mobilias = this.actor.system.mobilias.map(m => m.comodoId === id ? { ...m, comodoId: null } : m);
    await this.actor.update({
      "system.comodos": this.actor.system.comodos.filter(c => c.id !== id),
      "system.mobilias": mobilias
    });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #alternarComodo(event, alvo) {
    const id = alvo.dataset.id;
    const comodos = this.actor.system.comodos.map(c => c.id === id ? { ...c, ativo: c.ativo === false } : c);
    await this.actor.update({ "system.comodos": comodos });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #configurarComodo(event, alvo) {
    const id = alvo.dataset.id;
    const com = this.actor.system.comodos.find(c => c.id === id);
    const def = obterComodos(this.actor)[com?.key];
    if (!com || !def) return;

    let conteudo = `<p>${def.beneficio}.</p>`;
    if (def.efeito?.escolha === "pericia") {
      const per = CONFIG?.T20?.pericias ?? {};
      const opcoes = Object.keys(per)
        .map(k => `<option value="${k}" ${com.escolha === k ? "selected" : ""}>${labelPericia(k)}</option>`)
        .join("");
      conteudo += `<div class="form-group"><label>Perícia</label><select name="escolha">${opcoes}</select></div>`;
    } else if (def.escolha === "capitao") {
      const opcoes = TIPOS_CAPITAO
        .map(t => `<option value="${t}" ${com.escolha === t ? "selected" : ""}>${t}</option>`)
        .join("");
      conteudo += `<div class="form-group"><label>Tipo do capitão (parceiro veterano)</label><select name="escolha">${opcoes}</select></div>`;
    } else if (def.escolha === "suite" || com.key === "suite") {
      const atuais = com.suiteResidentes ?? [];
      const opcoes = (i) => [`<option value="">— vago —</option>`,
        ...this.actor.system.residentes.map(r =>
          `<option value="${r.uuid}" ${atuais[i] === r.uuid ? "selected" : ""}>${r.nome ?? r.uuid}</option>`)
      ].join("");
      conteudo += `
        <p class="notes">Até dois moradores (que durmam juntos!) recebem os benefícios desta suíte.</p>
        <div class="form-group"><label>Morador 1</label><select name="m1">${opcoes(0)}</select></div>
        <div class="form-group"><label>Morador 2</label><select name="m2">${opcoes(1)}</select></div>`;
    } else return;

    const dados = await DialogV2.prompt({
      window: { title: def.nome },
      content: conteudo,
      ok: { label: "Salvar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
    }).catch(() => null);
    if (!dados) return;

    const comodos = this.actor.system.comodos.map(c => {
      if (c.id !== id) return c;
      if (dados.m1 !== undefined || dados.m2 !== undefined) {
        const lista = [dados.m1, dados.m2].filter(Boolean);
        return { ...c, suiteResidentes: [...new Set(lista)] };
      }
      return { ...c, escolha: dados.escolha ?? c.escolha };
    });
    await this.actor.update({ "system.comodos": comodos });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  /* ------------------------- Mobílias ------------------------------ */

  static async #abrirCatalogoMobilias() {
    const actor = this.actor;
    const catM = obterMobilias(actor);
    let html = `<div class="t20b-catalogo"><p>Mobílias são itens comuns (compradas, fabricadas ou tesouro). Cada cômodo comporta 1 mobília (Sala de Estar: 3; gárgulas ficam no exterior).</p><ul>`;
    const ordenadas = Object.entries(catM).sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"));
    for (const [key, def] of ordenadas) {
      const erro = Acoes.validarMobilia(actor, key);
      html += `<li class="${erro ? "desabilitada" : ""}">
        <button type="button" data-key="${key}" ${erro ? "disabled" : ""}>
          <strong>${def.nome}${String(key).startsWith("hb-") ? " ★" : ""}</strong>
          <span class="t20b-custo">${Acoes.fmtTS(def.preco ?? 0)}</span>
        </button>
        <span class="t20b-beneficio">${def.beneficio}</span>
        ${erro ? `<span class="t20b-erro">${erro}</span>` : ""}
      </li>`;
    }
    html += `</ul></div>`;

    const dialog = new DialogV2({
      window: { title: "Catálogo de Mobílias", resizable: true },
      position: { width: 640, height: 640 },
      content: html,
      buttons: [{ action: "fechar", label: "Fechar", default: true }]
    });
    await dialog.render(true);
    dialog.element.querySelectorAll("button[data-key]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await dialog.close();
        await Acoes.acaoAdquirirMobilia(actor, btn.dataset.key);
      });
    });
  }

  static async #moverMobilia(event, alvo) { await Acoes.acaoMoverMobilia(this.actor, alvo.dataset.id); }

  static async #removerMobilia(event, alvo) {
    const id = alvo.dataset.id;
    const mob = this.actor.system.mobilias.find(m => m.id === id);
    if (!mob) return;
    const nome = obterMobilias(this.actor)[mob.key]?.nome ?? mob.key;
    const ok = await DialogV2.confirm({
      window: { title: "Remover Mobília" },
      content: `<p>Remover <strong>${nome}</strong> da base?</p>`
    });
    if (!ok) return;
    await this.actor.update({ "system.mobilias": this.actor.system.mobilias.filter(m => m.id !== id) });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #alternarMobilia(event, alvo) {
    const id = alvo.dataset.id;
    const mobilias = this.actor.system.mobilias.map(m => m.id === id ? { ...m, ativo: m.ativo === false } : m);
    await this.actor.update({ "system.mobilias": mobilias });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #configurarMobilia(event, alvo) {
    const id = alvo.dataset.id;
    const mob = this.actor.system.mobilias.find(m => m.id === id);
    const def = obterMobilias(this.actor)[mob?.key];
    if (!mob || def?.efeito?.escolha !== "pericia") return;
    const per = CONFIG?.T20?.pericias ?? {};
    const opcoes = Object.keys(per)
      .map(k => `<option value="${k}" ${mob.escolha === k ? "selected" : ""}>${labelPericia(k)}</option>`)
      .join("");
    const dados = await DialogV2.prompt({
      window: { title: def.nome },
      content: `<p>${def.beneficio}.</p><div class="form-group"><label>Perícia treinada</label><select name="escolha">${opcoes}</select></div>`,
      ok: { label: "Salvar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
    }).catch(() => null);
    if (!dados) return;
    const mobilias = this.actor.system.mobilias.map(m => m.id === id ? { ...m, escolha: dados.escolha } : m);
    await this.actor.update({ "system.mobilias": mobilias });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  /* ------------------------- Moradores ----------------------------- */

  static async #abrirMorador(event, alvo) {
    const ator = await obterMorador(alvo.dataset.uuid);
    ator?.sheet?.render(true);
  }

  static async #removerMorador(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const res = this.actor.system.residentes.find(r => r.uuid === uuid);
    if (!res) return;
    const ok = await DialogV2.confirm({
      window: { title: "Remover Morador" },
      content: `<p>Remover <strong>${res.nome ?? uuid}</strong> da base? Os efeitos concedidos serão retirados da ficha.</p>`
    });
    if (!ok) return;
    await removerEfeitos(this.actor, uuid);
    /* Um único update: lista de moradores + retirada das suítes onde o
     * morador estava (antes eram dois updates = dois re-renders). */
    const comodos = this.actor.system.comodos.map(c => ({
      ...c, suiteResidentes: (c.suiteResidentes ?? []).filter(u => u !== uuid)
    }));
    await this.actor.update({
      "system.residentes": this.actor.system.residentes.filter(r => r.uuid !== uuid),
      "system.comodos": comodos
    });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #alternarMorador(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const residentes = this.actor.system.residentes.map(r =>
      r.uuid === uuid ? { ...r, receberEfeitos: r.receberEfeitos === false } : r
    );
    await this.actor.update({ "system.residentes": residentes });
    if (game.settings.get(MODULO, "basesSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #verEfeitosMorador(event, alvo) {
    const uuid = alvo.dataset.uuid;
    const morador = this.actor.system.residentes.find(r => r.uuid === uuid);
    if (!morador) return;

    const efeitos = montarEfeitosPara(this.actor, uuid);
    if (!efeitos.length) {
      await DialogV2.wait({
        window: { title: "Benefícios deste morador" },
        content: `<p>Nenhum efeito automatizável no momento.</p><p class="notes">Benefícios marcados como manuais nas descrições não geram efeitos e devem ser aplicados à mão.</p>`,
        buttons: [{ action: "ok", label: "Fechar", default: true }]
      });
      return;
    }

    const escapar = valor => foundry.utils.escapeHTML(String(valor ?? ""));
    const desativadosAtuais = new Set(morador.beneficiosDesativados ?? []);
    const linhas = efeitos.map((efeito, indice) => {
      const uso = efeito.flags?.tormenta20?.onuse;
      const beneficioId = efeito.flags?.[MODULO]?.beneficioId;
      const detalhes = efeito.changes.map(change =>
        `${change.key} ${change.mode === 5 ? "=" : change.mode === 0 ? "custom" : "+"} ${change.value}`
      );
      if (uso && efeito.flags.tormenta20.custo) detalhes.push(`custo ${efeito.flags.tormenta20.custo} PM`);
      return `<li>
        <label>
          <input type="checkbox" data-beneficio-index="${indice}" ${desativadosAtuais.has(beneficioId) ? "" : "checked"}>
          <span class="t20b-beneficio-info">
            <strong>${escapar(efeito.name.replace("Base: ", ""))}</strong>
            ${uso ? "<em>(efeito de uso — janela de rolagem)</em>" : ""}
            <small>${escapar(detalhes.join(" · "))}</small>
          </span>
        </label>
      </li>`;
    }).join("");
    const avisoGeral = morador.receberEfeitos === false
      ? `<p class="notification warning"><i class="fa-solid fa-triangle-exclamation"></i> O recebimento de benefícios está desativado para este morador. As escolhas abaixo serão salvas, mas só terão efeito quando o interruptor geral for ligado.</p>`
      : "";
    const habilitados = await DialogV2.prompt({
      window: { title: "Benefícios deste morador" },
      position: { width: 520 },
      classes: ["tormenta20-bases"],
      content: `${avisoGeral}<ul class="t20b-beneficios-lista">${linhas}</ul><p class="notes">Desmarque um benefício para removê-lo apenas deste morador. Benefícios manuais descritos na ficha não aparecem nesta lista.</p>`,
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

    const idsAtuais = new Set(efeitos.map(efeito => efeito.flags?.[MODULO]?.beneficioId).filter(Boolean));
    const preservados = [...desativadosAtuais].filter(id => !idsAtuais.has(id));
    const novosDesativados = efeitos
      .filter((efeito, indice) => !habilitados.has(indice) && efeito.flags?.[MODULO]?.beneficioId)
      .map(efeito => efeito.flags[MODULO].beneficioId);
    const residentes = this.actor.system.residentes.map(residente =>
      residente.uuid === uuid
        ? { ...residente, beneficiosDesativados: [...preservados, ...novosDesativados] }
        : residente
    );
    await this.actor.update({ "system.residentes": residentes });
    await sincronizarEfeitos(this.actor, { silencioso: true });
    ui.notifications.info(`Benefícios de ${morador.nome ?? "morador"} atualizados.`);
  }

  /* ------------------------- Inventário ---------------------------- */

  static #abrirItem(event, alvo) {
    this.actor.items.get(alvo.dataset.id)?.sheet?.render(true);
  }

  static async #excluirItem(event, alvo) {
    const item = this.actor.items.get(alvo.dataset.id);
    if (!item) return;
    const ok = await DialogV2.confirm({
      window: { title: "Excluir Item" },
      content: `<p>Excluir <strong>${item.name}</strong> do inventário da base?</p>`
    });
    if (!ok) return;
    await item.delete();
  }

  /* ------------------------- Homebrews ----------------------------- */

  static async #criarHomebrew(event, alvo) {
    const escopo = alvo.dataset.escopo; // "comodo" | "mobilia"
    const ehComodo = escopo === "comodo";
    const datalist = CAMINHOS_SUGERIDOS
      .map(c => `<option value="${c.key}">${c.rotulo}</option>`)
      .join("");
    const linhasEfeito = [0, 1, 2, 3].map(i => `
      <div class="t20b-linha-efeito">
        <input type="text" name="chave${i}" list="t20b-caminhos" placeholder="system.pericias.luta.bonus">
        <select name="modo${i}">
          <option value="2">Somar (+)</option>
          <option value="5">Sobrepor (=)</option>
        </select>
        <input type="text" name="valor${i}" placeholder="1 ou +1" style="width:70px">
      </div>`).join("");

    const conteudo = `
      <div class="t20b-scroll">
      <datalist id="t20b-caminhos">${datalist}</datalist>
      <div class="form-group"><label>Nome</label><input type="text" name="nome" placeholder="${ehComodo ? "Sala secreta" : "Troféu do dragão"}"></div>
      <div class="form-group"><label>Benefício (texto exibido)</label><input type="text" name="beneficio" placeholder="Os residentes recebem…"></div>
      ${ehComodo
        ? `<div class="form-group"><label>Custo (T$)</label><input type="number" name="custo" value="${CUSTO_COMODO}" min="0"></div>
           <div class="form-group"><label>Segurança concedida</label><input type="number" name="seguranca" value="0"></div>
           <div class="form-group"><label class="t20b-inline"><input type="checkbox" name="repetivel"> Pode ser construído várias vezes</label></div>`
        : `<div class="form-group"><label>Preço (T$)</label><input type="number" name="preco" value="1000" min="0"></div>
           <div class="form-group"><label>Segurança concedida</label><input type="number" name="seguranca" value="0"></div>
           <div class="form-group"><label>Cômodos válidos (chaves separadas por vírgula; vazio = qualquer; "exterior" = fora)</label>
             <input type="text" name="locais" placeholder="sala-de-estar, suite"></div>`}
      <fieldset class="t20b-fieldset"><legend>Efeitos Ativos nos moradores (opcional)</legend>
        <p class="notes">Use os caminhos do sistema (ex.: <code>system.pericias.luta.bonus</code>, <code>system.attributes.pm.bonus.total</code>). Para modificadores gerais, use valores como <code>+1</code>.</p>
        ${linhasEfeito}
      </fieldset>
      </div>`;

    const dados = await DialogV2.prompt({
      window: { title: ehComodo ? "Criar Cômodo Homebrew" : "Criar Mobília Homebrew" },
      position: { width: 560 },
      content: conteudo,
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
      seguranca: Number(dados.seguranca) || 0,
      efeito: changes.length ? { changes } : null,
      manual: !changes.length
    };
    if (ehComodo) {
      entrada.custo = Math.max(0, Number(dados.custo) || 0);
      entrada.repetivel = !!dados.repetivel;
      await this.actor.update({ "system.homebrew.comodos": [...this.actor.system.homebrew.comodos, entrada] });
    } else {
      entrada.preco = Math.max(0, Number(dados.preco) || 0);
      const locais = (dados.locais ?? "").trim();
      entrada.locais = !locais ? null : locais === "exterior" ? "exterior" : locais.split(",").map(x => x.trim()).filter(Boolean);
      await this.actor.update({ "system.homebrew.mobilias": [...this.actor.system.homebrew.mobilias, entrada] });
    }
    ui.notifications.info(`Homebrew "${dados.nome}" criado — disponível no catálogo (★).`);
    console.debug(`${MODULO} | Homebrew criado:`, entrada);
  }

  static async #excluirHomebrew(event, alvo) {
    const { escopo, key } = alvo.dataset;
    const campo = escopo === "comodo" ? "comodos" : "mobilias";
    const emUso = escopo === "comodo"
      ? this.actor.system.comodos.some(c => c.key === key)
      : this.actor.system.mobilias.some(m => m.key === key);
    if (emUso) return ui.notifications.error("Remova primeiro as instâncias construídas/instaladas deste homebrew.");
    const ok = await DialogV2.confirm({
      window: { title: "Excluir Homebrew" },
      content: "<p>Excluir esta definição homebrew do catálogo da base?</p>"
    });
    if (!ok) return;
    await this.actor.update({
      [`system.homebrew.${campo}`]: this.actor.system.homebrew[campo].filter(h => h.key !== key)
    });
  }
}

export function registrarFicha() {
  foundry.documents.collections.Actors.registerSheet(MODULO, BaseSheet, {
    types: [`${MODULO}.base-hayd`],
    makeDefault: true,
    label: "Ficha de Base (Heróis de Arton)"
  });
  console.debug(`${MODULO} | Ficha de Base registrada.`);
}
