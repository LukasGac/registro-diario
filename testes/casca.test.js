/**
 * Testes de integridade entre arquivos.
 *
 * Não testam lógica: testam que as três listas que precisam andar juntas
 * andaram juntas. As duas falhas que eles pegam são silenciosas em
 * desenvolvimento e fatais em produção — só aparecem offline, ou na primeira
 * abertura depois do deploy, quando não há como consertar de onde se está.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicar = join(raiz, "publicar");

const ler = (...p) => readFileSync(join(publicar, ...p), "utf8");

/**
 * `*.exemplo.js` é molde de documentação, não módulo carregado pelo app.
 * Nada o importa, então ele não pertence à casca offline.
 */
const ehModulo = (f) => f.endsWith(".js") && !f.endsWith(".exemplo.js");

test("todo módulo de app\\ está na CASCA do service worker", () => {
  // Módulo fora da CASCA = app abre offline com tela branca: o import falha e
  // nada mais roda. É a armadilha documentada no README, e ela custa uma noite
  // de registro perdida porque só se manifesta sem rede.
  const sw = ler("sw.js");
  const casca = [...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]);

  const modulos = readdirSync(join(publicar, "app"))
    .filter(ehModulo)
    .map((f) => "app/" + f);

  const faltando = modulos.filter((m) => !casca.includes(m));
  assert.deepEqual(faltando, [], "módulos fora da CASCA do sw.js: " + faltando.join(", "));
});

test("o molde config.exemplo.js existe e não carrega chave de verdade", () => {
  // É o que permite reconstruir `config.js`, que fica fora do repositório.
  // Se ele sumir, quem clonar o projeto não sabe o que preencher.
  const molde = ler("app", "config.exemplo.js");
  assert.match(molde, /SEU-PROJETO\.supabase\.co/, "a URL do molde tem de ser placeholder");
  assert.match(molde, /COLE-AQUI/, "a chave do molde tem de ser placeholder");
});

test("a CASCA não aponta para módulo que não existe mais", () => {
  // O inverso: arquivo renomeado ou apagado e a CASCA esquecida. `addAll`
  // é atômico — UM 404 e a instalação inteira do worker falha, deixando o app
  // sem cache offline nenhum, sem aviso na tela.
  const casca = [...ler("sw.js").matchAll(/"\.\/(app\/[^"]+)"/g)].map((m) => m[1]);
  const existentes = new Set(
    readdirSync(join(publicar, "app")).filter(ehModulo).map((f) => "app/" + f),
  );

  const fantasmas = casca.filter((c) => !existentes.has(c));
  assert.deepEqual(fantasmas, [], "na CASCA mas não em disco: " + fantasmas.join(", "));
});

test("todo id pedido por el() existe no index.html", () => {
  // `el()` lança quando o id não existe, e isso acontece dentro de `montar()`:
  // a tela inteira morre na abertura. Um id renomeado no HTML e esquecido no
  // JS derruba o app na primeira carga depois do deploy.
  const html = ler("index.html");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  const telas = ["tela-dia.js", "tela-gastos.js", "tela-login.js", "main.js"];
  const pedidos = new Set();

  for (const arquivo of telas) {
    const fonte = ler("app", arquivo);

    // el("x")
    for (const m of fonte.matchAll(/\bel\(\s*"([^"]+)"\s*\)/g)) pedidos.add(m[1]);

    // Listas de ids do `for (const id of [...]) els[id] = el(id)`.
    for (const bloco of fonte.matchAll(/for \(const id of \[([\s\S]*?)\]\)/g)) {
      for (const m of bloco[1].matchAll(/"([^"]+)"/g)) pedidos.add(m[1]);
    }
  }

  assert.ok(pedidos.size > 15, "o extrator não achou ids — o teste ficaria vazio e passaria à toa");

  const ausentes = [...pedidos].filter((id) => !ids.has(id));
  assert.deepEqual(ausentes, [], "pedidos pelo JS mas ausentes no HTML: " + ausentes.join(", "));
});

test("a chave publicada é a anon, não a service_role", () => {
  // A anon é pública por desenho; a service_role IGNORA o RLS por projeto. No
  // arquivo servido ao navegador, ela abriria o banco inteiro para quem
  // abrisse o código-fonte do site.
  //
  // A checagem é sobre o PAYLOAD do JWT, não sobre o texto do arquivo: o papel
  // vai codificado em base64, então uma chave trocada por engano não deixaria
  // a palavra "service_role" visível em lugar nenhum. Procurar a string, além
  // de não provar nada, reprovaria o comentário do próprio config.js que
  // explica por que ela não pode estar ali.
  const config = ler("app", "config.js");

  const chave = config.match(/ANON:\s*"([^"]+)"/);
  assert.ok(chave, "config.js precisa declarar a chave ANON");

  const partes = chave[1].split(".");
  assert.equal(partes.length, 3, "a chave precisa ser um JWT de três partes");

  const payload = JSON.parse(Buffer.from(partes[1], "base64").toString("utf8"));
  assert.equal(payload.role, "anon", "a chave publicada tem de ser a anon");
});
