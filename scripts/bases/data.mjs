/**
 * tormenta20-bases | data.mjs
 * DataModel do subtipo de ator "tormenta20-bases.base-hayd".
 */
import {
  MODULO, PORTES, ORDEM_PORTES, TIPOS, rankPorte,
  obterComodos, obterMobilias
} from "./catalogo.mjs";

const f = foundry.data.fields;

export class BaseData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      tipo: new f.StringField({ initial: "residencia", choices: Object.keys(TIPOS) }),
      porte: new f.StringField({ initial: "minima", choices: Object.keys(PORTES) }),
      descricaoFisica: new f.StringField({ initial: "" }),

      seguranca: new f.SchemaField({
        outros: new f.NumberField({ initial: 0, integer: true })
      }),

      caixa: new f.SchemaField({
        ts: new f.NumberField({ initial: 0, min: 0 }),
        historico: new f.ArrayField(new f.ObjectField())
      }),

      /* Moedas físicas guardadas na base (TO = T$ 10 · TC = T$ 0,1). */
      dinheiro: new f.SchemaField({
        to: new f.NumberField({ initial: 0, min: 0, integer: true }),
        tp: new f.NumberField({ initial: 0, min: 0, integer: true }),
        tc: new f.NumberField({ initial: 0, min: 0, integer: true })
      }),

      /* { id, uuid, receberEfeitos, nota } */
      residentes: new f.ArrayField(new f.ObjectField()),

      /* { id, key, danificado, ativo, escolha, suiteResidentes: [uuid, uuid] } */
      comodos: new f.ArrayField(new f.ObjectField()),

      /* { id, key, comodoId | "exterior", ativo, escolha } */
      mobilias: new f.ArrayField(new f.ObjectField()),

      homebrew: new f.SchemaField({
        comodos: new f.ArrayField(new f.ObjectField()),
        mobilias: new f.ArrayField(new f.ObjectField())
      }),

      aventura: new f.SchemaField({
        numero: new f.NumberField({ initial: 0, min: 0, integer: true }),
        manutencaoPaga: new f.BooleanField({ initial: false })
      }),

      detalhes: new f.SchemaField({
        biography: new f.HTMLField({ initial: "" }),
        notas: new f.HTMLField({ initial: "" })
      })
    };
  }

  /* ---------------------------------------------------------------- */
  prepareDerivedData() {
    /* Stub de atributos: itens do sistema (armas etc.) guardados no
     * inventário da base consultam actor.system.atributos ao preparar
     * seus rótulos; sem isso a preparação do ator quebraria. */
    this.atributos ??= Object.fromEntries(
      ["for", "des", "con", "int", "sab", "car"].map(k => [k, { value: 0 }])
    );

    const porte = PORTES[this.porte] ?? PORTES.minima;
    const tipo = TIPOS[this.tipo] ?? TIPOS.residencia;
    const catC = obterComodos({ system: this });
    const catM = obterMobilias({ system: this });

    this.porteInfo = porte;
    this.tipoInfo = tipo;
    this.rank = rankPorte(this.porte);

    /* Capacidade de cômodos */
    this.maxComodos = porte.comodos;
    this.comodosConstruidos = this.comodos.length;
    this.manutencao = porte.manutencao;

    const chaves = this.comodos.filter(c => !c.danificado && c.ativo !== false).map(c => c.key);
    this.temComodo = (key) => chaves.includes(key);

    /* Gárgulas permitidas: 1 por categoria acima de Básico */
    this.maxGargulas = Math.max(0, this.rank - rankPorte("basica"));
    this.gargulas = this.mobilias.filter(m => {
      const def = catM[m.key];
      return def?.especial === "gargula" && m.ativo !== false;
    }).length;

    /* Segurança (0-20): tipo + cômodos íntegros + gárgulas + outros */
    let seg = tipo.seguranca ?? 0;
    for (const c of this.comodos) {
      if (c.danificado || c.ativo === false) continue;
      seg += catC[c.key]?.seguranca ?? 0;
    }
    for (const m of this.mobilias) {
      if (m.ativo === false) continue;
      const def = catM[m.key];
      if (!def?.seguranca) continue;
      if (def.especial === "gargula" || m.comodoId === "exterior") { seg += def.seguranca; continue; }
      const com = this.comodos.find(c => c.id === m.comodoId);
      if (com && !com.danificado && com.ativo !== false) seg += def.seguranca;
    }
    seg += this.seguranca.outros ?? 0;
    this.segurancaTotal = Math.clamp(seg, 0, 20);

    /* Capacidade de mobílias por cômodo */
    this.capacidadeComodo = (comodoId) => {
      const com = this.comodos.find(c => c.id === comodoId);
      if (!com) return 0;
      return catC[com.key]?.capacidade ?? 1;
    };
    this.mobiliasEm = (comodoId) => this.mobilias.filter(m => m.comodoId === comodoId);

    this.comodosDanificados = this.comodos.filter(c => c.danificado).length;
  }
}

export function registrarDataModel() {
  Object.assign(CONFIG.Actor.dataModels, { [`${MODULO}.base-hayd`]: BaseData });
  console.debug(`${MODULO} | DataModel "base-hayd" registrado.`);
}
