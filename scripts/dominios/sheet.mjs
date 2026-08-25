/**
 * t20-hayd-dominios | sheet.mjs
 * Ficha do ator Domínio (ApplicationV2 / Foundry v13).
 */
import {
  MODULO, TERRENOS, CORTES, ORDEM_CORTES, CONSELHEIROS, POPULARIDADES,
  ORDEM_POPULARIDADE, IMPOSTOS, CATEGORIAS_CONSTRUCAO,
  UNIDADES, ACOES, labelPericia, temaHayd, corDominio,
  obterConstrucoes, caminhosSugeridos
} from "./catalogo.mjs";
import * as Acoes from "./acoes.mjs";
import { sincronizarEfeitos, removerEfeitos, obterRegente } from "./efeitos.mjs";
import { criarTabelas } from "./tabelas.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { DialogV2 } = foundry.applications.api;

const T = (p) => `modules/${MODULO}/templates/dominios/${p}`;

export class DominioSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["t20-hayd-dominios", "dominio-sheet"],
    position: { width: 900, height: 780 },
    window: { resizable: true, contentClasses: ["t20d-conteudo"] },
    form: { submitOnChange: true },
    actions: {
      trocarAba: DominioSheet.#trocarAba,
      editarImagem: DominioSheet.#editarImagem,
      abrirRegente: DominioSheet.#abrirRegente,
      removerRegente: DominioSheet.#removerRegente,
      sincronizarEfeitos: DominioSheet.#sincronizarEfeitos,
      removerEfeitos: DominioSheet.#removerEfeitos,
      iniciarTurno: DominioSheet.#iniciarTurno,
      rolarEvento: DominioSheet.#rolarEvento,
      cobrarImpostos: DominioSheet.#cobrarImpostos,
      encerrarTurno: DominioSheet.#encerrarTurno,
      acaoDominio: DominioSheet.#acaoDominio,
      resolverEvento: DominioSheet.#resolverEvento,
      resolverEventoManual: DominioSheet.#resolverEventoManual,
      abrirCatalogo: DominioSheet.#abrirCatalogo,
      construir: DominioSheet.#construir,
      removerConstrucao: DominioSheet.#removerConstrucao,
      alternarEfeito: DominioSheet.#alternarEfeito,
      configurarConstrucao: DominioSheet.#configurarConstrucao,
      criarHomebrew: DominioSheet.#criarHomebrew,
      excluirHomebrew: DominioSheet.#excluirHomebrew,
      recrutar: DominioSheet.#recrutar,
      removerUnidade: DominioSheet.#removerUnidade,
      ajustarTesouro: DominioSheet.#ajustarTesouro,
      rolarBatalha: DominioSheet.#rolarBatalha,
      prepararBatalhaBandidos: DominioSheet.#prepararBatalhaBandidos,
      criarTabelas: DominioSheet.#criarTabelas
    }
  };

  static PARTS = {
    header:      { template: T("parts/header.hbs") },
    nav:         { template: T("parts/nav.hbs") },
    geral:       { template: T("parts/geral.hbs") },
    construcoes: { template: T("parts/construcoes.hbs") },
    unidades:    { template: T("parts/unidades.hbs") },
    turno:       { template: T("parts/turno.hbs") },
    batalha:     { template: T("parts/batalha.hbs") },
    diario:      { template: T("parts/diario.hbs") },
    ajuda:       { template: T("parts/ajuda.hbs") }
  };

  tabGroups = { primary: "geral" };

  /* ---------------------------------------------------------------- */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;

    const regente = await obterRegente(actor);

    const abas = [
      { id: "geral", rotulo: "Domínio", icone: "fa-chess-rook" },
      { id: "construcoes", rotulo: "Construções", icone: "fa-hammer" },
      { id: "unidades", rotulo: "Tropas", icone: "fa-shield-halved" },
      { id: "turno", rotulo: "Turno", icone: "fa-hourglass-half" },
      { id: "batalha", rotulo: "Batalha", icone: "fa-swords" },
      { id: "diario", rotulo: "Diário", icone: "fa-book-open" },
      { id: "ajuda", rotulo: "Regras", icone: "fa-circle-question" }
    ].map(a => ({ ...a, ativa: this.tabGroups.primary === a.id }));

    /* Construções instaladas, com dados do catálogo (oficial + homebrews) */
    const catalogo = obterConstrucoes(actor);
    const construcoes = s.construcoes.map(c => {
      const def = catalogo[c.key] ?? {};
      return {
        ...c,
        nome: def.nome ?? c.key,
        homebrew: !!def.homebrew,
        beneficio: def.beneficio ?? "",
        categoria: CATEGORIAS_CONSTRUCAO[def.categoria]?.nome ?? "",
        temEfeito: !!def.efeito,
        precisaEscolha: def.efeito?.escolha === "pericia",
        escolhaRotulo: c.escolha ? labelPericia(c.escolha) : null,
        renda: !!def.renda,
        fortificacao: def.fortificacao ?? 0
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    /* Definições homebrew do domínio (catálogo ★) */
    const homebrewConstrucoes = s.homebrew.construcoes.map(hb => ({
      ...hb,
      categoriaNome: CATEGORIAS_CONSTRUCAO[hb.categoria]?.nome ?? hb.categoria,
      temEfeito: !!hb.efeito
    })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    /* Unidades */
    const unidades = s.unidades.map(u => {
      const def = UNIDADES[u.key] ?? {};
      return { ...u, ...def, nome: def.nome ?? u.key, poderTotal: (def.poder ?? 0) * (u.qtd ?? 1) };
    });

    /* Pendências de evento com botões de perícia */
    const pendencias = s.turno.eventosAtivos.map(e => ({
      ...e,
      botoesPericia: (e.pericias ?? []).map(p => ({ key: p, rotulo: labelPericia(p) })),
      ehBandidos: e.key === "bandidos"
    }));

    /* Conselheiros configuráveis */
    const slotsConselheiros = [];
    for (let i = 0; i < s.maxConselheiros; i++) {
      slotsConselheiros.push({
        indice: i,
        numero: i + 1,
        valor: s.corte.conselheiros[i] ?? "",
        opcoes: Object.entries(CONSELHEIROS).map(([k, v]) => ({
          key: k, rotulo: `${v.nome} (${labelPericia(v.pericia)})`, selecionado: s.corte.conselheiros[i] === k
        }))
      });
    }

    const impostosNivel = IMPOSTOS[s.nivel] ?? IMPOSTOS[1];

    return Object.assign(context, {
      actor, system: s,
      abas,
      regente: regente ? { nome: regente.name, img: regente.img, uuid: regente.uuid } : null,
      mistico: s.tipo === "mistico",
      construcoes, homebrewConstrucoes, unidades, pendencias, slotsConselheiros,
      terrenos: Object.entries(TERRENOS).map(([k, v]) => ({ key: k, nome: v.nome, selecionado: s.terreno.tipo === k })),
      cortes: Object.entries(CORTES).map(([k, v]) => ({ key: k, nome: v.nome, selecionado: s.corte.categoria === k })),
      popularidades: Object.entries(POPULARIDADES).map(([k, v]) => ({ key: k, nome: v.nome, selecionado: s.popularidade === k })),
      corteAtual: CORTES[s.corte.categoria],
      popularidadeAtual: POPULARIDADES[s.popularidade],
      terrenoAtual: TERRENOS[s.terreno.tipo],
      impostosNivel,
      historico: s.tesouro.historico.slice(-25).reverse().map(h => ({
        ...h,
        positivo: (h.delta ?? 0) >= 0,
        deltaFmt: `${(h.delta ?? 0) >= 0 ? "+" : ""}${h.delta}`
      })),
      acoesRestantes: Math.max(0, s.acoesPorTurno - s.turno.acoesGastas),
      ehGM: game.user.isGM,
      campoBiografia: this.actor.system.schema.getField("detalhes.biography"),
      campoNotas: this.actor.system.schema.getField("detalhes.notas"),
      biografiaHTML: await this.#enriquecer("biografia", s.detalhes.biography),
      notasHTML: await this.#enriquecer("notas", s.detalhes.notas)
    });
  }

  /* enrichHTML (parse + resolução de links) é o passo mais caro do
   * contexto e rodava a CADA render — a ficha usa submitOnChange, então
   * qualquer edição re-renderiza. Cache por campo, chaveado no fonte. */
  #cacheEnrich = {};

  async #enriquecer(campo, fonte) {
    const cache = this.#cacheEnrich[campo];
    if (cache && cache.fonte === fonte) return cache.html;
    const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(fonte, { async: true });
    this.#cacheEnrich[campo] = { fonte, html };
    return html;
  }

  /* ---------------------------------------------------------------- */
  #elementoComDrop = null;

  _onRender(context, options) {
    super._onRender(context, options);
    const tema = temaHayd();
    this.element.classList.toggle("tema-hayd", tema);
    /* Cor de destaque: segue a ficha do regente (t20-hayd-ui) ou a cor
     * padrão configurável do t20-hayd-ui. */
    if (tema) this.element.style.setProperty("--t20d-destaque", corDominio(this.actor));
    else this.element.style.removeProperty("--t20d-destaque");
    this.#ativarAba(this.tabGroups.primary);

    /* Drag & drop do regente (apenas uma vez por ELEMENTO da janela —
     * o AppV2 cria um element novo a cada reabertura; a flag antiga
     * nunca resetava e o drop parava de funcionar na segunda abertura). */
    if (this.#elementoComDrop !== this.element) {
      this.element.addEventListener("drop", this.#aoSoltar.bind(this));
      this.element.addEventListener("dragover", ev => ev.preventDefault());
      this.#elementoComDrop = this.element;
    }
  }

  #ativarAba(id) {
    this.tabGroups.primary = id;
    for (const sec of this.element.querySelectorAll("section.t20d-aba")) {
      sec.classList.toggle("ativa", sec.dataset.tab === id);
    }
    for (const nav of this.element.querySelectorAll(".t20d-nav [data-tab]")) {
      nav.classList.toggle("ativa", nav.dataset.tab === id);
    }
  }

  async #aoSoltar(event) {
    let dados;
    try {
      dados = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch { return; }
    if (dados?.type !== "Actor" || !dados.uuid) return;
    event.preventDefault();
    const ator = await fromUuid(dados.uuid);
    if (!(ator instanceof Actor)) return;
    if (ator.uuid === this.actor.uuid) return;
    await this.actor.update({ "system.regenteUuid": ator.uuid });
    ui.notifications.info(`${ator.name} agora é o regente de ${this.actor.name}.`);
    console.debug(`${MODULO} | Regente vinculado: ${ator.uuid}`);
  }

  /* ------------------------- Ações da ficha ----------------------- */

  static #trocarAba(event, alvo) { this.#ativarAba(alvo.dataset.tab); }

  static #editarImagem(event, alvo) {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.actor.img,
      callback: (caminho) => this.actor.update({ img: caminho })
    });
    fp.render(true);
  }

  static async #abrirRegente() {
    const regente = await obterRegente(this.actor);
    regente?.sheet?.render(true);
  }

  static async #removerRegente() {
    const ok = await DialogV2.confirm({
      window: { title: "Remover Regente" },
      content: "<p>Remover o vínculo com o regente? Os efeitos do domínio serão retirados da ficha dele.</p>"
    });
    if (!ok) return;
    await removerEfeitos(this.actor);
    await this.actor.update({ "system.regenteUuid": "" });
  }

  static async #sincronizarEfeitos() { await sincronizarEfeitos(this.actor); }
  static async #removerEfeitos() { await removerEfeitos(this.actor); }

  static async #iniciarTurno() { await Acoes.iniciarTurno(this.actor); }
  static async #rolarEvento() { await Acoes.rolarEvento(this.actor); }
  static async #encerrarTurno() {
    const ok = await DialogV2.confirm({
      window: { title: "Encerrar Turno" },
      content: "<p>Encerrar o turno? Pendências não resolvidas sofrerão as consequências e os camponeses convocados dispersarão.</p>"
    });
    if (ok) await Acoes.encerrarTurno(this.actor);
  }

  static async #cobrarImpostos() {
    const s = this.actor.system;
    if (s.tipo === "mistico" || s.emRevolta) return Acoes.cobrarImpostos(this.actor, "medios");
    const tab = IMPOSTOS[s.nivel] ?? IMPOSTOS[1];
    const faixa = await DialogV2.wait({
      window: { title: "Etapa 2: Impostos" },
      content: `<p>Escolha a carga tributária (nível ${s.nivel} — ${tab.descricao}):</p>
        <p><em>Baixos aumentam a popularidade; altos a diminuem.</em></p>`,
      buttons: [
        { action: "baixos", label: `Baixos (${tab.baixos} LO)` },
        { action: "medios", label: `Médios (${tab.medios} LO)`, default: true },
        { action: "altos", label: `Altos (${tab.altos} LO)` },
        { action: "cancelar", label: "Cancelar" }
      ]
    });
    if (!faixa || faixa === "cancelar") return;
    await Acoes.cobrarImpostos(this.actor, faixa);
  }

  static async #acaoDominio(event, alvo) {
    const acao = alvo.dataset.acao;
    switch (acao) {
      case "aumentarCorte": return Acoes.acaoAumentarCorte(this.actor, event);
      case "convocar": return Acoes.acaoConvocarCamponeses(this.actor);
      case "extorquir": return Acoes.acaoExtorquir(this.actor, event);
      case "festival": return Acoes.acaoFestival(this.actor, event);
      case "financas": return Acoes.acaoFinancas(this.actor, event);
      case "governar": return Acoes.acaoGovernar(this.actor, event);
      case "caravana": return Acoes.acaoCaravana(this.actor);
      case "construir": {
        this.#ativarAba("construcoes");
        return DominioSheet.#abrirCatalogo.call(this);
      }
      case "recrutar": {
        this.#ativarAba("unidades");
        return DominioSheet.#recrutar.call(this);
      }
    }
  }

  static async #resolverEvento(event, alvo) {
    await Acoes.resolverEvento(this.actor, alvo.dataset.id, alvo.dataset.pericia, event);
  }

  static async #resolverEventoManual(event, alvo) {
    await Acoes.resolverEventoManual(this.actor, alvo.dataset.id);
  }

  static async #prepararBatalhaBandidos(event, alvo) {
    const s = this.actor.system;
    const poder = new Roll(`2d4 + ${s.nivel}`);
    await poder.evaluate();
    const guerra = new Roll("2d4+5");
    await guerra.evaluate();
    await this.actor.update({
      "system.batalha.inimigoNome": "Bandidos",
      "system.batalha.inimigoPoder": poder.total,
      "system.batalha.inimigoGuerra": guerra.total
    });
    await Acoes.cartao(this.actor, "Bandidos",
      `<p>Os bandidos reúnem Poder <strong>${poder.total}</strong> e um líder com Guerra <strong>+${guerra.total}</strong>. Resolva na aba Batalha (custa uma ação de domínio) e, ao vencer, marque a pendência como resolvida.</p>`,
      { rolls: [poder, guerra] });
    this.#ativarAba("batalha");
  }

  /* ------------------------- Construções -------------------------- */

  static async #abrirCatalogo() {
    const s = this.actor.system;
    const grupos = {};
    for (const [key, def] of Object.entries(obterConstrucoes(this.actor))) {
      const erro = Acoes.validarConstrucao(this.actor, key);
      const cat = CATEGORIAS_CONSTRUCAO[def.categoria]?.nome ?? "Outras";
      grupos[cat] ??= [];
      grupos[cat].push({ key, ...def, erro, cd: 20 + s.nivel });
    }
    let html = `<div class="t20d-catalogo${temaHayd() ? " tema-hayd" : ""}"${temaHayd() ? ` style="--t20d-destaque: ${corDominio(this.actor)}"` : ""}>`;
    for (const [cat, lista] of Object.entries(grupos)) {
      html += `<h3>${cat} <small>(teste de ${cat}, CD ${20 + s.nivel})</small></h3><ul>`;
      for (const c of lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
        const desabilitada = c.erro ? "desabilitada" : "";
        const titulo = c.erro ?? `${c.beneficio}. Custo ${c.custo} LO.`;
        html += `<li class="${desabilitada}" title="${titulo.replaceAll('"', "&quot;")}">
          <button type="button" data-key="${c.key}" ${c.erro ? "disabled" : ""}>
            <strong>${c.nome}${c.homebrew ? " ★" : ""}</strong> <span class="t20d-custo">${c.custo} LO</span>
          </button>
          <span class="t20d-beneficio">${c.beneficio}</span>
          ${c.erro ? `<span class="t20d-erro">${c.erro}</span>` : ""}
        </li>`;
      }
      html += `</ul>`;
    }
    html += `</div>`;

    const dialog = new DialogV2({
      window: { title: `Catálogo de Construções — ${s.construcoes.length}/${s.maxConstrucoes}`, resizable: true },
      position: { width: 620, height: 640 },
      content: html,
      buttons: [{ action: "fechar", label: "Fechar", default: true }]
    });
    await dialog.render(true);
    dialog.element.querySelectorAll(".t20d-catalogo button[data-key]").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        await dialog.close();
        await Acoes.acaoConstruir(this.actor, btn.dataset.key, ev);
      });
    });
  }

  static async #construir(event, alvo) {
    await Acoes.acaoConstruir(this.actor, alvo.dataset.key, event);
  }

  static async #removerConstrucao(event, alvo) {
    const id = alvo.dataset.id;
    const entrada = this.actor.system.construcoes.find(c => c.id === id);
    if (!entrada) return;
    const nome = obterConstrucoes(this.actor)[entrada.key]?.nome ?? entrada.key;
    const ok = await DialogV2.confirm({
      window: { title: "Demolir Construção" },
      content: `<p>Remover <strong>${nome}</strong> do domínio?</p>`
    });
    if (!ok) return;
    await this.actor.update({ "system.construcoes": this.actor.system.construcoes.filter(c => c.id !== id) });
    await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #alternarEfeito(event, alvo) {
    const id = alvo.dataset.id;
    const construcoes = this.actor.system.construcoes.map(c =>
      c.id === id ? { ...c, efeitoAtivo: c.efeitoAtivo === false } : c
    );
    await this.actor.update({ "system.construcoes": construcoes });
    if (game.settings.get(MODULO, "dominiosSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  static async #configurarConstrucao(event, alvo) {
    const id = alvo.dataset.id;
    const entrada = this.actor.system.construcoes.find(c => c.id === id);
    const def = obterConstrucoes(this.actor)[entrada?.key];
    if (!def?.efeito?.escolha) return;

    const pericias = CONFIG?.T20?.pericias ?? {};
    const opcoes = Object.entries(pericias)
      .map(([k, v]) => `<option value="${k}" ${entrada.escolha === k ? "selected" : ""}>${v.label ?? k}</option>`)
      .join("");
    const dados = await DialogV2.prompt({
      window: { title: def.nome },
      content: `<p>${def.beneficio}.</p>
        <div class="form-group"><label>Perícia</label><select name="pericia">${opcoes}</select></div>`,
      ok: { label: "Salvar", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
    }).catch(() => null);
    if (!dados) return;

    const construcoes = this.actor.system.construcoes.map(c =>
      c.id === id ? { ...c, escolha: dados.pericia } : c
    );
    await this.actor.update({ "system.construcoes": construcoes });
    if (game.settings.get(MODULO, "dominiosSincronizarAuto")) await sincronizarEfeitos(this.actor, { silencioso: true });
  }

  /* ------------------------- Homebrews ----------------------------- */

  static async #criarHomebrew() {
    const datalist = caminhosSugeridos()
      .map(c => `<option value="${c.key}">${c.rotulo}</option>`)
      .join("");
    const categorias = Object.entries(CATEGORIAS_CONSTRUCAO)
      .map(([k, v]) => `<option value="${k}">${v.nome} (teste de ${labelPericia(v.pericia)})</option>`)
      .join("");
    const linhasEfeito = [0, 1, 2, 3].map(i => `
      <div class="t20d-linha-efeito">
        <input type="text" name="chave${i}" list="t20d-caminhos" placeholder="system.pericias.luta.bonus">
        <select name="modo${i}">
          <option value="2">Somar (+)</option>
          <option value="5">Sobrepor (=)</option>
        </select>
        <input type="text" name="valor${i}" placeholder="1 ou +1" style="width:70px">
      </div>`).join("");

    const conteudo = `
      <div class="t20d-scroll">
      <datalist id="t20d-caminhos">${datalist}</datalist>
      <div class="form-group"><label>Nome</label><input type="text" name="nome" placeholder="Observatório Astronômico"></div>
      <div class="form-group"><label>Categoria (define a perícia do teste de Construir)</label>
        <select name="categoria">${categorias}</select></div>
      <div class="form-group"><label>Benefício (texto exibido)</label><input type="text" name="beneficio" placeholder="O regente recebe…"></div>
      <div class="form-group"><label>Custo (LO)</label><input type="number" name="custo" value="5" min="0"></div>
      <div class="form-group"><label class="t20d-inline"><input type="checkbox" name="repetivel"> Pode ser erguida várias vezes</label></div>
      <div class="form-group"><label>Fortificação concedida</label><input type="number" name="fortificacao" value="0" min="0"></div>
      <div class="form-group"><label>Renda por turno (fórmula; vazio = nenhuma. Ex.: 1d6, 1d8-2)</label>
        <input type="text" name="renda" placeholder="1d6"></div>
      <div class="form-group"><label>Modificador nas rolagens de evento (%; ex.: -10)</label>
        <input type="number" name="eventoMod" value="0" step="5"></div>
      <fieldset class="t20d-fieldset"><legend>Efeitos Ativos no regente (opcional)</legend>
        <p class="notes">Use os caminhos do sistema (ex.: <code>system.pericias.luta.bonus</code>, <code>system.attributes.pm.bonus.total</code>). Para modificadores gerais, use valores como <code>+1</code>.</p>
        ${linhasEfeito}
      </fieldset>
      </div>`;

    const dados = await DialogV2.prompt({
      window: { title: "Criar Construção Homebrew" },
      position: { width: 560 },
      content: conteudo,
      ok: { label: "Criar", callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
    }).catch(() => null);
    if (!dados?.nome) return;

    const renda = String(dados.renda ?? "").trim();
    if (renda && !Roll.validate(renda))
      return ui.notifications.error(`Fórmula de renda inválida: "${renda}".`);

    const changes = [];
    for (let i = 0; i < 4; i++) {
      const chave = (dados[`chave${i}`] ?? "").trim();
      const valor = String(dados[`valor${i}`] ?? "").trim();
      if (chave && valor) changes.push({ key: chave, mode: Number(dados[`modo${i}`]) || 2, value: valor });
    }

    const entrada = {
      key: `hb-${foundry.utils.randomID(8)}`,
      homebrew: true,
      nome: dados.nome,
      categoria: dados.categoria,
      beneficio: dados.beneficio || dados.nome,
      custo: Math.max(0, Number(dados.custo) || 0),
      repetivel: !!dados.repetivel,
      fortificacao: Math.max(0, Number(dados.fortificacao) || 0),
      rendaFormula: renda || null,
      renda: !!renda,
      eventoMod: Number(dados.eventoMod) || 0,
      efeito: changes.length ? { changes } : null
    };
    await this.actor.update({ "system.homebrew.construcoes": [...this.actor.system.homebrew.construcoes, entrada] });
    ui.notifications.info(`Homebrew "${dados.nome}" criado — disponível no catálogo de construções (★).`);
    console.debug(`${MODULO} | Homebrew criado:`, entrada);
  }

  static async #excluirHomebrew(event, alvo) {
    const key = alvo.dataset.key;
    if (this.actor.system.construcoes.some(c => c.key === key))
      return ui.notifications.error("Demola primeiro as instâncias erguidas desta construção homebrew.");
    const ok = await DialogV2.confirm({
      window: { title: "Excluir Homebrew" },
      content: "<p>Excluir esta definição homebrew do catálogo do domínio?</p>"
    });
    if (!ok) return;
    await this.actor.update({
      "system.homebrew.construcoes": this.actor.system.homebrew.construcoes.filter(h => h.key !== key)
    });
  }

  /* --------------------------- Unidades --------------------------- */

  static async #recrutar() {
    const s = this.actor.system;
    let linhas = "";
    for (const [key, def] of Object.entries(UNIDADES)) {
      if (key === "camponeses") continue;
      const liberada = !def.construcao || s.temConstrucao(def.construcao);
      const req = def.construcao ? obterConstrucoes(this.actor)[def.construcao]?.nome : "—";
      linhas += `<tr class="${liberada ? "" : "desabilitada"}">
        <td><strong>${def.nome}</strong><br><small>Requer: ${req}</small></td>
        <td>${def.custo} LO</td><td>${def.manutencao} LO</td><td>${def.poder}</td>
        <td><input type="number" name="${key}" value="0" min="0" ${liberada ? "" : "disabled"} style="width:60px"></td>
      </tr>`;
    }
    const dados = await DialogV2.prompt({
      window: { title: "Recrutar Tropas" },
      position: { width: 520 },
      content: `<p>Máximo de <strong>${s.nivel}</strong> unidade(s) por ação (nível do domínio). Sem teste.</p>
        <table class="t20d-tabela">
          <tr><th>Unidade</th><th>Custo</th><th>Manut./turno</th><th>Poder</th><th>Qtd.</th></tr>
          ${linhas}
        </table>`,
      ok: { label: "Recrutar", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
    }).catch(() => null);
    if (!dados) return;
    const escolhas = {};
    for (const [k, v] of Object.entries(dados)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n > 0) escolhas[k] = n;
    }
    if (Object.keys(escolhas).length) await Acoes.acaoRecrutar(this.actor, escolhas);
  }

  static async #removerUnidade(event, alvo) {
    const id = alvo.dataset.id;
    await this.actor.update({ "system.unidades": this.actor.system.unidades.filter(u => u.id !== id) });
  }

  /* --------------------------- Tesouro ----------------------------- */

  static async #ajustarTesouro(event, alvo) {
    const dados = await DialogV2.prompt({
      window: { title: "Ajustar Tesouro" },
      content: `<div class="form-group"><label>Valor (LO; negativo para gastar)</label>
        <input type="number" name="valor" value="0" step="0.25"></div>
        <div class="form-group"><label>Descrição</label>
        <input type="text" name="desc" value="Ajuste manual"></div>`,
      ok: { label: "Aplicar", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
    }).catch(() => null);
    if (!dados || !Number(dados.valor)) return;
    await Acoes.movimentarTesouro(this.actor, dados.desc || "Ajuste manual", Number(dados.valor));
  }

  /* --------------------------- Batalha ----------------------------- */

  static async #rolarBatalha(event) { await Acoes.rolarBatalha(this.actor, event); }

  static async #criarTabelas() { await criarTabelas(); }
}

export function registrarFicha() {
  foundry.documents.collections.Actors.registerSheet(MODULO, DominioSheet, {
    types: [`${MODULO}.dominio`],
    makeDefault: true,
    label: "Ficha de Domínio (Heróis de Arton)"
  });
  console.debug(`${MODULO} | Ficha de Domínio registrada.`);
}
