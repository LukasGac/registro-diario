/**
 * Compromissos — a vitrine do que foi combinado fora do app.
 *
 * ESTES DADOS SÃO CÓPIA. A verdade sobre o que foi decidido e até quando mora
 * em documentos fora deste repositório; o banco recebe uma cópia regenerada
 * de lá, e o campo `fonte` de cada linha aponta o documento que manda.
 *
 * Por isso não existe função de gravar neste módulo, e o banco só concede
 * SELECT na tabela: a cópia é de mão única. Duas cópias editáveis do mesmo
 * prazo divergem, e depois nenhuma das duas é confiável. O que o app faz com
 * um compromisso é PUXÁ-LO para objetivo do dia — aí sim vira dado próprio,
 * com data, no registro diário.
 *
 * Funções puras, sem DOM.
 */

/** Vencido há mais dias que isto some da vitrine — já virou outra conversa. */
export const LIMITE_VENCIDO = 30;

/**
 * Dias entre hoje e o prazo. Negativo = vencido.
 *
 * Compara strings ISO em vez de objetos Date de propósito: `new Date("2026-08-16")`
 * é interpretado como UTC e, em UTC-3, retorna 15/08 às 21h — o prazo
 * apareceria vencido um dia antes. O mesmo bug que `datas.js` documenta.
 */
export function diasAte(prazo, hoje) {
  const [pa, pm, pd] = String(prazo).split("-").map(Number);
  const [ha, hm, hd] = String(hoje).split("-").map(Number);
  if (!pa || !ha) return null;

  const MS = 86400000;
  const p = Date.UTC(pa, pm - 1, pd);
  const h = Date.UTC(ha, hm - 1, hd);
  return Math.round((p - h) / MS);
}

/** "vence hoje" · "amanhã" · "em 3 dias" · "venceu ontem" · "venceu há 4 dias" */
export function prazoPorExtenso(dias) {
  if (dias === null) return "";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "venceu ontem";
  if (dias < 0) return `venceu há ${-dias} dias`;
  return `em ${dias} dias`;
}

/**
 * A mesma informação em três caracteres: `hoje`, `3d`, `−12d`.
 *
 * Existe porque a versão por extenso comia metade da largura da linha no
 * celular e o TÍTULO — que é o que precisa ser lido — aparecia truncado. Num
 * app que cabe em 390px, a urgência é uma coluna estreita e o compromisso é o
 * resto. A forma por extenso continua viva no `aria-label`, para quem ouve.
 *
 * O sinal é o menos tipográfico (U+2212), não o hífen: em fonte monoespaçada
 * ele alinha com os dígitos, o hífen fica alto e curto.
 */
export function prazoCurto(dias) {
  if (dias === null) return "";
  if (dias === 0) return "hoje";
  return (dias < 0 ? "−" : "") + Math.abs(dias) + "d";
}

/** `vencido` · `hoje` · `perto` (até 3 dias) · `adiante`. */
export function urgencia(dias) {
  if (dias === null) return "adiante";
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  if (dias <= 3) return "perto";
  return "adiante";
}

/**
 * O que mostrar, em ordem de cobrança.
 *
 * Vencido primeiro, sempre, e sem entrar na conta do limite: prazo vencido é
 * para ser cobrado, não escondido atrás de um "próximos 5". É a regra do
 * `RITUAL.md` levada para dentro da tela.
 *
 * Vencido há mais de `LIMITE_VENCIDO` dias sai — a essa altura o item não é
 * mais um atraso, é uma decisão que precisa ser reaberta no arquivo, e manter
 * na tela só ensina a ignorar a lista inteira.
 */
export function paraMostrar(compromissos, hoje, limite = 4) {
  const todos = Object.values(compromissos || {})
    .filter((c) => c && c.prazo && c.titulo)
    .map((c) => ({ ...c, dias: diasAte(c.prazo, hoje) }))
    .sort((a, b) => a.dias - b.dias || String(a.titulo).localeCompare(b.titulo));

  const vencidos = todos.filter((c) => c.dias < 0 && c.dias >= -LIMITE_VENCIDO);
  const adiante = todos.filter((c) => c.dias >= 0);

  return [...vencidos, ...adiante.slice(0, limite)];
}

/** Quantos estão vencidos dentro da janela — o número que a tela destaca. */
export function contarVencidos(compromissos, hoje) {
  return Object.values(compromissos || {}).filter((c) => {
    if (!c || !c.prazo) return false;
    const d = diasAte(c.prazo, hoje);
    return d < 0 && d >= -LIMITE_VENCIDO;
  }).length;
}
