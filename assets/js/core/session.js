// Sessão com o Supabase Auth.
//
// Entrar exige duas coisas: email e palavra-passe certos, e uma linha ativa em
// public.colaboradores para essa conta. Uma conta sem essa linha é logo
// terminada, com a mensagem de que não tem acesso ao centro.
const Session = (() => {
  const CORES = [
    "linear-gradient(155deg, #1a86c8, #00609e)",
    "linear-gradient(155deg, #3d9fd6, #0b6aa6)",
    "linear-gradient(155deg, #2f6f9f, #163d60)",
    "linear-gradient(155deg, #4f86bd, #24578a)",
    "linear-gradient(155deg, #1495b0, #0a6582)",
  ];

  // Cor do avatar sempre igual para a mesma pessoa.
  function corDe(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CORES[h % CORES.length];
  }

  async function perfil(userId) {
    const { data, error } = await sb
      .from("colaboradores")
      .select("id, nome, cargo, email, cor, ativo")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.ativo) return null;
    return { ...data, cor: data.cor || corDe(data.id) };
  }

  // { user, auth } com sessão e acesso; null sem sessão ou sem acesso.
  // Um erro de rede é lançado, para não se confundir com "sem acesso".
  async function current() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) return null;
    const user = await perfil(session.user.id);
    return user ? { user, auth: session.user } : null;
  }

  // Devolve { user } ou { erro: "credenciais" | "por_confirmar" | "sem_acesso" | "limite" | "servico" }.
  async function signIn(email, password, remember) {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const code = error.code || "";
      if (code === "invalid_credentials") return { erro: "credenciais" };
      if (code === "email_not_confirmed") return { erro: "por_confirmar" };
      if (code.includes("rate_limit")) return { erro: "limite" };
      return { erro: "servico" };
    }
    try {
      const user = await perfil(data.user.id);
      if (user) return { user };
      await sb.auth.signOut();
      return { erro: "sem_acesso" };
    } catch {
      await sb.auth.signOut();
      return { erro: "servico" };
    }
  }

  async function signOut() {
    await sb.auth.signOut();
  }

  // Para as páginas da app: sem sessão (ou sem acesso), volta ao início de sessão.
  async function require() {
    try {
      const session = await current();
      if (!session) {
        location.replace("login.html");
        return null;
      }
      return session;
    } catch {
      UI.hideLoader();
      UI.toast("Sem ligação ao servidor. Verifique a internet e recarregue a página.", "alert");
      return null;
    }
  }

  // Envia a ligação para definir uma nova palavra-passe (volta a login.html).
  async function pedirRecuperacao(email) {
    const redirectTo = new URL("login.html", location.href).href;
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error && (error.code || "").includes("rate_limit")) return { erro: "limite" };
    // Por segurança a resposta é sempre a mesma, exista ou não a conta.
    return {};
  }

  async function definirPalavraPasse(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (!error) return {};
    if ((error.code || "") === "weak_password") return { erro: "fraca" };
    if ((error.code || "") === "same_password") return { erro: "igual" };
    return { erro: "servico" };
  }

  return { current, signIn, signOut, require, pedirRecuperacao, definirPalavraPasse, corDe };
})();
