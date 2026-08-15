/**
 * Montagem do app.
 *
 * Ordem: restaurar sessão, abrir o espelho daquele usuário, montar as telas,
 * sincronizar. O espelho é por usuário, então nada pode ser lido antes de
 * saber quem entrou.
 */

import { el } from "./ui.js";
import * as api from "./supabase.js";
import * as local from "./local.js";
import * as sync from "./sync.js";
import * as login from "./tela-login.js";
import * as telaDia from "./tela-dia.js";
import * as telaGastos from "./tela-gastos.js";

let montado = false;

/* ---------- estado da sincronização ---------- */

function pintarEstado(texto, pendente) {
  const b = el("estadoSinc");
  b.textContent = texto;
  b.className = pendente ? "sinc pend" : "sinc";
}

function atualizarEstado() {
  const n = local.tamanhoDaFila();
  if (n > 0) {
    pintarEstado(`${n} por enviar`, true);
    return;
  }
  pintarEstado(navigator.onLine ? "em dia" : "offline", !navigator.onLine);
}

/* ---------- abas ---------- */

function trocarAba(qual) {
  const gastos = qual === "gastos";
  el("abaDia").setAttribute("aria-selected", String(!gastos));
  el("abaGastos").setAttribute("aria-selected", String(gastos));
  el("telaDia").hidden = gastos;
  el("telaGastos").hidden = !gastos;
  local.gravarPreferencia("aba", qual);
  if (gastos) telaGastos.renderTudo();
}

/* ---------- ciclo de vida ---------- */

function abrirApp() {
  const u = api.usuario();
  if (!u) return mostrarLogin();

  local.abrirEspelho(u.id);

  el("telaEntrar").hidden = true;
  el("telaApp").hidden = false;

  if (!montado) {
    telaDia.montar();
    telaGastos.montar();

    el("abaDia").addEventListener("click", () => trocarAba("dia"));
    el("abaGastos").addEventListener("click", () => trocarAba("gastos"));
    el("estadoSinc").addEventListener("click", () => sync.sincronizar());
    el("sair").addEventListener("click", sairDaConta);

    // A sessão pode morrer sozinha — senha trocada, refresh revogado. Quando
    // isso acontece, voltar para o login é a única coisa honesta a fazer: sem
    // isto o app parece logado e falha em silêncio para sempre.
    api.aoMudarSessao((s) => {
      if (!s) {
        local.limparEspelho();
        mostrarLogin();
      }
    });

    sync.aoSincronizar((ev) => {
      if (ev.tipo === "inicio") {
        pintarEstado("sincronizando…", false);
        return;
      }
      if (ev.tipo === "recusado") {
        // O banco recusou a linha. Ela saiu da fila para não entupir o que vem
        // atrás, então precisa aparecer — silenciar aqui seria perder o dado
        // sem ninguém saber.
        pintarEstado("uma linha foi recusada", true);
        return;
      }
      // `aposSincronizar` e não `render`: o histórico sempre se redesenha, mas
      // o FORMULÁRIO do dia também precisa receber o que chegou do servidor —
      // senão um aparelho novo mostra campos vazios com o dado já no banco, e
      // salvar por cima apaga o que veio do outro aparelho.
      telaDia.aposSincronizar();
      telaGastos.renderTudo();
      atualizarEstado();
    });

    sync.ligarGatilhos();
    window.addEventListener("online", atualizarEstado);
    window.addEventListener("offline", atualizarEstado);

    montado = true;
  }

  trocarAba(local.lerPreferencia("aba", "dia") === "gastos" ? "gastos" : "dia");

  // Espelho vazio significa aparelho novo (ou primeiro login): puxa tudo em vez
  // de pedir só o que mudou desde um cursor que não existe.
  const vazio = !Object.keys(local.lerTabela("contas")).length;
  (vazio ? sync.cargaInicial() : sync.sincronizar()).then(atualizarEstado);

  atualizarEstado();
}

function mostrarLogin() {
  el("telaApp").hidden = true;
  el("telaEntrar").hidden = false;
}

/**
 * Sair apaga o espelho: dado financeiro não fica num navegador depois que a
 * sessão acabou. O que ainda estava na fila morre junto — por isso o aviso é
 * específico, com o número na frente, em vez de um "tem certeza?" genérico que
 * ninguém lê.
 */
async function sairDaConta() {
  const pendentes = local.tamanhoDaFila();

  const aviso = pendentes
    ? `${pendentes} lançamento(s) ainda não subiram para o banco. Sair agora perde ` +
      `esse(s) lançamento(s) para sempre. Sair mesmo assim?`
    : "Sair da conta? O histórico continua no banco; este aparelho vai baixar tudo de novo no próximo login.";

  if (!confirm(aviso)) return;

  local.limparEspelho();
  await api.sair();
  location.reload();
}

/**
 * Sem isto o app instalado não abre offline — ver o cabeçalho de sw.js.
 * Falhar aqui não pode derrubar nada: em file:// e em navegador sem suporte o
 * app continua funcionando enquanto houver rede.
 */
function registrarWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function iniciar() {
  api.restaurarSessao();
  login.montar(abrirApp);

  if (api.temSessao()) abrirApp();
  else mostrarLogin();

  registrarWorker();
}

iniciar();
