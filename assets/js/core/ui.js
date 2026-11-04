// Formatação (pt-PT) e peças de interface partilhadas: ecrã de carregamento,
// popups, avisos flutuantes e pequenos utilitários de DOM.

const Fmt = (() => {
  const LOCALE = "pt-PT";
  const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const WEEKDAYS_SHORT = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
  const number = new Intl.NumberFormat(LOCALE);
  const euro = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const longDate = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const DAY = 86400000;

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  const pad = (n) => String(n).padStart(2, "0");

  return {
    DAY,
    startOfDay,
    daysBetween,
    int: (n) => number.format(n),
    euro: (n) => euro.format(n),
    pct: (ratio) => `${Math.round(ratio * 100)}%`,
    dayMonth: (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`,
    weekdayShort: (d) => WEEKDAYS_SHORT[d.getDay()],
    longDate: (d) => longDate.format(d),
    time: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    date: (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    // "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", "12 out."
    relative(d, now = new Date()) {
      const diff = now - d;
      if (diff < 60000) return "agora";
      if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
      const days = daysBetween(d, now);
      if (days === 0) return `há ${Math.floor(diff / 3600000)} h`;
      if (days === 1) return "ontem";
      if (days < 7) return `há ${days} dias`;
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    },
    // Hora para hoje, "ontem" ou dia e mês, como nas listas de conversas.
    chatStamp(d, now = new Date()) {
      const days = daysBetween(d, now);
      if (days === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (days === 1) return "ontem";
      if (days < 7) return WEEKDAYS_SHORT[d.getDay()];
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    },
    plural: (n, one, many) => `${number.format(n)} ${n === 1 ? one : many}`,
  };
})();

const UI = (() => {
  const escape = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const initials = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  // Ecrã de carregamento: sai quando a página está pronta.
  function hideLoader() {
    const loader = document.getElementById("page-loader");
    if (!loader) return;
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 450);
  }

  // Avisos flutuantes, em baixo ao centro.
  function toast(message, icon = "info") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.append(stack);
    }
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = Icons.svg(icon, "icon icon-sm");
    const text = document.createElement("span");
    text.textContent = message;
    item.append(text);
    stack.append(item);
    setTimeout(() => {
      item.classList.add("is-leaving");
      setTimeout(() => item.remove(), 220);
    }, 3200);
  }

  // Popups: [data-modal-open="id"] abre, [data-modal-close] fecha, Esc fecha.
  let lastFocus = null;

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    const first = modal.querySelector("input:not([type=hidden]):not([type=radio]), textarea, select, button:not([data-modal-close])");
    setTimeout(() => first?.focus(), 60);
  }

  function closeModal(modal) {
    if (typeof modal === "string") modal = document.getElementById(modal);
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    lastFocus?.focus?.();
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-modal-open]");
    if (opener) {
      e.preventDefault();
      openModal(opener.dataset.modalOpen);
      return;
    }
    if (e.target.closest("[data-modal-close]")) {
      closeModal(e.target.closest(".modal"));
      return;
    }
    if (e.target.classList?.contains("modal")) closeModal(e.target);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".modal.is-open");
    if (open) closeModal(open);
  });

  // Mostrar/esconder palavra-passe: [data-toggle-password] dentro de .input-wrap.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle-password]");
    if (!btn) return;
    const input = btn.closest(".input-wrap")?.querySelector("input");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Esconder palavra-passe" : "Mostrar palavra-passe");
    btn.setAttribute("aria-pressed", String(show));
    btn.innerHTML = Icons.svg(show ? "eyeOff" : "eye");
  });

  // Páginas com <body data-hold-loader> escondem o ecrã de carregamento
  // quando têm os dados (UI.hideLoader); as outras, quando acabam de carregar.
  const autoHide = () => {
    if (!document.body.hasAttribute("data-hold-loader")) setTimeout(hideLoader, 120);
  };
  if (document.readyState === "complete") autoHide();
  else window.addEventListener("load", autoHide);

  return { escape, initials, toast, openModal, closeModal, hideLoader };
})();
