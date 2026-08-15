/**
 * Tela de entrada.
 *
 * É a peça que substituiu a decisão antiga de "o endpoint só escreve". O dado
 * agora é legível pela rede, e é isto aqui — mais o Row Level Security do
 * banco — que decide quem lê.
 */

import { el } from "./ui.js";
import { configurado } from "./config.js";
import * as api from "./supabase.js";

export function montar(aoEntrar) {
  const form = el("formEntrar");
  const email = el("email");
  const senha = el("senha");
  const botao = el("btnEntrar");
  const status = el("statusEntrar");

  if (!configurado()) {
    el("avisoConfig").hidden = false;
    botao.disabled = true;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (botao.disabled) return;

    botao.disabled = true;
    status.textContent = "entrando…";
    status.className = "status";

    try {
      await api.entrar(email.value.trim(), senha.value);
      senha.value = "";
      status.textContent = "";
      aoEntrar();
    } catch (err) {
      // Mensagem única para credencial errada, venha de e-mail ou de senha:
      // dizer qual dos dois falhou conta a um estranho quais e-mails existem.
      status.textContent =
        err.status === 400 || err.status === 401
          ? "e-mail ou senha não conferem"
          : navigator.onLine
            ? "não deu para entrar agora — tente de novo"
            : "sem conexão: entrar exige rede uma primeira vez";
      status.className = "status pend";
      botao.disabled = false;
      senha.focus();
    }
  });
}
