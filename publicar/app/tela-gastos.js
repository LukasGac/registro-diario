/**
 * Tela Gastos — saldo por conta, lançamento e total do mês.
 *
 * Existe porque a planilha de orçamento é uma matriz categoria × mês onde se
 * digita o total. Esta é a camada de baixo: o lançamento na hora, para que na
 * revisão mensal o total seja lido em vez de lembrado.
 */

import {
  el, escapar, botoes, pintarGrupo, aoEscolher, criarStatus,
  oferecerDesfazer, fecharDesfazer,
} from "./ui.js";
import { lerValor, moeda, mesmoValor, centavos } from "./dinheiro.js";
import { hoje, diaLogico, porExtenso, mesPorExtenso, deslocarMes } from "./datas.js";
import { CATEGORIAS, itensDoGrupo, GRUPO_ENTRADAS } from "./categorias.js";
import { saldoDe, resumoDoMes, ultimosLancamentos } from "./saldo.js";
import * as local from "./local.js";
import * as sync from "./sync.js";

const els = {};

const form = { contaId: "", tipo: "saida", destinoId: "", grupo: "", categoria: "" };

let conferindo = "";
let contaNoPainel = "";
let mesVisivel = "";
let idRecente = "";
let mostrarStatus = () => {};

/* ---------- dados ---------- */

function dados() {
  return {
    contas: local.lerTabela("contas"),
    lancamentos: local.lerTabela("lancamentos"),
  };
}

function contasOrdenadas() {
  return Object.values(local.lerTabela("contas")).sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome),
  );
}

function conta(id) {
  return local.lerTabela("contas")[id] || null;
}

function nomeConta(id) {
  const c = conta(id);
  return c ? c.nome : "—";
}

function temSaldoInicial(id) {
  const c = conta(id);
  return Boolean(c && c.saldo_inicial !== null && c.saldo_inicial !== undefined);
}

function contarPendentes() {
  return Object.values(local.lerFila()).filter(
    (i) => i.tabela === "lancamentos" || i.tabela === "contas",
  ).length;
}

/* ---------- contas e conferência ---------- */

function renderContas() {
  const d = dados();

  els.contas.innerHTML = contasOrdenadas()
    .map((c) => {
      const s = saldoDe(c.id, d);
      let classe = "conta-saldo";
      let txt;

      if (s === null) {
        classe += " indefinido";
        txt = "definir";
      } else {
        txt = moeda(s);
        if (s < 0) classe += " negativo";
      }

      return (
        `<button type="button" class="conta-card" data-c="${escapar(c.id)}" ` +
        `aria-expanded="${String(conferindo === c.id)}">` +
        `<span class="conta-nome">${escapar(c.nome)}</span>` +
        `<span class="${classe}">${escapar(txt)}</span>` +
        "</button>"
      );
    })
    .join("");

  if (!conferindo) {
    els.painelConferir.hidden = true;
    contaNoPainel = "";
    return;
  }

  const atual = saldoDe(conferindo, d);
  els.painelConferir.hidden = false;
  els.conferirTitulo.textContent = nomeConta(conferindo);

  els.conferirDica.textContent =
    atual === null
      ? "Primeira vez: digite o saldo que está no app do banco agora. É o ponto de partida."
      : `O app calcula ${moeda(atual)}. Digite o que o banco mostra; a diferença vira um ajuste com data.`;

  // Só zera ao abrir o painel numa conta diferente. Este render roda de dentro
  // de callback de rede, e limpar aqui apagaria o saldo que está sendo digitado
  // neste instante.
  if (contaNoPainel !== conferindo) {
    els.conferirValor.value = "";
    contaNoPainel = conferindo;
  }
  els.conferirValor.placeholder = temSaldoInicial(conferindo)
    ? "saldo real"
    : "saldo inicial, ex 500,00";
}

