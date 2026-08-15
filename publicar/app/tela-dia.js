/**
 * Tela Dia — prazos, objetivos, treino, sono, energia e a janela 19h–22h.
 * Um registro por data; reabrir o mesmo dia edita em vez de duplicar.
 */

import { el, pintarGrupo, aoEscolher, criarStatus, escapar, botoes } from "./ui.js";
import { hoje, somarDias, diaLogico, porExtenso } from "./datas.js";
import { minutosDeSono, plausivel, formatarDuracao, baseDeSono } from "./sono.js";
import * as obj from "./objetivos.js";
import * as tr from "./treino.js";
import * as comp from "./compromissos.js";
import * as local from "./local.js";
import * as sync from "./sync.js";

const els = {};
let diaAtivo = "";
let escolha = { treino: "", energia: "" };
let slots = obj.slotsVazios();
let gruposEscolhidos = [];
let mostrarStatus = () => {};

/**
 * O formulário foi tocado desde a última carga?
 *
 * Existe para resolver um modo de falha com cara de bug de dado: a tela é
 * montada a partir do espelho local, que num aparelho novo está VAZIO, e o
 * primeiro sync só chegava depois — repintando o histórico e deixando o
 * formulário em branco. Abrir no PC o dia que você preencheu no celular
 * mostrava campos vazios, e salvar por cima apagava o que já existia.
 *
 * Recarregar sempre seria trocar um dano por outro: apagaria o que estivesse
 * sendo digitado naquele instante. Este sinalizador é a fronteira entre os
 * dois casos — sem toque, a versão do servidor entra; com toque, ela espera.
 */
let sujo = false;

function sujar() {
  sujo = true;
}

function contarPendentes() {
  return Object.values(local.lerFila()).filter((i) => i.tabela === "dias").length;
}

/* ---------- qual dia estou registrando ---------- */

function pintarQualDia() {
  const real = hoje();
  const ontem = somarDias(real, -1);

  for (const b of els.qualDia.querySelectorAll(".op")) {
    const alvo = b.dataset.v === "ontem" ? ontem : real;
    b.textContent = b.dataset.v + " " + porExtenso(alvo).curta;
    b.setAttribute("aria-pressed", String(alvo === diaAtivo));
  }

  const fmt = porExtenso(diaAtivo);
  els.diaSemana.textContent = fmt.semana;
  els.dataLonga.textContent = fmt.longa;

  els.dicaDia.textContent =
    diaAtivo !== real
      ? "Passou da meia-noite: o app abriu no dia que acabou. Toque em hoje se for outro dia."
      : "";
}

/* ---------- prazos ---------- */

/**
 * A vitrine do que foi combinado fora do app.
 *
 * Somente leitura por desenho — o banco não concede escrita nesta tabela. O
 * toque não marca nada: copia o texto para o primeiro objetivo livre do dia,
 * que é onde o cumprimento vira dado com data.
 */
function pintarPrazos() {
  const lista = comp.paraMostrar(local.lerTabela("compromissos"), hoje());

  els.secaoPrazos.hidden = lista.length === 0;
  if (!lista.length) return;

  const vencidos = comp.contarVencidos(local.lerTabela("compromissos"), hoje());
  els.prazosPlacar.textContent = vencidos
    ? `${vencidos} vencido${vencidos > 1 ? "s" : ""}`
    : "";
  els.prazosPlacar.classList.toggle("alerta", vencidos > 0);

  els.prazos.innerHTML = lista
    .map(
      (c) =>
        `<button type="button" class="prazo prazo-${comp.urgencia(c.dias)}" role="listitem" ` +
        `data-titulo="${escapar(c.titulo)}" ` +
        // O rótulo curto é para o olho; quem ouve recebe a frase inteira, com
        // a origem do compromisso junto.
        `aria-label="${escapar(
          `${c.titulo} — ${comp.prazoPorExtenso(c.dias)}, de ${c.fonte}`,
        )}" ` +
        `title="${escapar(comp.prazoPorExtenso(c.dias))} · fonte: ${escapar(c.fonte)}">` +
        `<span class="prazo-quando" aria-hidden="true">${escapar(comp.prazoCurto(c.dias))}</span>` +
        `<span class="prazo-txt">${escapar(c.titulo)}</span>` +
        "</button>",
    )
    .join("");
}

