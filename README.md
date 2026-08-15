# Registro Diário

PWA offline-first para registro diário — **treino, sono, objetivos** — e **controle de gastos**
por conta. Roda no celular e no PC com o mesmo dado nos dois.

**Sem build. Sem bundler. Sem uma única dependência de runtime.** O que está na pasta é o que roda
no navegador: módulos ES nativos servidos como arquivos estáticos.

```
Postgres (Supabase, São Paulo)  ←→  módulos ES no navegador
        RLS por linha                espelho local + fila
```

---

## Por que existe

Um app de anotação diária só serve se a série for **curta e honesta** em vez de longa e inventada.
Quase toda decisão aqui sai dessa frase, e várias delas contrariam o caminho mais fácil:

| Decisão | O caminho fácil seria | Por que não |
|---|---|---|
| Nenhum campo nasce preenchido | `Dormi às` com `22:00` de fábrica | Valor de fábrica vira dado inventado no primeiro dia de pressa — e uma média de sono calculada assim já saiu errada uma semana inteira |
| Sono só aparece com as duas pontas | Assumir um horário de despertar fixo | Sem hora de acordar medida, a "base da noite" é chute com cara de fato |
| Saldo recalculado do zero a cada render | Guardar um acumulador | Saldo salvo diverge em silêncio e não dá para auditar depois |
| Máximo 3 objetivos por dia | Lista livre | Lista de dez não é prioridade, é desejo — e no fim do dia ninguém marca nada |
| Cliente Supabase escrito à mão (~150 linhas) | SDK oficial | 120 KB de código de terceiro no cache offline de um app que mostra patrimônio é superfície que ninguém audita. São 4 chamadas de uma API enorme |
| `ajuste` guarda o delta **com sinal** | Sobrescrever o saldo | A direção do ajuste é o dado: ajuste negativo que se repete todo mês é lançamento esquecido, não bug |

## Arquitetura

### Offline-first nos dois sentidos

Grava no aparelho **primeiro**, enfileira e envia depois. Sem rede, mostra `N por enviar` e
sincroniza sozinho quando ela volta.

O id do lançamento nasce no cliente (`crypto.randomUUID()`) — é isso que torna o reenvio um
**upsert** em vez de linha duplicada. O pull é incremental por `updated_at`, com `gte` e não `gt`:
com `gt`, uma linha gravada no mesmo milissegundo do corte anterior nunca mais seria vista.

Conflito resolve por último-a-escrever-vence, **declarado** e não escondido: é um usuário em dois
aparelhos, não uma equipe editando a mesma linha.

### Segurança mora no banco

A chave `anon` é pública por definição — ela é servida a quem abrir o site. Quem protege o dado é
o **Row Level Security**: sem sessão válida, `auth.uid()` é nulo, nenhuma política casa e a chave
não lê uma linha sequer. Toda tabela tem `using` **e** `with check`; sem o segundo, um cliente
comprometido gravaria linha com o `user_id` de outra pessoa.

As views usam `security_invoker = on`. Sem isso elas rodariam com privilégio do dono e ignorariam
o RLS das tabelas base — uma porta lateral aberta.

Validação de forma acontece no banco, não só na tela: constraints garantem que uma transferência
tenha destino e não tenha categoria, que um `ajuste` não seja zero, que um treino de corrida não
carregue grupo muscular, e que o `jsonb` de objetivos tenha no máximo três itens com exatamente as
chaves esperadas.

### Uma tabela é vitrine, não fonte

`compromissos` é cópia derivada de documentos que vivem fora deste repositório. O papel logado
recebe **apenas `SELECT`** — a policy é `for select`, sem nenhuma de escrita. O app mostra e deixa
puxar um compromisso para objetivo do dia; não deixa editar nem marcar. Não é convenção, é
permissão: duas cópias editáveis do mesmo prazo divergem, e depois nenhuma das duas é confiável.

## Estrutura

| | |
|---|---|
| `publicar/` | **Só esta pasta vai ao ar.** `index.html`, `estilo.css`, `app/`, `sw.js`, `manifest.json`, `_headers` |
| `banco/` | Migrações SQL numeradas. Rodam no Supabase em ordem, nunca são publicadas |
| `testes/` | `node --test`, sem framework. Rodam aqui, nunca são publicados |
| `preview/` | Tela Dia estática, sem login e sem banco, para conferir o desenho |

### Módulos

