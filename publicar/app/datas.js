/**
 * Datas do Registro Diário.
 *
 * Tudo em ISO `YYYY-MM-DD` e sempre no fuso do aparelho — nunca `toISOString()`,
 * que converte para UTC e joga o dia para trás em qualquer lugar a oeste de
 * Greenwich. Em UTC-3, às 22h de um dia o UTC já é o dia seguinte.
 */

/**
 * Hora em que o dia vira, para efeito de registro. Quem está acordado antes
 * disso ainda está fechando o dia anterior. Tem de ser menor que 5h, que é a
 * hora do despertador — às 5h já é o dia novo, sem ambiguidade.
 */
export const VIRADA = 4;

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const DIAS_SEMANA = [
  "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado",
];

export function iso(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function hoje(agora = new Date()) {
  return iso(agora);
}

export function somarDias(data, n) {
  const [a, m, d] = data.split("-").map(Number);
  return iso(new Date(a, m - 1, d + n));
}

/**
 * O dia que o app assume ao abrir. Registrar à 00h30 é fechar o dia que acabou,
 * não abrir o que começou — e o app existe para ser aberto às 22h ou depois.
 * O botão "hoje" continua a um toque para desfazer o palpite.
 */
export function diaLogico(agora = new Date()) {
  const d = hoje(agora);
  return agora.getHours() < VIRADA ? somarDias(d, -1) : d;
}

export function porExtenso(data) {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return {
    semana: DIAS_SEMANA[dt.getDay()],
    longa: dt.getDate() + " de " + MESES[dt.getMonth()],
    curta:
      String(dt.getDate()).padStart(2, "0") +
      "/" +
      String(dt.getMonth() + 1).padStart(2, "0"),
  };
}

/** "2026-08" -> "agosto de 2026" */
export function mesPorExtenso(ym) {
  const [a, m] = ym.split("-");
  return MESES[Number(m) - 1] + " de " + a;
}

export function deslocarMes(ym, passo) {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 + passo, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/** "2026-08-13" -> "2026-08" */
export function mesDe(data) {
  return String(data).slice(0, 7);
}
