/**
 * Cliente mínimo do Supabase — auth e REST, nada mais.
 *
 * Escrito à mão em vez de trazer o SDK oficial por três motivos: o app é um
 * PWA que precisa abrir sem rede (dependência de CDN em runtime quebraria o
 * cold start), usamos quatro chamadas de uma API enorme, e 120KB de código de
 * terceiro no cache de um app que mostra patrimônio é superfície que ninguém
 * vai auditar. O que está aqui cabe numa leitura.
 *
 * O que ele faz: login por e-mail e senha, renovação do token antes de expirar,
 * e select/upsert nas três tabelas. O resto do PostgREST não é usado.
 */

import { CONFIG } from "./config.js";

const SESSAO_K = "rd2.sessao";

// Renova com folga: numa conexão ruim, tentar no último segundo é ficar sem
// token no meio de um envio.
const FOLGA_MS = 60_000;

let sessao = null;
let timerRenovacao = null;
const ouvintes = new Set();

/* ---------- sessão ---------- */

function lerSessaoGravada() {
  try {
    const cru = localStorage.getItem(SESSAO_K);
    return cru ? JSON.parse(cru) : null;
  } catch {
    return null;
  }
}

function gravarSessao(nova) {
  sessao = nova;
  try {
    if (nova) localStorage.setItem(SESSAO_K, JSON.stringify(nova));
    else localStorage.removeItem(SESSAO_K);
  } catch {
    // Navegador sem storage: a sessão vale enquanto a aba viver.
  }
  agendarRenovacao();
  for (const f of ouvintes) f(nova);
}

/** `expires_at` do GoTrue vem em segundos desde a época. */
function expiraEm(s) {
  return s && s.expires_at ? s.expires_at * 1000 : 0;
}

function agendarRenovacao() {
  clearTimeout(timerRenovacao);
  if (!sessao) return;

  const falta = expiraEm(sessao) - Date.now() - FOLGA_MS;
  timerRenovacao = setTimeout(() => {
    renovar().catch(() => {
      // Sem rede a renovação falha e não há o que fazer agora. A próxima
      // chamada REST tenta de novo; até lá o app roda pelo espelho local.
    });
  }, Math.max(falta, 1000));
}

export function usuario() {
  return sessao && sessao.user ? sessao.user : null;
}

export function temSessao() {
  return Boolean(sessao && sessao.access_token);
}

export function aoMudarSessao(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Chamado uma vez no boot, antes de qualquer outra coisa. */
export function restaurarSessao() {
  sessao = lerSessaoGravada();
  agendarRenovacao();
  return sessao;
}

/* ---------- autenticação ---------- */

function cabecalhosBase() {
  return {
    apikey: CONFIG.ANON,
    "Content-Type": "application/json",
  };
}

async function pedirToken(corpo, tipo) {
  const r = await fetch(
    `${CONFIG.URL}/auth/v1/token?grant_type=${tipo}`,
    { method: "POST", headers: cabecalhosBase(), body: JSON.stringify(corpo) },
  );

  const dados = await r.json().catch(() => null);

  if (!r.ok || !dados || !dados.access_token) {
    const e = new Error((dados && (dados.error_description || dados.msg)) || "falha");
    e.status = r.status;
    throw e;
  }
  return dados;
}

export async function entrar(email, senha) {
  const s = await pedirToken({ email, password: senha }, "password");
  gravarSessao(s);
  return s;
}

async function renovar() {
  if (!sessao || !sessao.refresh_token) throw new Error("sem sessão");

  try {
    const s = await pedirToken({ refresh_token: sessao.refresh_token }, "refresh_token");
    gravarSessao(s);
    return s;
  } catch (err) {
    // 4xx aqui significa refresh token morto — senha trocada, sessão revogada,
    // token expirado por desuso. Sem derrubar a sessão local, o app ficaria num
    // limbo: parece logado, mas toda chamada falha para sempre e nada na tela
    // explica por quê. Erro de rede (sem status) não derruba nada: é temporário.
    if (err.status >= 400 && err.status < 500) gravarSessao(null);
    throw err;
  }
}

/**
 * Sair avisa o servidor para invalidar o refresh token, mas não depende disso:
 * a sessão local some de qualquer jeito. Um logout que falha por falta de rede
 * e deixa o token no aparelho seria pior que inútil.
 */
export async function sair() {
  const token = sessao && sessao.access_token;
  gravarSessao(null);
  if (!token) return;
  try {
    await fetch(`${CONFIG.URL}/auth/v1/logout`, {
      method: "POST",
      headers: { ...cabecalhosBase(), Authorization: `Bearer ${token}` },
    });
  } catch {
    /* já saiu localmente */
  }
}

/* ---------- REST ---------- */

/**
 * Uma chamada só, com uma tentativa de renovação em caso de 401. Sem isso,
 * abrir o app depois de horas fechado daria erro na primeira leitura mesmo com
 * refresh token válido no bolso.
 */
async function chamar(caminho, opcoes, jaRenovou = false) {
  if (!temSessao()) throw new Error("sem sessão");

  const r = await fetch(`${CONFIG.URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      ...cabecalhosBase(),
      Authorization: `Bearer ${sessao.access_token}`,
      ...(opcoes.headers || {}),
    },
  });

  if (r.status === 401 && !jaRenovou) {
    await renovar();
    return chamar(caminho, opcoes, true);
  }

  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    const e = new Error(texto || `http ${r.status}`);
    e.status = r.status;
    throw e;
  }

  if (r.status === 204) return null;
  return r.json();
}

export function selecionar(tabela, consulta) {
  return chamar(`${tabela}?${consulta}`, { method: "GET" });
}

/**
 * Upsert. `conflito` nomeia as colunas da chave — `id` para lançamentos e
 * contas, `user_id,data` para dias.
 *
 * `merge-duplicates` é o que torna o reenvio inofensivo: a fila pode subir o
 * mesmo item duas vezes depois de uma queda de rede e o resultado é idêntico.
 */
export function gravarLinhas(tabela, linhas, conflito = "id") {
  return chamar(`${tabela}?on_conflict=${conflito}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(linhas),
  });
}
