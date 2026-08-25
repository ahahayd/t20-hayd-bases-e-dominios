/**
 * t20-hayd-dominios | data.mjs
 * DataModel do subtipo de ator "t20-hayd-dominios.dominio".
 */
import { TERRENOS, CORTES, POPULARIDADES, UNIDADES, MODULO, obterConstrucoes } from "./catalogo.mjs";

const f = foundry.data.fields;

export class DominioData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      tipo: new f.StringField({ initial: "normal", choices: ["normal", "mistico"] }),
      nivel: new f.NumberField({ initial: 1, min: 0, max: 7, integer: true }),
      regenteUuid: new f.StringField({ initial: "" }),

      terreno: new f.SchemaField({
        tipo: new f.StringField({ initial: "planicie", choices: Object.keys(TERRENOS) }),
        rioOuMar: new f.BooleanField({ initial: false }),
        elementoMistico: new f.BooleanField({ initial: false }),
        racaAfim: new f.BooleanField({ initial: false }),
        nivelDominioIrmao: new f.NumberField({ initial: 0, min: 0, integer: true })
      }),

      corte: new f.SchemaField({
        categoria: new f.StringField({ initial: "inexistente", choices: Object.keys(CORTES) }),
        conselheiros: new f.ArrayField(new f.StringField())
      }),

      popularidade: new f.StringField({ initial: "tolerado", choices: Object.keys(POPULARIDADES) }),
      emRevolta: new f.BooleanField({ initial: false }),

      tesouro: new f.SchemaField({
        lo: new f.NumberField({ initial: 0, min: 0 }),
        historico: new f.ArrayField(new f.ObjectField())
      }),

      construcoes: new f.ArrayField(new f.ObjectField()),
      unidades: new f.ArrayField(new f.ObjectField()),

      /* Definições homebrew: { key: "hb-…", homebrew: true, nome, categoria,
         custo, beneficio, repetivel, fortificacao, rendaFormula, eventoMod,
         efeito: { changes } | null } */
      homebrew: new f.SchemaField({
        construcoes: new f.ArrayField(new f.ObjectField())
      }),

      caravana: new f.SchemaField({
        ativa: new f.BooleanField({ initial: false }),
        dados: new f.NumberField({ initial: 0, min: 0, integer: true }),
        investido: new f.NumberField({ initial: 0, min: 0 })
      }),

      turno: new f.SchemaField({
        numero: new f.NumberField({ initial: 0, min: 0, integer: true }),
        acoesGastas: new f.NumberField({ initial: 0, min: 0, integer: true }),
        governarUsada: new f.BooleanField({ initial: false }),
        mod: new f.NumberField({ initial: 0, integer: true }),
        bloqueado: new f.BooleanField({ initial: false }),
        impostosCobrados: new f.BooleanField({ initial: false }),
        eventoRolado: new f.BooleanField({ initial: false }),
        eventosAtivos: new f.ArrayField(new f.ObjectField())
      }),

      batalha: new f.SchemaField({
        inimigoNome: new f.StringField({ initial: "" }),
        inimigoPoder: new f.NumberField({ initial: 0, min: 0 }),
        inimigoGuerra: new f.NumberField({ initial: 0, integer: true }),
        aliadosPoder: new f.NumberField({ initial: 0, min: 0 })
      }),

      detalhes: new f.SchemaField({
        biography: new f.HTMLField({ initial: "" }),
        notas: new f.HTMLField({ initial: "" })
      })
    };
  }

  /* ---------------------------------------------------------------- */
  prepareDerivedData() {
    const terreno = TERRENOS[this.terreno.tipo] ?? TERRENOS.planicie;
    const corte = CORTES[this.corte.categoria] ?? CORTES.inexistente;
    const pop = POPULARIDADES[this.popularidade] ?? POPULARIDADES.tolerado;

    /* Nível máximo pelo terreno */
    if (this.tipo === "mistico") {
      let potencial = terreno.potencialMagico + (this.terreno.elementoMistico ? 1 : 0);
      this.nivelMaximo = Math.max(1, potencial - (this.terreno.nivelDominioIrmao || 0));
    } else {
      let max = terreno.nivelMaximo;
      if (this.terreno.racaAfim && ["floresta", "subterraneo"].includes(this.terreno.tipo)) max = 6;
      this.nivelMaximo = Math.min(7, max + (this.terreno.rioOuMar ? 1 : 0));
    }

    /* Construções */
    this.maxConstrucoes = 3 * this.nivel;
    const chaves = this.construcoes.map(c => c.key);
    this.temConstrucao = (key) => chaves.includes(key);

    const catalogo = obterConstrucoes({ system: this });

    /* Fortificação: forte 2 (→5 c/ castelo) + paliçada 2 (→5 c/ muralha) */
    let fort = 0;
    if (chaves.includes("forte")) fort += chaves.includes("castelo") ? 5 : 2;
    if (chaves.includes("palicada")) fort += chaves.includes("muralha") ? 5 : 2;
    for (const c of this.construcoes) {
      const def = catalogo[c.key];
      if (def?.homebrew && def.fortificacao) fort += def.fortificacao;
    }
    this.fortificacao = fort;

    /* Modificador nas rolagens de evento (madeireiras/minas/homebrews) */
    this.eventoMod = this.construcoes.reduce((t, c) => t + (catalogo[c.key]?.eventoMod ?? 0), 0);
    this.eventoDuplo = chaves.includes("aqueduto");

    /* Unidades */
    this.poderTotal = this.unidades.reduce((t, u) => {
      const base = UNIDADES[u.key]?.poder ?? 0;
      return t + base * (u.qtd ?? 1);
    }, 0);
    this.manutencaoUnidades = this.unidades.reduce((t, u) => {
      if (u.temporaria) return t;
      return t + (UNIDADES[u.key]?.manutencao ?? 0) * (u.qtd ?? 1);
    }, 0);
    this.manutencaoCorte = corte.manutencao;
    this.manutencaoTotal = this.manutencaoCorte + this.manutencaoUnidades;

    /* Modificadores de ação de domínio */
    this.modCorte = corte.mod;
    this.modPopularidade = pop.mod;
    this.acoesPorTurno = 2 + corte.acoesExtras;
    this.maxConselheiros = corte.conselheiros;

    /* Domínio místico: PM extra = nível² */
    this.pmMistico = this.tipo === "mistico" ? this.nivel * this.nivel : 0;
  }

  /** Modificador total aplicado aos testes de ação de domínio neste turno. */
  get modAcoes() {
    const pop = this.tipo === "mistico" ? 0 : this.modPopularidade;
    return this.modCorte + pop + (this.turno.mod ?? 0);
  }
}

export function registrarDataModel() {
  Object.assign(CONFIG.Actor.dataModels, { [`${MODULO}.dominio`]: DominioData });
  console.debug(`${MODULO} | DataModel "dominio" registrado.`);
}
