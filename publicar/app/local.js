/**
 * Espelho local e fila de pendências.
 *
 * O banco é a fonte de verdade; isto aqui é a cópia que faz o app abrir sem
 * rede e aceitar lançamento no mercado sem sinal. Guarda as linhas no formato
 * do banco, sem tradução.
 *
 * Tudo é prefixado pelo id do usuário. Sem isso, entrar com outra conta no
 * mesmo navegador leria o espelho da anterior — saldo de uma pessoa somado ao
 * lançamento de outra, sem nada na tela denunciando.
 */

const TABELAS = ["contas", "lancamentos", "dias", "compromissos"];

let prefixo = null;

export function abrirEspelho(userId) {
  if (!userId) throw new Error("espelho sem usuário");
  prefixo = "rd2." + userId + ".";
}

export function espelhoAberto() {
  return prefixo !== null;
}

function chave(nome) {
  if (!prefixo) throw new Error("espelho não foi aberto");
  return prefixo + nome;
}

function ler(nome, vazio) {
  // `chave()` fica FORA do try de propósito. Ela só falha quando o espelho não
  // foi aberto, que é erro de programação — e engoli-lo aqui faria o app
  // mostrar saldo vazio em silêncio, que é o pior desfecho possível num app
  // de dinheiro. O try cobre apenas o que é falha de ambiente.
  const k = chave(nome);
  try {
    const cru = localStorage.getItem(k);
    return cru ? JSON.parse(cru) : vazio;
  } catch {
    // JSON corrompido ou storage bloqueado não derruba o app: perde-se o
    // cache, não o dado — o pull seguinte reconstrói do banco.
    return vazio;
  }
}

function gravar(nome, valor) {
  const k = chave(nome);
  try {
    localStorage.setItem(k, JSON.stringify(valor));
    return true;
  } catch {
    // Cota estourada ou modo privado. Quem chama decide o que dizer na tela.
    return false;
  }
}

/* ---------- espelho ---------- */

/** A chave de uma linha no espelho. `dias` usa a data; o resto usa o id. */
export function chaveDaLinha(tabela, linha) {
  return tabela === "dias" ? linha.data : linha.id;
}

export function lerTabela(tabela) {
  return ler(tabela, {});
}

export function gravarTabela(tabela, obj) {
  return gravar(tabela, obj);
}

export function upsertLocal(tabela, linha) {
  const todas = lerTabela(tabela);
  todas[chaveDaLinha(tabela, linha)] = linha;
  return gravarTabela(tabela, todas);
}

/** Aplica um lote vindo do servidor. Sobrescreve: o servidor é a verdade. */
export function aplicarLote(tabela, linhas) {
  if (!linhas.length) return;
  const todas = lerTabela(tabela);
  for (const linha of linhas) todas[chaveDaLinha(tabela, linha)] = linha;
  gravarTabela(tabela, todas);
}

/* ---------- fila ---------- */

/**
 * Uma fila só para as três tabelas. A chave carrega a tabela junto para que
 * `dias:2026-08-13` e um lançamento nunca colidam.
 */
export function chaveDaFila(tabela, linha) {
  return tabela + ":" + chaveDaLinha(tabela, linha);
}

export function lerFila() {
  return ler("fila", {});
}

export function enfileirar(tabela, linha) {
  const f = lerFila();
  f[chaveDaFila(tabela, linha)] = { tabela, linha };
  gravar("fila", f);
}

/**
 * Só apaga da fila se o que está lá AGORA é exatamente o que acabou de subir.
 *
 * Enquanto um envio está no ar, o usuário pode ter apagado o lançamento ou
 * editado o dia com outro valor — a fila já guarda outra coisa. Apagar por
 * chave, cego, jogaria essa versão nova fora: ela sumiria sem nunca ter sido
 * enviada, com o contador em zero e nada avisando.
 */
export function desenfileirarSe(chaveFila, enviado) {
  const f = lerFila();
  if (!Object.prototype.hasOwnProperty.call(f, chaveFila)) return false;
  if (JSON.stringify(f[chaveFila].linha) !== JSON.stringify(enviado)) return false;
  delete f[chaveFila];
  gravar("fila", f);
  return true;
}

export function tamanhoDaFila() {
  return Object.keys(lerFila()).length;
}

export function estaNaFila(tabela, chaveLinha) {
  return Object.prototype.hasOwnProperty.call(lerFila(), tabela + ":" + chaveLinha);
}

/**
 * Das linhas que o servidor mandou, quais podem ser aplicadas ao espelho.
 *
 * Uma linha que ainda está na fila tem versão local mais nova por definição —
 * ela existe justamente porque ainda não subiu. Aplicar a do servidor por cima
 * apagaria uma edição que o usuário fez, sem nada na tela dizendo que sumiu.
 * A da fila vence, e vence no próximo push.
 */
export function filtrarNaoEnfileiradas(tabela, linhas) {
  const fila = lerFila();
  return linhas.filter(
    (l) =>
      !Object.prototype.hasOwnProperty.call(fila, tabela + ":" + chaveDaLinha(tabela, l)),
  );
}

/* ---------- cursor da sincronização ---------- */

export function lerCursores() {
  return ler("cursor", {});
}

export function lerCursor(tabela) {
  return lerCursores()[tabela] || null;
}

export function gravarCursor(tabela, ts) {
  const c = lerCursores();
  c[tabela] = ts;
  gravar("cursor", c);
}

/* ---------- preferências de tela ---------- */

export function lerPreferencia(nome, padrao) {
  const p = ler("pref", {});
  return Object.prototype.hasOwnProperty.call(p, nome) ? p[nome] : padrao;
}

export function gravarPreferencia(nome, valor) {
  const p = ler("pref", {});
  p[nome] = valor;
  gravar("pref", p);
}

/* ---------- saída ---------- */

/**
 * Sair da conta apaga o espelho: dado financeiro não fica num navegador depois
 * que a sessão acabou. A fila é apagada junto e isso é uma perda real — por
 * isso quem chama avisa antes se houver pendência.
 */
export function limparEspelho() {
  if (!prefixo) return;
  for (const nome of [...TABELAS, "fila", "cursor", "pref"]) {
    try {
      localStorage.removeItem(chave(nome));
    } catch {
      /* navegador sem storage: não há o que limpar */
    }
  }
  prefixo = null;
}
