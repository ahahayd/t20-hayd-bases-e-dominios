/**
 * Marca as janelas deste módulo com `hayd-ui`, a classe de onde pendem os
 * tokens e as primitivas de `styles/hayd-ui-base.css`.
 *
 * O arquivo de estilo é o MESMO nos módulos da família (cópia byte a byte,
 * não referência cruzada): nenhum módulo pode depender de outro estar
 * instalado para ficar apresentável.
 *
 * O elemento sai de `app.element`, e não do segundo argumento do hook: há
 * fichas que chegam aqui com o elemento de uma PARTE (já vi um <button> do
 * cabeçalho), e marcar a parte em vez da janela não leva os tokens a lugar
 * nenhum. `app.element` é sempre a raiz.
 *
 * O teste é a presença de markup deste módulo dentro da janela. É um
 * `querySelector` por render de janela, e nada mais: nenhuma observação
 * contínua, nenhum trabalho por quadro.
 */

const CLASSE = 'hayd-ui';
const MARCADOR = '[class*="t20b-"], [class*="t20d-"], [class*="t20bd-"]';

function marcar(app, elemento) {
  const raiz = app?.element ?? elemento?.[0] ?? elemento;
  if (!(raiz instanceof HTMLElement) || raiz.classList.contains(CLASSE)) return;
  if (!raiz.matches(MARCADOR) && !raiz.querySelector(MARCADOR)) return;
  raiz.classList.add(CLASSE);
}

Hooks.on('renderApplicationV2', marcar);
Hooks.on('renderDialogV2', marcar);