```
app/
  config.js       endereço e chave anon do projeto (não versionado)
  supabase.js     cliente à mão: auth, refresh, select, upsert
  local.js        espelho no localStorage + fila, isolados por usuário
  sync.js         empurra a fila, depois puxa o que mudou
  datas.js        ISO no fuso local; a virada do dia é às 4h
  dinheiro.js     leitura e formatação em pt-BR, sem erro de float
  saldo.js        saldo por conta e resumo do mês
  sono.js         base da noite entre duas horas medidas
  objetivos.js    até três por dia, normalização e contagem
  treino.js       distância da corrida e grupos da força
  compromissos.js prazos, urgência e ordem de cobrança
  categorias.js   árvore de grupo → categoria
  ui.js           peças de tela; não sabe o que é um lançamento
  tela-*.js       login, dia, gastos
```

## Rodar

```bash
npx serve publicar        # módulos ES não abrem por file://
node --test testes/*.test.js
```

No **PowerShell** o glob não é expandido pelo shell, e `node --test testes/*.test.js` roda **zero
teste sem reclamar** — o pior modo de falha possível numa suíte. Lá, passe os arquivos:

```powershell
node --test (Get-ChildItem testes\*.test.js | ForEach-Object { $_.FullName })
```

### Conferir o desenho sem entrar na conta

```bash
npx serve . -l 4173       # da raiz do projeto, não de publicar/
```

Abrir `localhost:4173/preview/molduras.html`: a tela Dia em duas molduras de 390 px, escura e
clara lado a lado, com estado cheio e estado vazio. Serve para revisar interface sem depender de
login, de rede ou de ter dado no banco.

## Configurar do zero

1. **Projeto no Supabase**, região São Paulo (é a diferença entre 40 ms e 200 ms por lançamento).
2. **Criar o usuário** em Authentication → Users, e **desabilitar** "Allow new users to sign up".
3. **Rodar as migrações** de `banco/` em ordem, no SQL Editor.
4. **Copiar `app/config.exemplo.js` para `app/config.js`** e preencher URL e chave `anon`.
   A `service_role` **nunca** entra aqui: ela ignora o RLS do projeto inteiro.
5. **Publicar `publicar/`** em qualquer host estático. Trocar o domínio em `publicar/_headers`.
6. Endereço fixo importa: sessão e cache pertencem à origem. URL nova a cada deploy desloga e
   limpa o cache toda vez.

## Testes

112 testes, sem framework — `node:test` e `node:assert`. Cobrem as funções puras (datas, dinheiro,
saldo, sono, objetivos, treino, prazos, fila de sincronização) e três invariantes entre arquivos
que só quebrariam em produção:

- **todo módulo de `app/` está na lista `CASCA` do service worker** — um módulo fora dela faz o
  app abrir offline com tela branca, e isso só se manifesta sem rede;
- **todo id pedido por `el()` existe no HTML** — `el()` lança dentro de `montar()`, então um id
  renomeado derruba a tela inteira na primeira carga depois do deploy;
- **a chave publicada é a `anon`** — verificado decodificando o payload do JWT, não procurando a
  string `service_role`, que não apareceria em texto claro numa chave trocada por engano.

## Cabeçalhos

`publicar/_headers` traz CSP com `default-src 'none'`, `connect-src` restrito ao projeto Supabase,
`frame-ancestors 'none'`, HSTS e `Referrer-Policy: no-referrer`. O `sw.js` é servido com
`Cache-Control: no-cache` — um service worker vindo de cache velho trava o app numa versão antiga
sem nada na tela dizendo por quê.

## Se algo quebrar

| Sintoma | Causa provável |
|---|---|
| "e-mail ou senha não conferem" | Credencial errada. A mensagem é a mesma para os dois campos de propósito — dizer qual falhou conta a um estranho quais e-mails existem |
| Aviso "falta ligar o app ao banco" | `app/config.js` não foi preenchido |
| Entrei, mas não aparece nada | As migrações de `banco/` não foram rodadas |
| "N por enviar" que não zera | Sem rede, ou URL/chave erradas. Tocar no contador força o envio |
| "uma linha foi recusada" | O banco rejeitou por constraint. A linha saiu da fila para não travar o resto — é bug, precisa aparecer |
| Tela branca offline | Um módulo de `app/` ficou fora da lista `CASCA` do `sw.js` |
| Saldo não bate com o banco | É para isso que serve conferir. Se a diferença voltar todo mês, é lançamento esquecido |

## Licença

Projeto pessoal, sem licença de uso definida.