function conferir() {
  const v = lerValor(els.conferirValor.value);
  if (Number.isNaN(v)) {
    mostrarStatus("valor inválido", "pend");
    return;
  }

  // Cinto de segurança: sem conta escolhida não existe o que conferir. Sem
  // isto, um painel aberto por engano grava conferência em conta nenhuma.
  if (!conferindo) {
    mostrarStatus("toque na conta que você quer conferir", "pend");
    return;
  }

  const id = conferindo;
  const c = { ...conta(id) };
  const agora = hoje();

  // Sem saldo inicial ainda: o número digitado É o ponto de partida, não um
  // ajuste — não existe nada calculado para comparar.
  if (!temSaldoInicial(id)) {
    sync.gravar("contas", {
      ...c,
      saldo_inicial: centavos(v),
      definido_em: agora,
      ultima_conferencia: agora,
      saldo_conferido: centavos(v),
    });
    conferindo = "";
    renderTudo();
    mostrarStatus("saldo inicial gravado", "ok");
    return;
  }

  const calculado = saldoDe(id, dados());
  const delta = centavos(v - calculado);

  sync.gravar("contas", {
    ...c,
    ultima_conferencia: agora,
    saldo_conferido: centavos(v),
  });

  if (mesmoValor(v, calculado)) {
    conferindo = "";
    renderTudo();
    mostrarStatus("bateu certinho", "ok");
    return;
  }

  gravarLancamento({
    data: agora,
    tipo: "ajuste",
    conta_id: id,
    conta_destino_id: null,
    grupo: null,
    categoria: null,
    valor: delta,
    descricao: "conferido em " + moeda(v),
  });

  conferindo = "";
  renderTudo();
  mostrarStatus(`ajuste de ${moeda(delta)} gravado`, delta < 0 ? "pend" : "ok");
}

/* ---------- lançamentos ---------- */

function gravarLancamento(campos) {
  const linha = {
    // O id nasce no aparelho. É isso que faz o reenvio depois de uma queda de
    // rede ser upsert, e não linha duplicada.
    id: crypto.randomUUID(),
    origem_id: null,
    deleted_at: null,
    criado_em: new Date().toISOString(),
    ...campos,
  };

  if (!sync.gravar("lancamentos", linha)) {
    mostrarStatus("não deu para salvar neste aparelho", "pend");
    return null;
  }
  return linha;
}

function lancar() {
  const v = lerValor(els.gValor.value);
  if (Number.isNaN(v) || v <= 0) {
    mostrarStatus("digite o valor", "pend");
    els.gValor.focus();
    return;
  }

  if (!form.contaId || !temSaldoInicial(form.contaId)) {
    mostrarStatus(`defina o saldo de ${nomeConta(form.contaId)} primeiro`, "pend");
    return;
  }

  if (form.tipo === "transferencia") {
    if (!form.destinoId || form.destinoId === form.contaId) {
      mostrarStatus("escolha a conta de destino", "pend");
      return;
    }
    // O destino também precisa de saldo inicial. Sem isso a transferência fica
    // registrada mas invisível, e quando a conta for definida com o saldo do
    // banco — que já inclui o valor transferido — a soma conta duas vezes.
    if (!temSaldoInicial(form.destinoId)) {
      mostrarStatus(`defina o saldo de ${nomeConta(form.destinoId)} primeiro`, "pend");
      return;
    }
  } else if (!form.categoria) {
    mostrarStatus("escolha a categoria", "pend");
    return;
  }

  const transf = form.tipo === "transferencia";
  const linha = gravarLancamento({
    data: els.gData.value || hoje(),
    tipo: form.tipo,
    conta_id: form.contaId,
    conta_destino_id: transf ? form.destinoId : null,
    grupo: transf ? null : form.grupo,
    categoria: transf ? null : form.categoria,
    valor: centavos(v),
    descricao: els.gDescricao.value.trim() || null,
  });
  if (!linha) return;

  idRecente = linha.id;

  // O valor e a descrição zeram; conta, tipo e categoria ficam, porque
  // lançamento em série costuma ser da mesma categoria.
  els.gValor.value = "";
  els.gDescricao.value = "";

  renderTudo();
  mostrarStatus("lançado", "ok");

  oferecerDesfazer(`${moeda(v)} · ${linha.categoria || nomeConta(linha.conta_id)}`, () =>
    apagar(linha.id, { silencioso: true }),
  );

  // Devolve o foco ao valor: no PC, lançando em série contra o extrato, é o que
  // permite ler a próxima linha e digitar sem tocar no mouse.
  els.gValor.focus();
}

/**
 * Apagar marca a data, não some com a linha. O histórico continua auditável e
 * a remoção se propaga para o outro aparelho no próximo pull.
 */
