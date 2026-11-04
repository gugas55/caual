// Estrutura comum das páginas da app: barra lateral (marca, centro, menu com
// trilho, pessoa com sessão iniciada) e o botão do topo que a recolhe ou,
// até 1024 px, a abre como gaveta. Cada página chama Shell.init("id").
const Shell = (() => {
  const PREF_KEY = "caual.sidebar";
  const mobile = window.matchMedia("(max-width: 1024px)");

  const NAV = [
    {
      titulo: "Visão geral",
      itens: [
        { id: "painel", label: "Painel inicial", icon: "dashboard", href: "painel.html" },
        { id: "agenda", label: "Agenda", icon: "calendar" },
      ],
    },
    {
      titulo: "Processos",
      itens: [
        { id: "processos", label: "Todos os processos", icon: "folder" },
        { id: "arbitragem", label: "Arbitragem", icon: "scale" },
        { id: "mediacao", label: "Mediação", icon: "handshake" },
        { id: "prazos", label: "Prazos", icon: "hourglass" },
      ],
    },
    {
      titulo: "Centro",
      itens: [
        { id: "adesoes", label: "Pedidos de adesão", icon: "building" },
        { id: "pessoas", label: "Árbitros e mediadores", icon: "users" },
        { id: "documentos", label: "Documentos", icon: "file" },
        { id: "custas", label: "Custas e faturação", icon: "receipt" },
      ],
    },
    {
      titulo: "Gestão",
      itens: [
        { id: "relatorios", label: "Relatórios", icon: "chart" },
        { id: "definicoes", label: "Definições", icon: "settings" },
      ],
    },
  ];

  function navGroup(group, active) {
    const activeIndex = group.itens.findIndex((i) => i.id === active);
    const rows = group.itens.map((item, i) => {
      const rail = ["nav-rail"];
      if (activeIndex >= 0 && i <= activeIndex) rail.push("is-lit");
      if (i === activeIndex) rail.push("is-marker");
      if (i === group.itens.length - 1) rail.push("is-end");
      const isActive = item.id === active;
      const href = item.href || "#";
      return `
        <span class="${rail.join(" ")}" aria-hidden="true"><span class="nav-rail__end"></span></span>
        <a class="nav-item${isActive ? " is-active" : ""}" href="${href}" data-nav="${item.id}"${isActive ? ' aria-current="page"' : ""}${item.href ? "" : " data-soon"} data-label="${UI.escape(item.label)}">
          ${Icons.svg(item.icon)}
          <span class="nav-item__label">${UI.escape(item.label)}</span>
          <span class="nav-item__badge" data-nav-badge="${item.id}" hidden></span>
        </a>`;
    }).join("");

    return `
      <div class="nav-group">
        <p class="nav-group__title">${UI.escape(group.titulo)}</p>
        <div class="nav-group__items">${rows}</div>
      </div>`;
  }

  function render(sidebar, active, user) {
    sidebar.innerHTML = `
      <div class="sidebar__brand">
        <a class="sidebar__logo-link" href="painel.html" aria-label="Centro de Arbitragem da Universidade Autónoma de Lisboa, painel inicial">
          <img class="sidebar__logo" src="assets/img/logo-caual.png" width="212" height="54" alt="" />
          <img class="sidebar__symbol" src="assets/img/logo-caual-simbolo.png" width="42" height="42" alt="" />
        </a>
      </div>

      <div class="sidebar__context">
        <span class="sidebar__context-label">Centro</span>
        <span class="sidebar__context-value">CAUAL · Lisboa</span>
      </div>

      <nav class="sidebar__nav" aria-label="Navegação principal">
        ${NAV.map((g) => navGroup(g, active)).join("")}
      </nav>

      <div class="sidebar__footer">
        <span class="avatar" style="--avatar-bg: ${user.cor}" aria-hidden="true">${UI.escape(UI.initials(user.nome))}</span>
        <span class="sidebar__user">
          <span class="sidebar__user-name">${UI.escape(user.nome)}</span>
          <span class="sidebar__user-role">${UI.escape(user.cargo)}</span>
        </span>
        <button class="sidebar__logout" type="button" data-action="logout" aria-label="Terminar sessão" data-tip="Terminar sessão">
          ${Icons.svg("logout", "icon icon-sm")}
        </button>
      </div>`;
  }

  // A página pede a sessão (Session.require) e passa aqui a pessoa.
  function init(active, user) {
    const app = document.querySelector(".app");
    const sidebar = document.querySelector("[data-sidebar]");
    render(sidebar, active, user);

    const setTitles = () => {
      const collapsed = app.classList.contains("is-collapsed") && !mobile.matches;
      sidebar.querySelectorAll(".nav-item").forEach((a) => {
        if (collapsed) a.setAttribute("title", a.dataset.label);
        else a.removeAttribute("title");
      });
    };

    if (localStorage.getItem(PREF_KEY) === "collapsed") app.classList.add("is-collapsed");
    setTitles();

    document.querySelector('[data-action="toggle-sidebar"]')?.addEventListener("click", () => {
      if (mobile.matches) {
        app.classList.toggle("is-nav-open");
        return;
      }
      const collapsed = app.classList.toggle("is-collapsed");
      localStorage.setItem(PREF_KEY, collapsed ? "collapsed" : "expanded");
      setTitles();
    });

    document.querySelector(".nav-backdrop")?.addEventListener("click", () => app.classList.remove("is-nav-open"));
    mobile.addEventListener?.("change", () => { app.classList.remove("is-nav-open"); setTitles(); });

    sidebar.addEventListener("click", (e) => {
      const soon = e.target.closest("[data-soon]");
      if (soon) {
        e.preventDefault();
        UI.toast(`${soon.dataset.label}: esta área chega numa próxima fase.`, "clock");
        return;
      }
      const logout = e.target.closest('[data-action="logout"]');
      if (logout) {
        logout.disabled = true;
        Session.signOut().finally(() => location.replace("login.html"));
      }
    });
  }

  // Contador ao lado de uma entrada do menu (0 esconde).
  function setBadge(id, n) {
    const el = document.querySelector(`[data-nav-badge="${id}"]`);
    if (!el) return;
    el.hidden = !n;
    el.textContent = n > 99 ? "99+" : String(n);
    el.setAttribute("aria-label", `${n} novos`);
  }

  return { init, setBadge };
})();
