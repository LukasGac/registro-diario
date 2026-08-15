/**
 * Sono — a base da noite, a partir de duas horas medidas.
 *
 * Existe porque a alternativa era pior: até 14/08/2026 o app guardava só a
 * hora de dormir, e a base era calculada contra um despertador fixo de 5h que
 * nunca foi medido. Deu uma média errada em uma semana. Duas horas medidas ou
 * nenhuma conta — não há meio termo, e por isso toda função aqui devolve
 * `null` quando falta uma das pontas em vez de assumir a outra.
 *
 * Funções puras, sem DOM: é o que permite testá-las em `testes\sono.test.js`.
 */

/** Noite curta demais para ser noite: provável erro de digitação. */
export const MIN_PLAUSIVEL = 150; // 2h30
/** Noite longa demais: idem, e o caso comum é trocar dormiu com acordou. */
export const MAX_PLAUSIVEL = 780; // 13h

/**
 * "22:00", "22:00:00" e "22:00:00.000" viram minutos desde a meia-noite.
 * O banco devolve `time` com segundos; o `input[type=time]` manda sem.
 */
export function emMinutos(hora) {
  if (!hora) return null;
  const partes = String(hora).split(":");
  if (partes.length < 2) return null;

  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return h * 60 + m;
}

/**
 * Minutos entre deitar e levantar, atravessando a meia-noite.
 *
 * `acordou <= dormiu` significa que a noite virou o dia — dormiu 22h, acordou
 * 5h. O caso de igualdade cai aqui de propósito: 24h é absurdo, mas é um
 * absurdo VISÍVEL, e `plausivel()` o denuncia na tela. Devolver 0 esconderia
 * o erro de digitação dentro de um número que parece medido.
 */
export function minutosDeSono(dormiu, acordou) {
  const a = emMinutos(dormiu);
  const b = emMinutos(acordou);
  if (a === null || b === null) return null;
  return b <= a ? b + 1440 - a : b - a;
}

/** Fora desta faixa, o número quase certamente veio de dedo errado. */
export function plausivel(minutos) {
  return minutos !== null && minutos >= MIN_PLAUSIVEL && minutos <= MAX_PLAUSIVEL;
}

/** 420 -> "7h00". Sempre com dois dígitos: a coluna alinha na lista. */
export function formatarDuracao(minutos) {
  if (minutos === null || minutos === undefined) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h + "h" + String(m).padStart(2, "0");
}

/**
 * A base das últimas N noites medidas.
 *
 * Conta só noite com as duas pontas, e devolve `noites` junto com a média:
 * uma média de duas noites e uma de sete não valem a mesma coisa, e quem
 * mostra na tela precisa poder dizer sobre quantas ela é.
 *
 * `dias` é o espelho local inteiro (objeto por data); a janela é contada a
 * partir da data mais recente presente, não da data de hoje — assim uma
 * semana sem registro não dilui a base com dias que nunca existiram.
 */
export function baseDeSono(dias, quantas = 7) {
  const datas = Object.keys(dias || {}).sort().reverse().slice(0, quantas);

  let soma = 0;
  let noites = 0;

  for (const data of datas) {
    const r = dias[data];
    const min = minutosDeSono(r && r.dormiu, r && r.acordou);
    if (min === null || !plausivel(min)) continue;
    soma += min;
    noites++;
  }

  return { minutos: noites ? Math.round(soma / noites) : null, noites };
}
