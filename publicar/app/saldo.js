/**
 * Saldo e resumo do mês — funções puras sobre o espelho local.
 *
 * Recebem os dados por argumento e não tocam em armazenamento nem em DOM.
 * É o que permite testá-las em Node, e é onde mora a aritmética que decide se
 * o número que aparece na tela está certo.
 *
 * O espelho local guarda as linhas no MESMO formato do banco (snake_case,
 * uuid). Uma tradução a menos entre gravar e ler é um lugar a menos para o
 * dado se deformar em silêncio.
 */

import { centavos } from "./dinheiro.js";
import { mesDe } from "./datas.js";

/** Uma linha só vale se não foi apagada. Apagar marca a data, não some. */
export function viva(l) {
  return !l.deleted_at;
}

export function lancamentosVivos(lancamentos) {
  return Object.values(lancamentos).filter(viva);
}

/**
 * Recalculado do zero a cada render. Nada de acumulador guardado: um saldo
 * salvo diverge em silêncio e não dá para auditar depois.
 *
 * O `ajuste` entra como delta com sinal (real menos calculado), então o saldo
 * bate com o extrato no instante seguinte à conferência.
 *
 * Devolve `null` quando a conta ainda não tem saldo inicial — não é zero.
 * Zero é um saldo; a ausência de ponto de partida é outra coisa, e é por isso
 * que o app recusa lançamento numa conta assim.
 */
export function saldoDe(contaId, { contas, lancamentos }) {
  const conta = contas[contaId];
  if (!conta || conta.saldo_inicial === null || conta.saldo_inicial === undefined) {
    return null;
  }

  let total = Number(conta.saldo_inicial) || 0;

  for (const l of lancamentosVivos(lancamentos)) {
    const v = Number(l.valor) || 0;

    if (l.tipo === "transferencia") {
      if (l.conta_id === contaId) total -= v;
      if (l.conta_destino_id === contaId) total += v;
      continue;
    }

    if (l.conta_id !== contaId) continue;

    if (l.tipo === "entrada" || l.tipo === "ajuste") total += v;
    else if (l.tipo === "saida") total -= v;
  }

  return centavos(total);
}

/**
 * Transferência e ajuste ficam de fora: mover dinheiro entre contas suas não é
 * gasto, e ajuste é correção de anotação, não despesa.
 * O que sai daqui é o que vai digitado na aba ORÇAMENTO no dia 20.
 */
export function resumoDoMes(ym, { lancamentos }) {
  const porGrupo = {};
  let totalSaida = 0;
  let totalEntrada = 0;

  for (const l of lancamentosVivos(lancamentos)) {
    if (mesDe(l.data) !== ym) continue;
    if (l.tipo !== "saida" && l.tipo !== "entrada") continue;

    const v = Number(l.valor) || 0;

    // Entrada não entra no total do grupo: os grupos são a decomposição de
    // "Saídas do mês", e é essa lista que vai digitada na aba ORÇAMENTO.
    // Uma entrada arquivada em Lazer inflaria Lazer e os grupos deixariam de
    // somar o total.
    if (l.tipo === "entrada") {
      totalEntrada += v;
      continue;
    }

    totalSaida += v;

    if (!porGrupo[l.grupo]) porGrupo[l.grupo] = { total: 0, cats: {} };
    porGrupo[l.grupo].total += v;
    porGrupo[l.grupo].cats[l.categoria] =
      (porGrupo[l.grupo].cats[l.categoria] || 0) + v;
  }

  for (const g of Object.values(porGrupo)) {
    g.total = centavos(g.total);
    for (const c of Object.keys(g.cats)) g.cats[c] = centavos(g.cats[c]);
  }

  return {
    porGrupo,
    totalSaida: centavos(totalSaida),
    totalEntrada: centavos(totalEntrada),
  };
}

/** Os N lançamentos mais recentes, mais novo primeiro. */
export function ultimosLancamentos(lancamentos, n = 12) {
  return lancamentosVivos(lancamentos)
    .sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? 1 : -1;
      // Desempate estável dentro do mesmo dia: o mais recém-gravado primeiro.
      const ca = a.criado_em || "";
      const cb = b.criado_em || "";
      if (ca !== cb) return ca < cb ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    })
    .slice(0, n);
}