function apagar(id, { silencioso = false } = {}) {
  const l = local.lerTabela("lancamentos")[id];
  if (!l || l.deleted_at) return;

  sync.gravar("lancamentos", { ...l, deleted_at: new Date().toISOString() });

  renderTudo();
  if (!silencioso) mostrarStatus("apagado", "ok");
  else mostrarStatus("desfeito", "ok");
}

/* ---------- resumo e lista ---------- */

function renderResumo() {
  els.mesNome.textContent = mesPorExtenso(mesVisivel);

  const r = resumoDoMes(mesVisivel, dados());
  const grupos = CATEGORIAS.map((g) => g.grupo).filter((g) => r.porGrupo[g]);

  if (!grupos.length) {
    els.resumo.innerHTML = '<p class="vazio">Nenhum lançamento neste mês.</p>';
    return;
  }

  let html = grupos
    .map((g) => {
      const bloco = r.porGrupo[g];
      const cats = Object.keys(bloco.cats).sort((a, b) => bloco.cats[b] - bloco.cats[a]);

      return (
        `<div class="grupo-total"><span>${escapar(g)}</span>` +
        `<span>${moeda(bloco.total)}</span></div>` +
        cats
          .map(
            (c) =>
              `<div class="cat-total"><span>${escapar(c)}</span>` +
              `<span>${moeda(bloco.cats[c])}</span></div>`,
          )
          .join("")
      );
    })
    .join("");

  html += `<div class="grupo-total"><span>Saídas do mês</span><span>${moeda(r.totalSaida)}</span></div>`;

  if (r.totalEntrada > 0) {
    html += `<div class="grupo-total"><span>Entradas do mês</span><span>${moeda(r.totalEntrada)}</span></div>`;
  }

  els.resumo.innerHTML = html;
}

function renderLista() {
  const lancs = ultimosLancamentos(local.lerTabela("lancamentos"), 12);

  if (!lancs.length) {
    els.listaGastos.innerHTML = '<p class="vazio">Nenhum lançamento ainda.</p>';
    return;
  }

  els.listaGastos.innerHTML = lancs
    .map((l) => {
      const classes = ["lanc", l.tipo];
      if (local.estaNaFila("lancamentos", l.id)) classes.push("pendente");
      if (l.id === idRecente) classes.push("novo");

      let texto;
      if (l.tipo === "transferencia") {
        texto = `${nomeConta(l.conta_id)} › ${nomeConta(l.conta_destino_id)}`;
      } else if (l.tipo === "ajuste") {
        texto = `ajuste · ${nomeConta(l.conta_id)}`;
      } else {
        texto = l.categoria || "";
        if (l.descricao) texto += " · " + l.descricao;
      }

      // O ajuste carrega o sinal no próprio valor, e é justamente a direção
      // dele que denuncia lançamento esquecido: negativo = o app contava a
      // mais, positivo = contava a menos. Sem o sinal a linha não diz nada.
      const v = Number(l.valor) || 0;
      const sinal =
        l.tipo === "saida" ? "−"
        : l.tipo === "entrada" ? "+"
        : l.tipo === "ajuste" ? (v < 0 ? "−" : "+")
        : "";

      return (
        `<div class="${classes.join(" ")}">` +
        `<span class="lanc-data">${porExtenso(l.data).curta}</span>` +
        `<span class="lanc-txt">${escapar(texto)}</span>` +
        `<span class="lanc-valor">${sinal}${moeda(Math.abs(v))}</span>` +
        `<button type="button" class="apagar" data-id="${escapar(l.id)}" aria-label="apagar">×</button>` +
        "</div>"
      );
    })
    .join("");

  idRecente = "";
}

function pintarFormulario() {
  const contas = contasOrdenadas();

  if (!form.contaId && contas.length) form.contaId = contas[0].id;

  botoes(els.gConta, contas.map((c) => ({ v: c.id, rotulo: c.nome })), form.contaId);

  botoes(
    els.gDestino,
    contas.filter((c) => c.id !== form.contaId).map((c) => ({ v: c.id, rotulo: c.nome })),
    form.destinoId,
  );

  botoes(els.gGrupo, CATEGORIAS.map((g) => ({ v: g.grupo, rotulo: g.grupo })), form.grupo);

  const itens = itensDoGrupo(form.grupo);
  if (itens.length) {
    botoes(els.gCategoria, itens.map((i) => ({ v: i, rotulo: i })), form.categoria);
    els.campoCategoria.hidden = false;
  } else {
    els.campoCategoria.hidden = true;
  }

  pintarGrupo(els.gTipo, form.tipo);

  const transf = form.tipo === "transferencia";
  els.campoDestino.hidden = !transf;
  els.campoGrupo.hidden = transf;
  if (transf) els.campoCategoria.hidden = true;
}

