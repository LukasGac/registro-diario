/**
 * Dinheiro. Duas funções e um princípio: o app fala pt-BR na entrada e na
 * saída, mas por dentro é sempre Number.
 */

/**
 * Aceita "12,50", "12.50", "R$ 1.234,56" e "1234.56". Quando os dois
 * separadores aparecem, o último é o decimal — é o que distingue "1.234,56"
 * de "1,234.56". Teclado de celular e teclado numérico de PC produzem os dois.
 */
export function lerValor(txt) {
  let s = String(txt).replace(/[^\d.,-]/g, "");
  if (!s) return NaN;

  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");

  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    s = ultimaVirgula > ultimoPonto
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (ultimaVirgula > -1) {
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : n;
}

export function moeda(v) {
  const sinal = v < 0 ? "-" : "";
  return (
    sinal +
    "R$ " +
    Math.abs(v).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Centavos são a unidade de comparação. Somar float em JS produz
 * 0.1 + 0.2 = 0.30000000000000004, e uma conferência de saldo que compara
 * float com float acusa diferença onde não existe — gravaria um ajuste de
 * um centésimo de centavo toda vez.
 */
export function mesmoValor(a, b) {
  return Math.abs(a - b) < 0.005;
}

/** Arredonda para 2 casas antes de gravar, pelo mesmo motivo acima. */
export function centavos(v) {
  return Math.round(v * 100) / 100;
}
