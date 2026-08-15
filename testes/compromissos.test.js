import test from "node:test";
import assert from "node:assert/strict";

import {
  diasAte, prazoPorExtenso, urgencia, paraMostrar, contarVencidos, LIMITE_VENCIDO,
} from "../publicar/app/compromissos.js";

const HOJE = "2026-08-14";

function c(origem, prazo, titulo = "algo") {
  return { id: origem, origem, prazo, titulo, fonte: "decisoes-abertas.md" };
}

test("diasAte conta em dias de calendário, sem cair no fuso", () => {
  // `new Date("2026-08-16")` é UTC; em UTC-3 volta 15/08 às 21h e o prazo
  // apareceria vencido um dia antes. É o mesmo bug que datas.js evita.
  assert.equal(diasAte("2026-08-14", HOJE), 0);
  assert.equal(diasAte("2026-08-16", HOJE), 2);
  assert.equal(diasAte("2026-08-13", HOJE), -1);
});

test("diasAte atravessa mês e ano", () => {
  assert.equal(diasAte("2026-09-02", HOJE), 19);
  assert.equal(diasAte("2027-01-01", "2026-12-31"), 1);
  assert.equal(diasAte("2026-03-01", "2026-02-28"), 1);
});

test("prazoPorExtenso fala como gente", () => {
  assert.equal(prazoPorExtenso(0), "vence hoje");
  assert.equal(prazoPorExtenso(1), "amanhã");
  assert.equal(prazoPorExtenso(5), "em 5 dias");
  assert.equal(prazoPorExtenso(-1), "venceu ontem");
  assert.equal(prazoPorExtenso(-4), "venceu há 4 dias");
});

test("urgencia separa o que acende do que fica quieto", () => {
  assert.equal(urgencia(-1), "vencido");
  assert.equal(urgencia(0), "hoje");
  assert.equal(urgencia(3), "perto");
  assert.equal(urgencia(4), "adiante");
});

test("vencido vem primeiro e não disputa vaga com o resto", () => {
  // Prazo vencido é para ser cobrado, não escondido atrás de um "próximos 4".
  const dados = {
    a: c("a", "2026-08-31"), b: c("b", "2026-08-30"), d: c("d", "2026-08-24"),
    e: c("e", "2026-08-17"), f: c("f", "2026-09-02"),
    velho: c("velho", "2026-08-10"),
  };

  const vistos = paraMostrar(dados, HOJE, 4).map((x) => x.origem);
  assert.equal(vistos[0], "velho", "o vencido tem de encabeçar");
  assert.equal(vistos.length, 5, "1 vencido + 4 adiante");
  assert.deepEqual(vistos.slice(1), ["e", "d", "b", "a"]);
});

test("o limite corta os adiante, na ordem do prazo", () => {
  const dados = {
    a: c("a", "2026-08-16"), b: c("b", "2026-08-17"),
    d: c("d", "2026-08-18"), e: c("e", "2026-08-19"),
  };
  assert.deepEqual(paraMostrar(dados, HOJE, 2).map((x) => x.origem), ["a", "b"]);
});

test("vencido há muito tempo sai da vitrine", () => {
  // A essa altura não é atraso, é decisão a reabrir no arquivo. Mantê-lo só
  // ensina a ignorar a lista inteira.
  const dentro = c("dentro", "2026-07-16"); // 29 dias
  const fora = c("fora", "2026-07-14");     // 31 dias

  assert.equal(diasAte(dentro.prazo, HOJE) >= -LIMITE_VENCIDO, true);
  assert.equal(diasAte(fora.prazo, HOJE) < -LIMITE_VENCIDO, true);

  const vistos = paraMostrar({ dentro, fora }, HOJE).map((x) => x.origem);
  assert.deepEqual(vistos, ["dentro"]);
});

test("empate de prazo desempata por título, para a ordem não dançar", () => {
  const dados = {
    z: c("z", "2026-08-17", "Zebra"),
    a: c("a", "2026-08-17", "Abacate"),
  };
  assert.deepEqual(paraMostrar(dados, HOJE).map((x) => x.titulo), ["Abacate", "Zebra"]);
});

test("linha sem prazo ou sem título é ignorada em vez de quebrar a tela", () => {
  const dados = {
    ok: c("ok", "2026-08-17"),
    semPrazo: { id: "x", origem: "x", titulo: "sem prazo" },
    semTitulo: { id: "y", origem: "y", prazo: "2026-08-15" },
    nulo: null,
  };
  assert.deepEqual(paraMostrar(dados, HOJE).map((x) => x.origem), ["ok"]);
});

test("vitrine vazia não quebra", () => {
  assert.deepEqual(paraMostrar({}, HOJE), []);
  assert.deepEqual(paraMostrar(null, HOJE), []);
  assert.equal(contarVencidos(null, HOJE), 0);
});

test("contarVencidos conta a mesma janela que a vitrine mostra", () => {
  const dados = {
    v1: c("v1", "2026-08-13"),
    v2: c("v2", "2026-08-01"),
    antigo: c("antigo", "2026-07-01"), // fora da janela
    hoje: c("hoje", HOJE),             // hoje não é vencido
    futuro: c("futuro", "2026-09-01"),
  };
  assert.equal(contarVencidos(dados, HOJE), 2);
});
