/**
 * Árvore exata da aba ORÇAMENTO da planilha de orçamento que este app alimenta.
 *
 * A grafia é a dela, com os erros dela: "Utensilhos", "Oculos", "Estetica".
 * O encontro entre app e planilha é por texto — na revisão mensal o total por
 * categoria daqui é digitado lá. Corrigir a grafia aqui quebraria o casamento.
 *
 * Fica no código, não no banco: é constante versionada junto com a tela que a
 * desenha, e um valor em tabela poderia divergir da planilha sem ninguém ver.
 */
export const CATEGORIAS = [
  {
    grupo: "Entradas",
    itens: [
      "Investimentos",
      "Salário",
      "Outros Trabalhos",
      "Outras entradas",
      "Cashback",
    ],
  },
  {
    grupo: "Moradia",
    itens: [
      "Aluguel + Condomínio + IPTU",
      "Luz",
      "Água",
      "Internet",
      "Supermercado",
      "Móveis e Eletrodomésticos",
      "Utensilhos de casa/cozinha",
      "Outros (Moradia)",
    ],
  },
  {
    grupo: "Saúde",
    itens: ["Suplemento Alimentar", "Academia", "Oculos (10 PARCELAS)"],
  },
  {
    grupo: "Transporte",
    itens: [
      "Combustível",
      "Financiamento",
      "Lavagem",
      "Seguro / IPVA",
      "Manutenção do Automóvel",
      "Uber",
      "Outros",
    ],
  },
  { grupo: "Imposto", itens: ["Imposto"] },
  {
    grupo: "Pessoais",
    itens: [
      "Cabeleireiro",
      "Esportes",
      "Roupas",
      "Educação",
      "Estetica",
      "Outros (Pessoais)",
    ],
  },
  {
    grupo: "Lazer",
    itens: [
      "Alimentos",
      "Assinaturas",
      "Viagem",
      "Passeios e Similares",
      "Celebração e Datas comemorativas",
      "Outros (Lazer)",
    ],
  },
  {
    grupo: "Outras Despesas",
    itens: [
      "Cartão de Debito (Troca para mãos)",
      "Doação / Presentes",
      "Emprestei",
      "Outros",
    ],
  },
];

/** "Entradas" é o bloco de receita da planilha, não uma despesa. */
export const GRUPO_ENTRADAS = "Entradas";

export function itensDoGrupo(grupo) {
  const achado = CATEGORIAS.find((g) => g.grupo === grupo);
  return achado ? achado.itens : [];
}

export const NOMES_DOS_GRUPOS = CATEGORIAS.map((g) => g.grupo);
