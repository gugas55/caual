// Início de sessão com o Supabase Auth: entrar, pedir a ligação para
// recuperar a palavra-passe e, ao voltar por essa ligação, definir a nova.
(async () => {
  Icons.render();
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const $ = (sel, root = document) => root.querySelector(sel);

  const form = $("[data-login-form]");
  const error = $("[data-login-error]", form);
  const submit = $("[data-login-submit]", form);
  const email = form.elements.email;
  const password = form.elements.password;

  const recovery = $("[data-recovery-form]");
  const recoveryError = $("[data-recovery-error]", recovery);

  const MENSAGENS = {
    credenciais: "Email ou palavra-passe incorretos. Confirme os dados e tente de novo.",
    por_confirmar: "Esta conta ainda não confirmou o email. Abra a mensagem de confirmação que recebeu.",
    sem_acesso: "Esta conta não tem acesso ao CAUAL. Peça à direção do centro para a ativar.",
    limite: "Demasiadas tentativas seguidas. Aguarde um minuto e tente de novo.",
    servico: "Não foi possível ligar ao servidor. Verifique a internet e tente de novo.",
  };

  const showError = (el, message, field) => {
    el.textContent = message;
    el.hidden = false;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
  };

  const busy = (button, loading, label, loadingLabel) => {
    button.disabled = loading;
    button.innerHTML = loading
      ? `<span class="btn__spinner" aria-hidden="true"></span><span>${loadingLabel}</span>`
      : `<span>${label}</span>`;
  };

  // ---------------------------------------------------------------------
  // Modo "definir nova palavra-passe" (ligação de recuperação)
  // ---------------------------------------------------------------------

  let emRecuperacao = false;

  function modoRecuperacao() {
    if (emRecuperacao) return;
    emRecuperacao = true;
    form.hidden = true;
    document.querySelectorAll("[data-login-extra]").forEach((el) => { el.hidden = true; });
    recovery.hidden = false;
    $(".auth__title").textContent = "Definir nova palavra-passe";
    $(".auth__subtitle").textContent = "Escolha a nova palavra-passe da sua conta.";
    setTimeout(() => recovery.elements.password.focus(), 80);
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") modoRecuperacao();
  });

  if (CAUAL_URL_AUTH.erro) {
    history.replaceState(null, "", location.pathname);
    showError(error, "A ligação para definir a palavra-passe expirou ou já foi usada. Peça uma nova em «Esqueceu-se da palavra-passe?».");
  } else if (CAUAL_URL_AUTH.recuperacao) {
    modoRecuperacao();
  } else {
    // Quem já tem sessão e acesso vai direto ao painel.
    try {
      if (await Session.current()) {
        location.replace("painel.html");
        return;
      }
    } catch { /* sem ligação: fica no formulário, que mostra o erro ao tentar entrar */ }
  }

  recovery.addEventListener("submit", async (e) => {
    e.preventDefault();
    recoveryError.hidden = true;
    const pw = recovery.elements.password;
    const confirm = recovery.elements.confirm;
    [pw, confirm].forEach((f) => f.removeAttribute("aria-invalid"));

    const forte = pw.value.length >= 10 && /[a-z]/.test(pw.value) && /[A-Z]/.test(pw.value) && /\d/.test(pw.value);
    if (!forte) return showError(recoveryError, "Use pelo menos 10 caracteres, com maiúsculas, minúsculas e algarismos.", pw);
    if (pw.value !== confirm.value) return showError(recoveryError, "As duas palavras-passe não são iguais.", confirm);

    const button = $("[data-recovery-submit]", recovery);
    busy(button, true, "Guardar e entrar", "A guardar…");
    const result = await Session.definirPalavraPasse(pw.value);
    if (result.erro) {
      busy(button, false, "Guardar e entrar");
      const msg = {
        fraca: "A palavra-passe é demasiado fraca. Escolha uma mais longa e menos previsível.",
        igual: "Escolha uma palavra-passe diferente da anterior.",
        servico: "Não foi possível guardar. A ligação pode ter expirado: peça uma nova e tente de novo.",
      }[result.erro];
      return showError(recoveryError, msg, pw);
    }

    history.replaceState(null, "", location.pathname);
    try {
      if (await Session.current()) {
        location.replace("painel.html");
        return;
      }
    } catch { /* trata-se abaixo */ }
    await Session.signOut();
    busy(button, false, "Guardar e entrar");
    showError(recoveryError, "Palavra-passe guardada, mas esta conta ainda não tem acesso ao CAUAL. Peça à direção do centro para a ativar.");
  });

  // ---------------------------------------------------------------------
  // Entrar
  // ---------------------------------------------------------------------

  const clearError = () => {
    error.hidden = true;
    email.removeAttribute("aria-invalid");
    password.removeAttribute("aria-invalid");
  };

  [email, password].forEach((input) => input.addEventListener("input", clearError));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    if (!EMAIL.test(email.value.trim())) return showError(error, "Insira um email válido.", email);
    if (!password.value) return showError(error, "Insira a sua palavra-passe.", password);

    busy(submit, true, "Entrar", "A entrar…");
    const result = await Session.signIn(email.value, password.value, form.elements.remember.checked);
    if (result.erro) {
      busy(submit, false, "Entrar");
      showError(error, MENSAGENS[result.erro], result.erro === "credenciais" ? password : null);
      if (result.erro === "credenciais") password.select();
      return;
    }

    submit.innerHTML = `${Icons.svg("check", "icon icon-sm")}<span>Bem-vindo(a), ${UI.escape(result.user.nome.split(" ")[0])}</span>`;
    setTimeout(() => location.assign("painel.html"), 350);
  });

  // ---------------------------------------------------------------------
  // Recuperar palavra-passe
  // ---------------------------------------------------------------------

  const forgot = $("[data-forgot-form]");
  const forgotError = $("[data-forgot-error]", forgot);
  const forgotSuccess = $("[data-forgot-success]", forgot);
  const forgotSubmit = $('[type="submit"]', forgot);

  $('[data-modal-open="modal-forgot"]').addEventListener("click", () => {
    forgot.reset();
    forgotError.hidden = true;
    forgotSuccess.hidden = true;
    busy(forgotSubmit, false, "Enviar ligação");
    if (EMAIL.test(email.value.trim())) forgot.elements.email.value = email.value.trim();
  });

  forgot.addEventListener("submit", async (e) => {
    e.preventDefault();
    forgotError.hidden = true;
    const value = forgot.elements.email.value.trim();
    if (!EMAIL.test(value)) return showError(forgotError, "Insira um email válido.", forgot.elements.email);

    busy(forgotSubmit, true, "Enviar ligação", "A enviar…");
    const result = await Session.pedirRecuperacao(value);
    if (result.erro) {
      busy(forgotSubmit, false, "Enviar ligação");
      return showError(forgotError, "Já pediu uma ligação há pouco. Aguarde um minuto e tente de novo.");
    }
    forgotSuccess.hidden = false;
    forgotSubmit.innerHTML = "<span>Ligação enviada</span>";
  });
})();
