// Ligação à Supabase (projeto CAUAL, Frankfurt).
//
// A chave "publishable" é pública por natureza: o que protege os dados são as
// regras de acesso (RLS) da base de dados, que só deixam ler e escrever a quem
// tem sessão iniciada e está na tabela de colaboradores.
const SUPABASE_URL = "https://fcuuwdzoxtoybtoxfofo.supabase.co";
const SUPABASE_KEY = "sb_publishable_o0dfDOao5E_pnd5cHyIuzg_uZnGTzez";
const REMEMBER_KEY = "caual.lembrar";

// A ligação de recuperação da palavra-passe chega com "type=recovery" no
// endereço; regista-se antes de o cliente limpar o endereço.
const CAUAL_URL_AUTH = {
  recuperacao: location.hash.includes("type=recovery"),
  erro: new URLSearchParams(location.hash.slice(1)).get("error_code"),
};

// Com "manter sessão iniciada" a sessão fica em localStorage; sem, fica em
// sessionStorage e acaba ao fechar o separador.
const authStorage = {
  getItem: (k) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k, v) => {
    const keep = localStorage.getItem(REMEMBER_KEY) === "1";
    (keep ? localStorage : sessionStorage).setItem(k, v);
    (keep ? sessionStorage : localStorage).removeItem(k);
  },
  removeItem: (k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  },
};

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
