// Chat lateral entre colaboradores, guardado na Supabase.
//
// Separador na margem direita que abre um painel com as conversas (o grupo
// "Equipa CAUAL" e as conversas diretas) e a conversa aberta. As mensagens
// novas chegam em tempo real; quem está online vem do canal de presença
// "equipa:presenca". As regras de acesso (RLS) garantem que cada pessoa só
// lê as conversas onde está.
const TeamChat = (() => {
  const PRESENCA = { online: "Online", offline: "Offline" };
  const MSG_FIELDS = "id, conversa_id, autor_id, texto, enviada_em";

  let me = null;
  let people = [];
  let conversas = [];
  let online = new Set();
  const presenceListeners = [];
  let root = null;
  let els = {};
  let openId = null;
  let loaded = false;

  const person = (id) => people.find((p) => p.id === id) || (id === me.id ? me : null);
  const conv = (id) => conversas.find((c) => c.id === id);
  const partnerOf = (c) => c.membros.find((id) => id !== me.id);
  const titleOf = (c) => (c.grupo ? c.nome : person(partnerOf(c))?.nome || "Conversa");
  const lastOf = (c) => c.mensagens[c.mensagens.length - 1];
  const presencaDe = (id) => (online.has(id) ? "online" : "offline");
  const unreadOf = (c) => c.mensagens.filter((m) => m.de !== me.id && (!c.leitura || new Date(m.data) > c.leitura)).length;
  const totalUnread = () => conversas.reduce((n, c) => n + unreadOf(c), 0);
  const firstName = (id) => (person(id)?.nome || "colega").split(" ")[0];

  function avatarOf(c, size = "") {
    if (c.grupo) return `<span class="avatar avatar--group ${size}" aria-hidden="true">${Icons.svg("users", "icon icon-sm")}</span>`;
    const p = person(partnerOf(c));
    if (!p) return `<span class="avatar ${size}" aria-hidden="true">?</span>`;
    return `<span class="avatar ${size}" style="--avatar-bg: ${p.cor}" data-presence="${presencaDe(p.id)}" aria-hidden="true">${UI.escape(UI.initials(p.nome))}</span>`;
  }

  // ---------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------

  function addMessage(row) {
    const c = conv(row.conversa_id);
    if (!c || c.mensagens.some((m) => m.id === row.id)) return false;
    c.mensagens.push({ id: row.id, de: row.autor_id, texto: row.texto, data: row.enviada_em });
    return true;
  }

  async function load() {
    const [convRes, msgRes] = await Promise.all([
      sb.from("conversas").select("id, grupo, nome, equipa, conversa_membros(colaborador_id, ultima_leitura)"),
      sb.from("mensagens").select(MSG_FIELDS).order("enviada_em", { ascending: false }).limit(500),
    ]);
    if (convRes.error) throw convRes.error;
    if (msgRes.error) throw msgRes.error;

    conversas = convRes.data
      .map((c) => {
        const mine = c.conversa_membros.find((m) => m.colaborador_id === me.id);
        return {
          id: c.id,
          grupo: c.grupo,
          nome: c.nome,
          equipa: c.equipa,
          membros: c.conversa_membros.map((m) => m.colaborador_id),
          leitura: mine ? new Date(mine.ultima_leitura) : null,
          mensagens: [],
        };
      })
      .filter((c) => c.membros.includes(me.id));
    msgRes.data.reverse().forEach(addMessage);
    loaded = true;
  }

  async function markRead(c) {
    c.leitura = new Date();
    updateBadge();
    const { error } = await sb
      .from("conversa_membros")
      .update({ ultima_leitura: c.leitura.toISOString() })
      .eq("conversa_id", c.id)
      .eq("colaborador_id", me.id);
    if (error) console.error("Falha ao marcar a conversa como lida", error);
  }

  async function findOrCreateDirect(personId) {
    const existing = conversas.find((c) => !c.grupo && c.membros.includes(personId));
    if (existing) return existing;

    const { data, error } = await sb.from("conversas").insert({ grupo: false }).select("id").single();
    if (error) throw error;
    const { error: membersError } = await sb.from("conversa_membros").insert([
      { conversa_id: data.id, colaborador_id: me.id },
      { conversa_id: data.id, colaborador_id: personId },
    ]);
    if (membersError) throw membersError;

    const c = { id: data.id, grupo: false, nome: null, equipa: false, membros: [me.id, personId], leitura: new Date(), mensagens: [] };
    conversas.push(c);
    return c;
  }

  // ---------------------------------------------------------------------
  // Estrutura
  // ---------------------------------------------------------------------

  function build() {
    root = document.createElement("div");
    root.className = "team-chat";
    root.innerHTML = `
      <button class="team-chat__tab" type="button" aria-expanded="false" aria-controls="team-chat-panel" aria-label="Abrir chat da equipa">
        ${Icons.svg("chat")}
        ${Icons.svg("chevronLeft", "icon icon-sm team-chat__tab-chevron")}
        <span class="team-chat__badge" hidden></span>
      </button>

      <aside class="team-chat__panel" id="team-chat-panel" aria-label="Chat da equipa" aria-hidden="true">
        <header class="team-chat__header">
          <button class="btn-icon btn-icon--bare btn-icon--back" type="button" data-chat-back aria-label="Voltar às conversas" hidden>
            ${Icons.svg("chevronLeft")}
          </button>
          <span data-chat-header-avatar></span>
          <div class="team-chat__heading">
            <p class="team-chat__title" data-chat-title>Chat da equipa</p>
            <p class="team-chat__subtitle" data-chat-subtitle></p>
          </div>
          <button class="btn-icon btn-icon--bare" type="button" data-chat-close aria-label="Fechar chat">
            ${Icons.svg("close", "icon icon-sm")}
          </button>
        </header>

        <div class="team-chat__view" data-chat-view="list">
          <div class="team-chat__search search">
            ${Icons.svg("search", "icon icon-sm")}
            <input class="input" type="search" placeholder="Pesquisar colega ou conversa" aria-label="Pesquisar colega ou conversa" data-chat-search />
          </div>
          <div class="team-chat__list" data-chat-list></div>
        </div>

        <div class="team-chat__view" data-chat-view="thread" hidden>
          <div class="team-chat__messages" data-chat-messages aria-live="polite"></div>
          <form class="team-chat__composer" data-chat-form>
            <textarea class="textarea" rows="1" maxlength="2000" placeholder="Escreva uma mensagem" aria-label="Mensagem" data-chat-input></textarea>
            <button class="btn-icon team-chat__send" type="submit" aria-label="Enviar mensagem" disabled>${Icons.svg("send", "icon icon-sm")}</button>
          </form>
        </div>
      </aside>`;
    document.body.append(root);

    els = {
      tab: root.querySelector(".team-chat__tab"),
      badge: root.querySelector(".team-chat__badge"),
      panel: root.querySelector(".team-chat__panel"),
      back: root.querySelector("[data-chat-back]"),
      headerAvatar: root.querySelector("[data-chat-header-avatar]"),
      title: root.querySelector("[data-chat-title]"),
      subtitle: root.querySelector("[data-chat-subtitle]"),
      listView: root.querySelector('[data-chat-view="list"]'),
      threadView: root.querySelector('[data-chat-view="thread"]'),
      search: root.querySelector("[data-chat-search]"),
      list: root.querySelector("[data-chat-list]"),
      messages: root.querySelector("[data-chat-messages]"),
      form: root.querySelector("[data-chat-form]"),
      input: root.querySelector("[data-chat-input]"),
      send: root.querySelector(".team-chat__send"),
    };
  }

  const empty = (icon, title, text) =>
    `<div class="empty"><span class="empty__icon">${Icons.svg(icon)}</span><p class="empty__title">${UI.escape(title)}</p>${text ? `<p>${UI.escape(text)}</p>` : ""}</div>`;

  // ---------------------------------------------------------------------
  // Lista de conversas
  // ---------------------------------------------------------------------

  function renderList() {
    if (!loaded) {
      els.list.innerHTML = empty("clock", "A carregar conversas…", "");
      return;
    }
    const q = els.search.value.trim().toLowerCase();
    const matches = (text) => !q || (text || "").toLowerCase().includes(q);
    const stamp = (c) => (lastOf(c) ? new Date(lastOf(c).data).getTime() : 0);

    const lista = conversas
      .filter((c) => c.grupo || c.mensagens.length)
      .sort((a, b) => stamp(b) - stamp(a))
      .filter((c) => matches(titleOf(c)) || matches(lastOf(c)?.texto));

    const comConversa = new Set(conversas.filter((c) => !c.grupo && c.mensagens.length).map(partnerOf));
    const outros = people
      .filter((p) => p.id !== me.id && !comConversa.has(p.id))
      .filter((p) => matches(p.nome) || matches(p.cargo))
      .sort((a, b) => (presencaDe(b.id) === "online") - (presencaDe(a.id) === "online") || a.nome.localeCompare(b.nome, "pt"));

    const rowConv = (c) => {
      const last = lastOf(c);
      const unread = unreadOf(c);
      const prefix = !last ? "" : last.de === me.id ? "Você: " : c.grupo ? `${firstName(last.de)}: ` : "";
      return `
        <button class="team-chat__conv${unread ? " is-unread" : ""}" type="button" data-open-conv="${c.id}">
          ${avatarOf(c)}
          <span class="team-chat__conv-body">
            <span class="team-chat__conv-top">
              <span class="team-chat__conv-name">${UI.escape(titleOf(c))}</span>
              <span class="team-chat__conv-time">${last ? Fmt.chatStamp(new Date(last.data)) : ""}</span>
            </span>
            <span class="team-chat__conv-bottom">
              <span class="team-chat__conv-last">${last ? UI.escape(prefix + last.texto) : "Sem mensagens"}</span>
              ${unread ? `<span class="team-chat__unread" aria-label="${unread} por ler">${unread}</span>` : ""}
            </span>
          </span>
        </button>`;
    };

    const rowPerson = (p) => `
      <button class="team-chat__conv" type="button" data-open-person="${p.id}">
        <span class="avatar" style="--avatar-bg: ${p.cor}" data-presence="${presencaDe(p.id)}" aria-hidden="true">${UI.escape(UI.initials(p.nome))}</span>
        <span class="team-chat__conv-body">
          <span class="team-chat__conv-top"><span class="team-chat__conv-name">${UI.escape(p.nome)}</span></span>
          <span class="team-chat__conv-bottom"><span class="team-chat__conv-last">${UI.escape(p.cargo)} · ${PRESENCA[presencaDe(p.id)]}</span></span>
        </span>
      </button>`;

    let html = "";
    if (lista.length) html += `<p class="team-chat__section">Conversas</p>${lista.map(rowConv).join("")}`;
    if (outros.length) html += `<p class="team-chat__section">Iniciar conversa</p>${outros.map(rowPerson).join("")}`;
    if (!html) {
      html = q
        ? empty("search", "Sem resultados", "Nenhum colega ou conversa corresponde à pesquisa.")
        : empty("users", "Ainda sem colegas no chat", "Quando a direção der acesso a mais pessoas, pode conversar com elas aqui.");
    }
    els.list.innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Conversa aberta
  // ---------------------------------------------------------------------

  function dayLabel(d) {
    const days = Fmt.daysBetween(d, new Date());
    if (days === 0) return "Hoje";
    if (days === 1) return "Ontem";
    return `${Fmt.weekdayShort(d)} ${Fmt.dayMonth(d)}`;
  }

  function renderMessages() {
    const c = conv(openId);
    if (!c) return;
    let html = "";
    let lastDay = "";
    c.mensagens.forEach((m, i) => {
      const d = new Date(m.data);
      const day = dayLabel(d);
      if (day !== lastDay) {
        html += `<p class="team-chat__day">${day}</p>`;
        lastDay = day;
      }
      const prev = c.mensagens[i - 1];
      const next = c.mensagens[i + 1];
      const mine = m.de === me.id;
      const same = prev && prev.de === m.de && d - new Date(prev.data) < 300000;
      const showTime = !next || next.de !== m.de || new Date(next.data) - d >= 300000;
      const author = c.grupo && !mine && !same ? `<span class="msg__author">${UI.escape(person(m.de)?.nome ?? "Colaborador")}</span>` : "";
      html += `
        <div class="msg${mine ? " msg--mine" : ""}${same ? " is-same" : ""}">
          ${author}
          <p class="msg__bubble">${UI.escape(m.texto)}</p>
          ${showTime ? `<span class="msg__time">${Fmt.time(d)}</span>` : ""}
        </div>`;
    });
    if (!c.mensagens.length) {
      html = empty("chat", "Ainda sem mensagens", c.grupo ? "Escreva a primeira mensagem para a equipa." : `Escreva a primeira mensagem para ${titleOf(c).split(" ")[0]}.`);
    }
    els.messages.innerHTML = html;
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function setHeaderForList() {
    els.back.hidden = true;
    els.headerAvatar.innerHTML = "";
    els.title.textContent = "Chat da equipa";
    const n = people.filter((p) => p.id !== me.id && online.has(p.id)).length;
    els.subtitle.textContent = Fmt.plural(n, "colega online", "colegas online");
  }

  function setHeaderForConversation(c) {
    els.back.hidden = false;
    els.headerAvatar.innerHTML = avatarOf(c, "avatar--sm");
    els.title.textContent = titleOf(c);
    const p = c.grupo ? null : person(partnerOf(c));
    els.subtitle.textContent = c.grupo
      ? Fmt.plural(c.membros.length, "participante", "participantes")
      : `${p?.cargo ?? ""} · ${PRESENCA[presencaDe(p?.id)]}`;
  }

  function showList() {
    openId = null;
    setHeaderForList();
    els.threadView.hidden = true;
    els.listView.hidden = false;
    renderList();
  }

  function openConversation(id) {
    const c = conv(id);
    if (!c) return;
    openId = id;
    setHeaderForConversation(c);
    els.listView.hidden = true;
    els.threadView.hidden = false;
    renderMessages();
    markRead(c);
    setTimeout(() => els.input.focus(), 80);
  }

  async function startWith(personId) {
    try {
      const c = await findOrCreateDirect(personId);
      openConversation(c.id);
    } catch (err) {
      console.error("Falha ao abrir a conversa", err);
      UI.toast("Não foi possível abrir a conversa. Tente de novo.", "alert");
    }
  }

  // ---------------------------------------------------------------------
  // Tempo real: mensagens novas e presença
  // ---------------------------------------------------------------------

  async function onNewMessage(row) {
    let added = addMessage(row);
    if (!added && !conv(row.conversa_id)) {
      // Conversa nova (alguém começou a falar comigo): volta a carregar.
      try {
        await load();
        added = true;
      } catch (err) {
        console.error("Falha ao carregar a conversa nova", err);
        return;
      }
    }
    if (!added) return;

    const c = conv(row.conversa_id);
    if (!c) return;
    const visible = openId === c.id && root.classList.contains("is-open") && !document.hidden;
    if (visible) {
      renderMessages();
      if (row.autor_id !== me.id) markRead(c);
      return;
    }
    updateBadge();
    if (!els.listView.hidden && root.classList.contains("is-open")) renderList();
    if (row.autor_id !== me.id) UI.toast(`Nova mensagem de ${firstName(row.autor_id)}`, "chat");
  }

  async function subscribe() {
    if (typeof sb.realtime.setAuth === "function") await sb.realtime.setAuth();

    sb.channel("chat:mensagens")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (payload) => onNewMessage(payload.new))
      .subscribe();

    const presence = sb.channel("equipa:presenca", { config: { private: true, presence: { key: me.id } } });
    presence
      .on("presence", { event: "sync" }, () => {
        online = new Set(Object.keys(presence.presenceState()));
        presenceListeners.forEach((cb) => cb(new Set(online)));
        if (!root.classList.contains("is-open")) return;
        if (openId) setHeaderForConversation(conv(openId));
        else {
          setHeaderForList();
          renderList();
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await presence.track({ nome: me.nome, desde: new Date().toISOString() });
      });
  }

  function updateBadge() {
    const n = totalUnread();
    els.badge.hidden = n === 0;
    els.badge.textContent = n > 9 ? "9+" : String(n);
    els.tab.setAttribute("aria-label", n ? `Abrir chat da equipa, ${n} mensagens por ler` : "Abrir chat da equipa");
  }

  // ---------------------------------------------------------------------
  // Abrir, fechar e enviar
  // ---------------------------------------------------------------------

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    els.tab.setAttribute("aria-expanded", String(open));
    els.panel.setAttribute("aria-hidden", String(!open));
    if (open) {
      if (!openId) showList();
      else {
        renderMessages();
        markRead(conv(openId));
      }
      setTimeout(() => (openId ? els.input : els.search).focus(), 120);
    } else {
      els.tab.focus();
    }
  }

  function bind() {
    els.tab.addEventListener("click", () => setOpen(true));
    root.querySelector("[data-chat-close]").addEventListener("click", () => setOpen(false));
    els.back.addEventListener("click", showList);
    els.search.addEventListener("input", renderList);

    els.list.addEventListener("click", (e) => {
      const c = e.target.closest("[data-open-conv]");
      if (c) return openConversation(c.dataset.openConv);
      const p = e.target.closest("[data-open-person]");
      if (p) startWith(p.dataset.openPerson);
    });

    const resize = () => {
      els.input.style.height = "auto";
      els.input.style.height = `${Math.min(els.input.scrollHeight, 120)}px`;
      els.send.disabled = !els.input.value.trim();
    };
    els.input.addEventListener("input", resize);
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        els.form.requestSubmit();
      }
    });

    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const texto = els.input.value.trim();
      const c = conv(openId);
      if (!texto || !c) return;
      els.send.disabled = true;
      els.input.value = "";
      resize();
      const { data, error } = await sb.from("mensagens").insert({ conversa_id: c.id, texto }).select(MSG_FIELDS).single();
      if (error) {
        console.error("Falha ao enviar a mensagem", error);
        els.input.value = texto;
        resize();
        UI.toast("A mensagem não foi enviada. Verifique a ligação e tente de novo.", "alert");
        return;
      }
      addMessage(data);
      renderMessages();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.classList.contains("is-open") && !document.querySelector(".modal.is-open")) setOpen(false);
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && openId && root.classList.contains("is-open")) markRead(conv(openId));
    });
  }

  // ---------------------------------------------------------------------

  function init(user, colaboradores = []) {
    if (root) return;
    me = user;
    people = colaboradores;
    build();
    bind();
    load()
      .then(() => {
        updateBadge();
        if (root.classList.contains("is-open") && !openId) renderList();
      })
      .catch((err) => {
        console.error("Falha ao carregar o chat", err);
        loaded = true;
        els.list.innerHTML = empty("alert", "Não foi possível carregar as conversas", "Verifique a ligação e recarregue a página.");
      });
    subscribe().catch((err) => console.error("Falha ao ligar o tempo real do chat", err));
  }

  // Abre o painel; com uma pessoa, abre (ou começa) a conversa com ela.
  async function open(personId) {
    if (!root) return;
    if (personId && personId !== me.id) {
      setOpen(true);
      await startWith(personId);
      return;
    }
    setOpen(true);
  }

  function onPresence(cb) {
    presenceListeners.push(cb);
    cb(new Set(online));
  }

  return { init, open, onPresence };
})();