/** Copia um compromisso para o primeiro slot de objetivo ainda vazio. */
function puxarParaObjetivo(titulo) {
  const livre = slots.findIndex((s) => !s.texto.trim());
  if (livre === -1) {
    mostrarStatus("os três objetivos já estão preenchidos", "pend");
    return;
  }

  slots[livre].texto = titulo.slice(0, obj.TAMANHO_MAXIMO);
  slots[livre].feito = false;
  sujar();
  pintarObjetivos();

  const campo = els.objetivos.querySelectorAll(".obj-txt")[livre];
  if (campo) campo.focus();
  mostrarStatus("virou objetivo do dia — salve para gravar", "ok");
}

/* ---------- objetivos ---------- */

/**
 * O placar do dia. Não é legenda: é o número que responde se o dia valeu, e
 * ele muda de peso quando fecha — o único momento de recompensa que este app
 * tem, e o lugar certo para gastá-lo.
 */
function pintarPlacar() {
  const { feitos, total } = obj.contar(obj.normalizar(slots));
  els.objetivosPlacar.textContent = total ? `${feitos} de ${total}` : "";
  els.objetivosPlacar.classList.toggle("completo", total > 0 && feitos === total);
}

/**
 * O vazio ensina a ordem. "opcional" nos dois últimos campos não dizia nada;
 * esta escada diz que o primeiro é o que importa e que o terceiro é bônus —
 * que é literalmente a regra de priorizar, escrita onde ela é usada.
 */
const CONVITES = ["o que precisa sair hoje", "…e depois", "se sobrar tempo"];

/** Reconstrói os três campos. Só na troca de dia — ver `marcarObjetivo`. */
function pintarObjetivos() {
  els.objetivos.innerHTML = slots
    .map((s, i) => {
      const marcado = s.feito && s.texto.trim().length > 0;
      return (
        `<div class="obj${i === 0 ? " obj-primeiro" : ""}${marcado ? " obj-feito" : ""}">` +
        `<button type="button" class="obj-check" data-i="${i}" ` +
        `aria-pressed="${String(marcado)}" ` +
        `aria-label="marcar objetivo ${i + 1} como cumprido"></button>` +
        `<input type="text" class="obj-txt" data-i="${i}" ` +
        `maxlength="${obj.TAMANHO_MAXIMO}" value="${escapar(s.texto)}" ` +
        `placeholder="${escapar(CONVITES[i] || "")}" />` +
        "</div>"
      );
    })
    .join("");

  pintarPlacar();
}

/**
 * Marca ou desmarca um objetivo mexendo só na linha dele.
 *
 * Repintar o bloco inteiro por causa de um toque destruiria os três campos e
 * o foco junto: quem estivesse digitando no segundo objetivo e marcasse o
 * primeiro perderia o cursor no meio da frase.
 */
function marcarObjetivo(i) {
  if (!slots[i] || !slots[i].texto.trim()) return; // marcar o nada não é cumprir nada

  slots[i].feito = !slots[i].feito;

  const linha = els.objetivos.children[i];
  const botao = linha && linha.querySelector(".obj-check");
  if (!linha || !botao) return pintarObjetivos();

  linha.classList.toggle("obj-feito", slots[i].feito);
  botao.setAttribute("aria-pressed", String(slots[i].feito));
  pintarPlacar();
}

/* ---------- treino ---------- */

/**
 * Mostra o detalhe que a modalidade comporta.
 *
 * Os campos escondidos NÃO são limpos aqui: quem alterna corrida → força →
 * corrida por engano encontra os 8 km de volta. O descarte do que não cabe
 * acontece em `detalheCoerente`, na hora de salvar — que é onde ele importa,
 * porque é o que o banco recusaria.
 */
