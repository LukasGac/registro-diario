/**
 * Objetivos do dia — no máximo três.
 *
 * O teto de três não é enfeite de tela: é a mesma regra do "máximo 4 desafios
 * no mês" do sistema em `vida\`. Lista de dez itens não é prioridade, é lista
 * de desejos, e no fim do dia ninguém marca nada. Três cabem na cabeça.
 *
 * A tela trabalha com TRÊS SLOTS FIXOS (para os campos não pularem de lugar
 * enquanto se digita); o banco guarda só os preenchidos. Estas funções são a
 * tradução entre as duas formas, e são puras para poderem ser testadas.
 */

export const MAXIMO = 3;
export const TAMANHO_MAXIMO = 120;

/** Três slots vazios — o estado inicial da tela. */
export function slotsVazios() {
  return Array.from({ length: MAXIMO }, () => ({ texto: "", feito: false }));
}

/**
 * Do banco para a tela: completa até três slots.
 * Aceita `undefined` porque linha gravada antes desta versão não tem a coluna.
 */
export function paraSlots(lista) {
  const slots = slotsVazios();
  if (!Array.isArray(lista)) return slots;

  lista.slice(0, MAXIMO).forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    slots[i] = {
      texto: typeof item.texto === "string" ? item.texto : "",
      feito: item.feito === true,
    };
  });

  return slots;
}

/**
 * Corta em N caracteres de verdade, não em N unidades de código.
 *
 * `String.prototype.slice` conta unidades UTF-16, e emoji ocupa duas. Cortar
 * no meio de um par deixa um surrogate solto: `JSON.stringify` o serializa
 * como escape inválido, o Postgres recusa o jsonb, o sync devolve 400, e a
 * linha sai da fila com "uma linha foi recusada" — o dia perdido por causa de
 * um caractere. `Array.from` itera por ponto de código e nunca parte um par.
 *
 * O limite também passa a contar a mesma coisa que `char_length` no banco,
 * que é o que a constraint de `003-sono-e-objetivos.sql` usa.
 */
function cortar(texto, limite) {
  const pontos = Array.from(texto);
  return pontos.length <= limite ? texto : pontos.slice(0, limite).join("");
}

/**
 * Da tela para o banco.
 *
 * Slot sem texto é descartado, e com ele o `feito` que porventura estivesse
 * marcado: objetivo em branco marcado como cumprido é um "feito" sem objeto,
 * e ele inflaria a contagem de cumprimento com nada.
 *
 * O corte em 120 caracteres espelha a constraint de `003-sono-e-objetivos.sql`.
 * Cortar aqui evita que a linha suba, seja recusada pelo banco e saia da fila
 * como "uma linha foi recusada" — erro que o usuário não teria como consertar.
 */
export function normalizar(slots) {
  if (!Array.isArray(slots)) return [];

  return slots
    .slice(0, MAXIMO)
    .map((s) => ({
      texto: cortar(String((s && s.texto) || "").trim(), TAMANHO_MAXIMO),
      feito: !!(s && s.feito),
    }))
    .filter((s) => s.texto.length > 0);
}

/** `{feitos, total}` de uma lista já normalizada. */
export function contar(lista) {
  const l = Array.isArray(lista) ? lista : [];
  return { feitos: l.filter((o) => o && o.feito).length, total: l.length };
}

/**
 * Os estados, em ordem, para o histórico desenhar.
 *
 * Devolve booleanos e não caracteres: `●○` dependeria de qual fonte cada
 * sistema escolhe para desenhá-los, e num app onde nada tem canto arredondado
 * a bolinha ainda seria a forma errada. Quem desenha é o CSS.
 */
export function estados(lista) {
  const l = Array.isArray(lista) ? lista : [];
  return l.map((o) => !!(o && o.feito));
}
