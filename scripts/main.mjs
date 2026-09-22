/**
 * t20-hayd-bases-e-dominios | main.mjs
 * Ponto de entrada do módulo combinado.
 *
 * Bases e Domínios são dois subsistemas independentes que só passaram a
 * viver no mesmo pacote — cada um registra seu próprio tipo de ator
 * ("base-hayd" e "dominio"), sua própria ficha, seus próprios settings e
 * seus próprios Hooks, exatamente como faziam nos módulos originais
 * t20-hayd-bases e t20-hayd-dominios. Importá-los aqui só dispara o
 * registro de cada um; nenhum dos dois módulos sabe da existência do outro.
 *
 * Negócios ("negocio") é o terceiro subsistema: tem tipo de ator, ficha e
 * settings próprios, e reaproveita o visual, o caixa e os testes das Bases.
 */
import "./bases/main.mjs";
import "./dominios/main.mjs";
import "./negocios/main.mjs";
import "./correcao-obras.mjs";
import "./migracao.mjs";

import { registrarTesteRemoto } from "./teste-remoto.mjs";
Hooks.once("ready", registrarTesteRemoto);