export function renderTudo() {
  renderContas();
  renderResumo();
  renderLista();
  pintarFormulario();
  mostrarStatus();
}

/* ---------- teclado (PC) ---------- */

/**
 * O ganho de lançar pelo PC é não tirar a mão do teclado: ler a linha do
 * extrato na janela ao lado, digitar, Enter, próxima.
 */
function ligarTeclado() {
  for (const campo of [els.gValor, els.gDescricao]) {
    campo.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        lancar();
      }
    });
  }

  els.conferirValor.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      conferir();
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (els.telaGastos.hidden) return;

    if (ev.key === "Escape") {
      els.gValor.value = "";
      els.gDescricao.value = "";
      fecharDesfazer();
      els.gValor.focus();
      return;
    }

    // Alt+1..3 troca de conta sem sair do campo de valor.
    if (ev.altKey && /^[1-9]$/.test(ev.key)) {
      const alvo = contasOrdenadas()[Number(ev.key) - 1];
      if (!alvo) return;
      ev.preventDefault();
      form.contaId = alvo.id;
      if (form.destinoId === form.contaId) form.destinoId = "";
      pintarFormulario();
      mostrarStatus(alvo.nome, "ok");
    }
  });
}

/* ---------- montagem ---------- */

export function montar() {
  for (const id of [
    "contas", "painelConferir", "conferirTitulo", "conferirDica", "conferirValor",
    "conferirOk", "gValor", "gConta", "gTipo", "gDestino", "gGrupo", "gCategoria",
    "gDescricao", "gData", "gLancar", "gStatus", "campoDestino", "campoGrupo",
    "campoCategoria", "mesAnterior", "mesProximo", "mesNome", "resumo",
    "listaGastos", "telaGastos",
  ]) {
    els[id] = el(id);
  }

  mostrarStatus = criarStatus(els.gStatus, contarPendentes);

  const d = diaLogico();
  els.gData.value = d;
  mesVisivel = d.slice(0, 7);

  aoEscolher(els.gConta, (v) => {
    form.contaId = v;
    if (form.destinoId === form.contaId) form.destinoId = "";
    pintarFormulario();
  });

  aoEscolher(els.gDestino, (v) => {
    form.destinoId = form.destinoId === v ? "" : v;
    pintarFormulario();
  });

  aoEscolher(els.gTipo, (v) => {
    form.tipo = v;
    pintarFormulario();
  });

  aoEscolher(els.gGrupo, (v) => {
    if (form.grupo === v) {
      form.grupo = "";
      form.categoria = "";
    } else {
      form.grupo = v;
      form.categoria = "";
      // "Entradas" na planilha é o bloco de receita: escolher esse grupo e
      // deixar o tipo em "saída" produziria um lançamento que baixa o saldo e
      // aparece como despesa no mês.
      form.tipo = form.grupo === GRUPO_ENTRADAS ? "entrada" : "saida";
    }
    pintarFormulario();
  });

  aoEscolher(els.gCategoria, (v) => {
    form.categoria = form.categoria === v ? "" : v;
    pintarFormulario();
  });

  els.contas.addEventListener("click", (ev) => {
    const b = ev.target.closest(".conta-card");
    if (!b) return;
    conferindo = conferindo === b.dataset.c ? "" : b.dataset.c;
    renderContas();
    if (conferindo) els.conferirValor.focus();
  });

  els.listaGastos.addEventListener("click", (ev) => {
    const b = ev.target.closest(".apagar");
    if (b) apagar(b.dataset.id);
  });

  els.conferirOk.addEventListener("click", conferir);
  els.gLancar.addEventListener("click", lancar);

  els.mesAnterior.addEventListener("click", () => {
    mesVisivel = deslocarMes(mesVisivel, -1);
    renderResumo();
  });

  els.mesProximo.addEventListener("click", () => {
    mesVisivel = deslocarMes(mesVisivel, 1);
    renderResumo();
  });

  ligarTeclado();
  renderTudo();
}
