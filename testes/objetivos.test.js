import test from "node:test";
import assert from "node:assert/strict";

import {
  slotsVazios, paraSlots, normalizar, contar, estados,
  MAXIMO, TAMANHO_MAXIMO,
} from "../publicar/app/objetivos.js";

test("slotsVazios devolve sempre três, independentes entre si", () => {
  const s = slotsVazios();
  assert.equal(s.length, MAXIMO);

  // Se os três slots fossem o MESMO objeto, digitar no primeiro escreveria
  // nos três. É o bug clássico de Array(3).fill({}).
  s[0].texto = "um";
  assert.equal(s[1].texto, "");
});

test("paraSlots completa até três e preserva a ordem", () => {
  const s = paraSlots([{ texto: "publicar", feito: true }]);
  assert.equal(s.length, MAXIMO);
  assert.deepEqual(s[0], { texto: "publicar", feito: true });
  assert.deepEqual(s[1], { texto: "", feito: false });
});

test("paraSlots aguenta linha gravada antes desta versão", () => {
  // Dia salvo pelo app antigo não tem a coluna: não pode explodir a tela.
  assert.deepEqual(paraSlots(undefined), slotsVazios());
  assert.deepEqual(paraSlots(null), slotsVazios());
  assert.deepEqual(paraSlots("nada disso"), slotsVazios());
  assert.deepEqual(paraSlots([null, 42, "x"]), slotsVazios());
});

test("paraSlots ignora excedente além de três", () => {
  const s = paraSlots([
    { texto: "a", feito: false },
    { texto: "b", feito: false },
    { texto: "c", feito: false },
    { texto: "d", feito: true },
  ]);
  assert.equal(s.length, MAXIMO);
  assert.equal(s[2].texto, "c");
});

test("normalizar apara o texto e descarta slot vazio", () => {
  const saida = normalizar([
    { texto: "  ligar para o contador  ", feito: false },
    { texto: "   ", feito: false },
    { texto: "", feito: false },
  ]);

  assert.deepEqual(saida, [{ texto: "ligar para o contador", feito: false }]);
});

test("objetivo em branco marcado como feito não entra", () => {
  // Senão a contagem de cumprimento infla com nada.
  assert.deepEqual(normalizar([{ texto: "  ", feito: true }]), []);
});

test("normalizar corta no limite da constraint do banco", () => {
  const longo = "x".repeat(TAMANHO_MAXIMO + 50);
  const saida = normalizar([{ texto: longo, feito: false }]);
  assert.equal(saida[0].texto.length, TAMANHO_MAXIMO);
});

test("o corte nunca parte um emoji ao meio", () => {
  // Um surrogate solto vira escape inválido no JSON, o Postgres recusa o
  // jsonb, o sync devolve 400 e o dia inteiro se perde. O corte tem de ser
  // por ponto de código, não por unidade UTF-16.
  const texto = "x".repeat(TAMANHO_MAXIMO - 1) + "😀";
  const saida = normalizar([{ texto, feito: false }]);

  assert.equal(Array.from(saida[0].texto).length, TAMANHO_MAXIMO);
  assert.equal(saida[0].texto.endsWith("😀"), true);

  // Nenhum surrogate solto: a ida e volta por JSON tem de ser fiel.
  assert.equal(JSON.parse(JSON.stringify(saida[0].texto)), saida[0].texto);
  assert.equal(/[\uD800-\uDFFF]/.test(saida[0].texto.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")), false);
});

test("o corte por ponto de código conta como o char_length do banco", () => {
  // 121 emojis = 242 unidades UTF-16, mas 121 caracteres para o Postgres.
  // Cortar por unidade deixaria passar o dobro do que a constraint aceita.
  const saida = normalizar([{ texto: "😀".repeat(TAMANHO_MAXIMO + 1), feito: false }]);
  assert.equal(Array.from(saida[0].texto).length, TAMANHO_MAXIMO);
});

test("texto dentro do limite passa intacto", () => {
  const texto = "publicar a lotérica no ar";
  assert.equal(normalizar([{ texto, feito: true }])[0].texto, texto);
});

test("normalizar nunca devolve mais que o máximo", () => {
  const muitos = Array.from({ length: 9 }, (_, i) => ({ texto: "o" + i, feito: false }));
  assert.equal(normalizar(muitos).length, MAXIMO);
});

test("normalizar força feito a booleano", () => {
  // O banco recusa jsonb com `feito` que não seja boolean.
  const saida = normalizar([{ texto: "a", feito: "sim" }, { texto: "b" }]);
  assert.equal(saida[0].feito, true);
  assert.equal(saida[1].feito, false);
});

test("normalizar aguenta entrada estragada", () => {
  assert.deepEqual(normalizar(null), []);
  assert.deepEqual(normalizar([null, undefined]), []);
});

test("contar e estados leem a mesma lista, na mesma ordem", () => {
  const lista = [
    { texto: "a", feito: true },
    { texto: "b", feito: false },
    { texto: "c", feito: true },
  ];

  assert.deepEqual(contar(lista), { feitos: 2, total: 3 });
  assert.deepEqual(estados(lista), [true, false, true]);
});

test("estados devolve booleano de verdade, não o valor cru", () => {
  // O histórico decide a classe CSS por este valor; um "sim" ou um 1 viraria
  // marcador aceso sem que o dado fosse booleano no banco.
  assert.deepEqual(estados([{ texto: "a" }, { texto: "b", feito: "sim" }]), [false, true]);
});

test("dia sem objetivo não desenha marcador nenhum", () => {
  assert.deepEqual(estados([]), []);
  assert.deepEqual(estados(undefined), []);
  assert.deepEqual(contar(undefined), { feitos: 0, total: 0 });
});