function pintarTreino() {
  els.campoKm.hidden = !tr.pedeKm(escolha.treino);
  els.campoGrupos.hidden = !tr.pedeGrupos(escolha.treino);

  if (!els.campoGrupos.hidden) {
    botoes(
      els.treinoGrupos,
      tr.GRUPOS.map((g) => ({ v: g.v, rotulo: g.rotulo })),
      null,
    );
    for (const b of els.treinoGrupos.querySelectorAll(".op")) {
      b.setAttribute("aria-pressed", String(gruposEscolhidos.includes(b.dataset.v)));
    }
  }
}

/* ---------- sono ---------- */

/**
 * Vazio, a base rima com os campos de hora, que o navegador desenha como
 * `--:--`. Um travessão solto flutuava no meio da caixa e deixava a régua de
 * acento órfã embaixo — parecia defeito, não campo por preencher.
 */
const BASE_VAZIA = "--h--";

function pintarSono() {
  const min = minutosDeSono(els.dormiu.value, els.acordou.value);

  els.sonoValor.textContent = min === null ? BASE_VAZIA : formatarDuracao(min);
  els.sonoValor.classList.toggle("indefinido", min === null);
  els.sonoValor.classList.toggle("suspeito", min !== null && !plausivel(min));

  if (min === null) {
    els.sonoDica.textContent = "Preencha as duas horas para ter a base da noite.";
  } else if (!plausivel(min)) {
    els.sonoDica.textContent = "Confira as horas — pode ser dedo trocado.";
  } else {
    els.sonoDica.textContent = "";
  }

  const base = baseDeSono(local.lerTabela("dias"));
  els.sonoBase.textContent = base.noites
    ? `base de ${formatarDuracao(base.minutos)} em ${base.noites} ` +
      (base.noites === 1 ? "noite medida" : "noites medidas")
    : "sem noite medida ainda";
}

/* ---------- carregar ---------- */

/** Reabre o formulário no dia escolhido, com o que já foi salvo nele. */
export function carregarDia(data) {
  diaAtivo = data;

  const r = local.lerTabela("dias")[data];
  escolha.treino = (r && r.treino) || "";
  escolha.energia = r && r.energia ? String(r.energia) : "";

  els.treinoKm.value = tr.formatarKm(r && r.treino_km);
  gruposEscolhidos = tr.normalizarGrupos(r && r.treino_grupos) || [];

  // O banco devolve `time` como "22:00:00"; o input[type=time] quer "22:00".
  // Campo vazio quando não há dado — nunca um horário de fábrica. Um campo que
  // nasce preenchido vira dado inventado no primeiro dia de pressa.
  els.dormiu.value = r && r.dormiu ? String(r.dormiu).slice(0, 5) : "";
  els.acordou.value = r && r.acordou ? String(r.acordou).slice(0, 5) : "";

  els.janela.value = (r && r.janela) || "";
  slots = obj.paraSlots(r && r.objetivos);
  els.salvar.textContent = r ? "Atualizar" : "Salvar";
  sujo = false;

  pintarGrupo(els.treino, escolha.treino);
  pintarGrupo(els.energia, escolha.energia);
  pintarTreino();
  pintarObjetivos();
  pintarSono();
  pintarQualDia();
  mostrarStatus();
}

/**
 * Chamado no fim de cada ciclo de sincronização.
 *
 * Só recarrega o formulário se ninguém o tocou desde a última carga — ver o
 * comentário de `sujo`. O histórico e os prazos são sempre redesenhados: não
 * têm estado de edição para perder.
 */
export function aposSincronizar() {
  if (!sujo && diaAtivo) carregarDia(diaAtivo);
  pintarPrazos();
  render();
}

/* ---------- salvar ---------- */

