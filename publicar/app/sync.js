/**
 * Sincronização entre o espelho local e o banco.
 *
 * Ordem fixa: empurra a fila, depois puxa o que mudou. Empurrar antes de puxar
 * é o que impede o servidor de sobrescrever uma escrita local que ainda não
 * subiu.
 *
 * Conflito é resolvido por último-a-escrever-vence, pelo `updated_at` do
 * servidor. Está declarado, não escondido: é um usuário em dois aparelhos, não
 * uma equipe editando a mesma linha.
 */

import * as api from "./supabase.js";
import * as local from "./local.js";

/**
 * O que sobe para cada tabela. Lista explícita, não `Object.keys` da linha:
 * `criado_em` e `updated_at` pertencem ao servidor, e um cliente que os
 * mandasse de volta reescreveria o cursor da própria sincronização com a hora
 * do celular.
 */
const CAMPOS = {
  contas: [
    "id", "user_id", "slug", "nome", "ordem",
    "saldo_inicial", "definido_em", "ultima_conferencia", "saldo_conferido",
  ],
  lancamentos: [
    "id", "user_id", "data", "tipo", "conta_id", "conta_destino_id",
    "grupo", "categoria", "valor", "descricao", "origem_id", "deleted_at",
  ],
  dias: [
    "user_id", "data", "treino", "treino_km", "treino_grupos",
    "dormiu", "acordou", "energia", "janela", "objetivos",
  ],
  // `compromissos` não aparece aqui de propósito: é vitrine de leitura, o
  // banco só concede SELECT nela, e nada no app chama `gravar()` para ela.
  // A ausência faz `montarCorpo` recusar a tabela em vez de montar um corpo
  // que o banco rejeitaria com 401 sem explicar por quê.
};

/**
 * O que um campo ausente vira, quando `null` não serve.
 *
 * `objetivos` é `not null default '[]'` no banco. Uma linha enfileirada por
 * uma versão anterior do app não tem a chave, e a regra geral de `corpoDe()`
 * a transformaria em `null` — o banco recusaria com 400, a linha sairia da
 * fila e o dia inteiro se perderia com um "uma linha foi recusada" que o
 * usuário não teria como consertar. Migração de app instalado é assim: o
 * aparelho pode estar offline com dado velho na fila no momento do deploy.
 */
const PADROES = {
  dias: { objetivos: [] },
};

const CONFLITO = {
  contas: "id",
  lancamentos: "id",
  dias: "user_id,data",
};

/** O que o pull baixa. `compromissos` entra aqui, mas nunca no push. */
const TABELAS = ["contas", "lancamentos", "dias", "compromissos"];

let rodando = false;
let pedidoPendente = false;
const ouvintes = new Set();

