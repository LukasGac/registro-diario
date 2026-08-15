import test from "node:test";
import assert from "node:assert/strict";

/**
 * `local.js` fala com localStorage, que não existe em Node. O stub abaixo é o
 * mínimo da API real — e precisa ser instalado ANTES do import do módulo.
 */
class StorageFalso {
  #dados = new Map();
  getItem(k) { return this.#dados.has(k) ? this.#dados.get(k) : null; }
  setItem(k, v) { this.#dados.set(k, String(v)); }
  removeItem(k) { this.#dados.delete(k); }
  get tamanho() { return this.#dados.size; }
}

globalThis.localStorage = new StorageFalso();

const local = await import("../publicar/app/local.js");

function recomecar() {
  globalThis.localStorage = new StorageFalso();
  local.abrirEspelho("usuario-1");
}

test("espelho é isolado por usuário", () => {
  // Entrar com outra conta no mesmo navegador não pode enxergar o espelho da
  // anterior: seria saldo de um somado a lançamento de outro, mudo.
  recomecar();
  local.upsertLocal("lancamentos", { id: "a", valor: 10 });
  assert.equal(Object.keys(local.lerTabela("lancamentos")).length, 1);

  local.abrirEspelho("usuario-2");
  assert.deepEqual(local.lerTabela("lancamentos"), {});

  local.abrirEspelho("usuario-1");
  assert.equal(local.lerTabela("lancamentos").a.valor, 10);
});

test("dias é chaveado por data; o resto por id", () => {
  recomecar();
  local.upsertLocal("dias", { data: "2026-08-13", treino: "forca" });
  local.upsertLocal("dias", { data: "2026-08-13", treino: "corrida" });

  const dias = local.lerTabela("dias");
  assert.equal(Object.keys(dias).length, 1);
  assert.equal(dias["2026-08-13"].treino, "corrida");
});

test("desenfileirarSe apaga quando a linha não mudou", () => {
  recomecar();
  const linha = { id: "a", valor: 10 };
  local.enfileirar("lancamentos", linha);
  assert.equal(local.tamanhoDaFila(), 1);

  assert.equal(local.desenfileirarSe("lancamentos:a", linha), true);
  assert.equal(local.tamanhoDaFila(), 0);
});

test("desenfileirarSe NÃO apaga se a linha mudou durante o envio", () => {
  // O caso que este guarda protege: o envio de R$ 10 está no ar, o usuário
  // corrige para R$ 20, e a resposta do primeiro chega. Sem o guarda, a versão
  // de R$ 20 sairia da fila sem nunca ter sido enviada — sumia do banco com o
  // contador em zero e nada avisando.
  recomecar();
  const antiga = { id: "a", valor: 10 };
  local.enfileirar("lancamentos", antiga);
  local.enfileirar("lancamentos", { id: "a", valor: 20 });

  assert.equal(local.desenfileirarSe("lancamentos:a", antiga), false);
  assert.equal(local.tamanhoDaFila(), 1);
  assert.equal(local.lerFila()["lancamentos:a"].linha.valor, 20);
});

test("desenfileirarSe em chave inexistente não quebra", () => {
  recomecar();
  assert.equal(local.desenfileirarSe("lancamentos:fantasma", { id: "x" }), false);
});

test("estaNaFila distingue tabela", () => {
  // 'dias:2026-08-13' e um lançamento não podem colidir na mesma fila.
  recomecar();
  local.enfileirar("dias", { data: "2026-08-13" });
  assert.equal(local.estaNaFila("dias", "2026-08-13"), true);
  assert.equal(local.estaNaFila("lancamentos", "2026-08-13"), false);
});

test("aplicarLote sobrescreve o espelho com a versão do servidor", () => {
  recomecar();
  local.upsertLocal("lancamentos", { id: "a", valor: 10 });
  local.aplicarLote("lancamentos", [
    { id: "a", valor: 10, updated_at: "2026-08-13T10:00:00Z" },
    { id: "b", valor: 20, updated_at: "2026-08-13T10:00:01Z" },
  ]);

  const t = local.lerTabela("lancamentos");
  assert.equal(Object.keys(t).length, 2);
  assert.equal(t.a.updated_at, "2026-08-13T10:00:00Z");
});

test("pull não sobrescreve linha que ainda está na fila", () => {
  // O cenário: você corrige um lançamento no celular offline, e nesse meio
  // tempo o PC já tinha subido a versão antiga. Ao voltar a rede, o pull traz
  // a versão do servidor. Se ela fosse aplicada, a correção feita no celular
  // sumiria antes de ter chance de subir.
  recomecar();
  local.upsertLocal("lancamentos", { id: "a", valor: 99 });
  local.enfileirar("lancamentos", { id: "a", valor: 99 });

  const doServidor = [
    { id: "a", valor: 10, updated_at: "2026-08-13T10:00:00Z" },
    { id: "b", valor: 20, updated_at: "2026-08-13T10:00:01Z" },
  ];

  const aplicaveis = local.filtrarNaoEnfileiradas("lancamentos", doServidor);
  assert.deepEqual(aplicaveis.map((l) => l.id), ["b"]);

  local.aplicarLote("lancamentos", aplicaveis);
  assert.equal(local.lerTabela("lancamentos").a.valor, 99);
  assert.equal(local.lerTabela("lancamentos").b.valor, 20);
});

test("filtrarNaoEnfileiradas usa a chave certa por tabela", () => {
  // `dias` casa por data, não por id. Errar a chave aqui faria o filtro nunca
  // reconhecer o dia enfileirado e sobrescrever o registro do dia toda vez.
  recomecar();
  local.enfileirar("dias", { data: "2026-08-13", treino: "forca" });

  const aplicaveis = local.filtrarNaoEnfileiradas("dias", [
    { data: "2026-08-13", treino: "nada" },
    { data: "2026-08-12", treino: "corrida" },
  ]);
  assert.deepEqual(aplicaveis.map((l) => l.data), ["2026-08-12"]);
});

test("cursor é guardado por tabela", () => {
  recomecar();
  local.gravarCursor("lancamentos", "2026-08-13T10:00:00Z");
  assert.equal(local.lerCursor("lancamentos"), "2026-08-13T10:00:00Z");
  assert.equal(local.lerCursor("dias"), null);
});

test("JSON corrompido devolve vazio em vez de derrubar o app", () => {
  recomecar();
  localStorage.setItem("rd2.usuario-1.lancamentos", "{ isto não é json");
  assert.deepEqual(local.lerTabela("lancamentos"), {});
});

test("limparEspelho apaga tudo do usuário", () => {
  recomecar();
  local.upsertLocal("lancamentos", { id: "a", valor: 10 });
  local.enfileirar("lancamentos", { id: "a", valor: 10 });
  local.gravarCursor("lancamentos", "x");

  local.limparEspelho();
  assert.equal(localStorage.tamanho, 0);
});

test("ler antes de abrir o espelho é erro, não silêncio", () => {
  globalThis.localStorage = new StorageFalso();
  local.limparEspelho();
  assert.throws(() => local.lerTabela("lancamentos"), /não foi aberto/);
});
