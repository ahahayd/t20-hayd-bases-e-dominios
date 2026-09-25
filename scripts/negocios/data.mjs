/**
 * t20-hayd-bases-e-dominios | negocios/data.mjs
 * DataModel do subtipo de ator "negocio".
 */
import {
  TIPO_NEGOCIO, NIVEL_MAXIMO, CD_FUNDACAO, CUSTO_FUNDACAO, categoriaNivel, obterAtivos
} from "./catalogo.mjs";

const f = foundry.data.fields;

export class NegocioData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      /* 0 = ainda não fundado; 1–7 = nível do negócio. */
      nivel: new f.NumberField({ initial: 0, min: 0, max: NIVEL_MAXIMO, integer: true }),
      ramo: new f.StringField({ initial: "" }),
      localizacao: new f.StringField({ initial: "" }),

      caixa: new f.SchemaField({
        historico: new f.ArrayField(new f.ObjectField())
      }),

      /* Moedas físicas guardadas no negócio (TO = T$ 10 · TC = T$ 0,1). */
      dinheiro: new f.SchemaField({
        to: new f.NumberField({ initial: 0, min: 0, integer: true }),
        tp: new f.NumberField({ initial: 0, min: 0, integer: true }),
        tc: new f.NumberField({ initial: 0, min: 0, integer: true })
      }),

      /* { id, uuid, nome, dono, receberEfeitos, beneficiosDesativados: [] } */
      frequentadores: new f.ArrayField(new f.ObjectField()),

      /* { id, key, ativo, escolha, escolhaSub } — na ordem de aquisição */
      ativos: new f.ArrayField(new f.ObjectField()),

      homebrew: new f.SchemaField({
        ativos: new f.ArrayField(new f.ObjectField())
      }),

      /* Contador de aventuras (ou meses) e usos por período. */
      aventura: new f.SchemaField({
        numero: new f.NumberField({ initial: 0, min: 0, integer: true }),
        rendimentoColetado: new f.BooleanField({ initial: false }),
        cassinoUsado: new f.BooleanField({ initial: false }),
        mercadoUsado: new f.BooleanField({ initial: false }),
        espionagemTrocada: new f.BooleanField({ initial: false })
      }),

      /* Dívida acumulada no Cassino, em T$. */
      cassino: new f.SchemaField({
        divida: new f.NumberField({ initial: 0, min: 0 })
      }),

      /* Associados do Mercado Multinivelado: { nome, aventura } */
      mercado: new f.SchemaField({
        recrutados: new f.ArrayField(new f.ObjectField())
      }),

      detalhes: new f.SchemaField({
        biography: new f.HTMLField({ initial: "" }),
        empregados: new f.HTMLField({ initial: "" }),
        notas: new f.HTMLField({ initial: "" })
      })
    };
  }

  /* O TokenDocument do tormenta20 lê system.attributes.movement sem
   * checar se attributes existe; sem isso o movimento do token lança erro
   * e ele volta para a posição original. */
  prepareBaseData() {
    this.attributes ??= {};
  }

  /* ---------------------------------------------------------------- */
  prepareDerivedData() {
    /* Stub de atributos: itens do sistema guardados no estoque consultam
     * actor.system.atributos ao preparar seus rótulos. */
    this.atributos ??= Object.fromEntries(
      ["for", "des", "con", "int", "sab", "car"].map(k => [k, { value: 0 }])
    );

    const cat = obterAtivos({ system: this });
    this.categoria = categoriaNivel(this.nivel);
    this.maxAtivos = this.nivel;
    this.fundado = this.nivel > 0;

    /* Um ativo por nível: se o nível cair (correção do mestre, edição
     * direta), os ativos mais recentes além do limite ficam excedentes e
     * deixam de funcionar até o negócio voltar a ter espaço. */
    this.ativosExcedentes = new Set(this.ativos.slice(this.maxAtivos).map(a => a.id));
    this.qtdAtivos = this.ativos.length;

    const validos = this.ativos.filter(a => a.ativo !== false && !this.ativosExcedentes.has(a.id));
    const possuidos = new Set(this.ativos.map(a => a.key));
    const fornecidos = new Set(validos.map(a => a.key));
    const espionagem = validos.find(a => a.key === "espionagem-industrial");
    if (espionagem?.escolha && !possuidos.has(espionagem.escolha)) fornecidos.add(espionagem.escolha);

    /** Ativo construído no negócio (para pré-requisitos). */
    this.possuiAtivo = (key) => possuidos.has(key);
    /** Benefício disponível agora (inclui o ativo espionado). */
    this.temBeneficio = (key) => fornecidos.has(key);

    const extra = this.temBeneficio("emporio") ? 100 * this.nivel : 0;
    this.rendimentoBase = 100 * this.nivel + extra;

    /* Fundação: CD 20 e T$ 1.000. Subir de nível: CD 20 + 2 × próximo
     * nível e T$ 1.000 × próximo nível (Estúdio e Escritório ajustam). */
    const proximo = this.nivel + 1;
    if (!this.fundado) {
      this.proximoNivel = { nivel: 1, cd: CD_FUNDACAO, custo: CUSTO_FUNDACAO };
    } else if (proximo <= NIVEL_MAXIMO) {
      this.proximoNivel = {
        nivel: proximo,
        cd: 20 + 2 * proximo - (this.temBeneficio("estudio") ? 5 : 0),
        custo: 1000 * proximo / (this.temBeneficio("escritorio") ? 2 : 1)
      };
    } else {
      this.proximoNivel = null;
    }

    this.nomeAtivo = (key) => cat[key]?.nome ?? key;
  }
}

export function registrarDataModel() {
  Object.assign(CONFIG.Actor.dataModels, { [TIPO_NEGOCIO]: NegocioData });
}
