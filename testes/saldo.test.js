import test from "node:test";
import assert from "node:assert/strict";

import { saldoDe, resumoDoMes, ultimosLancamentos } from "../publicar/app/saldo.js";

const NU = "conta-nubank";
const IN = "conta-inter";

function cenario(linhas, contas) {
  return {
    contas: contas || {
      [NU]: { id: NU, slug: "nubank", nome: "Nubank", saldo_inicial: 1000 },
      [IN]: { id: IN, slug: "inter", nome: "Inter", saldo_inicial: 500 },
    },
    lancamentos: Object.fromEntries(linhas.map((l) => [l.id, l])),
  };
}

function lanc(id, campos) {
  return {
    id, data: "2026-08-13", grupo: null, categoria: null,
    conta_destino_id: null, deleted_at: null, ...campos,
  };
}

test("saldo: saída subtrai, entrada soma", () => {
  const c = cenario([
    lanc("a", { tipo: "saida", conta_id: NU, valor: 100, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("b", { tipo: "entrada", conta_id: NU, valor: 250, grupo: "Entradas", categoria: "Salário" }),
  ]);
  assert.equal(saldoDe(NU, c), 1150);
});

test("saldo: ajuste entra com o próprio sinal", () => {
  // O ajuste é o delta entre o extrato e o cálculo. Negativo significa que o
  // app contava a mais — a direção é o dado que denuncia gasto esquecido.
  const c = cenario([lanc("a", { tipo: "ajuste", conta_id: NU, valor: -30 })]);
  assert.equal(saldoDe(NU, c), 970);
});

test("saldo: transferência sai de uma conta e entra na outra", () => {
  const c = cenario([
    lanc("a", { tipo: "transferencia", conta_id: NU, conta_destino_id: IN, valor: 200 }),
  ]);
  assert.equal(saldoDe(NU, c), 800);
  assert.equal(saldoDe(IN, c), 700);
});

test("saldo: linha apagada não conta", () => {
  const c = cenario([
    lanc("a", {
      tipo: "saida", conta_id: NU, valor: 100,
      grupo: "Lazer", categoria: "Alimentos",
      deleted_at: "2026-08-13T12:00:00Z",
    }),
  ]);
  assert.equal(saldoDe(NU, c), 1000);
});

test("saldo é null quando a conta não tem ponto de partida", () => {
  // null e 0 são coisas diferentes: sem saldo inicial o app recusa lançamento,
  // porque saldo sem âncora é chute.
  const c = cenario([], {
    [NU]: { id: NU, slug: "nubank", nome: "Nubank", saldo_inicial: null },
  });
  assert.equal(saldoDe(NU, c), null);
});

test("saldo não acumula erro de float", () => {
  const c = cenario([
    lanc("a", { tipo: "saida", conta_id: NU, valor: 0.1, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("b", { tipo: "saida", conta_id: NU, valor: 0.2, grupo: "Lazer", categoria: "Alimentos" }),
  ]);
  assert.equal(saldoDe(NU, c), 999.7);
});

test("resumo: transferência e ajuste ficam de fora", () => {
  const c = cenario([
    lanc("a", { tipo: "saida", conta_id: NU, valor: 100, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("b", { tipo: "transferencia", conta_id: NU, conta_destino_id: IN, valor: 500 }),
    lanc("c", { tipo: "ajuste", conta_id: NU, valor: -20 }),
  ]);
  const r = resumoDoMes("2026-08", c);
  assert.equal(r.totalSaida, 100);
  assert.deepEqual(Object.keys(r.porGrupo), ["Lazer"]);
});

test("resumo: entrada soma no total mas não infla grupo", () => {
  // Se a entrada entrasse no grupo, os grupos deixariam de somar as Saídas do
  // mês — e é a lista de grupos que vai digitada na aba ORÇAMENTO no dia 20.
  const c = cenario([
    lanc("a", { tipo: "entrada", conta_id: NU, valor: 3000, grupo: "Entradas", categoria: "Salário" }),
    lanc("b", { tipo: "saida", conta_id: NU, valor: 80, grupo: "Lazer", categoria: "Alimentos" }),
  ]);
  const r = resumoDoMes("2026-08", c);
  assert.equal(r.totalEntrada, 3000);
  assert.equal(r.totalSaida, 80);
  assert.equal(r.porGrupo.Entradas, undefined);
});

test("resumo soma por categoria dentro do grupo", () => {
  const c = cenario([
    lanc("a", { tipo: "saida", conta_id: NU, valor: 30, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("b", { tipo: "saida", conta_id: NU, valor: 20, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("c", { tipo: "saida", conta_id: NU, valor: 45, grupo: "Lazer", categoria: "Assinaturas" }),
  ]);
  const r = resumoDoMes("2026-08", c);
  assert.equal(r.porGrupo.Lazer.total, 95);
  assert.equal(r.porGrupo.Lazer.cats.Alimentos, 50);
  assert.equal(r.porGrupo.Lazer.cats.Assinaturas, 45);
});

test("resumo ignora outro mês e linha apagada", () => {
  const c = cenario([
    lanc("a", { data: "2026-07-31", tipo: "saida", conta_id: NU, valor: 999, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("b", { tipo: "saida", conta_id: NU, valor: 50, grupo: "Lazer", categoria: "Alimentos", deleted_at: "2026-08-13T00:00:00Z" }),
  ]);
  assert.equal(resumoDoMes("2026-08", c).totalSaida, 0);
});

test("ultimosLancamentos: mais novo primeiro, apagados fora", () => {
  const c = cenario([
    lanc("a", { data: "2026-08-10", tipo: "saida", conta_id: NU, valor: 10, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("b", { data: "2026-08-12", tipo: "saida", conta_id: NU, valor: 20, grupo: "Lazer", categoria: "Alimentos" }),
    lanc("c", { data: "2026-08-11", tipo: "saida", conta_id: NU, valor: 30, grupo: "Lazer", categoria: "Alimentos", deleted_at: "x" }),
  ]);
  assert.deepEqual(ultimosLancamentos(c.lancamentos).map((l) => l.id), ["b", "a"]);
});
