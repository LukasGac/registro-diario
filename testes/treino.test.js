import test from "node:test";
import assert from "node:assert/strict";

import {
  GRUPOS, KM_MAXIMO, pedeKm, pedeGrupos, lerKm, formatarKm,
  normalizarGrupos, detalheCoerente, resumo,
} from "../publicar/app/treino.js";

test("os seis grupos são exatamente os que o banco aceita", () => {
  // Se esta lista divergir da constraint de 005-treino-e-compromissos.sql, o
  // banco recusa a linha e o dia sai da fila como "linha recusada".
  assert.deepEqual(
    GRUPOS.map((g) => g.v).sort(),
    ["biceps", "costas", "ombro", "peito", "perna", "triceps"],
  );
});

test("cada modalidade pede o detalhe certo", () => {
  assert.equal(pedeKm("corrida"), true);
  assert.equal(pedeKm("ambos"), true);
  assert.equal(pedeKm("forca"), false);
  assert.equal(pedeKm("nada"), false);
  assert.equal(pedeKm(""), false);

  assert.equal(pedeGrupos("forca"), true);
  assert.equal(pedeGrupos("ambos"), true);
  assert.equal(pedeGrupos("corrida"), false);
  assert.equal(pedeGrupos("nada"), false);
});

test("lerKm aceita vírgula e ponto", () => {
  // O teclado numérico em pt-BR entrega vírgula.
  assert.equal(lerKm("8,5"), 8.5);
  assert.equal(lerKm("8.5"), 8.5);
  assert.equal(lerKm(" 15 "), 15);
  assert.equal(lerKm("0,75"), 0.75);
});

test("lerKm recusa o que não é distância", () => {
  // Zero não é corrida; negativo não existe; texto é erro de digitação.
  for (const v of ["", null, undefined, "abc", "0", "-3", "1e5"]) {
    assert.equal(lerKm(v), null, "deveria recusar: " + JSON.stringify(v));
  }
});

test("lerKm respeita o teto da constraint", () => {
  assert.equal(lerKm(String(KM_MAXIMO)), KM_MAXIMO);
  assert.equal(lerKm(String(KM_MAXIMO + 1)), null);
});

test("lerKm arredonda para as duas casas que a coluna guarda", () => {
  // numeric(5,2). Sem arredondar aqui, o banco arredondaria e a tela
  // mostraria um número diferente do que foi gravado.
  assert.equal(lerKm("8,567"), 8.57);
  assert.equal(lerKm("8,564"), 8.56);
});

test("formatarKm devolve vírgula e não põe zero à toa", () => {
  assert.equal(formatarKm(8.5), "8,5");
  assert.equal(formatarKm(8), "8");
  assert.equal(formatarKm(null), "");
  assert.equal(formatarKm(undefined), "");
  assert.equal(formatarKm(""), "");
  // O banco devolve numeric como string.
  assert.equal(formatarKm("15.00"), "15");
});

test("os grupos saem sempre na mesma ordem, sem repetido", () => {
  // Ordem instável faria {peito,costas} e {costas,peito} parecerem mudanças
  // diferentes na sincronização, gerando conflito onde não há.
  assert.deepEqual(normalizarGrupos(["perna", "costas"]), ["costas", "perna"]);
  assert.deepEqual(normalizarGrupos(["costas", "perna"]), ["costas", "perna"]);
  assert.deepEqual(normalizarGrupos(["costas", "costas"]), ["costas"]);
});

test("grupo inventado é descartado, não sobe", () => {
  assert.deepEqual(normalizarGrupos(["costas", "abdomen", "panturrilha"]), ["costas"]);
});

test("sem grupo nenhum devolve null, não lista vazia", () => {
  // A constraint exige de 1 a 6 elementos: `[]` seria recusado pelo banco.
  assert.equal(normalizarGrupos([]), null);
  assert.equal(normalizarGrupos(["nada disso"]), null);
  assert.equal(normalizarGrupos(null), null);
  assert.equal(normalizarGrupos("costas"), null);
});

test("os seis de uma vez cabem", () => {
  const todos = GRUPOS.map((g) => g.v);
  assert.equal(normalizarGrupos(todos).length, 6);
});

test("trocar a modalidade descarta o detalhe que não cabe nela", () => {
  // É a constraint `treino_detalhe_coerente` do banco, aplicada antes de subir:
  // quem digita 8 km e depois troca para força deixaria um km órfão, e o banco
  // recusaria a linha inteira.
  assert.deepEqual(detalheCoerente("forca", 8, ["costas"]), {
    treino_km: null,
    treino_grupos: ["costas"],
  });

  assert.deepEqual(detalheCoerente("corrida", 8, ["costas"]), {
    treino_km: 8,
    treino_grupos: null,
  });

  assert.deepEqual(detalheCoerente("ambos", 8, ["costas", "ombro"]), {
    treino_km: 8,
    treino_grupos: ["costas", "ombro"],
  });

  assert.deepEqual(detalheCoerente("nada", 8, ["costas"]), {
    treino_km: null,
    treino_grupos: null,
  });
});

test("modalidade em branco não carrega detalhe nenhum", () => {
  assert.deepEqual(detalheCoerente("", 8, ["costas"]), {
    treino_km: null,
    treino_grupos: null,
  });
});

test("o resumo do histórico junta distância e grupos", () => {
  assert.equal(resumo(8.5, null), "8,5 km");
  assert.equal(resumo(null, ["costas", "ombro"]), "costas, ombro");
  assert.equal(resumo(5, ["perna"]), "5 km · perna");
  assert.equal(resumo(null, null), "");
});

test("o resumo usa o rótulo com acento, não o valor do banco", () => {
  assert.equal(resumo(null, ["biceps", "triceps"]), "bíceps, tríceps");
});
