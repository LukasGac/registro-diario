import test from "node:test";
import assert from "node:assert/strict";

import {
  iso, hoje, somarDias, diaLogico, porExtenso, mesPorExtenso, deslocarMes, mesDe,
} from "../publicar/app/datas.js";

test("iso usa o fuso local, nunca UTC", () => {
  // 22h de 13/08 em UTC-3 já é 14/08 em UTC. toISOString() devolveria o dia
  // errado — é o bug clássico, e aqui ele custaria o registro no dia errado.
  assert.equal(iso(new Date(2026, 7, 13, 22, 0, 0)), "2026-08-13");
  assert.equal(iso(new Date(2026, 0, 1, 0, 0, 0)), "2026-01-01");
});

test("iso preenche mês e dia com zero à esquerda", () => {
  assert.equal(iso(new Date(2026, 0, 5)), "2026-01-05");
});

test("somarDias atravessa mês e ano", () => {
  assert.equal(somarDias("2026-08-31", 1), "2026-09-01");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("diaLogico: 23h50 e 00h30 caem no mesmo dia", () => {
  const noite = new Date(2026, 7, 13, 23, 50);
  const madrugada = new Date(2026, 7, 14, 0, 30);
  assert.equal(diaLogico(noite), "2026-08-13");
  assert.equal(diaLogico(madrugada), "2026-08-13");
});

test("diaLogico: às 5h já é o dia novo", () => {
  // A virada é às 4h justamente para caber antes do despertador das 5h.
  assert.equal(diaLogico(new Date(2026, 7, 14, 5, 0)), "2026-08-14");
  assert.equal(diaLogico(new Date(2026, 7, 14, 4, 0)), "2026-08-14");
  assert.equal(diaLogico(new Date(2026, 7, 14, 3, 59)), "2026-08-13");
});

test("porExtenso devolve semana, longa e curta", () => {
  const f = porExtenso("2026-08-13");
  assert.equal(f.semana, "quinta");
  assert.equal(f.longa, "13 de agosto");
  assert.equal(f.curta, "13/08");
});

test("mesPorExtenso e deslocarMes", () => {
  assert.equal(mesPorExtenso("2026-08"), "agosto de 2026");
  assert.equal(deslocarMes("2026-01", -1), "2025-12");
  assert.equal(deslocarMes("2026-12", 1), "2027-01");
});

test("mesDe recorta o ano-mês", () => {
  assert.equal(mesDe("2026-08-13"), "2026-08");
});

test("hoje aceita a hora injetada", () => {
  assert.equal(hoje(new Date(2026, 7, 13, 10, 0)), "2026-08-13");
});
