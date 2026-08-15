/**
 * Detalhe do treino: quilômetros da corrida e grupos da força.
 *
 * Existe porque "corrida" e "força" sozinhos não provam nada. Um plano de
 * treino pede distâncias específicas por semana e prioriza grupos musculares
 * — nada disso é verificável contra um registro que diz só a modalidade. Sem
 * estes campos, um longão muito acima do previsto só aparece se alguém tiver
 * escrito por acaso no campo de texto livre.
 *
 * Os valores dos grupos espelham a constraint de `005-treino-e-compromissos.sql`.
 * Sem acento e em minúsculas no banco; o rótulo com acento é só de tela.
 */

export const GRUPOS = [
  { v: "costas", rotulo: "costas" },
  { v: "peito", rotulo: "peito" },
  { v: "ombro", rotulo: "ombro" },
  { v: "biceps", rotulo: "bíceps" },
  { v: "triceps", rotulo: "tríceps" },
  { v: "perna", rotulo: "perna" },
];

const VALIDOS = new Set(GRUPOS.map((g) => g.v));

/** Modalidades em que cada detalhe faz sentido — igual à constraint do banco. */
export const COM_KM = new Set(["corrida", "ambos"]);
export const COM_GRUPOS = new Set(["forca", "ambos"]);

export const KM_MAXIMO = 300;

export function pedeKm(treino) {
  return COM_KM.has(treino);
}

export function pedeGrupos(treino) {
  return COM_GRUPOS.has(treino);
}

/**
 * "8,5" e "8.5" viram 8.5; o resto vira null.
 *
 * Vírgula porque o teclado numérico do celular em pt-BR entrega vírgula, e o
 * `dinheiro.js` já resolve o mesmo problema para valores — a diferença é que
 * aqui não há símbolo de moeda para limpar.
 */
export function lerKm(texto) {
  const cru = String(texto == null ? "" : texto).trim().replace(",", ".");
  if (!cru) return null;

  const n = Number(cru);
  if (!Number.isFinite(n) || n <= 0 || n > KM_MAXIMO) return null;

  // Duas casas: é o que a coluna numeric(5,2) guarda. Arredondar aqui evita
  // que o banco arredonde por conta própria e o app mostre outro número.
  return Math.round(n * 100) / 100;
}

/** 8.5 -> "8,5" · 8 -> "8" — sem zero à toa numa distância redonda. */
export function formatarKm(km) {
  if (km === null || km === undefined || km === "") return "";
  const n = Number(km);
  if (!Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

/**
 * Filtra, tira repetido e devolve na ordem canônica de `GRUPOS`.
 *
 * A ordem fixa importa: sem ela, `{peito,costas}` e `{costas,peito}` seriam
 * dois valores diferentes para o mesmo treino, e a comparação entre dias
 * viraria falso positivo de mudança na sincronização.
 *
 * Devolve `null` — não `[]` — quando não sobra nada: a coluna é nula quando
 * não houve força, e um array vazio violaria a constraint, que exige de 1 a 6.
 */
export function normalizarGrupos(lista) {
  if (!Array.isArray(lista)) return null;

  const escolhidos = new Set(lista.filter((g) => VALIDOS.has(g)));
  if (!escolhidos.size) return null;

  return GRUPOS.filter((g) => escolhidos.has(g.v)).map((g) => g.v);
}

/**
 * Zera o detalhe que a modalidade escolhida não comporta.
 *
 * Trocar "corrida" por "força" depois de digitar 8 km deixaria o quilômetro
 * órfão: o banco recusaria a linha inteira pela constraint de coerência, e o
 * dia sairia da fila como "uma linha foi recusada". A limpeza acontece antes
 * de subir, não depois de o banco reclamar.
 */
export function detalheCoerente(treino, km, grupos) {
  return {
    treino_km: pedeKm(treino) ? km : null,
    treino_grupos: pedeGrupos(treino) ? normalizarGrupos(grupos) : null,
  };
}

/** "8,5 km · costas, ombro" para o histórico. Vazio quando não há detalhe. */
export function resumo(km, grupos) {
  const partes = [];
  if (km !== null && km !== undefined && km !== "") partes.push(formatarKm(km) + " km");

  const g = normalizarGrupos(grupos);
  if (g) {
    const rotulos = GRUPOS.filter((x) => g.includes(x.v)).map((x) => x.rotulo);
    partes.push(rotulos.join(", "));
  }

  return partes.join(" · ");
}