function salvar() {
  const janela = els.janela.value.trim();
  const objetivos = obj.normalizar(slots);
  const detalhe = tr.detalheCoerente(
    escolha.treino,
    tr.lerKm(els.treinoKm.value),
    gruposEscolhidos,
  );

  // Dia em branco vale mais que dia inventado: sem nenhum sinal real, não há
  // o que gravar. Agora que nenhum campo nasce preenchido, a checagem cobre
  // todos eles — inclusive as horas.
  const vazio =
    !escolha.treino &&
    !escolha.energia &&
    !janela &&
    !objetivos.length &&
    !els.dormiu.value &&
    !els.acordou.value;

  if (vazio) {
    mostrarStatus("escreva ao menos um objetivo, o treino ou a janela", "pend");
    return;
  }

  // Km digitado que não vira número é erro de digitação, não ausência. Gravar
  // calado perderia a distância sem nada na tela dizendo que sumiu.
  if (tr.pedeKm(escolha.treino) && els.treinoKm.value.trim() && detalhe.treino_km === null) {
    mostrarStatus(`distância inválida — use algo entre 0 e ${tr.KM_MAXIMO}`, "pend");
    return;
  }

  const linha = {
    data: diaAtivo,
    treino: escolha.treino || null,
    treino_km: detalhe.treino_km,
    treino_grupos: detalhe.treino_grupos,
    dormiu: els.dormiu.value || null,
    acordou: els.acordou.value || null,
    energia: escolha.energia ? Number(escolha.energia) : null,
    janela: janela || null,
    objetivos,
  };

  if (!sync.gravar("dias", linha)) {
    mostrarStatus("não deu para salvar neste aparelho", "pend");
    return;
  }

  // O que subiu foi a versão normalizada (texto aparado, slot vazio fora,
  // detalhe de treino descartado se a modalidade não o comporta). Sem
  // devolvê-la à tela, ela seguiria mostrando o que o banco não guardou.
  slots = obj.paraSlots(objetivos);
  gruposEscolhidos = detalhe.treino_grupos || [];
  els.treinoKm.value = tr.formatarKm(detalhe.treino_km);

  // A tela voltou a ser igual ao que está gravado: o próximo sync pode
  // atualizá-la sem risco de apagar edição em andamento.
  sujo = false;

  els.salvar.textContent = "Atualizar";
  pintarTreino();
  pintarObjetivos();
  render();
  mostrarStatus("salvo", "ok");
}

/* ---------- histórico ---------- */

function render() {
  const todos = local.lerTabela("dias");
  const datas = Object.keys(todos).sort().reverse().slice(0, 7);

  if (!datas.length) {
    els.lista.innerHTML = '<p class="vazio">Nenhum registro ainda. O primeiro é hoje.</p>';
    pintarSono();
    mostrarStatus();
    return;
  }

  els.lista.innerHTML = datas
    .map((dt) => {
      const r = todos[dt];
      const classes = ["dia"];
      if (r.treino && r.treino !== "nada") classes.push("treinou");
      if (local.estaNaFila("dias", dt)) classes.push("pendente");

      const min = minutosDeSono(r.dormiu, r.acordou);

      // Quadrados desenhados em CSS, na mesma linguagem do resto do app.
      const marcas = obj
        .estados(r.objetivos)
        .map((f) => `<span class="mrk${f ? " mrk-feito" : ""}"></span>`)
        .join("");
      const { feitos, total } = obj.contar(r.objetivos);

      // O detalhe do treino substitui a modalidade quando existe: "8,5 km"
      // diz tudo que "corrida" diria, e mais.
      const detalhe = tr.resumo(r.treino_km, r.treino_grupos);

      const meta = [];
      if (detalhe) meta.push(detalhe);
      else if (r.treino) meta.push(r.treino === "nada" ? "—" : r.treino);
      if (min !== null) meta.push(formatarDuracao(min));
      if (r.energia) meta.push("e" + r.energia);

      // Duas linhas, não uma: com o detalhe do treino junto, a meta engolia a
      // coluna do texto e a janela 19h–22h sumia inteira da linha. A janela é
      // o dado que o sistema mais cobra — não pode ser o primeiro a cair.
      return (
        `<div class="${classes.join(" ")}">` +
        `<div class="dia-topo">` +
        `<span class="dia-data">${porExtenso(dt).curta}</span>` +
        `<span class="dia-txt">${escapar(r.janela || "—")}</span>` +
        // Os quadrados são decorativos; o leitor de tela recebe a contagem.
        `<span class="dia-objs" role="img" aria-label="${
          total ? `${feitos} de ${total} objetivos cumpridos` : "sem objetivos"
        }">${marcas}</span>` +
        "</div>" +
        (meta.length ? `<div class="dia-meta">${escapar(meta.join(" · "))}</div>` : "") +
        "</div>"
      );
    })
    .join("");

  pintarSono();
  mostrarStatus();
}