export function aoSincronizar(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

function avisar(evento) {
  for (const f of ouvintes) f(evento);
}

/**
 * Monta o corpo que vai para o PostgREST. Pura de propósito: é a função que
 * decide o que sobe e o que fica para trás, e ela precisa ser testável sem
 * sessão, sem rede e sem `localStorage`.
 */
export function montarCorpo(tabela, linha, userId) {
  const campos = CAMPOS[tabela];
  if (!campos) throw new Error("tabela desconhecida: " + tabela);

  const padroes = PADROES[tabela] || {};

  const saida = {};
  for (const campo of campos) {
    if (campo === "user_id") {
      saida.user_id = userId;
      continue;
    }
    if (linha[campo] === undefined || linha[campo] === null) {
      saida[campo] = Object.prototype.hasOwnProperty.call(padroes, campo)
        ? padroes[campo]
        : null;
      continue;
    }
    saida[campo] = linha[campo];
  }
  return saida;
}

function corpoDe(tabela, linha) {
  const u = api.usuario();
  // A sessão pode ter morrido entre a checagem e este ponto. Falhar com uma
  // frase é melhor que um TypeError de propriedade de null no meio da fila.
  if (!u) throw new Error("sessão terminou durante o envio");

  return montarCorpo(tabela, linha, u.id);
}

/* ---------- empurrar ---------- */

/**
 * Cada item é enviado sozinho, não em lote. Um lote inteiro morre por causa de
 * uma linha inválida — e o modo de falha seria o pior possível: o lançamento
 * bom fica preso na fila por causa do vizinho, sem nada na tela dizendo qual
 * dos dois é o problema.
 */
async function empurrar() {
  const fila = local.lerFila();
  const chaves = Object.keys(fila);
  if (!chaves.length) return { enviados: 0, presos: 0 };

  let enviados = 0;
  let presos = 0;

  for (const chaveFila of chaves) {
    const { tabela, linha } = fila[chaveFila];

    // Cópia congelada do que está subindo: se o usuário apagar ou reeditar
    // enquanto isto está no ar, a fila já guarda outra coisa e esta resposta
    // não pode mexer nela.
    const enviado = JSON.parse(JSON.stringify(linha));

    try {
      const gravadas = await api.gravarLinhas(
        tabela, [corpoDe(tabela, enviado)], CONFLITO[tabela],
      );

      // Só adota a versão do servidor se nada mudou localmente no meio do
      // caminho. Se mudou, a fila ainda tem a versão nova e ela vence depois.
      if (local.desenfileirarSe(chaveFila, enviado) && gravadas && gravadas[0]) {
        local.upsertLocal(tabela, gravadas[0]);
      }
      enviados++;
    } catch (err) {
      presos++;
      // 4xx que não seja 401 é dado que o banco recusou: reenviar não conserta
      // e a fila entupiria para sempre, bloqueando tudo atrás. Sai da fila e
      // aparece na tela como erro.
      if (err.status >= 400 && err.status < 500 && err.status !== 401) {
        local.desenfileirarSe(chaveFila, enviado);
        avisar({ tipo: "recusado", tabela, erro: String(err.message || err) });
      }
    }
  }

  return { enviados, presos };
}

/* ---------- puxar ---------- */

const PAGINA = 1000;

// Teto de páginas por ciclo. Existe só para transformar um eventual cursor
// travado em parada, não em aba congelada.
const MAX_PAGINAS = 50;

async function puxarTabela(tabela) {
  let total = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const cursor = local.lerCursor(tabela);

    // `gte` e não `gt`: com `gt`, uma linha gravada no mesmo milissegundo do
    // corte anterior nunca mais seria vista. O custo é rebaixar a última linha
    // de novo, e reaplicar é inofensivo.
    const filtro = cursor ? `&updated_at=gte.${encodeURIComponent(cursor)}` : "";
    const linhas = await api.selecionar(
      tabela, `select=*${filtro}&order=updated_at.asc&limit=${PAGINA}`,
    );

    if (!linhas || !linhas.length) break;

    const aplicaveis = local.filtrarNaoEnfileiradas(tabela, linhas);
    local.aplicarLote(tabela, aplicaveis);
    total += aplicaveis.length;

    const ultimo = linhas[linhas.length - 1].updated_at;
    const avancou = ultimo !== cursor;
    local.gravarCursor(tabela, ultimo);

    // Página incompleta significa fim. Continuar em looping só faria sentido
    // se ainda houvesse o que buscar.
    if (linhas.length < PAGINA) break;

    // Página cheia sem o cursor andar: mais de PAGINA linhas com o MESMO
    // updated_at. Repetir a busca devolveria as mesmas linhas para sempre.
    // Só acontece numa importação em massa, e o `gte` já as aplicou.
    if (!avancou) break;
  }

  return total;
}

/* ---------- ciclo ---------- */

/**
 * Chamado ao abrir, ao voltar o foco da janela, ao voltar a rede e depois de
 * cada gravação. Chamadas simultâneas viram uma só: a segunda marca que
 * precisa repetir e a primeira repete ao terminar.
 */
export async function sincronizar() {
  if (!api.temSessao() || !navigator.onLine) return null;

  if (rodando) {
    pedidoPendente = true;
    return null;
  }
  rodando = true;
  avisar({ tipo: "inicio" });

  try {
    const push = await empurrar();

    let recebidas = 0;
    for (const tabela of TABELAS) recebidas += await puxarTabela(tabela);

    avisar({ tipo: "fim", ...push, recebidas });
    return { ...push, recebidas };
  } catch (err) {
    avisar({ tipo: "erro", erro: String(err.message || err) });
    return null;
  } finally {
    rodando = false;
    if (pedidoPendente) {
      pedidoPendente = false;
      sincronizar();
    }
  }
}

/**
 * Grava local, enfileira e tenta subir. A ordem importa: o aparelho fica com o
 * dado antes de qualquer promessa de rede, então fechar o app no segundo
 * seguinte não perde o lançamento.
 */
export function gravar(tabela, linha) {
  const ok = local.upsertLocal(tabela, linha);
  local.enfileirar(tabela, linha);
  sincronizar();
  return ok;
}

/** Primeira carga depois do login: espelho vazio, puxa tudo. */
export async function cargaInicial() {
  for (const tabela of TABELAS) local.gravarCursor(tabela, null);
  return sincronizar();
}

export function ligarGatilhos() {
  window.addEventListener("online", () => sincronizar());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizar();
  });
}
