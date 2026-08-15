/**
 * Service worker do Registro Diário.
 *
 * Existe por um motivo só: o app é offline-first — grava no aparelho e
 * enfileira o envio — mas sem worker o cold start offline nem carrega. Você
 * toca no ícone da tela inicial às 22h sem rede e recebe a tela de erro do
 * navegador; a fila no aparelho nunca chega a rodar.
 *
 * Estratégia: rede primeiro, cache como rede de segurança. Um deploy novo
 * aparece na hora em que houver rede, e não fica versão velha grudada no
 * aparelho — o inverso (cache primeiro) já custou horas de "por que a correção
 * não subiu" em app parecido.
 *
 * Só toca em GET do próprio site. As chamadas ao Supabase são de outra origem
 * e passam direto, sem cache e sem interceptação: resposta de banco não se
 * serve de memória, e um token no cache seria um erro de segurança.
 */

var VERSAO = "registro-v4";

/**
 * Com módulos ES, a casca deixou de ser um arquivo. Se um módulo faltar aqui,
 * o app abre offline com tela branca — o import falha e nada mais roda.
 */
var CASCA = [
  "./",
  "./index.html",
  "./manifest.json",
  "./estilo.css",
  "./app/main.js",
  "./app/config.js",
  "./app/supabase.js",
  "./app/local.js",
  "./app/sync.js",
  "./app/ui.js",
  "./app/datas.js",
  "./app/sono.js",
  "./app/objetivos.js",
  "./app/treino.js",
  "./app/compromissos.js",
  "./app/dinheiro.js",
  "./app/categorias.js",
  "./app/saldo.js",
  "./app/tela-login.js",
  "./app/tela-dia.js",
  "./app/tela-gastos.js",
];

self.addEventListener("install", function (ev) {
  ev.waitUntil(
    caches
      .open(VERSAO)
      .then(function (c) {
        return c.addAll(CASCA);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches
      .keys()
      .then(function (chaves) {
        return Promise.all(
          chaves.map(function (k) {
            return k === VERSAO ? null : caches.delete(k);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;

  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req)
      .then(function (resp) {
        // `basic` exclui resposta opaca e erro travestido de resposta.
        if (resp && resp.ok && resp.type === "basic") {
          var copia = resp.clone();
          caches.open(VERSAO).then(function (c) {
            c.put(req, copia);
          });
        }
        return resp;
      })
      .catch(function () {
        return caches.match(req).then(function (achado) {
          if (achado) return achado;
          // Navegação sem rede e sem a URL exata em cache (ex.: `?algo`):
          // a casca serve igual, o estado vive no espelho local.
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
      }),
  );
});