/* ---------- montagem ---------- */

export function montar() {
  for (const id of [
    "diaSemana", "dataLonga", "treino", "treinoKm", "treinoGrupos",
    "campoKm", "campoGrupos", "energia", "dormiu", "acordou",
    "sonoValor", "sonoDica", "sonoBase", "objetivos", "objetivosPlacar",
    "secaoPrazos", "prazos", "prazosPlacar",
    "janela", "salvar", "status", "lista", "qualDia", "dicaDia",
  ]) {
    els[id] = el(id);
  }

  mostrarStatus = criarStatus(els.status, contarPendentes);

  aoEscolher(els.treino, (v) => {
    escolha.treino = escolha.treino === v ? "" : v;
    pintarGrupo(els.treino, escolha.treino);
    pintarTreino();
    sujar();
  });

  // Múltipla escolha, ao contrário dos outros grupos de botões da tela: um
  // treino de força pega mais de um grupo muscular no mesmo dia.
  aoEscolher(els.treinoGrupos, (v, botao) => {
    const i = gruposEscolhidos.indexOf(v);
    if (i === -1) gruposEscolhidos.push(v);
    else gruposEscolhidos.splice(i, 1);

    botao.setAttribute("aria-pressed", String(i === -1));
    sujar();
  });

  els.treinoKm.addEventListener("input", sujar);

  aoEscolher(els.energia, (v) => {
    escolha.energia = escolha.energia === v ? "" : v;
    pintarGrupo(els.energia, escolha.energia);
    sujar();
  });

  // Trocar de dia recarrega do espelho e zera o sinalizador: o formulário
  // passa a refletir o dia novo, não uma edição pendente do anterior.
  aoEscolher(els.qualDia, (v) => {
    carregarDia(v === "ontem" ? somarDias(hoje(), -1) : hoje());
  });

  els.prazos.addEventListener("click", (ev) => {
    const b = ev.target.closest(".prazo");
    if (b) puxarParaObjetivo(b.dataset.titulo);
  });

  // Delegação: os campos de objetivo são reconstruídos na troca de dia, então
  // ouvinte preso ao elemento morreria junto com ele.
  els.objetivos.addEventListener("input", (ev) => {
    const campo = ev.target.closest(".obj-txt");
    if (!campo) return;
    const i = Number(campo.dataset.i);
    if (!slots[i]) return;

    slots[i].texto = campo.value;
    sujar();

    // Só o placar é atualizado aqui. Repintar tudo trocaria o input sob o
    // cursor e o foco saltaria a cada tecla.
    pintarPlacar();
  });

  els.objetivos.addEventListener("click", (ev) => {
    const botao = ev.target.closest(".obj-check");
    if (!botao) return;
    marcarObjetivo(Number(botao.dataset.i));
    sujar();
  });

  for (const campo of [els.dormiu, els.acordou, els.janela]) {
    campo.addEventListener("input", () => {
      sujar();
      pintarSono();
    });
  }

  els.salvar.addEventListener("click", salvar);

  carregarDia(diaLogico());
  pintarPrazos();
  render();
}
