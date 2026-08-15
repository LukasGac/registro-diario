import test from "node:test";
import assert from "node:assert/strict";

import { montarCorpo } from "../publicar/app/sync.js";

const EU = "11111111-2222-3333-4444-555555555555";

test("o user_id vem sempre da sessão, nunca da linha", () => {
  // Se a linha pudesse ditar o user_id, um espelho local adulterado tentaria
  // gravar em nome de outra pessoa. O RLS recusaria — mas a defesa não pode
  // depender só da última camada.
  const corpo = montarCorpo(
    "dias",
    { data: "2026-08-14", user_id: "00000000-0000-0000-0000-000000000000" },
    EU,
  );
  assert.equal(corpo.user_id, EU);
});

test("campos do servidor nunca sobem", () => {
  // `criado_em` e `updated_at` pertencem ao relógio do servidor. Se subissem,
  // um celular com a hora errada envenenaria o cursor do pull incremental.
  const corpo = montarCorpo(
    "dias",
    { data: "2026-08-14", criado_em: "2020-01-01", updated_at: "2020-01-01" },
    EU,
  );
  assert.equal("criado_em" in corpo, false);
  assert.equal("updated_at" in corpo, false);
});

test("dia enfileirado por uma versão antiga do app não sobe objetivos nulo", () => {
  // Este é o caso que o mapa PADROES existe para cobrir. A coluna é
  // `not null default '[]'`; um null explícito viraria 400, a linha sairia da
  // fila e o dia inteiro se perderia com "uma linha foi recusada".
  const antiga = { data: "2026-08-13", treino: "forca", dormiu: "23:00" };
  const corpo = montarCorpo("dias", antiga, EU);

  assert.deepEqual(corpo.objetivos, []);
  assert.equal(corpo.acordou, null, "coluna nova sem padrão continua nula");
});

test("objetivos nulo explícito também vira lista vazia", () => {
  const corpo = montarCorpo("dias", { data: "2026-08-13", objetivos: null }, EU);
  assert.deepEqual(corpo.objetivos, []);
});

test("objetivos preenchidos passam intactos", () => {
  const objetivos = [{ texto: "publicar", feito: true }];
  const corpo = montarCorpo("dias", { data: "2026-08-14", objetivos }, EU);
  assert.deepEqual(corpo.objetivos, objetivos);
});

test("lista vazia não é confundida com ausente", () => {
  // `[]` é falsy-adjacente em muitas checagens preguiçosas; aqui tem de
  // atravessar como está.
  const corpo = montarCorpo("dias", { data: "2026-08-14", objetivos: [] }, EU);
  assert.deepEqual(corpo.objetivos, []);
});

test("o dia sobe com todas as colunas, inclusive as novas", () => {
  const corpo = montarCorpo(
    "dias",
    {
      data: "2026-08-14", treino: "ambos", treino_km: 8.5,
      treino_grupos: ["costas", "ombro"], dormiu: "23:30", acordou: "05:40",
      energia: 3, janela: "escrevi a oferta", objetivos: [],
    },
    EU,
  );

  assert.deepEqual(Object.keys(corpo).sort(), [
    "acordou", "data", "dormiu", "energia", "janela", "objetivos",
    "treino", "treino_grupos", "treino_km", "user_id",
  ]);
  assert.equal(corpo.acordou, "05:40");
  assert.equal(corpo.treino_km, 8.5);
  assert.deepEqual(corpo.treino_grupos, ["costas", "ombro"]);
});

test("dia sem detalhe de treino sobe com as colunas nulas", () => {
  const corpo = montarCorpo("dias", { data: "2026-08-14", treino: "nada" }, EU);
  assert.equal(corpo.treino_km, null);
  assert.equal(corpo.treino_grupos, null);
});

test("compromissos não tem como subir — é vitrine de leitura", () => {
  // A tabela é cópia derivada dos arquivos de `vida\` e o banco só concede
  // SELECT nela. Ficar fora de CAMPOS faz a tentativa falhar aqui, com uma
  // frase, em vez de virar um 401 sem explicação no meio da fila.
  assert.throws(
    () => montarCorpo("compromissos", { id: "x", titulo: "algo" }, EU),
    /tabela desconhecida/,
  );
});

test("o padrão de uma tabela não vaza para outra", () => {
  // PADROES é por tabela. Um lançamento não tem `objetivos`, e não pode
  // ganhar a chave por engano — o PostgREST recusaria coluna inexistente.
  const corpo = montarCorpo(
    "lancamentos",
    { id: "abc", data: "2026-08-14", tipo: "saida", valor: 10 },
    EU,
  );
  assert.equal("objetivos" in corpo, false);
  assert.equal(corpo.descricao, null);
  assert.equal(corpo.deleted_at, null);
});

test("zero e string vazia não são tratados como ausentes", () => {
  // `0` e `""` são falsy. Uma checagem por `!linha[campo]` os transformaria
  // em null e apagaria um ajuste de valor zero ou uma descrição em branco.
  const corpo = montarCorpo(
    "contas",
    { id: "c1", slug: "nubank", nome: "Nubank", ordem: 0, saldo_inicial: 0 },
    EU,
  );
  assert.equal(corpo.ordem, 0);
  assert.equal(corpo.saldo_inicial, 0);
});

test("tabela desconhecida falha alto em vez de subir corpo vazio", () => {
  assert.throws(() => montarCorpo("inventada", {}, EU), /tabela desconhecida/);
});
