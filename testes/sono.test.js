import test from "node:test";
import assert from "node:assert/strict";

import {
  emMinutos, minutosDeSono, plausivel, formatarDuracao, baseDeSono,
  MIN_PLAUSIVEL, MAX_PLAUSIVEL,
} from "../publicar/app/sono.js";

test("emMinutos aceita as duas formas de time", () => {
  // O input[type=time] manda "22:00"; o Postgres devolve "22:00:00".
  assert.equal(emMinutos("22:00"), 1320);
  assert.equal(emMinutos("22:00:00"), 1320);
  assert.equal(emMinutos("00:00"), 0);
  assert.equal(emMinutos("05:30"), 330);
});

test("emMinutos recusa lixo em vez de devolver NaN", () => {
  // NaN se propagaria pela conta e viraria "NaNh00" na tela.
  for (const v of ["", null, undefined, "abc", "25:00", "12:99", "7"]) {
    assert.equal(emMinutos(v), null, "deveria recusar: " + JSON.stringify(v));
  }
});

test("a noite atravessa a meia-noite", () => {
  assert.equal(minutosDeSono("22:00", "05:00"), 420); // 7h
  assert.equal(minutosDeSono("00:30", "06:00"), 330); // 5h30
  assert.equal(minutosDeSono("23:45", "07:15"), 450); // 7h30
});

test("a noite que não atravessa também conta", () => {
  // Dormiu às 2h da manhã e acordou às 6h: mesma data, 4 horas.
  assert.equal(minutosDeSono("02:00", "06:00"), 240);
});

test("falta uma ponta, não há base", () => {
  // O ponto inteiro desta migração: sem a hora de acordar, não se inventa.
  assert.equal(minutosDeSono("22:00", ""), null);
  assert.equal(minutosDeSono("", "05:00"), null);
  assert.equal(minutosDeSono(null, null), null);
});

test("horas iguais dão 24h, e isso é visível de propósito", () => {
  const min = minutosDeSono("22:00", "22:00");
  assert.equal(min, 1440);
  assert.equal(plausivel(min), false, "24h tem de cair fora da faixa plausível");
});

test("plausivel marca as bordas da faixa", () => {
  assert.equal(plausivel(MIN_PLAUSIVEL), true);
  assert.equal(plausivel(MAX_PLAUSIVEL), true);
  assert.equal(plausivel(MIN_PLAUSIVEL - 1), false);
  assert.equal(plausivel(MAX_PLAUSIVEL + 1), false);
  assert.equal(plausivel(null), false);
});

test("formatarDuracao sempre com dois dígitos no minuto", () => {
  assert.equal(formatarDuracao(420), "7h00");
  assert.equal(formatarDuracao(305), "5h05");
  assert.equal(formatarDuracao(0), "0h00");
  assert.equal(formatarDuracao(null), "—");
  assert.equal(formatarDuracao(undefined), "—");
});

test("baseDeSono conta só noite com as duas pontas", () => {
  const dias = {
    "2026-08-13": { dormiu: "23:00:00", acordou: "06:00:00" }, // 7h  — conta
    "2026-08-12": { dormiu: "00:00:00", acordou: "05:00:00" }, // 5h  — conta
    "2026-08-11": { dormiu: "22:00:00", acordou: null },       // sem par
    "2026-08-10": { dormiu: null, acordou: null },             // vazio
  };

  const base = baseDeSono(dias);
  assert.equal(base.noites, 2);
  assert.equal(base.minutos, 360); // média de 7h e 5h
});

test("baseDeSono descarta noite implausível em vez de deixá-la puxar a média", () => {
  const dias = {
    "2026-08-13": { dormiu: "23:00:00", acordou: "06:00:00" }, // 7h
    "2026-08-12": { dormiu: "22:00:00", acordou: "22:00:00" }, // 24h, dedo errado
  };

  const base = baseDeSono(dias);
  assert.equal(base.noites, 1);
  assert.equal(base.minutos, 420);
});

test("baseDeSono olha só a janela pedida, da data mais recente para trás", () => {
  const dias = {
    "2026-08-14": { dormiu: "23:00:00", acordou: "06:00:00" }, // 7h
    "2026-08-13": { dormiu: "23:00:00", acordou: "06:00:00" }, // 7h
    "2026-08-01": { dormiu: "20:00:00", acordou: "08:00:00" }, // 12h, fora da janela
  };

  const base = baseDeSono(dias, 2);
  assert.equal(base.noites, 2);
  assert.equal(base.minutos, 420);
});

test("baseDeSono sem nada medido não devolve zero", () => {
  // Zero seria lido como "dormiu nada". A ausência tem de ser nula.
  const base = baseDeSono({});
  assert.equal(base.noites, 0);
  assert.equal(base.minutos, null);

  assert.deepEqual(baseDeSono(null), { minutos: null, noites: 0 });
});
