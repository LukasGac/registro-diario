/**
 * Peças de interface compartilhadas pelas telas.
 * Nada aqui sabe o que é um lançamento ou um dia — só desenha.
 */

export function el(id) {
  const achado = document.getElementById(id);
  if (!achado) throw new Error("elemento ausente no HTML: " + id);
  return achado;
}

export function escapar(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Marca qual botão de um grupo está escolhido. */
export function pintarGrupo(cont, valor) {
  for (const b of cont.querySelectorAll(".op")) {
    b.setAttribute("aria-pressed", String(b.dataset.v === valor));
  }
}

/** Desenha um grupo de botões. `itens` é [{v, rotulo}]. */
export function botoes(cont, itens, valorAtual) {
  cont.innerHTML = itens
    .map(
      (it) =>
        `<button type="button" class="op" data-v="${escapar(it.v)}" ` +
        `aria-pressed="${String(it.v === valorAtual)}">${escapar(it.rotulo)}</button>`,
    )
    .join("");
}

/** Delegação de clique num grupo de botões. */
export function aoEscolher(cont, f) {
  cont.addEventListener("click", (ev) => {
    const b = ev.target.closest(".op");
    if (b && cont.contains(b)) f(b.dataset.v, b);
  });
}

/**
 * Linha de status que segura o lugar por alguns segundos.
 *
 * Existe porque esta linha é o único retorno visual da tela, e ela É
 * sobrescrita: o contador de pendências roda de dentro de todo callback de
 * rede. Sem a janela de tempo, a mensagem "lançado" some antes de ser lida e o
 * toque no botão não confirma nada.
 */
export function criarStatus(elemento, contarPendentes) {
  const MS = 4000;
  let seguraAte = 0;
  let timer = null;

  function mostrar(msg, tipo) {
    if (msg) {
      clearTimeout(timer);
      timer = null;
      elemento.textContent = msg;
      elemento.className = "status " + (tipo || "");
      seguraAte = Date.now() + MS;
      return;
    }

    const falta = seguraAte - Date.now();
    if (falta > 0) {
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          mostrar();
        }, falta);
      }
      return;
    }

    const n = contarPendentes();
    elemento.textContent = n > 0 ? `${n} por enviar` : "";
    elemento.className = n > 0 ? "status pend" : "status";
  }

  return mostrar;
}

/**
 * Barra de desfazer. Uma por vez: pedir para desfazer duas coisas ao mesmo
 * tempo é ambiguidade que ninguém consegue resolver olhando a tela.
 */
let desfazerAtual = null;

export function oferecerDesfazer(texto, aoDesfazer, ms = 7000) {
  fecharDesfazer();

  const caixa = document.createElement("div");
  caixa.className = "desfazer";
  caixa.setAttribute("role", "status");
  caixa.innerHTML =
    `<span>${escapar(texto)}</span>` +
    `<button type="button">Desfazer</button>`;

  const botao = caixa.querySelector("button");
  botao.addEventListener("click", () => {
    fecharDesfazer();
    aoDesfazer();
  });

  el("ancoraDesfazer").appendChild(caixa);
  desfazerAtual = { caixa, timer: setTimeout(fecharDesfazer, ms) };
}

export function fecharDesfazer() {
  if (!desfazerAtual) return;
  clearTimeout(desfazerAtual.timer);
  desfazerAtual.caixa.remove();
  desfazerAtual = null;
}
