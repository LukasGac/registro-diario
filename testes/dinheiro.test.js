import test from "node:test";
import assert from "node:assert/strict";

import { lerValor, moeda, mesmoValor, centavos } from "../publicar/app/dinheiro.js";

test("lerValor aceita vírgula decimal", () => {
  assert.equal(lerValor("12,50"), 12.5);
  assert.equal(lerValor("0,99"), 0.99);
});

test("lerValor aceita ponto decimal", () => {
  assert.equal(lerValor("12.50"), 12.5);
  assert.equal(lerValor("1234.56"), 1234.56);
});

test("lerValor: com os dois separadores, o último manda", () => {
  // É o que distingue o formato brasileiro do americano. Errar aqui produz
  // um lançamento mil vezes maior ou menor, sem aviso nenhum.
  assert.equal(lerValor("1.234,56"), 1234.56);
  assert.equal(lerValor("1,234.56"), 1234.56);
});

test("lerValor ignora símbolo de moeda e espaço", () => {
  assert.equal(lerValor("R$ 1.234,56"), 1234.56);
  assert.equal(lerValor(" 42 "), 42);
});

test("lerValor devolve NaN para vazio e para lixo", () => {
  assert.ok(Number.isNaN(lerValor("")));
  assert.ok(Number.isNaN(lerValor("abc")));
  assert.ok(Number.isNaN(lerValor("R$")));
});

test("moeda formata em pt-BR com duas casas", () => {
  assert.equal(moeda(1234.5), "R$ 1.234,50");
  assert.equal(moeda(0), "R$ 0,00");
});

test("moeda põe o sinal antes do R$, não depois", () => {
  // "R$ -50,00" é o que o toLocaleString faria sozinho; a linha de ajuste
  // negativo ficaria ilegível na lista.
  assert.equal(moeda(-50), "-R$ 50,00");
});

test("mesmoValor tolera o erro de float", () => {
  // 0.1 + 0.2 !== 0.3 em JS. Sem esta tolerância, conferir um saldo que bate
  // gravaria um ajuste de fração de centavo toda vez.
  assert.ok(mesmoValor(0.1 + 0.2, 0.3));
  assert.ok(mesmoValor(100, 100.004));
  assert.ok(!mesmoValor(100, 100.01));
});

test("centavos arredonda para duas casas", () => {
  assert.equal(centavos(0.1 + 0.2), 0.3);
  assert.equal(centavos(10.005), 10.01);
});
